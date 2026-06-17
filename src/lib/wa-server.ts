import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// ─── config ───────────────────────────────────────────────────────────────────
const EVO_URL     = process.env.EVOLUTION_URL ?? "http://72.61.48.156:8080";
const EVO_APIKEY  = () => process.env.EVOLUTION_APIKEY ?? (() => { throw new Error("EVOLUTION_APIKEY não definida"); })();
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "pv360";

const SB_URL = process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co";
const SB_KEY = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não definida");
  return key;
};

function getSb() {
  return createClient(SB_URL, SB_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── types ────────────────────────────────────────────────────────────────────
export type SendInput = {
  remoteJid: string;
  text: string;
};

// ─── server function: send WhatsApp text ─────────────────────────────────────
export const sendWhatsappMessage = createServerFn()
  .validator((d: SendInput) => d)
  .handler(async ({ data }) => {
    const number = data.remoteJid
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .replace("@c.us", "");

    // 1. Envia via Evolution API
    let evResult: Record<string, unknown> = {};
    try {
      const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVO_APIKEY(),
        },
        body: JSON.stringify({ number, text: data.text }),
      });
      evResult = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        console.error("[wa-server] Evolution API error:", evResult);
        throw new Error("Falha ao enviar mensagem via Evolution API");
      }
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Erro ao enviar mensagem");
    }

    // 2. Salva em whatsapp_messages (from_me = true) — com ticket_id vinculado
    const msgKey = evResult?.key as Record<string, unknown> | undefined;
    const sb = getSb();

    const { data: linked } = await sb
      .from("tickets")
      .select("id")
      .eq("whatsapp_thread_id", data.remoteJid)
      .in("status", ["aberto", "em_atendimento", "aguardando_cliente", "aguardando_interno"])
      .order("created_at", { ascending: false })
      .limit(1);
    const ticketId = linked?.[0]?.id ?? null;

    const { error } = await sb.from("whatsapp_messages").insert({
      instance: EVO_INSTANCE,
      remote_jid: data.remoteJid,
      from_me: true,
      body: data.text,
      message_id: (msgKey?.id as string) ?? null,
      ticket_id: ticketId,
      raw: evResult,
    });
    if (error) console.error("[wa-server] insert error:", error.message);

    return { ok: true };
  });
