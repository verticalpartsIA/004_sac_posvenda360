import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs",
);

const OMIE_URL = process.env.OMIE_API_URL ?? "https://app.omie.com.br/api/v1";
const APP_KEY = process.env.OMIE_APP_KEY ?? "8463170967";
const APP_SECRET = process.env.OMIE_APP_SECRET ?? "69e22b773842044fdb218178521cac59";

function parseDateBR(s: string | undefined | null): string | null {
  if (!s || s === "00/00/0000") return null;
  const [d, m, y] = s.split("/");
  return `${y}-${m}-${d}`;
}

async function consultarFaturamento(codigoPedido: number): Promise<{ faturado: boolean; dataFat: string | null }> {
  const res = await fetch(`${OMIE_URL}/produtos/pedido/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call: "ConsultarPedido",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ codigo_pedido: codigoPedido }],
    }),
  });
  const json = await res.json() as {
    faultstring?: string;
    pedido_venda_produto?: { infoCadastro?: { faturado?: string; dFat?: string } };
  };
  if (json.faultstring) throw new Error(json.faultstring);
  const info = json.pedido_venda_produto?.infoCadastro;
  return {
    faturado: info?.faturado === "S",
    dataFat: parseDateBR(info?.dFat),
  };
}

export const APIRoute = createAPIFileRoute("/api/sac/sync-faturamento")({
  POST: async () => {
    const { data: nfs, error } = await sb
      .from("sac_notas_fiscais")
      .select("id, codigo_pedido_omie")
      .not("codigo_pedido_omie", "is", null);

    if (error || !nfs?.length) return Response.json({ ok: true, atualizados: 0 });

    let atualizados = 0;
    const erros: string[] = [];

    // Processa em lotes de 10 em paralelo (~2s para 80 pedidos)
    const LOTE = 10;
    for (let i = 0; i < nfs.length; i += LOTE) {
      const batch = nfs.slice(i, i + LOTE);
      await Promise.all(batch.map(async (nf) => {
        const codigo = Number(nf.codigo_pedido_omie);
        if (!codigo) return;
        try {
          const { faturado, dataFat } = await consultarFaturamento(codigo);
          await sb.from("sac_notas_fiscais").update({
            faturado,
            data_faturamento: dataFat,
            updated_at: new Date().toISOString(),
          } as any).eq("id", nf.id);
          atualizados++;
        } catch (err) {
          erros.push(`pedido ${codigo}: ${(err as Error).message}`);
        }
      }));
      // Pausa breve entre lotes para respeitar rate-limit do Omie
      if (i + LOTE < nfs.length) await new Promise((r) => setTimeout(r, 200));
    }

    return Response.json({ ok: true, atualizados, erros: erros.length ? erros : undefined });
  },
});
