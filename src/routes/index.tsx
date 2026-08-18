import { createFileRoute, redirect } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Pula a checagem no SSR (mesmo padrão de _app.tsx/login.tsx): um magic
    // link do vpsistema chega aqui como #access_token=... no hash da URL, que
    // o navegador nunca envia ao servidor. Decidir o redirect no SSR (como
    // antes) mandava pro /login sem o cliente sequer ter processado o token —
    // só decide no cliente, onde getSession() já espera o Supabase terminar
    // de ler a URL primeiro.
    if (typeof window === "undefined") return;
    const { data } = await getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/login" });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});
