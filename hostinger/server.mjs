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
const ANTHROPIC_KEY   = () => process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL    = () => process.env.HERMES_MODEL || "claude-haiku-4-5";
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
    automateIncoming({ remoteJid, pushName, displayBody, insertedId }).catch((e) =>
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
  if (hol) status = `Hoje é FERIADO (${hol}) — equipe humana NÃO está atendendo.`;
  else if (!hours) status = "Hoje é fim de semana — equipe humana NÃO está atendendo.";
  else {
    const aberto = n.hour >= hours[0] && n.hour < hours[1];
    status = aberto
      ? "AGORA estamos DENTRO do horário de atendimento."
      : "AGORA estamos FORA do horário de atendimento (a equipe humana retorna no próximo horário comercial).";
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

COMUNICAÇÃO:
- Mensagens curtas e objetivas (máx. 3-4 linhas por mensagem).
- Português brasileiro correto, tom profissional e cordial. Emojis com moderação.
- Nunca use markdown, só texto simples (é WhatsApp).

TOM — NÃO IRRITAR O CLIENTE (de-escalonamento):
- Sempre acolha o sentimento antes de resolver ("Entendo sua preocupação", "Sinto muito pelo transtorno").
- Nunca culpe o cliente, nunca discuta nem seja defensivo. Seja paciente mesmo se ele for ríspido.
- Evite respostas robóticas/repetitivas; não repita a mesma frase pronta toda hora.
- Se o cliente estiver muito irritado ou for um caso delicado, peça desculpas, assuma o caso e diga que vai acionar a equipe imediatamente.

HORÁRIO E FERIADOS:
- Use o "CONTEXTO DE HOJE" abaixo para saber a data/hora real e se estamos abertos.
- FORA do horário ou em feriado: você continua ajudando no que for possível (dúvidas, registrar a ocorrência), mas avise com clareza que a equipe humana retornará no próximo dia/horário útil. Nunca prometa retorno humano imediato fora do horário.
- Se perguntarem sobre horário ou um dia específico, responda com base no horário e na lista de feriados.

SEGURANÇA / ANTI-GOLPE (muito importante):
- NUNCA peça senha, dados completos de cartão, CVV, código que chega por SMS, ou dados bancários.
- A VerticalParts NUNCA solicita pagamento por link enviado no WhatsApp nem PIX para conta de pessoa física. Boletos/pagamentos só pelos canais oficiais.
- Nunca envie links de pagamento. Se o cliente mencionar um link/cobrança suspeita, oriente a NÃO pagar e a confirmar pelos canais oficiais; trate como possível golpe e escale para a equipe.
- Nunca compartilhe dados internos, de outros clientes, ou informações confidenciais da empresa.

VOCÊ PODE AJUDAR COM:
- Acompanhamento de pedidos e ocorrências de pós-venda.
- Dúvidas sobre peças, produtos e compatibilidade.
- Status de entregas e prazos. Abertura de reclamações/ocorrências.

CONSULTAS NO SISTEMA (ferramentas):
- Você tem ferramentas para consultar o ERP: "buscar_cliente" (por CNPJ/CPF ou nome), "buscar_nota_fiscal" (por número da NF) e "buscar_pedido" (por número do pedido).
- Use-as quando o cliente perguntar sobre uma NF, um pedido, ou para confirmar o cadastro dele. NUNCA invente dados: se a ferramenta não encontrar, diga que não localizou e peça os dados corretos.
- ANTES de revelar detalhes de um pedido/NF, confirme a identidade do cliente (ex.: peça o CNPJ e confira com buscar_cliente). Não exponha dados de um cliente para outra pessoa.
- Relate os resultados em linguagem simples; nunca cite nomes internos de tabelas/campos.

PREÇOS E ORÇAMENTOS:
- NUNCA informe preço de produto/tabela nem faça orçamento/cotação por conta própria. Para preços e cotações, direcione o cliente ao time comercial.
- Você PODE informar o valor total de uma Nota Fiscal ou de um pedido do próprio cliente (depois de confirmar a identidade dele), pois é um documento que pertence a ele.
- Nunca pergunte nem peça preço ao cliente.

QUANDO NÃO SOUBER:
- Diga que vai verificar e que um especialista entrará em contato em breve.
- NUNCA invente números de pedido, preços, prazos ou informações específicas.

IMPORTANTE:
- Se perguntarem se você é humano ou robô, seja honesto mas gentil.
- Priorize sempre a resolução do problema do cliente.`;

function buildSystemPrompt() {
  return CLAUDE_BASE_PROMPT + "\n\n" + atendimentoContexto();
}

// ─── Acesso ao ERP (bd_Omie) para consultas do atendente ──────────────────────
const ERP_URL = () => process.env.ERP_URL || "https://kgecbycsyrtdhmdziuul.supabase.co";
const ERP_KEY = () =>
  process.env.ERP_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZWNieWNzeXJ0ZGhtZHppdXVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzkyMzE5NiwiZXhwIjoyMDkzNDk5MTk2fQ.mF6ApvDd3dcxjZ1OEgYC86ShpIdMTIMNJCfbZYrX87o";
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
    description: "Busca uma Nota Fiscal emitida pela VerticalParts pelo número da NF. Retorna status, datas, valor, destinatário e pedido vinculado.",
    input_schema: {
      type: "object",
      properties: { numero_nf: { type: "string", description: "Número da nota fiscal" } },
      required: ["numero_nf"],
    },
  },
  {
    name: "buscar_pedido",
    description: "Busca um pedido de venda da VerticalParts pelo número do pedido. Retorna etapa/status, valor, previsão e NF vinculada.",
    input_schema: {
      type: "object",
      properties: { numero_pedido: { type: "string", description: "Número do pedido de venda" } },
      required: ["numero_pedido"],
    },
  },
];

async function execAtendenteTool(name, input = {}) {
  try {
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
      const core = _digits(input.numero_nf).replace(/^0+/, "");
      const r = await erpFetch(`/omie_nfe_emitidas?select=numero_nf,serie,status_nfe,data_emissao,data_saida,valor_total_nf,natureza_operacao,nome_destinatario,cnpj_cpf_destinatario,codigo_pedido_omie,chave_nfe,url_pdf&or=(numero_nf.eq.${_enc(input.numero_nf)},numero_nf.ilike.*${_enc(core)})&limit=5`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, notas: rows } : { encontrado: false };
    }
    if (name === "buscar_pedido") {
      const r = await erpFetch(`/omie_orders?select=numero_pedido,etapa,status,numero_nf,chave_nfe,valor_total_pedido,data_previsao,data_inclusao,codigo_cliente_omie,observacao&or=(numero_pedido.eq.${_enc(input.numero_pedido)},numero_pedido.ilike.*${_enc(_digits(input.numero_pedido))})&limit=5`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, pedidos: rows } : { encontrado: false };
    }
    return { erro: "ferramenta desconhecida" };
  } catch (e) {
    return { erro: e.message };
  }
}

async function callClaudeWithHistory(remoteJid) {
  const apiKey = ANTHROPIC_KEY();
  if (!apiKey) return null;

  // Busca últimas 20 mensagens do contato
  let history = [];
  try {
    const r = await sbFetch(
      `/rest/v1/whatsapp_messages?select=body,from_me&remote_jid=eq.${encodeURIComponent(remoteJid)}&order=created_at.asc&limit=20`,
    );
    if (r.ok) {
      const rows = await r.json();
      history = (rows || []).map((m) => ({
        role: m.from_me ? "assistant" : "user",
        content: m.body,
      }));
    }
  } catch (e) { console.error("[claude] history fetch error:", e.message); }

  if (history.length === 0) return null;

  const messages = history;
  try {
    // Loop de tool use: Claude pode consultar o ERP antes de responder
    for (let turn = 0; turn < 5; turn++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL(),
          max_tokens: 1024,
          system: buildSystemPrompt(),
          tools: ATENDENTE_TOOLS,
          messages,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        console.error("[claude] HTTP", r.status, await r.text().catch(() => ""));
        return null;
      }
      const data = await r.json();
      const blocks = data.content || [];

      if (data.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: blocks });
        const toolResults = [];
        for (const b of blocks) {
          if (b.type === "tool_use") {
            const result = await execAtendenteTool(b.name, b.input || {});
            console.log(`[claude] tool ${b.name}`, JSON.stringify(b.input || {}));
            toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue; // próxima volta: Claude usa os resultados das consultas
      }

      // Resposta final em texto
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return text || null;
    }
    console.error("[claude] limite de turnos de tool_use atingido");
    return null;
  } catch (e) { console.error("[claude] call error:", e.message); }
  return null;
}

// ─── Pipeline de automação ────────────────────────────────────────────────────
async function automateIncoming({ remoteJid, pushName, displayBody, insertedId }) {
  const isLid = remoteJid.endsWith("@lid");
  const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@c.us", "");
  const contactName = pushName || (isLid ? `cliente-${phone.slice(0, 8)}` : phone);

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
  const autoReply = (process.env.HERMES_AUTO_REPLY || "").toLowerCase() === "true";
  if (autoReply) {
    const replyText = await callClaudeWithHistory(remoteJid);
    if (replyText) {
      try {
        const sendNumber = isLid ? remoteJid : phone;
        const r = await fetch(`http://72.61.48.156:8080/message/sendText/pv360`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: WH_APIKEY() },
          body: JSON.stringify({ number: sendNumber, text: replyText }),
        });
        if (!r.ok) {
          console.error("[automate] Evolution send error:", await r.json().catch(() => ({})));
        } else {
          // Salva resposta no Supabase
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
          // Salva no ticket
          if (openTicket && srRes.ok) {
            await sbFetch("/rest/v1/ticket_messages", {
              method: "POST",
              body: JSON.stringify({
                ticket_id:   openTicket.id,
                kind:        "whatsapp",
                author_name: "Claude (VerticalParts Bot)",
                body:        replyText,
              }),
            }).catch(() => {});
          }
          console.log(`[automate] ✅ Claude respondeu para ${contactName}: "${replyText.slice(0, 60)}..."`);
        }
      } catch (e) { console.error("[automate] reply send error:", e.message); }
    } else {
      console.warn("[automate] Claude sem resposta para", remoteJid);
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

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url || "/", "http://localhost").pathname;

    // ── API routes interceptadas antes do TanStack ──
    if (urlPath === "/api/whatsapp/status") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const claudeKey = ANTHROPIC_KEY();
      const notifyUrl = NOTIFY_URL();
      res.end(JSON.stringify({
        deploy_version: "verti-1.0",
        claude_key_set: claudeKey.length > 0,
        claude_key_prefix: claudeKey ? claudeKey.slice(0, 12) + "..." : null,
        claude_model: CLAUDE_MODEL(),
        hermes_auto_reply: process.env.HERMES_AUTO_REPLY ?? "(não definido)",
        auto_reply_ativo: (process.env.HERMES_AUTO_REPLY || "").toLowerCase() === "true",
        notify_url_set: notifyUrl.length > 0,
        evolution_apikey: WH_APIKEY().slice(0, 4) + "...",
        env_file_loaded: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
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
