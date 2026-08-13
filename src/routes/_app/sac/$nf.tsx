import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import * as notasFiscaisRepo from "@/lib/repositories/notasFiscaisRepo";
import * as pesquisasRepo from "@/lib/repositories/pesquisasRepo";
import * as devolucoesRepo from "@/lib/repositories/devolucoesRepo";
import * as auditLogRepo from "@/lib/repositories/auditLogRepo";
import * as sacClientesRepo from "@/lib/repositories/sacClientesRepo";
import * as conferenciaStorageRepo from "@/lib/repositories/conferenciaStorageRepo";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { type OccurrenceReason } from "@/lib/types";
import { addBusinessDays } from "@/components/sac/nf-detalhe/helpers";
import type {
  DevolucaoResumo,
  NFDetalhe,
  OmieItem,
  Pesquisa,
} from "@/components/sac/nf-detalhe/types";
import { NfHeader } from "@/components/sac/nf-detalhe/NfHeader";
import { OcorrenciaPanel } from "@/components/sac/nf-detalhe/OcorrenciaPanel";
import { DevolucaoPanel } from "@/components/sac/nf-detalhe/DevolucaoPanel";
import { ContatoPanel, type ContatoForm } from "@/components/sac/nf-detalhe/ContatoPanel";
import { ConferenciaPanel } from "@/components/sac/nf-detalhe/ConferenciaPanel";
import { ExpedicaoPanel, type ExpedicaoForm } from "@/components/sac/nf-detalhe/ExpedicaoPanel";
import { ObsOmiePanel } from "@/components/sac/nf-detalhe/ObsOmiePanel";
import { FotosConferenciaOmiePanel } from "@/components/sac/nf-detalhe/FotosConferenciaOmiePanel";
import { SacPanel, type SacForm } from "@/components/sac/nf-detalhe/SacPanel";
import { PesquisaPanel, type PesquisaForm } from "@/components/sac/nf-detalhe/PesquisaPanel";

export const Route = createFileRoute("/_app/sac/$nf")({
  component: SacNFDetalhe,
});

export default function SacNFDetalhe() {
  const { nf: nfId } = useParams({ from: "/_app/sac/$nf" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tickets } = useStore();
  const [nf, setNf] = useState<NFDetalhe | null>(null);
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [loading, setLoading] = useState(true);
  const [motivoInicial, setMotivoInicial] = useState<OccurrenceReason | "">("");

  // Formulário Expedição
  const [exp, setExp] = useState<ExpedicaoForm>({
    tipo_entrega: "TRANSPORTADORA",
    transportadora: "",
    codigo_rastreio: "",
    retirado_por: "",
    data_coleta: "",
    transportadora_entregou: null,
    data_entrega_real: "",
    comprovante_entrega: "",
  });
  const [savingExp, setSavingExp] = useState(false);
  const [msgExp, setMsgExp] = useState("");

  // Contato editável (WhatsApp / Email / nome do contato)
  const [contato, setContato] = useState<ContatoForm>({
    whatsapp: "",
    email: "",
    contato_nome: "",
  });
  const [savingContato, setSavingContato] = useState(false);
  const [msgContato, setMsgContato] = useState("");

  // Formulário SAC
  const [sac, setSac] = useState<SacForm>({
    previsao_pos_venda: "",
    status_pos_venda: "PENDENTE",
    data_pos_venda: "",
    responsavel_pos_venda: "",
  });
  const [savingSac, setSavingSac] = useState(false);
  const [msgSac, setMsgSac] = useState("");

  // Formulário Pesquisa
  const [pesq, setPesq] = useState<PesquisaForm>({
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
  const [enviandoFotosOmie, setEnviandoFotosOmie] = useState(false);
  const [msgFotosOmie, setMsgFotosOmie] = useState("");
  const [enviandoFotoItem, setEnviandoFotoItem] = useState<Record<number, boolean>>({});
  const [msgFotoItem, setMsgFotoItem] = useState<Record<number, string>>({});
  const [fotoItemPublicada, setFotoItemPublicada] = useState<Record<number, boolean>>({});

  // Conferência de itens (Poka-Yoke)
  const [conferencias, setConferencias] = useState<Record<number, number | null>>({});
  const [fotosConferencia, setFotosConferencia] = useState<Record<number, string | null>>({});
  const [uploadingFoto, setUploadingFoto] = useState<Record<number, boolean>>({});
  const [obsDiv, setObsDiv] = useState("");
  const [divergenciaReportada, setDivergenciaReportada] = useState(false);
  const [reportandoDiv, setReportandoDiv] = useState(false);
  const [msgDiv, setMsgDiv] = useState("");

  // Devolução de produto — abertura pelo SAC/Pós-venda; recebimento físico e
  // fechamento acontecem na tela dedicada /sac/devolucoes (Expedição/Gestor).
  const [devolucoes, setDevolucoes] = useState<DevolucaoResumo[]>([]);
  const [abrindoDevolucao, setAbrindoDevolucao] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState<"devolucao_total" | "devolucao_parcial">(
    "devolucao_total",
  );
  const [obsDevolucao, setObsDevolucao] = useState("");

  useEffect(() => {
    void carregar();
  }, [nfId]);

  async function carregar() {
    setLoading(true);
    const [{ data: nfData }, { data: pesquisaData }, { data: devolucoesData }] = await Promise.all([
      notasFiscaisRepo.getDetalhe(nfId),
      pesquisasRepo.getByNfId(nfId),
      devolucoesRepo.listByNfId(nfId),
    ]);
    setDevolucoes((devolucoesData as DevolucaoResumo[]) ?? []);

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
    await auditLogRepo
      .registrar({
        entity_type: "sac_nf",
        entity_id: nfId,
        action,
        actor_id: user?.id ?? null,
        actor_name: user?.email ?? null,
        payload: (payload ?? null) as Json,
      })
      .then(({ error }) => {
        if (error) console.error("[sac-audit]", error);
      });
  }

  async function uploadFotoConferencia(idx: number, file: File) {
    setUploadingFoto((p) => ({ ...p, [idx]: true }));
    const { error, publicUrl } = await conferenciaStorageRepo.uploadFotoItem(nfId, idx, file);
    if (!error) {
      setFotosConferencia((p) => ({ ...p, [idx]: publicUrl }));
      setFotoItemPublicada((p) => ({ ...p, [idx]: false }));
      setMsgFotoItem((p) => ({ ...p, [idx]: "" }));
    }
    setUploadingFoto((p) => ({ ...p, [idx]: false }));
  }

  function removerFotoConferencia(idx: number) {
    setFotosConferencia((p) => ({ ...p, [idx]: null }));
    setFotoItemPublicada((p) => ({ ...p, [idx]: false }));
    setMsgFotoItem((p) => ({ ...p, [idx]: "" }));
  }

  function calcularStatusEntrega(): NFDetalhe["status_entrega"] {
    if (exp.data_entrega_real) return "ENTREGUE";
    if (exp.data_coleta) return "EM_TRANSITO";
    if (nf?.previsao_entrega && new Date(nf.previsao_entrega + "T23:59:59") < new Date())
      return "ATRASADA";
    return "EMITIDA";
  }

  function handleExpChange(next: ExpedicaoForm) {
    setExp(next);
    if (next.data_entrega_real && next.data_entrega_real !== exp.data_entrega_real) {
      setSac((p) => ({ ...p, previsao_pos_venda: addBusinessDays(next.data_entrega_real, 3) }));
    }
  }

  async function salvarExpedicao() {
    // Poka-Yoke: bloqueia se conferência incompleta ou divergência não reportada
    // Exceção: se data_entrega_real já preenchida (entrega confirmada), a conferência é opcional
    const itensGuard = ((nf as any)?.dados_omie?.det ?? []) as OmieItem[];
    const entregaConfirmada = !!exp.data_entrega_real;
    if (itensGuard.length > 0 && !entregaConfirmada) {
      const todasOk = itensGuard.every((_, i) => conferencias[i] != null);
      const temDivGuard = itensGuard.some((item, i) => {
        const qtd = item.produto?.quantidade ?? 0;
        return conferencias[i] != null && conferencias[i] !== qtd;
      });
      if (!todasOk) {
        setMsgExp("Confira todos os itens antes de salvar.");
        return;
      }
      if (temDivGuard && !divergenciaReportada) {
        setMsgExp("Reporte a divergência antes de salvar.");
        return;
      }
    }
    setSavingExp(true);
    setMsgExp("");
    const { error } = await notasFiscaisRepo.update(nfId, {
      tipo_entrega: exp.tipo_entrega,
      transportadora: exp.tipo_entrega === "TRANSPORTADORA" ? exp.transportadora || null : null,
      codigo_rastreio: exp.tipo_entrega === "TRANSPORTADORA" ? exp.codigo_rastreio || null : null,
      retirado_por: exp.tipo_entrega === "RETIRADA_CLIENTE" ? exp.retirado_por || null : null,
      data_coleta: exp.data_coleta || null,
      transportadora_entregou:
        exp.tipo_entrega === "TRANSPORTADORA" ? exp.transportadora_entregou : null,
      data_entrega_real: exp.data_entrega_real || null,
      comprovante_entrega: exp.comprovante_entrega || null,
      status_entrega: calcularStatusEntrega(),
      updated_at: new Date().toISOString(),
    } as any);

    if (error) {
      setMsgExp("Erro ao salvar.");
      setSavingExp(false);
      return;
    }

    void writeAuditSac("expedicao_salva", {
      status_entrega: calcularStatusEntrega(),
      tipo_entrega: exp.tipo_entrega,
    });
    setMsgExp("Salvo! Criando tarefa no VP Click...");
    const { error: fnErr } = await supabase.functions
      .invoke("pv360-delivery-event", {
        body: { nf_id: nfId },
      })
      .catch(() => ({ data: null, error: new Error("indisponível") }));

    setMsgExp(fnErr ? "Salvo! (VP Click indisponível)" : "Salvo! Tarefa criada no VP Click.");
    void carregar();
    setSavingExp(false);
  }

  async function salvarContato() {
    if (!nf?.cnpj_cliente) return;
    setSavingContato(true);
    setMsgContato("");
    const { error } = await sacClientesRepo.updateByCnpj(nf.cnpj_cliente, {
      whatsapp: contato.whatsapp || null,
      email: contato.email || null,
      contato: contato.contato_nome || null,
      updated_at: new Date().toISOString(),
    });
    setMsgContato(error ? "Erro ao salvar." : "Salvo!");
    setSavingContato(false);
  }

  async function salvarSac() {
    setSavingSac(true);
    setMsgSac("");
    const { error } = await notasFiscaisRepo.update(nfId, {
      previsao_pos_venda: sac.previsao_pos_venda || null,
      status_pos_venda: sac.status_pos_venda,
      data_pos_venda: sac.data_pos_venda || null,
      responsavel_pos_venda: sac.responsavel_pos_venda || null,
      updated_at: new Date().toISOString(),
    });
    if (!error)
      void writeAuditSac("sac_salvo", {
        status_pos_venda: sac.status_pos_venda,
        responsavel: sac.responsavel_pos_venda || null,
      });
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
      const data = (await res.json()) as { error?: string };
      if (res.ok) void writeAuditSac("obs_enviada_omie", { obs_preview: obsOmie.slice(0, 100) });
      setMsgObs(!res.ok ? (data.error ?? "Erro ao enviar.") : "Enviado para o Omie com sucesso!");
    } catch {
      setMsgObs("Erro de conexão com o servidor.");
    }
    setSavingObs(false);
  }

  async function enviarFotosOmie() {
    const fotos = Object.entries(fotosConferencia)
      .filter(([, url]) => url != null)
      .map(([idx, url]) => {
        const item = itensOmie[Number(idx)];
        const descricao = item?.produto?.descricao ?? `item-${idx}`;
        const ext = url!.split("?")[0].split(".").pop() ?? "jpg";
        const nome = `conferencia-${descricao.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}-${idx}.${ext}`;
        return { url: url!, nome };
      });
    if (fotos.length === 0) return;
    setEnviandoFotosOmie(true);
    setMsgFotosOmie("");
    try {
      const res = await fetch("/api/sac/omie-anexo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: nfId, fotos }),
      });
      const data = (await res.json()) as {
        error?: string;
        resultados?: { nome: string; ok: boolean }[];
      };
      if (res.ok) {
        const ok = (data.resultados ?? []).filter((r) => r.ok).length;
        void writeAuditSac("fotos_enviadas_omie", { quantidade: ok });
        setMsgFotosOmie(`${ok} foto(s) enviada(s) ao Omie com sucesso!`);
      } else {
        setMsgFotosOmie(data.error ?? "Erro ao enviar fotos.");
      }
    } catch {
      setMsgFotosOmie("Erro de conexão com o servidor.");
    }
    setEnviandoFotosOmie(false);
  }

  async function enviarFotoOmieItem(idx: number) {
    const url = fotosConferencia[idx];
    if (!url) return;
    const item = itensOmie[idx];
    const descricao = item?.produto?.descricao ?? `item-${idx}`;
    const ext = url.split("?")[0].split(".").pop() ?? "jpg";
    const nome = `conferencia-${descricao.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}-${idx}.${ext}`;

    setEnviandoFotoItem((p) => ({ ...p, [idx]: true }));
    setMsgFotoItem((p) => ({ ...p, [idx]: "" }));
    try {
      const res = await fetch("/api/sac/omie-anexo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: nfId, fotos: [{ url, nome }] }),
      });
      const data = (await res.json()) as {
        error?: string;
        resultados?: { nome: string; ok: boolean }[];
      };
      if (res.ok && (data.resultados ?? []).some((r) => r.ok)) {
        void writeAuditSac("foto_item_enviada_omie", { item_idx: idx, descricao });
        setFotoItemPublicada((p) => ({ ...p, [idx]: true }));
        setMsgFotoItem((p) => ({ ...p, [idx]: "Publicada no Omie!" }));
      } else {
        setMsgFotoItem((p) => ({ ...p, [idx]: data.error ?? "Erro ao publicar." }));
      }
    } catch {
      setMsgFotoItem((p) => ({ ...p, [idx]: "Erro de conexão." }));
    }
    setEnviandoFotoItem((p) => ({ ...p, [idx]: false }));
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
      if (!res.ok) {
        setMsgDiv("Erro ao reportar divergência.");
      } else {
        setDivergenciaReportada(true);
        setMsgDiv("Divergência reportada — time notificado.");
        void writeAuditSac("divergencia_reportada", {
          qtd_divergentes: payload.filter((p) => p.divergencia_tipo).length,
          itens: payload
            .filter((p) => p.divergencia_tipo)
            .map((p) => ({
              sku: p.sku,
              descricao: p.descricao,
              divergencia_tipo: p.divergencia_tipo,
            })),
        });
      }
    } catch {
      setMsgDiv("Erro de conexão.");
    }
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
      ({ error } = await pesquisasRepo.update(pesquisa.id, dados));
    } else {
      ({ error } = await pesquisasRepo.insert({ nf_id: nfId, ...dados }));
    }
    if (!error) {
      await notasFiscaisRepo.update(nfId, { pesquisa_enviada: true });
      void carregar();
    }
    setMsgPesq(error ? "Erro ao salvar." : "Pesquisa salva!");
    setSavingPesq(false);
  }

  if (loading)
    return <div className="py-20 text-center text-muted-foreground text-sm">Carregando...</div>;
  if (!nf)
    return (
      <div className="py-20 text-center text-muted-foreground text-sm">NF não encontrada.</div>
    );

  const itensOmie = ((nf as any).dados_omie?.det ?? []) as OmieItem[];
  const todasPreenchidas =
    itensOmie.length === 0 || itensOmie.every((_, i) => conferencias[i] != null);
  const temDivergencia = itensOmie.some((item, i) => {
    const qtd = item.produto?.quantidade ?? 0;
    return conferencias[i] != null && conferencias[i] !== qtd;
  });

  const nomeCliente = nf.sac_clientes?.nome_fantasia ?? nf.razao_social_cliente;
  const ocorrenciasVinculadas = tickets.filter((t) => t.sacNfId === nfId);

  function abrirOcorrencia() {
    navigate({
      to: "/nova-ocorrencia",
      search: {
        sacNfId: nfId,
        customer: nomeCliente,
        customerDoc: nf!.cnpj_cliente,
        customerContato: contato.contato_nome || undefined,
        customerTelefone: contato.whatsapp || undefined,
        nfNumero: nf!.numero_pedido_omie ?? nf!.nf_numero,
        transportadora: nf!.transportadora ?? undefined,
        rastreio: nf!.codigo_rastreio ?? undefined,
        motivo: motivoInicial || undefined,
      },
    });
  }

  async function abrirDevolucao() {
    setAbrindoDevolucao(true);
    const { error } = await devolucoesRepo.abrir({
      nf_id: nfId,
      motivo: motivoDevolucao,
      valor_estimado: nf!.valor_total ?? 0,
      observacoes_abertura: obsDevolucao || null,
      aberta_por: user?.email ?? null,
    });
    setAbrindoDevolucao(false);
    if (error) {
      console.error("[sac/$nf] abrirDevolucao error:", error.message);
      return;
    }
    setObsDevolucao("");
    void carregar();
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <NfHeader
        nf={nf}
        nomeCliente={nomeCliente}
        showValor={showValor}
        onToggleShowValor={() => setShowValor((v) => !v)}
      />

      <OcorrenciaPanel
        ocorrenciasVinculadas={ocorrenciasVinculadas}
        motivoInicial={motivoInicial}
        onMotivoInicialChange={setMotivoInicial}
        onAbrirOcorrencia={abrirOcorrencia}
      />

      <DevolucaoPanel
        devolucoes={devolucoes}
        valorTotal={nf.valor_total}
        motivoDevolucao={motivoDevolucao}
        onMotivoDevolucaoChange={setMotivoDevolucao}
        obsDevolucao={obsDevolucao}
        onObsDevolucaoChange={setObsDevolucao}
        abrindoDevolucao={abrindoDevolucao}
        onAbrirDevolucao={abrirDevolucao}
      />

      <ContatoPanel
        nf={nf}
        contato={contato}
        onContatoChange={setContato}
        savingContato={savingContato}
        msgContato={msgContato}
        onSalvarContato={salvarContato}
      />

      <ConferenciaPanel
        itensOmie={itensOmie}
        obsOmieNota={nf.obs_omie}
        conferencias={conferencias}
        onConferenciaChange={(idx, v) => {
          setConferencias((prev) => ({ ...prev, [idx]: v }));
          if (divergenciaReportada) setDivergenciaReportada(false);
        }}
        fotosConferencia={fotosConferencia}
        uploadingFoto={uploadingFoto}
        onUploadFoto={(idx, file) => void uploadFotoConferencia(idx, file)}
        onRemoverFoto={removerFotoConferencia}
        enviandoFotoItem={enviandoFotoItem}
        msgFotoItem={msgFotoItem}
        fotoItemPublicada={fotoItemPublicada}
        onEnviarFotoOmieItem={(idx) => void enviarFotoOmieItem(idx)}
        codigoPedidoOmie={nf.codigo_pedido_omie}
        temDivergencia={temDivergencia}
        todasPreenchidas={todasPreenchidas}
        divergenciaReportada={divergenciaReportada}
        obsDiv={obsDiv}
        onObsDivChange={setObsDiv}
        reportandoDiv={reportandoDiv}
        msgDiv={msgDiv}
        onReportarDivergencia={reportarDivergencia}
      />

      <ExpedicaoPanel
        exp={exp}
        onExpChange={handleExpChange}
        statusCalculado={calcularStatusEntrega()}
        savingExp={savingExp}
        msgExp={msgExp}
        onSalvarExpedicao={salvarExpedicao}
      />

      <ObsOmiePanel
        obsOmie={obsOmie}
        onObsOmieChange={setObsOmie}
        savingObs={savingObs}
        msgObs={msgObs}
        onEnviarObsOmie={enviarObsOmie}
      />

      <FotosConferenciaOmiePanel
        fotosConferencia={fotosConferencia}
        itensOmie={itensOmie}
        enviandoFotosOmie={enviandoFotosOmie}
        msgFotosOmie={msgFotosOmie}
        onEnviarFotosOmie={enviarFotosOmie}
      />

      <SacPanel
        sac={sac}
        onSacChange={setSac}
        savingSac={savingSac}
        msgSac={msgSac}
        onSalvarSac={salvarSac}
      />

      <PesquisaPanel
        pesq={pesq}
        onPesqChange={setPesq}
        respondidaEm={pesquisa?.respondida_em}
        savingPesq={savingPesq}
        msgPesq={msgPesq}
        onSalvarPesquisa={salvarPesquisa}
      />
    </div>
  );
}
