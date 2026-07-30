import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  INTERNAL_DEPT_LABEL,
  INTERNAL_STATUS_LABEL,
  INTERNAL_DEFAULT_SLA,
  STATUS_LABEL,
  OCCURRENCE_REASON_LABEL,
  type InternalDepartment,
  type InternalPriority,
  type InternalTicketStatus,
  type Ticket,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/app/Modal";
import { Plus, Building2, Clock, Search, Link2 } from "lucide-react";

type TicketsInternosSearch = { from?: "ocorrencia"; ro?: string };

export const Route = createFileRoute("/_app/tickets-internos")({
  validateSearch: (search: Record<string, unknown>): TicketsInternosSearch => ({
    from: search.from === "ocorrencia" ? "ocorrencia" : undefined,
    ro: typeof search.ro === "string" ? search.ro : undefined,
  }),
  component: InternalTickets,
});

function InternalTickets() {
  const { tickets, internalTickets, createInternalTicket, respondInternalTicket, updateInternalStatus, globalSearchQuery, setGlobalSearchQuery } = useStore();
  const search = Route.useSearch();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = internalTickets.find((t) => t.id === activeId) ?? null;
  const query = globalSearchQuery.trim().toLowerCase();

  function linkedRo(it: (typeof internalTickets)[number]) {
    return it.linkedOccurrenceId ? tickets.find((t) => t.id === it.linkedOccurrenceId) : undefined;
  }

  const filtered = query
    ? internalTickets.filter((it) => {
        const ro = linkedRo(it);
        const haystack = `${it.code} ${it.subject} ${INTERNAL_DEPT_LABEL[it.targetDepartment]} ${it.linkedCustomer ?? ""} ${ro?.code ?? ""}`.toLowerCase();
        return haystack.includes(query);
      })
    : internalTickets;

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
            {filtered.map((t) => {
              const ro = linkedRo(t);
              return (
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
                      {ro ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-gold-soft px-1.5 py-0.5 font-semibold text-gold-foreground">
                          <Link2 className="h-3 w-3" /> Vinculado a {ro.code}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">
                          Avulso
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-5 py-12 text-center text-sm text-muted-foreground">
                {query ? (
                  <>
                    Nenhum ticket interno encontrado para "{globalSearchQuery.trim()}".
                    <br />
                    <button onClick={() => setGlobalSearchQuery("")} className="mt-2 text-gold hover:underline">
                      Limpar busca
                    </button>
                  </>
                ) : (
                  <>
                    Nenhum ticket interno aberto.{" "}
                    <button onClick={() => setOpen(true)} className="text-gold hover:underline">Abrir o primeiro</button>
                  </>
                )}
              </li>
            )}
          </ul>
        </div>

        <aside className="rounded-xl border bg-card p-5 shadow-[var(--shadow-elegant)]">
          {active ? (
            <InternalDetail
              key={active.id}
              ticket={active}
              linkedRo={linkedRo(active)}
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
          occurrences={tickets}
          onClose={() => setOpen(false)}
          onCreate={(data) => {
            createInternalTicket(data);
            setOpen(false);
          }}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {search.from === "ocorrencia" && search.ro ? (
          <Link to="/ocorrencia/$ro" params={{ ro: search.ro }} className="text-gold hover:underline">
            ← Voltar para {search.ro}
          </Link>
        ) : (
          <Link to="/ocorrencias" className="text-gold hover:underline">Ver ocorrências →</Link>
        )}
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
  linkedRo,
  onRespond,
  onStatus,
}: {
  ticket: ReturnType<typeof useStore>["internalTickets"][number];
  linkedRo?: Ticket;
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
        {linkedRo ? (
          <Link
            to="/ocorrencia/$ro"
            params={{ ro: linkedRo.code }}
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-gold-soft px-2 py-1 text-[11px] font-semibold text-gold-foreground hover:underline"
          >
            <Link2 className="h-3 w-3" /> Vinculado a {linkedRo.code} · {linkedRo.customer}
          </Link>
        ) : (
          <span className="mt-2 inline-flex items-center rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            Solicitação avulsa — sem ocorrência vinculada
          </span>
        )}
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
  occurrences,
  onClose,
  onCreate,
}: {
  occurrences: Ticket[];
  onClose: () => void;
  onCreate: (data: {
    targetDepartment: InternalDepartment;
    priority: InternalPriority;
    subject: string;
    description: string;
    slaHours: number;
    linkedOccurrenceId?: string;
    linkedCustomer?: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    targetDepartment: "" as InternalDepartment | "",
    priority: "media" as InternalPriority,
    subject: "",
    description: "",
    slaHours: 24,
  });
  const [occQuery, setOccQuery] = useState("");
  const [showOccSuggest, setShowOccSuggest] = useState(false);
  const [linkedOcc, setLinkedOcc] = useState<Ticket | null>(null);
  const [semOcorrencia, setSemOcorrencia] = useState(false);
  const [justificativaAvulsa, setJustificativaAvulsa] = useState("");

  const occMatches = useMemo(() => {
    const q = occQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return occurrences
      .filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          t.customer.toLowerCase().includes(q) ||
          (t.nfNumero ?? "").toLowerCase().includes(q) ||
          (t.roNumber ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [occQuery, occurrences]);

  const slaValid = Number.isInteger(form.slaHours) && form.slaHours >= 1;
  const vinculoOk = !!linkedOcc || (semOcorrencia && justificativaAvulsa.trim().length >= 5);
  const valid =
    !!form.targetDepartment && form.subject.trim() && form.description.trim() && slaValid && vinculoOk;

  function pickOcc(t: Ticket) {
    setLinkedOcc(t);
    setOccQuery(`${t.code} · ${t.customer}`);
    setShowOccSuggest(false);
    setSemOcorrencia(false);
  }

  function handleCreate() {
    if (!form.targetDepartment) return;
    const description = semOcorrencia
      ? `Sem ocorrência vinculada — motivo: ${justificativaAvulsa.trim()}\n\n${form.description.trim()}`
      : form.description.trim();
    onCreate({
      targetDepartment: form.targetDepartment,
      priority: form.priority,
      subject: form.subject.trim(),
      description,
      slaHours: form.slaHours,
      linkedOccurrenceId: linkedOcc?.id,
      linkedCustomer: linkedOcc?.customer,
    });
  }

  return (
    <Modal onClose={onClose} titleId="new-internal-ticket-title">
      <h2 id="new-internal-ticket-title" className="text-lg font-semibold">Novo ticket interno</h2>
      <p className="mt-1 text-xs text-muted-foreground">Solicite ajuda urgente a outro setor.</p>

      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ocorrência relacionada (RO, cliente, pedido ou NF)
          </span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="h-4 w-4" />
            </span>
            <input
              value={occQuery}
              onChange={(e) => { setOccQuery(e.target.value); setShowOccSuggest(true); setLinkedOcc(null); }}
              onFocus={() => setShowOccSuggest(true)}
              disabled={semOcorrencia}
              placeholder="Ex: RO-2026-00062, Empresa X, 29597..."
              className="w-full rounded-md border bg-background px-3 py-2 pl-9 text-sm disabled:opacity-50"
            />
            {showOccSuggest && occMatches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                {occMatches.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => pickOcc(t)} className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="font-medium">{t.code} · {t.customer}</span>
                      <span className="text-xs text-muted-foreground">{t.part} · {STATUS_LABEL[t.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </label>

        {linkedOcc && (
          <div className="rounded-lg border border-gold/30 bg-gold-soft/30 p-3 text-xs">
            <div className="font-semibold">{linkedOcc.code} · {linkedOcc.customer}</div>
            <div className="mt-1 text-muted-foreground">
              {linkedOcc.part} · {STATUS_LABEL[linkedOcc.status]} · SLA {linkedOcc.slaHours}h
              {linkedOcc.occurrenceReason && <> · {OCCURRENCE_REASON_LABEL[linkedOcc.occurrenceReason]}</>}
              {linkedOcc.sacNfId && <> · Origem SAC</>}
            </div>
          </div>
        )}

        {!linkedOcc && (
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={semOcorrencia}
              onChange={(e) => { setSemOcorrencia(e.target.checked); if (e.target.checked) { setOccQuery(""); setShowOccSuggest(false); } }}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--gold))]"
            />
            <span>Solicitação interna sem ocorrência (justifique abaixo)</span>
          </label>
        )}

        {semOcorrencia && (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por que não há ocorrência vinculada? *
            </span>
            <input
              value={justificativaAvulsa}
              onChange={(e) => setJustificativaAvulsa(e.target.value)}
              placeholder="Ex: manutenção preventiva de equipamento interno"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setor destino *</span>
          <select
            value={form.targetDepartment}
            onChange={(e) => {
              const d = e.target.value as InternalDepartment;
              setForm({ ...form, targetDepartment: d, slaHours: INTERNAL_DEFAULT_SLA[d] });
            }}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="" disabled>Selecione o setor</option>
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
              aria-invalid={!slaValid}
              className={cn("mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", !slaValid && "border-destructive")}
            />
            {!slaValid && <p className="mt-1 text-[11px] text-destructive">SLA deve ser um número inteiro de ao menos 1 hora.</p>}
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
          onClick={handleCreate}
          className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Abrir ticket
        </button>
      </div>
    </Modal>
  );
}
