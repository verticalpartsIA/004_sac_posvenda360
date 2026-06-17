-- Colunas faltantes em sac_notas_fiscais que causavam falha no salvamento de expedição
ALTER TABLE sac_notas_fiscais
  ADD COLUMN IF NOT EXISTS tipo_entrega TEXT DEFAULT 'TRANSPORTADORA'
    CHECK (tipo_entrega IN ('TRANSPORTADORA', 'RETIRADA_CLIENTE', 'ENTREGA_PROPRIA')),
  ADD COLUMN IF NOT EXISTS retirado_por TEXT,
  ADD COLUMN IF NOT EXISTS obs_omie TEXT;
