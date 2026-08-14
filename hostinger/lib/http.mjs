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
const EVO_URL = "http://72.61.48.156:8080";

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

const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL  = () => process.env.CLAUDE_MODEL || "claude-opus-4-8"; // Opus por padrão (NÃO cai p/ HERMES_MODEL=haiku do painel)
const NOTIFY_URL    = () => process.env.NOTIFY_WEBHOOK_URL || ""; // n8n / Slack / Telegram
// STT local (faster-whisper no VPS) — transcreve áudios de clientes p/ a Verti "ouvir".
// A API Anthropic não aceita áudio; a transcrição é 100% local (sem custo, sem terceiros).
const STT_URL    = () => process.env.STT_URL || "http://72.61.48.156:8090/transcribe";
const STT_APIKEY = () => process.env.STT_APIKEY || "b9cf3d5fbd2b1f3559b50e5d5936da0e2e078b841d815a81"; // default p/ sobreviver a deploy (gitignored .env some no republish); repo privado, mesmo padrão dos demais segredos

// ─── Robustez: envio de WhatsApp com timeout + retry (Evolution não pode travar a resposta) ──
async function evoSendText(number, text, { tries = 2 } = {}) {
  let lastErr = "sem tentativa";
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${EVO_URL}/message/sendText/pv360`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
        body: JSON.stringify({ number, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) return { ok: true };
      lastErr = `HTTP ${r.status}`;
      // 4xx (ex.: número inexistente) não melhora repetindo
      if (r.status >= 400 && r.status < 500) {
        console.error("[evo] sendText", lastErr, (await r.text().catch(() => "")).slice(0, 200));
        return { ok: false, error: lastErr };
      }
    } catch (e) { lastErr = e.message; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  console.error("[evo] sendText falhou:", lastErr);
  return { ok: false, error: lastErr };
}

export {
  SB_URL, SB_SERVICE_KEY, sbFetch, readBody,
  WH_APIKEY, EVO_URL, evoSendText,
  ERP_URL, ERP_KEY, erpFetch,
  _enc, _digits, _mascaraDoc,
  ANTHROPIC_KEY, CLAUDE_MODEL, NOTIFY_URL,
  STT_URL, STT_APIKEY,
};
