import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as auditLogRepo from "@/lib/repositories/auditLogRepo";
import * as notasFiscaisRepo from "@/lib/repositories/notasFiscaisRepo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Package, Clock, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Search, X, CheckCircle, XCircle, History, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/sac/")({
  component: SacPipeline,
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
  const { user } = useAuth();
  const [nfs, setNfs] = useState<SacNF[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");
  const [filtroAbc, setFiltroAbc] = useState<string>("TODOS");
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [modalRetiradaAberto, setModalRetiradaAberto] = useState(false);
  const [justificativaRetirada, setJustificativaRetirada] = useState("");
  const [erroRetirada, setErroRetirada] = useState("");
  const [retirando, setRetirando] = useState(false);

  async function carregar(sincronizarFaturamento = false) {
    setLoading(true);
    if (sincronizarFaturamento) {
      // Sincroniza status de faturamento com Omie antes de recarregar
      await fetch("/api/sac/sync-faturamento", { method: "POST" }).catch(() => null);
    }
    // Só o que ainda falta em pelo menos uma trilha (Entrega OU SAC). O que
    // já concluiu as duas fica na tela /sac/concluidos — não aqui. Sem
    // limite artificial: antes um .limit(200) escondia silenciosamente
    // qualquer pendência mais antiga que as 200 NFs mais recentes.
    const { data } = await notasFiscaisRepo.listPendentes();
    setNfs((data as SacNF[]) ?? []);
    setSelecionadas([]);
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

  const idsFiltradas = filtradas.map((nf) => nf.id);
  const todasVisiveisSelecionadas = idsFiltradas.length > 0 && idsFiltradas.every((id) => selecionadas.includes(id));
  const selecionadasDetalhe = nfs.filter((nf) => selecionadas.includes(nf.id));

  function toggleSelecionada(id: string) {
    setSelecionadas((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
  }

  function toggleTodasVisiveis() {
    setSelecionadas((atuais) => {
      if (todasVisiveisSelecionadas) return atuais.filter((id) => !idsFiltradas.includes(id));
      return Array.from(new Set([...atuais, ...idsFiltradas]));
    });
  }

  function abrirRetirada() {
    setErroRetirada("");
    setJustificativaRetirada("");
    setModalRetiradaAberto(true);
  }

  function fecharRetirada() {
    if (retirando) return;
    setModalRetiradaAberto(false);
    setErroRetirada("");
    setJustificativaRetirada("");
  }

  async function confirmarRetirada() {
    const motivo = justificativaRetirada.trim();
    if (selecionadas.length === 0) return;
    if (motivo.length < 10) {
      setErroRetirada("Informe uma justificativa com pelo menos 10 caracteres.");
      return;
    }

    setRetirando(true);
    setErroRetirada("");
    const agora = new Date().toISOString();
    const actorName = (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? "Usuário";
    const { error } = await notasFiscaisRepo.retirarDaFila(selecionadas, {
      sac_retirado: true,
      sac_retirado_em: agora,
      sac_retirado_por: user?.id ?? null,
      sac_retirado_por_nome: actorName,
      sac_retirado_justificativa: motivo,
      updated_at: agora,
    });

    if (error) {
      setErroRetirada("Não foi possível retirar as linhas selecionadas. Tente novamente.");
      setRetirando(false);
      return;
    }

    await Promise.all(selecionadasDetalhe.map((nf) => auditLogRepo.registrar({
      entity_type: "sac_nf",
      entity_id: nf.id,
      action: "sac_retirado_da_fila",
      actor_id: user?.id ?? null,
      actor_name: actorName,
      payload: {
        justificativa: motivo,
        nf_numero: nf.nf_numero,
        numero_pedido_omie: nf.numero_pedido_omie,
        cliente: nf.razao_social_cliente,
      },
    })));

    setNfs((atuais) => atuais.filter((nf) => !selecionadas.includes(nf.id)));
    setSelecionadas([]);
    setModalRetiradaAberto(false);
    setJustificativaRetirada("");
    setRetirando(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SAC — Pendências</h1>
          <p className="text-sm text-muted-foreground mt-0.5">NFs com Entrega e/ou SAC ainda não concluídos</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/sac/concluidos" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <History className="h-4 w-4" /> Concluídos
          </Link>
          <button onClick={() => carregar(true)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
          </button>
        </div>
      </div>

      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar ocorrências"
          placeholder="Buscar por Nº pedido, NF ou cliente..."
          className="w-full rounded-lg border bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
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

      {selecionadas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">{selecionadas.length} linha(s) selecionada(s)</span>
          <button
            type="button"
            onClick={abrirRetirada}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-background px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            <Trash2 className="h-4 w-4" /> Remover do SAC
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            {termoBusca
              ? `Nenhum resultado para "${busca}".`
              : "Nenhuma pendência! Todas as NFs têm Entrega e SAC concluídos. 🎉"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as linhas visíveis"
                    checked={todasVisiveisSelecionadas}
                    onChange={toggleTodasVisiveis}
                    className="h-4 w-4 rounded border-border accent-gold"
                  />
                </th>
                <th className="px-4 py-3 text-left">NF</th>
                <th className="px-4 py-3 text-left">Pedido</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-center">Classe</th>
                <th className="px-4 py-3 text-left">Emissão</th>
                <th className="px-4 py-3 text-left">Previsão</th>
                <th className="px-4 py-3 text-center">Faturado</th>
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
                const selecionada = selecionadas.includes(nf.id);
                return (
                  <tr key={nf.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", selecionada && "bg-amber-50/50")}>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar NF ${nf.nf_numero}`}
                        checked={selecionada}
                        onChange={() => toggleSelecionada(nf.id)}
                        className="h-4 w-4 rounded border-border accent-gold"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {/* Sem chave NFe e com nf_numero igual ao pedido = placeholder da
                          ingestão (o número real chega via sync-faturamento) — não
                          exibir o nº do pedido fingindo ser NF. */}
                      {nf.chave_nfe || (nf.nf_numero && nf.nf_numero !== nf.numero_pedido_omie)
                        ? <span className="font-semibold tabular-nums">{nf.nf_numero}</span>
                        : <span className="text-muted-foreground" title="NF ainda não sincronizada do Omie">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="tabular-nums">{nf.numero_pedido_omie ?? "—"}</span>
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
                          <span className="inline-flex flex-col items-center gap-0.5"
                            title={nf.data_faturamento ? `Faturado em ${new Date(nf.data_faturamento + "T12:00:00").toLocaleDateString("pt-BR")}` : "Faturado"}>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-[10px] font-semibold text-green-700">Sim</span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-center gap-0.5" title="Ainda não faturado no Omie">
                            <XCircle className="h-4 w-4 text-red-400" />
                            <span className="text-[10px] text-red-500">Não</span>
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

      {modalRetiradaAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Remover linhas do SAC</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  As linhas sairão desta fila, mas continuarão registradas no histórico.
                </p>
              </div>
              <button type="button" onClick={fecharRetirada} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              {selecionadas.length} linha(s) selecionada(s)
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Justificativa *</span>
              <textarea
                value={justificativaRetirada}
                onChange={(e) => setJustificativaRetirada(e.target.value)}
                rows={4}
                className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Explique por que essas linhas devem sair da fila SAC..."
              />
            </label>

            {erroRetirada && <p className="mt-2 text-sm text-destructive">{erroRetirada}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={fecharRetirada} disabled={retirando} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRetirada}
                disabled={retirando}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" /> {retirando ? "Removendo..." : "Confirmar remoção"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
