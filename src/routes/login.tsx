import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, getSession } from "@/lib/auth";
import { Logo } from "@/components/app/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    // SSR: localStorage not available — skip redirect check
    if (typeof window === "undefined") return;
    const { data } = await getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setAuthError(error);
      toast.error(error);
      return;
    }
    toast.success("Bem-vindo!");
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthShell title="Entrar" subtitle="Acesse sua conta vpposvenda360">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="E-mail" type="email" value={email} onChange={(v) => { setEmail(v); setAuthError(null); }} required autoFocus />
        <Field label="Senha" type="password" value={password} onChange={(v) => { setPassword(v); setAuthError(null); }} required />
        {authError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {authError}
          </p>
        )}
        <button disabled={loading} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <Link to="/recover-password" className="hover:text-gold">Esqueci minha senha</Link>
        <Link to="/register" className="hover:text-gold">Criar conta</Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-black lg:flex lg:flex-col lg:justify-between lg:p-10">
        <img
          src="https://sfpnjwllcmentoocylow.supabase.co/storage/v1/object/public/avatars/avatars/CINZA%20E%20AMARELO.png"
          alt="VerticalParts"
          className="h-14 w-auto object-contain"
        />
        <div className="text-white">
          <h2 className="text-3xl font-semibold leading-tight">Pós-venda 360°<br /><span className="text-gold">com rastreabilidade total.</span></h2>
          <p className="mt-3 max-w-sm text-sm text-white/60">FO-OEA-Q-502, NPS, SLA e causa raiz em uma única plataforma para a equipe VerticalParts.</p>
        </div>
        <p className="text-xs text-white/40">© VerticalParts</p>
      </div>
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6">
            <img
              src="https://sfpnjwllcmentoocylow.supabase.co/storage/v1/object/public/avatars/avatars/CINZA%20E%20AMARELO.png"
              alt="VerticalParts"
              className="h-12 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Field(props: { label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean; autoFocus?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
