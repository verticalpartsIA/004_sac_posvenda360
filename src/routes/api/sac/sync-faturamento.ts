// ⚠️ NÃO é isto que roda em produção. O runtime real é o Node puro em
// hostinger/server.mjs (script "start"), que tem sua própria função
// handleSyncFaturamento — mais completa (também corrige numero_pedido_omie/
// nf_numero/chave_nfe e captura devolvido/devolvido_parcial do Omie, ver
// migração 20260731000001_sac_nf_devolucao.sql) — e é ela quem
// efetivamente responde POST /api/sac/sync-faturamento. Este arquivo só é
// espelho/referência de build da rota TanStack; edite a lógica de verdade
// em server.mjs. Mesmo assim, mantido com o mesmo throttle por
// fat_checado_em pra não divergir mais do que já diverge.
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";
import { parseDateBR } from "@/lib/domain/data-br.js";

const sb = createClient(
  process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs",
);

const OMIE_URL = process.env.OMIE_API_URL ?? "https://app.omie.com.br/api/v1";
const APP_KEY = process.env.OMIE_APP_KEY ?? "8463170967";
const APP_SECRET = process.env.OMIE_APP_SECRET ?? "69e22b773842044fdb218178521cac59";

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
    // Throttle: quem já está faturado e foi checado há menos de 6h não é
    // reconsultado agora — evita bater no Omie pra todo mundo em toda carga
    // da tela. Quem ainda não foi confirmado como faturado é sempre checado.
    const THROTTLE_MS = 6 * 60 * 60 * 1000;
    const { data: todas, error } = await sb
      .from("sac_notas_fiscais")
      .select("id, codigo_pedido_omie, faturado, fat_checado_em")
      .not("codigo_pedido_omie", "is", null);

    if (error || !todas?.length) return Response.json({ ok: true, atualizados: 0 });

    const agora = Date.now();
    const nfs = todas.filter((nf) => {
      if (!nf.faturado) return true;
      if (!nf.fat_checado_em) return true;
      return agora - new Date(nf.fat_checado_em as string).getTime() > THROTTLE_MS;
    });
    if (!nfs.length) return Response.json({ ok: true, atualizados: 0, adiadas: todas.length });

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
            fat_checado_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any).eq("id", nf.id);
          atualizados++;
        } catch (err) {
          await sb.from("sac_notas_fiscais").update({
            fat_checado_em: new Date().toISOString(),
          } as any).eq("id", nf.id);
          erros.push(`pedido ${codigo}: ${(err as Error).message}`);
        }
      }));
      // Pausa breve entre lotes para respeitar rate-limit do Omie
      if (i + LOTE < nfs.length) await new Promise((r) => setTimeout(r, 200));
    }

    return Response.json({ ok: true, atualizados, adiadas: todas.length - nfs.length, erros: erros.length ? erros : undefined });
  },
});
