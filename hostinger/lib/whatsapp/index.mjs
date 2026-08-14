import {
  sbFetch, readBody, WH_APIKEY, EVO_URL, SB_URL, SB_SERVICE_KEY, evoSendText,
  STT_URL, STT_APIKEY, ANTHROPIC_KEY, CLAUDE_MODEL, NOTIFY_URL,
} from "../http.mjs";
import { callClaudeWithHistory, atendimentoContexto } from "../ai/index.mjs";

const OPEN_STATUSES = ["aberto","em_atendimento","aguardando_cliente","aguardando_interno"];

// ─── Agenda @lid: resolve JID → { phone, nome, empresa } ─────────────────────
async function lookupLidAgenda(lidJid) {
  try {
    const r = await sbFetch(
      `/rest/v1/lid_agenda?lid_jid=eq.${encodeURIComponent(lidJid)}&limit=1`,
      { method: "GET", headers: { "Prefer": "return=representation" } },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
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

// ─── Transcrição de áudio (STT local no VPS) ──────────────────────────────────
// WhatsApp envia voz como PTT em OGG/Opus. Com webhookBase64=true a Evolution embute
// o base64 no payload; se faltar, baixamos via getBase64FromMediaMessage. O texto volta
// do serviço STT (faster-whisper) que roda no VPS — a Verti então responde em TEXTO.
async function transcreverAudio(data) {
  const apikey = STT_APIKEY();
  if (!apikey) { console.warn("[stt] STT_APIKEY não configurada — áudio ignorado"); return null; }

  // 1) base64 que já vem no webhook
  let b64 = data?.message?.base64 || data?.message?.audioMessage?.base64 || data?.base64 || null;

  // 2) fallback: pede o base64 à Evolution
  if (!b64) {
    try {
      const r = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/pv360`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
        body: JSON.stringify({ message: { key: data?.key }, convertToMp4: false }),
        signal: AbortSignal.timeout(30_000),
      });
      if (r.ok) { const j = await r.json(); b64 = j?.base64 || j?.media || null; }
      else console.error("[stt] getBase64 HTTP", r.status);
    } catch (e) { console.error("[stt] getBase64 error:", e.message); }
  }

  if (!b64) {
    console.warn("[stt] sem base64 de áudio. chaves de data.message:", Object.keys(data?.message || {}));
    return null;
  }

  try {
    const r = await fetch(STT_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ audio_base64: b64, ext: "ogg" }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) { console.error("[stt] HTTP", r.status, await r.text().catch(() => "")); return null; }
    const j = await r.json();
    const text = (j?.text || "").trim();
    console.log(`[stt] transcrito (${j?.ms}ms): "${text.slice(0, 80)}"`);
    return text || null;
  } catch (e) { console.error("[stt] call error:", e.message); return null; }
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

  // ── Automações — processa @s.whatsapp.net E @lid (widget do site) ──────────
  const isExternalCustomer = !fromMe && bodyText &&
    (remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid"));
  if (isExternalCustomer) {
    automateIncoming({ remoteJid, pushName, displayBody, insertedId,
      isAudio: mediaType === "audio", data }).catch((e) =>
      console.error("[automate] erro geral:", e.message),
    );
  }

  return json(200, { ok: true });
}

// Evolution responde 400 com "exists:false" quando não confirma o número no WhatsApp
// (comum em @lid/contato ainda não sincronizado) — nesses casos a msg pode ter sido
// entregue mesmo assim, então tratamos como best-effort em vez de falha dura.
function isExistsFalse(result) {
  const msgs = result?.response?.message;
  return Array.isArray(msgs) && msgs.some((m) => m.exists === false);
}

// ─── Pipeline de automação ────────────────────────────────────────────────────
async function automateIncoming({ remoteJid, pushName, displayBody, insertedId, isAudio = false, data = null }) {
  const isLid = remoteJid.endsWith("@lid");
  const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@c.us", "");
  const contactName = pushName || (isLid ? `cliente-${phone.slice(0, 8)}` : phone);

  // ── Áudio: transcreve agora (já respondemos 200 ao webhook) e corrige o corpo ──
  // Assim o histórico do Claude e o ticket passam a ter o TEXTO do que o cliente falou.
  let audioTranscript = null;
  if (isAudio && data) {
    audioTranscript = await transcreverAudio(data);
    if (audioTranscript) {
      displayBody = `🎙️ (áudio) ${audioTranscript}`;
      if (insertedId) {
        await sbFetch(`/rest/v1/whatsapp_messages?id=eq.${insertedId}`, {
          method: "PATCH",
          body: JSON.stringify({ body: displayBody }),
        }).catch((e) => console.error("[automate] patch transcrição:", e.message));
      }
    }
  }

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

  // ── B. Cria ticket automático se não há nenhum aberto ────────────────────
  if (!openTicket) {
    try {
      const r = await sbFetch("/rest/v1/tickets", {
        method: "POST",
        body: JSON.stringify({
          customer:          contactName,
          customer_telefone: isLid ? null : phone,
          part:              "WhatsApp — aguardando triagem",
          part_code:         "WA-AUTO",
          reason:            displayBody.slice(0, 500),
          occurrence_reason: "outro",
          channel:           "whatsapp",
          status:            "aberto",
          priority:          "media",
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

  // ── C. Vincula mensagem ao ticket ────────────────────────────────────────
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

  // ── D. Resposta automática via Claude (toda mensagem, se habilitado) ──────
  const autoReply = (process.env.CLAUDE_AUTO_REPLY || process.env.HERMES_AUTO_REPLY || "").toLowerCase() === "true";
  if (autoReply) {
    let replyText = await callClaudeWithHistory(remoteJid);

    // REGRA DE OURO: a Verti NUNCA fica muda. Se o Claude falhar (timeout/sobrecarga, mesmo
    // após retries), mandamos uma mensagem de acolhimento e escalamos o ticket p/ atendente humano.
    let usedFallback = false;
    if (!replyText) {
      replyText = "Recebi sua mensagem e já estou acionando nosso time para te atender, tá? Em breve retornamos por aqui. 🙏";
      usedFallback = true;
      console.warn("[automate] Claude sem resposta — enviando fallback p/", remoteJid);
    }

    // Áudio: a Verti reconhece que ouviu o áudio e então responde (tudo em texto).
    if (audioTranscript) replyText = `🎙️ Entendi seu áudio: "${audioTranscript}"\n\n${replyText}`;

    const sendNumber = isLid ? remoteJid : phone;
    const sent = await evoSendText(sendNumber, replyText);
    if (sent.ok) {
      // Salva resposta no Supabase
      const srRes = await sbFetch("/rest/v1/whatsapp_messages", {
        method: "POST",
        body: JSON.stringify({
          instance: "pv360",
          remote_jid: remoteJid,
          from_me: true,
          body: replyText,
          raw: { auto_reply: true, fallback: usedFallback },
        }),
      });
      // Salva no ticket
      if (openTicket && srRes.ok) {
        await sbFetch("/rest/v1/ticket_messages", {
          method: "POST",
          body: JSON.stringify({
            ticket_id:   openTicket.id,
            kind:        "whatsapp",
            author_name: usedFallback ? "Sistema (resposta automática de espera)" : "Claude (VerticalParts Bot)",
            body:        replyText,
          }),
        }).catch(() => {});
      }
      console.log(`[automate] ${usedFallback ? "⚠️ fallback" : "✅ Claude"} respondeu para ${contactName}: "${replyText.slice(0, 60)}..."`);
    } else {
      console.error("[automate] Evolution send error:", sent.error);
    }

    // Falhou a IA: sobe o ticket p/ atendimento humano (prioridade alta + nota interna).
    if (usedFallback && openTicket) {
      await sbFetch(`/rest/v1/tickets?id=eq.${openTicket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: "alta" }),
      }).catch(() => {});
      await sbFetch("/rest/v1/ticket_messages", {
        method: "POST",
        body: JSON.stringify({
          ticket_id:   openTicket.id,
          kind:        "nota_interna",
          author_name: "Sistema",
          body:        "⚠️ A Verti não conseguiu responder automaticamente (falha na IA após retries). O cliente recebeu uma mensagem de espera — favor assumir o atendimento.",
        }),
      }).catch(() => {});
    }
  }

  // ── E. Notificação para o time ────────────────────────────────────────────
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
        is_first:    true,
        timestamp:   new Date().toISOString(),
      }),
    }).catch((e) => console.error("[automate] notify error:", e.message));
  }
}

// ─── Geração da primeira resposta (Claude / fallback fixo) ────────────────────
async function generateFirstReply(contactName, messageBody) {
  const apiKey = ANTHROPIC_KEY();
  if (!apiKey) {
    // Texto fixo quando ANTHROPIC_API_KEY não está configurada
    return `Olá${contactName ? ", " + contactName.split(" ")[0] : ""}! 👋 Eu sou a Verti, da VerticalParts.\n\nRecebemos sua mensagem e em breve um de nossos atendentes irá retornar.\n\nHorário de atendimento: segunda a quinta das 7h às 18h e sexta das 7h às 17h.\n\nObrigado! 🙏`;
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL(),
        max_tokens: 200,
        system:
          "Você é a Verti, atendente virtual da VerticalParts (pós-venda de peças industriais). " +
          "Responda APENAS com a mensagem de boas-vindas para o cliente, em português, " +
          "apresentando-se como Verti, de forma cordial e profissional, em 2-3 linhas. " +
          "Mencione que um atendente irá retornar em breve. Não use markdown, só texto simples.\n\n" +
          atendimentoContexto(),
        messages: [
          {
            role: "user",
            content: `Cliente: ${contactName}\nMensagem recebida: "${messageBody}"\n\nGere a resposta de boas-vindas.`,
          },
        ],
      }),
    });
    if (r.ok) {
      const data = await r.json();
      return data.content?.[0]?.text?.trim() ||
        `Olá, ${contactName}! Eu sou a Verti, da VerticalParts. Recebemos sua mensagem e em breve retornamos. 🙏`;
    }
    console.error("[automate] Claude HTTP", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.error("[automate] Claude error:", e.message);
  }

  return `Olá, ${contactName.split(" ")[0]}! Eu sou a Verti, da VerticalParts. Recebemos sua mensagem e em breve um atendente irá retornar. 🙏`;
}

// ─── /api/whatsapp/start ──────────────────────────────────────────────────────
// Inicia nova conversa WhatsApp: envia mensagem + cria ticket + salva em whatsapp_messages.
// Body: { phone: string, text: string, customerName?: string }

async function handleWhatsappStart(req, res) {
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
  catch { return json(400, { error: "JSON inválido." }); }

  const { phone: rawPhone, text, customerName } = payload || {};
  if (!rawPhone || !text?.trim()) {
    return json(422, { error: "phone e text são obrigatórios" });
  }

  let phone = String(rawPhone).replace(/\D/g, "");
  // Auto-adiciona DDI 55 (Brasil) se o número tiver só DDD+número (10 ou 11 dígitos)
  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) {
    phone = "55" + phone;
  }
  if (phone.length < 12 || phone.length > 13) {
    return json(422, { error: "Número inválido — use DDI+DDD+número (ex: 5511999999999)" });
  }

  const remoteJid = `${phone}@s.whatsapp.net`;
  const customer = customerName?.trim() ? `${customerName.trim()} (${phone})` : phone;

  // 1. Envia via Evolution API
  let evResult = {};
  try {
    const r = await fetch(`http://72.61.48.156:8080/message/sendText/pv360`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
      body: JSON.stringify({ number: phone, text: text.trim() }),
    });
    evResult = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (isExistsFalse(evResult)) {
        // Evolution não confirma o número no WhatsApp (comum em contato ainda não
        // sincronizado) — segue como best-effort em vez de bloquear o atendente.
        console.warn("[start] Evolution: exists=false para", phone, "— tratando como best-effort");
      } else {
        const detail = evResult?.message ?? evResult?.error ?? `HTTP ${r.status}`;
        console.error("[start] Evolution error:", evResult);
        return json(502, { error: `Não foi possível enviar pelo WhatsApp: ${JSON.stringify(detail)}` });
      }
    }
  } catch (e) {
    return json(503, { error: `Falha ao conectar na Evolution API: ${e.message}` });
  }

  const sbKey = SB_SERVICE_KEY();
  const headers = {
    "Content-Type": "application/json",
    "apikey": sbKey,
    "Authorization": `Bearer ${sbKey}`,
    "Prefer": "return=representation",
  };

  // 2. Cria ticket
  let ticketId = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer,
        part: "A definir",
        part_code: "WA",
        reason: "Contato iniciado pela plataforma",
        occurrence_reason: "outro",
        channel: "whatsapp",
        status: "aberto",
        whatsapp_thread_id: remoteJid,
      }),
    });
    if (r.ok) {
      const rows = await r.json();
      ticketId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
    } else {
      console.error("[start] ticket error:", await r.text());
    }
  } catch (e) { console.error("[start] ticket exception:", e.message); }

  // 3. Salva mensagem
  const msgKey = evResult?.key;
  try {
    await fetch(`${SB_URL}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        instance: "pv360",
        remote_jid: remoteJid,
        from_me: true,
        body: text.trim(),
        message_id: msgKey?.id ?? null,
        ticket_id: ticketId,
        raw: evResult,
      }),
    });
  } catch (e) { console.error("[start] message save exception:", e.message); }

  return json(200, { ok: true, remoteJid, ticketId });
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

  const { remoteJid, text, overridePhone } = payload || {};
  if (!remoteJid || !text?.trim()) return json(400, { error: "remoteJid e text são obrigatórios" });

  // ── @lid: dispositivo vinculado — WhatsApp oculta o número real ──────────
  // Se o operador informou o número manual (overridePhone), envia via Evolution
  // usando o número real, mas salva com o JID @lid original (aparece na thread).
  // Se não veio overridePhone no payload, tenta resolver via agenda telefônica.
  // Sem nenhum dos dois → salva apenas localmente (comportamento anterior).
  if (String(remoteJid).endsWith("@lid")) {
    // Auto-lookup na agenda se overridePhone não foi passado pelo frontend
    if (!overridePhone) {
      const entry = await lookupLidAgenda(remoteJid);
      if (entry?.phone) {
        console.log(`[send] @lid auto-agenda: JID ${remoteJid} → ${entry.phone} (${entry.nome ?? "sem nome"})`);
        overridePhone = entry.phone;
      }
    }
    // Normaliza o número: apenas dígitos, garante prefixo 55 (Brasil)
    const rawPhone  = String(overridePhone ?? "").replace(/\D/g, "");
    const realPhone = rawPhone
      ? (rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`)
      : "";

    if (realPhone) {
      // ── tem número manual: tenta entregar via Evolution ──────────────────
      console.log(`[send] @lid com overridePhone → enviando para ${realPhone} (JID original: ${remoteJid})`);
      let evResult = {};
      try {
        const r = await fetch(`http://72.61.48.156:8080/message/sendText/pv360`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
          body: JSON.stringify({ number: realPhone, text: text.trim() }),
        });
        evResult = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error("[send] @lid overridePhone Evolution error:", evResult);
          return json(502, { error: "Falha ao enviar via Evolution API", detail: evResult });
        }
      } catch (e) {
        return json(502, { error: "Evolution API indisponível", detail: e.message });
      }
      // Salva com remote_jid = @lid original → aparece na thread certa
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
            message_id: evResult?.key?.id ?? null,
            raw: { ...evResult, override_phone: realPhone },
          }),
        });
      } catch (e) {
        console.error("[send] @lid overridePhone supabase insert error:", e.message);
      }
      return json(200, { ok: true, key: evResult?.key, override_phone: realPhone });
    }

    // ── sem número manual: salva localmente (não entrega) ────────────────
    console.log("[send] @lid sem overridePhone — salva local:", remoteJid);
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

// ─── Agenda @lid — GET /api/whatsapp/lid-agenda[?jid=xxx] ────────────────────
async function handleLidAgendaGet(req, res) {
  const url    = new URL(req.url, "http://localhost");
  const jid    = url.searchParams.get("jid");
  const filter = jid ? `?lid_jid=eq.${encodeURIComponent(jid)}&limit=1` : "?order=nome.asc";
  const r      = await sbFetch(`/rest/v1/lid_agenda${filter}`, { method: "GET" });
  const data   = await r.json().catch(() => []);
  res.statusCode = r.ok ? 200 : 502;
  res.setHeader("Content-Type", "application/json");
  // Para lookup por jid devolve objeto único (ou null); para lista devolve array
  res.end(JSON.stringify(jid ? (Array.isArray(data) && data.length > 0 ? data[0] : null) : data));
}

// ─── Agenda @lid — POST /api/whatsapp/lid-agenda (upsert) ────────────────────
async function handleLidAgendaUpsert(req, res) {
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "JSON inválido" }); }

  const { jid, phone, nome, empresa } = payload || {};
  if (!jid || !phone) return json(400, { error: "jid e phone são obrigatórios" });

  const cleanPhone = String(phone).replace(/\D/g, "");
  if (!cleanPhone) return json(400, { error: "Telefone inválido" });

  const body = JSON.stringify({
    lid_jid: jid,
    phone:   cleanPhone,
    nome:    nome  ? String(nome).trim()    : null,
    empresa: empresa ? String(empresa).trim() : null,
    updated_at: new Date().toISOString(),
  });

  const r = await sbFetch("/rest/v1/lid_agenda", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body,
  });
  const data = await r.json().catch(() => ({}));
  res.statusCode  = r.ok ? 200 : 502;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(r.ok ? { ok: true, entry: Array.isArray(data) ? data[0] : data } : { error: data }));
}

// ─── Agenda @lid — DELETE /api/whatsapp/lid-agenda ────────────────────────────
async function handleLidAgendaDelete(req, res) {
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "JSON inválido" }); }

  const { jid } = payload || {};
  if (!jid) return json(400, { error: "jid é obrigatório" });

  const r = await sbFetch(`/rest/v1/lid_agenda?lid_jid=eq.${encodeURIComponent(jid)}`, { method: "DELETE" });
  res.statusCode = r.ok ? 200 : 502;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(r.ok ? { ok: true } : { error: "Falha ao remover" }));
}

export {
  lookupLidAgenda,
  extractBody,
  extractMediaType,
  transcreverAudio,
  handleWhatsappWebhook,
  automateIncoming,
  generateFirstReply,
  handleWhatsappStart,
  handleWhatsappSend,
  handleLidAgendaGet,
  handleLidAgendaUpsert,
  handleLidAgendaDelete,
};
