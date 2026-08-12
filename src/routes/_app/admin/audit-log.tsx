import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import * as auditLogRepo from "@/lib/repositories/auditLogRepo";
import { cn } from "@/lib/utils";
import { History, RefreshCw, Filter } from "lucide-react";

export const Route = createFileRoute("/_app/admin/audit-log")({
  component: AuditLogPage,
});

type AuditEntry = {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_name: string | null;
  payload: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  expedicao_salva:       "Expedição salva",
  sac_salvo:             "SAC atualizado",
  obs_enviada_omie:      "Obs. enviada ao Omie",
  divergencia_reportada: "Divergência reportada",
  ticket_created:        "Ticket criado",
  ticket_resolved:       "Ticket resolvido",
  ticket_updated:        "Ticket atualizado",
  qualidade_updated:     "Qualidade atualizada",
  status_changed:        "Status alterado",
};

const MODULE_LABELS: Record<string, string> = {
  sac_nf: "SAC",
  ticket: "Ocorrências",
};

const ACTION_COLORS: Record<string, string> = {
  expedicao_salva:       "bg-amber-100 text-amber-800",
  sac_salvo:             "bg-blue-100 text-blue-800",
  obs_enviada_omie:      "bg-orange-100 text-orange-800",
  divergencia_reportada: "bg-red-100 text-red-800",
  ticket_created:        "bg-purple-100 text-purple-800",
  ticket_resolved:       "bg-green-100 text-green-800",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function payloadPreview(p: Record<string, unknown> | null): string {
  if (!p) return "—";
  const parts = Object.entries(p)
    .filter(([, v]) => v !== null && v !== undefined && !Array.isArray(v))
    .map(([k, v]) => `${k}: ${String(v)}`);
  const preview = parts.join(" · ").slice(0, 120);
  return preview || JSON.stringify(p).slice(0, 120);
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    const from = reset ? 0 : page * PAGE_SIZE;

    const { data } = await auditLogRepo.listPaginado(
      { entityType: filterModule || undefined, action: filterAction || undefined, actorName: filterActor || undefined },
      { from, to: from + PAGE_SIZE - 1 },
    );
    const rows = (data ?? []) as AuditEntry[];

    if (reset) {
      setEntries(rows);
      setPage(1);
    } else {
      setEntries((prev) => [...prev, ...rows]);
      setPage((p) => p + 1);
    }
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, [filterModule, filterAction, filterActor, page]);

  useEffect(() => { void load(true); }, [filterModule, filterAction, filterActor]);

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <History className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Histórico de Alterações</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Trilha de auditoria de todas as ações do sistema</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="ml-auto rounded-lg border p-2 hover:bg-muted disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          className="rounded-lg border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Todos os módulos</option>
          <option value="sac_nf">SAC</option>
          <option value="ticket">Ocorrências</option>
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Todas as ações</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          placeholder="Filtrar por usuário..."
          className="rounded-lg border bg-background px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {(filterModule || filterAction || filterActor) && (
          <button
            onClick={() => { setFilterModule(""); setFilterAction(""); setFilterActor(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Data / Hora</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Usuário</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Módulo</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Ação</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDate(e.created_at)}
                </td>
                <td className="px-4 py-3 text-xs max-w-[160px] truncate" title={e.actor_name ?? undefined}>
                  {e.actor_name ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {MODULE_LABELS[e.entity_type] ?? e.entity_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    ACTION_COLORS[e.action] ?? "bg-muted text-muted-foreground"
                  )}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate" title={e.payload ? JSON.stringify(e.payload) : undefined}>
                  {payloadPreview(e.payload)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        )}

        {hasMore && !loading && (
          <div className="border-t p-3 text-center">
            <button
              onClick={() => load(false)}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Carregar mais
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
