CREATE TABLE IF NOT EXISTS expedicao_conferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id UUID NOT NULL REFERENCES sac_notas_fiscais(id) ON DELETE CASCADE,
  item_idx INTEGER NOT NULL,
  sku TEXT,
  descricao TEXT,
  qtd_pedida NUMERIC,
  qtd_conferida NUMERIC,
  divergencia_tipo TEXT CHECK (divergencia_tipo IN ('FALTA', 'EXCESSO', 'ZERADO')),
  obs_divergencia TEXT,
  conferido_em TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (nf_id, item_idx)
);

CREATE INDEX IF NOT EXISTS idx_exp_conf_nf ON expedicao_conferencias(nf_id);

ALTER TABLE expedicao_conferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_exp_conf" ON expedicao_conferencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_exp_conf" ON expedicao_conferencias FOR ALL TO service_role USING (true) WITH CHECK (true);
