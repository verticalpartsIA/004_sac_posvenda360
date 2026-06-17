import { createClient } from "@supabase/supabase-js";

// ─── config ───────────────────────────────────────────────────────────────────
const CLAUDE_MODEL  = () => process.env.CLAUDE_MODEL ?? process.env.HERMES_MODEL ?? "claude-opus-4-8";
const EVO_URL       = process.env.EVOLUTION_URL ?? "http://72.61.48.156:8080";
const EVO_INSTANCE  = "pv360";
const HISTORY_LIMIT = 20;
const TIMEOUT_MS    = 30_000;

const SB_URL = process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co";
const SB_KEY = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY nao definida");
  return key;
};

// ─── system prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um atendente de pós-venda da VerticalParts, empresa especializada em peças para elevadores, escadas rolantes e esteiras (importações e produtos nacionais). Marcas principais: BST, Monarch, Fermator.

Você atende clientes via WhatsApp. Siga estas diretrizes:

COMUNICAÇÃO:
- Mensagens curtas e objetivas (máximo 3-4 linhas por mensagem)
- Tom profissional mas amigável
- Português brasileiro coloquial mas correto
- Use emojis com moderação quando apropriado

VOCÊ PODE AJUDAR COM:
- Acompanhamento de pedidos e ocorrências de pós-venda
- Dúvidas sobre peças, produtos e compatibilidade
- Status de entregas e prazos
- Abertura de reclamações e registros de ocorrência
- Informações gerais sobre a empresa e produtos

QUANDO NÃO SOUBER:
- Diga que vai verificar e que um especialista entrará em contato em breve
- Nunca invente números de pedido, preços ou prazos específicos
- Nunca compartilhe informações confidenciais da empresa

IMPORTANTE:
- Se o cliente perguntar diretamente se você é humano ou robô, seja honesto mas gentil
- Priorize a resolução do problema do cliente
- Se a situação for urgente ou complexa, avise que vai acionar a equipe técnica imediatamente`;

// ─── tipos internos ───────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string };
type AnthropicResp = { content?: Array<{ type: string; text: string }> };

// ─── normaliza histórico ──────────────────────────────────────────────────────
// A API Anthropic exige alternância user/assistant. Une mensagens consecutivas
// do mesmo papel e garante que a primeira mensagem seja "user".
function normalizeHistory(msgs: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const msg of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n" + msg.content;
    } else {
      out.push({ ...msg });
    }
  }
  // primeiro turno deve ser "user"
  if (out.length > 0 && out[0].role === "assistant") out.shift();
  return out;
}

// ─── chamada direta à API Anthropic (Claude) ──────────────────────────────────
async function callClaude(history: ChatMsg[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[claude] ANTHROPIC_API_KEY não configurada");
    return null;
  }

  const messages = normalizeHistory(history);
  if (messages.length === 0) {
    console.warn("[claude] histórico vazio após normalização");
    return null;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL(),
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[claude] Anthropic HTTP ${res.status}:`, await res.text().catch(() => ""));
      return null;
    }

    const data = (await res.json()) as AnthropicResp;
    return data?.content?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error("[claude] call error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── mídias que não geram resposta ────────────────────────────────────────────
const MEDIA_ONLY = new Set([
  "[imagem]", "[video]", "[audio]", "[documento]",
  "[sticker]", "[figurinha]", "[midia]",
]);

// ─── função principal exportada ───────────────────────────────────────────────
export async function autoReplyWithClaude(params: {
  remoteJid: string;
  body: string;
  ticketId: string | null;
  pushName: string | null;
}) {
  // Desligado se env não estiver explicitamente habilitado
  if ((process.env.CLAUDE_AUTO_REPLY ?? process.env.HERMES_AUTO_REPLY) !== "true") return;

  const { remoteJid, body, ticketId, pushName } = params;

  // Não responde grupos
  if (remoteJid.endsWith("@g.us")) return;

  // Não responde mídia pura (sem texto)
  if (MEDIA_ONLY.has(body.toLowerCase())) return;

  // @lid = contatos com privacidade avançada do WhatsApp (9% dos contatos)
  // Evolution API não consegue enviar para @lid — ticket é criado para atendimento humano
  const isLid = remoteJid.endsWith("@lid");
  if (isLid) {
    console.log(`[claude] ⚠️ contato @lid (${remoteJid}) — auto-reply não suportado pela Evolution API. Ticket criado para equipe.`);
    return;
  }
  const phone = remoteJid
    .replace("@s.whatsapp.net", "")
    .replace("@lid", "")
    .replace("@c.us", "");

  const sb = createClient(SB_URL, SB_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Busca histórico:
  //   - @lid: filtra por remote_jid (não tem phone real)
  //   - número normal: filtra pela coluna gerada phone
  const histQuery = isLid
    ? sb.from("whatsapp_messages").select("body, from_me").eq("remote_jid", remoteJid)
    : sb.from("whatsapp_messages").select("body, from_me").eq("phone", phone);

  const { data: history, error: histErr } = await histQuery
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  if (histErr) {
    console.error("[claude] history error:", histErr.message);
    return;
  }

  // Monta histórico para o Claude
  const messages: ChatMsg[] = (history ?? []).map((m) => ({
    role: (m.from_me ? "assistant" : "user") as "user" | "assistant",
    content: m.body,
  }));

  const label = pushName ?? (isLid ? `lid:${phone.slice(0, 8)}` : phone);
  console.log(`[claude] chamando Claude para ${label} (${messages.length} msgs de histórico)`);

  const reply = await callClaude(messages);
  if (!reply) {
    console.warn("[claude] sem resposta gerada para", remoteJid);
    return;
  }

  // Número de envio:
  //   - @lid: Evolution API aceita o JID completo (ex: 123456@lid)
  //   - normal: usa o número puro (ex: 5511999999999)
  const sendNumber = isLid ? remoteJid : phone;

  // Envia via Evolution API
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.EVOLUTION_APIKEY ?? "",
      },
      body: JSON.stringify({ number: sendNumber, text: reply }),
    });

    if (!r.ok) {
      const detail = await r.json().catch(() => ({}));
      console.error("[claude] Evolution send error:", detail);
      return;
    }

    const evResult = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const msgKey = evResult?.key as Record<string, unknown> | undefined;

    // Salva a resposta no Supabase
    await sb.from("whatsapp_messages").insert({
      instance: EVO_INSTANCE,
      remote_jid: remoteJid,
      from_me: true,
      body: reply,
      message_id: (msgKey?.id as string) ?? null,
      ticket_id: ticketId,
    });

    console.log(`[claude] ✅ respondido para ${pushName ?? phone}: "${reply.slice(0, 60)}..."`);
  } catch (err) {
    console.error("[claude] send error:", err instanceof Error ? err.message : String(err));
  }
}
