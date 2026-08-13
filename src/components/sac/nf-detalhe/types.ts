export type DevolucaoResumo = {
  id: string;
  motivo: string;
  status: "aberta" | "recebida" | "concluida" | "cancelada";
  valor_estimado: number | null;
  aberta_em: string;
};

export type NFDetalhe = {
  id: string;
  nf_numero: string;
  razao_social_cliente: string;
  cnpj_cliente: string;
  classe_abc: "A" | "B" | "C";
  valor_total: number;
  data_emissao: string | null;
  previsao_entrega: string | null;
  status_entrega: "EMITIDA" | "EM_TRANSITO" | "ENTREGUE" | "ATRASADA";
  transportadora: string | null;
  codigo_rastreio: string | null;
  // expedição
  data_coleta: string | null;
  transportadora_entregou: boolean | null;
  data_entrega_real: string | null;
  comprovante_entrega: string | null;
  // pós-venda
  previsao_pos_venda: string | null;
  status_pos_venda: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";
  data_pos_venda: string | null;
  responsavel_pos_venda: string | null;
  obs_omie: string | null;
  numero_pedido_omie: string | null;
  codigo_pedido_omie: string | null;
  sac_clientes: {
    nome_fantasia: string | null;
    whatsapp: string | null;
    email: string | null;
    telefone: string | null;
    contato: string | null;
  } | null;
};

export type OmieItem = {
  produto?: {
    codigo_produto?: string;
    descricao?: string;
    quantidade?: number;
  };
};

export type Pesquisa = {
  id: string;
  produto_correto: boolean | null;
  atendeu_prazo: boolean | null;
  recebeu_nota_boleto: boolean | null;
  produto_atendeu_expectativas: boolean | null;
  avaliacao_atendimento: number | null;
  nps_score: number | null;
  dificuldade_compra: boolean | null;
  pontos_positivos: string | null;
  pontos_melhoria: string | null;
  compraria_novamente: boolean | null;
  sugestoes: string | null;
  observacoes: string | null;
  respondida_em: string | null;
};
