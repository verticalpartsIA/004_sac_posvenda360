-- Tabelas criadas via migration não recebem GRANT automático para service_role
-- neste projeto (só RLS habilitado não basta; sem GRANT explícito o Postgres
-- nega acesso a nível de tabela antes mesmo de avaliar as policies de RLS).
grant select, insert, update, delete on table app_internal_secrets to service_role;
