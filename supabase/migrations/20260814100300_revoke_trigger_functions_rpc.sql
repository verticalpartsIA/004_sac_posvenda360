-- Issue #74 — Funções de trigger SECURITY DEFINER executáveis via RPC
-- (notify_vpclick_interno, notify_vpclick_ticket, on_auth_user_created)
-- Revogar EXECUTE não afeta o disparo por trigger (que roda como definidor,
-- independente de GRANT/REVOKE de EXECUTE direto). Só impede chamada via
-- /rest/v1/rpc/<nome> por anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.notify_vpclick_interno() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_vpclick_ticket() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_auth_user_created() FROM anon, authenticated;
