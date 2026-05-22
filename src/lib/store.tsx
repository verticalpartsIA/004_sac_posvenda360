import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "./auth";
import type {
  Attachment,
  AuditLog,
  ContainmentAction,
  CustomerTier,
  InternalDepartment,
  InternalPriority,
  InternalResponse,
  InternalTicket,
  InternalTicketStatus,
  NpsRecord,
  NpsTrigger,
  OccurrenceOrigin,
  OccurrenceReason,
  ResolutionStatus,
  ResponsibleSector,
  RootCause,
  Ticket,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "./types";
import { categorizeNps } from "./types";

type TicketRow = Tables<"tickets">;
type InternalTicketRow = Tables<"internal_tickets">;
type TicketMessageRow = Tables<"ticket_messages">;
type AuditLogRow = Tables<"audit_log">;
type NpsRow = Tables<"nps_records">;

const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

function hoursBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60));
}

function normalizeTicketStatus(status: TicketRow["status"]): TicketStatus {
  switch (status) {
    case "aberto":
      return "aberto";
    case "em_atendimento":
    case "aguardando_cliente":
      return "analise";
    case "aguardando_interno":
      return "laudo";
    case "concluido":
      return "concluido";
    case "cancelado":
      return "aberto";
    default:
      return "aberto";
  }
}

function denormalizeTicketStatus(status: TicketStatus): TicketRow["status"] {
  switch (status) {
    case "aberto":
      return "aberto";
    case "analise":
      return "em_atendimento";
    case "laudo":
      return "aguardando_interno";
    case "concluido":
      return "concluido";
    default:
      return "aberto";
  }
}

function normalizeOccurrenceReason(reason: TicketRow["occurrence_reason"] | null): OccurrenceReason | undefined {
  switch (reason) {
    case "devolucao_total":
    case "devolucao_parcial":
    case "reparo":
      return reason;
    case "troca":
      return "troca_material";
    case "reclamacao":
    case "duvida_tecnica":
    case "outro":
      return "outros";
    default:
      return undefined;
  }
}

function denormalizeOccurrenceReason(reason: OccurrenceReason | undefined): TicketRow["occurrence_reason"] {
  switch (reason) {
    case "devolucao_total":
    case "devolucao_parcial":
    case "reparo":
      return reason;
    case "troca_material":
      return "troca";
    default:
      return "outro";
  }
}

function normalizeResponsibleSector(
  sector: TicketRow["responsible_sector"] | null,
): ResponsibleSector | undefined {
  switch (sector) {
    case "comercial":
    case "expedicao":
    case "engenharia":
    case "producao":
    case "nao_aplica":
      return sector;
    case "compras":
      return "fornecedor";
    case "qualidade":
      return "almoxarifado";
    default:
      return undefined;
  }
}

function denormalizeResponsibleSector(
  sector: ResponsibleSector | undefined,
): TicketRow["responsible_sector"] | null {
  switch (sector) {
    case "comercial":
    case "expedicao":
    case "engenharia":
    case "producao":
    case "nao_aplica":
      return sector;
    case "fornecedor":
      return "compras";
    case "almoxarifado":
    case "motorista":
      return "qualidade";
    default:
      return null;
  }
}

function normalizeContainmentActions(
  actions: TicketRow["acao_contencao"] | null,
): ContainmentAction[] {
  return (actions ?? []).map((action) => {
    switch (action) {
      case "sucatear":
        return "sucatear";
      case "retrabalhar":
        return "retrabalhar";
      case "segregar":
        return "selecao";
      case "liberar_uso":
        return "aceito_concessao";
      case "devolver_fornecedor":
        return "devolver";
      default:
        return "reclassificar";
    }
  });
}

function denormalizeContainmentActions(
  actions: ContainmentAction[] | undefined,
): TicketRow["acao_contencao"] {
  if (!actions?.length) return null;
  return actions.map((action) => {
    switch (action) {
      case "sucatear":
        return "sucatear";
      case "retrabalhar":
        return "retrabalhar";
      case "selecao":
        return "segregar";
      case "aceito_concessao":
      case "reclassificar":
        return "liberar_uso";
      case "devolver":
        return "devolver_fornecedor";
      default:
        return "outro";
    }
  });
}

function normalizeInternalStatus(status: InternalTicketRow["status"]): InternalTicketStatus {
  switch (status) {
    case "aberto":
      return "aberto";
    case "em_andamento":
      return "andamento";
    case "resolvido":
      return "resolvido";
    case "cancelado":
      return "aguardando";
    default:
      return "aberto";
  }
}

function denormalizeInternalStatus(status: InternalTicketStatus): InternalTicketRow["status"] {
  switch (status) {
    case "aberto":
      return "aberto";
    case "andamento":
      return "em_andamento";
    case "aguardando":
    case "escalado":
      return "cancelado";
    case "resolvido":
      return "resolvido";
    default:
      return "aberto";
  }
}

function isRecord(value: Json | null | undefined): value is Record<string, Json> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractTicketMeta(audits: AuditLogRow[]) {
  let resolution: { justification?: string; report?: string } | undefined;
  let quality:
    | {
        descricaoNaoConformidade?: string;
        analiseQualidade?: string;
        classificacaoQualidade?: string;
        observacoesQualidade?: string;
      }
    | undefined;

  for (const audit of audits) {
    if (!isRecord(audit.payload)) continue;

    if (audit.action === "ticket_resolved") {
      resolution = {
        justification:
          typeof audit.payload.justification === "string" ? audit.payload.justification : undefined,
        report: typeof audit.payload.report === "string" ? audit.payload.report : undefined,
      };
    }

    if (audit.action === "qualidade_updated") {
      quality = {
        descricaoNaoConformidade:
          typeof audit.payload.descricaoNaoConformidade === "string"
            ? audit.payload.descricaoNaoConformidade
            : undefined,
        analiseQualidade:
          typeof audit.payload.analiseQualidade === "string"
            ? audit.payload.analiseQualidade
            : undefined,
        classificacaoQualidade:
          typeof audit.payload.classificacaoQualidade === "string"
            ? audit.payload.classificacaoQualidade
            : undefined,
        observacoesQualidade:
          typeof audit.payload.observacoesQualidade === "string"
            ? audit.payload.observacoesQualidade
            : undefined,
      };
    }
  }

  return { resolution, quality };
}

function mapAuditLog(row: AuditLogRow): AuditLog {
  const detail =
    isRecord(row.payload) && typeof row.payload.detail === "string" ? row.payload.detail : undefined;

  return {
    id: row.id,
    at: row.created_at,
    actor: row.actor_name ?? "Sistema",
    action: row.action,
    detail,
  };
}

function mapTicket(
  row: TicketRow,
  audits: AuditLogRow[],
  internalIds: string[],
): Ticket {
  const meta = extractTicketMeta(audits);

  return {
    id: row.id,
    code: row.code,
    roNumber: row.ro_number ?? row.code,
    emitente: row.created_by ?? undefined,
    dataEmissao: row.created_at,
    customer: row.customer,
    customerDoc: row.customer_doc ?? undefined,
    customerContato: row.customer_contato ?? undefined,
    customerTelefone: row.customer_telefone ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    fornecedor: row.fornecedor ?? undefined,
    part: row.part,
    partCode: row.part_code,
    vendedor: row.vendedor ?? undefined,
    nfNumero: row.nf_numero ?? undefined,
    nfValor: row.nf_valor ?? undefined,
    quantity: row.quantity ?? undefined,
    unitValue: row.unit_value ?? undefined,
    reason: row.reason,
    occurrenceReason: normalizeOccurrenceReason(row.occurrence_reason),
    responsibleSector: normalizeResponsibleSector(row.responsible_sector),
    origin: row.origin ?? undefined,
    resolutionStatus: row.resolution_status ?? undefined,
    freightCostVp: row.freight_cost_vp ?? undefined,
    freightCostCustomer: row.freight_cost_customer ?? undefined,
    custoNaoQualidade: row.custo_nao_qualidade ?? undefined,
    acaoContencao: normalizeContainmentActions(row.acao_contencao),
    descricaoNaoConformidade: row.nc_descricao ?? meta.quality?.descricaoNaoConformidade,
    analiseQualidade: meta.quality?.analiseQualidade,
    classificacaoQualidade: meta.quality?.classificacaoQualidade,
    observacoesQualidade: meta.quality?.observacoesQualidade,
    whatsappThreadId: row.whatsapp_thread_id ?? undefined,
    dataInicioAnalise: row.updated_at,
    dataLimiteAtendimento: new Date(
      new Date(row.created_at).getTime() + row.sla_hours * 60 * 60 * 1000,
    ).toISOString(),
    dataFinalizacao: row.resolved_at ?? undefined,
    slaViolado:
      !!row.resolved_at &&
      new Date(row.resolved_at).getTime() >
        new Date(row.created_at).getTime() + row.sla_hours * 60 * 60 * 1000,
    channel: (row.channel === "whatsapp" ? "whatsapp" : "manual"),
    status: normalizeTicketStatus(row.status),
    priority: row.priority,
    slaHours: row.sla_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    rootCause: row.root_cause ?? undefined,
    rootCauseJustification: meta.resolution?.justification,
    technicalReport: meta.resolution?.report,
    attachments: [],
    nps: row.nps ?? undefined,
    npsSentAt: row.nps_sent_at ?? undefined,
    audit: audits.map(mapAuditLog),
    assignee: row.assigned_to ?? undefined,
    internalTicketIds: internalIds,
  };
}

function mapInternalResponse(row: TicketMessageRow, openedAt: string, previousAt?: string): InternalResponse {
  return {
    id: row.id,
    at: row.created_at,
    responder: row.author_name ?? "Sistema",
    text: row.body,
    attachments: [],
    responseHours: hoursBetween(previousAt ?? openedAt, row.created_at),
  };
}

function mapInternalTicket(row: InternalTicketRow, messages: TicketMessageRow[]): InternalTicket {
  const sortedMessages = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const responses = sortedMessages.map((message, index) =>
    mapInternalResponse(
      message,
      row.opened_at,
      index > 0 ? sortedMessages[index - 1]?.created_at : undefined,
    ),
  );

  return {
    id: row.id,
    code: row.code,
    openedBy: row.opened_by ?? "Sistema",
    openedAt: row.opened_at,
    targetDepartment: row.target_department,
    priority: row.priority,
    subject: row.subject,
    description: row.description ?? "",
    linkedOccurrenceId: row.linked_occurrence_id ?? undefined,
    linkedCustomer: row.linked_customer ?? undefined,
    slaHours: row.sla_hours,
    status: normalizeInternalStatus(row.status),
    responses,
    resolutionSummary: row.response ?? undefined,
    closedAt: row.closed_at ?? undefined,
    slaCumprido:
      row.closed_at != null
        ? hoursBetween(row.opened_at, row.closed_at) <= row.sla_hours
        : undefined,
  };
}

function mapNpsRecord(row: NpsRow): NpsRecord {
  return {
    id: row.id,
    customer: row.customer,
    customerTier: row.customer_tier ?? "B",
    occurrenceId: row.ticket_id ?? undefined,
    surveyDate: row.survey_date,
    q1Recomendacao: row.q1_recomendacao,
    q2Resolucao: row.q2_resolucao,
    q3Agilidade: row.q3_agilidade,
    category: row.category,
    feedback: row.comentario ?? undefined,
    trigger: (row.trigger as NpsTrigger | null) ?? "manual",
    createdAt: row.created_at,
  };
}

interface NewTicketInput {
  customer: string;
  customerDoc?: string;
  customerContato?: string;
  customerTelefone?: string;
  city?: string;
  state?: string;
  fornecedor?: string;
  part: string;
  partCode: string;
  vendedor?: string;
  nfNumero?: string;
  nfValor?: number;
  quantity?: number;
  unitValue?: number;
  reason: string;
  occurrenceReason?: OccurrenceReason;
  responsibleSector?: ResponsibleSector;
  origin?: OccurrenceOrigin;
  resolutionStatus?: ResolutionStatus;
  channel: TicketChannel;
  priority: TicketPriority;
  slaHours: number;
  emitente?: string;
  acaoContencao?: ContainmentAction[];
  whatsappThreadId?: string;
}

interface NewInternalTicketInput {
  targetDepartment: InternalDepartment;
  priority: InternalPriority;
  subject: string;
  description: string;
  linkedOccurrenceId?: string;
  linkedCustomer?: string;
  slaHours: number;
}

interface NewNpsInput {
  customer: string;
  customerTier: CustomerTier;
  occurrenceId?: string;
  q1Recomendacao: number;
  q2Resolucao: number;
  q3Agilidade: number;
  feedback?: string;
  trigger: NpsTrigger;
}

interface QualidadeInput {
  descricaoNaoConformidade?: string;
  acaoContencao?: ContainmentAction[];
  analiseQualidade?: string;
  classificacaoQualidade?: string;
  custoNaoQualidade?: number;
  observacoesQualidade?: string;
}

interface StoreCtx {
  tickets: Ticket[];
  internalTickets: InternalTicket[];
  npsRecords: NpsRecord[];
  storeReady: boolean;
  currentUser: string;
  createTicket: (i: NewTicketInput) => Promise<Ticket>;
  updateStatus: (id: string, status: TicketStatus) => void;
  resolveTicket: (id: string, data: { rootCause: RootCause; justification: string; report: string }) => void;
  setNps: (id: string, score: number) => void;
  createInternalTicket: (i: NewInternalTicketInput) => InternalTicket;
  respondInternalTicket: (id: string, text: string) => void;
  updateInternalStatus: (id: string, status: InternalTicketStatus, resolutionSummary?: string) => void;
  submitNpsSurvey: (i: NewNpsInput) => NpsRecord;
  updateQualidade: (id: string, data: QualidadeInput) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentUser = useMemo(() => user?.email?.split("@")[0] ?? "Sistema", [user?.email]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [internalTickets, setInternalTickets] = useState<InternalTicket[]>([]);
  const [npsRecords, setNpsRecords] = useState<NpsRecord[]>([]);
  const [storeReady, setStoreReady] = useState(false);

  const loadAll = useCallback(async () => {
    const [ticketsRes, internalRes, messagesRes, auditsRes, npsRes] = await Promise.all([
      supabase.from("tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("internal_tickets").select("*").order("opened_at", { ascending: false }),
      supabase.from("ticket_messages").select("*").order("created_at", { ascending: true }),
      supabase.from("audit_log").select("*").order("created_at", { ascending: true }),
      supabase.from("nps_records").select("*").order("survey_date", { ascending: false }),
    ]);

    if (ticketsRes.error) console.error("[Store] Failed to load tickets", ticketsRes.error);
    if (internalRes.error) console.error("[Store] Failed to load internal tickets", internalRes.error);
    if (messagesRes.error) console.error("[Store] Failed to load ticket messages", messagesRes.error);
    if (auditsRes.error) console.error("[Store] Failed to load audit log", auditsRes.error);
    if (npsRes.error) console.error("[Store] Failed to load NPS records", npsRes.error);

    const ticketRows = ticketsRes.data ?? [];
    const internalRows = internalRes.data ?? [];
    const messageRows = messagesRes.data ?? [];
    const auditRows = auditsRes.data ?? [];
    const npsRows = npsRes.data ?? [];

    const mappedTickets = ticketRows.map((row) =>
      mapTicket(
        row,
        auditRows.filter((audit) => audit.entity_type === "ticket" && audit.entity_id === row.id),
        internalRows.filter((internal) => internal.linked_occurrence_id === row.id).map((internal) => internal.id),
      ),
    );

    const mappedInternalTickets = internalRows.map((row) =>
      mapInternalTicket(
        row,
        messageRows.filter((message) => message.internal_ticket_id === row.id),
      ),
    );

    setTickets(mappedTickets);
    setInternalTickets(mappedInternalTickets);
    setNpsRecords(npsRows.map(mapNpsRecord));
    setStoreReady(true);
  }, []);

  useEffect(() => {
    if (!user?.id) return; // Don't fetch before user is authenticated
    void loadAll();
  }, [loadAll, user?.id]);

  const writeAudit = useCallback(
    async (entityType: string, entityId: string, action: string, payload?: Record<string, Json>) => {
      const { error } = await supabase.from("audit_log").insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor_id: user?.id ?? null,
        actor_name: currentUser,
        payload: payload ?? null,
      });

      if (error) console.error("[Store] Failed to write audit log", error);
    },
    [currentUser, user?.id],
  );

  const createTicket = useCallback<StoreCtx["createTicket"]>(
    async (input) => {
      const { data, error } = await supabase
        .from("tickets")
        .insert({
          customer: input.customer,
          customer_doc: input.customerDoc ?? null,
          customer_contato: input.customerContato ?? null,
          customer_telefone: input.customerTelefone ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          fornecedor: input.fornecedor ?? null,
          part: input.part,
          part_code: input.partCode,
          vendedor: input.vendedor ?? null,
          nf_numero: input.nfNumero ?? null,
          nf_valor: input.nfValor ?? null,
          quantity: input.quantity ?? null,
          unit_value: input.unitValue ?? null,
          reason: input.reason,
          occurrence_reason: denormalizeOccurrenceReason(input.occurrenceReason),
          responsible_sector: denormalizeResponsibleSector(input.responsibleSector),
          origin: input.origin ?? null,
          resolution_status: input.resolutionStatus ?? null,
          channel: input.channel,
          priority: input.priority,
          sla_hours: input.slaHours,
          whatsapp_thread_id: input.whatsappThreadId ?? null,
          acao_contencao: denormalizeContainmentActions(input.acaoContencao),
          created_by: user?.id ?? null,
          assigned_to: user?.id ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit("ticket", data.id, "ticket_created", {
        detail: `Ticket criado por ${currentUser}`,
      });

      void loadAll();

      return mapTicket(data as TicketRow, [], []);
    },
    [currentUser, loadAll, writeAudit],
  );

  const updateStatus = useCallback<StoreCtx["updateStatus"]>(
    (id, status) => {
      const prev = tickets.find((t) => t.id === id)?.status;

      setTickets((ts) =>
        ts.map((ticket) => (ticket.id === id ? { ...ticket, status, updatedAt: now() } : ticket)),
      );

      void (async () => {
        const { error } = await supabase
          .from("tickets")
          .update({ status: denormalizeTicketStatus(status) })
          .eq("id", id);

        if (error) {
          console.error("[Store] Failed to update ticket status", error);
          // rollback optimistic update
          if (prev !== undefined) {
            setTickets((ts) =>
              ts.map((ticket) => (ticket.id === id ? { ...ticket, status: prev, updatedAt: now() } : ticket)),
            );
          }
          return;
        }

        await writeAudit("ticket", id, "ticket_status_changed", {
          detail: `Status alterado para ${status}`,
        });
        await loadAll();
      })();
    },
    [loadAll, tickets, writeAudit],
  );

  const resolveTicket = useCallback<StoreCtx["resolveTicket"]>(
    (id, data) => {
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id
            ? {
                ...ticket,
                status: "concluido",
                rootCause: data.rootCause,
                rootCauseJustification: data.justification,
                technicalReport: data.report,
                resolvedAt: now(),
                updatedAt: now(),
              }
            : ticket,
        ),
      );

      void (async () => {
        const resolvedAt = now();
        const { error } = await supabase
          .from("tickets")
          .update({
            status: "concluido",
            root_cause: data.rootCause,
            resolved_at: resolvedAt,
            updated_at: resolvedAt,
          })
          .eq("id", id);

        if (error) {
          console.error("[Store] Failed to resolve ticket", error);
          return;
        }

        await writeAudit("ticket", id, "ticket_resolved", {
          justification: data.justification,
          report: data.report,
          detail: `Ticket concluido com causa raiz ${data.rootCause}`,
        });
        await loadAll();
      })();
    },
    [loadAll, writeAudit],
  );

  const setNps = useCallback<StoreCtx["setNps"]>(
    (id, score) => {
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id ? { ...ticket, nps: score, npsSentAt: now(), updatedAt: now() } : ticket,
        ),
      );

      void (async () => {
        const sentAt = now();
        const { error } = await supabase
          .from("tickets")
          .update({ nps: score, nps_sent_at: sentAt, updated_at: sentAt })
          .eq("id", id);

        if (error) {
          console.error("[Store] Failed to save ticket NPS", error);
          return;
        }

        await writeAudit("ticket", id, "ticket_nps_updated", {
          detail: `NPS registrado: ${score}`,
        });
        await loadAll();
      })();
    },
    [loadAll, writeAudit],
  );

  const createInternalTicket = useCallback<StoreCtx["createInternalTicket"]>(
    (input) => {
      const createdAt = now();
      const optimistic: InternalTicket = {
        id: `temp-${uid()}`,
        code: `INT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
        openedBy: currentUser,
        openedAt: createdAt,
        targetDepartment: input.targetDepartment,
        priority: input.priority,
        subject: input.subject,
        description: input.description,
        linkedOccurrenceId: input.linkedOccurrenceId,
        linkedCustomer: input.linkedCustomer,
        slaHours: input.slaHours,
        status: "aberto",
        responses: [],
      };

      setInternalTickets((prev) => [optimistic, ...prev]);

      void (async () => {
        const { data, error } = await supabase
          .from("internal_tickets")
          .insert({
            target_department: input.targetDepartment,
            priority: input.priority,
            subject: input.subject,
            description: input.description,
            linked_occurrence_id: input.linkedOccurrenceId ?? null,
            linked_customer: input.linkedCustomer ?? null,
            sla_hours: input.slaHours,
            opened_by: user?.id ?? null,
          })
          .select("id")
          .single();

        if (error) {
          console.error("[Store] Failed to create internal ticket", error);
          return;
        }

        await writeAudit("internal_ticket", data.id, "internal_ticket_created", {
          detail: `Ticket interno aberto para ${input.targetDepartment}`,
        });
        if (input.linkedOccurrenceId) {
          await writeAudit("ticket", input.linkedOccurrenceId, "internal_ticket_linked", {
            detail: `Ticket interno vinculado ao setor ${input.targetDepartment}`,
          });
        }
        await loadAll();
      })();

      return optimistic;
    },
    [currentUser, loadAll, writeAudit],
  );

  const respondInternalTicket = useCallback<StoreCtx["respondInternalTicket"]>(
    (id, text) => {
      setInternalTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id
            ? {
                ...ticket,
                status: ticket.status === "aberto" ? "andamento" : ticket.status,
                responses: [
                  ...ticket.responses,
                  {
                    id: uid(),
                    at: now(),
                    responder: currentUser,
                    text,
                    responseHours: hoursBetween(
                      ticket.responses.at(-1)?.at ?? ticket.openedAt,
                      now(),
                    ),
                  },
                ],
              }
            : ticket,
        ),
      );

      void (async () => {
        const [{ error: messageError }, { error: statusError }] = await Promise.all([
          supabase.from("ticket_messages").insert({
            internal_ticket_id: id,
            body: text,
            kind: "nota_interna",
            author_id: user?.id ?? null,
            author_name: currentUser,
          }),
          supabase
            .from("internal_tickets")
            .update({ status: "em_andamento", updated_at: now() })
            .eq("id", id),
        ]);

        if (messageError) console.error("[Store] Failed to add internal response", messageError);
        if (statusError) console.error("[Store] Failed to update internal ticket status", statusError);
        await loadAll();
      })();
    },
    [currentUser, loadAll, user?.id],
  );

  const updateInternalStatus = useCallback<StoreCtx["updateInternalStatus"]>(
    (id, status, resolutionSummary) => {
      setInternalTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id
            ? {
                ...ticket,
                status,
                resolutionSummary: resolutionSummary ?? ticket.resolutionSummary,
                closedAt: status === "resolvido" ? now() : ticket.closedAt,
              }
            : ticket,
        ),
      );

      void (async () => {
        const payload: Partial<InternalTicketRow> = {
          status: denormalizeInternalStatus(status),
          updated_at: now(),
        };

        if (status === "resolvido") {
          payload.closed_at = now();
          payload.response = resolutionSummary ?? null;
        }

        const { error } = await supabase.from("internal_tickets").update(payload).eq("id", id);
        if (error) {
          console.error("[Store] Failed to update internal ticket", error);
          return;
        }

        await writeAudit("internal_ticket", id, "internal_ticket_status_changed", {
          detail: `Status alterado para ${status}`,
        });
        await loadAll();
      })();
    },
    [loadAll, writeAudit],
  );

  const submitNpsSurvey = useCallback<StoreCtx["submitNpsSurvey"]>(
    (input) => {
      const optimistic: NpsRecord = {
        id: `temp-${uid()}`,
        customer: input.customer,
        customerTier: input.customerTier,
        occurrenceId: input.occurrenceId,
        surveyDate: now(),
        q1Recomendacao: input.q1Recomendacao,
        q2Resolucao: input.q2Resolucao,
        q3Agilidade: input.q3Agilidade,
        category: categorizeNps(input.q1Recomendacao),
        feedback: input.feedback,
        trigger: input.trigger,
        createdAt: now(),
      };

      setNpsRecords((prev) => [optimistic, ...prev]);

      void (async () => {
        const { error } = await supabase.from("nps_records").insert({
          customer: input.customer,
          customer_tier: input.customerTier,
          ticket_id: input.occurrenceId ?? null,
          q1_recomendacao: input.q1Recomendacao,
          q2_resolucao: input.q2Resolucao,
          q3_agilidade: input.q3Agilidade,
          category: categorizeNps(input.q1Recomendacao),
          comentario: input.feedback ?? null,
          trigger: input.trigger,
        });

        if (error) {
          console.error("[Store] Failed to submit NPS", error);
          return;
        }

        if (input.occurrenceId) {
          await writeAudit("ticket", input.occurrenceId, "nps_received", {
            detail: `NPS recebido: ${input.q1Recomendacao}`,
          });
        }

        await loadAll();
      })();

      return optimistic;
    },
    [loadAll, writeAudit],
  );

  const updateQualidade = useCallback<StoreCtx["updateQualidade"]>(
    (id, data) => {
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id
            ? {
                ...ticket,
                descricaoNaoConformidade: data.descricaoNaoConformidade,
                acaoContencao: data.acaoContencao,
                analiseQualidade: data.analiseQualidade,
                classificacaoQualidade: data.classificacaoQualidade,
                custoNaoQualidade: data.custoNaoQualidade,
                observacoesQualidade: data.observacoesQualidade,
                updatedAt: now(),
              }
            : ticket,
        ),
      );

      void (async () => {
        const { error } = await supabase
          .from("tickets")
          .update({
            nc_descricao: data.descricaoNaoConformidade ?? null,
            acao_contencao: denormalizeContainmentActions(data.acaoContencao),
            custo_nao_qualidade: data.custoNaoQualidade ?? null,
            updated_at: now(),
          })
          .eq("id", id);

        if (error) {
          console.error("[Store] Failed to update quality fields", error);
          return;
        }

        await writeAudit("ticket", id, "qualidade_updated", {
          descricaoNaoConformidade: data.descricaoNaoConformidade ?? null,
          analiseQualidade: data.analiseQualidade ?? null,
          classificacaoQualidade: data.classificacaoQualidade ?? null,
          observacoesQualidade: data.observacoesQualidade ?? null,
          detail: "Campos de qualidade atualizados",
        });
        await loadAll();
      })();
    },
    [loadAll, writeAudit],
  );

  return (
    <Ctx.Provider
      value={{
        tickets,
        internalTickets,
        npsRecords,
        storeReady,
        currentUser,
        createTicket,
        updateStatus,
        resolveTicket,
        setNps,
        createInternalTicket,
        respondInternalTicket,
        updateInternalStatus,
        submitNpsSurvey,
        updateQualidade,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export function slaStatus(t: Ticket): { pct: number; label: string; tone: "ok" | "warn" | "danger" } {
  const elapsed = (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
  const pct = Math.min(100, (elapsed / t.slaHours) * 100);
  if (t.status === "concluido") return { pct: 100, label: "SLA cumprido", tone: "ok" };
  if (pct >= 100) return { pct: 100, label: "SLA estourado", tone: "danger" };
  const restantes = Math.max(0, t.slaHours - elapsed).toFixed(1);
  if (pct >= 80) return { pct, label: `80% - ${restantes}h restantes`, tone: "danger" };
  if (pct >= 50) return { pct, label: `${restantes}h restantes (50%)`, tone: "warn" };
  return { pct, label: `${restantes}h restantes`, tone: "ok" };
}
