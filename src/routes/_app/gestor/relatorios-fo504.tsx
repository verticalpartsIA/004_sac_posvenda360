import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, slaStatus } from "@/lib/store";
import { aggregateNps, categorizeNps } from "@/lib/types";
import { Download, FileSpreadsheet, BarChart3, Users, ListChecks, Target } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gestor/relatorios-fo504")({
  component: RelatorioFO504,
});

type Periodo = "mes" | "trimestre" | "ano" | "tudo";

const RANGE: Record<Periodo, number | null> = {
  mes: 30,
  trimestre: 90,
  ano: 365,
  tudo: null,
};

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function RelatorioFO504() {
  const { tickets, internalTickets, npsRecords } = useStore();
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  const data = useMemo(() => buildReport(tickets, internalTickets, npsRecords, periodo), [
    tickets, internalTickets, npsRecords, periodo,
  ]);

  const handleExport = async () => {
    const { utils, writeFile } = await import("xlsx");
    const wb = utils.book_new();

    // ───── 1. Resumo Executivo ─────
    const r = data.resumo;
    const resumoRows = [
      ["FO-OEA-Q-504 — RESUMO EXECUTIVO"],
      [`Período: ${data.periodLabel}`],
      [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
      [],
      ["Indicador", "Valor", "Mês Anterior", "Variação"],
      ["Total de ocorrências", r.totalOcorrencias, r.totalAnterior, pctVar(r.totalOcorrencias, r.totalAnterior)],
      ["NPS médio", r.npsScore, r.npsAnterior, pctVar(r.npsScore, r.npsAnterior)],
      ["SLA compliance (%)", r.slaCompliance.toFixed(1), r.slaAnterior.toFixed(1), pctVar(r.slaCompliance, r.slaAnterior)],
      ["Custo total não-qualidade (R$)", r.custoTotal, r.custoAnterior, pctVar(r.custoTotal, r.custoAnterior)],
      ["Tickets concluídos", r.concluidos, "-", "-"],
      ["Tickets em andamento", r.emAndamento, "-", "-"],
      ["Tickets em risco de SLA", r.emRisco, "-", "-"],
    ];
    const ws1 = utils.aoa_to_sheet(resumoRows);
    ws1["!cols"] = [{ wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
    utils.book_append_sheet(wb, ws1, "1. Resumo Executivo");

    // ───── 2. Ocorrências Detalhadas ─────
    const headers = [
      "Nº RO", "Data Atendimento", "Cliente (Nome Fantasia)", "Nome do Contato",
      "DDD", "Telefone", "Município", "Estado", "Vendedor", "NF",
      "Descrição da Reclamação", "Motivo do Contato", "Código do Produto",
      "Descrição do Produto", "Quantidade", "Valor da Mercadoria (R$)",
      "Origem (Interno/Externo)", "Setor Responsável", "Situação",
      "Custo do Frete (R$)", "Data Finalizada", "Observações",
      "Início da Análise", "Data Limite", "Motivo Não Conformidade",
      "Classificação", "Observações da Qualidade", "Custo da Não Qualidade (R$)",
      "Finalização",
    ];
    const detRows = [headers, ...data.ocorrencias.map(toFO504Row)];
    const ws2 = utils.aoa_to_sheet(detRows);
    ws2["!cols"] = headers.map((h) => ({ wch: Math.min(Math.max(h.length, 12), 30) }));
    utils.book_append_sheet(wb, ws2, "2. Ocorrências");

    // ───── 3. Análise de Causas ─────
    const causasRows: (string | number)[][] = [
      ["FO-OEA-Q-504 — ANÁLISE DE CAUSAS"], [],
      ["Pareto de Motivos do Contato"],
      ["Motivo", "Quantidade", "%", "% Acumulado"],
      ...data.pareto.map((p) => [p.label, p.count, p.pct.toFixed(1), p.acc.toFixed(1)]),
      [], ["Distribuição por Setor Responsável"],
      ["Setor", "Quantidade", "%"],
      ...data.porSetor.map((s) => [s.label, s.count, s.pct.toFixed(1)]),
      [], ["Top 5 Produtos com Não Conformidade"],
      ["Código", "Descrição", "Ocorrências"],
      ...data.topProdutos.map((p) => [p.code, p.desc, p.count]),
      [], ["Tendência Mensal"],
      ["Mês", "Ocorrências"],
      ...data.tendencia.map((t) => [t.month, t.count]),
    ];
    const ws3 = utils.aoa_to_sheet(causasRows);
    ws3["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
    utils.book_append_sheet(wb, ws3, "3. Análise de Causas");

    // ───── 4. NPS ─────
    const npsRows: (string | number)[][] = [
      ["FO-OEA-Q-504 — NPS"], [],
      ["NPS Score Geral", data.nps.npsScore],
      ["Total de Respostas", data.nps.total],
      ["Promotores (9-10)", data.nps.promotores, fmtPct(data.nps.pctPromotores)],
      ["Neutros (7-8)", data.nps.neutros, fmtPct(data.nps.pctNeutros)],
      ["Detratores (0-6)", data.nps.detratores, fmtPct(data.nps.pctDetratores)],
      [], ["Distribuição por Nota"],
      ["Nota", "Quantidade"],
      ...data.nps.distribuicao.map((d) => [d.nota, d.count]),
      [], ["NPS por Tipo de Cliente"],
      ["Tier", "Score", "Respostas"],
      ...data.nps.porTier.map((t) => [t.tier, t.npsScore, t.count]),
      [], ["Feedbacks de Detratores"],
      ["Cliente", "Nota Recomendação", "Feedback", "Data"],
      ...data.nps.feedbacksDetratores.map((f) => [f.customer, f.score, f.feedback, f.date]),
    ];
    const ws4 = utils.aoa_to_sheet(npsRows);
    ws4["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 40 }, { wch: 16 }];
    utils.book_append_sheet(wb, ws4, "4. NPS");

    // ───── 5. Ações Corretivas ─────
    const acaoRows: (string | number)[][] = [
      ["FO-OEA-Q-504 — AÇÕES CORRETIVAS"], [],
      ["Código", "Departamento", "Assunto", "Responsável", "Aberto em", "Prazo (h)", "Status", "Vinculado a RO"],
      ...data.acoes.map((a) => [
        a.code, a.dept, a.subject, a.responsible, a.openedAt, a.slaHours, a.status, a.relatedRo,
      ]),
    ];
    const ws5 = utils.aoa_to_sheet(acaoRows);
    ws5["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    utils.book_append_sheet(wb, ws5, "5. Ações Corretivas");

    const stamp = new Date().toISOString().slice(0, 10);
    writeFile(wb, `FO-OEA-Q-504_${stamp}.xlsx`);
    toast.success("Relatório exportado");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Gestor</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Relatório FO-OEA-Q-504</h1>
          <p className="mt-1 text-sm text-muted-foreground">Controle de Ocorrência — relatório consolidado em 5 planilhas.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="mes">Últimos 30 dias</option>
            <option value="trimestre">Últimos 90 dias</option>
            <option value="ano">Últimos 365 dias</option>
            <option value="tudo">Todo o período</option>
          </select>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total de Ocorrências" value={fmt(data.resumo.totalOcorrencias)} delta={pctVar(data.resumo.totalOcorrencias, data.resumo.totalAnterior)} />
        <Kpi label="NPS Médio" value={String(data.resumo.npsScore)} delta={pctVar(data.resumo.npsScore, data.resumo.npsAnterior)} />
        <Kpi label="SLA Compliance" value={fmtPct(data.resumo.slaCompliance)} delta={pctVar(data.resumo.slaCompliance, data.resumo.slaAnterior)} />
        <Kpi label="Custo Não-Qualidade" value={fmtMoney(data.resumo.custoTotal)} delta={pctVar(data.resumo.custoTotal, data.resumo.custoAnterior)} />
      </div>

      {/* Preview cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={FileSpreadsheet} title="1. Resumo Executivo">
          <ul className="divide-y text-sm">
            <Row label="Tickets concluídos" value={fmt(data.resumo.concluidos)} />
            <Row label="Tickets em andamento" value={fmt(data.resumo.emAndamento)} />
            <Row label="Tickets em risco de SLA" value={fmt(data.resumo.emRisco)} />
            <Row label="Comparativo (mês ant.)" value={`${data.resumo.totalAnterior} → ${data.resumo.totalOcorrencias}`} />
          </ul>
        </Card>

        <Card icon={ListChecks} title="2. Ocorrências Detalhadas">
          <p className="text-sm text-muted-foreground">{data.ocorrencias.length} registro(s) no período</p>
          <div className="mt-3 max-h-48 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr><th className="px-3 py-2">RO</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Produto</th></tr>
              </thead>
              <tbody>
                {data.ocorrencias.slice(0, 10).map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{t.roNumber ?? t.code}</td>
                    <td className="px-3 py-1.5">{t.customer}</td>
                    <td className="px-3 py-1.5">{t.partCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card icon={BarChart3} title="3. Análise de Causas">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Pareto · top motivos</div>
          <ul className="mt-2 space-y-1.5">
            {data.pareto.slice(0, 5).map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span className="w-32 truncate text-xs">{p.label}</span>
                <div className="flex-1 h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-gold" style={{ width: `${p.pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">{p.count}</span>
              </li>
            ))}
            {data.pareto.length === 0 && <li className="text-xs text-muted-foreground">Sem dados</li>}
          </ul>
        </Card>

        <Card icon={Target} title="4. NPS">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Promotores" value={`${data.nps.promotores}`} hint={fmtPct(data.nps.pctPromotores)} tone="success" />
            <Mini label="Neutros" value={`${data.nps.neutros}`} hint={fmtPct(data.nps.pctNeutros)} tone="warn" />
            <Mini label="Detratores" value={`${data.nps.detratores}`} hint={fmtPct(data.nps.pctDetratores)} tone="danger" />
          </div>
          <div className="mt-3 rounded-md border bg-muted/40 p-3 text-center">
            <div className="text-xs uppercase text-muted-foreground">NPS Score</div>
            <div className="mt-0.5 text-2xl font-bold">{data.nps.npsScore}</div>
          </div>
        </Card>

        <Card icon={Users} title="5. Ações Corretivas" className="lg:col-span-2">
          <p className="text-sm text-muted-foreground">{data.acoes.length} ação(ões) registrada(s)</p>
          <div className="mt-3 max-h-56 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Departamento</th>
                  <th className="px-3 py-2">Assunto</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.acoes.slice(0, 12).map((a, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{a.code}</td>
                    <td className="px-3 py-1.5">{a.dept}</td>
                    <td className="px-3 py-1.5">{a.subject}</td>
                    <td className="px-3 py-1.5">{a.responsible}</td>
                    <td className="px-3 py-1.5">{a.status}</td>
                  </tr>
                ))}
                {data.acoes.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma ação corretiva no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ───── Helpers ─────

function pctVar(curr: number, prev: number) {
  if (!prev) return curr ? "+100%" : "0%";
  const v = ((curr - prev) / prev) * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function buildReport(
  tickets: ReturnType<typeof useStore>["tickets"],
  internals: ReturnType<typeof useStore>["internalTickets"],
  nps: ReturnType<typeof useStore>["npsRecords"],
  periodo: Periodo,
) {
  const days = RANGE[periodo];
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const prevCutoff = days ? Date.now() - 2 * days * 86400000 : 0;

  const inPeriod = tickets.filter((t) => new Date(t.createdAt).getTime() >= cutoff);
  const inPrev = days
    ? tickets.filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return ts >= prevCutoff && ts < cutoff;
      })
    : [];

  // Resumo
  const concluidos = inPeriod.filter((t) => t.status === "concluido").length;
  const emAndamento = inPeriod.filter((t) => t.status !== "concluido").length;
  const emRisco = inPeriod.filter((t) => t.status !== "concluido" && slaStatus(t).tone !== "ok").length;
  const slaOk = inPeriod.filter((t) => !t.slaViolado).length;
  const slaCompliance = inPeriod.length ? (slaOk / inPeriod.length) * 100 : 100;
  const slaOkPrev = inPrev.filter((t) => !t.slaViolado).length;
  const slaAnterior = inPrev.length ? (slaOkPrev / inPrev.length) * 100 : 100;
  const custoTotal = inPeriod.reduce((s, t) => s + (t.custoNaoQualidade ?? 0) + (t.freightCostVp ?? 0), 0);
  const custoAnterior = inPrev.reduce((s, t) => s + (t.custoNaoQualidade ?? 0) + (t.freightCostVp ?? 0), 0);

  // NPS aggregation
  const npsInPeriod = nps.filter((n) => new Date(n.surveyDate).getTime() >= cutoff);
  const npsAgg = aggregateNps(npsInPeriod);
  const npsPrev = days
    ? nps.filter((n) => {
        const ts = new Date(n.surveyDate).getTime();
        return ts >= prevCutoff && ts < cutoff;
      })
    : [];
  const npsAggPrev = aggregateNps(npsPrev);

  // Distribuição por nota (q1)
  const distribuicao = Array.from({ length: 11 }, (_, i) => ({
    nota: i,
    count: npsInPeriod.filter((n) => n.q1Recomendacao === i).length,
  }));

  // NPS por Tier
  const tiers: ("A" | "B" | "C")[] = ["A", "B", "C"];
  const porTier = tiers.map((tier) => {
    const subset = npsInPeriod.filter((n) => n.customerTier === tier);
    return { tier, ...aggregateNps(subset), count: subset.length };
  });

  const feedbacksDetratores = npsInPeriod
    .filter((n) => categorizeNps(n.q1Recomendacao) === "detrator" && n.feedback)
    .map((n) => ({
      customer: n.customer,
      score: n.q1Recomendacao,
      feedback: n.feedback ?? "",
      date: new Date(n.surveyDate).toLocaleDateString("pt-BR"),
    }));

  // Pareto motivos
  const reasonCounts = new Map<string, number>();
  inPeriod.forEach((t) => {
    const key = t.occurrenceReason ?? t.reason ?? "Não informado";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  });
  const sortedReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalReasons = inPeriod.length || 1;
  let acc = 0;
  const pareto = sortedReasons.map(([label, count]) => {
    const pct = (count / totalReasons) * 100;
    acc += pct;
    return { label, count, pct, acc };
  });

  // Por setor
  const sectorCounts = new Map<string, number>();
  inPeriod.forEach((t) => {
    const key = t.responsibleSector ?? "Não definido";
    sectorCounts.set(key, (sectorCounts.get(key) ?? 0) + 1);
  });
  const porSetor = [...sectorCounts.entries()].map(([label, count]) => ({
    label, count, pct: (count / totalReasons) * 100,
  })).sort((a, b) => b.count - a.count);

  // Top produtos
  const prodCounts = new Map<string, { code: string; desc: string; count: number }>();
  inPeriod.forEach((t) => {
    const key = t.partCode || t.part;
    const e = prodCounts.get(key) ?? { code: t.partCode, desc: t.part, count: 0 };
    e.count += 1;
    prodCounts.set(key, e);
  });
  const topProdutos = [...prodCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  // Tendência mensal (últimos 6 meses sempre)
  const tendencia: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const m = d.toLocaleString("pt-BR", { month: "short", year: "2-digit" });
    const count = tickets.filter((t) => {
      const td = new Date(t.createdAt);
      return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
    }).length;
    tendencia.push({ month: m, count });
  }

  // Ações corretivas (tickets internos no período + abertos)
  const acoes = internals
    .filter((it) => !days || new Date(it.openedAt).getTime() >= cutoff || it.status !== "resolvido")
    .map((it) => {
      const related = tickets.find((t) => t.internalTicketIds?.includes(it.id));
      return {
        code: it.code,
        dept: it.targetDepartment,
        subject: it.subject,
        responsible: it.openedBy,
        openedAt: new Date(it.openedAt).toLocaleString("pt-BR"),
        slaHours: it.slaHours,
        status: it.status,
        relatedRo: related?.roNumber ?? related?.code ?? "-",
      };
    });

  return {
    periodLabel:
      periodo === "tudo" ? "Todo o período" :
      periodo === "mes" ? "Últimos 30 dias" :
      periodo === "trimestre" ? "Últimos 90 dias" : "Últimos 365 dias",
    resumo: {
      totalOcorrencias: inPeriod.length,
      totalAnterior: inPrev.length,
      npsScore: npsAgg.npsScore,
      npsAnterior: npsAggPrev.npsScore,
      slaCompliance, slaAnterior,
      custoTotal, custoAnterior,
      concluidos, emAndamento, emRisco,
    },
    ocorrencias: inPeriod,
    pareto, porSetor, topProdutos, tendencia,
    nps: {
      ...npsAgg,
      pctNeutros: npsAgg.total ? (npsAgg.neutros / npsAgg.total) * 100 : 0,
      distribuicao,
      porTier,
      feedbacksDetratores,
    },
    acoes,
  };
}

function toFO504Row(t: ReturnType<typeof useStore>["tickets"][number]) {
  const tel = t.customerTelefone ?? "";
  const ddd = tel.match(/\((\d{2})\)/)?.[1] ?? tel.slice(0, 2);
  const fone = tel.replace(/^\(\d{2}\)\s*/, "");
  return [
    t.roNumber ?? t.code,
    new Date(t.createdAt).toLocaleString("pt-BR"),
    t.customer,
    t.customerContato ?? "",
    ddd,
    fone,
    t.city ?? "",
    t.state ?? "",
    t.vendedor ?? "",
    t.nfNumero ?? "",
    t.reason,
    t.occurrenceReason ?? "",
    t.partCode,
    t.part,
    t.quantity ?? "",
    t.nfValor ?? t.unitValue ?? "",
    t.origin ?? "",
    t.responsibleSector ?? "",
    t.status === "concluido" ? "Autorizado" : t.status === "aberto" ? "Pendente" : t.status,
    t.freightCostVp ?? "",
    t.resolvedAt ? new Date(t.resolvedAt).toLocaleString("pt-BR") : "",
    "",
    t.dataInicioAnalise ? new Date(t.dataInicioAnalise).toLocaleString("pt-BR") : "",
    t.dataLimiteAtendimento ? new Date(t.dataLimiteAtendimento).toLocaleString("pt-BR") : "",
    t.descricaoNaoConformidade ?? "",
    t.classificacaoQualidade ?? "",
    t.observacoesQualidade ?? "",
    t.custoNaoQualidade ?? "",
    t.rootCause ?? "",
  ];
}

// ───── UI bits ─────
function Kpi({ label, value, delta }: { label: string; value: string; delta: string }) {
  const positive = delta.startsWith("+");
  return (
    <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-elegant)]">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className={`mt-1 text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
        {delta} vs período anterior
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children, className = "" }: {
  icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border bg-card p-5 shadow-[var(--shadow-elegant)] ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-gold-soft text-gold-foreground"><Icon className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </header>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  );
}

function Mini({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "success" | "warn" | "danger" }) {
  const styles = {
    success: "bg-success/10 text-success",
    warn: "bg-gold-soft text-gold-foreground",
    danger: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <div className={`rounded-md p-3 ${styles}`}>
      <div className="text-[10px] font-semibold uppercase">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      <div className="text-[10px]">{hint}</div>
    </div>
  );
}
