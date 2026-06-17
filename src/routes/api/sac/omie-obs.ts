import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";
import { alterarObsPedidoFaturado } from "@/lib/omie-client";

const sb = createClient(
  process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs",
);

export const APIRoute = createAPIFileRoute("/api/sac/omie-obs")({
  POST: async ({ request }) => {
    let body: { nf_id?: string; obs?: string };
    try {
      body = (await request.json()) as { nf_id?: string; obs?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { nf_id, obs } = body ?? {};
    if (!nf_id || typeof obs !== "string" || !obs.trim()) {
      return Response.json({ error: "nf_id e obs são obrigatórios" }, { status: 400 });
    }

    const { data: nf, error: nfErr } = await sb
      .from("sac_notas_fiscais")
      .select("codigo_pedido_omie")
      .eq("id", nf_id)
      .single();

    if (nfErr || !nf) return Response.json({ error: "NF não encontrada" }, { status: 404 });
    if (!nf.codigo_pedido_omie) {
      return Response.json(
        { error: "NF sem pedido Omie vinculado. Use o Backfill para importar via Omie." },
        { status: 422 },
      );
    }

    try {
      await alterarObsPedidoFaturado(Number(nf.codigo_pedido_omie), obs.trim());

      await sb
        .from("sac_notas_fiscais")
        .update({ obs_omie: obs.trim(), updated_at: new Date().toISOString() })
        .eq("id", nf_id);

      return Response.json({ ok: true });
    } catch (err) {
      console.error("[api/sac/omie-obs]", err);
      return Response.json(
        { error: `Erro ao atualizar Omie: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  },
});
