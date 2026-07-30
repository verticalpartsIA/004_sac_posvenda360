export type TicketStatus = "aberto" | "analise" | "laudo" | "concluido";
export type TicketPriority = "baixa" | "media" | "alta" | "critica";
export type RootCause =
  | "venda"
  | "expedicao"
  | "engenharia"
  | "cliente"
  | "fornecedor"
  | "produto"
  | "producao";
export type TicketChannel = "whatsapp" | "manual";

// ===== v2: FO-OEA-Q-502 =====
export type OccurrenceReason =
  | "devolucao_total"
  | "devolucao_parcial"
  | "reparo"
  | "menor_quantidade"
  | "destinatario_errado"
  | "troca_material"
  | "atraso_entrega"
  | "nao_chegou"
  | "produto_errado"
  | "produto_avariado"
  | "documento_nf_boleto"
  | "insatisfacao"
  | "outros";

export type ResponsibleSector =
  | "comercial"
  | "expedicao"
  | "engenharia"
  | "producao"
  | "almoxarifado"
  | "fornecedor"
  | "motorista"
  | "nao_aplica";

export type OccurrenceOrigin = "interno" | "externo";

export const OCCURRENCE_REASON_LABEL: Record<OccurrenceReason, string> = {
  devolucao_total: "Devolução Total",
  devolucao_parcial: "Devolução Parcial",
  reparo: "Reparo",
  menor_quantidade: "Material enviado em menor quantidade",
  destinatario_errado: "Destinatário errado",
  troca_material: "Troca de material",
  atraso_entrega: "Atraso na entrega",
  nao_chegou: "Não chegou / Extraviado",
  produto_errado: "Chegou produto errado",
  produto_avariado: "Produto avariado",
  documento_nf_boleto: "Documento (NF/Boleto)",
  insatisfacao: "Insatisfação do cliente",
  outros: "Outros",
};

export type ResolutionStatus = "autorizado" | "recusado" | "em_analise";

export const RESOLUTION_STATUS_LABEL: Record<ResolutionStatus, string> = {
  autorizado: "Autorizado",
  recusado: "Recusado",
  em_analise: "Em Análise",
};

export type ContainmentAction =
  | "sucatear"
  | "retrabalhar"
  | "selecao"
  | "reclassificar"
  | "aceito_concessao"
  | "devolver";

export const CONTAINMENT_ACTION_LABEL: Record<ContainmentAction, string> = {
  sucatear: "Sucatear",
  retrabalhar: "Retrabalhar",
  selecao: "Seleção",
  reclassificar: "Reclassificar",
  aceito_concessao: "Aceito sob concessão",
  devolver: "Devolver",
};

export const RESPONSIBLE_SECTOR_LABEL: Record<ResponsibleSector, string> = {
  comercial: "Comercial",
  expedicao: "Expedição",
  engenharia: "Engenharia",
  producao: "Produção",
  almoxarifado: "Almoxarifado",
  fornecedor: "Fornecedor",
  motorista: "Motorista",
  nao_aplica: "Não se aplica",
};

// ===== Internal Ticket (colaboração entre setores) =====
export type InternalDepartment =
  | "comercial"
  | "expedicao"
  | "engenharia"
  | "producao"
  | "compras"
  | "qualidade";

export type InternalTicketStatus =
  | "aberto"
  | "andamento"
  | "aguardando"
  | "resolvido"
  | "escalado";

export type InternalPriority = "baixa" | "media" | "alta" | "critica";

export const INTERNAL_DEPT_LABEL: Record<InternalDepartment, string> = {
  comercial: "Comercial",
  expedicao: "Expedição",
  engenharia: "Engenharia",
  producao: "Produção",
  compras: "Compras",
  qualidade: "Qualidade",
};

export const INTERNAL_STATUS_LABEL: Record<InternalTicketStatus, string> = {
  aberto: "Aberto",
  andamento: "Em andamento",
  aguardando: "Aguardando info",
  resolvido: "Resolvido",
  escalado: "Escalado",
};

export interface InternalResponse {
  id: string;
  at: string;
  responder: string;
  text: string;
  attachments?: Attachment[];
  responseHours?: number; // tempo entre abertura/última resposta e esta resposta
}

export interface InternalTicket {
  id: string;
  code: string; // INT-YYYY-NNN
  openedBy: string;
  openedAt: string;
  targetDepartment: InternalDepartment;
  priority: InternalPriority;
  subject: string;
  description: string;
  linkedOccurrenceId?: string;
  linkedCustomer?: string;
  slaHours: number;
  status: InternalTicketStatus;
  responses: InternalResponse[];
  resolutionSummary?: string;
  closedAt?: string;
  slaCumprido?: boolean;
}

// SLA padrão por departamento (horas)
export const INTERNAL_DEFAULT_SLA: Record<InternalDepartment, number> = {
  comercial: 8,
  expedicao: 4,
  engenharia: 24,
  producao: 12,
  compras: 24,
  qualidade: 16,
};

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  url?: string; // blob URL (sessão) ou URL do Supabase Storage
}

export interface Ticket {
  id: string;
  code: string;
  roNumber?: string;
  emitente?: string;
  dataEmissao?: string;
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
  freightCostVp?: number;
  freightCostCustomer?: number;
  custoNaoQualidade?: number;
  acaoContencao?: ContainmentAction[];
  descricaoNaoConformidade?: string;
  analiseQualidade?: string;
  classificacaoQualidade?: string;
  observacoesQualidade?: string;
  whatsappThreadId?: string;
  sacNfId?: string;
  dataInicioAnalise?: string;
  dataLimiteAtendimento?: string;
  dataFinalizacao?: string;
  slaViolado?: boolean;
  channel: TicketChannel;
  status: TicketStatus;
  priority: TicketPriority;
  slaHours: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  rootCause?: RootCause;
  rootCauseJustification?: string;
  technicalReport?: string;
  attachments: Attachment[];
  nps?: number;
  npsSentAt?: string;
  audit: AuditLog[];
  assignee?: string;
  internalTicketIds?: string[];
  productFamily?: string;
}

export const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  venda: "Venda",
  expedicao: "Expedição",
  engenharia: "Engenharia",
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  produto: "Produto",
  producao: "Produção",
};

export const RO_PREFIX = "RO";
export function generateRoNumber(year: number, seq: number): string {
  return `${RO_PREFIX}-${year}-${String(seq).padStart(3, "0")}`;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  analise: "Em análise",
  laudo: "Laudo técnico",
  concluido: "Concluído",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

// ===== NPS (CALCULADORANPS.xlsx) =====
export type NpsCategory = "promotor" | "neutro" | "detrator";
export type CustomerTier = "A" | "B" | "C";
export type NpsTrigger = "pos_resolucao" | "proativo_pos_venda" | "manual";

export const NPS_CATEGORY_LABEL: Record<NpsCategory, string> = {
  promotor: "Promotor (9-10)",
  neutro: "Neutro (7-8)",
  detrator: "Detrator (0-6)",
};

export const CUSTOMER_TIER_LABEL: Record<CustomerTier, string> = {
  A: "Tipo A — B2B estratégico",
  B: "Tipo B — B2B recorrente",
  C: "Tipo C — B2B eventual",
};

export interface NpsRecord {
  id: string;
  customer: string;
  customerTier: CustomerTier;
  occurrenceId?: string;
  surveyDate: string;
  q1Recomendacao: number; // 0-10
  q2Resolucao: number; // 0-10
  q3Agilidade: number; // 0-10
  category: NpsCategory; // calculado a partir de q1
  feedback?: string;
  audioUrl?: string;
  feedbackTranscrito?: string;
  trigger: NpsTrigger;
  createdAt: string;
}

export function categorizeNps(score: number): NpsCategory {
  if (score >= 9) return "promotor";
  if (score >= 7) return "neutro";
  return "detrator";
}

export interface NpsAggregate {
  total: number;
  promotores: number;
  neutros: number;
  detratores: number;
  pctPromotores: number;
  pctDetratores: number;
  npsScore: number; // %Promotores - %Detratores
}

export function aggregateNps(records: NpsRecord[]): NpsAggregate {
  const total = records.length;
  const promotores = records.filter((r) => r.category === "promotor").length;
  const neutros = records.filter((r) => r.category === "neutro").length;
  const detratores = records.filter((r) => r.category === "detrator").length;
  const pctPromotores = total ? (promotores / total) * 100 : 0;
  const pctDetratores = total ? (detratores / total) * 100 : 0;
  return {
    total,
    promotores,
    neutros,
    detratores,
    pctPromotores,
    pctDetratores,
    npsScore: pctPromotores - pctDetratores,
  };
}
