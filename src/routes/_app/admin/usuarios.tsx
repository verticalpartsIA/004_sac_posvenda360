import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BackToDashboard } from "@/components/app/BackToDashboard";
import { Plus, Shield, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Role = "operador" | "qualidade" | "gestor" | "admin";
const ROLE_LABEL: Record<Role, string> = {
  operador: "Operador",
  qualidade: "Qualidade",
  gestor: "Gestor",
  admin: "Administrador",
};
const ROLE_DESC: Record<Role, string> = {
  operador: "Cria e atende ocorrências, abre tickets internos.",
  qualidade: "Preenche FO-504, define causa raiz, fecha ocorrências.",
  gestor: "Acessa KPIs, relatórios e custo da não qualidade.",
  admin: "Gerencia usuários, configurações e integrações.",
};

type Usuario = {
  id: string;
  email: string;
  display_name: string;
  roles: Role[];
};

export const Route = createFileRoute("/_app/admin/usuarios")({ component: UsuariosPage });

function UsuariosPage() {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    const [rolesRes, profilesRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").order("user_id"),
      supabase.from("profiles").select("user_id, display_name, departamento"),
    ]);

    if (rolesRes.error) {
      setError("Não foi possível carregar papéis. Verifique suas permissões.");
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, { display_name: string | null; departamento: string | null }>();
    for (const p of profilesRes.data ?? []) {
      profileMap.set(p.user_id, { display_name: p.display_name, departamento: p.departamento });
    }

    const map = new Map<string, Usuario>();
    for (const row of rolesRes.data ?? []) {
      const uid = row.user_id;
      const profile = profileMap.get(uid);
      if (!map.has(uid)) {
        map.set(uid, {
          id: uid,
          email: uid,
          display_name: profile?.display_name ?? uid.slice(0, 8) + "...",
          roles: [],
        });
      }
      const r = row.role as Role;
      if (r && !map.get(uid)!.roles.includes(r)) {
        map.get(uid)!.roles.push(r);
      }
    }
    setUsers(Array.from(map.values()));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function toggleRole(userId: string, role: Role) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const hasRole = user.roles.includes(role);

    // Optimistic
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, roles: hasRole ? u.roles.filter((r) => r !== role) : [...u.roles, role] }
          : u,
      ),
    );

    if (hasRole) {
      const { error: err } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (err) { setError("Erro ao remover papel."); void load(); }
    } else {
      const { error: err } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (err) { setError("Erro ao adicionar papel."); void load(); }
    }
  }

  async function handleSave(email: string, role: Role) {
    setError(null);
    const r = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? "Erro ao convidar usuário.");
      return;
    }
    void load();
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <BackToDashboard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Usuários e permissões</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Carregando..." : `${users.length} usuário(s) · papéis gerenciados em tempo real`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Convidar usuário
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gold" />
              <span className="text-sm font-semibold">{ROLE_LABEL[r]}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{ROLE_DESC[r]}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Usuário</th>
              <th className="px-4 py-3 text-left">Papéis (alçadas)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin opacity-50" />
                  Carregando usuários...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nenhum usuário com papel atribuído. Convide usuários e atribua papéis.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.display_name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => {
                        const has = u.roles.includes(r);
                        return (
                          <button
                            key={r}
                            onClick={() => void toggleRole(u.id, r)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border transition-colors ${has ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border"}`}
                          >
                            {ROLE_LABEL[r]}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                    {u.id.slice(0, 8)}...
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <ConvidarUsuarioDialog
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ConvidarUsuarioDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (email: string, role: Role) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operador");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const valid = email.trim().includes("@");

  async function submit() {
    if (!valid) { setFieldError("Informe um e-mail válido."); return; }
    setBusy(true);
    setFieldError(null);
    await onSave(email.trim(), role);
    setBusy(false);
  }

  const inp = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <h2 className="text-lg font-semibold">Convidar usuário</h2>
        <p className="mt-1 text-xs text-muted-foreground">Um e-mail de convite será enviado pelo Supabase.</p>
        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail *</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
              className={inp}
              placeholder="usuario@empresa.com"
              autoFocus
            />
            {fieldError && (
              <p className="mt-1 text-xs text-destructive">{fieldError}</p>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Papel inicial</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inp}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            disabled={!valid || busy}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Convidar
          </button>
        </div>
      </div>
    </div>
  );
}
