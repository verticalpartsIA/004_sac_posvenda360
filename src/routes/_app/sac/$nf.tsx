import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ArrowLeft, Save, Truck, MessageCircle, Phone, CheckCircle2, Clock, Package, AlertTriangle, Send, Eye, EyeOff, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_app/sac/$nf")({
  component: SacNFDetalhe,
});

// Feriados nacionais fixos (MM-DD) + Corpus Christi calculado dinamicamente
function feriadosBR(year: number): Set<string> {
  const fixos = [
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`,
    `${year}-09-07`, `${year}-10-12`, `${year}-11-02`,
    `${year}-11-15`, `${year}-12-25`,
  ];
  // Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(year, month - 1, day);
  const offset = (d: number) => new Date(pascoa.getTime() + d * 86400000);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  const moveis = [
    fmt(offset(-48)), // Carnaval (seg)
    fmt(offset(-47)), // Carnaval (ter)
    fmt(offset(-2)),  // Sexta-feira Santa
    fmt(pascoa),      // Páscoa
    fmt(offset(60)),  // Corpus Christi
  ];
  return new Set([...fixos, ...moveis]);
}

function addBusinessDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T12:00:00"); // evita timezone shift
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const feriados = feriadosBR(date.getFullYear());
    if (feriados.has(date.toISOString().slice(0, 10))) continue;
    added++;
  }
  return date.toISOString().slice(0, 10);
}

type NFDetalhe = {
  id: string;
  nf_numero: string;
  razao_social_cliente: string;
  cnpj_cliente: string;
  classe_abc: "A" | "B" | "C";
  valor_total: number;
  data_emissao: string | null;
  previsao_entrega: string | null;
  status_entrega: "EMITIDA" | "EM_TRANSITO" | "ENTREGUE" | "ATRASADA";
  transportadora: string | null;
  codigo_rastreio: string | null;
  // expedição
  data_coleta: string | null;
  transportadora_entregou: boolean | null;
  data_entrega_real: string | null;
  comprovante_entrega: string | null;
  // pós-venda
  previsao_pos_venda: string | null;
  status_pos_venda: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";
  data_pos_venda: string | null;
  responsavel_pos_venda: string | null;
  obs_omie: string | null;
  numero_pedido_omie: string | null;
  sac_clientes: {
    nome_fantasia: string | null;
    whatsapp: string | null;
    email: string | null;
    telefone: string | null;
    contato: string | null;
  } | null;
};

type OmieItem = {
  produto?: {
    codigo_produto?: string;
    descricao?: string;
    quantidade?: number;
  };
};

type Pesquisa = {
  id: string;
  produto_correto: boolean | null;
  atendeu_prazo: boolean | null;
  recebeu_nota_boleto: boolean | null;
  produto_atendeu_expectativas: boolean | null;
  avaliacao_atendimento: number | null;
  nps_score: number | null;
  dificuldade_compra: boolean | null;
  pontos_positivos: string | null;
  pontos_melhoria: string | null;
  compraria_novamente: boolean | null;
  sugestoes: string | null;
  observacoes: string | null;
  respondida_em: string | null;
};

const STATUS_CONFIG = {
  EMITIDA:     { label: "Emitida",     icon: Package,       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  EM_TRANSITO: { label: "Em trânsito", icon: Clock,         cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ENTREGUE:    { label: "Entregue",    icon: CheckCircle2,  cls: "bg-green-50 text-green-700 border-green-200" },
  ATRASADA:    { label: "Atrasada",    icon: AlertTriangle, cls: "bg-red-50 text-red-700 border-red-200" },
};

const ABC_CLS = { A: "bg-gold text-black", B: "bg-blue-100 text-blue-800", C: "bg-muted text-muted-foreground" };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR");
}

// Botão Sim/Não/Não respondeu
function SimNao({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex gap-2">
      {([true, false, null] as const).map((v) => (
        <button key={String(v)} type="button"
          onClick={() => onChange(v === value ? null : v)}
          className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
            value === v
              ? v === true ? "bg-green-500 text-white border-green-500"
                : v === false ? "bg-red-500 text-white border-red-500"
                : "bg-muted text-muted-foreground"
              : "border-border hover:bg-muted")}>
          {v === true ? "Sim" : v === false ? "Não" : "—"}
        </button>
      ))}
    </div>
  );
}

// Estrelas 1-5
function Estrelas({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={cn("text-xl transition-all hover:scale-110", n <= (value ?? 0) ? "text-gold" : "text-muted-foreground/30")}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function SacNFDetalhe() {
  const { nf: nfId } = useParams({ from: "/_app/sac/$nf" });
  const { user } = useAuth();
  const [nf, setNf] = useState<NFDetalhe | null>(null);
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulário Expedição
  const [exp, setExp] = useState({
    tipo_entrega: "TRANSPORTADORA" as "TRANSPORTADORA" | "ENTREGA_PROPRIA" | "RETIRADA_CLIENTE",
    transportadora: "",
    codigo_rastreio: "",
    retirado_por: "",
    data_coleta: "",
    transportadora_entregou: null as boolean | null,
    data_entrega_real: "",
    comprovante_entrega: "",
    status_entrega: "EMITIDA" as NFDetalhe["status_entrega"],
  });
  const [savingExp, setSavingExp] = useState(false);
  const [msgExp, setMsgExp] = useState("");

  // Contato editável (WhatsApp / Email / nome do contato)
  const [contato, setContato] = useState({ whatsapp: "", email: "", contato_nome: "" });
  const [savingContato, setSavingContato] = useState(false);
  const [msgContato, setMsgContato] = useState("");

  // Formulário SAC
  const [sac, setSac] = useState({
    previsao_pos_venda: "",
    status_pos_venda: "PENDENTE" as "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO",
    data_pos_venda: "",
    responsavel_pos_venda: "",
  });
  const [savingSac, setSavingSac] = useState(false);
  const [msgSac, setMsgSac] = useState("");

  // Formulário Pesquisa
  const [pesq, setPesq] = useState<Omit<Pesquisa, "id" | "respondida_em">>({
    produto_correto: null,
    atendeu_prazo: null,
    recebeu_nota_boleto: null,
    produto_atendeu_expectativas: null,
    avaliacao_atendimento: null,
    nps_score: null,
    dificuldade_compra: null,
    pontos_positivos: "",
    pontos_melhoria: "",
    compraria_novamente: null,
    sugestoes: "",
    observacoes: "",
  });
  const [savingPesq, setSavingPesq] = useState(false);
  const [msgPesq, setMsgPesq] = useState("");

  // Valor sempre oculto ao abrir
  const [showValor, setShowValor] = useState(false);

  // Observações para Omie
  const [obsOmie, setObsOmie] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const [msgObs, setMsgObs] = useState("");

  // Conferência de itens (Poka-Yoke)
  const [conferencias, setConferencias] = useState<Record<number, number | null>>({});
  const [obsDiv, setObsDiv] = useState("");
  const [divergenciaReportada, setDivergenciaReportada] = useState(false);
  const [reportandoDiv, setReportandoDiv] = useState(false);
  const [msgDiv, setMsgDiv] = useState("");

  useEffect(() => { void carregar(); }, [nfId]);

  async function carregar() {
    setLoading(true);
    const [{ data: nfData }, { data: pesquisaData }] = await Promise.all([
      supabase.from("sac_notas_fiscais")
        .select("*, obs_omie, dados_omie, sac_clientes(nome_fantasia,whatsapp,email,telefone,contato)")
        .eq("id", nfId).single(),
      supabase.from("sac_pesquisas").select("*").eq("nf_id", nfId).maybeSingle(),
    ]);

    if (nfData) {
      const n = nfData as NFDetalhe;
      setNf(n);
      setExp({
        tipo_entrega: (n as any).tipo_entrega ?? "TRANSPORTADORA",
        transportadora: n.transportadora ?? "",
        codigo_rastreio: n.codigo_rastreio ?? "",
        retirado_por: (n as any).retirado_por ?? "",
        data_coleta: n.data_coleta ?? "",
        transportadora_entregou: n.transportadora_entregou ?? null,
        data_entrega_real: n.data_entrega_real ?? "",
        comprovante_entrega: n.comprovante_entrega ?? "",
        status_entrega: n.status_entrega,
      });
      setSac({
        previsao_pos_venda: n.previsao_pos_venda ?? "",
        status_pos_venda: n.status_pos_venda ?? "PENDENTE",
        data_pos_venda: n.data_pos_venda ?? "",
        responsavel_pos_venda: n.responsavel_pos_venda ?? "",
      });
      setContato({
        whatsapp: n.sac_clientes?.whatsapp ?? n.sac_clientes?.telefone ?? "",
        email: n.sac_clientes?.email ?? "",
        contato_nome: n.sac_clientes?.contato ?? "",
      });
      setObsOmie(n.obs_omie ?? "");
    }

    if (pesquisaData) {
      const p = pesquisaData as Pesquisa;
      setPesquisa(p);
      setPesq({
        produto_correto: p.produto_correto,
        atendeu_prazo: p.atendeu_prazo,
        recebeu_nota_boleto: p.recebeu_nota_boleto,
        produto_atendeu_expectativas: p.produto_atendeu_expectativas,
        avaliacao_atendimento: p.avaliacao_atendimento,
        nps_score: p.nps_score,
        dificuldade_compra: p.dificuldade_compra,
        pontos_positivos: p.pontos_positivos ?? "",
        pontos_melhoria: p.pontos_melhoria ?? "",
        compraria_novamente: p.compraria_novamente,
        sugestoes: p.sugestoes ?? "",
        observacoes: p.observacoes ?? "",
      });
    }

    setLoading(false);
  }

  async function writeAuditSac(action: string, payload?: Record<string, unknown>) {
    await supabase.from("audit_log").insert({
      entity_type: "sac_nf",
      entity_id: nfId,
      action,
      actor_id: user?.id ?? null,
      actor_name: user?.email ?? null,
      payload: payload ?? null,
    }).then(({ error }) => {
      if (error) console.error("[sac-audit]", error);
    });
  }

  async function salvarExpedicao() {
    // Poka-Yoke: bloqueia se conferência incompleta ou divergência não reportada
    const itensGuard = ((nf as any)?.dados_omie?.det ?? []) as OmieItem[];
    if (itensGuard.length > 0) {
      const todasOk = itensGuard.every((_, i) => conferencias[i] != null);
      const temDivGuard = itensGuard.some((item, i) => {
        const qtd = item.produto?.quantidade ?? 0;
        return conferencias[i] != null && conferencias[i] !== qtd;
      });
      if (!todasOk) { setMsgExp("Confira todos os itens antes de salvar."); return; }
      if (temDivGuard && !divergenciaReportada) { setMsgExp("Reporte a divergência antes de salvar."); return; }
    }
    setSavingExp(true);
    setMsgExp("");
    const { error } = await supabase.from("sac_notas_fiscais").update({
      tipo_entrega: exp.tipo_entrega,
      transportadora: exp.tipo_entrega === "TRANSPORTADORA" ? (exp.transportadora || null) : null,
      codigo_rastreio: exp.tipo_entrega === "TRANSPORTADORA" ? (exp.codigo_rastreio || null) : null,
      retirado_por: exp.tipo_entrega === "RETIRADA_CLIENTE" ? (exp.retirado_por || null) : null,
      data_coleta: exp.data_coleta || null,
      transportadora_entregou: exp.tipo_entrega === "TRANSPORTADORA" ? exp.transportadora_entregou : null,
      data_entrega_real: exp.data_entrega_real || null,
      comprovante_entrega: exp.comprovante_entrega || null,
      status_entrega: exp.status_entrega,
      updated_at: new Date().toISOString(),
    } as any).eq("id", nfId);

    if (error) {
      setMsgExp("Erro ao salvar.");
      setSavingExp(false);
      return;
    }

    void writeAuditSac("expedicao_salva", { status_entrega: exp.status_entrega, tipo_entrega: exp.tipo_entrega });
    setMsgExp("Salvo! Criando tarefa no VP Click...");
    const { error: fnErr } = await supabase.functions.invoke("pv360-delivery-event", {
      body: { nf_id: nfId },
    }).catch(() => ({ data: null, error: new Error("indisponível") }));

    setMsgExp(fnErr ? "Salvo! (VP Click indisponível)" : "Salvo! Tarefa criada no VP Click.");
    void carregar();
    setSavingExp(false);
  }

  async function salvarContato() {
    if (!nf?.cnpj_cliente) return;
    setSavingContato(true); setMsgContato("");
    const { error } = await supabase.from("sac_clientes").update({
      whatsapp: contato.whatsapp || null,
      email: contato.email || null,
      contato: contato.contato_nome || null,
      updated_at: new Date().toISOString(),
    }).eq("cnpj", nf.cnpj_cliente);
    setMsgContato(error ? "Erro ao salvar." : "Salvo!");
    setSavingContato(false);
  }

  async function salvarSac() {
    setSavingSac(true);
    setMsgSac("");
    const { error } = await supabase.from("sac_notas_fiscais").update({
      previsao_pos_venda: sac.previsao_pos_venda || null,
      status_pos_venda: sac.status_pos_venda,
      data_pos_venda: sac.data_pos_venda || null,
      responsavel_pos_venda: sac.responsavel_pos_venda || null,
      updated_at: new Date().toISOString(),
    }).eq("id", nfId);
    if (!error) void writeAuditSac("sac_salvo", { status_pos_venda: sac.status_pos_venda, responsavel: sac.responsavel_pos_venda || null });
    if (!error && sac.status_pos_venda === "CONCLUIDO") {
      await fetch("/api/sac/vpclick-concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: nfId }),
      }).catch(() => {});
    }
    setMsgSac(error ? "Erro ao salvar." : "Salvo com sucesso!");
    setSavingSac(false);
  }

  async function enviarObsOmie() {
    if (!obsOmie.trim()) return;
    setSavingObs(true);
    setMsgObs("");
    try {
      const res = await fetch("/api/sac/omie-obs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: nfId, obs: obsOmie }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) void writeAuditSac("obs_enviada_omie", { obs_preview: obsOmie.slice(0, 100) });
      setMsgObs(!res.ok ? (data.error ?? "Erro ao enviar.") : "Enviado para o Omie com sucesso!");
    } catch {
      setMsgObs("Erro de conexão com o servidor.");
    }
    setSavingObs(false);
  }

  async function reportarDivergencia() {
    setReportandoDiv(true);
    setMsgDiv("");
    const itens = ((nf as any)?.dados_omie?.det ?? []) as OmieItem[];
    const payload = itens.map((item, i) => {
      const qtdPedida = item.produto?.quantidade ?? 0;
      const qtdConf = conferencias[i] ?? 0;
      let divergencia_tipo: string | null = null;
      if (qtdConf !== qtdPedida) {
        divergencia_tipo = qtdConf === 0 ? "ZERADO" : qtdConf > qtdPedida ? "EXCESSO" : "FALTA";
      }
      return {
        item_idx: i,
        sku: item.produto?.codigo_produto ?? null,
        descricao: item.produto?.descricao ?? null,
        qtd_pedida: qtdPedida,
        qtd_conferida: qtdConf,
        divergencia_tipo,
      };
    });
    try {
      const res = await fetch("/api/sac/expedicao-divergencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: nfId, itens: payload, obs_divergencia: obsDiv }),
      });
      if (!res.ok) { setMsgDiv("Erro ao reportar divergência."); }
      else {
        setDivergenciaReportada(true);
        setMsgDiv("Divergência reportada — time notificado.");
        void writeAuditSac("divergencia_reportada", {
          qtd_divergentes: payload.filter((p) => p.divergencia_tipo).length,
          itens: payload.filter((p) => p.divergencia_tipo).map((p) => ({ sku: p.sku, descricao: p.descricao, divergencia_tipo: p.divergencia_tipo })),
        });
      }
    } catch { setMsgDiv("Erro de conexão."); }
    setReportandoDiv(false);
  }

  async function salvarPesquisa() {
    setSavingPesq(true);
    setMsgPesq("");
    const dados = {
      ...pesq,
      pontos_positivos: pesq.pontos_positivos || null,
      pontos_melhoria: pesq.pontos_melhoria || null,
      sugestoes: pesq.sugestoes || null,
      observacoes: pesq.observacoes || null,
      respondida_em: new Date().toISOString(),
    };
    let error;
    if (pesquisa?.id) {
      ({ error } = await supabase.from("sac_pesquisas").update(dados).eq("id", pesquisa.id));
    } else {
      ({ error } = await supabase.from("sac_pesquisas").insert({ nf_id: nfId, ...dados }));
    }
    if (!error) {
      await supabase.from("sac_notas_fiscais").update({ pesquisa_enviada: true }).eq("id", nfId);
      void carregar();
    }
    setMsgPesq(error ? "Erro ao salvar." : "Pesquisa salva!");
    setSavingPesq(false);
  }

  if (loading) return <div className="py-20 text-center text-muted-foreground text-sm">Carregando...</div>;
  if (!nf) return <div className="py-20 text-center text-muted-foreground text-sm">NF não encontrada.</div>;

  const itensOmie = ((nf as any).dados_omie?.det ?? []) as OmieItem[];
  const todasPreenchidas = itensOmie.length === 0 || itensOmie.every((_, i) => conferencias[i] != null);
  const temDivergencia = itensOmie.some((item, i) => {
    const qtd = item.produto?.quantidade ?? 0;
    return conferencias[i] != null && conferencias[i] !== qtd;
  });

  const cfg = STATUS_CONFIG[nf.status_entrega];
  const StatusIcon = cfg.icon;
  const nomeCliente = nf.sac_clientes?.nome_fantasia ?? nf.razao_social_cliente;

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <Link to="/sac" className="mt-1 rounded-lg border p-2 hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">
              Pedido {nf.numero_pedido_omie ?? nf.nf_numero}
            </h1>
            {nf.numero_pedido_omie && nf.nf_numero !== nf.numero_pedido_omie && (
              <span className="text-xs text-muted-foreground font-mono">NF {nf.nf_numero}</span>
            )}
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", ABC_CLS[nf.classe_abc])}>Classe {nf.classe_abc}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", cfg.cls)}>
              <StatusIcon className="h-3 w-3" />{cfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{nomeCliente} — CNPJ {nf.cnpj_cliente}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1.5">
            <span className={cn("text-xl font-semibold tabular-nums transition-all", !showValor && "blur-sm select-none")}>
              {fmt(nf.valor_total ?? 0)}
            </span>
            <button
              onClick={() => setShowValor((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={showValor ? "Ocultar valor" : "Exibir valor"}
            >
              {showValor ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="text-xs text-muted-foreground">Emissão {fmtDate(nf.data_emissao)}</div>
        </div>
      </div>

      {/* Informações — campos de contato editáveis */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground text-xs block mb-0.5">Transportadora</span>
            <span>{nf.transportadora ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs block mb-0.5">Rastreio</span>
            <span className="font-mono text-xs">{nf.codigo_rastreio ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs block mb-0.5">Previsão entrega</span>
            <span>{fmtDate(nf.previsao_entrega)}</span>
          </div>
          <div>
            <label className="text-muted-foreground text-xs block mb-0.5">Contato</label>
            <input type="text" value={contato.contato_nome}
              onChange={(e) => setContato((p) => ({ ...p, contato_nome: e.target.value }))}
              placeholder="Nome do contato"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-muted-foreground text-xs block mb-0.5">WhatsApp</label>
            <input type="tel" value={contato.whatsapp}
              onChange={(e) => setContato((p) => ({ ...p, whatsapp: e.target.value }))}
              placeholder="55 11 9xxxx-xxxx"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-muted-foreground text-xs block mb-0.5">E-mail</label>
            <input type="email" value={contato.email}
              onChange={(e) => setContato((p) => ({ ...p, email: e.target.value }))}
              placeholder="email@empresa.com"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          {contato.whatsapp && (
            <Link to="/whatsapp-threads"
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
              <MessageCircle className="h-3.5 w-3.5" /> Conversar no WhatsApp
            </Link>
          )}
          {contato.whatsapp && (
            <a href={`tel:${contato.whatsapp}`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Phone className="h-3.5 w-3.5" /> Ligar
            </a>
          )}
          <button onClick={salvarContato} disabled={savingContato}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />{savingContato ? "Salvando..." : "Salvar contato"}
          </button>
          {msgContato && <span className="text-xs text-muted-foreground">{msgContato}</span>}
        </div>
      </div>

      {/* ─── POKA-YOKE: CONFERÊNCIA DE ITENS ─── */}
      {itensOmie.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-purple-50 px-5 py-3">
            <ClipboardList className="h-4 w-4 text-purple-700" />
            <h2 className="text-sm font-semibold text-purple-800">Conferência de Itens — Poka-Yoke</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {Object.values(conferencias).filter((v) => v != null).length} / {itensOmie.length} conferidos
            </span>
          </div>
          <div className="p-5 space-y-3">
            {/* Obs vendedor/cliente */}
            {nf.obs_omie && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3">
                <span className="font-medium text-amber-700">Obs. vendedor/cliente: </span>
                <span className="text-amber-900">{nf.obs_omie}</span>
              </div>
            )}
            {/* Cabeçalho da tabela */}
            <div className="grid grid-cols-[1fr_72px_88px_44px] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b">
              <span>Produto</span>
              <span className="text-center">Pedido</span>
              <span className="text-center">Conferido</span>
              <span />
            </div>
            {/* Itens */}
            {itensOmie.map((item, i) => {
              const qtdPedida = item.produto?.quantidade ?? 0;
              const qtdConf = conferencias[i];
              const preenchido = qtdConf != null;
              const ok = preenchido && qtdConf === qtdPedida;
              const div = preenchido && qtdConf !== qtdPedida;
              return (
                <div key={i} className="grid grid-cols-[1fr_72px_88px_44px] gap-2 items-center py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium leading-tight">{item.produto?.descricao ?? `Item ${i + 1}`}</p>
                    {item.produto?.codigo_produto && (
                      <p className="text-[11px] text-muted-foreground font-mono">SKU {item.produto.codigo_produto}</p>
                    )}
                  </div>
                  <span className="text-center text-sm tabular-nums">{qtdPedida}</span>
                  <input
                    type="number"
                    min={0}
                    value={qtdConf ?? ""}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setConferencias((prev) => ({ ...prev, [i]: v }));
                      if (divergenciaReportada) setDivergenciaReportada(false);
                    }}
                    className={cn(
                      "w-full rounded-lg border px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-1",
                      ok && "border-green-400 bg-green-50 text-green-800 focus:ring-green-400",
                      div && "border-red-400 bg-red-50 text-red-800 focus:ring-red-400",
                      !preenchido && "border-border bg-background focus:ring-ring"
                    )}
                  />
                  <div className="flex justify-center">
                    {ok && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    {div && <AlertTriangle className="h-5 w-5 text-red-500" />}
                  </div>
                </div>
              );
            })}
            {/* Bloco de divergência */}
            {temDivergencia && (
              <div className={cn(
                "rounded-lg border p-3 space-y-2",
                divergenciaReportada ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"
              )}>
                {!divergenciaReportada ? (
                  <>
                    <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Divergência detectada — reporte antes de salvar
                    </p>
                    <textarea
                      rows={2}
                      value={obsDiv}
                      onChange={(e) => setObsDiv(e.target.value)}
                      placeholder="Descreva a divergência (opcional)"
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={reportarDivergencia}
                        disabled={reportandoDiv}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        {reportandoDiv ? "Reportando..." : "Reportar Divergência"}
                      </button>
                      {msgDiv && <span className="text-xs text-muted-foreground">{msgDiv}</span>}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-amber-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-amber-600" />
                    Divergência reportada — time notificado. Pode salvar com ressalva.
                  </p>
                )}
              </div>
            )}
            {/* Tudo OK */}
            {todasPreenchidas && !temDivergencia && (
              <div className="rounded-lg border border-green-300 bg-green-50 p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800 font-medium">Todos os itens conferidos — expedição liberada.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── SEÇÃO 1: EXPEDIÇÃO ─── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-amber-50 px-5 py-3">
          <Truck className="h-4 w-4 text-amber-700" />
          <h2 className="text-sm font-semibold text-amber-800">Expedição — Confirmação de Entrega</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Linha 1: Status + Tipo de entrega */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status da entrega</label>
              <select value={exp.status_entrega}
                onChange={(e) => setExp((p) => ({ ...p, status_entrega: e.target.value as NFDetalhe["status_entrega"] }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="EMITIDA">Emitida</option>
                <option value="EM_TRANSITO">Em trânsito</option>
                <option value="ENTREGUE">Entregue</option>
                <option value="ATRASADA">Atrasada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de entrega</label>
              <select value={exp.tipo_entrega}
                onChange={(e) => setExp((p) => ({ ...p, tipo_entrega: e.target.value as typeof p.tipo_entrega }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="TRANSPORTADORA">Transportadora</option>
                <option value="ENTREGA_PROPRIA">Entrega própria (VerticalParts)</option>
                <option value="RETIRADA_CLIENTE">Retirada pelo cliente</option>
              </select>
            </div>
          </div>

          {/* Campos condicionais por tipo */}
          {exp.tipo_entrega === "TRANSPORTADORA" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Transportadora</label>
                <input type="text" value={exp.transportadora} placeholder="Ex.: Correios, Jadlog, Sequoia…"
                  onChange={(e) => setExp((p) => ({ ...p, transportadora: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Código de rastreio</label>
                <div className="flex gap-2">
                  <input type="text" value={exp.codigo_rastreio} placeholder="Ex.: AA123456789BR"
                    onChange={(e) => setExp((p) => ({ ...p, codigo_rastreio: e.target.value.toUpperCase() }))}
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm font-mono" />
                  {exp.codigo_rastreio && (
                    <a href={`https://rastreamento.correios.com.br/app/index.php?objetos=${exp.codigo_rastreio}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted shrink-0">
                      Rastrear
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {exp.tipo_entrega === "RETIRADA_CLIENTE" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Quem retirou</label>
              <input type="text" value={exp.retirado_por} placeholder="Nome completo e documento (RG/CPF)"
                onChange={(e) => setExp((p) => ({ ...p, retirado_por: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
          )}

          {/* Datas + comprovante */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {exp.tipo_entrega === "RETIRADA_CLIENTE" ? "Data da retirada" : "Data coleta / retirada"}
              </label>
              <input type="date" value={exp.data_coleta}
                onChange={(e) => setExp((p) => ({ ...p, data_coleta: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Data de entrega real</label>
              <input type="date" value={exp.data_entrega_real}
                onChange={(e) => {
                  const val = e.target.value;
                  setExp((p) => ({ ...p, data_entrega_real: val }));
                  if (val) {
                    setSac((p) => ({ ...p, previsao_pos_venda: addBusinessDays(val, 3) }));
                  }
                }}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Comprovante de entrega</label>
              <input type="text" value={exp.comprovante_entrega} placeholder="Código, protocolo ou observação"
                onChange={(e) => setExp((p) => ({ ...p, comprovante_entrega: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {exp.tipo_entrega === "TRANSPORTADORA" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Transportadora entregou?</label>
              <SimNao value={exp.transportadora_entregou}
                onChange={(v) => setExp((p) => ({ ...p, transportadora_entregou: v }))} />
            </div>
          )}
          <div className="flex items-center gap-3 border-t pt-4">
            <button onClick={salvarExpedicao} disabled={savingExp}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              <Save className="h-4 w-4" />{savingExp ? "Salvando..." : "Salvar Expedição"}
            </button>
            {msgExp && <span className="text-sm text-muted-foreground">{msgExp}</span>}
          </div>
        </div>
      </div>

      {/* ─── SEÇÃO 1b: OBSERVAÇÕES PARA OMIE ─── */}
      <div className="rounded-xl border border-orange-200 bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-orange-50 px-5 py-3">
          <Send className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-semibold text-orange-800">Observações → Omie</h2>
          <span className="ml-auto text-[11px] text-orange-500 font-medium">Enviado ao pedido no ERP</span>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            O texto abaixo será <strong>anexado</strong> ao campo Observações do pedido no Omie (aba Observações da Proposta Comercial).
            Campos internos do pós-venda ficam apenas no site.
          </p>
          <textarea
            rows={4}
            value={obsOmie}
            onChange={(e) => setObsOmie(e.target.value)}
            placeholder={"Ex.: EXP confirmou entrega em 12/06/2026. Cliente recebeu e assinou comprovante."}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={enviarObsOmie}
              disabled={savingObs || !obsOmie.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {savingObs ? "Enviando..." : "Enviar para Omie"}
            </button>
            {msgObs && (
              <span className={cn("text-sm", msgObs.startsWith("Erro") ? "text-red-600" : "text-green-600")}>
                {msgObs}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── SEÇÃO 2: CONTROLE SAC ─── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-blue-50 px-5 py-3">
          <MessageCircle className="h-4 w-4 text-blue-700" />
          <h2 className="text-sm font-semibold text-blue-800">SAC — Controle de Pós-Venda</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Previsão do contato SAC</label>
              <input type="date" value={sac.previsao_pos_venda}
                onChange={(e) => setSac((p) => ({ ...p, previsao_pos_venda: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status pós-venda</label>
              <select value={sac.status_pos_venda}
                onChange={(e) => setSac((p) => ({ ...p, status_pos_venda: e.target.value as "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO" }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="PENDENTE">Pendente</option>
                <option value="EM_ANDAMENTO">Em andamento</option>
                <option value="CONCLUIDO">Concluído</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Data do contato</label>
              <input type="date" value={sac.data_pos_venda}
                onChange={(e) => setSac((p) => ({ ...p, data_pos_venda: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Responsável pelo contato</label>
              <input type="text" value={sac.responsavel_pos_venda} placeholder="Nome de quem fez o contato"
                onChange={(e) => setSac((p) => ({ ...p, responsavel_pos_venda: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-3 border-t pt-4">
            <button onClick={salvarSac} disabled={savingSac}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" />{savingSac ? "Salvando..." : "Salvar SAC"}
            </button>
            {msgSac && <span className="text-sm text-muted-foreground">{msgSac}</span>}
          </div>
        </div>
      </div>

      {/* ─── SEÇÃO 3: PESQUISA DE SATISFAÇÃO ─── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-green-50 px-5 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-700" />
          <h2 className="text-sm font-semibold text-green-800">Pesquisa de Satisfação</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {pesquisa?.respondida_em ? `Preenchida em ${fmtDate(pesquisa.respondida_em)}` : "Não preenchida ainda"}
          </span>
        </div>
        <div className="p-5 space-y-5">

          {/* Perguntas Sim/Não */}
          {([
            { key: "produto_correto",             label: "O produto chegou correto?" },
            { key: "atendeu_prazo",               label: "Atendeu o prazo de entrega?" },
            { key: "recebeu_nota_boleto",          label: "Recebeu a nota fiscal e boleto?" },
            { key: "produto_atendeu_expectativas", label: "O produto atendeu as expectativas?" },
            { key: "dificuldade_compra",           label: "Teve dificuldade na compra?" },
            { key: "compraria_novamente",          label: "Compraria novamente?" },
          ] as { key: keyof typeof pesq; label: string }[]).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0">
              <span className="text-sm font-medium">{label}</span>
              <SimNao value={pesq[key] as boolean | null}
                onChange={(v) => setPesq((p) => ({ ...p, [key]: v }))} />
            </div>
          ))}

          {/* Avaliação atendimento */}
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <span className="text-sm font-medium">Avaliação do atendimento</span>
            <Estrelas value={pesq.avaliacao_atendimento}
              onChange={(v) => setPesq((p) => ({ ...p, avaliacao_atendimento: v }))} />
          </div>

          {/* NPS */}
          <div className="border-b pb-4">
            <label className="block text-sm font-medium mb-2">
              NPS — De 0 a 10, quanto indicaria a VerticalParts?
              {pesq.nps_score !== null && <span className="ml-2 font-bold text-primary">{pesq.nps_score}</span>}
            </label>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} type="button" onClick={() => setPesq((p) => ({ ...p, nps_score: i }))}
                  className={cn("h-9 w-9 rounded-lg border text-sm font-semibold transition-all",
                    pesq.nps_score === i
                      ? i >= 9 ? "bg-green-500 text-white border-green-500"
                        : i >= 7 ? "bg-amber-400 text-white border-amber-400"
                        : "bg-red-500 text-white border-red-500"
                      : "hover:bg-muted")}>
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Campos de texto */}
          {([
            { key: "pontos_positivos", label: "Pontos positivos da experiência" },
            { key: "pontos_melhoria",  label: "Algo a melhorar?" },
            { key: "sugestoes",        label: "Alguma sugestão?" },
            { key: "observacoes",      label: "Observações gerais" },
          ] as { key: keyof typeof pesq; label: string }[]).map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
              <textarea rows={2} value={(pesq[key] as string) ?? ""}
                onChange={(e) => setPesq((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none" />
            </div>
          ))}

          <div className="flex items-center gap-3 border-t pt-4">
            <button onClick={salvarPesquisa} disabled={savingPesq}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <Save className="h-4 w-4" />{savingPesq ? "Salvando..." : "Salvar Pesquisa"}
            </button>
            {msgPesq && <span className="text-sm text-muted-foreground">{msgPesq}</span>}
          </div>
        </div>
      </div>

    </div>
  );
}
