import { sbFetch, readBody, WH_APIKEY, EVO_URL } from "../http.mjs";
import { enviarWhatsAppSac, registrarLogSac } from "../notificacoes-sac.mjs";

const CRON_KEY = () => process.env.CRON_KEY || "vp360cron_b7f2a9d1e4"; // protege o endpoint do gatilho (cron do VPS)

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

// POST /api/sac/enviar-pesquisa ← disparo manual de pesquisa via WhatsApp
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

export { handleCronHandoffs, handleSacEnviarPesquisa };
