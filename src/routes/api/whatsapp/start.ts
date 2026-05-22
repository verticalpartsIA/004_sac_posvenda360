import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

const EVO_URL = "http://72.61.48.156:8080";
const EVO_INSTANCE = "pv360";
const SB_URL = "https://jkbklzlbhhfnamaeislb.supabase.co";

function getEvoKey() { return process.env.EVOLUTION_APIKEY ?? "suporte123"; }
function getSb() {
  return createClient(
    SB_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const APIRoute = createAPIFileRoute("/api/whatsapp/start")({
  POST: async ({ request }) => {
    let body: { phone: string; text: string; customerName?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    const { phone: rawPhone, text, customerName } = body ?? {};
    if (!rawPhone || !text?.trim()) {
      return Response.json({ error: "phone e text sao obrigatorios" }, { status: 422 });
    }

    const phone = rawPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      return Response.json({ error: "Numero de telefone invalido" }, { status: 422 });
    }

    const remoteJid = `${phone}@s.whatsapp.net`;
    const customer = customerName?.trim()
      ? `${customerName.trim()} (${phone})`
      : phone;

    // 1. Envia primeira mensagem via Evolution API
    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: getEvoKey() },
      body: JSON.stringify({ number: phone, text }),
    });

    let evResult: Record<string, unknown> = {};
    evResult = (await r.json().catch(() => ({}))) as Record<string, unknown>;

    if (!r.ok) {
      console.error("[api/whatsapp/start] Evolution error:", evResult);
      return Response.json({ error: "Falha ao enviar mensagem — verifique o numero" }, { status: 502 });
    }

    const sb = getSb();

    // 2. Cria ticket vinculado ao numero
    const { data: newTicket, error: ticketErr } = await sb
      .from("tickets")
      .insert({
        customer,
        part: "A definir",
        part_code: "WA",
        reason: "Contato iniciado pela plataforma",
        occurrence_reason: "outro",
        channel: "whatsapp",
        whatsapp_thread_id: remoteJid,
        created_by: null,
        assigned_to: null,
      })
      .select("id")
      .single();

    if (ticketErr) {
      console.error("[api/whatsapp/start] ticket create error:", ticketErr.message);
    }

    // 3. Salva mensagem enviada
    const msgKey = evResult?.key as Record<string, unknown> | undefined;
    await sb.from("whatsapp_messages").insert({
      instance: EVO_INSTANCE,
      remote_jid: remoteJid,
      from_me: true,
      body: text,
      message_id: (msgKey?.id as string) ?? null,
      ticket_id: newTicket?.id ?? null,
      raw: evResult,
    });

    return Response.json({ ok: true, remoteJid, ticketId: newTicket?.id ?? null });
  },
});