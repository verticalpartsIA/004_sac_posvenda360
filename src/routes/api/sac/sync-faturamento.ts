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

type OmiePedidoListItem = {
  cabecalho: { codigo_pedido: number };
  infoCadastro?: { faturado?: string; dFat?: string };
};

async function listarTodosFaturados(): Promise<Map<number, string | null>> {
  // Busca todos os pedidos faturados via ListarPedidos com apenas_faturado: "S"
  // Faz paginação automática até buscar todos
  const faturados = new Map<number, string | null>(); // codigo_pedido → data_faturamento
  let pagina = 1;
  const porPagina = 50;

  while (true) {
    const result = await omieCall<{
      pedido_venda_produto: OmiePedidoListItem[];
      paginacao: { total_registros: number; total_de_paginas: number };
    }>("produtos/pedido", "ListarPedidos", {
      pagina,
      registros_por_pagina: porPagina,
      apenas_faturado: "S",
    });

    for (const p of result.pedido_venda_produto ?? []) {
      const codigo = p.cabecalho?.codigo_pedido;
      const dFat = parseDateBR(p.infoCadastro?.dFat);
      if (codigo) faturados.set(codigo, dFat);
    }

    if (pagina >= (result.paginacao?.total_de_paginas ?? 1)) break;
    pagina++;
    // Pausa entre páginas para respeitar rate-limit
    await new Promise((r) => setTimeout(r, 300));
  }

  return faturados;
}

export const APIRoute = createAPIFileRoute("/api/sac/sync-faturamento")({
  POST: async () => {
    try {
      // 1) Busca todos os pedidos faturados no Omie (1-2 chamadas vs 80)
      const faturadosOmie = await listarTodosFaturados();

      // 2) Busca todos os pedidos do nosso banco
      const { data: nfs, error } = await sb
        .from("sac_notas_fiscais")
        .select("id, codigo_pedido_omie");

      if (error || !nfs?.length) return Response.json({ ok: true, atualizados: 0 });

      // 3) Atualiza cada registro com o status real do Omie
      let atualizados = 0;
      for (const nf of nfs) {
        const codigo = Number(nf.codigo_pedido_omie);
        if (!codigo) continue;
        const faturado = faturadosOmie.has(codigo);
        const dataFat = faturadosOmie.get(codigo) ?? null;

        await sb.from("sac_notas_fiscais").update({
          faturado,
          data_faturamento: dataFat,
          updated_at: new Date().toISOString(),
        } as any).eq("id", nf.id);

        atualizados++;
      }

      return Response.json({ ok: true, atualizados, totalFaturadosOmie: faturadosOmie.size });
    } catch (err) {
      console.error("[sync-faturamento]", err);
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  },
});
