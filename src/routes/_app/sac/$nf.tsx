import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ArrowLeft, Save, Truck, MessageCircle, Phone, CheckCircle2, Clock, Package, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/sac/$nf")({
  component: SacNFDetalhe,
});

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
  sac_clientes: {
    nome_fantasia: string | null;
    whatsapp: string | null;
    email: string | null;
    telefone: string | null;
    contato: string | null;
  } | null;
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
  const [nf, setNf] = useState<NFDetalhe | null>(null);
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulário Expedição
  const [exp, setExp] = useState({
    data_coleta: "",
    transportadora_entregou: null as boolean | null,
    data_entrega_real: "",
    comprovante_entrega: "",
    status_entrega: "EMITIDA" as NFDetalhe["status_entrega"],
  });
  const [savingExp, setSavingExp] = useState(false);
  const [msgExp, setMsgExp] = useState("");

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

  useEffect(() => { void carregar(); }, [nfId]);

  async function carregar() {
    setLoading(true);
    const [{ data: nfData }, { data: pesquisaData }] = await Promise.all([
      supabase.from("sac_notas_fiscais")
        .select("*, sac_clientes(nome_fantasia,whatsapp,email,telefone,contato)")
        .eq("id", nfId).single(),
      supabase.from("sac_pesquisas").select("*").eq("nf_id", nfId).maybeSingle(),
    ]);

    if (nfData) {
      const n = nfData as NFDetalhe;
      setNf(n);
      setExp({
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

  async function salvarExpedicao() {
    setSavingExp(true);
    setMsgExp("");
    const { error } = await supabase.from("sac_notas_fiscais").update({
      data_coleta: exp.data_coleta || null,
      transportadora_entregou: exp.transportadora_entregou,
      data_entrega_real: exp.data_entrega_real || null,
      comprovante_entrega: exp.comprovante_entrega || null,
      status_entrega: exp.status_entrega,
      updated_at: new Date().toISOString(),
    }).eq("id", nfId);
    setMsgExp(error ? "Erro ao salvar." : "Salvo com sucesso!");
    setSavingExp(false);
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
    setMsgSac(error ? "Erro ao salvar." : "Salvo com sucesso!");
    setSavingSac(false);
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

  const cfg = STATUS_CONFIG[nf.status_entrega];
  const StatusIcon = cfg.icon;
  const nomeCliente = nf.sac_clientes?.nome_fantasia ?? nf.razao_social_cliente;
  const whatsapp = nf.sac_clientes?.whatsapp ?? nf.sac_clientes?.telefone;

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <Link to="/sac" className="mt-1 rounded-lg border p-2 hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">NF {nf.nf_numero}</h1>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", ABC_CLS[nf.classe_abc])}>Classe {nf.classe_abc}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", cfg.cls)}>
              <StatusIcon className="h-3 w-3" />{cfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{nomeCliente} — CNPJ {nf.cnpj_cliente}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-semibold">{fmt(nf.valor_total ?? 0)}</div>
          <div className="text-xs text-muted-foreground">Emissão {fmtDate(nf.data_emissao)}</div>
        </div>
      </div>

      {/* Informações do Omie (somente leitura) */}
      <div className="rounded-xl border bg-muted/30 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div><span className="text-muted-foreground text-xs block">Transportadora</span>{nf.transportadora ?? "—"}</div>
        <div><span className="text-muted-foreground text-xs block">Rastreio</span><span className="font-mono text-xs">{nf.codigo_rastreio ?? "—"}</span></div>
        <div><span className="text-muted-foreground text-xs block">Previsão entrega</span>{fmtDate(nf.previsao_entrega)}</div>
        <div><span className="text-muted-foreground text-xs block">Contato</span>{nf.sac_clientes?.contato ?? "—"}</div>
        <div><span className="text-muted-foreground text-xs block">WhatsApp</span>{whatsapp ?? "—"}</div>
        <div><span className="text-muted-foreground text-xs block">E-mail</span><span className="truncate block">{nf.sac_clientes?.email ?? "—"}</span></div>
        {whatsapp && (
          <div className="col-span-2 flex gap-2 pt-1">
            <a href={`https://wa.me/55${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <a href={`tel:${whatsapp}`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Phone className="h-3.5 w-3.5" /> Ligar
            </a>
          </div>
        )}
      </div>

      {/* ─── SEÇÃO 1: EXPEDIÇÃO ─── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-amber-50 px-5 py-3">
          <Truck className="h-4 w-4 text-amber-700" />
          <h2 className="text-sm font-semibold text-amber-800">Expedição — Confirmação de Entrega</h2>
        </div>
        <div className="p-5 space-y-4">
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
              <label className="block text-xs font-medium text-muted-foreground mb-1">Data coleta / retirada</label>
              <input type="date" value={exp.data_coleta}
                onChange={(e) => setExp((p) => ({ ...p, data_coleta: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Data de entrega real</label>
              <input type="date" value={exp.data_entrega_real}
                onChange={(e) => setExp((p) => ({ ...p, data_entrega_real: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Comprovante de entrega</label>
              <input type="text" value={exp.comprovante_entrega} placeholder="Código, protocolo ou observação"
                onChange={(e) => setExp((p) => ({ ...p, comprovante_entrega: e.target.value }))}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Transportadora entregou?</label>
            <SimNao value={exp.transportadora_entregou}
              onChange={(v) => setExp((p) => ({ ...p, transportadora_entregou: v }))} />
          </div>
          <div className="flex items-center gap-3 border-t pt-4">
            <button onClick={salvarExpedicao} disabled={savingExp}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              <Save className="h-4 w-4" />{savingExp ? "Salvando..." : "Salvar Expedição"}
            </button>
            {msgExp && <span className="text-sm text-muted-foreground">{msgExp}</span>}
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
