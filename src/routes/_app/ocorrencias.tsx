import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { StatusBadge, PriorityBadge } from "@/components/app/StatusBadge";
import { SlaBar } from "@/components/app/SlaBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  nao_chegou: "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400",
  produto_errado: "bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400",
  produto_avariado: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400",
  documento_nf_boleto: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
  insatisfacao: "bg-destructive/10 text-destructive border-destructive/20",
  outros: "bg-muted text-muted-foreground border-border",
};

function TicketsList() {
  const { tickets, globalSearchQuery, setGlobalSearchQuery, deleteTicket } = useStore();
  const [filter, setFilter] = useState<(typeof filters)[number]>("todos");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTicket(deleteTarget.id);
      toast.success(`Ticket ${deleteTarget.code} excluído.`);
      setDeleteTarget(null);
    } catch {
      toast.error("Não foi possível excluir o ticket. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  }

  // Mesmo estado de busca do header (AppLayout) — sem estado local duplicado,
  // pra não ter dois valores brigando por qual é a fonte da verdade (isso
  // causava o campo "travar" ao tentar limpar: limpar o local só revelava o
  // valor global antigo por baixo).
  const query = globalSearchQuery.trim().toLowerCase();

  const filtered = tickets.filter((t) => {
    if (filter !== "todos" && t.status !== filter) return false;
    if (query && !`${t.code} ${t.customer} ${t.part} ${t.partCode}`.toLowerCase().includes(query)) return false;
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
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              aria-label="Buscar ocorrências"
              placeholder="Buscar por código, cliente, peça..."
              className="w-full rounded-md border bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {globalSearchQuery && (
              <button
                type="button"
                onClick={() => setGlobalSearchQuery("")}
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
        <div className="hidden grid-cols-[110px_1fr_140px_110px_auto_110px_140px_30px_36px] items-center gap-3 border-b bg-muted/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
          <div>Código</div>
          <div>Cliente / Peça</div>
          <div>Motivo</div>
          <div>Setor</div>
          <div>Status</div>
          <div>Prioridade</div>
          <div>SLA</div>
          <div></div>
          <div></div>
        </div>
        <ul className="divide-y">
          {filtered.map((t) => (
            <li key={t.id} className="relative">
              <Link
                to="/ocorrencia/$ro"
                params={{ ro: t.code }}
                className="grid grid-cols-1 gap-3 px-5 py-4 pr-12 hover:bg-muted/40 lg:grid-cols-[110px_1fr_140px_110px_auto_110px_140px_30px_36px] lg:items-center lg:gap-3 lg:pr-5"
              >
                <span className="font-mono text-xs font-semibold">{t.code}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate font-medium">
                    {t.customer}
                    {t.sacNfId && (
                      <span className="rounded-md bg-gold-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold-foreground">
                        SAC
                      </span>
                    )}
                  </div>
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
                <span />
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteTarget({ id: t.id, code: t.code });
                }}
                title="Excluir ticket"
                aria-label={`Excluir ticket ${t.code}`}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground">
              {query || filter !== "todos" ? "Nenhum resultado encontrado." : "Nenhum ticket encontrado."}
            </li>
          )}
        </ul>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ticket {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é definitiva e remove o ticket, suas mensagens e histórico. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
