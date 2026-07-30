import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  INTERNAL_DEPT_LABEL,
  INTERNAL_STATUS_LABEL,
  INTERNAL_DEFAULT_SLA,
  type InternalDepartment,
  type InternalPriority,
  type InternalTicketStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/app/Modal";
import { Plus, Building2, Clock } from "lucide-react";

export const Route = createFileRoute("/_app/tickets-internos")({ component: InternalTickets });

function InternalTickets() {
  const { internalTickets, createInternalTicket, respondInternalTicket, updateInternalStatus } = useStore();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = internalTickets.find((t) => t.id === activeId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Colaboração</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Tickets internos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Solicitações entre setores · {internalTickets.length} ticket(s)
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo ticket interno
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
          <ul className="divide-y">
            {internalTickets.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-muted/40",
                    activeId === t.id && "bg-muted/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">{t.code}</span>
                    <InternalStatusPill status={t.status} />
                  </div>
                  <div className="font-medium">{t.subject}</div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {INTERNAL_DEPT_LABEL[t.targetDepartment]}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> SLA {t.slaHours}h</span>
                    <span>{t.responses.length} resposta(s)</span>
                  </div>
                </button>
              </li>
            ))}
            {internalTickets.length === 0 && (
              <li className="px-5 py-12 text-center text-sm text-muted-foreground">
                Nenhum ticket interno aberto.{" "}
                <button onClick={() => setOpen(true)} className="text-gold hover:underline">Abrir o primeiro</button>
              </li>
            )}
          </ul>
        </div>

        <aside className="rounded-xl border bg-card p-5 shadow-[var(--shadow-elegant)]">
          {active ? (
            <InternalDetail
              key={active.id}
              ticket={active}
              onRespond={(text) => respondInternalTicket(active.id, text)}
              onStatus={(s, summary) => updateInternalStatus(active.id, s, summary)}
            />
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Selecione um ticket para ver detalhes.
            </div>
          )}
        </aside>
      </div>

      {open && (
        <NewInternalDialog
          onClose={() => setOpen(false)}
          onCreate={(data) => {
            createInternalTicket(data);
            setOpen(false);
          }}
        />
      )}

      <p className="text-xs text-muted-foreground">
        <Link to="/ocorrencias" className="text-gold hover:underline">← Voltar para ocorrências</Link>
      </p>
    </div>
  );
}

function InternalStatusPill({ status }: { status: InternalTicketStatus }) {
  const tones: Record<InternalTicketStatus, string> = {
    aberto: "bg-destructive/10 text-destructive",
    andamento: "bg-warning/15 text-warning-foreground",
    aguardando: "bg-muted text-muted-foreground",
    resolvido: "bg-success/10 text-success",
    escalado: "bg-primary text-primary-foreground",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tones[status])}>
      {INTERNAL_STATUS_LABEL[status]}
    </span>
  );
}

function InternalDetail({
  ticket,
  onRespond,
  onStatus,
}: {
  ticket: ReturnType<typeof useStore>["internalTickets"][number];
  onRespond: (text: string) => void;
  onStatus: (s: InternalTicketStatus, summary?: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [summary, setSummary] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{ticket.code}</span>
          <InternalStatusPill status={ticket.status} />
        </div>
        <h3 className="mt-1 font-semibold">{ticket.subject}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Para <strong>{INTERNAL_DEPT_LABEL[ticket.targetDepartment]}</strong> · aberto por {ticket.openedBy}
        </p>
      </div>

      <p className="rounded-md bg-muted/50 p-3 text-sm">{ticket.description}</p>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Conversa ({ticket.responses.length})
        </div>
        <ul className="space-y-2">
          {ticket.responses.map((r) => (
            <li key={r.id} className="rounded-md border-l-2 border-gold/40 bg-background px-3 py-2">
              <div className="text-xs font-semibold">{r.responder}</div>
              <div className="text-sm">{r.text}</div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(r.at).toLocaleString("pt-BR")}
                {typeof r.responseHours === "number" && (
                  <span className="ml-2">· resp. em {r.responseHours.toFixed(1)}h</span>
                )}
              </div>
            </li>
          ))}
          {ticket.responses.length === 0 && (
            <li className="text-xs text-muted-foreground">Sem respostas ainda.</li>
          )}
        </ul>
      </div>

      {ticket.status !== "resolvido" && (
        <div className="space-y-2 border-t pt-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Escrever resposta..."
          />
          <div className="flex gap-2">
            <button
              disabled={!reply.trim()}
              onClick={() => { onRespond(reply.trim()); setReply(""); }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Responder
            </button>
            <button
              onClick={() => onStatus("aguardando")}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Aguardando info
            </button>
          </div>
          <div className="border-t pt-3">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Resumo da resolução"
            />
            <button
              disabled={!summary.trim()}
              onClick={() => onStatus("resolvido", summary.trim())}
              className="mt-2 w-full rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Marcar como resolvido
            </button>
          </div>
        </div>
      )}

      {ticket.status === "resolvido" && ticket.resolutionSummary && (
        <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">
          <div className="text-[11px] font-semibold uppercase text-success">Resolução</div>
          <div>{ticket.resolutionSummary}</div>
          {typeof ticket.slaCumprido === "boolean" && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              SLA: {ticket.slaCumprido ? "✅ cumprido" : "⚠️ violado"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewInternalDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    targetDepartment: InternalDepartment;
    priority: InternalPriority;
    subject: string;
    description: string;
    slaHours: number;
  }) => void;
}) {
  const [form, setForm] = useState({
    targetDepartment: "engenharia" as InternalDepartment,
    priority: "media" as InternalPriority,
    subject: "",
    description: "",
    slaHours: INTERNAL_DEFAULT_SLA.engenharia,
  });
  const valid = form.subject.trim() && form.description.trim();

  return (
    <Modal onClose={onClose} titleId="new-internal-ticket-title">
      <h2 id="new-internal-ticket-title" className="text-lg font-semibold">Novo ticket interno</h2>
      <p className="mt-1 text-xs text-muted-foreground">Solicite ajuda urgente a outro setor.</p>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setor destino</span>
            <select
              value={form.targetDepartment}
              onChange={(e) => {
                const d = e.target.value as InternalDepartment;
                setForm({ ...form, targetDepartment: d, slaHours: INTERNAL_DEFAULT_SLA[d] });
              }}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(INTERNAL_DEPT_LABEL) as InternalDepartment[]).map((d) => (
                <option key={d} value={d}>{INTERNAL_DEPT_LABEL[d]}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prioridade</span>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as InternalPriority })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SLA (h)</span>
              <input
                type="number"
                min={1}
                value={form.slaHours}
                onChange={(e) => setForm({ ...form, slaHours: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assunto</span>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Ex: Validar lote 8821"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Contexto da solicitação..."
            />
          </label>
        </div>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
        <button
          disabled={!valid}
          onClick={() => onCreate(form)}
          className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Abrir ticket
        </button>
      </div>
    </Modal>
  );
}
