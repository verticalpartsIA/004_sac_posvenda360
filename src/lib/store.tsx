import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Json, Tables } from "@/integrations/supabase/types";
import * as ticketsRepo from "@/lib/repositories/ticketsRepo";
import * as internalTicketsRepo from "@/lib/repositories/internalTicketsRepo";
import * as ticketMessagesRepo from "@/lib/repositories/ticketMessagesRepo";
import * as npsRepo from "@/lib/repositories/npsRepo";
import * as pesquisasRepo from "@/lib/repositories/pesquisasRepo";
import * as auditLogRepo from "@/lib/repositories/auditLogRepo";
import * as sacClientesRepo from "@/lib/repositories/sacClientesRepo";
import * as slaConfigRepo from "@/lib/repositories/slaConfigRepo";
import * as profilesRepo from "@/lib/repositories/profilesRepo";
import { slaStatus } from "@/lib/domain/sla";
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
import { categorizeNps, DEFAULT_SLA_HOURS } from "./types";

type TicketRow = Tables<"tickets">;
type InternalTicketRow = Tables<"internal_tickets">;
// Projeção enxuta usada pelo carregamento do Store (ver ticketMessagesRepo/auditLogRepo e #109)
// — só os campos que mapInternalResponse/mapAuditLog/extractTicketMeta de fato leem.
type TicketMessageRow = Pick<
  Tables<"ticket_messages">,
  "id" | "created_at" | "author_name" | "body" | "internal_ticket_id"
>;
type AuditLogRow = Pick<
  Tables<"audit_log">,
  "id" | "created_at" | "entity_type" | "entity_id" | "action" | "actor_name" | "payload"
>;
type NpsRow = Tables<"nps_records">;

/** Usuário atribuível a um ticket, resolvido a partir de `profiles` (ver #assignee). */
export type TeamMember = { userId: string; nome: string; departamento?: string };

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

function normalizeOccurrenceReason(
  reason: TicketRow["occurrence_reason"] | null,
): OccurrenceReason | undefined {
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

function denormalizeOccurrenceReason(
  reason: OccurrenceReason | undefined,
): TicketRow["occurrence_reason"] {
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

type ClienteTelefoneRow = Pick<
  Tables<"sac_clientes">,
  "telefone" | "whatsapp" | "nome_fantasia" | "razao_social"
>;

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function formatTelefone(raw: string): string {
  const d = onlyDigits(raw).replace(/^55(?=\d{10,11}$)/, ""); // tira o 55 (Brasil) se sobrar DDD+número
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** Mapa telefone (só dígitos) → nome de exibição, a partir de `sac_clientes`. */
function buildClienteNomePorTelefone(rows: ClienteTelefoneRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const nome = row.nome_fantasia || row.razao_social;
    if (!nome) continue;
    for (const tel of [row.telefone, row.whatsapp]) {
      const digits = onlyDigits(tel);
      if (digits) map.set(digits, nome);
    }
  }
  return map;
}

// Tickets criados automaticamente pelo webhook do WhatsApp usam o telefone cru como
// `customer` quando o contato não tem nome no perfil (ver #92). Resolve pra um nome
// real via sac_clientes quando possível; senão, rótulo claro em vez do número puro.
function resolveTicketCustomer(row: TicketRow, nomePorTelefone: Map<string, string>): TicketRow {
  const isRawPhone = /^\d{10,13}$/.test(row.customer.trim());
  if (!isRawPhone) return row;
  const telDigits = onlyDigits(row.customer_telefone) || onlyDigits(row.customer);
  const nome = nomePorTelefone.get(telDigits);
  const telFmt = formatTelefone(row.customer_telefone ?? row.customer);
  return {
    ...row,
    customer: nome ? `${nome} (${telFmt})` : `Cliente não identificado (${telFmt})`,
  };
}

function mapAuditLog(row: AuditLogRow): AuditLog {
  const detail =
    isRecord(row.payload) && typeof row.payload.detail === "string"
      ? row.payload.detail
      : undefined;

  return {
    id: row.id,
    at: row.created_at,
    actor: row.actor_name ?? "Sistema",
    action: row.action,
    detail,
  };
}

function mapTicket(row: TicketRow, audits: AuditLogRow[], internalIds: string[]): Ticket {
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
    sacNfId: row.sac_nf_id ?? undefined,
    dataInicioAnalise: row.updated_at,
    dataLimiteAtendimento: new Date(
      new Date(row.created_at).getTime() + row.sla_hours * 60 * 60 * 1000,
    ).toISOString(),
    dataFinalizacao: row.resolved_at ?? undefined,
    slaViolado:
      !!row.resolved_at &&
      new Date(row.resolved_at).getTime() >
        new Date(row.created_at).getTime() + row.sla_hours * 60 * 60 * 1000,
    channel: row.channel === "whatsapp" ? "whatsapp" : "manual",
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
    productFamily: row.product_family ?? undefined,
  };
}

function mapInternalResponse(
  row: TicketMessageRow,
  openedAt: string,
  previousAt?: string,
): InternalResponse {
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

// Pesquisa real do SAC (disparada por WhatsApp após entrega, vinculada a uma
// NF via sac_pesquisas.token) — schema próprio, sem FK para tickets/clientes
// do módulo de ocorrências. Mapeada pro mesmo formato de NpsRecord (só com
// nps_score preenchendo as 3 perguntas, igual ao fallback já usado a partir
// de ticket.nps) pra alimentar os mesmos dashboards sem duplicar lógica.
type SacNfFields = { razao_social_cliente: string | null; nf_numero: string | null };
type SacPesquisaRow = {
  id: string;
  nps_score: number | null;
  observacoes: string | null;
  respondida_em: string | null;
  created_at: string;
  // PostgREST pode devolver o embed como objeto ou array de 1 dependendo de
  // como infere a cardinalidade do FK — trata os dois formatos.
  sac_notas_fiscais: SacNfFields | SacNfFields[] | null;
};

function mapSacPesquisa(row: SacPesquisaRow): NpsRecord {
  const score = row.nps_score ?? 0;
  const nf = Array.isArray(row.sac_notas_fiscais)
    ? (row.sac_notas_fiscais[0] ?? null)
    : row.sac_notas_fiscais;
  return {
    id: `sac-pesquisa-${row.id}`,
    customer: nf?.razao_social_cliente ?? `NF ${nf?.nf_numero ?? "?"}`,
    customerTier: "B",
    surveyDate: row.respondida_em ?? row.created_at,
    q1Recomendacao: score,
    q2Resolucao: score,
    q3Agilidade: score,
    category: categorizeNps(score),
    feedback: row.observacoes ?? undefined,
    trigger: "pos_resolucao",
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
  productFamily?: string;
  sacNfId?: string;
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
  /** Pessoas atribuíveis a um ticket (de `profiles`) — usado pelo AssigneePicker. */
  teamMembers: TeamMember[];
  /** Prazo (horas) por prioridade, de `sla_config` — cai em DEFAULT_SLA_HOURS
   * enquanto não carrega ou se a tabela não tiver a prioridade (ver #90). */
  slaConfig: Record<TicketPriority, number>;
  storeReady: boolean;
  currentUser: string;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  createTicket: (i: NewTicketInput) => Promise<Ticket>;
  updateStatus: (id: string, status: TicketStatus) => void;
  assignTicket: (id: string, userId: string | null) => void;
  resolveTicket: (
    id: string,
    data: { rootCause: RootCause; justification: string; report: string },
  ) => void;
  setNps: (id: string, score: number) => void;
  deleteTicket: (id: string) => Promise<void>;
  createInternalTicket: (i: NewInternalTicketInput) => InternalTicket;
  respondInternalTicket: (id: string, text: string) => void;
  updateInternalStatus: (
    id: string,
    status: InternalTicketStatus,
    resolutionSummary?: string,
  ) => void;
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [slaConfig, setSlaConfig] = useState<Record<TicketPriority, number>>(DEFAULT_SLA_HOURS);
  const [storeReady, setStoreReady] = useState(false);
  // Busca global do header (AppLayout) — consumida por qualquer página que
  // liste tickets (Dashboard, Ocorrências) pra filtrar em tempo real, sem
  // precisar de Enter/navegação.
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  const loadAll = useCallback(async () => {
    const [ticketsRes, internalRes, messagesRes, auditsRes, npsRes, sacPesquisasRes, clientesRes, slaConfigRes, profilesRes] =
      await Promise.all([
        ticketsRepo.listAll(),
        internalTicketsRepo.listAll(),
        ticketMessagesRepo.listAll(),
        auditLogRepo.listAllOrdenado(),
        npsRepo.listAll(),
        pesquisasRepo.listRespondidas(),
        sacClientesRepo.listTelefones(),
        slaConfigRepo.listAll(),
        profilesRepo.listAll(),
      ]);

    if (ticketsRes.error) console.error("[Store] Failed to load tickets", ticketsRes.error);
    if (internalRes.error)
      console.error("[Store] Failed to load internal tickets", internalRes.error);
    if (messagesRes.error)
      console.error("[Store] Failed to load ticket messages", messagesRes.error);
    if (auditsRes.error) console.error("[Store] Failed to load audit log", auditsRes.error);
    if (npsRes.error) console.error("[Store] Failed to load NPS records", npsRes.error);
    if (sacPesquisasRes.error)
      console.error("[Store] Failed to load SAC pesquisas", sacPesquisasRes.error);
    if (clientesRes.error)
      console.error("[Store] Failed to load sac_clientes telefones", clientesRes.error);
    if (slaConfigRes.error)
      console.error("[Store] Failed to load sla_config", slaConfigRes.error);
    if (profilesRes.error) console.error("[Store] Failed to load profiles", profilesRes.error);

    const ticketRows = ticketsRes.data ?? [];
    const internalRows = internalRes.data ?? [];
    const messageRows = messagesRes.data ?? [];
    const auditRows = auditsRes.data ?? [];
    const npsRows = npsRes.data ?? [];
    const sacPesquisaRows = (sacPesquisasRes.data ?? []) as unknown as SacPesquisaRow[];
    const clienteNomePorTelefone = buildClienteNomePorTelefone(clientesRes.data ?? []);

    const mappedTickets = ticketRows.map((row) =>
      mapTicket(
        resolveTicketCustomer(row, clienteNomePorTelefone),
        auditRows.filter((audit) => audit.entity_type === "ticket" && audit.entity_id === row.id),
        internalRows
          .filter((internal) => internal.linked_occurrence_id === row.id)
          .map((internal) => internal.id),
      ),
    );

    const mappedInternalTickets = internalRows.map((row) =>
      mapInternalTicket(
        row,
        messageRows.filter((message) => message.internal_ticket_id === row.id),
      ),
    );

    const mergedNps = [...npsRows.map(mapNpsRecord), ...sacPesquisaRows.map(mapSacPesquisa)].sort(
      (a, b) => new Date(b.surveyDate).getTime() - new Date(a.surveyDate).getTime(),
    );

    if (slaConfigRes.data?.length) {
      setSlaConfig({
        ...DEFAULT_SLA_HOURS,
        ...Object.fromEntries(slaConfigRes.data.map((row) => [row.priority, row.hours])),
      });
    }

    setTickets(mappedTickets);
    setInternalTickets(mappedInternalTickets);
    setNpsRecords(mergedNps);
    setTeamMembers(
      (profilesRes.data ?? []).map((p) => ({
        userId: p.user_id,
        nome: p.display_name || p.user_id.slice(0, 8),
        departamento: p.departamento ?? undefined,
      })),
    );
    setStoreReady(true);
  }, []);

  useEffect(() => {
    if (!user?.id) return; // Don't fetch before user is authenticated
    void loadAll();
  }, [loadAll, user?.id]);

  const writeAudit = useCallback(
    async (
      entityType: string,
      entityId: string,
      action: string,
      payload?: Record<string, Json>,
    ) => {
      const { error } = await auditLogRepo.registrar({
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
      const { data, error } = await ticketsRepo.insert({
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
        sac_nf_id: input.sacNfId ?? null,
        acao_contencao: denormalizeContainmentActions(input.acaoContencao),
        ...(input.productFamily ? { product_family: input.productFamily } : {}),
        created_by: user?.id ?? null,
        assigned_to: user?.id ?? null,
      });

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
        const { error } = await ticketsRepo.update(id, { status: denormalizeTicketStatus(status) });

        if (error) {
          console.error("[Store] Failed to update ticket status", error);
          // rollback optimistic update
          if (prev !== undefined) {
            setTickets((ts) =>
              ts.map((ticket) =>
                ticket.id === id ? { ...ticket, status: prev, updatedAt: now() } : ticket,
              ),
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

  const assignTicket = useCallback<StoreCtx["assignTicket"]>(
    (id, userId) => {
      const prev = tickets.find((t) => t.id === id)?.assignee;

      setTickets((ts) =>
        ts.map((ticket) =>
          ticket.id === id
            ? { ...ticket, assignee: userId ?? undefined, updatedAt: now() }
            : ticket,
        ),
      );

      void (async () => {
        const { error } = await ticketsRepo.update(id, { assigned_to: userId });

        if (error) {
          console.error("[Store] Failed to assign ticket", error);
          setTickets((ts) =>
            ts.map((ticket) =>
              ticket.id === id ? { ...ticket, assignee: prev, updatedAt: now() } : ticket,
            ),
          );
          return;
        }

        await writeAudit("ticket", id, "ticket_assigned", {
          detail: userId ? `Ticket atribuído a ${currentUser}` : "Ticket sem responsável",
        });
        await loadAll();
      })();
    },
    [currentUser, loadAll, tickets, writeAudit],
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
        const { error } = await ticketsRepo.update(id, {
          status: "concluido",
          root_cause: data.rootCause,
          resolved_at: resolvedAt,
          updated_at: resolvedAt,
        });

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
        const { error } = await ticketsRepo.update(id, {
          nps: score,
          nps_sent_at: sentAt,
          updated_at: sentAt,
        });

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

  const deleteTicket = useCallback<StoreCtx["deleteTicket"]>(
    async (id) => {
      const ticket = tickets.find((t) => t.id === id);
      const { error } = await ticketsRepo.remove(id);

      if (error) {
        console.error("[Store] Failed to delete ticket", error);
        throw error;
      }

      setTickets((ts) => ts.filter((t) => t.id !== id));
      await writeAudit("ticket", id, "ticket_deleted", {
        detail: `Ticket ${ticket?.code ?? id} excluído por ${currentUser}`,
      });
      await loadAll();
    },
    [currentUser, loadAll, tickets, writeAudit],
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
        const { data, error } = await internalTicketsRepo.insert({
          target_department: input.targetDepartment,
          priority: input.priority,
          subject: input.subject,
          description: input.description,
          linked_occurrence_id: input.linkedOccurrenceId ?? null,
          linked_customer: input.linkedCustomer ?? null,
          sla_hours: input.slaHours,
          opened_by: user?.id ?? null,
        });

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
          ticketMessagesRepo.insert({
            internal_ticket_id: id,
            body: text,
            kind: "nota_interna",
            author_id: user?.id ?? null,
            author_name: currentUser,
          }),
          internalTicketsRepo.update(id, { status: "em_andamento", updated_at: now() }),
        ]);

        if (messageError) console.error("[Store] Failed to add internal response", messageError);
        if (statusError)
          console.error("[Store] Failed to update internal ticket status", statusError);
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

        const { error } = await internalTicketsRepo.update(id, payload);
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
        const { error } = await npsRepo.insert({
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
        const { error } = await ticketsRepo.update(id, {
          nc_descricao: data.descricaoNaoConformidade ?? null,
          acao_contencao: denormalizeContainmentActions(data.acaoContencao),
          custo_nao_qualidade: data.custoNaoQualidade ?? null,
          updated_at: now(),
        });

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

  // Memoizado: sem isso, qualquer tecla digitada na busca (globalSearchQuery)
  // recria este objeto e força TODOS os consumidores do contexto a
  // re-renderizar — incluindo a lista inteira de tickets — o que sob
  // digitação rápida atrasa frames e pode fazer teclas parecerem "perdidas".
  const value = useMemo<StoreCtx>(
    () => ({
      tickets,
      internalTickets,
      npsRecords,
      teamMembers,
      slaConfig,
      storeReady,
      currentUser,
      globalSearchQuery,
      setGlobalSearchQuery,
      createTicket,
      updateStatus,
      assignTicket,
      resolveTicket,
      setNps,
      deleteTicket,
      createInternalTicket,
      respondInternalTicket,
      updateInternalStatus,
      submitNpsSurvey,
      updateQualidade,
    }),
    [
      tickets,
      internalTickets,
      npsRecords,
      teamMembers,
      slaConfig,
      storeReady,
      currentUser,
      globalSearchQuery,
      setGlobalSearchQuery,
      createTicket,
      updateStatus,
      assignTicket,
      resolveTicket,
      setNps,
      deleteTicket,
      createInternalTicket,
      respondInternalTicket,
      updateInternalStatus,
      submitNpsSurvey,
      updateQualidade,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

// slaStatus é uma função pura (sem estado/supabase) e vive em lib/domain/sla —
// mesmo padrão do #64 — para ser testável em unidade e reutilizável fora do
// Store. Re-exportada aqui para não quebrar quem já importa de "@/lib/store".
export { slaStatus };
