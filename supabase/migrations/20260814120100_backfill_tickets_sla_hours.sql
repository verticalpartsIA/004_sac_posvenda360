-- Issue #90 (retroativo) — corrige sla_hours dos tickets AINDA ABERTOS pra bater com
-- sla_config, já que todo ticket criado até agora recebeu 48h fixo (bug corrigido no
-- código). Só tickets != 'concluido' são tocados — não mexe no histórico de tickets já
-- concluídos, pra não reescrever retroativamente se cumpriram ou violaram o SLA na hora.
UPDATE public.tickets
SET sla_hours = CASE priority
  WHEN 'baixa'   THEN 72
  WHEN 'media'   THEN 48
  WHEN 'alta'    THEN 24
  WHEN 'critica' THEN 12
END
WHERE status <> 'concluido';
