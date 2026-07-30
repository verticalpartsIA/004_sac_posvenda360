import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, slaStatus } from "@/lib/store";
import {
  ROOT_CAUSE_LABEL,
  type RootCause,
  type TicketStatus,
  STATUS_LABEL,
  INTERNAL_DEPT_LABEL,
  INTERNAL_STATUS_LABEL,
  type InternalDepartment,
  type InternalPriority,
} from "@/lib/types";
import { StatusBadge, PriorityBadge } from "@/components/app/StatusBadge";
import { SlaBar } from "@/components/app/SlaBar";
import { ArrowLeft, ShieldCheck, Clock, User, MessageCircle, FileEdit, Star, AlertTriangle, Users, Plus, RefreshCw, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/ocorrencia/$ro")({ component: TicketDetail });

function TicketDetail() {
  const { ro } = Route.useParams();
  const router = useRouter();
  const { tickets, internalTickets, storeReady, updateStatus, resolveTicket, setNps, createInternalTicket } = useStore();
  const ticket = tickets.find((t) => t.code === ro || t.id === ro);

  const [resolving, setResolving] = useState(false);
  const [rootCause, setRootCause] = useState<RootCause | "">("");
  const [justification, setJustification] = useState("");
  const [report, setReport] = useState("");
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [resolvePhotos, setResolvePhotos] = useState<{ name: string; url: string }[]>([]);
  const [openInternal, setOpenInternal] = useState(false);

  if (!storeReady) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Ticket não encontrado</h2>
        <Link to="/ocorrencias" className="mt-4 inline-block text-sm text-gold hover:underline">← Voltar para tickets</Link>
      </div>
    );
  }

  const sla = slaStatus(ticket);
  const isClosed = ticket.status === "concluido";

  function handleResolvePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setResolvePhotos((prev) => [...prev, ...files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))]);
    e.target.value = "";
  }
  function removeResolvePhoto(idx: number) {
    setResolvePhotos((prev) => { URL.revokeObjectURL(prev[idx].url); return prev.filter((_, i) => i !== idx); });
  }

  const linkedInternal = internalTickets.filter((it) => ticket?.internalTicketIds?.includes(it.id));

  function handleResolve() {
    if (!rootCause) { setResolveErr("Selecione a causa raiz."); return; }
    if (justification.trim().length < 10) { setResolveErr("Justificativa deve ter ao menos 10 caracteres."); return; }
    if (report.trim().length < 10) { setResolveErr("Laudo técnico é obrigatório."); return; }
    resolveTicket(ticket!.id, { rootCause: rootCause as RootCause, justification, report });
    setResolving(false);
    router.invalidate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/ocorrencias" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para Ocorrências
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {ticket.channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <FileEdit className="h-3 w-3" />}
                {ticket.channel === "whatsapp" ? "WhatsApp" : "Manual"}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <h1 className="font-mono text-2xl font-bold text-gold-foreground">{ticket.code}</h1>
            </div>
            <p className="mt-1 text-base font-medium">{ticket.customer}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{ticket.part} · <span className="font-mono">{ticket.partCode}</span></p>
          </div>
          <div className="w-full sm:w-56">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide text-muted-foreground">SLA</span>
              <span className="font-semibold">{ticket.slaHours}h</span>
            </div>
            <SlaBar ticket={ticket} />
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-muted/50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Motivo relatado</div>
          <p className="mt-1 text-sm">{ticket.reason}</p>
        </div>

        {ticket.sacNfId && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/30 bg-gold-soft/20 p-3 text-sm">
            <span className="text-muted-foreground">
              Origem: <strong className="text-foreground">SAC / Pedido</strong>
              {ticket.nfNumero && <> · Pedido {ticket.nfNumero}</>}
            </span>
            <Link to="/sac/$nf" params={{ nf: ticket.sacNfId }} className="text-xs font-semibold text-gold hover:underline">
              Abrir SAC do pedido →
            </Link>
          </div>
        )}

        {!isClosed && (
          <div className="mt-5 flex flex-wrap gap-2">
            {(["aberto", "analise", "laudo"] as TicketStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(ticket.id, s)}
                disabled={ticket.status === s}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                  ticket.status === s ? "border-gold bg-gold-soft text-gold-foreground" : "hover:bg-muted",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
            <button
              onClick={() => setResolving((v) => !v)}
              className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Concluir ticket
            </button>
          </div>
        )}
      </div>

      {resolving && !isClosed && (
        <div className="rounded-xl border-2 border-gold bg-gold-soft/40 p-6 shadow-[var(--shadow-gold)]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-gold-foreground" />
            Conclusão exige causa raiz + justificativa + laudo técnico
          </div>
          <div className="mt-4 grid gap-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Causa raiz *</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(Object.keys(ROOT_CAUSE_LABEL) as RootCause[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRootCause(c)}
                    className={cn(
                      "rounded-md border bg-card px-3 py-2 text-xs font-medium transition",
                      rootCause === c ? "border-primary bg-primary text-primary-foreground" : "hover:border-gold",
                    )}
                  >
                    {ROOT_CAUSE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Justificativa *</span>
              <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Por que essa é a causa raiz?" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Laudo técnico *</span>
              <textarea value={report} onChange={(e) => setReport(e.target.value)} rows={4} className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Descrição da análise, evidências e ação corretiva..." />
            </label>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ImageIcon className="mr-1 inline h-3.5 w-3.5" />Fotos / Evidências
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:border-gold">
                <ImageIcon className="h-4 w-4" />
                <span>Selecionar imagens…</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleResolvePhotoChange} />
              </label>
              {resolvePhotos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {resolvePhotos.map((p, i) => (
                    <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
                      <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeResolvePhoto(i)} className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {resolveErr && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{resolveErr}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setResolving(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
              <button onClick={handleResolve} className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Concluir ticket</button>
            </div>
          </div>
        </div>
      )}

      {isClosed && (
        <div className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-success" /> Resolução registrada
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Causa raiz</dt>
              <dd className="mt-1 inline-flex rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{ROOT_CAUSE_LABEL[ticket.rootCause!]}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">NPS</dt>
              <dd className="mt-1">
                {ticket.nps !== undefined ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold"><Star className="h-4 w-4 text-gold" />{ticket.nps}/10</span>
                ) : (
                  <NpsCapture onSubmit={(n) => setNps(ticket.id, n)} />
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Justificativa</dt>
              <dd className="mt-1 text-sm">{ticket.rootCauseJustification}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Laudo técnico</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{ticket.technicalReport}</dd>
            </div>
            {resolvePhotos.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <ImageIcon className="mr-1 inline h-3 w-3" />Fotos anexadas ({resolvePhotos.length})
                </dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {resolvePhotos.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" title={p.name}>
                      <img src={p.url} alt={p.name} className="h-20 w-20 rounded-md border object-cover hover:opacity-80" />
                    </a>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-gold" /> Tickets internos vinculados ({linkedInternal.length})
          </div>
          {!isClosed && (
            <button
              onClick={() => setOpenInternal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gold px-3 py-1.5 text-xs font-semibold text-gold-foreground hover:bg-gold-soft"
            >
              <Plus className="h-3 w-3" /> Abrir ticket interno
            </button>
          )}
        </div>
        {linkedInternal.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {linkedInternal.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">{it.code}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">{INTERNAL_DEPT_LABEL[it.targetDepartment]}</span>
                  </div>
                  <div className="text-sm font-medium">{it.subject}</div>
                </div>
                <Link to="/tickets-internos" className="text-[11px] font-semibold text-gold hover:underline">
                  {INTERNAL_STATUS_LABEL[it.status]} →
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Nenhum ticket interno aberto para esta ocorrência.</p>
        )}
      </div>

      {openInternal && (
        <QuickInternalDialog
          onClose={() => setOpenInternal(false)}
          onCreate={(data) => {
            createInternalTicket({ ...data, linkedOccurrenceId: ticket.id });
            setOpenInternal(false);
          }}
        />
      )}

      <div className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-gold" /> Trilha de auditoria
        </div>
        {ticket.audit.length > 0 ? (
          <ol className="mt-4 space-y-3">
            {[...ticket.audit].reverse().map((a) => (
              <li key={a.id} className="flex gap-3 border-l-2 border-gold/40 pl-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.action}</div>
                  {a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3" /> {a.actor} · {new Date(a.at).toLocaleString("pt-BR")}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Nenhum evento registrado para esta ocorrência ainda.</p>
        )}
        {ticket.audit.length > 0 && (
          <p className="mt-4 text-[11px] text-muted-foreground">Logs imutáveis · Conformidade LGPD</p>
        )}
      </div>
    </div>
  );
}

function NpsCapture({ onSubmit }: { onSubmit: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: 11 }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSubmit(i)}
          className="h-7 w-7 rounded-md border text-xs font-semibold hover:border-gold hover:bg-gold-soft"
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function QuickInternalDialog({
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
    slaHours: 24,
  });
  const [intPhotos, setIntPhotos] = useState<{ name: string; url: string }[]>([]);
  const valid = form.subject.trim() && form.description.trim();

  function handleIntPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setIntPhotos((prev) => [...prev, ...files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))]);
    e.target.value = "";
  }
  function removeIntPhoto(idx: number) {
    setIntPhotos((prev) => { URL.revokeObjectURL(prev[idx].url); return prev.filter((_, i) => i !== idx); });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        <h2 className="text-lg font-semibold">Abrir ticket interno</h2>
        <p className="mt-1 text-xs text-muted-foreground">Vinculado à ocorrência atual.</p>
        <div className="mt-4 grid gap-3">
          <select
            value={form.targetDepartment}
            onChange={(e) => setForm({ ...form, targetDepartment: e.target.value as InternalDepartment })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {(Object.keys(INTERNAL_DEPT_LABEL) as InternalDepartment[]).map((d) => (
              <option key={d} value={d}>{INTERNAL_DEPT_LABEL[d]}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as InternalPriority })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
            <input
              type="number"
              min={1}
              value={form.slaHours}
              onChange={(e) => setForm({ ...form, slaHours: Number(e.target.value) })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="SLA (h)"
            />
          </div>
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Assunto"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Descrição..."
          />
          <div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:border-gold">
              <ImageIcon className="h-4 w-4" />
              <span>Fotos / evidências (opcional)</span>
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleIntPhotoChange} />
            </label>
            {intPhotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {intPhotos.map((p, i) => (
                  <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border bg-muted">
                    <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => removeIntPhoto(i)} className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            disabled={!valid}
            onClick={() => onCreate(form)}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Abrir
          </button>
        </div>
      </div>
    </div>
  );
}
