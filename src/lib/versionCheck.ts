import { useEffect, useState } from "react";
import { toast } from "sonner";

// Deploy sobrescreve os arquivos direto no servidor (git pull + build via SSH,
// ver .github/workflows/deploy-hostinger.yml) — uma aba deixada aberta pode
// continuar rodando o bundle antigo por horas depois de uma atualização. Este
// módulo verifica periodicamente /version.json (servido ao vivo por
// hostinger/server.mjs, a partir do HEAD do git) e avisa quando uma versão
// mais nova foi publicada, sem forçar reload.
//
// Diferente de outros projetos VerticalParts, aqui NÃO embutimos um
// __APP_BUILD_TIME__ no bundle via `define` do Vite — este projeto proíbe
// editar vite.config.ts (é compartilhado com o build do Lovable). Em vez
// disso, a própria aba busca version.json uma vez ao carregar e usa esse
// valor como "minha versão" — funciona igual, sem tocar no build.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const NOTIFIED_BUILD_KEY = "vp_version_notified_build";

interface VersionInfo {
  buildTime: string;
  commit: string;
}

function alreadyNotified(buildTime: string): boolean {
  try {
    return localStorage.getItem(NOTIFIED_BUILD_KEY) === buildTime;
  } catch {
    return false;
  }
}

function markNotified(buildTime: string): void {
  try {
    localStorage.setItem(NOTIFIED_BUILD_KEY, buildTime);
  } catch {
    // localStorage indisponível (modo privado etc.) — sem persistência,
    // mas a checagem desta aba continua funcionando normalmente.
  }
}

function formatUpdateMessage(buildTime: string): string {
  const d = new Date(buildTime);
  if (isNaN(d.getTime())) return "Este site foi atualizado.";
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Este site foi atualizado em ${date} às ${time}h`;
}

// Usado pelo rodapé da Sidebar (ver useAppVersion abaixo) pra mostrar
// "Última atualização: DD/MM/AA HH:MMh".
export function formatBuildTimeShort(buildTime: string): string | null {
  const d = new Date(buildTime);
  if (isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}h`;
}

function fetchVersion(): Promise<VersionInfo | null> {
  return fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
}

// Baseline desta aba: a versão publicada no momento em que a aba abriu.
// Compartilhado entre startVersionCheck() e useAppVersion() pra não fazer
// dois fetches redundantes na carga da página.
let runningBuildTime: string | null = null;
const baselineListeners = new Set<(buildTime: string) => void>();

export function startVersionCheck(): () => void {
  let notified = false;

  fetchVersion().then((info) => {
    if (!info?.buildTime) return;
    runningBuildTime = info.buildTime;
    baselineListeners.forEach((cb) => cb(info.buildTime));
    baselineListeners.clear();
  });

  const check = async () => {
    if (notified || runningBuildTime === null) return;
    const info = await fetchVersion();
    if (!info?.buildTime) return;
    if (info.buildTime !== runningBuildTime) {
      if (alreadyNotified(info.buildTime)) {
        notified = true;
        return;
      }
      notified = true;
      markNotified(info.buildTime);
      toast.message(formatUpdateMessage(info.buildTime), {
        description: "Atualize a página para usar a versão mais recente.",
        duration: Infinity,
        action: { label: "Atualizar agora", onClick: () => window.location.reload() },
      });
    }
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") check();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", check);

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", check);
  };
}

// Hook pro rodapé da Sidebar: devolve o buildTime desta aba assim que
// conhecido (null enquanto o fetch inicial não responde).
export function useAppVersion(): string | null {
  const [buildTime, setBuildTime] = useState<string | null>(runningBuildTime);
  useEffect(() => {
    if (runningBuildTime) {
      setBuildTime(runningBuildTime);
      return;
    }
    baselineListeners.add(setBuildTime);
    return () => {
      baselineListeners.delete(setBuildTime);
    };
  }, []);
  return buildTime;
}
