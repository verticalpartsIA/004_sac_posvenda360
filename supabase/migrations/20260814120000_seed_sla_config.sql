-- Issue #90 — sla_config vazia, causa raiz do "Risco de SLA" == "Em andamento" no dashboard.
-- Valores replicados dos já desenhados (mas nunca persistidos) em admin/configuracoes.tsx.
-- Tabela confirmada vazia (0 linhas) no achado original — sem ON CONFLICT porque não
-- sei se `priority` tem constraint UNIQUE; se rodar de novo por engano e já houver
-- linhas, vai duplicar (rode o SELECT abaixo pra checar antes).
INSERT INTO public.sla_config (priority, hours, warn_50_pct, warn_80_pct, warn_100_pct)
SELECT * FROM (VALUES
  ('baixa'::ticket_priority,   72, true, true, true),
  ('media'::ticket_priority,   48, true, true, true),
  ('alta'::ticket_priority,    24, true, true, true),
  ('critica'::ticket_priority, 12, true, true, true)
) AS v(priority, hours, warn_50_pct, warn_80_pct, warn_100_pct)
WHERE NOT EXISTS (SELECT 1 FROM public.sla_config WHERE sla_config.priority = v.priority);
