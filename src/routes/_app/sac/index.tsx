import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Package, Clock, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Search, X, FileCheck, FileX } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/sac/")({
  component: SacPipeline,
});

type SacNF = {
  id: string;
  nf_numero: string;
  numero_pedido_omie: string | null;
  razao_social_cliente: string;
  classe_abc: "A" | "B" | "C";
  valor_total: number;
  data_emissao: string;
  previsao_entrega: string | null;
  status_entrega: "EMITIDA" | "EM_TRANSITO" | "ENTREGUE" | "ATRASADA";
  status_pos_venda: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";
  transportadora: string | null;
  codigo_rastreio: string | null;
  pesquisa_enviada: boolean;
  faturado: boolean | null;
  data_faturamento: string | null;
};

const STATUS_CONFIG = {
  EMITIDA:     { label: "Emitida",      icon: Package,       color: "bg-blue-50 text-blue-700 border-blue-200" },
  EM_TRANSITO: { label: "Em trânsito",  icon: Clock,         color: "bg-amber-50 text-amber-700 border-amber-200" },
  ENTREGUE:    { label: "Entregue",     icon: CheckCircle2,  color: "bg-green-50 text-green-700 border-green-200" },
  ATRASADA:    { label: "Atrasada",     icon: AlertTriangle, color: "bg-red-50 text-red-700 border-red-200" },
};

const ABC_COLORS = {
  A: "bg-gold text-black",
  B: "bg-blue-100 text-blue-800",
  C: "bg-muted text-muted-foreground",
};

const SAC_STATUS_CONFIG = {
  PENDENTE:     { label: "Pendente",      color: "text-muted-foreground" },
  EM_ANDAMENTO: { label: "Em andamento",  color: "text-amber-600 font-medium" },
  CONCLUIDO:    { label: "Concluído",     color: "text-green-600 font-medium" },
};

function fmt(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SacPipeline() {
  const [nfs, setNfs] = useState<SacNF[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");
  const [filtroAbc, setFiltroAbc] = useState<string>("TODOS");
  const [busca, setBusca] = useState("");

  async function carregar(sincronizarFaturamento = false) {
    setLoading(true);
    if (sincronizarFaturamento) {
      // Sincroniza status de faturamento com Omie antes de recarregar
      await fetch("/api/sac/sync-faturamento", { method: "POST" }).catch(() => null);
    }
    const { data } = await supabase
      .from("sac_notas_fiscais")
      .select("id,nf_numero,numero_pedido_omie,razao_social_cliente,classe_abc,valor_total,data_emissao,previsao_entrega,status_entrega,status_pos_venda,transportadora,codigo_rastreio,pesquisa_enviada,faturado,data_faturamento")
      .order("data_emissao", { ascending: false })
      .limit(200);
    setNfs((data as SacNF[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void carregar(true); }, []);

  const termoBusca = busca.trim().toLowerCase();
  const filtradas = nfs.filter((n) => {
    if (filtroStatus !== "TODOS" && n.status_entrega !== filtroStatus) return false;
    if (filtroAbc !== "TODOS" && n.classe_abc !== filtroAbc) return false;
    if (termoBusca) {
      const pedido = (n.numero_pedido_omie ?? "").toLowerCase();
      const nfNum = (n.nf_numero ?? "").toLowerCase();
      const cliente = n.razao_social_cliente.toLowerCase();
      if (!pedido.includes(termoBusca) && !nfNum.includes(termoBusca) && !cliente.includes(termoBusca)) return false;
    }
    return true;
  });

  const contadores = {
    TODOS: nfs.length,
    EMITIDA: nfs.filter((n) => n.status_entrega === "EMITIDA").length,
    EM_TRANSITO: nfs.filter((n) => n.status_entrega === "EM_TRANSITO").length,
    ENTREGUE: nfs.filter((n) => n.status_entrega === "ENTREGUE").length,
    ATRASADA: nfs.filter((n) => n.status_entrega === "ATRASADA").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SAC — Pipeline de NFs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Notas fiscais emitidas com acompanhamento pós-venda</p>
        </div>
        <button onClick={() => carregar(true)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
        </button>
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["EMITIDA", "EM_TRANSITO", "ENTREGUE", "ATRASADA"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <button key={s} onClick={() => setFiltroStatus(filtroStatus === s ? "TODOS" : s)}
              className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-sm",
                filtroStatus === s ? cfg.color : "bg-card border-border")}>
              <Icon className="h-5 w-5 shrink-0" />
              <div>
                <div className="text-xl font-semibold">{contadores[s]}</div>
                <div className="text-xs opacity-70">{cfg.label}</div>
              </div>
            </button>
          );
        })}
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
            {termoBusca
              ? `Nenhum resultado para "${busca}".`
              : "Nenhuma NF encontrada. Configure o webhook no Omie para sincronizar automaticamente."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3 text-left">Nº Pedido</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-center">Classe</th>
                <th className="px-4 py-3 text-left">Emissão</th>
                <th className="px-4 py-3 text-left">Previsão</th>
                <th className="px-4 py-3 text-center">NF emitida</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">SAC</th>
                <th className="px-4 py-3 text-center">Pesquisa</th>
                <th className="px-4 py-3 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((nf) => {
                const cfg = STATUS_CONFIG[nf.status_entrega];
                const Icon = cfg.icon;
                return (
                  <tr key={nf.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold tabular-nums">{nf.numero_pedido_omie ?? nf.nf_numero ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{nf.razao_social_cliente}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", ABC_COLORS[nf.classe_abc])}>
                        {nf.classe_abc}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{nf.data_emissao ? new Date(nf.data_emissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{nf.previsao_entrega ? new Date(nf.previsao_entrega + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {nf.faturado
                        ? (
                          <span className="inline-flex flex-col items-center gap-0.5" title={nf.data_faturamento ? `Faturado em ${new Date(nf.data_faturamento + "T12:00:00").toLocaleDateString("pt-BR")}` : "Faturado"}>
                            <FileCheck className="h-4 w-4 text-green-600" />
                            {nf.data_faturamento && (
                              <span className="text-[10px] text-green-700 tabular-nums">
                                {new Date(nf.data_faturamento + "T12:00:00").toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-center gap-0.5" title="Ainda não faturado no Omie">
                            <FileX className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Não</span>
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", cfg.color)}>
                        <Icon className="h-3 w-3" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs", SAC_STATUS_CONFIG[nf.status_pos_venda ?? "PENDENTE"].color)}>
                        {SAC_STATUS_CONFIG[nf.status_pos_venda ?? "PENDENTE"].label}
                      </span>
                    </td>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
