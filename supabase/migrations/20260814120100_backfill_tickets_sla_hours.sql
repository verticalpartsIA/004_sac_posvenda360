-- Issue #90 (retroativo) — corrige sla_hours dos tickets AINDA ABERTOS pra bater com
-- sla_config (fonte real, não valores fixos — evita divergir se sla_config mudar depois).
-- Só tickets != 'concluido' são tocados — não mexe no histórico de tickets já concluídos,
-- pra não reescrever retroativamente se cumpriram ou violaram o SLA na hora.
UPDATE public.tickets t
SET sla_hours = c.hours
FROM public.sla_config c
WHERE c.priority = t.priority
  AND t.status <> 'concluido'
  AND t.sla_hours IS DISTINCT FROM c.hours;
