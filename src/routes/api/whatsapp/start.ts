import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

const EVO_URL = "http://72.61.48.156:8080";
const EVO_INSTANCE = "pv360";
const SB_URL = "https://jkbklzlbhhfnamaeislb.supabase.co";
const SB_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs";

function getEvoKey() { return process.env.EVOLUTION_APIKEY ?? "suporte123"; }
function getSb() {
  return createClient(
    SB_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? SB_FALLBACK,
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

    let phone = rawPhone.replace(/\D/g, "");
    // Auto-adiciona DDI 55 (Brasil) se o número tiver só DDD+número (10 ou 11 dígitos)
    if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) {
      phone = "55" + phone;
    }
    if (phone.length < 12 || phone.length > 13) {
      return Response.json({ error: "Numero invalido — use DDI+DDD+numero (ex: 5511999999999)" }, { status: 422 });
    }

    const remoteJid = `${phone}@s.whatsapp.net`;
    const customer = customerName?.trim() ? `${customerName.trim()} (${phone})` : phone;

    // 1. Envia primeira mensagem via Evolution API
    let evResult: Record<string, unknown> = {};
    try {
      const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: getEvoKey() },
        body: JSON.stringify({ number: phone, text }),
      });
      evResult = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        const detail = (evResult?.message as string) ?? (evResult?.error as string) ?? `HTTP ${r.status}`;
        console.error("[api/whatsapp/start] Evolution error:", evResult);
        return Response.json({ error: `Evolution API: ${detail}` }, { status: 502 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api/whatsapp/start] fetch error:", msg);
      return Response.json({ error: `Falha ao conectar na Evolution API: ${msg}` }, { status: 503 });
    }

    const sb = getSb();
    const msgKey = evResult?.key as Record<string, unknown> | undefined;

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

    if (ticketErr) console.error("[api/whatsapp/start] ticket error:", ticketErr.message);

    // 3. Salva mensagem enviada
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