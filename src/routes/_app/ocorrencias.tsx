import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { StatusBadge, PriorityBadge } from "@/components/app/StatusBadge";
import { SlaBar } from "@/components/app/SlaBar";
import {
  STATUS_LABEL,
  OCCURRENCE_REASON_LABEL,
  RESPONSIBLE_SECTOR_LABEL,
  type TicketStatus,
  type OccurrenceReason,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/ocorrencias")({ component: TicketsList });

const filters: ("todos" | TicketStatus)[] = ["todos", "aberto", "analise", "laudo", "concluido"];

const REASON_TONE: Record<OccurrenceReason, string> = {
  devolucao_total: "bg-destructive/15 text-destructive border-destructive/30",
  devolucao_parcial: "bg-destructive/10 text-destructive border-destructive/20",
  reparo: "bg-warning/15 text-warning-foreground border-warning/30",
  troca_material: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
  atraso_entrega: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400",
  menor_quantidade: "bg-muted text-muted-foreground border-border",
  destinatario_errado: "bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400",
  outros: "bg-muted text-muted-foreground border-border",
};

function TicketsList() {
  const { tickets, globalSearchQuery, setGlobalSearchQuery } = useStore();
  const [filter, setFilter] = useState<(typeof filters)[number]>("todos");
  const [q, setQ] = useState("");

  // A busca local desta página tem prioridade; se estiver vazia, cai pra
  // busca global do header (AppLayout), pra manter as duas consistentes.
  const effectiveQuery = (q || globalSearchQuery).trim().toLowerCase();

  const filtered = tickets.filter((t) => {
    if (filter !== "todos" && t.status !== filter) return false;
    if (effectiveQuery && !`${t.code} ${t.customer} ${t.part} ${t.partCode}`.toLowerCase().includes(effectiveQuery)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Tickets</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Todos os tickets</h1>
        </div>
        <Link to="/nova-ocorrencia" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          + Novo ticket
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-elegant)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-80">
            <input
              value={q || globalSearchQuery}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código, cliente, peça..."
              className="w-full rounded-md border bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {effectiveQuery && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setGlobalSearchQuery("");
                }}
                title="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {f === "todos" ? "Todos" : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
        <div className="hidden grid-cols-[110px_1fr_140px_110px_auto_110px_140px_30px] items-center gap-3 border-b bg-muted/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
          <div>Código</div>
          <div>Cliente / Peça</div>
          <div>Motivo</div>
          <div>Setor</div>
          <div>Status</div>
          <div>Prioridade</div>
          <div>SLA</div>
          <div></div>
        </div>
        <ul className="divide-y">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                to="/ocorrencia/$ro"
                params={{ ro: t.code }}
                className="grid grid-cols-1 gap-3 px-5 py-4 hover:bg-muted/40 lg:grid-cols-[110px_1fr_140px_110px_auto_110px_140px_30px] lg:items-center lg:gap-3"
              >
                <span className="font-mono text-xs font-semibold">{t.code}</span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.customer}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.part} · {t.partCode}</div>
                </div>
                {t.occurrenceReason ? (
                  <span className={cn("inline-flex w-fit rounded-md border px-2 py-0.5 text-[10px] font-semibold", REASON_TONE[t.occurrenceReason])}>
                    {OCCURRENCE_REASON_LABEL[t.occurrenceReason]}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {t.responsibleSector ? RESPONSIBLE_SECTOR_LABEL[t.responsibleSector] : "—"}
                </span>
                <StatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
                <SlaBar ticket={t} />
                <span className="hidden text-muted-foreground lg:block">→</span>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhum ticket encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}
