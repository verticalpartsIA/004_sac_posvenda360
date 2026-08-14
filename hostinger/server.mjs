import http from "node:http";
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { execSync } from "node:child_process";
import {
  SB_URL, SB_SERVICE_KEY, sbFetch, readBody, WH_APIKEY,
  ANTHROPIC_KEY, CLAUDE_MODEL, NOTIFY_URL, STT_URL, STT_APIKEY,
} from "./lib/http.mjs";
import { handleVpClickConcluir, handleExpedicaoDivergencia } from "./lib/integrations/vpclick.mjs";
import {
  handleOmieWebhook,
  handleSacOmieObs,
  handleSyncFaturamento,
  handleSacOmieAnexo,
  handleSacBackfill,
} from "./lib/integrations/omie.mjs";
import { handleCronHandoffs, handleSacEnviarPesquisa } from "./lib/cron/index.mjs";
import {
  handleWhatsappWebhook,
  handleWhatsappStart,
  handleWhatsappSend,
  handleLidAgendaGet,
  handleLidAgendaUpsert,
  handleLidAgendaDelete,
} from "./lib/whatsapp/index.mjs";

// ─── Carrega um .env local (nodejs/.env), SEM sobrescrever o que o painel já injeta ──
// O Passenger/hPanel injeta os segredos (ANTHROPIC_API_KEY etc.) no process.env. Este
// loader só PREENCHE chaves ausentes (ex.: CLAUDE_MODEL, STT_APIKEY) a partir de um
// arquivo gerenciável por SSH e que sobrevive aos deploys (.env é gitignored).
(() => {
  try {
    const envPath = fileURLToPath(new URL("../.env", import.meta.url)); // nodejs/.env
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || (m[1] in process.env)) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch (e) { console.error("[env] falha ao carregar .env local:", e.message); }
})();

// ─── Config pública entregue ao cliente em runtime ────────────────────────────
// Só valores que já são públicos por natureza (URL do projeto + chave anon, que
// o Supabase publica no navegador de qualquer forma). Nada de service_role aqui.
// Ver o bloco de injeção no handler SSR lá embaixo para o porquê.
function publicEnvScript() {
  const cfg = {
    SUPABASE_URL:
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || SB_URL,
    SUPABASE_PUBLISHABLE_KEY:
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  };
  // `</script>` dentro do JSON encerraria a tag; escapar `<` evita isso.
  const json = JSON.stringify(cfg).replace(/</g, "\\u003c");
  return `<script>window.__PUBLIC_ENV__=${json}</script>`;
}



// Carrega .env — busca em múltiplos locais, do mais específico ao mais geral.
// O Hostinger limpa a pasta nodejs/ a cada redeploy, então o .env persistente
// deve ficar na pasta HOME (/home/u969661049/) ou no pai da pasta do app.
try {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const __envPaths = [
    fileURLToPath(new URL(".env", import.meta.url)), // mesmo dir do server.mjs
    join(process.cwd(), ".env"),                      // raiz do app (nodejs/)
    join(process.cwd(), "..", ".env"),                // pasta pai (HOME/)
    homeDir ? join(homeDir, ".env") : null,           // $HOME/.env
    homeDir ? join(homeDir, "posvenda360.env") : null,// $HOME/posvenda360.env
  ].filter(Boolean);
  for (const p of __envPaths) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      console.log(`[env] Carregado: ${p}`);
      break;
    }
  }
} catch (e) {
  console.warn("[env] Falha ao carregar .env (continuando sem ele):", e.message);
}

import app from "../dist/server/server.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const clientDir = join(__dirname, "../dist/client");
const repoDir = join(__dirname, "..");

// ─── /version.json (aviso de atualização — ver src/lib/versionCheck.ts) ────
// Deploy real é "git pull" + "npm run build" via SSH (ver
// .github/workflows/deploy-hostinger.yml) — não há garantia de que um passo
// de build gere version.json de forma confiável (lição de outro projeto
// VerticalParts: um workflow redundante nunca rodava de verdade e o arquivo
// nunca existia em produção). Em vez disso, lê o HEAD do git direto do
// repositório (que o deploy mantém atualizado) a cada request, com cache
// curto pra não rodar `git` a cada carregamento de página.
const VERSION_CACHE_MS = 30 * 1000;
let versionCache = null;
let versionCacheAt = 0;
function readVersionInfo() {
  const now = Date.now();
  if (versionCache && now - versionCacheAt < VERSION_CACHE_MS) return versionCache;
  try {
    const buildTime = execSync("git log -1 --format=%cI", { cwd: repoDir }).toString().trim();
    const commit = execSync("git rev-parse HEAD", { cwd: repoDir }).toString().trim();
    versionCache = { buildTime, commit };
  } catch (e) {
    if (!versionCache) versionCache = { buildTime: new Date().toISOString(), commit: "unknown" };
    console.warn("[version] não foi possível ler o git — usando fallback:", e.message);
  }
  versionCacheAt = now;
  return versionCache;
}

const MIME_TYPES = {
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".eot":  "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".map":  "application/json",
};

function toHeaders(nodeHeaders) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return headers;
}

function toBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  return Readable.toWeb(req);
}


// GET/POST /api/sac/pesquisa — resolve e responde o token de /nps/form/$token
// contra sac_pesquisas (a pesquisa real, disparada por WhatsApp após entrega,
// vinculada a uma NF). Espelha src/routes/api/sac/pesquisa.ts (usado no build
// Lovable) — este servidor Node não despacha pras API routes do TanStack
// Start, então cada endpoint precisa da sua implementação aqui também (mesmo
// padrão de todos os outros /api/sac/* deste arquivo).
async function handleSacPesquisa(req, res) {
  const json = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(obj));
  };

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.end();
  }

  if (req.method === "GET") {
    const token = new URL(req.url || "/", "http://localhost").searchParams.get("token")?.trim();
    if (!token) return json(400, { error: "token obrigatório" });

    const rows = await sbFetch(
      `/rest/v1/sac_pesquisas?token=eq.${encodeURIComponent(token)}&select=respondida_em,sac_notas_fiscais(nf_numero,razao_social_cliente)&limit=1`,
      { method: "GET" },
    ).then((r) => r.json()).catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json(200, { found: false });

    const nf = Array.isArray(row.sac_notas_fiscais) ? row.sac_notas_fiscais[0] : row.sac_notas_fiscais;
    return json(200, {
      found: true,
      jaRespondida: row.respondida_em !== null,
      nfNumero: nf?.nf_numero ?? null,
      clienteNome: nf?.razao_social_cliente ?? null,
    });
  }

  if (req.method === "POST") {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return json(400, { error: "Invalid JSON" }); }

    const token = body?.token?.trim();
    const npsScore = body?.npsScore;
    if (!token || typeof npsScore !== "number" || npsScore < 0 || npsScore > 10 || !Number.isInteger(npsScore)) {
      return json(422, { error: "token e npsScore (0-10) são obrigatórios" });
    }

    // PATCH com respondida_em=is.null: só atualiza se ainda não respondida —
    // impede reenvio/duplo submit sobrescrever a resposta original. Nenhuma
    // linha afetada ⇒ token inválido ou já respondido.
    const upd = await sbFetch(
      `/rest/v1/sac_pesquisas?token=eq.${encodeURIComponent(token)}&respondida_em=is.null`,
      {
        method: "PATCH",
        body: JSON.stringify({
          nps_score: npsScore,
          observacoes: body.observacoes?.trim() || null,
          respondida_em: new Date().toISOString(),
        }),
      },
    );
    const updRows = await upd.json().catch(() => []);
    if (!Array.isArray(updRows) || !updRows.length) {
      return json(409, { ok: false, reason: "invalido_ou_ja_respondida" });
    }
    return json(200, { ok: true });
  }

  return json(405, { error: "Method Not Allowed" });
}

// ─── Admin — Convidar usuário ─────────────────────────────────────────────────
// POST /api/admin/invite-user
// Body: { "email": "...", "role": "operador|qualidade|gestor|admin" }
// Convida via Supabase Auth Admin. Se usuário já existe (SSO), apenas atribui o papel.

async function handleAdminInviteUser(req, res) {
  const json = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  let email, role;
  try {
    const body = JSON.parse(await readBody(req));
    email = (body.email ?? "").trim().toLowerCase();
    role  = body.role ?? "operador";
  } catch { return json(400, { error: "Corpo inválido." }); }

  if (!email || !email.includes("@")) return json(400, { error: "E-mail inválido." });
  const VALID = ["operador", "qualidade", "gestor", "admin"];
  if (!VALID.includes(role)) return json(400, { error: "Papel inválido." });

  // 1. Tenta convidar via Supabase Auth Admin
  const inviteRes = await fetch(`${SB_URL}/auth/v1/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SB_SERVICE_KEY(),
      "Authorization": `Bearer ${SB_SERVICE_KEY()}`,
    },
    body: JSON.stringify({
      email,
      redirect_to: "https://posvenda360.vpsistema.com/dashboard",
    }),
  });

  let userId = null;

  if (inviteRes.ok) {
    const data = await inviteRes.json().catch(() => ({}));
    userId = data.id ?? null;
  } else {
    // Usuário já existe (ex.: veio do SSO do VPSistema) — busca o ID via RPC
    const rpcRes = await sbFetch("/rest/v1/rpc/get_user_id_by_email", {
      method: "POST",
      body: JSON.stringify({ email_input: email }),
    });
    if (rpcRes.ok) {
      const uid = await rpcRes.json().catch(() => null);
      userId = uid ?? null;
    }
  }

  if (!userId) return json(422, { error: "Não foi possível convidar o usuário. Verifique o e-mail ou tente novamente." });

  // 2. Adiciona o papel (ON CONFLICT ignora se já existir)
  await sbFetch("/rest/v1/user_roles", {
    method: "POST",
    headers: { "Prefer": "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, role }),
  });

  console.log(`[invite-user] ✓ ${email} → ${role} (${userId})`);
  return json(200, { ok: true, user_id: userId });
}


const server = http.createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url || "/", "http://localhost").pathname;

    // ── API routes interceptadas antes do TanStack ──
    if (urlPath === "/api/whatsapp/cron-handoffs") { await handleCronHandoffs(req, res); return; }
    if (urlPath === "/api/whatsapp/status") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const claudeKey = ANTHROPIC_KEY();
      const notifyUrl = NOTIFY_URL();
      res.end(JSON.stringify({
        deploy_version: "verti-2.9-segredos-painel",
        claude_key_set: claudeKey.length > 0,
        claude_key_prefix: claudeKey ? claudeKey.slice(0, 12) + "..." : null,
        claude_model: CLAUDE_MODEL(),
        auto_reply_ativo: (process.env.CLAUDE_AUTO_REPLY || process.env.HERMES_AUTO_REPLY || "").toLowerCase() === "true",
        stt_url_set: STT_URL().length > 0,
        stt_apikey_set: STT_APIKEY().length > 0,
        notify_url_set: notifyUrl.length > 0,
        evolution_apikey: WH_APIKEY().slice(0, 4) + "...",
        env_file_loaded: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        // Diagnóstico de segredos: quais chaves vêm do PAINEL (process.env) — sem expor valores.
        // Se true, o fallback hardcoded no código é redundante e pode ser removido com segurança.
        env_present: {
          ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          ERP_SERVICE_KEY: !!process.env.ERP_SERVICE_KEY,
          STT_APIKEY: !!process.env.STT_APIKEY,
          EVOLUTION_APIKEY: !!process.env.EVOLUTION_APIKEY,
          CLAUDE_MODEL: !!process.env.CLAUDE_MODEL,
        },
        ts: new Date().toISOString(),
      }));
      return;
    }
    // ── Teste direto: chama Claude e retorna resposta (diagnóstico) ──────────
    if (urlPath === "/api/whatsapp/test-claude") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const apiKey = ANTHROPIC_KEY();
      if (!apiKey) {
        res.end(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY não definida" }));
        return;
      }
      try {
        const t0 = Date.now();
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL(),
            max_tokens: 50,
            messages: [{ role: "user", content: "Responda só: OK" }],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const elapsed = Date.now() - t0;
        if (r.ok) {
          const data = await r.json();
          res.end(JSON.stringify({ ok: true, reply: data.content?.[0]?.text, elapsed_ms: elapsed }));
        } else {
          const err = await r.text();
          res.end(JSON.stringify({ ok: false, http_status: r.status, error: err, elapsed_ms: elapsed }));
        }
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }
    if (urlPath === "/api/whatsapp/webhook") {
      await handleWhatsappWebhook(req, res);
      return;
    }
    if (urlPath === "/api/whatsapp/send") {
      await handleWhatsappSend(req, res);
      return;
    }
    if (urlPath === "/api/whatsapp/start") {
      await handleWhatsappStart(req, res);
      return;
    }
    if (urlPath === "/api/whatsapp/lid-agenda") {
      if (req.method === "GET")    { await handleLidAgendaGet(req, res);    return; }
      if (req.method === "POST")   { await handleLidAgendaUpsert(req, res); return; }
      if (req.method === "DELETE") { await handleLidAgendaDelete(req, res); return; }
      res.statusCode = 405; res.end("Method Not Allowed"); return;
    }
    if (urlPath === "/api/webhooks/omie") {
      await handleOmieWebhook(req, res);
      return;
    }
    if (urlPath === "/api/sac/pesquisa") {
      await handleSacPesquisa(req, res);
      return;
    }
    if (urlPath === "/api/sac/enviar-pesquisa") {
      await handleSacEnviarPesquisa(req, res);
      return;
    }
    if (urlPath === "/api/sac/omie-obs") {
      await handleSacOmieObs(req, res);
      return;
    }
    if (urlPath === "/api/sac/vpclick-concluir") {
      await handleVpClickConcluir(req, res);
      return;
    }
    if (urlPath === "/api/sac/expedicao-divergencia") {
      await handleExpedicaoDivergencia(req, res);
      return;
    }
    if (urlPath === "/api/sac/sync-faturamento") {
      await handleSyncFaturamento(req, res);
      return;
    }
    if (urlPath === "/api/sac/omie-anexo") {
      await handleSacOmieAnexo(req, res);
      return;
    }
    if (urlPath === "/api/sac/backfill") {
      await handleSacBackfill(req, res);
      return;
    }
    if (urlPath === "/api/admin/invite-user") {
      await handleAdminInviteUser(req, res);
      return;
    }
    if (urlPath === "/version.json") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.end(JSON.stringify(readVersionInfo()));
      return;
    }

    const filePath = join(clientDir, urlPath);

    // Serve static files from dist/client/
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.statusCode = 200;
      createReadStream(filePath).pipe(res);
      return;
    }

    const origin = `http://${req.headers.host || `localhost:${port}`}`;
    const request = new Request(new URL(req.url || "/", origin), {
      method: req.method,
      headers: toHeaders(req.headers),
      body: toBody(req),
      duplex: "half",
    });

    const response = await app.fetch(request);
    const setCookie =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];

    res.statusCode = response.status;

    if (setCookie.length > 0) {
      res.setHeader("set-cookie", setCookie);
    }

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        return;
      }

      res.setHeader(key, value);
    });

    // Security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");

    // As páginas SSR (TanStack Start) mudam a cada deploy — os nomes dos
    // arquivos JS/CSS referenciados no HTML têm hash novo a cada build.
    // Sem isso, o CDN da Hostinger (hcdn) guarda essa resposta em cache e
    // continua servindo o HTML antigo (com hash antigo) por muito tempo
    // depois de um deploy novo, mesmo com o servidor já atualizado — foi
    // exatamente o que aconteceu com a tela de entrada: o servidor já
    // tinha o código novo, mas quem acessava ainda recebia o HTML/JS de
    // antes do deploy, cacheados no CDN. Os assets com hash (servidos mais
    // acima, fora deste bloco) continuam com cache longo — só o documento
    // HTML em si nunca deve ser cacheado.
    res.setHeader("Cache-Control", "no-store");

    if (!response.body) {
      res.end();
      return;
    }

    // As chaves públicas do Supabase (URL + anon) são lidas pelo cliente via
    // import.meta.env, que o Vite resolve em tempo de BUILD. O painel da
    // Hostinger só injeta as variáveis no runtime do Node, então o bundle
    // nascia com `process.env` vazio e o app quebrava com "Missing Supabase
    // environment variable(s)". Aqui o servidor — que tem as variáveis em
    // runtime — publica os valores no HTML, e o cliente lê deles como
    // fallback. Assim o app não depende mais do ambiente de build.
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html") && !response.headers.get("content-encoding")) {
      const html = await response.text();
      const injected = html.replace(/<head(\s[^>]*)?>/i, (head) => head + publicEnvScript());
      const buf = Buffer.from(injected, "utf8");
      res.setHeader("Content-Length", String(buf.byteLength));
      res.end(buf);
      return;
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("Hostinger bootstrap failed", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`Resolve 360 listening on http://${host}:${port}`);
});
