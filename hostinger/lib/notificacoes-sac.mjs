import { sbFetch, WH_APIKEY } from "./http.mjs";

const EVO_URL_SAC = () => process.env.EVOLUTION_URL || "http://72.61.48.156:8080";
const EVO_INSTANCE = () => process.env.EVOLUTION_INSTANCE || "pv360";

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

export { EVO_URL_SAC, EVO_INSTANCE, enviarWhatsAppSac, registrarLogSac };
