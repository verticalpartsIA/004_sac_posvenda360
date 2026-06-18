import http from "node:http";
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

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

// ─── WhatsApp Webhook (Evolution API → Supabase) ──────────────────────────────
// Handler nativo Node.js — independente do TanStack Router.
// URL: POST /api/whatsapp/webhook

// Segredos via painel Passenger (env_present confirmado). Sem fallback hardcoded p/ não expor no git.
const WH_APIKEY       = () => process.env.EVOLUTION_APIKEY || "";
const SB_URL          = "https://jkbklzlbhhfnamaeislb.supabase.co";
const SB_SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ─── VP Click (Supabase) ──────────────────────────────────────────────────────
const VC_URL = "https://sfpnjwllcmentoocylow.supabase.co";
const VC_SERVICE_KEY  = () =>
  process.env.VPCLICK_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcG5qd2xsY21lbnRvb2N5bG93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ4NDg1MSwiZXhwIjoyMDkzMDYwODUxfQ.DB5TB5VsCa-LNnoeXgfUAaPbicwlXsguK0KPdR2LArE";
const VC_LIST_TICKETS   = "44400000-0000-4000-8000-000000000004"; // VP PÓS-VENDA > Atendimento > Tickets
const VC_TEAM_EXPEDICAO = "a0236505-22dc-46c8-b95c-c67346fe74cf";
const VC_TEAM_POS_VENDA = "0096f24e-185d-486c-a877-0db4190f7116";

function vcFetch(path, opts = {}) {
  const key = VC_SERVICE_KEY();
  return fetch(`${VC_URL}${path}`, {
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
const ANTHROPIC_KEY   = () => process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL    = () => process.env.CLAUDE_MODEL || "claude-opus-4-8"; // Opus por padrão (NÃO cai p/ HERMES_MODEL=haiku do painel)
const NOTIFY_URL      = () => process.env.NOTIFY_WEBHOOK_URL || ""; // n8n / Slack / Telegram
// STT local (faster-whisper no VPS) — transcreve áudios de clientes p/ a Verti "ouvir".
// A API Anthropic não aceita áudio; a transcrição é 100% local (sem custo, sem terceiros).
const STT_URL         = () => process.env.STT_URL || "http://72.61.48.156:8090/transcribe";
const STT_APIKEY      = () => process.env.STT_APIKEY || "b9cf3d5fbd2b1f3559b50e5d5936da0e2e078b841d815a81"; // default p/ sobreviver a deploy (gitignored .env some no republish); repo privado, mesmo padrão dos demais segredos
const EVO_URL         = "http://72.61.48.156:8080";
const CRON_KEY        = () => process.env.CRON_KEY || "vp360cron_b7f2a9d1e4"; // protege o endpoint do gatilho (cron do VPS)

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

// ─── Chamada ao Claude com histórico completo ─────────────────────────────────
// ─── Config de atendimento: horários + feriados (fuso America/Sao_Paulo) ──────
// Horário comercial VerticalParts: Seg–Qui 07:00–18:00 | Sex 07:00–17:00 | Sáb/Dom fechado
const BUSINESS_HOURS = { 1: [7, 18], 2: [7, 18], 3: [7, 18], 4: [7, 18], 5: [7, 17] };

// Páscoa (Computus) → base dos feriados móveis
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
const _addDays = (date, n) => { const x = new Date(date); x.setUTCDate(x.getUTCDate() + n); return x; };
const _mmdd = (d) => String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

// Feriados (Nacional + Estado SP + Município Guarulhos). Ajuste a gosto da equipe.
function holidaysFor(year) {
  const e = easterSunday(year);
  return {
    [_mmdd(_addDays(e, -48))]: "Carnaval (segunda)",
    [_mmdd(_addDays(e, -47))]: "Carnaval (terça)",
    [_mmdd(_addDays(e, -2))]:  "Sexta-feira Santa",
    [_mmdd(_addDays(e, 60))]:  "Corpus Christi",
    "01-01": "Confraternização Universal",
    "04-21": "Tiradentes",
    "05-01": "Dia do Trabalho",
    "09-07": "Independência do Brasil",
    "10-12": "Nossa Senhora Aparecida",
    "11-02": "Finados",
    "11-15": "Proclamação da República",
    "11-20": "Consciência Negra",
    "12-25": "Natal",
    "07-09": "Revolução Constitucionalista (Estado de SP)",
    "12-08": "Aniversário de Guarulhos",
  };
}

// Data/hora atual no fuso de São Paulo
function nowSaoPaulo() {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "long", hour12: false,
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value;
  const y = +g("year"), mo = +g("month"), da = +g("day");
  return {
    year: y, monthDay: `${g("month")}-${g("day")}`, hour: +g("hour"), minute: +g("minute"),
    dow: new Date(Date.UTC(y, mo - 1, da)).getUTCDay(), weekdayName: g("weekday"),
    dateStr: `${g("day")}/${g("month")}/${g("year")}`, timeStr: `${g("hour")}h${g("minute")}`,
  };
}

const HORARIO_TXT = "Segunda a Quinta das 07h às 18h; Sexta das 07h às 17h. Fechado aos sábados, domingos e feriados.";

// Bloco dinâmico injetado a cada resposta: sabe a data/hora e se está aberto/feriado
function atendimentoContexto() {
  const n = nowSaoPaulo();
  const hol = holidaysFor(n.year)[n.monthDay];
  const hours = BUSINESS_HOURS[n.dow];
  let status;
  if (hol) status = `Hoje é FERIADO (${hol}) — nossos atendentes não estão disponíveis hoje.`;
  else if (!hours) status = "Hoje é fim de semana — nossos atendentes não estão disponíveis.";
  else {
    const aberto = n.hour >= hours[0] && n.hour < hours[1];
    status = aberto
      ? "AGORA estamos DENTRO do horário de atendimento."
      : "AGORA estamos FORA do horário de atendimento (nossos atendentes retornam no próximo horário comercial).";
  }
  const lista = Object.entries(holidaysFor(n.year))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, nome]) => `${d.slice(3)}/${d.slice(0, 2)} ${nome}`)
    .join("; ");
  return `CONTEXTO DE HOJE (fuso de São Paulo):\n` +
    `- Agora: ${n.weekdayName}, ${n.dateStr}, ${n.timeStr}\n` +
    `- Horário comercial: ${HORARIO_TXT}\n` +
    `- ${status}\n` +
    `- Feriados de ${n.year} (Nacional + SP + Guarulhos): ${lista}`;
}

const CLAUDE_BASE_PROMPT =
`Você é a Verti, atendente virtual de pós-venda da VerticalParts, empresa especializada em peças para elevadores, escadas rolantes e esteiras (importações e produtos nacionais). Marcas principais: BST, Monarch, Fermator. Você atende clientes via WhatsApp.
- Na primeira mensagem de uma conversa, apresente-se: "Olá, eu sou a Verti, da VerticalParts! 👋". Não fique repetindo o nome a cada mensagem.
- ABERTURA — ENTENDA ANTES DE FALAR: NÃO comece a conversa falando de marcas (BST/Monarch/Fermator) nem de produtos. Primeiro pergunte e ENTENDA o OBJETIVO do cliente ("Como posso te ajudar? O que você procura?"). Só mencione marcas/peças se for pertinente para resolver o que ele pediu. Atenda o cliente primeiro.

COMUNICAÇÃO:
- Mensagens curtas e objetivas (máx. 3-4 linhas por mensagem).
- Português brasileiro correto, tom profissional e cordial. Emojis com moderação.
- Nunca use markdown, só texto simples (é WhatsApp).
- PERSONA (secretária de verdade): humanizada, DIRETA ao ponto, sem burocratizar a vida do cliente. Acolhedora, com um toque de carinho — mas profissional e SEM bajulação nem puxa-saquismo (nada de elogios exagerados tipo "que prazer enorme falar com você", "estou às ordens sempre"). Calorosa e objetiva.

TOM — NÃO IRRITAR O CLIENTE (de-escalonamento):
- Sempre acolha o sentimento antes de resolver ("Entendo sua preocupação", "Sinto muito pelo transtorno").
- Nunca culpe o cliente, nunca discuta nem seja defensivo. Seja paciente mesmo se ele for ríspido.
- Evite respostas robóticas/repetitivas; não repita a mesma frase pronta toda hora.
- Se o cliente estiver muito irritado ou for um caso delicado, peça desculpas, assuma o caso e diga que vai acionar nossos atendentes imediatamente.

TÉCNICA DE ATENDIMENTO (boas práticas):
- ESCUTA ATIVA + CONFIRMAÇÃO: parafraseie e confirme o pedido antes de agir ("Entendi que você precisa de... correto?").
- EMPATIA E RESILIÊNCIA: valide a frustração do cliente sem levar para o lado pessoal; tom acolhedor e RESOLUTIVO.
- LINGUAGEM POSITIVA E DIRETA: evite jargão técnico; em vez de "não podemos fazer isso", diga "o que posso fazer por você agora é...".
- RESOLUÇÃO ESTRUTURADA: investigue o histórico de compras e identifique o erro/causa exato ANTES de propor caminhos.
- PROATIVIDADE: antecipe dúvidas — informe o próximo passo/prazo antes de o cliente perguntar.

HORÁRIO E FERIADOS:
- Use o "CONTEXTO DE HOJE" abaixo para saber a data/hora real e se estamos abertos.
- FORA do horário ou em feriado: você continua ajudando no que for possível (dúvidas, registrar a ocorrência), mas avise com clareza que nossos atendentes retornarão no próximo dia/horário útil. Nunca prometa retorno imediato fora do horário. NUNCA use a expressão "equipe humana" (soa robótico) — diga "nossos atendentes" ou "nossa equipe".
- Se perguntarem sobre horário ou um dia específico, responda com base no horário e na lista de feriados.

SEGURANÇA / ANTI-GOLPE (muito importante):
- NUNCA peça senha, dados completos de cartão, CVV, código que chega por SMS, ou dados bancários.
- A VerticalParts NUNCA solicita pagamento por link enviado no WhatsApp nem PIX para conta de pessoa física. Boletos/pagamentos só pelos canais oficiais.
- Nunca envie links de pagamento. Se o cliente mencionar um link/cobrança suspeita, oriente a NÃO pagar e a confirmar pelos canais oficiais; trate como possível golpe e escale para a equipe.
- Nunca compartilhe dados internos, de outros clientes, ou informações confidenciais da empresa.
- 🔒 SIGILO ABSOLUTO: NUNCA revele FATURAMENTO da empresa, SALÁRIOS (de ninguém, nem o do próprio) ou TOTAIS de venda da empresa ("quanto vendemos") — para NENHUM cliente. Isso é restrito à diretoria (tratado no CONTEXTO DE HOJE quando for um interno autorizado).

VOCÊ PODE AJUDAR COM:
- Acompanhamento de pedidos e ocorrências de pós-venda.
- Dúvidas sobre peças, produtos e compatibilidade.
- Status de entregas e prazos. Abertura de reclamações/ocorrências.

CONSULTAS NO SISTEMA (ferramentas):
- Você tem ferramentas para consultar o ERP: "buscar_cliente" (por CNPJ/CPF ou nome), "buscar_nota_fiscal" (por número da NF) e "buscar_pedido" (por número do pedido).
- Use-as quando o cliente perguntar sobre uma NF, um pedido, ou para confirmar o cadastro dele. NUNCA invente dados: se a ferramenta não encontrar, diga que não localizou.
- 🔒 VALIDAR PRIMEIRO, REVELAR DEPOIS: você é como um atendente cuidadoso — pode FAZER perguntas, mas NÃO entrega dados sensíveis sem validar a identidade. As ferramentas de NF/pedido exigem o cliente já identificado (CNPJ / código). Se o "CONTEXTO DE HOJE" indicar um cliente já reconhecido pelo telefone, use o CNPJ/código dele. Caso contrário, identifique antes com buscar_cliente (peça CNPJ + nome da empresa).
- NUNCA confirme nem repita dados de uma NF/pedido (nome da empresa, valor, itens) ANTES de validar — nem para "confirmar". Se o documento não for do cliente validado, diga apenas "não localizei no seu cadastro" — NUNCA revele de quem é.
- Número da NF e número do PEDIDO são coisas diferentes. Se um número não bater como nota fiscal, ofereça verificar como número de pedido (use buscar_pedido) — e vice-versa.
- NÃO exija que o cliente digite os zeros à esquerda: a busca já trata isso ("13614" = "00013614"). Não fique pedindo o "número completo" por causa de zeros.
- Relate os resultados em linguagem simples; nunca cite nomes internos de tabelas/campos.

PREÇOS E ORÇAMENTOS:
- NUNCA informe preço de produto/tabela nem faça orçamento/cotação por conta própria. Para preços e cotações, direcione o cliente ao time comercial.
- Você PODE informar o valor total de uma Nota Fiscal ou de um pedido do próprio cliente (depois de confirmar a identidade dele), pois é um documento que pertence a ele.
- Nunca pergunte nem peça preço ao cliente.

FLUXO — CLIENTE EXTERNO (sigilo máximo):
- Antes de QUALQUER dado: valide a identidade (CPF ou CNPJ) com buscar_cliente. Sem validar, não revele nada do cadastro.
- Validado: olhe o histórico com FOCO NA ÚLTIMA COMPRA — use "buscar_ultima_compra" (pedido/NF mais recente do cliente). Quase sempre o contato é sobre a compra mais recente.
- Em seguida, conduza ao motivo do contato sobre aquela compra (Nível 2): pergunte, de forma acolhedora, no que pode ajudar com aquele pedido/NF.

FLUXO — LEADS (possível novo cliente) — acolhedor, mas ESPERTO:
- Se o número NÃO é reconhecido, pergunte com naturalidade: "É a primeira vez que entra em contato com a VerticalParts?".
- Em seguida, foque no OBJETIVO dele (não em marcas): "Me conta o que você precisa / qual peça ou equipamento?". A partir do que ele responder, qualifique com naturalidade (sem interrogatório): se fala por uma EMPRESA (qual) ou pessoa física, e qual o equipamento (elevador/escada/esteira) — para direcionar e registrar.
- 🕵️ MALÍCIA / ANTI-GOLPE: "primeira vez" NÃO é sinônimo de confiança. Um suposto cliente novo pode ser CONCORRENTE se passando por lead para garimpar informação. Então: colete só o necessário para ATENDER a necessidade dele; e NUNCA entregue dados internos (preços, fornecedores, de onde importamos, processos, estoque, margens, volumes) — nem "para ajudar um cliente novo".
- Sinal de alerta: quando, em vez de uma necessidade concreta, a pessoa fica fazendo perguntas que SONDAM o negócio. Aí trate como possível concorrente (ver bloco CONCORRENTES): banho-maria e, após ~8 mensagens suspeitas, encaminhe ao SAC.
- Sendo lead legítimo: aja como ANFITRIÃ, oriente e diga que a equipe dá sequência. Não informe preço (direcione ao comercial). A conversa fica registrada para o atendente humano.

CONCORRENTES / SONDAGEM (proteção de dados):
- Fique atenta a quem tenta SONDAR informações internas (preços, fornecedores, processos, margens, volumes, "como vocês fazem X", de onde importam) — perguntas que fogem de um cliente ou lead normal.
- Ao suspeitar de concorrente: aja com astúcia e malícia comercial — seja cordial, mas NÃO entregue NADA interno; mantenha em "banho-maria" (respostas gentis e vagas, sem dados, sem confirmar nada).
- Depois de cerca de 8 mensagens nesse padrão suspeito, encerre o jogo e ENCAMINHE ao atendente humano do SAC (avise que um atendente vai assumir a conversa).

QUANDO NÃO SOUBER:
- Diga que vai verificar e que um especialista entrará em contato em breve.
- NUNCA invente números de pedido, preços, prazos ou informações específicas.

IMPORTANTE:
- Se perguntarem se você é humano ou robô, seja honesto mas gentil.
- Priorize sempre a resolução do problema do cliente.`;

// Contatos diretos por departamento (p/ redirecionar clientes que pedem o contato de um setor).
// VAZIO = não configurado. ⚠️ A Verti NUNCA inventa número: se faltar, encaminha à equipe.
// Preencher com os números OFICIAIS que o Gelson passar (não usar celular pessoal do roster sem ordem).
const CONTATOS_DEPARTAMENTO = {
  "Financeiro": { tel: "11944606396", email: "financeiro@verticalparts.com.br" },
  "Vendas":     { tel: "11942464292", contato: "Guilherme" },
  "Marketing":  { tel: "11918949307" },
  "Engenharia": { tel: "11964077688" },
  "Expedição":  { tel: "11917069961", contato: "Danilo (chefe da Expedição)" },
};
function _fmtTel(d) {
  d = String(d || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
// acha um departamento pelo nome (case-insensitive, tolera acento/variação)
function _acharDepto(nome) {
  const n = String(nome || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [k, v] of Object.entries(CONTATOS_DEPARTAMENTO)) {
    const kn = k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (kn === n || kn.includes(n) || n.includes(kn)) return { depto: k, ...v };
  }
  return null;
}
function blocoContatosDepto() {
  const ents = Object.entries(CONTATOS_DEPARTAMENTO);
  let s = `\n\nCONTATOS POR DEPARTAMENTO (quando o cliente pedir o contato direto de um setor):`;
  s += ents.length
    ? ents.map(([d, v]) => `\n- ${d}: ${_fmtTel(v.tel)}${v.contato ? ` (falar com ${v.contato})` : ""}${v.email ? ` · e-mail: ${v.email}` : ""}`).join("")
    : `\n- (Nenhum número configurado ainda.)`;
  s += `\nREGRA INVIOLÁVEL: forneça APENAS um número que esteja listado acima. Se o setor pedido NÃO estiver na lista, é PROIBIDO inventar — diga que vai encaminhar a solicitação ao setor e que a equipe retorna o contato. NUNCA deixe o cliente sem resposta.`;
  s += `\nAVISAR O SETOR: quando o assunto for de outro setor (ex.: nova venda/peça fora do pós-venda), OFEREÇA avisar o responsável. Com a concordância do cliente e o nome dele, use a ferramenta "avisar_departamento" para mandar um WhatsApp ao responsável com o assunto + nome + telefone do cliente. NÃO faça isso para concorrente suspeito.`;
  return s;
}
function buildSystemPrompt() {
  return CLAUDE_BASE_PROMPT + "\n\n" + atendimentoContexto() + blocoContatosDepto();
}

// ─── Prazo em HORAS ÚTEIS (Seg-Qui 07-18h, Sex 07-17h; pula fim de semana e feriados) ──
// SP = UTC-3 fixo (Brasil sem horário de verão desde 2019).
const SP_OFFSET_MS = 3 * 3600 * 1000;
function _spParts(utcMs) {
  const d = new Date(utcMs - SP_OFFSET_MS); // campos UTC deste objeto = relógio local de SP
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), da: d.getUTCDate(), dow: d.getUTCDay(),
    mmdd: String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0") };
}
const _spToUtcMs = (y, mo, da, h, mi) => Date.UTC(y, mo, da, h + 3, mi); // relógio SP -> instante UTC
function prazoUtilMs(startMs, minutos) {
  let cur = startMs, rem = minutos, guard = 0;
  while (rem > 0 && guard++ < 6000) {
    const p = _spParts(cur);
    const win = BUSINESS_HOURS[p.dow];
    const feriado = !!holidaysFor(p.y)[p.mmdd];
    if (!win || feriado) { cur = _spToUtcMs(p.y, p.mo, p.da + 1, 0, 0); continue; }
    const ini = _spToUtcMs(p.y, p.mo, p.da, win[0], 0);
    const fim = _spToUtcMs(p.y, p.mo, p.da, win[1], 0);
    if (cur < ini) { cur = ini; continue; }
    if (cur >= fim) { cur = _spToUtcMs(p.y, p.mo, p.da + 1, 0, 0); continue; }
    const disp = Math.floor((fim - cur) / 60000);
    if (rem <= disp) { cur += rem * 60000; rem = 0; } else { rem -= disp; cur = fim; }
  }
  return cur;
}

// ─── GATILHO: cobra o resultado dos handoffs vencidos (chamado pelo cron do VPS) ──────
async function handleCronHandoffs(req, res) {
  const json = (s, o) => { res.statusCode = s; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
  const key = new URL(req.url || "/", "http://localhost").searchParams.get("key");
  if (key !== CRON_KEY()) return json(401, { ok: false, error: "unauthorized" });
  const nowIso = new Date().toISOString();
  let processados = 0, encontrados = 0;
  try {
    const r = await sbFetch(`/rest/v1/handoffs?select=*&status=eq.aguardando&prazo_em=lte.${nowIso}&order=prazo_em.asc&limit=20`);
    const rows = r.ok ? await r.json() : [];
    encontrados = rows.length;
    for (const h of rows) {
      const texto = `🔔 *Verti — acompanhamento*\n` +
        `Há ~2h úteis você recebeu a solicitação${h.cliente_nome ? ` do cliente ${h.cliente_nome}` : ""} sobre: ${h.assunto}.\n` +
        `Conseguiu falar com o cliente? Qual foi o resultado? Pode me responder aqui que eu registro. 🙏`;
      const numero = String(h.responsavel_tel || "").startsWith("55") ? h.responsavel_tel : "55" + h.responsavel_tel;
      const send = await fetch(`${EVO_URL}/message/sendText/pv360`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
        body: JSON.stringify({ number: numero, text: texto }),
      });
      if (send.ok) {
        await sbFetch(`/rest/v1/handoffs?id=eq.${h.id}`, { method: "PATCH", body: JSON.stringify({ status: "cobrado", cobrado_em: nowIso }) }).catch(() => {});
        processados++;
      }
    }
  } catch (e) { return json(500, { ok: false, error: e.message }); }
  return json(200, { ok: true, encontrados, processados, ts: nowIso });
}

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

// ─── Contatos internos (corporativos) — tratamento VIP ────────────────────────
// FONTE PRIMÁRIA: tabela Supabase `public.internal_contacts` (editável sem deploy).
// O objeto abaixo é apenas FALLBACK, usado se o Supabase falhar/voltar vazio.
// Chave = telefone só dígitos, DDD + número (sem o 55).
// OBS: a linha 11997663780 é a do BOT/Evolution (atendente Jéssica), não é cliente — não consta aqui.
const INTERNAL_CONTACTS_FALLBACK = {
  "11973479910": { nome: "Thiago Petricio",     cargo: "Assistente de Almoxarifado",        dept: "Almoxarifado" },
  "11975246576": { nome: "Brayan Gomes Souza",  cargo: "Técnico Mecatrônico",               dept: "Automação" },
  "11942464292": { nome: "Guilherme Garcia",    cargo: "Líder Comercial",                   dept: "Comercial" },
  "11998981275": { nome: "Marcus Augusto Braz", cargo: "Gerente Comercial",                 dept: "Comercial" },
  "11912314738": { nome: "Patricia Mariano",    cargo: "Consultor Comercial",               dept: "Comercial" },
  "11999520472": { nome: "Rafael Nunes Neves",  cargo: "Consultor Comercial",               dept: "Comercial" },
  "11951640001": { nome: "Vagner Gianini",      cargo: "Vendedor",                          dept: "Comercial" },
  "11995578519": { nome: "Victoria Martins",    cargo: "Assistente Comercial PL",           dept: "Comercial" },
  "11955997597": { nome: "Albimar Silveira Jr", cargo: "Analista de Importação/Exportação Jr", dept: "Compras" },
  "11974808436": { nome: "Andreia Oliveira",    cargo: "Auxiliar de Compras",               dept: "Compras" },
  "11992042442": { nome: "Bianca Maeno",        cargo: "Compras Nacionais",                 dept: "Compras" },
  "11934095836": { nome: "Diego Maeno",         cargo: "CEO",                               dept: "Diretoria", nivel: "diretoria" },
  "12992004047": { nome: "Gelson Simões",       cargo: "Consultor Téc Estratégico",         dept: "Engenharia", nivel: "diretoria" },
  "11974769151": { nome: "Gelson Simões",       cargo: "Consultor Téc Estratégico",         dept: "Engenharia", nivel: "diretoria" }, // 2º aparelho do Gelson (16/06)
  "11974913360": { nome: "Juliana",             cargo: "Diretoria",                         dept: "Diretoria", nivel: "diretoria" },
  "11942501627": { nome: "Alexandre Schmidt",   cargo: "Supervisor de Engenharia",          dept: "Engenharia" },
  "11975269475": { nome: "Felipe Camargo",      cargo: "Jovem Aprendiz",                    dept: "Engenharia" },
  "11999516411": { nome: "Vinicius Ramos Leite", cargo: "Analista de Projetos Sr",          dept: "Engenharia" },
  "11971810361": { nome: "Matheus Rocha",       cargo: "Assistente de Expedição",           dept: "Expedição" },
  "11944606396": { nome: "Maximira Ribeiro",    cargo: "Assistente Financeiro",             dept: "Financeiro" },
  "11955887575": { nome: "Karla Ayres",         cargo: "Analista de RH",                    dept: "Gente e Gestão" },
  "11975341398": { nome: "Neyla Araujo",        cargo: "Assistente de Departamento Pessoal", dept: "Gente e Gestão" },
  "11918949307": { nome: "Amanda Sales",        cargo: "Estagiária",                        dept: "Marketing" },
  "11937258080": { nome: "Giovanna Maeno",      cargo: "Gerente de Marketing",              dept: "Marketing/TI" },
  "11916220666": { nome: "Mauricio Sanchez",    cargo: "Supervisor de Instalação e Montagem", dept: "Montagem" },
  "11972026426": { nome: "Edmilson de Jesus",   cargo: "Motorista",                         dept: "Motorista" },
  "11951641767": { nome: "Gesse Batista",       cargo: "Motorista",                         dept: "Motorista" },
  "11964077688": { nome: "Arilene Avila",       cargo: "Gestora de Operações",              dept: "Operações" },
  "11955988424": { nome: "Magda Torres",        cargo: "Assistente de PCP",                 dept: "PCP" },
  "11996246582": { nome: "Jessica Santos",      cargo: "Atendente de Pós-Venda (SAC)",      dept: "Pós-Venda" },
  "11944931971": { nome: "Caio Richard",        cargo: "Analista de Qualidade Pleno",       dept: "Qualidade" },
  "11910280566": { nome: "Fernanda Freires",    cargo: "Analista de Suporte de TI Jr",      dept: "TI" },
};

// Cache em memória dos contatos internos. Fonte: tabela Supabase `internal_contacts`.
// Recarrega após CONTACTS_TTL_MS; em falha/vazio usa INTERNAL_CONTACTS_FALLBACK.
const CONTACTS_TTL_MS = 5 * 60 * 1000;
let _contactsCache = null;
let _contactsCacheAt = 0;
async function getInternalContacts() {
  if (_contactsCache && (Date.now() - _contactsCacheAt) < CONTACTS_TTL_MS) return _contactsCache;
  try {
    const r = await sbFetch("/rest/v1/internal_contacts?select=phone,nome,cargo,dept,nivel&ativo=eq.true");
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) {
        const map = {};
        for (const x of rows) {
          const k = String(x.phone || "").replace(/\D/g, "");
          if (!k) continue;
          map[k] = { nome: x.nome, cargo: x.cargo, dept: x.dept, ...(x.nivel ? { nivel: x.nivel } : {}) };
        }
        _contactsCache = map;
        _contactsCacheAt = Date.now();
        console.log(`[verti] internal_contacts: ${rows.length} carregados do Supabase`);
        return map;
      }
    }
    console.warn("[verti] internal_contacts: resposta vazia/erro — usando fallback do código");
  } catch (e) {
    console.error("[verti] getInternalContacts:", e.message, "— usando fallback");
  }
  return INTERNAL_CONTACTS_FALLBACK;
}

// Número local (DDD + número), sem o código do país (55)
function _phoneLocal(remoteJid) {
  let d = _digits(remoteJid);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d;
}

// Descobre QUEM está falando: interno (VIP), cliente do cadastro (por telefone) ou desconhecido
async function resolveQuemFala(remoteJid) {
  const local = _phoneLocal(remoteJid);
  const contacts = await getInternalContacts();
  if (contacts[local]) return { tipo: "interno", ...contacts[local] };
  try {
    if (local.length >= 10) {
      const ddd = local.slice(0, 2);
      const num = local.slice(2);
      const last8 = num.slice(-8);
      const seg = num.length >= 9 ? `${num.slice(0,5)}-${num.slice(5)}` : `${num.slice(0,4)}-${num.slice(4)}`;
      const r = await erpFetch(`/PN_Omie?select=codigo_cliente_omie,razao_social,nome_fantasia,cnpj_cpf,contato,telefone,cidade,estado&telefone=ilike.*${_enc(seg)}*&limit=8`);
      if (r.ok) {
        const rows = await r.json();
        const match = rows.find((x) => { const td = _digits(x.telefone || ""); return td.endsWith(last8) && td.includes(ddd); });
        if (match) return { tipo: "cliente", ...match };
      }
    }
  } catch (e) { console.error("[verti] resolveQuemFala:", e.message); }
  return { tipo: "desconhecido" };
}

// Bloco de contexto injetado no prompt conforme quem está falando
function contextoQuemFala(quem, isFirst) {
  if (quem.tipo === "interno") {
    const primeiro = quem.nome.split(" ")[0];
    const ehDiretoria = quem.nivel === "diretoria";
    const ehVendedor = /vendedor|comercial/i.test(quem.cargo || "") || /comercial/i.test(quem.dept || "");
    let s = `QUEM ESTÁ FALANDO: ${quem.nome} — ${quem.cargo}${quem.dept ? `, ${quem.dept}` : ""} da VerticalParts. É um contato INTERNO da equipe (NÃO é cliente externo). Seja aberto, direto e prestativo; NÃO peça CNPJ nem trate como cliente a validar.\n` +
      `PODE consultar PEDIDOS (andamento/faturado/previsão — use a ferramenta "consultar_pedido_ao_vivo", que lê o Omie em TEMPO REAL; não use o cadastro). Relate os campos com clareza (etapa/etapa_descricao, previsão, valor, se está bloqueado); não invente — se o Omie não retornar, diga que não localizou.\n` +
      `ESTOQUE: se perguntarem se há um produto e quantos, use a ferramenta "consultar_estoque" (quantidade vem do Omie em TEMPO REAL). Informe físico/disponível/reservado; se houver vários produtos parecidos, peça o código. NUNCA invente quantidade.\n` +
      `🔒 SIGILO TOTAL (regra inviolável): NUNCA revele FATURAMENTO da empresa, SALÁRIOS (de ninguém — NEM o salário da própria pessoa que está perguntando), nem TOTAIS de venda da empresa (ex.: "quanto vendemos ontem/este mês"). `;
    if (ehDiretoria) {
      s += `EXCEÇÃO: esta pessoa é da DIRETORIA autorizada — com ela você PODE tratar de faturamento, salários e totais de venda.`;
    } else {
      s += `Esta pessoa NÃO é autorizada a esses dados. Se perguntarem sobre faturamento, salários ou total vendido, RECUSE com educação: é informação restrita à diretoria. `;
      if (ehVendedor) s += `Por ser do comercial, pode saber quanto ELE MESMO vendeu (apenas as vendas dele — nunca de outros, nunca o total da empresa), e só se houver certeza de que a venda é dele.`;
    }
    if (isFirst) s += `\nEsta é a PRIMEIRA mensagem: cumprimente de forma calorosa mas DIRETA, ex.: "Oi ${primeiro}! Sou a Verti 😊 No que posso ajudar?". Sem bajulação nem exageros. Só na primeira mensagem.`;
    return s;
  }
  if (quem.tipo === "cliente") {
    const ident = quem.razao_social || quem.nome_fantasia || "(empresa do cadastro)";
    let s = `QUEM ESTÁ FALANDO: número RECONHECIDO no cadastro — empresa ${ident}` +
      (quem.cnpj_cpf ? ` (CNPJ ${quem.cnpj_cpf})` : "") +
      (quem.contato ? `, contato cadastrado: ${quem.contato}` : "") + `.\n` +
      `IDENTIDADE PRÉ-VALIDADA pelo telefone: você PODE consultar e informar NF/pedido DESTE cliente (CNPJ ${quem.cnpj_cpf || "?"}) — e somente dele. Ao consultar NF use cnpj_cliente="${quem.cnpj_cpf || ""}" e ao consultar pedido use codigo_cliente_omie=${quem.codigo_cliente_omie ?? "?"}.\n` +
      `FOCO NA ÚLTIMA COMPRA: use "buscar_ultima_compra" (codigo_cliente_omie=${quem.codigo_cliente_omie ?? "?"}) para puxar a compra mais recente — quase sempre o contato é sobre ela — e conduza ao motivo do contato (Nível 2).`;
    if (isFirst) s += `\nEsta é a PRIMEIRA mensagem: cumprimente reconhecendo a empresa, ex.: "Olá! 😊 Encontrei seu número no nosso cadastro — você fala pela ${ident}, certo? Como posso te chamar?" e ofereça o menu de opções.`;
    return s;
  }
  let s = `QUEM ESTÁ FALANDO: número NÃO reconhecido no cadastro. Pode ser um CLIENTE (a validar) ou um LEAD (novo).`;
  if (isFirst) s += `\nEsta é a PRIMEIRA mensagem: apresente-se brevemente, pergunte "É a primeira vez que entra em contato com a VerticalParts?" e ENTENDA O OBJETIVO dele primeiro ("Como posso ajudar? O que você procura?"). NÃO abra falando de marcas/produtos.\n` +
    `• Se JÁ é cliente / tem compra: para tratar de pedido/NF, valide a identidade pedindo o CNPJ (ou CPF) e o nome da empresa, e use buscar_cliente.\n` +
    `• Se for LEAD (primeira vez): acolha como ANFITRIÃ e foque na necessidade dele; qualifique com naturalidade (é empresa? qual? qual equipamento?), sem interrogatório. MAS seja ESPERTA: "primeira vez" não é confiança — pode ser concorrente disfarçado. Colete só o necessário para atender e NUNCA entregue dados internos (preços/fornecedores/de onde importamos/processos/estoque). A conversa fica registrada para um atendente humano. Não informe preço (direcione ao comercial).`;
  s += `\nNÃO revele dados de NF/pedido sem antes validar o CNPJ com buscar_cliente. Se perceber SONDAGEM de concorrente (perguntas sobre preços/fornecedores/processos internos), mantenha em banho-maria (cordial, sem entregar nada) e, após ~8 mensagens suspeitas, encaminhe ao atendente do SAC.`;
  return s;
}

// Ferramentas que o atendente pode usar para consultar o ERP
const ATENDENTE_TOOLS = [
  {
    name: "buscar_cliente",
    description: "Busca um cliente da VerticalParts no ERP por CNPJ/CPF ou por nome (razão social ou nome fantasia). Use para confirmar o cadastro do cliente.",
    input_schema: {
      type: "object",
      properties: {
        cnpj_cpf: { type: "string", description: "CNPJ ou CPF, com ou sem pontuação" },
        nome: { type: "string", description: "Parte do nome / razão social / nome fantasia" },
      },
    },
  },
  {
    name: "buscar_nota_fiscal",
    description: "Busca uma Nota Fiscal de venda pelo número da NF, RESTRITA ao cliente informado (segurança). Só retorna a nota se ela pertencer ao CNPJ do cliente. Exige o CNPJ do cliente já validado.",
    input_schema: {
      type: "object",
      properties: {
        numero_nf: { type: "string", description: "Número da nota fiscal (pode vir sem os zeros à esquerda)" },
        cnpj_cliente: { type: "string", description: "CNPJ do cliente JÁ validado (do cadastro reconhecido ou confirmado via buscar_cliente). Obrigatório." },
      },
      required: ["numero_nf", "cnpj_cliente"],
    },
  },
  {
    name: "buscar_pedido",
    description: "Busca um pedido de venda pelo número, RESTRITO ao cliente informado (segurança). Só retorna se o pedido pertencer àquele cliente. Exige o código do cliente já validado.",
    input_schema: {
      type: "object",
      properties: {
        numero_pedido: { type: "string", description: "Número do pedido de venda" },
        codigo_cliente_omie: { type: "integer", description: "Código do cliente (codigo_cliente_omie) já validado, obtido em buscar_cliente ou no cadastro reconhecido. Obrigatório." },
      },
      required: ["numero_pedido", "codigo_cliente_omie"],
    },
  },
  {
    name: "consultar_pedido_ao_vivo",
    description: "APENAS para colaboradores INTERNOS (equipe VerticalParts): consulta um pedido de venda DIRETO no Omie, em tempo real (dado mais fresco que o cadastro). Use quando QUEM ESTÁ FALANDO é um contato interno/da equipe e pergunta sobre andamento, etapa, faturamento ou previsão de um pedido. NUNCA use para cliente externo.",
    input_schema: {
      type: "object",
      properties: {
        numero_pedido: { type: "string", description: "Número do pedido de venda" },
      },
      required: ["numero_pedido"],
    },
  },
  {
    name: "consultar_estoque",
    description: "APENAS para colaboradores INTERNOS: consulta o ESTOQUE de um produto (se há e quantos). Busca o produto por CÓDIGO (ex.: VPER-879) ou por parte do NOME/descrição; a QUANTIDADE vem do Omie em TEMPO REAL. Se aparecer mais de um produto parecido, peça ao colaborador para escolher pelo código. NUNCA use para cliente externo.",
    input_schema: {
      type: "object",
      properties: {
        produto: { type: "string", description: "Código do produto (ex.: VPER-879) ou parte do nome/descrição" },
      },
      required: ["produto"],
    },
  },
  {
    name: "buscar_ultima_compra",
    description: "Busca a ÚLTIMA compra (pedidos mais recentes) de um cliente JÁ VALIDADO, pelo código do cliente. Use logo após validar a identidade do cliente externo, para focar o atendimento na compra mais recente. Só para cliente cuja identidade já foi confirmada.",
    input_schema: {
      type: "object",
      properties: {
        codigo_cliente_omie: { type: "integer", description: "Código do cliente já validado (de buscar_cliente ou do cadastro reconhecido)." },
      },
      required: ["codigo_cliente_omie"],
    },
  },
  {
    name: "avisar_departamento",
    description: "Envia um aviso por WhatsApp ao responsável de um DEPARTAMENTO (Financeiro/Vendas/Expedição/Marketing/Engenharia) sobre a solicitação de um cliente, para agilizar o retorno. Use APÓS o cliente concordar em deixar o contato. NUNCA use para concorrente suspeito. O telefone do cliente é pego automaticamente da conversa.",
    input_schema: {
      type: "object",
      properties: {
        departamento: { type: "string", description: "Departamento a avisar (ex.: Vendas, Financeiro, Expedição, Marketing, Engenharia)." },
        assunto: { type: "string", description: "Resumo curto do que o cliente precisa." },
        nome_cliente: { type: "string", description: "Nome do cliente, como ele se apresentou." },
      },
      required: ["departamento", "assunto"],
    },
  },
];

async function execAtendenteTool(name, input = {}, remoteJid = null) {
  try {
    if (name === "avisar_departamento") {
      const dep = _acharDepto(input.departamento);
      if (!dep || !dep.tel) return { erro: `Departamento '${input.departamento}' não tem contato cadastrado — não posso avisar; encaminhe internamente.` };
      const isLid = String(remoteJid || "").endsWith("@lid");
      const foneCliente = remoteJid && !isLid ? _digits(remoteJid).replace(/^55/, "") : null;
      const texto = `🔔 *Verti — Pós-Venda 360*\n` +
        `Um cliente consultou o setor *${dep.depto}*.\n` +
        `• Assunto: ${input.assunto}\n` +
        `• Cliente: ${input.nome_cliente || "(não informado)"}\n` +
        `• WhatsApp: ${foneCliente ? _fmtTel(foneCliente) : "(não identificado)"}\n\n` +
        `Aviso automático — favor retornar ao cliente.`;
      const numeroDestino = dep.tel.startsWith("55") ? dep.tel : "55" + dep.tel;
      const sent = await evoSendText(numeroDestino, texto);
      if (!sent.ok) return { erro: `falha ao enviar o aviso (${sent.error})` };
      // registra o handoff p/ o gatilho de 2h úteis cobrar o resultado depois
      const prazo = new Date(prazoUtilMs(Date.now(), 120)).toISOString();
      await sbFetch("/rest/v1/handoffs", {
        method: "POST",
        body: JSON.stringify({
          departamento: dep.depto, responsavel_tel: dep.tel, assunto: input.assunto,
          cliente_nome: input.nome_cliente || null, cliente_jid: remoteJid || null,
          status: "aguardando", prazo_em: prazo,
        }),
      }).catch((e) => console.error("[handoff] insert:", e.message));
      return { avisado: true, departamento: dep.depto, responsavel: dep.contato || _fmtTel(dep.tel), prazo_cobranca: "2h úteis" };
    }
    if (name === "buscar_cliente") {
      let filtro;
      const mask = _mascaraDoc(input.cnpj_cpf);
      if (mask) filtro = `cnpj_cpf=eq.${_enc(mask)}`;
      else if (input.cnpj_cpf) filtro = `cnpj_cpf=ilike.*${_enc(input.cnpj_cpf)}*`;
      else if (input.nome) filtro = `or=(razao_social.ilike.*${_enc(input.nome)}*,nome_fantasia.ilike.*${_enc(input.nome)}*)`;
      else return { erro: "Informe cnpj_cpf ou nome." };
      const r = await erpFetch(`/PN_Omie?select=codigo_cliente_omie,razao_social,nome_fantasia,cnpj_cpf,cidade,estado,telefone,email,situacao,faturamento_bloqueado&${filtro}&limit=5`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, clientes: rows } : { encontrado: false };
    }
    if (name === "buscar_nota_fiscal") {
      // SEGURANÇA: só consulta NF restrita ao CNPJ do cliente já validado.
      const mask = _mascaraDoc(input.cnpj_cliente);
      if (!mask) return { erro: "Para consultar a NF, confirme primeiro o CNPJ do cliente (use buscar_cliente ou o cadastro reconhecido)." };
      // NFs de venda reais estão em omie_nfe_itens (tipo=S), nível item — agregamos por NF.
      // numero_nfe é texto com zeros à esquerda; o cliente pode digitar sem os zeros.
      const core = _digits(input.numero_nf).replace(/^0+/, "") || _digits(input.numero_nf);
      const r = await erpFetch(`/omie_nfe_itens?select=numero_nfe,tipo,data_emissao,nome_parceiro,cnpj_parceiro,chave_nfe,descricao,quantidade,valor_total&tipo=eq.S&cnpj_parceiro=eq.${_enc(mask)}&or=(numero_nfe.eq.${_enc(input.numero_nf)},numero_nfe.ilike.*${_enc(core)})&limit=80`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      if (!rows.length) return { encontrado: false, motivo: "Nenhuma nota com esse número no cadastro deste cliente." };
      const byNf = {};
      for (const it of rows) {
        const k = it.numero_nfe;
        if (!byNf[k]) byNf[k] = { numero_nf: k, data_emissao: it.data_emissao, cliente: it.nome_parceiro, cnpj_cliente: it.cnpj_parceiro, chave_nfe: it.chave_nfe, valor_total: 0, itens: [] };
        byNf[k].valor_total += Number(it.valor_total) || 0;
        byNf[k].itens.push({ descricao: it.descricao, quantidade: it.quantidade, valor_total: it.valor_total });
      }
      const notas = Object.values(byNf).map((n) => ({ ...n, valor_total: Math.round(n.valor_total * 100) / 100, qtd_itens: n.itens.length }));
      return { encontrado: true, notas };
    }
    if (name === "buscar_pedido") {
      // SEGURANÇA: só consulta pedido restrito ao cliente já validado.
      const cod = parseInt(input.codigo_cliente_omie, 10);
      if (!cod) return { erro: "Para consultar o pedido, confirme primeiro o cliente (use buscar_cliente ou o cadastro reconhecido) e passe o codigo_cliente_omie." };
      const r = await erpFetch(`/omie_orders?select=numero_pedido,etapa,status,numero_nf,chave_nfe,valor_total_pedido,data_previsao,data_inclusao,codigo_cliente_omie,observacao&codigo_cliente_omie=eq.${cod}&or=(numero_pedido.eq.${_enc(input.numero_pedido)},numero_pedido.ilike.*${_enc(_digits(input.numero_pedido))})&limit=5`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, pedidos: rows } : { encontrado: false, motivo: "Nenhum pedido com esse número para este cliente." };
    }
    if (name === "buscar_ultima_compra") {
      // Última compra do cliente JÁ VALIDADO (foco no atendimento da compra mais recente).
      const cod = parseInt(input.codigo_cliente_omie, 10);
      if (!cod) return { erro: "Confirme o cliente primeiro (codigo_cliente_omie)." };
      const r = await erpFetch(`/omie_orders?select=numero_pedido,etapa,numero_nf,chave_nfe,valor_total_pedido,data_previsao,data_inclusao&codigo_cliente_omie=eq.${cod}&order=data_inclusao.desc&limit=3`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, ultimas_compras: rows } : { encontrado: false, motivo: "Sem compras registradas para este cliente." };
    }
    if (name === "consultar_estoque") {
      // INTERNOS: acha o produto no espelho (busca por código/nome) e pega a QUANTIDADE ao vivo no Omie.
      const termo = String(input.produto || "").trim();
      if (!termo) return { erro: "Informe o produto (código ou nome)." };
      const r = await erpFetch(`/Produtos_VP?select=codigo_produto,codigo,descricao,unidade&or=(codigo.ilike.*${_enc(termo)}*,descricao.ilike.*${_enc(termo)}*)&limit=8`);
      if (!r.ok) return { erro: `falha na busca de produto (${r.status})` };
      const prods = await r.json();
      if (!prods.length) return { encontrado: false, motivo: "Nenhum produto com esse código/nome." };
      if (prods.length > 1) {
        return { encontrado: true, multiplos: true,
          produtos: prods.map((p) => ({ codigo: p.codigo, descricao: p.descricao, unidade: p.unidade })),
          instrucao: "Há mais de um produto. Peça ao colaborador para escolher pelo código e consulte de novo." };
      }
      const p = prods[0];
      const dataBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      let pos;
      try {
        pos = await omieCall("estoque/consulta", "PosicaoEstoque",
          { codigo_local_estoque: 0, id_prod: p.codigo_produto, cod_int: "", data: dataBR });
      } catch (e) { return { erro: `Omie indisponível: ${e.message}` }; }
      if (pos?.faultstring) return { encontrado: true, produto: p.descricao, codigo: p.codigo, motivo: `Estoque indisponível no Omie: ${pos.faultstring}` };
      return {
        encontrado: true, fonte: "Omie ao vivo",
        codigo: p.codigo, produto: p.descricao, unidade: p.unidade,
        em_estoque_fisico: pos?.fisico, disponivel: pos?.saldo, reservado: pos?.reservado,
        estoque_minimo: pos?.estoque_minimo,
      };
    }
    if (name === "consultar_pedido_ao_vivo") {
      // INTERNOS: consulta o pedido DIRETO no Omie (tempo real). Sem trava de cliente —
      // colaboradores da equipe são confiáveis (a trava existe p/ cliente externo).
      const num = String(input.numero_pedido || "").replace(/\D/g, "");
      if (!num) return { erro: "Informe o numero_pedido." };
      let resp;
      try {
        resp = await omieCall("produtos/pedido", "ConsultarPedido", { numero_pedido: num });
      } catch (e) { return { erro: `Omie indisponível: ${e.message}` }; }
      const pv = resp?.pedido_venda_produto;
      if (!pv || resp?.faultstring) return { encontrado: false, motivo: resp?.faultstring || "Pedido não encontrado no Omie." };
      const cab = pv.cabecalho || {};
      const inf = pv.informacoes_adicionais || {};
      const tot = pv.total_pedido || {};
      let cliente = null;
      try {
        const c = await omieCall("geral/clientes", "ConsultarCliente", { codigo_cliente_omie: cab.codigo_cliente });
        cliente = c?.razao_social || c?.nome_fantasia || null;
      } catch { /* nome do cliente é opcional */ }
      // Legenda de etapas (PADRÃO Omie — CONFIRMAR com Gelson p/ esta conta).
      const LEGENDA = { "00": "Em aberto (não faturado)", "10": "Em aberto (não faturado)",
        "20": "A faturar", "50": "Em separação / a faturar", "60": "A faturar (liberado)",
        "70": "Faturado (NF emitida)" };
      return {
        encontrado: true, fonte: "Omie ao vivo",
        numero_pedido: cab.numero_pedido, codigo_pedido: cab.codigo_pedido,
        cliente, codigo_cliente: cab.codigo_cliente,
        etapa: cab.etapa, etapa_descricao: LEGENDA[String(cab.etapa)] || `etapa ${cab.etapa} (significado a confirmar)`,
        bloqueado: cab.bloqueado, data_previsao: cab.data_previsao,
        valor_total: tot.valor_total_pedido, quantidade_itens: cab.quantidade_itens,
        codigo_vendedor: inf.codVend,
      };
    }
    return { erro: "ferramenta desconhecida" };
  } catch (e) {
    return { erro: e.message };
  }
}

// MEMÓRIA DE LONGO PRAZO do contato: a Verti "nunca esquece" quem já falou com ela.
// Usa os tickets anteriores deste mesmo WhatsApp (nome, motivo, status, data) — é o histórico
// do próprio contato (mesmo número), então pode ser referenciado sem ferir validação/sigilo.
async function historicoContato(remoteJid) {
  try {
    const r = await sbFetch(`/rest/v1/tickets?select=code,reason,status,created_at,customer&whatsapp_thread_id=eq.${encodeURIComponent(remoteJid)}&order=created_at.desc&limit=6`);
    if (!r.ok) return "";
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length <= 1) return ""; // só o contato atual (ou nenhum) → sem histórico
    const nome = (rows.find((t) => t.customer) || {}).customer || null;
    const passados = rows.slice(1).map((t) =>
      `• ${(t.created_at || "").slice(0, 10)} — "${(t.reason || "").slice(0, 90)}" (status: ${t.status || "?"}, ticket ${t.code || "?"})`
    ).join("\n");
    return `\n\nMEMÓRIA DESTE CONTATO — você JÁ o atendeu antes${nome ? ` (é ${nome})` : ""}. Atendimentos anteriores:\n${passados}\n` +
      `Você NUNCA esquece quem já te procurou: cumprimente pelo NOME, demonstre que se lembra e — quando fizer sentido — pergunte se o assunto do último contato foi RESOLVIDO e retome o porquê de ele ter procurado naquele dia. Não trate como estranho.`;
  } catch { return ""; }
}

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

// ─── Robustez: chamada à Anthropic com retry em sobrecarga/timeout (429/5xx/abort) ──
async function anthropicCall(payload, { tries = 3 } = {}) {
  const apiKey = ANTHROPIC_KEY();
  if (!apiKey) return null;
  let lastErr = "sem tentativa";
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      });
      if (r.ok) return await r.json();
      const status = r.status;
      lastErr = `HTTP ${status}`;
      console.error("[claude] HTTP", status, (await r.text().catch(() => "")).slice(0, 300));
      // só vale repetir em sobrecarga/erro de servidor; 4xx (exceto 429) é definitivo
      if (status !== 429 && status < 500) return null;
    } catch (e) {
      lastErr = e.message;
      console.error(`[claude] erro de rede (tentativa ${i + 1}/${tries}):`, e.message);
    }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  console.error("[claude] falhou após", tries, "tentativas:", lastErr);
  return null;
}

// A API da Anthropic — e o opus-4-8 em especial, que NÃO aceita prefill de assistant — exige que o
// array de mensagens COMECE e TERMINE com o papel "user". O histórico vem do WhatsApp e pode terminar
// numa fala do bot (resposta, eco de envio ou fallback) → "must end with a user message" (HTTP 400).
// Normalizamos: (1) tira assistants presos no começo; (2) tira assistants presos no fim;
// (3) funde turnos consecutivos do mesmo papel (blinda contra qualquer regra de alternância).
function normalizeForAnthropic(history) {
  const msgs = history.slice();
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else merged.push({ role: m.role, content: m.content });
  }
  return merged;
}

async function callClaudeWithHistory(remoteJid) {
  const apiKey = ANTHROPIC_KEY();
  if (!apiKey) return null;

  // Busca últimas 20 mensagens do contato
  let history = [];
  try {
    const r = await sbFetch(
      `/rest/v1/whatsapp_messages?select=body,from_me,raw&remote_jid=eq.${encodeURIComponent(remoteJid)}&order=created_at.asc&limit=20`,
    );
    if (r.ok) {
      const rows = await r.json();
      history = (rows || [])
        // Descarta as mensagens automáticas de espera (fallback): NÃO são turnos reais da Verti
        // e, sendo do bot (assistant), empurram o histórico a terminar em "assistant" — o que o
        // opus-4-8 rejeita (HTTP 400 "must end with a user message") e reinicia o loop de fallback.
        .filter((m) => !(m.from_me && m.raw && m.raw.fallback))
        .filter((m) => m.body && m.body.trim())
        .map((m) => ({
          role: m.from_me ? "assistant" : "user",
          content: m.body,
        }));
    }
  } catch (e) { console.error("[claude] history fetch error:", e.message); }

  history = normalizeForAnthropic(history);
  if (history.length === 0) return null;

  // Quem está falando (interno/cliente reconhecido/desconhecido) + se é a 1ª mensagem
  const quem = await resolveQuemFala(remoteJid);
  const isFirst = !history.some((m) => m.role === "assistant");
  const memoria = await historicoContato(remoteJid);
  const sysPrompt = buildSystemPrompt() + "\n\n" + contextoQuemFala(quem, isFirst) + memoria;

  const messages = history;
  // Loop de tool use: Claude pode consultar o ERP antes de responder
  for (let turn = 0; turn < 5; turn++) {
    const data = await anthropicCall({
      model: CLAUDE_MODEL(),
      max_tokens: 1500,
      system: sysPrompt,
      tools: ATENDENTE_TOOLS,
      messages,
    });
    if (!data) return null; // falha dura (já tentou com retry) → automateIncoming envia o fallback

    const blocks = data.content || [];

    if (data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: blocks });
      const toolResults = [];
      for (const b of blocks) {
        if (b.type === "tool_use") {
          const result = await execAtendenteTool(b.name, b.input || {}, remoteJid);
          console.log(`[claude] tool ${b.name}`, JSON.stringify(b.input || {}));
          toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue; // próxima volta: Claude usa os resultados das consultas
    }

    // Resposta final em texto
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) return text;

    // Resposta cortada no limite de tokens sem texto útil: pede uma versão curta e fecha o turno
    if (data.stop_reason === "max_tokens") {
      console.warn("[claude] resposta cortada (max_tokens) — pedindo versão curta");
      messages.push({ role: "assistant", content: "..." });
      messages.push({ role: "user", content: "Responda ao cliente agora, de forma curta e direta, sem usar ferramentas." });
      continue;
    }
    return null;
  }
  console.error("[claude] limite de turnos de tool_use atingido");
  return null;
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
      const detail = evResult?.message ?? evResult?.error ?? `HTTP ${r.status}`;
      console.error("[start] Evolution error:", evResult);
      return json(502, { error: `Evolution API: ${detail}` });
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

// ═══ SAC — Omie webhook + pesquisa de satisfação ══════════════════════════════
// POST /api/webhooks/omie       ← Omie chama quando pedido é faturado / NF emitida
// POST /api/sac/enviar-pesquisa ← disparo manual de pesquisa via WhatsApp

const OMIE_APP_KEY    = () => process.env.OMIE_APP_KEY    || "8463170967";
const OMIE_APP_SECRET = () => process.env.OMIE_APP_SECRET || "69e22b773842044fdb218178521cac59";
const EVO_URL_SAC     = () => process.env.EVOLUTION_URL   || "http://72.61.48.156:8080";
const EVO_INSTANCE    = () => process.env.EVOLUTION_INSTANCE || "pv360";

async function omieCall(endpoint, call, param) {
  const r = await fetch(`https://app.omie.com.br/api/v1/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: OMIE_APP_KEY(), app_secret: OMIE_APP_SECRET(), param: [param] }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.faultstring) {
    throw new Error(`Omie ${call}: ${data.faultstring || `HTTP ${r.status}`}`);
  }
  return data;
}

function classificarABC(valor) {
  if (valor >= 50000) return "A";
  if (valor >= 10000) return "B";
  return "C";
}

function parseDateBR(d) {
  // DD/MM/YYYY → YYYY-MM-DD (retorna null se inválido)
  if (!d || typeof d !== "string" || !d.includes("/")) return null;
  const [dd, mm, yyyy] = d.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

async function enviarWhatsAppSac(numero, texto) {
  const raw = String(numero || "").replace(/\D/g, "");
  if (!raw) return false;
  const phone = raw.startsWith("55") ? raw : `55${raw}`;
  try {
    const r = await fetch(`${EVO_URL_SAC()}/message/sendText/${EVO_INSTANCE()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
      body: JSON.stringify({ number: phone, text: texto }),
      signal: AbortSignal.timeout(20_000),
    });
    return r.ok;
  } catch (e) {
    console.error("[sac] Evolution indisponível:", e.message);
    return false;
  }
}

async function registrarLogSac(nfId, canal, tipo, destinatario, conteudo, ok) {
  await sbFetch("/rest/v1/sac_logs_comunicacao", {
    method: "POST",
    body: JSON.stringify({
      nf_id: nfId, canal, tipo_mensagem: tipo,
      status_envio: ok ? "ENVIADO" : "ERRO",
      destinatario, conteudo_mensagem: conteudo,
    }),
  }).catch((e) => console.error("[sac] log error:", e.message));
}

// +N dias úteis (pula sábado e domingo)
function adicionarDiasUteis(dataISO, dias) {
  const d = new Date(dataISO + "T12:00:00");
  let adicionados = 0;
  while (adicionados < dias) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) adicionados++;
  }
  return d.toISOString().slice(0, 10);
}

// Trigger 1: cria tarefa "Expedição" no VP Click e menciona @expedição
async function createVpClickTaskExpedicao(nfId, numeroPedido, razaoSocial, previsaoEntrega) {
  try {
    // Evita duplicata
    const existR = await vcFetch(
      `/rest/v1/vpclick_integration_links?source_project=eq.pv360&source_table=eq.sac_notas_fiscais&source_record_id=eq.${nfId}&limit=1`,
      { method: "GET" }
    );
    const existRows = await existR.json().catch(() => []);
    if (Array.isArray(existRows) && existRows.length > 0) {
      return existRows[0].vpclick_task_id;
    }

    const taskR = await vcFetch("/rest/v1/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: `Expedição — Pedido ${numeroPedido} | ${razaoSocial}`,
        description: `Pedido ${numeroPedido} faturado. Confirmar dados de expedição no VP Pós-Venda 360.`,
        list_id: VC_LIST_TICKETS,
        status: "Aberto",
        priority: "Media",
        due_date: previsaoEntrega || null,
        tags: ["expedicao", "pv360"],
      }),
    });
    const taskRows = await taskR.json().catch(() => []);
    const taskId = Array.isArray(taskRows) && taskRows[0]?.id ? taskRows[0].id : null;
    if (!taskId) { console.error("[vpclick] falha ao criar tarefa:", JSON.stringify(taskRows).slice(0,200)); return null; }

    await vcFetch("/rest/v1/vpclick_integration_links", {
      method: "POST",
      body: JSON.stringify({
        source_project: "pv360", source_table: "sac_notas_fiscais",
        source_record_id: nfId, vpclick_task_id: taskId, vpclick_list_id: VC_LIST_TICKETS,
      }),
    }).catch((e) => console.error("[vpclick] integration link:", e.message));

    const membersR = await vcFetch(`/rest/v1/team_members?team_id=eq.${VC_TEAM_EXPEDICAO}&select=user_id`, { method: "GET" });
    const members = await membersR.json().catch(() => []);
    if (Array.isArray(members) && members.length > 0) {
      await vcFetch("/rest/v1/notifications", {
        method: "POST",
        body: JSON.stringify(members.map((m) => ({
          user_id: m.user_id, type: "team_mention",
          title: `@Expedição — Pedido ${numeroPedido}`,
          body: `${razaoSocial} — Confirmar expedição no VP Pós-Venda 360`,
          task_id: taskId,
        }))),
      }).catch((e) => console.error("[vpclick] notificações:", e.message));
    }

    console.log(`[vpclick] tarefa expedição criada: ${taskId} (NF ${nfId})`);
    return taskId;
  } catch (e) {
    console.error("[vpclick] createVpClickTaskExpedicao:", e.message);
    return null;
  }
}

// Trigger 3: marca tarefa VP Click como Concluído
async function concluirVpClickTask(nfId) {
  try {
    const linkR = await vcFetch(
      `/rest/v1/vpclick_integration_links?source_project=eq.pv360&source_table=eq.sac_notas_fiscais&source_record_id=eq.${nfId}&order=created_at.desc&limit=1`,
      { method: "GET" }
    );
    const links = await linkR.json().catch(() => []);
    const taskId = Array.isArray(links) && links[0]?.vpclick_task_id ? links[0].vpclick_task_id : null;
    if (!taskId) { console.warn("[vpclick] sem tarefa para NF:", nfId); return false; }
    await vcFetch(`/rest/v1/tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Concluído" }),
    });
    console.log(`[vpclick] tarefa ${taskId} → Concluído`);
    return true;
  } catch (e) {
    console.error("[vpclick] concluirVpClickTask:", e.message);
    return false;
  }
}

// Ingestão: pedido Omie → sac_clientes + sac_notas_fiscais + fluxo VIP
async function ingerirPedidoOmie(codigoPedido, { skipNotify = false } = {}) {
  // 1. Consultar pedido completo no Omie
  const pedidoResp = await omieCall("produtos/pedido", "ConsultarPedido", { codigo_pedido: codigoPedido });
  const pedido = pedidoResp.pedido_venda_produto;
  if (!pedido?.cabecalho) throw new Error(`Pedido ${codigoPedido} sem cabeçalho`);

  // 2. Consultar cliente no Omie
  const cliResp = await omieCall("geral/clientes", "ConsultarCliente", {
    codigo_cliente_omie: pedido.cabecalho.codigo_cliente,
  });
  const cli = cliResp;
  const cnpj = String(cli.cnpj_cpf || "").replace(/\D/g, "");
  const telefone = cli.telefone1_ddd && cli.telefone1_numero
    ? `${cli.telefone1_ddd}${cli.telefone1_numero}`.replace(/\D/g, "")
    : null;

  const valorTotal = pedido.total_pedido?.valor_total_pedido ?? 0;
  const classeAbc = classificarABC(valorTotal);

  // 3. Upsert cliente (on_conflict=cnpj)
  const cliR = await sbFetch("/rest/v1/sac_clientes?on_conflict=cnpj", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      cnpj,
      razao_social: cli.razao_social || "—",
      nome_fantasia: cli.nome_fantasia || null,
      classe_abc: classeAbc,
      email: cli.email || null,
      telefone, whatsapp: telefone,
      contato: cli.contato || null,
      codigo_omie: cli.codigo_cliente_omie || pedido.cabecalho.codigo_cliente,
      updated_at: new Date().toISOString(),
    }),
  });
  const cliRows = await cliR.json().catch(() => []);
  const clienteId = Array.isArray(cliRows) && cliRows[0]?.id ? cliRows[0].id : null;

  // 4. Upsert NF — número real da NF extraído de infoCadastro quando disponível
  const nfNumero = String(
    pedido.infoCadastro?.nNF || pedido.infoCadastro?.numero_nf ||
    pedido.cabecalho.numero_pedido || codigoPedido
  );
  const chaveNFe = pedido.infoCadastro?.cChaveNFe || pedido.infoCadastro?.chave_nfe || null;
  const existing = await sbFetch(
    `/rest/v1/sac_notas_fiscais?codigo_pedido_omie=eq.${codigoPedido}&select=id&limit=1`,
    { method: "GET" },
  ).then((r) => r.json()).catch(() => []);

  const nfBody = {
    nf_numero: nfNumero,
    chave_nfe: chaveNFe,
    cliente_id: clienteId,
    cnpj_cliente: cnpj,
    razao_social_cliente: cli.razao_social || "—",
    classe_abc: classeAbc,
    data_emissao: parseDateBR(pedido.infoCadastro?.dFat) || new Date().toISOString().slice(0, 10),
    valor_total: valorTotal,
    transportadora: pedido.frete?.nome_transportador || null,
    codigo_rastreio: pedido.frete?.codigo_rastreio || null,
    previsao_entrega: parseDateBR(pedido.frete?.previsao_entrega),
    status_entrega: "EMITIDA",
    codigo_pedido_omie: codigoPedido,
    numero_pedido_omie: pedido.cabecalho?.numero_pedido ? String(pedido.cabecalho.numero_pedido) : (codigoPedido ? String(codigoPedido) : null),
    dados_omie: pedido,
    updated_at: new Date().toISOString(),
  };

  let nfId;
  if (Array.isArray(existing) && existing[0]?.id) {
    nfId = existing[0].id;
    await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${nfId}`, {
      method: "PATCH",
      body: JSON.stringify(nfBody),
    });
  } else {
    const nfR = await sbFetch("/rest/v1/sac_notas_fiscais", {
      method: "POST",
      body: JSON.stringify(nfBody),
    });
    const nfRows = await nfR.json().catch(() => []);
    nfId = Array.isArray(nfRows) && nfRows[0]?.id ? nfRows[0].id : null;
  }

  // 5. Fluxo OODA — Classe A: WhatsApp VIP imediato (pulado no backfill histórico)
  if (!skipNotify && nfId && classeAbc === "A" && telefone) {
    const nome = cli.nome_fantasia || cli.razao_social || "Cliente";
    const msg = `Olá, ${nome}! 👋\n\nSou da equipe VerticalParts. Sua NF *${nfNumero}* foi emitida e está sendo preparada para envio.${nfBody.codigo_rastreio ? `\n\n📦 Rastreio: *${nfBody.codigo_rastreio}*` : ""}\n\nEstamos à disposição para qualquer dúvida! 🙂`;
    const ok = await enviarWhatsAppSac(telefone, msg);
    await registrarLogSac(nfId, "WHATSAPP", "VIP_FOLLOWUP", telefone, msg, ok);
  }

  // 6. Trigger 1 VP Click: tarefa Expedição + @expedição (não executa no backfill)
  if (!skipNotify && nfId) {
    void createVpClickTaskExpedicao(nfId, nfBody.numero_pedido_omie || String(codigoPedido), cli.razao_social || "—", nfBody.previsao_entrega);
  }

  console.log(`[sac/omie] pedido ${codigoPedido} → NF ${nfNumero} classe ${classeAbc} (nf_id=${nfId})`);
  return { nfId, nfNumero, classeAbc };
}

// Ingestão via nfconsultar/ListarNF — usa o número real da NF (não numero_pedido)
// nfData = item de nfCadastro[] retornado pela API nfconsultar
async function ingerirNFOmie(nfData, { skipNotify = false } = {}) {
  // Número e chave da NF
  const nfNumero  = String(nfData.compl?.nNumNF || nfData.ide?.nNF || "?");
  const chaveNFe  = nfData.compl?.cChaveNFe || null;
  const dataEmissao = parseDateBR(nfData.ide?.dEmi) || new Date().toISOString().slice(0, 10);
  // vNF fica dentro de total.ICMSTot.vNF na estrutura do nfconsultar/ListarNF
  const valorTotal  = Number(
    nfData.total?.ICMSTot?.vNF ?? nfData.total?.vNF ?? nfData.total?.vTotTrib ?? 0
  );
  const classeAbc   = classificarABC(valorTotal);

  // Destinatário: ListarNF usa cRazao e cnpj_cpf (não cNome/cCPFCNPJ)
  const cnpjRaw    = String(nfData.nfDestInt?.cnpj_cpf || nfData.nfDestInt?.cCPFCNPJ || "").replace(/\D/g, "");
  const razaoSocial = nfData.nfDestInt?.cRazao || nfData.nfDestInt?.cNome || "—";
  const codigoOmie  = nfData.nfDestInt?.nCodCli || null;

  // Pedido vinculado (se Omie disponibilizar no campo compl)
  const codigoPedido = nfData.compl?.nIdPedido ? Number(nfData.compl.nIdPedido) : null;

  // Transportadora (campo transp da NFe)
  const transportadora = nfData.transp?.transporta?.xNome || null;

  // Dados complementares do cliente via BD_Omie (telefone, email, nome_fantasia)
  let telefone = null, email = null, nomeFantasia = null;
  if (cnpjRaw.length >= 11) {
    try {
      const mask = cnpjRaw.length === 14
        ? `${cnpjRaw.slice(0,2)}.${cnpjRaw.slice(2,5)}.${cnpjRaw.slice(5,8)}/${cnpjRaw.slice(8,12)}-${cnpjRaw.slice(12,14)}`
        : `${cnpjRaw.slice(0,3)}.${cnpjRaw.slice(3,6)}.${cnpjRaw.slice(6,9)}-${cnpjRaw.slice(9,11)}`;
      const r = await erpFetch(`/PN_Omie?select=telefone,email,nome_fantasia&cnpj_cpf=eq.${_enc(mask)}&limit=1`);
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]) {
          telefone     = rows[0].telefone    ? String(rows[0].telefone).replace(/\D/g, "") : null;
          email        = rows[0].email       || null;
          nomeFantasia = rows[0].nome_fantasia || null;
        }
      }
    } catch (e) { console.error("[ingerirNF] lookup cliente:", e.message); }
  }

  // Upsert sac_clientes
  const cliR = await sbFetch("/rest/v1/sac_clientes?on_conflict=cnpj", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      cnpj: cnpjRaw, razao_social: razaoSocial, nome_fantasia: nomeFantasia || null,
      classe_abc: classeAbc, email, telefone, whatsapp: telefone,
      codigo_omie: codigoOmie, updated_at: new Date().toISOString(),
    }),
  });
  const cliRows  = await cliR.json().catch(() => []);
  const clienteId = Array.isArray(cliRows) && cliRows[0]?.id ? cliRows[0].id : null;

  // Upsert sac_notas_fiscais (chave idempotente: nf_numero + cnpj_cliente)
  const existing = await sbFetch(
    `/rest/v1/sac_notas_fiscais?nf_numero=eq.${_enc(nfNumero)}&cnpj_cliente=eq.${_enc(cnpjRaw)}&select=id&limit=1`,
    { method: "GET" },
  ).then((r) => r.json()).catch(() => []);

  const nfBody = {
    nf_numero: nfNumero, chave_nfe: chaveNFe,
    cliente_id: clienteId, cnpj_cliente: cnpjRaw, razao_social_cliente: razaoSocial,
    classe_abc: classeAbc, data_emissao: dataEmissao, valor_total: valorTotal,
    transportadora, codigo_rastreio: null, previsao_entrega: null,
    status_entrega: "EMITIDA",
    codigo_pedido_omie: codigoPedido,
    numero_pedido_omie: codigoPedido ? String(codigoPedido) : null,
    dados_omie: nfData,
    updated_at: new Date().toISOString(),
  };

  let nfId;
  if (Array.isArray(existing) && existing[0]?.id) {
    nfId = existing[0].id;
    await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${nfId}`, {
      method: "PATCH", body: JSON.stringify(nfBody),
    });
  } else {
    const nfR = await sbFetch("/rest/v1/sac_notas_fiscais", {
      method: "POST", body: JSON.stringify(nfBody),
    });
    const nfRows = await nfR.json().catch(() => []);
    nfId = Array.isArray(nfRows) && nfRows[0]?.id ? nfRows[0].id : null;
  }

  // OODA — Classe A: WhatsApp VIP imediato (skipNotify=true no backfill histórico)
  if (!skipNotify && nfId && classeAbc === "A" && telefone) {
    const nome = nomeFantasia || razaoSocial;
    const msg = `Olá, ${nome}! 👋\n\nSou da equipe VerticalParts. Sua NF *${nfNumero}* foi emitida e está sendo preparada para envio.\n\nEstamos à disposição para qualquer dúvida! 🙂`;
    const ok = await enviarWhatsAppSac(telefone, msg);
    await registrarLogSac(nfId, "WHATSAPP", "VIP_FOLLOWUP", telefone, msg, ok);
  }

  // Trigger 1 VP Click: tarefa Expedição + @expedição (não executa no backfill)
  if (!skipNotify && nfId) {
    void createVpClickTaskExpedicao(nfId, nfBody.numero_pedido_omie || nfNumero, razaoSocial, nfBody.previsao_entrega);
  }

  console.log(`[sac/nf] NF ${nfNumero} | ${razaoSocial} | ${classeAbc} | R$${valorTotal} (nf_id=${nfId})`);
  return { nfId, nfNumero, classeAbc };
}

async function handleOmieWebhook(req, res) {
  const json = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  if (req.method === "GET") return json(200, { status: "ok", service: "posvenda360-omie-webhook" });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "Invalid JSON" }); }

  console.log("[sac/omie] webhook:", JSON.stringify(payload).slice(0, 400));

  // Omie envia { ping: "omie" } para validar a URL no cadastro do webhook
  if (payload.ping) return json(200, { ping: payload.ping });

  // Validar appKey quando presente no payload
  if (payload.appKey && String(payload.appKey) !== OMIE_APP_KEY()) {
    console.warn("[sac/omie] appKey inválida:", String(payload.appKey).slice(0, 6));
    return json(401, { error: "Unauthorized" });
  }

  // Extrair código do pedido — Omie varia o formato conforme o tópico do evento
  // payload.event pode ser string (nome do evento) ou objeto com os dados — só usa como ev se for objeto
  const ev = (payload.event && typeof payload.event === "object" ? payload.event : null)
    || (payload.pedido && typeof payload.pedido === "object" ? payload.pedido : null)
    || payload;
  const codigoPedido =
    payload.codigo_pedido ?? payload.nCodPed ?? payload.id_pedido ??
    ev.codigo_pedido ?? ev.idPedido ?? ev.nCodPed ?? ev.id_pedido ?? null;

  if (!codigoPedido) {
    console.log("[sac/omie] evento sem codigo_pedido — topic:", payload.topic || "?");
    return json(200, { ok: true, skipped: true });
  }

  // Responde 200 imediatamente; processa em background (Omie tem timeout curto)
  json(200, { ok: true, processing: codigoPedido });
  try {
    await ingerirPedidoOmie(Number(codigoPedido));
  } catch (e) {
    console.error("[sac/omie] erro ao ingerir pedido:", e.message);
  }
}

async function handleSacEnviarPesquisa(req, res) {
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

  const nfId = payload?.nf_id;
  if (!nfId) return json(400, { error: "nf_id é obrigatório" });

  // Buscar NF + cliente
  const nfRows = await sbFetch(
    `/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nfId)}&select=*,sac_clientes(nome_fantasia,razao_social,whatsapp,telefone)&limit=1`,
    { method: "GET" },
  ).then((r) => r.json()).catch(() => []);
  const nf = Array.isArray(nfRows) ? nfRows[0] : null;
  if (!nf) return json(404, { error: "NF não encontrada" });

  // Criar registro de pesquisa (token gerado pelo default do banco)
  const pesqR = await sbFetch("/rest/v1/sac_pesquisas", {
    method: "POST",
    body: JSON.stringify({ nf_id: nfId }),
  });
  const pesqRows = await pesqR.json().catch(() => []);
  const token = Array.isArray(pesqRows) && pesqRows[0]?.token ? pesqRows[0].token : null;

  const cliente = nf.sac_clientes || {};
  const fone = cliente.whatsapp || cliente.telefone;
  const nome = cliente.nome_fantasia || cliente.razao_social || nf.razao_social_cliente || "Cliente";

  let enviado = false;
  if (fone && token) {
    const url = `https://posvenda360.vpsistema.com/nps/form/${token}`;
    const msg = `Olá, ${nome}! 😊\n\nSua entrega referente à NF *${nf.nf_numero}* foi concluída.\n\nGostaríamos muito de saber sua opinião. Leva menos de 1 minuto:\n👉 ${url}\n\nObrigado pela parceria! — VerticalParts`;
    enviado = await enviarWhatsAppSac(fone, msg);
    await registrarLogSac(nfId, "WHATSAPP", "PESQUISA", fone, msg, enviado);
  }

  await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nfId)}`, {
    method: "PATCH",
    body: JSON.stringify({ pesquisa_enviada: true, pesquisa_enviada_em: new Date().toISOString() }),
  });

  return json(200, { ok: true, enviado, token });
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

// ─── SAC — Backfill histórico de NFs do Omie ─────────────────────────────────
// POST /api/sac/omie-obs
// Body: { nf_id: string, obs: string }
// Consulta o pedido Omie vinculado, ANEXA a obs ao campo obs_venda e salva localmente.

async function handleSacOmieObs(req, res) {
  const json = (s, o) => {
    res.statusCode = s;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(o));
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

  const { nf_id, obs } = payload ?? {};
  if (!nf_id || typeof obs !== "string" || !obs.trim()) {
    return json(400, { error: "nf_id e obs são obrigatórios" });
  }

  // Buscar codigo_pedido_omie
  const nfRows = await sbFetch(
    `/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf_id)}&select=codigo_pedido_omie&limit=1`,
    { method: "GET" },
  ).then((r) => r.json()).catch(() => []);
  const nf = Array.isArray(nfRows) ? nfRows[0] : null;
  if (!nf) return json(404, { error: "NF não encontrada" });
  if (!nf.codigo_pedido_omie) {
    return json(422, { error: "NF sem pedido Omie vinculado. Use o Backfill para importar via Omie." });
  }

  const codigoPedido = Number(nf.codigo_pedido_omie);
  const dataHoje = new Date().toLocaleDateString("pt-BR");
  const novaLinha = `PV360 ${dataHoje}: ${obs.trim()}`;

  try {
    // 1. Busca obs atual no Omie para não sobrescrever outras áreas
    let obsAtual = "";
    try {
      const pedR = await omieCall("produtos/pedido", "ConsultarPedido", { codigo_pedido: codigoPedido });
      obsAtual = pedR.pedido_venda_produto?.observacoes?.obs_venda ?? "";
    } catch (e) {
      console.warn("[sac/omie-obs] ConsultarPedido falhou, enviando só nova obs:", e.message);
    }

    const obsCompleta = obsAtual ? `${obsAtual}\n${novaLinha}` : novaLinha;

    // 2. AlterarPedFaturado — estrutura correta: pedido_venda_produto wrapper
    // Tenta primeiro com wrapper (padrão da API Omie para pedidos faturados)
    // Se falhar, tenta com parâmetros planos (formato alternativo documentado)
    let alterado = false;
    try {
      await omieCall("produtos/pedido", "AlterarPedFaturado", {
        pedido_venda_produto: {
          cabecalho: { codigo_pedido: codigoPedido },
          observacoes: { obs_venda: obsCompleta },
        },
      });
      alterado = true;
    } catch (e1) {
      console.log(`[sac/omie-obs] AlterarPedFaturado wrapper falhou (${e1.message}), tentando formato plano`);
      try {
        await omieCall("produtos/pedido", "AlterarPedFaturado", {
          codigo_pedido: codigoPedido,
          obs_venda: obsCompleta,
        });
        alterado = true;
      } catch (e2) {
        console.error(`[sac/omie-obs] AlterarPedFaturado formato plano também falhou: ${e2.message}`);
        throw new Error(`Omie não aceitou a alteração: ${e2.message}`);
      }
    }

    // 3. Salva localmente o que foi enviado
    await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ obs_omie: obs.trim(), updated_at: new Date().toISOString() }),
    });

    return json(200, { ok: true });
  } catch (e) {
    console.error("[sac/omie-obs] Erro:", e.message);
    return json(500, { error: `Erro ao atualizar Omie: ${e.message}` });
  }
}

// POST /api/sac/vpclick-concluir — Trigger 3: marca tarefa VP Click como Concluído
async function handleVpClickConcluir(req, res) {
  const json = (s, o) => {
    res.statusCode = s;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(o));
  };
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.end();
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "Invalid JSON" }); }
  const { nf_id } = body || {};
  if (!nf_id) return json(400, { error: "Missing nf_id" });
  const ok = await concluirVpClickTask(nf_id);
  return json(200, { ok });
}

// POST /api/sac/expedicao-divergencia — Salva conferência de itens e notifica VP Click
async function handleExpedicaoDivergencia(req, res) {
  const json = (s, o) => {
    res.statusCode = s;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(o));
  };
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.end();
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "Invalid JSON" }); }
  const { nf_id, itens, obs_divergencia } = body || {};
  if (!nf_id || !Array.isArray(itens)) return json(400, { error: "Missing nf_id or itens" });

  const rows = itens.map((item) => ({
    nf_id,
    item_idx: item.item_idx,
    sku: item.sku || null,
    descricao: item.descricao || null,
    qtd_pedida: item.qtd_pedida,
    qtd_conferida: item.qtd_conferida,
    divergencia_tipo: item.divergencia_tipo || null,
    obs_divergencia: obs_divergencia || null,
    conferido_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const upsertRes = await sbFetch(
    `/rest/v1/expedicao_conferencias?on_conflict=nf_id%2Citem_idx`,
    { method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) }
  );
  if (!upsertRes.ok) {
    const err = await upsertRes.text();
    console.error("[expedicao-divergencia] upsert error:", err);
    return json(500, { error: "Erro ao salvar conferências" });
  }

  // Notifica VP Click — adiciona comentário na tarefa vinculada
  try {
    const linkRes = await sbFetch(`/rest/v1/vpclick_integration_links?nf_id=eq.${encodeURIComponent(nf_id)}&select=task_id&limit=1`);
    if (linkRes.ok) {
      const links = await linkRes.json();
      const taskId = links?.[0]?.task_id;
      if (taskId) {
        const itensDivergentes = itens.filter((i) => i.divergencia_tipo);
        const linhasDiv = itensDivergentes.map((i) =>
          `• ${i.descricao || i.sku || `Item ${i.item_idx + 1}`}: pedido ${i.qtd_pedida}, conferido ${i.qtd_conferida} (${i.divergencia_tipo})`
        ).join("\n");
        const comentario = `⚠️ DIVERGÊNCIA NA EXPEDIÇÃO\n${linhasDiv}${obs_divergencia ? `\nObs: ${obs_divergencia}` : ""}`;
        await vcFetch(`/rest/v1/task_comments`, {
          method: "POST",
          body: JSON.stringify({ task_id: taskId, body: comentario, author_id: null }),
        });
        await vcFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "aguardando_interno", updated_at: new Date().toISOString() }),
        });
      }
    }
  } catch (e) {
    console.error("[expedicao-divergencia] VP Click notify error:", e);
  }

  return json(200, { ok: true });
}

// POST /api/sac/sync-faturamento
async function handleSyncFaturamento(req, res) {
  const jsonR = (s, o) => { res.statusCode = s; res.setHeader("Content-Type","application/json"); res.setHeader("Access-Control-Allow-Origin","*"); res.end(JSON.stringify(o)); };
  if (req.method === "OPTIONS") { res.statusCode=204; res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization"); return res.end(); }
  if (req.method !== "POST") return jsonR(405, { error: "Method Not Allowed" });
  function parseDateBR(s) { if (!s || s==="00/00/0000") return null; const [d,m,y]=s.split("/"); return `${y}-${m}-${d}`; }
  try {
    const nfRows = await sbFetch(`/rest/v1/sac_notas_fiscais?select=id,codigo_pedido_omie&codigo_pedido_omie=not.is.null&limit=200`,{method:"GET"}).then(r=>r.json()).catch(()=>[]);
    if (!Array.isArray(nfRows)||!nfRows.length) return jsonR(200,{ok:true,atualizados:0});
    let atualizados=0; const erros=[]; const LOTE=10;
    for (let i=0;i<nfRows.length;i+=LOTE) {
      const batch=nfRows.slice(i,i+LOTE);
      await Promise.all(batch.map(async(nf)=>{
        const codigo=Number(nf.codigo_pedido_omie); if(!codigo) return;
        try {
          const result=await omieCall("produtos/pedido","ConsultarPedido",{codigo_pedido:codigo});
          const info=result?.pedido_venda_produto?.infoCadastro;
          const faturado=info?.faturado==="S";
          const dataFat=parseDateBR(info?.dFat);
          await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf.id)}`,{method:"PATCH",body:JSON.stringify({faturado,data_faturamento:dataFat,updated_at:new Date().toISOString()})});
          atualizados++;
        } catch(e) { erros.push(`pedido ${codigo}: ${e.message}`); }
      }));
      if (i+LOTE<nfRows.length) await new Promise(r=>setTimeout(r,200));
    }
    return jsonR(200,{ok:true,atualizados,erros:erros.length?erros:undefined});
  } catch(e) { console.error("[sync-faturamento]",e.message); return jsonR(500,{error:e.message}); }
}

// POST /api/sac/omie-anexo
async function handleSacOmieAnexo(req, res) {
  const jsonR = (s, o) => { res.statusCode = s; res.setHeader("Content-Type","application/json"); res.setHeader("Access-Control-Allow-Origin","*"); res.end(JSON.stringify(o)); };
  if (req.method === "OPTIONS") { res.statusCode=204; res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization"); return res.end(); }
  if (req.method !== "POST") return jsonR(405, { error: "Method Not Allowed" });
  let body; try { body=JSON.parse(await readBody(req)); } catch { return jsonR(400,{error:"Invalid JSON"}); }
  const {nf_id,fotos}=body??{};
  if (!nf_id||!Array.isArray(fotos)||!fotos.length) return jsonR(400,{error:"nf_id e fotos[] são obrigatórios"});
  const nfRows=await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf_id)}&select=codigo_pedido_omie&limit=1`,{method:"GET"}).then(r=>r.json()).catch(()=>[]);
  const nf=Array.isArray(nfRows)?nfRows[0]:null;
  if (!nf) return jsonR(404,{error:"NF não encontrada"});
  if (!nf.codigo_pedido_omie) return jsonR(422,{error:"NF sem pedido Omie vinculado."});
  const {zipSync}=await import("fflate");
  const {createHash}=await import("node:crypto");
  const nId=Number(nf.codigo_pedido_omie);
  const resultados=[];
  for (const foto of fotos) {
    try {
      const resp=await fetch(foto.url); if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer=await resp.arrayBuffer();
      const ext=foto.url.split("?")[0].split(".").pop()?.toLowerCase()??"jpg";
      const nomeArquivo=foto.nome.endsWith(`.${ext}`)?foto.nome:`${foto.nome}.${ext}`;
      const codInt=`pv-${nf_id.replace(/-/g,"").slice(0,17)}`;
      const bytes=new Uint8Array(buffer); const files={}; files[nomeArquivo]=bytes;
      const zipped=zipSync(files); let bin=""; const chunk=8192;
      for (let i=0;i<zipped.length;i+=chunk) bin+=String.fromCharCode(...zipped.subarray(i,Math.min(i+chunk,zipped.length)));
      const zippedBase64=btoa(bin);
      const md5Hash=createHash("md5").update(zippedBase64).digest("hex");
      await omieCall("geral/anexo","IncluirAnexo",{cTabela:"PC",nId,cCodIntAnexo:codInt.slice(0,20),cNomeArquivo:nomeArquivo,cTipoArquivo:ext,cArquivo:zippedBase64,cMd5:md5Hash});
      resultados.push({nome:nomeArquivo,ok:true});
    } catch(e) { resultados.push({nome:foto.nome,ok:false,erro:e.message}); }
  }
  const falhas=resultados.filter(r=>!r.ok);
  if (falhas.length===fotos.length) return jsonR(500,{error:"Todas as fotos falharam",detalhes:resultados});
  return jsonR(200,{ok:true,resultados});
}

// POST /api/sac/backfill
// Busca pedidos faturados (etapa=60) no Omie e ingere no sac_notas_fiscais.
// Idempotente: se a NF já existe, faz PATCH. Não envia WhatsApp (skipNotify).

async function handleSacBackfill(req, res) {
  const json = (s, o) => {
    res.statusCode = s;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(o));
  };
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.end();
  }
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  let body = {};
  try { body = JSON.parse(await readBody(req)); } catch { /* body opcional */ }

  const dataDe  = body.data_de  || "01/05/2026";
  const dataAte = body.data_ate || (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  })();

  // Responde 200 imediatamente e processa em background
  json(200, { ok: true, iniciado: true, data_de: dataDe, data_ate: dataAte,
    message: "Backfill iniciado. Acompanhe pelo log do servidor (pm2 logs)." });

  setImmediate(async () => {
    const stats = { total: 0, processed: 0, skipped: 0, errors: [] };
    try {
      // Usa nfconsultar/ListarNF: filtra por data de EMISSÃO da NF (dEmiInicial/dEmiFinal)
      // e tpNF=1 (saída = venda). Retorna o número real da NF, chave NFe, etc.
      let pagina = 1;
      let totalPaginas = 1;

      while (pagina <= totalPaginas && pagina <= 20) {
        let data;
        try {
          data = await omieCall("produtos/nfconsultar", "ListarNF", {
            pagina,
            registros_por_pagina: 50,
            dEmiInicial: dataDe,
            dEmiFinal:   dataAte,
            tpNF: "1",               // saída (venda)
            filtrar_por_status: "N", // não canceladas
          });
        } catch (e) {
          console.error(`[backfill] ListarNF pág.${pagina}:`, e.message);
          break;
        }

        totalPaginas = data.total_de_paginas ?? data.nTotPag ?? 1;
        const nfs = data.nfCadastro ?? data.nfsCadastro ?? [];
        console.log(`[backfill] ListarNF pág.${pagina}/${totalPaginas} → ${nfs.length} NFs`);

        for (const nf of nfs) {
          stats.total++;
          const nfNum = nf.compl?.nNumNF || nf.ide?.nNF || "?";
          try {
            await ingerirNFOmie(nf, { skipNotify: true });
            stats.processed++;
          } catch (e) {
            stats.errors.push({ nf_numero: nfNum, error: e.message });
            console.error(`[backfill] ✗ NF ${nfNum}:`, e.message);
          }
          await new Promise(r => setTimeout(r, 200));
        }
        pagina++;
      }
    } catch (e) {
      console.error("[backfill] erro geral:", e.message);
    }
    console.log("[backfill] ✅ concluído:", JSON.stringify(stats));
  });
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
          OMIE_APP_KEY: !!process.env.OMIE_APP_KEY,
          OMIE_APP_SECRET: !!process.env.OMIE_APP_SECRET,
          OMIE_APP_KEY_val: (process.env.OMIE_APP_KEY || "").slice(0,4) || "(fallback)",
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
