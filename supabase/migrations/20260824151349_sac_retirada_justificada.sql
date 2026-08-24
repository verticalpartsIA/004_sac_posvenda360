ALTER TABLE public.sac_notas_fiscais
  ADD COLUMN IF NOT EXISTS sac_retirado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sac_retirado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sac_retirado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sac_retirado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS sac_retirado_justificativa TEXT;

CREATE INDEX IF NOT EXISTS idx_sac_nf_retirado
  ON public.sac_notas_fiscais(sac_retirado)
  WHERE sac_retirado = true;
