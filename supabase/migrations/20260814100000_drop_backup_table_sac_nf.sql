-- Issue #71 — RLS desabilitada em sac_nf_backup_20260727 (310 linhas expostas ao anon)
-- Confirmar antes de rodar: é backup datado (27/07/2026), sem PK, sem FK apontando pra ela.
-- Se precisar reter os dados, faça um dump/export ANTES de rodar este DROP.
DROP TABLE IF EXISTS public.sac_nf_backup_20260727;
