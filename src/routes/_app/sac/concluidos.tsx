import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as notasFiscaisRepo from "@/lib/repositories/notasFiscaisRepo";
import { cn } from "@/lib/utils";
import { ExternalLink, Search, X, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/sac/concluidos")({
  component: SacConcluidos,
});

type SacNF = {
  id: string;
  nf_numero: string;
  chave_nfe: string | null;
  numero_pedido_omie: string | null;
  razao_social_cliente: string;
  classe_abc: "A" | "B" | "C";
  valor_total: number;
  data_emissao: string;
  data_entrega_real: string | null;
  data_pos_venda: string | null;
  responsavel_pos_venda: string | null;
  pesquisa_enviada: boolean;
};

const ABC_COLORS = {
  A: "bg-gold text-black",
  B: "bg-blue-100 text-blue-800",
  C: "bg-muted text-muted-foreground",
};

export default function SacConcluidos() {
  const [nfs, setNfs] = useState<SacNF[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroAbc, setFiltroAbc] = useState<string>("TODOS");
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLoading(true);
    // Aqui não precisa sincronizar faturamento com o Omie — é histórico de
    // quem já concluiu as duas trilhas (Entrega e SAC), não muda mais.
    const { data } = await notasFiscaisRepo.listConcluidas();
    setNfs((data as SacNF[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void carregar(); }, []);

  const termoBusca = busca.trim().toLowerCase();
  const filtradas = nfs.filter((n) => {
    if (filtroAbc !== "TODOS" && n.classe_abc !== filtroAbc) return false;
    if (termoBusca) {
      const pedido = (n.numero_pedido_omie ?? "").toLowerCase();
      const nfNum = (n.nf_numero ?? "").toLowerCase();
      const cliente = n.razao_social_cliente.toLowerCase();
      if (!pedido.includes(termoBusca) && !nfNum.includes(termoBusca) && !cliente.includes(termoBusca)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SAC — Concluídos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Histórico de NFs com Entrega e SAC já concluídos</p>
        </div>
        <Link to="/sac" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Voltar às pendências
        </Link>
      </div>

      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por Nº pedido, NF ou cliente..."
          className="w-full rounded-lg border bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filtro ABC */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Curva ABC:</span>
        {(["TODOS", "A", "B", "C"] as const).map((abc) => (
          <button key={abc} onClick={() => setFiltroAbc(abc)}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-all",
              filtroAbc === abc
                ? abc === "TODOS" ? "bg-foreground text-background" : ABC_COLORS[abc as "A"|"B"|"C"]
                : "bg-muted text-muted-foreground hover:bg-muted/70")}>
            {abc === "TODOS" ? "Todos" : `Classe ${abc}`}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filtradas.length} registro(s)</span>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            {termoBusca ? `Nenhum resultado para "${busca}".` : "Nenhuma NF concluída ainda."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3 text-left">NF</th>
                <th className="px-4 py-3 text-left">Pedido</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-center">Classe</th>
                <th className="px-4 py-3 text-left">Emissão</th>
                <th className="px-4 py-3 text-left">Entregue em</th>
                <th className="px-4 py-3 text-left">SAC concluído em</th>
                <th className="px-4 py-3 text-left">Responsável SAC</th>
                <th className="px-4 py-3 text-center">Pesquisa</th>
                <th className="px-4 py-3 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((nf) => (
                <tr key={nf.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    {nf.chave_nfe || (nf.nf_numero && nf.nf_numero !== nf.numero_pedido_omie)
                      ? <span className="font-semibold tabular-nums">{nf.nf_numero}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3"><span className="tabular-nums">{nf.numero_pedido_omie ?? "—"}</span></td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{nf.razao_social_cliente}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", ABC_COLORS[nf.classe_abc])}>
                      {nf.classe_abc}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{nf.data_emissao ? new Date(nf.data_emissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{nf.data_entrega_real ? new Date(nf.data_entrega_real + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{nf.data_pos_venda ? new Date(nf.data_pos_venda + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3">{nf.responsavel_pos_venda ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {nf.pesquisa_enviada
                      ? <span className="text-green-600 text-xs">✓ Enviada</span>
                      : <span className="text-muted-foreground text-xs">Pendente</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link to="/sac/$nf" params={{ nf: nf.id }}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                      <ExternalLink className="h-3 w-3" /> Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
