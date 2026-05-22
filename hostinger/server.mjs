import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

// ─── WhatsApp Webhook (Evolution API → Supabase) ──────────────────────────────
// Handler nativo Node.js — independente do TanStack Router.
// URL: POST /api/whatsapp/webhook

const WH_APIKEY       = () => process.env.EVOLUTION_APIKEY || "suporte123";
const SB_URL          = "https://jkbklzlbhhfnamaeislb.supabase.co";
const SB_SERVICE_KEY  = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs";
const OPENAI_KEY      = () => process.env.OPENAI_API_KEY ||
  Buffer.from("c2stcHJvai0xWWFNcTZDQnRRLVhLVlpqQm8wMnVNNEItUG9GM3JvR2ZweXNsX25jZExFVWtsVkFBYzZzOHkyS2tYdXhPTmxVZmgyNGcyX3Atc1QzQmxia0ZKZkpaM0xBc3BWZjVjMVB6TVpEa285WE1KcEtiQzNyUnp1T2xRbE5NV2hhaDB4M21wUm1KMWQyVWFvRnd0SnNYd2JMTUdacC0wZ0E=", "base64").toString();
const NOTIFY_URL      = () => process.env.NOTIFY_WEBHOOK_URL || ""; // n8n / Slack / Telegram

const OPEN_STATUSES = ["aberto","em_atendimento","aguardando_cliente","aguardando_interno"];

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

function extractBody(msg) {
  if (!msg) return null;
  if (typeof msg.conversation === "string") return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage) return msg.imageMessage.caption || "[imagem]";
  if (msg.videoMessage) return "[vídeo]";
  if (msg.audioMessage) return "[áudio]";
  if (msg.documentMessage) return msg.documentMessage.fileName ? `[documento: ${msg.documentMessage.fileName}]` : "[documento]";
  if (msg.stickerMessage) return "[figurinha]";
  if (msg.locationMessage) return "[localização]";
  if (msg.contactMessage) return "[contato]";
  return null;
}

function extractMediaType(msg) {
  if (!msg) return null;
  if (msg.imageMessage) return "image";
  if (msg.videoMessage) return "video";
  if (msg.audioMessage) return "audio";
  if (msg.documentMessage) return "document";
  if (msg.stickerMessage) return "sticker";
  if (msg.locationMessage) return "location";
  if (msg.contactMessage) return "contact";
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleWhatsappWebhook(req, res) {
  const json = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  // GET → health-check
  if (req.method === "GET") return json(200, { status: "ok", service: "posvenda360-whatsapp-webhook", version: "1.1" });

  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  // Validar apikey
  const apikey = req.headers["apikey"] || req.headers["x-api-key"] || "";
  if (apikey !== WH_APIKEY()) {
    console.warn("[webhook] apikey inválido:", String(apikey).slice(0, 8));
    return json(401, { error: "Unauthorized" });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const { event, instance = "pv360", data = {} } = payload;
  console.log(`[webhook] event=${event} instance=${instance}`);

  if (event !== "messages.upsert") return json(200, { ok: true, skipped: true });

  const key        = data.key || {};
  const remoteJid  = key.remoteJid;
  const fromMe     = Boolean(key.fromMe);
  const messageId  = key.id;
  const pushName   = data.pushName;
  const message    = data.message || {};

  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast")
    return json(200, { ok: true, skipped: "group_or_broadcast" });

  const bodyText  = extractBody(message);
  const mediaType = extractMediaType(message);
  if (!bodyText && !mediaType) return json(200, { ok: true, skipped: "no_body" });

  const displayBody = bodyText || `[${mediaType}]`;

  // 1. Salva em whatsapp_messages
  let insertedId = null;
  try {
    const r = await sbFetch("/rest/v1/whatsapp_messages", {
      method: "POST",
      body: JSON.stringify({ instance, remote_jid: remoteJid, push_name: pushName || null,
        from_me: fromMe, message_id: messageId || null, body: displayBody,
        media_type: mediaType || null, raw: data }),
    });
    if (r.ok) {
      const rows = await r.json();
      insertedId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
    } else {
      console.error("[webhook] whatsapp_messages insert:", await r.text());
    }
  } catch (e) {
    console.error("[webhook] whatsapp_messages error:", e.message);
  }

  // ── Automações (apenas mensagens de clientes externos @s.whatsapp.net) ────
  // @lid = dispositivo vinculado interno — ignorado aqui
  const isExternalCustomer = !fromMe && bodyText && remoteJid.endsWith("@s.whatsapp.net");
  if (isExternalCustomer) {
    automateIncoming({ remoteJid, pushName, displayBody, insertedId }).catch((e) =>
      console.error("[automate] erro geral:", e.message),
    );
  }

  return json(200, { ok: true });
}

// ─── Pipeline de automação ────────────────────────────────────────────────────
async function automateIncoming({ remoteJid, pushName, displayBody, insertedId }) {
  const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  const contactName = pushName || phone;

  // ── A. Busca ticket aberto existente ──────────────────────────────────────
  const statusFilter = OPEN_STATUSES.map(s => `"${s}"`).join(",");
  let openTicket = null;
  try {
    const r = await sbFetch(
      `/rest/v1/tickets?select=id,code&whatsapp_thread_id=eq.${encodeURIComponent(remoteJid)}&status=in.(${statusFilter})&order=created_at.desc&limit=1`,
    );
    if (r.ok) {
      const rows = await r.json();
      if (rows.length > 0) openTicket = rows[0];
    }
  } catch (e) { console.error("[automate] ticket search error:", e.message); }

  // ── B. Verifica se já foi enviada resposta automática para este JID ────────
  // Usamos raw->auto_reply para não disparar duas vezes em testes repetidos
  let isFirstMessage = false;
  try {
    const r = await sbFetch(
      `/rest/v1/whatsapp_messages?select=id&remote_jid=eq.${encodeURIComponent(remoteJid)}&from_me=eq.true&raw->>auto_reply=eq.true&limit=1`,
    );
    if (r.ok) {
      const rows = await r.json();
      // Envia resposta automática apenas se nunca foi enviada antes para este JID
      isFirstMessage = rows.length === 0;
    }
  } catch (e) { console.error("[automate] first-message check error:", e.message); }

  // ── C. Cria ticket automático se não há nenhum aberto ────────────────────
  if (!openTicket) {
    try {
      const r = await sbFetch("/rest/v1/tickets", {
        method: "POST",
        body: JSON.stringify({
          customer:        contactName,
          customer_telefone: phone,
          part:            "WhatsApp — aguardando triagem",
          part_code:       "WA-AUTO",
          reason:          displayBody.slice(0, 500),
          occurrence_reason: "outro",
          channel:         "whatsapp",
          status:          "aberto",
          priority:        "media",
          whatsapp_thread_id: remoteJid,
        }),
      });
      if (r.ok) {
        const rows = await r.json();
        openTicket = Array.isArray(rows) ? rows[0] : rows;
        console.log(`[automate] ticket criado: ${openTicket?.code}`);
      } else {
        console.error("[automate] ticket create error:", await r.text());
      }
    } catch (e) { console.error("[automate] ticket create exception:", e.message); }
  }

  // ── D. Vincula mensagem ao ticket ────────────────────────────────────────
  if (openTicket) {
    if (insertedId) {
      await sbFetch(`/rest/v1/whatsapp_messages?id=eq.${insertedId}`, {
        method: "PATCH",
        body: JSON.stringify({ ticket_id: openTicket.id }),
      }).catch((e) => console.error("[automate] wa_msg patch error:", e.message));
    }
    await sbFetch("/rest/v1/ticket_messages", {
      method: "POST",
      body: JSON.stringify({
        ticket_id:   openTicket.id,
        kind:        "whatsapp",
        author_name: contactName,
        body:        displayBody,
      }),
    }).catch((e) => console.error("[automate] ticket_msg error:", e.message));
  }

  // ── E. Primeira resposta automática (com IA se OPENAI_API_KEY estiver set) ─
  if (isFirstMessage) {
    const replyText = await generateFirstReply(contactName, displayBody);
    try {
      // Envia via Evolution API
      await fetch(`http://72.61.48.156:8080/message/sendText/pv360`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
        body: JSON.stringify({ number: remoteJid, text: replyText }),
      });
      // Salva resposta automática no Supabase
      const srRes = await sbFetch("/rest/v1/whatsapp_messages", {
        method: "POST",
        body: JSON.stringify({
          instance: "pv360",
          remote_jid: remoteJid,
          from_me: true,
          body: replyText,
          raw: { auto_reply: true },
        }),
      });
      // Salva também no ticket
      if (openTicket && srRes.ok) {
        await sbFetch("/rest/v1/ticket_messages", {
          method: "POST",
          body: JSON.stringify({
            ticket_id:   openTicket.id,
            kind:        "whatsapp",
            author_name: "Bot pv360",
            body:        replyText,
          }),
        }).catch(() => {});
      }
      console.log("[automate] primeira resposta enviada");
    } catch (e) { console.error("[automate] first-reply send error:", e.message); }
  }

  // ── F. Notificação para o time ────────────────────────────────────────────
  const notifyUrl = NOTIFY_URL();
  if (notifyUrl) {
    fetch(notifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event:       "nova_mensagem_whatsapp",
        contact:     contactName,
        phone,
        message:     displayBody,
        ticket_code: openTicket?.code ?? null,
        thread_url:  `https://aliceblue-dove-844629.hostingersite.com/thread/${encodeURIComponent(remoteJid)}`,
        is_first:    isFirstMessage,
        timestamp:   new Date().toISOString(),
      }),
    }).catch((e) => console.error("[automate] notify error:", e.message));
  }
}

// ─── Geração da primeira resposta (IA ou fallback fixo) ───────────────────────
async function generateFirstReply(contactName, messageBody) {
  const openaiKey = OPENAI_KEY();
  if (!openaiKey) {
    // Texto fixo quando não há chave de IA configurada
    return `Olá${contactName ? ", " + contactName.split(" ")[0] : ""}! 👋\n\nRecebemos sua mensagem e em breve um de nossos atendentes irá retornar.\n\nHorário de atendimento: segunda a sexta, das 8h às 18h.\n\nObrigado! 🙏`;
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "Você é o assistente de atendimento da VerticalParts (pós-venda de peças industriais). " +
              "Responda APENAS com a mensagem de boas-vindas para o cliente, em português, " +
              "de forma cordial e profissional, em 2-3 linhas. " +
              "Mencione que um atendente irá retornar em breve. Não use markdown, só texto simples.",
          },
          {
            role: "user",
            content: `Cliente: ${contactName}\nMensagem recebida: "${messageBody}"\n\nGere a resposta de boas-vindas.`,
          },
        ],
      }),
    });
    if (r.ok) {
      const data = await r.json();
      return data.choices?.[0]?.message?.content?.trim() ||
        `Olá, ${contactName}! Recebemos sua mensagem. Em breve retornamos. 🙏`;
    }
  } catch (e) {
    console.error("[automate] openai error:", e.message);
  }

  return `Olá, ${contactName.split(" ")[0]}! Recebemos sua mensagem e em breve um atendente irá retornar. 🙏`;
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

// ─── /api/whatsapp/send ────────────────────────────────────────────────────────
// Envia mensagem de texto via Evolution API e salva em whatsapp_messages.
// Body: { remoteJid: string, text: string }
// Header: Authorization: Bearer <SUPABASE_ANON_KEY>  (validado no servidor)

async function handleWhatsappSend(req, res) {
  const json = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(obj));
  };

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.end();
  }

  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "Invalid JSON" }); }

  const { remoteJid, text } = payload || {};
  if (!remoteJid || !text?.trim()) return json(400, { error: "remoteJid e text são obrigatórios" });

  // ── @lid: dispositivo vinculado — Evolution API não consegue entregar ──────
  // Salvamos no Supabase apenas (mensagem aparece no chat como "enviada")
  // sem tentar a Evolution, que sempre retornaria 400/502 para esses JIDs.
  if (String(remoteJid).endsWith("@lid")) {
    console.log("[send] @lid JID — salva local, não envia via Evolution:", remoteJid);
    try {
      const sbKey = SB_SERVICE_KEY();
      await fetch(`${SB_URL}/rest/v1/whatsapp_messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": sbKey,
          "Authorization": `Bearer ${sbKey}`,
        },
        body: JSON.stringify({
          instance: "pv360",
          remote_jid: remoteJid,
          from_me: true,
          body: text.trim(),
          message_id: null,
          raw: { lid_local_only: true },
        }),
      });
    } catch (e) {
      console.error("[send] @lid supabase insert error:", e.message);
    }
    return json(200, { ok: true, warning: "lid_local_only" });
  }

  // Evolution API aceita número puro (55119...) OU JID completo (@s.whatsapp.net)
  const numberOnly = String(remoteJid)
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "");

  const number = remoteJid; // passa o JID completo — Evolution API v2 aceita

  // Helpers para detectar "exists: false" (contato não verificado mas entregável)
  function isExistsFalse(result) {
    const msgs = result?.response?.message;
    return Array.isArray(msgs) && msgs.some((m) => m.exists === false);
  }

  // 1. Envia via Evolution API
  let evResult = {};
  let bestEffort = false; // true quando Evolution retorna exists:false mas pode ter entregado
  try {
    const r = await fetch(`http://72.61.48.156:8080/message/sendText/pv360`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
      body: JSON.stringify({ number, text: text.trim() }),
    });
    evResult = await r.json().catch(() => ({}));

    if (!r.ok) {
      // Se a Evolution respondeu "exists: false", é um @lid não verificável
      // mas a mensagem pode ter sido entregue via dispositivo vinculado.
      if (isExistsFalse(evResult)) {
        console.warn("[send] Evolution: exists=false para JID", remoteJid, "— tratando como best-effort");
        bestEffort = true;
      } else if (numberOnly !== remoteJid) {
        // Tenta com número puro como fallback
        console.warn("[send] JID falhou, tentando número puro:", numberOnly);
        const r2 = await fetch(`http://72.61.48.156:8080/message/sendText/pv360`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
          body: JSON.stringify({ number: numberOnly, text: text.trim() }),
        });
        evResult = await r2.json().catch(() => ({}));
        if (!r2.ok) {
          if (isExistsFalse(evResult)) {
            console.warn("[send] Fallback também retornou exists=false — best-effort");
            bestEffort = true;
          } else {
            console.error("[send] Evolution error (ambos falharam):", evResult);
            return json(502, { error: "Falha ao enviar via Evolution API", detail: evResult });
          }
        }
      } else {
        console.error("[send] Evolution error:", evResult);
        return json(502, { error: "Falha ao enviar via Evolution API", detail: evResult });
      }
    }
  } catch (e) {
    return json(502, { error: "Evolution API indisponível", detail: e.message });
  }

  // 2. Salva em whatsapp_messages
  const msgKey = evResult?.key;
  try {
    const sbKey = SB_SERVICE_KEY();
    await fetch(`${SB_URL}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": sbKey,
        "Authorization": `Bearer ${sbKey}`,
      },
      body: JSON.stringify({
        instance: "pv360",
        remote_jid: remoteJid,
        from_me: true,
        body: text.trim(),
        message_id: msgKey?.id ?? null,
        raw: evResult,
      }),
    });
  } catch (e) {
    console.error("[send] supabase insert error:", e.message);
  }

  return json(200, { ok: true, key: msgKey, ...(bestEffort ? { warning: "contact_not_verified" } : {}) });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url || "/", "http://localhost").pathname;

    // ── API routes interceptadas antes do TanStack ──
    if (urlPath === "/api/whatsapp/status") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const oaiKey = OPENAI_KEY();
      const notifyUrl = NOTIFY_URL();
      res.end(JSON.stringify({
        openai_key_set: oaiKey.length > 0,
        openai_key_prefix: oaiKey ? oaiKey.slice(0, 12) + "..." : null,
        notify_url_set: notifyUrl.length > 0,
        evolution_apikey: WH_APIKEY().slice(0, 4) + "...",
        env_file_loaded: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        ts: new Date().toISOString(),
      }));
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

    if (!response.body) {
      res.end();
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
