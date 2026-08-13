import { sbFetch, readBody } from "../http.mjs";

// ─── VP Click (Supabase) ──────────────────────────────────────────────────────
const VC_URL = "https://sfpnjwllcmentoocylow.supabase.co";
const VC_SERVICE_KEY = () =>
  process.env.VPCLICK_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcG5qd2xsY21lbnRvb2N5bG93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ4NDg1MSwiZXhwIjoyMDkzMDYwODUxfQ.DB5TB5VsCa-LNnoeXgfUAaPbicwlXsguK0KPdR2LArE";
const VC_LIST_TICKETS = "44400000-0000-4000-8000-000000000004"; // VP PÓS-VENDA > Atendimento > Tickets
const VC_TEAM_EXPEDICAO = "a0236505-22dc-46c8-b95c-c67346fe74cf";
const VC_TEAM_POS_VENDA = "0096f24e-185d-486c-a877-0db4190f7116";

function vcFetch(path, opts = {}) {
  const key = VC_SERVICE_KEY();
  return fetch(`${VC_URL}${path}`, {
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

// Trigger 1: cria tarefa "Expedição" no VP Click e menciona @expedição
async function createVpClickTaskExpedicao(nfId, numeroPedido, razaoSocial, previsaoEntrega) {
  try {
    // Evita duplicata
    const existR = await vcFetch(
      `/rest/v1/vpclick_integration_links?source_project=eq.pv360&source_table=eq.sac_notas_fiscais&source_record_id=eq.${nfId}&limit=1`,
      { method: "GET" }
    );
    const existRows = await existR.json().catch(() => []);
    if (Array.isArray(existRows) && existRows.length > 0) {
      return existRows[0].vpclick_task_id;
    }

    const taskR = await vcFetch("/rest/v1/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: `Expedição — Pedido ${numeroPedido} | ${razaoSocial}`,
        description: `Pedido ${numeroPedido} faturado. Confirmar dados de expedição no VP Pós-Venda 360.`,
        list_id: VC_LIST_TICKETS,
        status: "Aberto",
        priority: "Media",
        due_date: previsaoEntrega || null,
        tags: ["expedicao", "pv360"],
      }),
    });
    const taskRows = await taskR.json().catch(() => []);
    const taskId = Array.isArray(taskRows) && taskRows[0]?.id ? taskRows[0].id : null;
    if (!taskId) { console.error("[vpclick] falha ao criar tarefa:", JSON.stringify(taskRows).slice(0,200)); return null; }

    await vcFetch("/rest/v1/vpclick_integration_links", {
      method: "POST",
      body: JSON.stringify({
        source_project: "pv360", source_table: "sac_notas_fiscais",
        source_record_id: nfId, vpclick_task_id: taskId, vpclick_list_id: VC_LIST_TICKETS,
      }),
    }).catch((e) => console.error("[vpclick] integration link:", e.message));

    const membersR = await vcFetch(`/rest/v1/team_members?team_id=eq.${VC_TEAM_EXPEDICAO}&select=user_id`, { method: "GET" });
    const members = await membersR.json().catch(() => []);
    if (Array.isArray(members) && members.length > 0) {
      await vcFetch("/rest/v1/notifications", {
        method: "POST",
        body: JSON.stringify(members.map((m) => ({
          user_id: m.user_id, type: "team_mention",
          title: `@Expedição — Pedido ${numeroPedido}`,
          body: `${razaoSocial} — Confirmar expedição no VP Pós-Venda 360`,
          task_id: taskId,
        }))),
      }).catch((e) => console.error("[vpclick] notificações:", e.message));
    }

    console.log(`[vpclick] tarefa expedição criada: ${taskId} (NF ${nfId})`);
    return taskId;
  } catch (e) {
    console.error("[vpclick] createVpClickTaskExpedicao:", e.message);
    return null;
  }
}

// Trigger 3: marca tarefa VP Click como Concluído
async function concluirVpClickTask(nfId) {
  try {
    const linkR = await vcFetch(
      `/rest/v1/vpclick_integration_links?source_project=eq.pv360&source_table=eq.sac_notas_fiscais&source_record_id=eq.${nfId}&order=created_at.desc&limit=1`,
      { method: "GET" }
    );
    const links = await linkR.json().catch(() => []);
    const taskId = Array.isArray(links) && links[0]?.vpclick_task_id ? links[0].vpclick_task_id : null;
    if (!taskId) { console.warn("[vpclick] sem tarefa para NF:", nfId); return false; }
    await vcFetch(`/rest/v1/tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Concluído" }),
    });
    console.log(`[vpclick] tarefa ${taskId} → Concluído`);
    return true;
  } catch (e) {
    console.error("[vpclick] concluirVpClickTask:", e.message);
    return false;
  }
}

// POST /api/sac/vpclick-concluir
async function handleVpClickConcluir(req, res) {
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
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "Invalid JSON" }); }
  const { nf_id } = body || {};
  if (!nf_id) return json(400, { error: "Missing nf_id" });
  const ok = await concluirVpClickTask(nf_id);
  return json(200, { ok });
}

// POST /api/sac/expedicao-divergencia — Salva conferência de itens e notifica VP Click
async function handleExpedicaoDivergencia(req, res) {
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
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: "Invalid JSON" }); }
  const { nf_id, itens, obs_divergencia } = body || {};
  if (!nf_id || !Array.isArray(itens)) return json(400, { error: "Missing nf_id or itens" });

  const rows = itens.map((item) => ({
    nf_id,
    item_idx: item.item_idx,
    sku: item.sku || null,
    descricao: item.descricao || null,
    qtd_pedida: item.qtd_pedida,
    qtd_conferida: item.qtd_conferida,
    divergencia_tipo: item.divergencia_tipo || null,
    obs_divergencia: obs_divergencia || null,
    conferido_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const upsertRes = await sbFetch(
    `/rest/v1/expedicao_conferencias?on_conflict=nf_id%2Citem_idx`,
    { method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) }
  );
  if (!upsertRes.ok) {
    const err = await upsertRes.text();
    console.error("[expedicao-divergencia] upsert error:", err);
    return json(500, { error: "Erro ao salvar conferências" });
  }

  // Notifica VP Click — adiciona comentário na tarefa vinculada
  try {
    const linkRes = await sbFetch(`/rest/v1/vpclick_integration_links?nf_id=eq.${encodeURIComponent(nf_id)}&select=task_id&limit=1`);
    if (linkRes.ok) {
      const links = await linkRes.json();
      const taskId = links?.[0]?.task_id;
      if (taskId) {
        const itensDivergentes = itens.filter((i) => i.divergencia_tipo);
        const linhasDiv = itensDivergentes.map((i) =>
          `• ${i.descricao || i.sku || `Item ${i.item_idx + 1}`}: pedido ${i.qtd_pedida}, conferido ${i.qtd_conferida} (${i.divergencia_tipo})`
        ).join("\n");
        const comentario = `⚠️ DIVERGÊNCIA NA EXPEDIÇÃO\n${linhasDiv}${obs_divergencia ? `\nObs: ${obs_divergencia}` : ""}`;
        await vcFetch(`/rest/v1/task_comments`, {
          method: "POST",
          body: JSON.stringify({ task_id: taskId, body: comentario, author_id: null }),
        });
        await vcFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "aguardando_interno", updated_at: new Date().toISOString() }),
        });
      }
    }
  } catch (e) {
    console.error("[expedicao-divergencia] VP Click notify error:", e);
  }

  return json(200, { ok: true });
}

export {
  vcFetch,
  createVpClickTaskExpedicao,
  concluirVpClickTask,
  handleVpClickConcluir,
  handleExpedicaoDivergencia,
};
