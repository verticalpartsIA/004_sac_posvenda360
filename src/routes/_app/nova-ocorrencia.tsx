import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  OCCURRENCE_REASON_LABEL,
  RESPONSIBLE_SECTOR_LABEL,
  CONTAINMENT_ACTION_LABEL,
  INTERNAL_DEPT_LABEL,
  INTERNAL_DEFAULT_SLA,
  RESOLUTION_STATUS_LABEL,
  type TicketChannel,
  type TicketPriority,
  type OccurrenceReason,
  type ResponsibleSector,
  type OccurrenceOrigin,
  type ResolutionStatus,
  type ContainmentAction,
  type InternalDepartment,
  type InternalPriority,
} from "@/lib/types";
import type { OmieCliente, OmieProduto } from "@/integrations/supabase/erp-client";
import { fetchClientesAtivosFn, fetchProdutosAtivosFn } from "@/integrations/supabase/erp-server-fn";
import { MessageCircle, FileEdit, Check, Bell, Mail, Phone, Search, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/nova-ocorrencia")({
  loader: async () => {
    const [clientes, produtos] = await Promise.all([
      fetchClientesAtivosFn(),
      fetchProdutosAtivosFn(),
    ]);
    return { clientes, produtos };
  },
  component: NewTicket,
});

const STEPS = [
  { n: 1, title: "Triagem", desc: "Cliente e canal" },
  { n: 2, title: "Ocorrência", desc: "Produto e narrativa" },
  { n: 3, title: "Ações", desc: "Contenção e ticket interno" },
  { n: 4, title: "Confirmação", desc: "Notificações e SLA" },
] as const;

function NewTicket() {
  const { clientes: erpClientes, produtos: erpProdutos } = Route.useLoaderData();
  const { createTicket, createInternalTicket, tickets } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState<TicketChannel>("manual");
  const [clientQuery, setClientQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [partQuery, setPartQuery] = useState("");
  const [showPartSuggest, setShowPartSuggest] = useState(false);

  const [form, setForm] = useState({
    customer: "",
    customerDoc: "",
    customerContato: "",
    customerTelefone: "",
    city: "",
    state: "",
    fornecedor: "",
    part: "",
    partCode: "",
    vendedor: "",
    productFamily: "",
    nfNumero: "",
    nfValor: 0,
    quantity: 1,
    unitValue: 0,
    reason: "",
    priority: "media" as TicketPriority,
    slaHours: 48,
    occurrenceReason: "devolucao_total" as OccurrenceReason,
    responsibleSector: "nao_aplica" as ResponsibleSector,
    origin: "externo" as OccurrenceOrigin,
    resolutionStatus: "em_analise" as ResolutionStatus,
    emitente: "",
    whatsappThreadId: "",
  });
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);
  const [contencao, setContencao] = useState<ContainmentAction[]>([]);
  const [openInternal, setOpenInternal] = useState(false);
  const [internal, setInternal] = useState({
    targetDepartment: "comercial" as InternalDepartment,
    priority: "media" as InternalPriority,
    subject: "",
    description: "",
    slaHours: INTERNAL_DEFAULT_SLA.comercial,
  });
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ ticketId: string; roNumber: string; internalCode?: string } | null>(null);

  // Autocomplete de clientes ERP
  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return erpClientes
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          (c.cnpj_cpf ?? "").toLowerCase().includes(q) ||
          (c.telefone ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clientQuery, erpClientes]);

  // Autocomplete de produtos ERP
  const partMatches = useMemo(() => {
    const q = partQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return erpProdutos
      .filter(
        (p) =>
          p.descricao.toLowerCase().includes(q) ||
          (p.codigo ?? "").toLowerCase().includes(q) ||
          (p.codigo_produto ?? "").toLowerCase().includes(q) ||
          (p.marca ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [partQuery, erpProdutos]);

  // Histórico do cliente selecionado (tickets já existentes)
  const clientHistory = useMemo(
    () => (form.customer ? tickets.filter((t) => t.customer === form.customer) : []),
    [form.customer, tickets],
  );

  function pickClient(c: OmieCliente) {
    setForm((f) => ({
      ...f,
      customer: c.nome,
      customerDoc: c.cnpj_cpf ?? "",
      customerContato: c.nome,
      customerTelefone: c.telefone ?? "",
      city: c.cidade ?? "",
      state: c.estado ?? "",
    }));
    setClientQuery(c.nome);
    setShowSuggest(false);
  }

  function pickPart(p: OmieProduto) {
    setForm((f) => ({
      ...f,
      part: p.descricao,
      partCode: p.codigo ?? p.codigo_produto,
      productFamily: p.codigo_familia ?? "",
    }));
    setPartQuery(p.descricao);
    setShowPartSuggest(false);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newPhotos = files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function toggleContencao(a: ContainmentAction) {
    setContencao((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  function next() {
    setErr(null);
    if (step === 1 && !form.customer) {
      setErr("Selecione ou cadastre um cliente.");
      return;
    }
    if (step === 2 && (!form.part || !form.partCode || !form.reason)) {
      setErr("Preencha peça, código e narrativa.");
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }

  async function finalize() {
    setErr(null);
    if (!form.customer) { setErr("Selecione um cliente antes de registrar."); return; }
    if (!form.part || !form.partCode || !form.reason) { setErr("Preencha peça, código ERP e narrativa antes de registrar."); return; }
    setSubmitting(true);
    try {
      const deadline = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado (20 s). Verifique sua conexão e tente novamente.")), 20_000),
      );
      const t = await Promise.race([
        createTicket({ ...form, channel, acaoContencao: contencao }),
        deadline,
      ]);
      let internalCode: string | undefined;
      if (openInternal && internal.subject) {
        const it = createInternalTicket({
          ...internal,
          linkedOccurrenceId: t.id,
          linkedCustomer: t.customer,
        });
        internalCode = it.code;
      }
      setCreated({ ticketId: t.id, roNumber: t.roNumber ?? t.code, internalCode });
    } catch (e) {
      console.error("[nova-ocorrencia] finalize error", e);
      setErr(e instanceof Error ? e.message : "Falha ao registrar a ocorrência. Verifique sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Novo</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Nova ocorrência</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fluxo guiado em {STEPS.length} passos — entender para atender.
        </p>
      </div>

      {/* Stepper — passos clicáveis */}
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s) => {
          const done = created ? true : step > s.n;
          const active = step === s.n;
          const canClick = !created && s.n < step;
          return (
            <li key={s.n}>
              <button
                type="button"
                disabled={!canClick && !active}
                onClick={() => canClick && setStep(s.n)}
                className={cn(
                  "w-full rounded-lg border border-gold bg-card p-3 text-left transition hover:shadow-[var(--shadow-gold)] disabled:cursor-not-allowed disabled:opacity-60",
                  active && "shadow-[var(--shadow-gold)] ring-1 ring-gold",
                  done && !active && "border-success/60",
                  s.n > step && !created && "opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", active ? "bg-gold text-gold-foreground" : done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>
                    {done && !active ? <Check className="h-3 w-3" /> : s.n}
                  </span>
                  <span className="text-sm font-semibold">{s.title}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.desc}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
        {/* ===== PASSO 1 ===== */}
        {step === 1 && !created && (
          <div className="space-y-5">
            <div role="group" aria-label="Canal da ocorrência" className="grid gap-3 sm:grid-cols-2">
              <ChannelCard active={channel === "whatsapp"} onClick={() => setChannel("whatsapp")} icon={MessageCircle} title="WhatsApp" desc="Vincular conversa do WhatsApp Business" />
              <ChannelCard active={channel === "manual"} onClick={() => setChannel("manual")} icon={FileEdit} title="Manual" desc="Telefone, e-mail ou portal" />
            </div>

            <Field label="Buscar cliente (nome, CNPJ/CPF ou telefone) *" htmlFor="customerSearch">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  id="customerSearch"
                  name="customerSearch"
                  required
                  aria-required="true"
                  aria-invalid={!!err && !form.customer}
                  aria-describedby={err && !form.customer ? "customerSearch-error" : undefined}
                  value={clientQuery}
                  onChange={(e) => { setClientQuery(e.target.value); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  className={cn(inputCls, "pl-9")}
                  placeholder="Ex: Empresa X, 12.345..., (11) 98877..."
                />
                {showSuggest && matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => pickClient(c)} className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted">
                          <span className="font-medium">{c.nome}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.cnpj_cpf || "—"}{c.telefone ? ` · ${c.telefone}` : ""}{c.cidade ? ` · ${c.cidade}/${c.estado}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {showSuggest && clientQuery.length >= 2 && matches.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
                    Nenhum cliente encontrado. Verifique o nome ou CNPJ.
                  </div>
                )}
              </div>
            </Field>

            {form.customer && (
              <div className="rounded-lg border border-gold/30 bg-gold-soft/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{form.customer}</div>
                    <div className="text-xs text-muted-foreground">{form.customerDoc}{form.city ? ` · ${form.city}/${form.state}` : ""}</div>
                    {form.customerTelefone && (
                      <div className="mt-1 text-xs text-muted-foreground">Tel: {form.customerTelefone}</div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold text-foreground">{clientHistory.length}</div>
                    <div className="text-muted-foreground">ocorrências no histórico</div>
                  </div>
                </div>
              </div>
            )}

            {channel === "whatsapp" && (
              <Field label="Vincular conversa WhatsApp (telefone ou ID)">
                <input value={form.whatsappThreadId} onChange={(e) => setForm({ ...form, whatsappThreadId: e.target.value })} className={inputCls} placeholder="Ex: 5511988770000 ou wa-thread-abc123" />
              </Field>
            )}
          </div>
        )}

        {/* ===== PASSO 2 ===== */}
        {step === 2 && !created && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Buscar produto (descrição, código ou marca) *">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      value={partQuery}
                      onChange={(e) => { setPartQuery(e.target.value); setForm({ ...form, part: e.target.value, partCode: "" }); setShowPartSuggest(true); }}
                      onFocus={() => setShowPartSuggest(true)}
                      className={cn(inputCls, "pl-9")}
                      placeholder="Ex: Correia, AB-1234, SKF..."
                    />
                    {showPartSuggest && partMatches.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                        {partMatches.map((p) => (
                          <li key={p.codigo}>
                            <button type="button" onClick={() => pickPart(p)} className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted">
                              <span className="font-medium">{p.descricao}</span>
                              <span className="text-xs text-muted-foreground">
                                {p.codigo_produto ?? p.codigo}{p.marca ? ` · ${p.marca}` : ""}{p.codigo_familia ? ` · Família: ${p.codigo_familia}` : ""}{p.unidade ? ` · ${p.unidade}` : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Field>
              </div>
              <Field label="Peça selecionada *">
                <input value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })} className={inputCls} placeholder="Ou digitar manualmente" />
              </Field>
              <Field label="Código (ERP) *">
                <input value={form.partCode} onChange={(e) => setForm({ ...form, partCode: e.target.value })} className={inputCls} placeholder="Ex: AB-3421" />
              </Field>
              <Field label="Motivo da ocorrência *">
                <select value={form.occurrenceReason} onChange={(e) => setForm({ ...form, occurrenceReason: e.target.value as OccurrenceReason })} className={inputCls}>
                  {(Object.keys(OCCURRENCE_REASON_LABEL) as OccurrenceReason[]).map((k) => (
                    <option key={k} value={k}>{OCCURRENCE_REASON_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Setor responsável">
                <select value={form.responsibleSector} onChange={(e) => setForm({ ...form, responsibleSector: e.target.value as ResponsibleSector })} className={inputCls}>
                  {(Object.keys(RESPONSIBLE_SECTOR_LABEL) as ResponsibleSector[]).map((k) => (
                    <option key={k} value={k}>{RESPONSIBLE_SECTOR_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Origem">
                <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value as OccurrenceOrigin })} className={inputCls}>
                  <option value="interno">Interno (problema na VP)</option>
                  <option value="externo">Externo (falha do cliente)</option>
                </select>
              </Field>
              <Field label="Situação">
                <select value={form.resolutionStatus} onChange={(e) => setForm({ ...form, resolutionStatus: e.target.value as ResolutionStatus })} className={inputCls}>
                  <option value="em_analise">{RESOLUTION_STATUS_LABEL.em_analise}</option>
                  <option value="autorizado">{RESOLUTION_STATUS_LABEL.autorizado}</option>
                  <option value="recusado">{RESOLUTION_STATUS_LABEL.recusado}</option>
                </select>
              </Field>
              <Field label="NF (número)">
                <input value={form.nfNumero} onChange={(e) => setForm({ ...form, nfNumero: e.target.value })} className={inputCls} placeholder="Ex: 123456" />
              </Field>
              <Field label="NF (R$)">
                <input type="number" min={0} step="0.01" value={form.nfValor} onChange={(e) => setForm({ ...form, nfValor: Number(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="Quantidade">
                <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="Família do produto">
                <input value={form.productFamily} onChange={(e) => setForm({ ...form, productFamily: e.target.value })} className={inputCls} placeholder="Preenchido automaticamente ao selecionar o produto" />
              </Field>
              <Field label="Vendedor">
                <input value={form.vendedor} onChange={(e) => setForm({ ...form, vendedor: e.target.value })} className={inputCls} placeholder="Responsável pela venda" />
              </Field>
            </div>

            <Field label="Narrativa da ocorrência *">
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={5} className={cn(inputCls, "resize-none")} placeholder="Descreva o que aconteceu, sem apontar culpados — foco em entender e resolver." />
              <p className="mt-1 text-[11px] text-muted-foreground">💡 Dica: descreva o ocorrido sem apontar culpados. O objetivo é entender para atender.</p>
            </Field>

            <div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ImageIcon className="mr-1 inline h-3.5 w-3.5" />Fotos / Evidências
                </span>
                <label className={cn(inputCls, "flex cursor-pointer items-center gap-2 py-1.5 text-muted-foreground hover:border-gold")}>
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-sm">Selecionar imagens…</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
              </label>
              {photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
                      <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PASSO 3 ===== */}
        {step === 3 && !created && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold">Ações de contenção</h3>
              <p className="text-xs text-muted-foreground">Selecione uma ou mais ações imediatas.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(Object.keys(CONTAINMENT_ACTION_LABEL) as ContainmentAction[]).map((a) => {
                  const checked = contencao.includes(a);
                  return (
                    <label key={a} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition", checked ? "border-gold bg-gold-soft/40" : "hover:border-gold/40")}>
                      <input type="checkbox" checked={checked} onChange={() => toggleContencao(a)} className="h-4 w-4 accent-[hsl(var(--gold))]" />
                      {CONTAINMENT_ACTION_LABEL[a]}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prioridade">
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })} className={inputCls}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </Field>
              <Field label="SLA (horas)">
                <input type="number" min={1} value={form.slaHours} onChange={(e) => setForm({ ...form, slaHours: Number(e.target.value) })} className={inputCls} />
              </Field>
            </div>

            <div className="rounded-lg border p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={openInternal} onChange={(e) => setOpenInternal(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--gold))]" />
                Abrir ticket interno em paralelo
              </label>
              {openInternal && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Departamento">
                    <select value={internal.targetDepartment} onChange={(e) => {
                      const dept = e.target.value as InternalDepartment;
                      setInternal({ ...internal, targetDepartment: dept, slaHours: INTERNAL_DEFAULT_SLA[dept] });
                    }} className={inputCls}>
                      {(Object.keys(INTERNAL_DEPT_LABEL) as InternalDepartment[]).map((k) => (
                        <option key={k} value={k}>{INTERNAL_DEPT_LABEL[k]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prioridade">
                    <select value={internal.priority} onChange={(e) => setInternal({ ...internal, priority: e.target.value as InternalPriority })} className={inputCls}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                      <option value="critica">Crítica</option>
                    </select>
                  </Field>
                  <Field label="SLA (horas)">
                    <input type="number" min={1} value={internal.slaHours} onChange={(e) => setInternal({ ...internal, slaHours: Number(e.target.value) })} className={inputCls} />
                  </Field>
                  <Field label="Assunto">
                    <input value={internal.subject} onChange={(e) => setInternal({ ...internal, subject: e.target.value })} className={inputCls} placeholder="Resumo da solicitação" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Descrição da solicitação">
                      <textarea value={internal.description} onChange={(e) => setInternal({ ...internal, description: e.target.value })} rows={3} className={cn(inputCls, "resize-none")} placeholder="O que você precisa do departamento?" />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PASSO 4 — confirmação / pós-criação ===== */}
        {step === 4 && (
          <div className="space-y-5">
            {created ? (
              <>
                <div className="rounded-lg border border-success/40 bg-success/10 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success text-success-foreground"><Check className="h-5 w-5" /></span>
                    <div>
                      <h3 className="font-semibold">Ocorrência {created.roNumber} registrada</h3>
                      <p className="text-xs text-muted-foreground">Prazo de resposta: {form.slaHours}h úteis a partir de agora.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Notificações disparadas</h4>
                  <NotifyRow icon={MessageCircle} label="WhatsApp ao cliente" detail={`"Sua ocorrência ${created.roNumber} foi registrada. Prazo: ${form.slaHours}h úteis."`} ok={!!form.customerTelefone} />
                  <NotifyRow icon={Mail} label="E-mail de confirmação" detail={`Para ${form.customerContato || "contato do cliente"}`} ok />
                  {created.internalCode && (
                    <NotifyRow icon={Bell} label={`Departamento ${INTERNAL_DEPT_LABEL[internal.targetDepartment]} notificado`} detail={`Ticket interno ${created.internalCode}`} ok />
                  )}
                  <NotifyRow icon={Phone} label="Dashboard atualizado em tempo real" detail="Operador e Gestor" ok />
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 text-xs">
                  <p className="font-semibold text-foreground">Monitoramento de SLA</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>• Alerta in-app aos <strong>50%</strong> do prazo</li>
                    <li>• Alerta + e-mail ao gestor aos <strong>80%</strong> do prazo</li>
                    <li>• Violação registrada em log e gerência notificada</li>
                  </ul>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => navigate({ to: "/ocorrencias" })} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Ver fila</button>
                  <button onClick={() => navigate({ to: "/ocorrencia/$ro", params: { ro: created.roNumber } })} className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Abrir {created.roNumber}</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold">Revise antes de registrar</h3>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <ReviewRow label="Canal" value={channel === "whatsapp" ? "WhatsApp" : "Manual"} />
                  <ReviewRow label="Cliente" value={`${form.customer} · ${form.customerDoc}`} />
                  <ReviewRow label="Produto" value={`${form.part} (${form.partCode})`} />
                  {form.productFamily && <ReviewRow label="Família" value={form.productFamily} />}
                  <ReviewRow label="Motivo" value={OCCURRENCE_REASON_LABEL[form.occurrenceReason]} />
                  <ReviewRow label="Prioridade · SLA" value={`${form.priority} · ${form.slaHours}h`} />
                  <ReviewRow label="Contenção" value={contencao.length ? contencao.map((c) => CONTAINMENT_ACTION_LABEL[c]).join(", ") : "—"} />
                  {openInternal && <ReviewRow label="Ticket interno" value={`${INTERNAL_DEPT_LABEL[internal.targetDepartment]} · ${internal.slaHours}h`} />}
                </dl>
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Ao confirmar, geramos o número RO automático e disparamos as notificações.
                </div>
              </>
            )}
          </div>
        )}

        {err && (
          <div
            id={step === 1 && !form.customer ? "customerSearch-error" : undefined}
            role="alert"
            className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </div>
        )}

        {/* Footer nav */}
        {!created && (
          <div className="mt-6 flex justify-between gap-2 border-t pt-4">
            <button type="button" onClick={() => (step === 1 ? navigate({ to: "/ocorrencias" }) : setStep(step - 1))} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              {step === 1 ? "Cancelar" : "Voltar"}
            </button>
            {step < 4 ? (
              <button type="button" onClick={next} className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Avançar</button>
            ) : (
              <button type="button" onClick={() => void finalize()} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-gold px-5 py-2 text-sm font-semibold text-gold-foreground hover:opacity-90 disabled:opacity-60">
                {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold-foreground border-t-transparent" />}
                {submitting ? "Registrando..." : "Registrar ocorrência"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{value || "—"}</dd>
    </div>
  );
}

function NotifyRow({ icon: Icon, label, detail, ok }: { icon: React.ComponentType<{ className?: string }>; label: string; detail: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background px-3 py-2">
      <span className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-md", ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      {ok && <Check className="h-4 w-4 text-success" />}
    </div>
  );
}

function ChannelCard({ active, onClick, icon: Icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
        active ? "border-gold bg-gold-soft shadow-[var(--shadow-gold)]" : "bg-card hover:border-gold/40",
      )}
    >
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-md", active ? "bg-gold text-gold-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
