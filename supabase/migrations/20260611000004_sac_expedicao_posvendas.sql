-- Campos de Expedição e Pós-Venda SAC na tabela sac_notas_fiscais
ALTER TABLE sac_notas_fiscais
  ADD COLUMN IF NOT EXISTS data_coleta DATE,
  ADD COLUMN IF NOT EXISTS transportadora_entregou BOOLEAN,
  ADD COLUMN IF NOT EXISTS data_entrega_real DATE,
  ADD COLUMN IF NOT EXISTS comprovante_entrega TEXT,
  ADD COLUMN IF NOT EXISTS previsao_pos_venda DATE,
  ADD COLUMN IF NOT EXISTS status_pos_venda TEXT DEFAULT 'PENDENTE'
    CHECK (status_pos_venda IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO')),
  ADD COLUMN IF NOT EXISTS data_pos_venda DATE,
  ADD COLUMN IF NOT EXISTS responsavel_pos_venda TEXT;
