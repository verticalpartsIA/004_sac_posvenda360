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

export { SB_URL, SB_SERVICE_KEY, sbFetch, readBody };
