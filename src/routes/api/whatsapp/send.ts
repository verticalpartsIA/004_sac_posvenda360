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

    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: getEvoKey() },
      body: JSON.stringify({ number, text }),
    });

    let evResult: Record<string, unknown> = {};
    evResult = (await r.json().catch(() => ({}))) as Record<string, unknown>;

    if (!r.ok) {
      console.error("[api/whatsapp/send] Evolution error:", evResult);
      return Response.json({ error: "Falha ao enviar mensagem" }, { status: 502 });
    }

    const msgKey = evResult?.key as Record<string, unknown> | undefined;
    const sb = getSb();
    const { error: dbErr } = await sb.from("whatsapp_messages").insert({
      instance: EVO_INSTANCE,
      remote_jid: remoteJid,
      from_me: true,
      body: text,
      message_id: (msgKey?.id as string) ?? null,
      raw: evResult,
    });
    if (dbErr) console.error("[api/whatsapp/send] db error:", dbErr.message);

    return Response.json({ ok: true });
  },
});