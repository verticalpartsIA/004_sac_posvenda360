import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { trackEnter, trackExit } from "@/lib/trackActivity";

export type AppRole = "operador" | "qualidade" | "gestor" | "admin";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  recoverPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  hasRole: (r: AppRole) => boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

/**
 * Sessão atual do Supabase Auth. Usável fora da árvore React (ex.: guards de
 * rota em `beforeLoad`, que rodam antes do `AuthProvider` montar).
 */
export function getSession() {
  return supabase.auth.getSession();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  // `onAuthStateChange` já dispara uma vez imediatamente ao inscrever (evento
  // INITIAL_SESSION), além de futuras mudanças (SIGNED_IN, TOKEN_REFRESHED...).
  // Um `getSession()` separado buscando roles de novo duplicava a consulta a
  // `user_roles` — e como o Supabase pode emitir mais de um evento no boot,
  // a mesma sessão chegava a disparar 3 fetches idênticos (ver #109). A guarda
  // por `lastFetchedUserIdRef` evita refetch quando o usuário não mudou.
  const lastFetchedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const fetchRoles = (userId: string) => {
      if (lastFetchedUserIdRef.current === userId) return;
      lastFetchedUserIdRef.current = userId;
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .then(({ data }) => {
          setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
        });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRoles(s.user.id), 0);
      } else {
        lastFetchedUserIdRef.current = null;
        setRoles([]);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Rastro de acesso cross-sistema (timeline no portal vpsistema): dispara
  // "enter" uma única vez assim que a sessão autenticada resolver, e "exit"
  // ao sair da página. Ver src/lib/trackActivity.ts.
  const trackedEnterRef = useRef(false);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  useEffect(() => {
    if (loading) return;
    if (user && !trackedEnterRef.current) {
      trackedEnterRef.current = true;
      const email = user.email ?? "";
      const name = (user.user_metadata?.display_name as string | undefined) ?? email;
      trackEnter(email, name);
    } else if (!user) {
      // Permite rastrear um novo "enter" caso o usuário faça login de novo
      // nesta mesma aba após um logout.
      trackedEnterRef.current = false;
    }
  }, [user, loading]);

  useEffect(() => {
    function handlePageHide() {
      const u = userRef.current;
      if (!u) return;
      const email = u.email ?? "";
      const name = (u.user_metadata?.display_name as string | undefined) ?? email;
      trackExit(email, name);
    }
    // pagehide é preferível a beforeunload por ser compatível com o bfcache
    // (não desabilita o cache de navegação para trás/frente).
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { error: null };
    const AUTH_ERRORS: Record<string, string> = {
      "Invalid login credentials": "E-mail ou senha incorretos.",
      "Email not confirmed": "E-mail não confirmado. Verifique sua caixa de entrada.",
      "User not found": "Usuário não encontrado.",
      "Too many requests": "Muitas tentativas. Aguarde alguns minutos.",
      "Email rate limit exceeded": "Limite de tentativas excedido. Tente novamente mais tarde.",
    };
    return { error: AUTH_ERRORS[error.message] ?? "Erro ao fazer login. Tente novamente." };
  };
  const signUp: AuthCtx["signUp"] = async (email, password, displayName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { display_name: displayName ?? email },
      },
    });
    return { error: error?.message ?? null };
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  const recoverPassword: AuthCtx["recoverPassword"] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };
  const updatePassword: AuthCtx["updatePassword"] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };
  const hasRole = (r: AppRole) => roles.includes(r);

  return (
    <Ctx.Provider
      value={{
        session,
        user,
        roles,
        loading,
        signIn,
        signUp,
        signOut,
        recoverPassword,
        updatePassword,
        hasRole,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
