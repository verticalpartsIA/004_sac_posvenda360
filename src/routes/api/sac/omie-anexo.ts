import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";
import { incluirAnexoOmie } from "@/lib/omie-client";

const sb = createClient(
  process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs",
);

type FotoItem = { url: string; nome: string };

function extFromUrl(url: string): string {
  return url.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
}

export const APIRoute = createAPIFileRoute("/api/sac/omie-anexo")({
  POST: async ({ request }) => {
    let body: { nf_id?: string; fotos?: FotoItem[] };
    try {
      body = (await request.json()) as { nf_id?: string; fotos?: FotoItem[] };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { nf_id, fotos } = body ?? {};
    if (!nf_id || !Array.isArray(fotos) || fotos.length === 0) {
      return Response.json({ error: "nf_id e fotos[] são obrigatórios" }, { status: 400 });
    }

    const { data: nf, error: nfErr } = await sb
      .from("sac_notas_fiscais")
      .select("codigo_pedido_omie")
      .eq("id", nf_id)
      .single();

    if (nfErr || !nf) return Response.json({ error: "NF não encontrada" }, { status: 404 });
    if (!nf.codigo_pedido_omie) {
      return Response.json({ error: "NF sem pedido Omie vinculado." }, { status: 422 });
    }

    // nId do pedido de venda no Omie (tabela "PC" = Proposta Comercial)
    const nId = Number(nf.codigo_pedido_omie);
    const resultados: { nome: string; ok: boolean; erro?: string }[] = [];

    for (const foto of fotos) {
      try {
        const resp = await fetch(foto.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ao baixar foto`);
        const buffer = await resp.arrayBuffer();

        const ext = extFromUrl(foto.url);
        const nomeArquivo = foto.nome.endsWith(`.${ext}`) ? foto.nome : `${foto.nome}.${ext}`;
        // cCodIntAnexo: máx 20 chars
        const codInt = `pv-${nf_id.replace(/-/g, "").slice(0, 17)}`;

        await incluirAnexoOmie(nId, "PC", nomeArquivo, ext, buffer, codInt);
        resultados.push({ nome: nomeArquivo, ok: true });
      } catch (err) {
        resultados.push({ nome: foto.nome, ok: false, erro: (err as Error).message });
      }
    }

    const falhas = resultados.filter((r) => !r.ok);
    if (falhas.length === fotos.length) {
      return Response.json({ error: "Todas as fotos falharam", detalhes: resultados }, { status: 500 });
    }

    return Response.json({ ok: true, resultados });
  },
});
