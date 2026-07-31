import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useStore, slaStatus } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { BackToDashboard } from "@/components/app/BackToDashboard";
import {
  ROOT_CAUSE_LABEL,
  INTERNAL_DEPT_LABEL,
  aggregateNps,
  type RootCause,
  type CustomerTier,
  type InternalDepartment,
  type NpsRecord,
} from "@/lib/types";
import {
  TrendingUp,
  Clock,
  ShieldCheck,
  Star,
  Repeat,
  DollarSign,
  Users,
  Download,
  FileSpreadsheet,
  FileText,
  PackageX,
} from "lucide-react";

export const Route = createFileRoute("/_app/gestor/kpis")({ component: ManagerDashboard });

type Period = "semana" | "mes" | "trimestre" | "tudo";
const PERIOD_HOURS: Record<Period, number> = {
  semana: 24 * 7,
  mes: 24 * 30,
  trimestre: 24 * 90,
  tudo: Number.POSITIVE_INFINITY,
};
const PERIOD_LABEL: Record<Period, string> = {
  semana: "Últimos 7 dias",
  mes: "Últimos 30 dias",
  trimestre: "Últimos 90 dias",
  tudo: "Tudo",
};

// Meta por KPI
const META = {
  nps: 70,
  sla: 95,
  mttr: 48,
  reincidencia: 10,
  internal: 4,
};

function ManagerDashboard() {
  const { tickets, internalTickets, npsRecords } = useStore();
  const [period, setPeriod] = useState<Period>("mes");
  const [tier, setTier] = useState<CustomerTier | "todos">("todos");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cutoff = mounted ? Date.now() - PERIOD_HOURS[period] * 3600 * 1000 : 0;

  // ===== Devoluções (Omie) — prejuízo direto, indicador crítico =====
  // Fonte diferente das demais KPIs (que vêm de `tickets`, o módulo de
  // ocorrências): devolvido/devolvido_parcial vêm do ERP via sync-faturamento
  // e vivem em sac_notas_fiscais (o módulo SAC/NF), não em `tickets`.
  const [devolucaoNfs, setDevolucaoNfs] = useState<
    { valor_total: number | null; devolvido: boolean | null; devolvido_parcial: boolean | null; data_emissao: string | null }[]
  >([]);
  useEffect(() => {
    supabase
      .from("sac_notas_fiscais")
      .select("valor_total,devolvido,devolvido_parcial,data_emissao")
      .or("devolvido.eq.true,devolvido_parcial.eq.true")
      .then(({ data, error }) => {
        if (error) { console.error("[KPIs] Falha ao carregar devoluções", error); return; }
        setDevolucaoNfs(data ?? []);
      });
  }, []);
  const devolucoesNoPeriodo = useMemo(
    () =>
      devolucaoNfs.filter(
        (nf) => !mounted || !nf.data_emissao || new Date(nf.data_emissao).getTime() >= cutoff,
      ),
    [devolucaoNfs, cutoff, mounted],
  );
  const devolucaoValor = devolucoesNoPeriodo.reduce((s, nf) => s + (nf.valor_total ?? 0), 0);
  const devolucaoTotalCount = devolucoesNoPeriodo.filter((nf) => nf.devolvido).length;
  const devolucaoParcialCount = devolucoesNoPeriodo.filter((nf) => nf.devolvido_parcial && !nf.devolvido).length;

  const ticketsInPeriod = useMemo(
    () =>
      mounted
        ? tickets.filter((t) => new Date(t.createdAt).getTime() >= cutoff)
        : tickets,
    [tickets, cutoff, mounted],
  );
  const closed = ticketsInPeriod.filter((t) => t.status === "concluido");

  // ===== KPI 1: NPS =====
  const npsInPeriod = useMemo(() => {
    let recs = npsRecords.filter(
      (r) => !mounted || new Date(r.surveyDate).getTime() >= cutoff,
    );
    if (tier !== "todos") recs = recs.filter((r) => r.customerTier === tier);
    return recs;
  }, [npsRecords, cutoff, tier, mounted]);
  const npsAgg = aggregateNps(npsInPeriod);
  // fallback: derivar do campo .nps dos tickets se não houver NpsRecord
  const fallbackNps = (() => {
    const v = closed.map((t) => t.nps).filter((n): n is number => n !== undefined);
    if (!v.length) return null;
    const p = v.filter((n) => n >= 9).length;
    const d = v.filter((n) => n <= 6).length;
    return Math.round(((p - d) / v.length) * 100);
  })();
  const npsScore = npsInPeriod.length ? Math.round(npsAgg.npsScore) : (fallbackNps ?? 0);

  // ===== KPI 2: SLA Compliance =====
  const onTime = closed.filter(
    (t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 36e5 <= t.slaHours,
  ).length;
  const slaCompliance = closed.length ? (onTime / closed.length) * 100 : 0;

  // ===== KPI 3: MTTR =====
  const mttr = closed.length
    ? closed.reduce(
        (s, t) =>
          s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 36e5,
        0,
      ) / closed.length
    : 0;

  // ===== KPI 4: Reincidência =====
  const byCustomer: Record<string, number> = {};
  ticketsInPeriod.forEach((t) => (byCustomer[t.customer] = (byCustomer[t.customer] ?? 0) + 1));
  const customers = Object.keys(byCustomer).length;
  const recurring = Object.values(byCustomer).filter((n) => n > 1).length;
  const reincidenceRate = customers ? (recurring / customers) * 100 : 0;

  // ===== KPI 5: Custo da Não Qualidade =====
  const cnqByCause: Record<RootCause, number> = {
    venda: 0, expedicao: 0, engenharia: 0, cliente: 0, fornecedor: 0, produto: 0, producao: 0,
  };
  let cnqTotal = 0;
  closed.forEach((t) => {
    const cost =
      (t.custoNaoQualidade ?? 0) +
      (t.freightCostVp ?? 0) +
      (t.freightCostCustomer ?? 0);
    cnqTotal += cost;
    if (t.rootCause) cnqByCause[t.rootCause] += cost;
  });

  // ===== KPI 6: Tempo de resposta interno =====
  const internalResolved = internalTickets.filter((it) => it.status === "resolvido" && it.closedAt);
  const internalAvg = internalResolved.length
    ? internalResolved.reduce(
        (s, it) => s + (new Date(it.closedAt!).getTime() - new Date(it.openedAt).getTime()) / 36e5,
        0,
      ) / internalResolved.length
    : 0;
  const internalByDept: Record<InternalDepartment, { total: number; count: number }> = {
    comercial: { total: 0, count: 0 },
    expedicao: { total: 0, count: 0 },
    engenharia: { total: 0, count: 0 },
    producao: { total: 0, count: 0 },
    compras: { total: 0, count: 0 },
    qualidade: { total: 0, count: 0 },
  };
  internalResolved.forEach((it) => {
    const h = (new Date(it.closedAt!).getTime() - new Date(it.openedAt).getTime()) / 36e5;
    internalByDept[it.targetDepartment].total += h;
    internalByDept[it.targetDepartment].count += 1;
  });

  // Causa raiz (counts)
  const causeCounts: Record<RootCause, number> = {
    venda: 0, expedicao: 0, engenharia: 0, cliente: 0, fornecedor: 0, produto: 0, producao: 0,
  };
  closed.forEach((t) => t.rootCause && (causeCounts[t.rootCause] += 1));
  const maxCause = Math.max(1, ...Object.values(causeCounts));

  // ===== Dashboard: Ocorrências por Mês =====
  const byMonth: Record<string, { count: number; cost: number }> = {};
  ticketsInPeriod.forEach((t) => {
    const month = t.createdAt.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { count: 0, cost: 0 };
    byMonth[month].count += 1;
    byMonth[month].cost += (t.custoNaoQualidade ?? 0) + (t.freightCostVp ?? 0);
  });
  const monthEntries = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
  const maxMonthCount = Math.max(1, ...monthEntries.map(([, v]) => v.count));

  // ===== Dashboard: Ocorrências por Família de Produto =====
  const byFamily: Record<string, { count: number; cost: number }> = {};
  ticketsInPeriod.forEach((t) => {
    const fam = t.productFamily?.trim() || "Não informada";
    if (!byFamily[fam]) byFamily[fam] = { count: 0, cost: 0 };
    byFamily[fam].count += 1;
    byFamily[fam].cost += (t.custoNaoQualidade ?? 0) + (t.freightCostVp ?? 0);
  });
  const familyEntries = Object.entries(byFamily).sort(([, a], [, b]) => b.count - a.count).slice(0, 10);
  const maxFamilyCount = Math.max(1, ...familyEntries.map(([, v]) => v.count));

  const atRisk = mounted
    ? tickets.filter((t) => t.status !== "concluido" && slaStatus(t).tone !== "ok")
    : [];

  function exportCsv() {
    const rows = [
      ["KPI", "Valor", "Meta", "Status"],
      ["Prejuízo em devoluções (R$)", devolucaoValor.toFixed(2), "Reduzir", `${devolucoesNoPeriodo.length} NF(s)`],
      ["NPS Score", String(npsScore), `≥ ${META.nps}`, npsScore >= META.nps ? "OK" : "Abaixo"],
      ["SLA Compliance (%)", slaCompliance.toFixed(1), `≥ ${META.sla}%`, slaCompliance >= META.sla ? "OK" : "Abaixo"],
      ["MTTR (h)", mttr.toFixed(1), `< ${META.mttr}h`, mttr < META.mttr ? "OK" : "Acima"],
      ["Reincidência (%)", reincidenceRate.toFixed(1), `< ${META.reincidencia}%`, reincidenceRate < META.reincidencia ? "OK" : "Acima"],
      ["Custo Não Qualidade (R$)", cnqTotal.toFixed(2), "Reduzir 15%/tri", "—"],
      ["Resp. interno médio (h)", internalAvg.toFixed(1), `< ${META.internal}h`, internalAvg < META.internal ? "OK" : "Acima"],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vp-kpis-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <BackToDashboard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Gestor</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Indicadores em tempo real</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {PERIOD_LABEL[period]} · {ticketsInPeriod.length} ocorrências
            {tier !== "todos" && ` · cliente ${tier}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-md border bg-background px-3 py-2 text-sm">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((k) => (
              <option key={k} value={k}>{PERIOD_LABEL[k]}</option>
            ))}
          </select>
          <select value={tier} onChange={(e) => setTier(e.target.value as CustomerTier | "todos")} className="rounded-md border bg-background px-3 py-2 text-sm">
            <option value="todos">Todos os clientes</option>
            <option value="A">Tipo A</option>
            <option value="B">Tipo B</option>
            <option value="C">Tipo C</option>
          </select>
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </button>
          <button onClick={exportPdf} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            <FileText className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {/* Devoluções — prejuízo direto. Fonte: Omie (via sync-faturamento), não `tickets`. */}
      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-6 shadow-[var(--shadow-elegant)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-destructive/15">
              <PackageX className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-destructive">Prejuízo em devoluções</p>
              <p className="text-3xl font-bold tracking-tight text-destructive">{brl(devolucaoValor)}</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">{devolucoesNoPeriodo.length}</strong> NF(s) devolvida(s) no período
              {devolucaoTotalCount > 0 && ` · ${devolucaoTotalCount} total`}
              {devolucaoParcialCount > 0 && ` · ${devolucaoParcialCount} parcial`}
            </p>
            <p className="mt-0.5">Fonte: status de devolução do Omie por pedido</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icon={Star}
          label="NPS Score"
          value={`${npsScore}`}
          hint={`${npsInPeriod.length} respostas · meta ≥ ${META.nps}`}
          ok={npsScore >= META.nps}
          accent
        />
        <Kpi
          icon={ShieldCheck}
          label="SLA Compliance"
          value={`${slaCompliance.toFixed(0)}%`}
          hint={`${onTime}/${closed.length} no prazo · meta ≥ ${META.sla}%`}
          ok={slaCompliance >= META.sla}
        />
        <Kpi
          icon={Clock}
          label="MTTR"
          value={`${mttr.toFixed(1)}h`}
          hint={`Tempo médio · meta < ${META.mttr}h`}
          ok={mttr > 0 && mttr < META.mttr}
        />
        <Kpi
          icon={Repeat}
          label="Reincidência"
          value={`${reincidenceRate.toFixed(0)}%`}
          hint={`${recurring}/${customers} clientes · meta < ${META.reincidencia}%`}
          ok={reincidenceRate < META.reincidencia}
        />
        <Kpi
          icon={DollarSign}
          label="Custo Não Qualidade"
          value={brl(cnqTotal)}
          hint={`${closed.length} ocorrências · meta -15%/tri`}
        />
        <Kpi
          icon={Users}
          label="Resposta interna"
          value={`${internalAvg.toFixed(1)}h`}
          hint={`${internalResolved.length} resolvidos · meta < ${META.internal}h`}
          ok={internalAvg > 0 && internalAvg < META.internal}
        />
      </div>

      {/* NPS por categoria */}
      <div className="grid gap-6 lg:grid-cols-3">
        <NpsBreakdown agg={npsAgg} records={npsInPeriod} />
        <CnqByCause data={cnqByCause} total={cnqTotal} />
        <InternalByDept data={internalByDept} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <h2 className="text-base font-semibold">Distribuição de causa raiz</h2>
          <p className="text-xs text-muted-foreground">Tickets concluídos · {closed.length} amostras</p>
          <ul className="mt-5 space-y-3">
            {(Object.keys(causeCounts) as RootCause[]).map((c) => (
              <li key={c}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{ROOT_CAUSE_LABEL[c]}</span>
                  <span className="font-semibold">{causeCounts[c]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-[var(--gradient-gold)]" style={{ width: `${(causeCounts[c] / maxCause) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <h2 className="text-base font-semibold">Tickets em risco</h2>
          <p className="text-xs text-muted-foreground">SLA próximo do limite ou estourado</p>
          <ul className="mt-4 divide-y">
            {atRisk.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{t.customer}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{t.code} · {t.part}</div>
                </div>
                <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  {slaStatus(t).label}
                </span>
              </li>
            ))}
            {atRisk.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nenhum ticket em risco. ✨</li>}
          </ul>
        </section>
      </div>

      {/* Nº e R$ por Mês */}
      {monthEntries.length > 0 && (
        <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <h2 className="text-base font-semibold">Ocorrências por mês</h2>
          <p className="text-xs text-muted-foreground">Nº de ocorrências e custo (R$) no período selecionado</p>
          <ul className="mt-5 space-y-3">
            {monthEntries.map(([month, v]) => {
              const label = new Date(month + "-01").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
              return (
                <li key={month}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize">{label}</span>
                    <span className="flex gap-3 font-semibold">
                      <span>{v.count} oc.</span>
                      {v.cost > 0 && <span className="text-destructive/80">{brl(v.cost)}</span>}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-[var(--gradient-gold)]" style={{ width: `${(v.count / maxMonthCount) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Nº e R$ por Família de Produto */}
      <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <h2 className="text-base font-semibold">Ocorrências por família de produto</h2>
        <p className="text-xs text-muted-foreground">Top 10 famílias · Nº de ocorrências e custo</p>
        {familyEntries.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">Nenhum dado de família de produto registrado ainda.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {familyEntries.map(([fam, v]) => (
              <li key={fam}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{fam}</span>
                  <span className="flex gap-3 font-semibold">
                    <span>{v.count} oc.</span>
                    {v.cost > 0 && <span className="text-destructive/80">{brl(v.cost)}</span>}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary/60" style={{ width: `${(v.count / maxFamilyCount) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-[11px] text-muted-foreground">
        <TrendingUp className="mr-1 inline h-3 w-3" /> Widgets atualizam automaticamente a cada nova resposta · Use <Download className="mx-1 inline h-3 w-3" /> para exportar
      </p>
    </div>
  );
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function Kpi({ icon: Icon, label, value, hint, accent, ok }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string; accent?: boolean; ok?: boolean }) {
  const tone = accent ? "border-l-primary bg-primary text-primary-foreground" : ok === false ? "border-l-destructive" : ok ? "border-l-success" : "border-l-gold";
  return (
    <div className={`rounded-xl border border-l-4 bg-card p-5 shadow-[var(--shadow-elegant)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(0,0,0,0.1)] ${tone}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</span>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`text-[11px] ${accent ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{hint}</span>
        {ok !== undefined && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ok ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
            {ok ? "✓ Meta" : "↓ Meta"}
          </span>
        )}
      </div>
    </div>
  );
}

function NpsBreakdown({ agg, records }: { agg: ReturnType<typeof aggregateNps>; records: NpsRecord[] }) {
  const total = agg.total || 1;
  const seg = (cls: string, val: number) => `${cls} h-full`;
  return (
    <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
      <h2 className="text-base font-semibold">NPS por categoria</h2>
      <p className="text-xs text-muted-foreground">{records.length} respostas no período</p>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
        <div className={seg("bg-success", agg.promotores)} style={{ width: `${(agg.promotores / total) * 100}%` }} />
        <div className={seg("bg-warning", agg.neutros)} style={{ width: `${(agg.neutros / total) * 100}%` }} />
        <div className={seg("bg-destructive", agg.detratores)} style={{ width: `${(agg.detratores / total) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <Row dot="bg-success" label="Promotores" value={agg.promotores} pct={agg.pctPromotores} />
        <Row dot="bg-warning" label="Neutros" value={agg.neutros} pct={(agg.neutros / total) * 100} />
        <Row dot="bg-destructive" label="Detratores" value={agg.detratores} pct={agg.pctDetratores} />
      </ul>
    </section>
  );
}

function Row({ dot, label, value, pct }: { dot: string; label: string; value: number; pct: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="font-semibold">{value} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span></span>
    </li>
  );
}

function CnqByCause({ data, total }: { data: Record<RootCause, number>; total: number }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
      <h2 className="text-base font-semibold">Custo da Não Qualidade</h2>
      <p className="text-xs text-muted-foreground">Total: {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      <ul className="mt-4 space-y-3">
        {(Object.keys(data) as RootCause[]).map((c) => (
          <li key={c}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{ROOT_CAUSE_LABEL[c]}</span>
              <span className="font-semibold">{data[c].toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-destructive/70" style={{ width: `${(data[c] / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InternalByDept({ data }: { data: Record<InternalDepartment, { total: number; count: number }> }) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
      <h2 className="text-base font-semibold">Resposta interna por dept.</h2>
      <p className="text-xs text-muted-foreground">Tempo médio até resolução</p>
      <ul className="mt-4 space-y-3">
        {(Object.keys(data) as InternalDepartment[]).map((d) => {
          const v = data[d];
          const avg = v.count ? v.total / v.count : 0;
          const ok = avg > 0 && avg < META.internal;
          return (
            <li key={d} className="flex items-center justify-between text-sm">
              <span>{INTERNAL_DEPT_LABEL[d]}</span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{v.count ? `${avg.toFixed(1)}h` : "—"}</span>
                {v.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ok ? "bg-success/20 text-success" : "bg-warning/20 text-warning-foreground"}`}>
                    {v.count}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
