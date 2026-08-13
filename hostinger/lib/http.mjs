// Helpers HTTP genéricos usados por todos os handlers do server.mjs (WhatsApp,
// Omie, VP Click, cron, admin) — extraídos para evitar import circular entre
// server.mjs e os módulos de domínio/integração em hostinger/lib/.

const SB_URL = "https://jkbklzlbhhfnamaeislb.supabase.co";
const SB_SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sbFetch(path, opts = {}) {
  const key = SB_SERVICE_KEY();
  return fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Prefer": "return=representation",
      ...(opts.headers || {}),
    },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Segredos via painel Passenger (env_present confirmado). Sem fallback hardcoded p/ não expor no git.
const WH_APIKEY = () => process.env.EVOLUTION_APIKEY || "";

// ─── Acesso ao ERP (bd_Omie) para consultas do atendente ──────────────────────
const ERP_URL = () => process.env.ERP_URL || "https://kgecbycsyrtdhmdziuul.supabase.co";
const ERP_KEY = () => process.env.ERP_SERVICE_KEY || ""; // no painel Passenger (env_present confirmado)
function erpFetch(path) {
  const k = ERP_KEY();
  return fetch(`${ERP_URL()}/rest/v1${path}`, {
    headers: { apikey: k, Authorization: `Bearer ${k}` },
    signal: AbortSignal.timeout(15_000),
  });
}
const _enc = (s) => encodeURIComponent(String(s ?? ""));
const _digits = (s) => String(s ?? "").replace(/\D/g, "");
function _mascaraDoc(s) {
  const d = _digits(s);
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
  return null;
}

export {
  SB_URL, SB_SERVICE_KEY, sbFetch, readBody,
  WH_APIKEY,
  ERP_URL, ERP_KEY, erpFetch,
  _enc, _digits, _mascaraDoc,
};
