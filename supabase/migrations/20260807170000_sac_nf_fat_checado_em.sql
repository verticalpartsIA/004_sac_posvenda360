-- sync-faturamento reconsultava no Omie TODAS as NFs com pedido vinculado,
-- em TODA carga da tela /sac (mesmo as já 100% faturadas) — só pra captar
-- eventual devolução tardia (devolvido/devolvido_parcial, ver
-- 20260731000001_sac_nf_devolucao.sql). Isso passou a levar >60s (timeout)
-- com o volume atual de NFs. Esta coluna guarda quando cada NF foi checada
-- pela última vez, pra permitir "recheca só se já faturada há mais de N
-- horas" em vez de recheca sempre — sem perder a detecção de devolução,
-- só espaçando ela.
ALTER TABLE sac_notas_fiscais
  ADD COLUMN IF NOT EXISTS fat_checado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sac_nf_fat_checado_em ON sac_notas_fiscais(fat_checado_em);
