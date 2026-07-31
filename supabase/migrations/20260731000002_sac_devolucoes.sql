CREATE TYPE devolucao_status AS ENUM ('aberta', 'recebida', 'concluida', 'cancelada');
CREATE TYPE devolucao_condicao AS ENUM ('perfeita', 'avariada', 'incompleta');

-- RMA interno: rastreia devolução de produto do momento em que o SAC/
-- Pós-venda identifica a devolução até a Expedição confirmar o recebimento
-- físico na portaria e o fechamento administrativo. Separado de
-- sac_notas_fiscais.devolvido/devolvido_parcial (esses vêm do Omie, refletem
-- o status contábil já processado; esta tabela é o rastreio operacional que
-- normalmente acontece ANTES disso).
CREATE TABLE sac_devolucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id UUID NOT NULL REFERENCES sac_notas_fiscais(id),
  ticket_id UUID REFERENCES tickets(id),
  motivo TEXT NOT NULL CHECK (motivo IN ('devolucao_total', 'devolucao_parcial')),
  status devolucao_status NOT NULL DEFAULT 'aberta',

  valor_estimado NUMERIC(14,2),
  observacoes_abertura TEXT,
  aberta_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  aberta_por TEXT,

  recebida_em TIMESTAMPTZ,
  recebida_por TEXT,
  quantidade_recebida INTEGER,
  condicao_recebimento devolucao_condicao,
  fotos JSONB,
  observacoes_recebimento TEXT,

  concluida_em TIMESTAMPTZ,
  concluida_por TEXT,
  valor_prejuizo_final NUMERIC(14,2),
  observacoes_conclusao TEXT,

  cancelada_em TIMESTAMPTZ,
  cancelada_por TEXT,
  motivo_cancelamento TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sac_devolucoes_nf ON sac_devolucoes(nf_id);
CREATE INDEX idx_sac_devolucoes_status ON sac_devolucoes(status);

ALTER TABLE sac_devolucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_sac_devolucoes" ON sac_devolucoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_sac_devolucoes" ON sac_devolucoes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS por si só não libera acesso — sem estes GRANTs explícitos (que as
-- demais tabelas sac_* já têm de uma configuração anterior do projeto),
-- authenticated/service_role recebem "permission denied" mesmo com a policy
-- correta.
GRANT SELECT, INSERT, UPDATE, DELETE ON sac_devolucoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sac_devolucoes TO service_role;
