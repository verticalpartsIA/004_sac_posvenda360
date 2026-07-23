import { useEffect, useState } from "react";
import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { startVersionCheck } from "@/lib/versionCheck";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página solicitada não existe ou você não tem acesso.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Ir para o painel
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Fazer login
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VP Pós-Venda 360° — VerticalParts" },
      {
        name: "description",
        content:
          "Plataforma de pós-venda 360° para autopeças com rastreabilidade total, causa raiz e NPS.",
      },
      { name: "theme-color", content: "#000000" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Tela de entrada: cobre o app por até 12s (ou até o vídeo da marca
// terminar, o que vier primeiro) a cada carregamento da página. O Outlet
// continua montado por baixo (só escondido) para a navegação/verificação de
// sessão resolver em segundo plano — quando a tela de entrada sai, o app já
// está no estado certo (login ou dashboard).
function EntryScreen({ onVideoDone }: { onVideoDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-500">
          Pós-Venda 360°
        </p>
        <video
          src="/boot-video.mp4"
          autoPlay
          muted
          playsInline
          onEnded={onVideoDone}
          onError={onVideoDone}
          className="mx-auto w-full max-w-sm rounded-xl shadow-lg shadow-slate-200"
        />
        <p
          className="mt-4 text-2xl font-light tracking-wide text-gold"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          posvenda360.vpsistema.com
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          <p className="text-xs text-slate-400">Carregando...</p>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  useEffect(() => startVersionCheck(), []);

  const [showEntry, setShowEntry] = useState(true);
  useEffect(() => {
    const fallback = setTimeout(() => setShowEntry(false), 12000);
    return () => clearTimeout(fallback);
  }, []);

  return (
    <AuthProvider>
      <StoreProvider>
        {showEntry && <EntryScreen onVideoDone={() => setShowEntry(false)} />}
        <div style={showEntry ? { display: "none" } : undefined}>
          <Outlet />
        </div>
        <Toaster richColors position="top-right" />
      </StoreProvider>
    </AuthProvider>
  );
}
