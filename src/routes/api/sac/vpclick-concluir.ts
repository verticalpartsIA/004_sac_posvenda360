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

export const APIRoute = createAPIFileRoute("/api/sac/vpclick-concluir")({
  POST: async ({ request }) => {
    let body: { nf_id?: string };
    try {
      body = (await request.json()) as { nf_id?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { nf_id } = body ?? {};
    if (!nf_id) return Response.json({ error: "nf_id obrigatório" }, { status: 400 });

    try {
      // Busca o task_id vinculado à NF no pv360
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

      if (!taskId) {
        console.warn("[api/sac/vpclick-concluir] sem tarefa vinculada para NF:", nf_id);
        return Response.json({ ok: false, reason: "sem tarefa no VP Click" });
      }

      await vcFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "concluido", updated_at: new Date().toISOString() }),
      });

      console.log(`[api/sac/vpclick-concluir] tarefa ${taskId} → concluído`);
      return Response.json({ ok: true, taskId });
    } catch (err) {
      console.error("[api/sac/vpclick-concluir]", err);
      return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
  },
});
