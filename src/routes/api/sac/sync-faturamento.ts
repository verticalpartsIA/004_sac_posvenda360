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

async function omieCall<T>(endpoint: string, call: string, param: unknown): Promise<T> {
  const res = await fetch(`${OMIE_URL}/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: APP_KEY, app_secret: APP_SECRET, param: [param] }),
  });
  if (!res.ok) throw new Error(`Omie ${call} HTTP ${res.status}`);
  const json = await res.json() as { faultstring?: string } & T;
  if (json.faultstring) throw new Error(`Omie ${call}: ${json.faultstring}`);
  return json;
}

function parseDateBR(dateBR: string | undefined): string | null {
  if (!dateBR || dateBR === "00/00/0000") return null;
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}

export const APIRoute = createAPIFileRoute("/api/sac/sync-faturamento")({
  POST: async () => {
    // Busca todos os pedidos não faturados ainda no DB
    const { data: nfs, error } = await sb
      .from("sac_notas_fiscais")
      .select("id, codigo_pedido_omie")
      .not("codigo_pedido_omie", "is", null);

    if (error || !nfs?.length) {
      return Response.json({ ok: true, atualizados: 0 });
    }

    let atualizados = 0;
    const erros: string[] = [];

    // Processa em lotes de 5 para não sobrecarregar a API do Omie
    const lote = 5;
    for (let i = 0; i < nfs.length; i += lote) {
      const batch = nfs.slice(i, i + lote);
      await Promise.all(batch.map(async (nf) => {
        try {
          const result = await omieCall<{ pedido_venda_produto: { infoCadastro?: { faturado?: string; dFat?: string } } }>(
            "produtos/pedido",
            "ConsultarPedido",
            { codigo_pedido: Number(nf.codigo_pedido_omie) },
          );
          const info = result.pedido_venda_produto?.infoCadastro;
          const faturado = info?.faturado === "S";
          const dataFat = parseDateBR(info?.dFat);

          await sb.from("sac_notas_fiscais").update({
            faturado,
            data_faturamento: dataFat,
            updated_at: new Date().toISOString(),
          } as any).eq("id", nf.id);

          atualizados++;
        } catch (err) {
          erros.push(`${nf.codigo_pedido_omie}: ${(err as Error).message}`);
        }
      }));
      // Pequena pausa entre lotes para respeitar rate-limit do Omie
      if (i + lote < nfs.length) await new Promise((r) => setTimeout(r, 500));
    }

    return Response.json({ ok: true, atualizados, erros: erros.length ? erros : undefined });
  },
});
