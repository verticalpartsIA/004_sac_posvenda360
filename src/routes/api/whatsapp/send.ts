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

export const APIRoute = createAPIFileRoute("/api/whatsapp/send")({
  POST: async ({ request }) => {
    let body: { remoteJid: string; text: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    const { remoteJid, text } = body ?? {};
    if (!remoteJid || !text?.trim()) {
      return Response.json({ error: "remoteJid e text sao obrigatorios" }, { status: 422 });
    }

    const number = remoteJid
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .replace("@c.us", "");

    let evResult: Record<string, unknown> = {};
    try {
      const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: getEvoKey() },
        body: JSON.stringify({ number, text }),
      });
      evResult = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        const detail = (evResult?.message as string) ?? (evResult?.error as string) ?? `HTTP ${r.status}`;
        return Response.json({ error: `Evolution API: ${detail}` }, { status: 502 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api/whatsapp/send] fetch error:", msg);
      return Response.json({ error: `Falha ao conectar na Evolution API: ${msg}` }, { status: 503 });
    }

    const msgKey = evResult?.key as Record<string, unknown> | undefined;
    const sb = getSb();

    // Busca o ticket aberto vinculado a este remoteJid para linkar a mensagem
    const { data: linked } = await sb
      .from("tickets")
      .select("id")
      .eq("whatsapp_thread_id", remoteJid)
      .in("status", ["aberto", "em_atendimento", "aguardando_cliente", "aguardando_interno"])
      .order("created_at", { ascending: false })
      .limit(1);
    const ticketId = linked?.[0]?.id ?? null;

    const { error: dbErr } = await sb.from("whatsapp_messages").insert({
      instance: EVO_INSTANCE,
      remote_jid: remoteJid,
      from_me: true,
      body: text,
      message_id: (msgKey?.id as string) ?? null,
      ticket_id: ticketId,
      raw: evResult,
    });
    if (dbErr) console.error("[api/whatsapp/send] db error:", dbErr.message);

    return Response.json({ ok: true, ticketId });
  },
});