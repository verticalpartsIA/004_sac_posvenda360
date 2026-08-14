-- Issue #75 — search_path mutável em 5 funções SECURITY DEFINER (hijacking)
-- ALTER FUNCTION só altera a config da função (não recria o corpo) — seguro mesmo sem
-- conhecer a implementação atual de cada uma. Assume assinatura sem argumentos para as
-- funções de trigger (padrão: RETURNS trigger, chamadas por evento de tabela).
--
-- ⚠️ Se alguma destas falhar com "function does not exist", a assinatura real tem
-- argumentos diferentes do assumido aqui — rode `\df public.<nome>` no psql ou consulte
-- pg_proc para pegar a assinatura exata e ajustar a linha antes de re-rodar.

ALTER FUNCTION public.get_user_id_by_email(text) SET search_path = '';
ALTER FUNCTION public.notify_vpclick_ticket() SET search_path = 'public';
ALTER FUNCTION public.notify_vpclick_interno() SET search_path = 'public';
ALTER FUNCTION public.set_updated_at() SET search_path = 'public';
ALTER FUNCTION public.on_auth_user_created() SET search_path = 'public';
