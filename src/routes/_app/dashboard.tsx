import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, slaStatus } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { StatusBadge, PriorityBadge } from "@/components/app/StatusBadge";
import { SlaBar } from "@/components/app/SlaBar";
import { ArrowUpRight, Clock, AlertTriangle, CheckCircle2, MessageCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({ component: OperatorDashboard });

const ROLE_LABELS: Record<string, string> = {
  operador: "Operador",
  qualidade: "Qualidade",
  gestor: "Gestor",
  admin: "Admin",
};

type QuickFilter = "sla_estourado" | "triagem" | "alta_prioridade" | "sem_responsavel" | "whatsapp";

const FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "sla_estourado", label: "SLA estourado" },
  { key: "triagem", label: "Aguardando triagem" },
  { key: "alta_prioridade", label: "Alta prioridade" },
  { key: "sem_responsavel", label: "Sem responsável" },
  { key: "whatsapp", label: "WhatsApp" },
];

function matchesFilter(t: ReturnType<typeof useStore>["tickets"][number], filter: QuickFilter): boolean {
  switch (filter) {
    case "sla_estourado":
      return slaStatus(t).tone === "danger" && slaStatus(t).pct >= 100;
    case "triagem":
      return t.partCode === "WA-AUTO";
    case "alta_prioridade":
      return t.priority === "alta" || t.priority === "critica";
    case "sem_responsavel":
      return !t.assignee;
    case "whatsapp":
      return t.channel === "whatsapp";
    default:
      return true;
  }
}

function OperatorDashboard() {
  const { tickets, assignTicket } = useStore();
  const { user, roles } = useAuth();
  const [activeFilters, setActiveFilters] = useState<QuickFilter[]>([]);

  const rawName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0]?.split(".")[0] ??
    "usuário";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const roleLabel = roles[0] ? (ROLE_LABELS[roles[0]] ?? roles[0]) : "Operador";
  const open = tickets.filter((t) => t.status !== "concluido");
  const atRisk = open.filter((t) => slaStatus(t).tone !== "ok").length;
  const todayResolved = tickets.filter((t) => t.status === "concluido").length;
  const whatsapp = tickets.filter((t) => t.channel === "whatsapp").length;

  const toggleFilter = (key: QuickFilter) =>
    setActiveFilters((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));

  const filtered = useMemo(
    () => open.filter((t) => activeFilters.every((f) => matchesFilter(t, f))),
    [open, activeFilters],
  );
  const sorted = [...filtered].sort((a, b) => slaStatus(b).pct - slaStatus(a).pct);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">{roleLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Olá, {displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {open.length} tickets em andamento · {atRisk} demandam atenção imediata
          </p>
        </div>
        <Link to="/nova-ocorrencia" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          + Novo ticket
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Clock} label="Em andamento" value={open.length} tone="primary" />
        <KpiCard icon={AlertTriangle} label="Risco de SLA" value={atRisk} tone="danger" />
        <KpiCard icon={CheckCircle2} label="Concluídos" value={todayResolved} tone="success" />
        <KpiCard icon={MessageCircle} label="Via WhatsApp" value={whatsapp} tone="gold" />
      </div>

      <section className="rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
        <header className="flex flex-col gap-3 border-b px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Fila de atendimento</h2>
              <p className="text-xs text-muted-foreground">
                {activeFilters.length > 0
                  ? `${sorted.length} de ${open.length} tickets · filtrado`
                  : "Ordenada por proximidade do SLA"}
              </p>
            </div>
            <Link to="/ocorrencias" className="text-xs font-medium text-gold hover:underline inline-flex items-center gap-1">
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count = open.filter((t) => matchesFilter(t, f.key)).length;
              const active = activeFilters.includes(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleFilter(f.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>
        </header>
        <ul className="divide-y">
          {sorted.map((t) => {
            const responsavel = !t.assignee ? "Sem responsável" : t.assignee === user?.id ? "Você" : "Atribuído";
            return (
              <li key={t.id}>
                <Link to="/ocorrencia/$ro" params={{ ro: t.code }} className="grid grid-cols-1 gap-3 px-5 py-4 hover:bg-muted/40 sm:grid-cols-[auto_1fr_auto_140px_150px] sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">{t.code}</span>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.customer}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.part} · {t.partCode}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                  <SlaBar ticket={t} />
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className={cn("text-xs", !t.assignee && "text-muted-foreground")}>{responsavel}</span>
                    {t.assignee !== user?.id && (
                      <button
                        type="button"
                        title="Atribuir a mim"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (user?.id) assignTicket(t.id, user.id);
                        }}
                        className="inline-flex items-center justify-center rounded-md border border-input p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
          {sorted.length === 0 && (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground">
              {activeFilters.length > 0 ? "Nenhum ticket corresponde aos filtros." : "Nenhum ticket em andamento. ✨"}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "primary" | "danger" | "success" | "gold" }) {
  // Hierarquia visual: borda colorida + fundo suave + badge contextual + hover elevado
  const tones = {
    primary: { card: "border-l-4 border-l-primary bg-card", icon: "bg-primary/10 text-primary", badge: { text: "ATIVO", cls: "bg-primary/10 text-primary" } },
    danger:  { card: "border-l-4 border-l-[#FF6B6B] bg-[#FFEBEE]", icon: "bg-[#FF6B6B]/15 text-[#FF6B6B]", badge: { text: "ALTO", cls: "bg-[#FF6B6B] text-white" } },
    success: { card: "border-l-4 border-l-success bg-success/5", icon: "bg-success/15 text-success", badge: { text: "OK", cls: "bg-success/15 text-success" } },
    gold:    { card: "border-l-4 border-l-[#D4AF37] bg-[#FFF9E6]", icon: "bg-[#D4AF37]/15 text-[#9a7d18]", badge: { text: "EM ANDAMENTO", cls: "bg-[#D4AF37] text-black" } },
  }[tone];
  return (
    <div className={`rounded-xl border ${tones.card} p-5 shadow-[var(--shadow-elegant)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(0,0,0,0.1)]`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${tones.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones.badge.cls}`}>
          {tones.badge.text}
        </span>
      </div>
    </div>
  );
}
