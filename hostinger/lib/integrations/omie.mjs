import { sbFetch, readBody, erpFetch, _enc } from "../http.mjs";
import { enviarWhatsAppSac, registrarLogSac } from "../notificacoes-sac.mjs";
import { createVpClickTaskExpedicao } from "./vpclick.mjs";
import { classificarABC } from "../../../src/lib/domain/curva-abc.js";
import { parseDateBR, addDiasBR } from "../../../src/lib/domain/data-br.js";

// Auto-detect: app_key is always numeric (~10 digits); app_secret is 32-char hex.
// Handles the case where the env vars are stored in the wrong names.
function resolveOmieKeys() {
  const a = (process.env.OMIE_APP_KEY    || "").trim();
  const b = (process.env.OMIE_APP_SECRET || "").trim();
  const isKey    = (s) => /^\d{8,12}$/.test(s);
  const isSecret = (s) => /^[0-9a-fA-F]{32}$/.test(s);
  if (isKey(a) && isSecret(b)) return { key: a, secret: b };
  if (isKey(b) && isSecret(a)) return { key: b, secret: a }; // swapped
  // fallback to hardcoded defaults
  return { key: "8463170967", secret: "69e22b773842044fdb218178521cac59" };
}
const _omieKeys   = resolveOmieKeys();
const OMIE_APP_KEY    = () => _omieKeys.key;
const OMIE_APP_SECRET = () => _omieKeys.secret;

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

// classificarABC vem de ../src/lib/domain/curva-abc.js (fonte única, compartilhada com o frontend).

// ─── NF real a partir do pedido ───────────────────────────────────────────────
// O ConsultarPedido NÃO retorna o número da NF (infoCadastro só traz faturado/
// dFat etc. — verificado contra a API real), então gravar numero_pedido como
// nf_numero produz o bug de NF == Pedido em todas as linhas do pipeline.
// O caminho correto: nfconsultar/ListarNF numa janela de emissão em torno do
// dFat e casar pelo compl.nIdPedido (o filtro nIdPedido não existe no
// nfListarRequest — também verificado). ide.nNF traz o número real ("00020921"
// → 20921) e compl.cChaveNFe a chave.
async function buscarNFPorPedido(nIdPedido, dFatBR, cacheJanela) {
  if (!nIdPedido) return null;
  const hoje = new Date();
  const hojeBR = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
  const ini = dFatBR && dFatBR !== "00/00/0000" ? addDiasBR(dFatBR, -2) : addDiasBR(hojeBR, -90);
  const fim = dFatBR && dFatBR !== "00/00/0000" ? addDiasBR(dFatBR, 10) : hojeBR;
  const chaveCache = `${ini}|${fim}`;
  let registros = cacheJanela?.get(chaveCache);
  if (!registros) {
    registros = [];
    let pagina = 1, totalPaginas = 1;
    while (pagina <= totalPaginas && pagina <= 5) {
      const data = await omieCall("produtos/nfconsultar", "ListarNF", {
        pagina, registros_por_pagina: 100,
        dEmiInicial: ini, dEmiFinal: fim,
        tpNF: "1", filtrar_por_status: "N",
      });
      totalPaginas = data.total_de_paginas ?? 1;
      registros.push(...(data.nfCadastro ?? []));
      pagina++;
    }
    cacheJanela?.set(chaveCache, registros);
  }
  const nf = registros.find((n) => Number(n.compl?.nIdPedido) === Number(nIdPedido));
  if (!nf) return null;
  const bruto = String(nf.ide?.nNF || nf.compl?.nNumNF || "").trim();
  const nfNumero = /^\d+$/.test(bruto) ? String(Number(bruto)) : bruto; // "00020921" → "20921"
  if (!nfNumero) return null;
  return {
    nfNumero,
    chaveNFe: nf.compl?.cChaveNFe || null,
    dataEmissao: parseDateBR(nf.ide?.dEmi) || null,
  };
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

  // 4. Upsert NF — o número REAL da NF vem do ListarNF (o ConsultarPedido não
  // o expõe; ver buscarNFPorPedido). Sem NF localizada (pedido ainda não
  // faturado/autorizado), fica o número do pedido como placeholder — a coluna
  // é NOT NULL — e a UI o oculta enquanto nf_numero == numero_pedido_omie sem
  // chave; o sync-faturamento corrige assim que a NF existir.
  let nfReal = null;
  if (pedido.infoCadastro?.faturado === "S") {
    nfReal = await buscarNFPorPedido(codigoPedido, pedido.infoCadastro?.dFat).catch((e) => {
      console.error(`[sac/omie] buscarNFPorPedido(${codigoPedido}):`, e.message);
      return null;
    });
  }
  const nfNumero = String(nfReal?.nfNumero || pedido.cabecalho.numero_pedido || codigoPedido);
  const chaveNFe = nfReal?.chaveNFe || pedido.infoCadastro?.cChaveNFe || pedido.infoCadastro?.chave_nfe || null;
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
    data_emissao: nfReal?.dataEmissao || parseDateBR(pedido.infoCadastro?.dFat) || new Date().toISOString().slice(0, 10),
    faturado: pedido.infoCadastro?.faturado === "S",
    data_faturamento: parseDateBR(pedido.infoCadastro?.dFat) || null,
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
  // Número e chave da NF — ide.nNF vem com zero à esquerda ("00021265"), igual
  // ao tratamento em buscarNFPorPedido (mesmo formato usado no resto da tabela).
  const nfNumeroBruto = String(nfData.compl?.nNumNF || nfData.ide?.nNF || "?").trim();
  const nfNumero  = /^\d+$/.test(nfNumeroBruto) ? String(Number(nfNumeroBruto)) : nfNumeroBruto;
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
    // codigoPedido aqui é o nIdPedido INTERNO do Omie (ex.: 9210312680) — não o
    // número visível do pedido (ex.: 29060). Gravá-lo em numero_pedido_omie
    // poluía a coluna Pedido da UI; fica null e o sync-faturamento preenche o
    // número real via ConsultarPedido.
    numero_pedido_omie: null,
    dados_omie: nfData,
    updated_at: new Date().toISOString(),
  };

  let nfId;
  if (Array.isArray(existing) && existing[0]?.id) {
    nfId = existing[0].id;
    // No update, não sobrescrever com null identificadores de pedido que o
    // sync-faturamento já possa ter preenchido com o número real.
    const patchBody = { ...nfBody };
    if (patchBody.numero_pedido_omie == null) delete patchBody.numero_pedido_omie;
    if (patchBody.codigo_pedido_omie == null) delete patchBody.codigo_pedido_omie;
    await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${nfId}`, {
      method: "PATCH", body: JSON.stringify(patchBody),
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

// POST /api/sac/sync-faturamento
async function handleSyncFaturamento(req, res) {
  const jsonR = (s, o) => { res.statusCode = s; res.setHeader("Content-Type","application/json"); res.setHeader("Access-Control-Allow-Origin","*"); res.end(JSON.stringify(o)); };
  if (req.method === "OPTIONS") { res.statusCode=204; res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization"); return res.end(); }
  if (req.method !== "POST") return jsonR(405, { error: "Method Not Allowed" });

  // Consulta o Omie pelo pedido, tentando primeiro codigo_pedido (ID interno) e
  // depois numero_pedido (número visível) como fallback. Retorna o pedido
  // completo para o sync poder corrigir também numero_pedido_omie e a NF real.
  async function consultarFat(codigoInterno, numeroPedido) {
    async function tryCall(param) {
      const r = await omieCall("produtos/pedido","ConsultarPedido", param);
      const p = r?.pedido_venda_produto;
      const info = p?.infoCadastro;
      if (!info) throw new Error("infoCadastro vazio");
      return {
        faturado: info.faturado === "S",
        dataFat: parseDateBR(info.dFat),
        dFatBR: info.dFat || null,
        numeroPedidoReal: p?.cabecalho?.numero_pedido ? String(p.cabecalho.numero_pedido) : null,
        codigoPedidoReal: p?.cabecalho?.codigo_pedido ? Number(p.cabecalho.codigo_pedido) : null,
        // Devolução — o Omie já marca isso por pedido; capturado de graça
        // (mesma chamada que já checa faturamento, sem request extra).
        devolvido: info.devolvido === "S",
        devolvidoParcial: info.devolvido_parcial === "S",
      };
    }
    if (codigoInterno) {
      try { return await tryCall({ codigo_pedido: codigoInterno }); } catch(e) {
        // fallback para numero_pedido se existir
        if (numeroPedido) return await tryCall({ numero_pedido: Number(numeroPedido) });
        throw e;
      }
    }
    if (numeroPedido) return await tryCall({ numero_pedido: Number(numeroPedido) });
    throw new Error("sem identificador de pedido");
  }

  // Já faturada e checada há menos que isso? Não reconsulta no Omie agora —
  // só espera a próxima leva. O que ainda NÃO está faturado é sempre
  // checado (precisa saber assim que a NF real existir). Isso não perde a
  // detecção de devolução tardia (fica só menos "ao vivo": no máximo esse
  // atraso) — antes disso, TODA carga da tela reconsultava as ~300 NFs mais
  // recentes, mesmo as 100% resolvidas, e passou a levar >60s (timeout).
  const THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h

  try {
    // Busca todas as NFs que tenham pelo menos um dos dois identificadores.
    // chave_nfe presente ⇒ nf_numero já é o número real (veio do ListarNF);
    // chave_nfe ausente ⇒ nf_numero é o placeholder com o número do pedido.
    const nfRowsTodas = await sbFetch(
      `/rest/v1/sac_notas_fiscais?select=id,codigo_pedido_omie,numero_pedido_omie,nf_numero,chave_nfe,data_emissao,faturado,fat_checado_em` +
      `&or=(codigo_pedido_omie.not.is.null,numero_pedido_omie.not.is.null)&limit=2000`,
      {method:"GET"}
    ).then(r=>r.json()).catch(()=>[]);
    if (!Array.isArray(nfRowsTodas)||!nfRowsTodas.length) return jsonR(200,{ok:true,atualizados:0});

    const agora = Date.now();
    const nfRows = nfRowsTodas.filter((nf) => {
      if (!nf.faturado) return true; // ainda não confirmado — sempre checa
      if (!nf.fat_checado_em) return true; // nunca checado — checa
      return agora - new Date(nf.fat_checado_em).getTime() > THROTTLE_MS;
    });
    if (!nfRows.length) return jsonR(200,{ok:true,atualizados:0,adiadas:nfRowsTodas.length});

    // Janelas de ListarNF compartilhadas entre pedidos com dFat próximo — evita
    // repetir a mesma consulta para cada NF do mesmo dia.
    const cacheJanela = new Map();
    let atualizados=0; let nfCorrigidas=0; const erros=[]; const LOTE=10;
    for (let i=0;i<nfRows.length;i+=LOTE) {
      const batch=nfRows.slice(i,i+LOTE);
      await Promise.all(batch.map(async(nf)=>{
        const codigoInterno = nf.codigo_pedido_omie ? Number(nf.codigo_pedido_omie) : null;
        // numero_pedido_omie de registros antigos do ListarNF guardava o ID
        // interno (10+ dígitos) — não serve como numero_pedido no fallback.
        const numeroPedido  = nf.numero_pedido_omie && String(nf.numero_pedido_omie).length <= 8 ? nf.numero_pedido_omie : null;
        try {
          const ped = await consultarFat(codigoInterno, numeroPedido);
          const patch = {
            faturado: ped.faturado || !!nf.chave_nfe,
            data_faturamento: ped.dataFat || undefined,
            devolvido: ped.devolvido,
            devolvido_parcial: ped.devolvidoParcial,
            fat_checado_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          // Corrige a coluna Pedido com o número visível real
          if (ped.numeroPedidoReal) patch.numero_pedido_omie = ped.numeroPedidoReal;
          if (ped.codigoPedidoReal && !nf.codigo_pedido_omie) patch.codigo_pedido_omie = ped.codigoPedidoReal;
          // Corrige a coluna NF com o número real da nota (uma única vez —
          // depois disso a linha tem chave_nfe e não volta a consultar)
          if (ped.faturado && !nf.chave_nfe) {
            const nfReal = await buscarNFPorPedido(ped.codigoPedidoReal || codigoInterno, ped.dFatBR, cacheJanela).catch(()=>null);
            if (nfReal) {
              patch.nf_numero    = nfReal.nfNumero;
              patch.chave_nfe    = nfReal.chaveNFe;
              if (nfReal.dataEmissao) patch.data_emissao = nfReal.dataEmissao;
              nfCorrigidas++;
            }
          }
          await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf.id)}`,{method:"PATCH",body:JSON.stringify(patch)});
          atualizados++;
        } catch(e) {
          // Se não achamos o pedido no Omie mas a NF tem chave (veio do ListarNF),
          // ela existe de fato — marca faturado=true.
          if (nf.chave_nfe) {
            await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf.id)}`,{method:"PATCH",body:JSON.stringify({faturado:true,fat_checado_em:new Date().toISOString(),updated_at:new Date().toISOString()})}).catch(()=>{});
            atualizados++;
          } else {
            // Também marca fat_checado_em aqui — senão um pedido que falha
            // sempre (ex: excluído no Omie) seria retentado em TODA leva,
            // sem respeitar o throttle, pra sempre.
            await sbFetch(`/rest/v1/sac_notas_fiscais?id=eq.${encodeURIComponent(nf.id)}`,{method:"PATCH",body:JSON.stringify({fat_checado_em:new Date().toISOString()})}).catch(()=>{});
            erros.push(`pedido ${codigoInterno||numeroPedido}: ${e.message}`);
          }
        }
      }));
      if (i+LOTE<nfRows.length) await new Promise(r=>setTimeout(r,200));
    }
    return jsonR(200,{ok:true,atualizados,nf_corrigidas:nfCorrigidas,adiadas:nfRowsTodas.length-nfRows.length,erros:erros.length?erros:undefined});
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

export {
  resolveOmieKeys,
  OMIE_APP_KEY,
  OMIE_APP_SECRET,
  omieCall,
  buscarNFPorPedido,
  ingerirPedidoOmie,
  ingerirNFOmie,
  handleOmieWebhook,
  handleSacOmieObs,
  handleSyncFaturamento,
  handleSacOmieAnexo,
  handleSacBackfill,
};
