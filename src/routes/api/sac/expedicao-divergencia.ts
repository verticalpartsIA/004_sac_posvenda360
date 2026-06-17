import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs",
);

const VC_URL = "https://sfpnjwllcmentoocylow.supabase.co";
const VC_KEY =
  process.env.VPCLICK_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcG5qd2xsY21lbnRvb2N5bG93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ4NDg1MSwiZXhwIjoyMDkzMDYwODUxfQ.DB5TB5VsCa-LNnoeXgfUAaPbicwlXsguK0KPdR2LArE";

async function vcFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${VC_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey: VC_KEY,
      Authorization: `Bearer ${VC_KEY}`,
      Prefer: "return=representation",
      ...(opts.headers ?? {}),
    },
  });
}

type ItemConferencia = {
  item_idx: number;
  sku: string | null;
  descricao: string | null;
  qtd_pedida: number;
  qtd_conferida: number;
  divergencia_tipo: "FALTA" | "EXCESSO" | "ZERADO" | null;
};

export const APIRoute = createAPIFileRoute("/api/sac/expedicao-divergencia")({
  POST: async ({ request }) => {
    let body: { nf_id?: string; itens?: ItemConferencia[]; obs_divergencia?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { nf_id, itens, obs_divergencia } = body ?? {};
    if (!nf_id || !Array.isArray(itens)) {
      return Response.json({ error: "nf_id e itens são obrigatórios" }, { status: 400 });
    }

    const rows = itens.map((item) => ({
      nf_id,
      item_idx: item.item_idx,
      sku: item.sku ?? null,
      descricao: item.descricao ?? null,
      qtd_pedida: item.qtd_pedida,
      qtd_conferida: item.qtd_conferida,
      divergencia_tipo: item.divergencia_tipo ?? null,
      obs_divergencia: obs_divergencia ?? null,
      conferido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await (sb as ReturnType<typeof createClient>)
      .from("expedicao_conferencias")
      .upsert(rows, { onConflict: "nf_id,item_idx" });

    if (upsertErr) {
      console.error("[api/sac/expedicao-divergencia] upsert:", upsertErr);
      return Response.json({ error: "Erro ao salvar conferências" }, { status: 500 });
    }

    // Notifica VP Click via comentário na tarefa vinculada
    try {
      const { data: links } = await sb
        .from("vpclick_integration_links" as never)
        .select("vpclick_task_id")
        .eq("source_project", "pv360")
        .eq("source_table", "sac_notas_fiscais")
        .eq("source_record_id", nf_id)
        .order("created_at", { ascending: false })
        .limit(1);

      const taskId = Array.isArray(links) && links[0]?.vpclick_task_id
        ? links[0].vpclick_task_id
        : null;

      if (taskId) {
        const itensDivergentes = itens.filter((i) => i.divergencia_tipo);
        const linhas = itensDivergentes
          .map(
            (i) =>
              `• ${i.descricao ?? i.sku ?? `Item ${i.item_idx + 1}`}: pedido ${i.qtd_pedida}, conferido ${i.qtd_conferida} (${i.divergencia_tipo})`,
          )
          .join("\n");
        const comentario = `⚠️ DIVERGÊNCIA NA EXPEDIÇÃO\n${linhas}${obs_divergencia ? `\nObs: ${obs_divergencia}` : ""}`;

        await vcFetch("/rest/v1/task_comments", {
          method: "POST",
          body: JSON.stringify({ task_id: taskId, body: comentario, author_id: null }),
        }).catch((e) => console.warn("[expedicao-divergencia] VP Click comentário:", e));

        await vcFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "aguardando_interno", updated_at: new Date().toISOString() }),
        }).catch((e) => console.warn("[expedicao-divergencia] VP Click status:", e));
      }
    } catch (e) {
      console.warn("[api/sac/expedicao-divergencia] VP Click notify:", e);
    }

    return Response.json({ ok: true });
  },
});
