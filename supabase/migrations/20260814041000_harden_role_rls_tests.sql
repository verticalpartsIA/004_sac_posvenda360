-- Issue #103: lock central RLS expectations for role-based access tests.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS tickets_select ON public.tickets;
CREATE POLICY tickets_select ON public.tickets
  FOR SELECT TO authenticated
  USING (
    has_role((select auth.uid()), 'operador'::app_role)
    OR has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS internal_select ON public.internal_tickets;
CREATE POLICY internal_select ON public.internal_tickets
  FOR SELECT TO authenticated
  USING (
    has_role((select auth.uid()), 'operador'::app_role)
    OR has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

-- CORREÇÃO (revisão pós-PR): a versão original desta migration restringia o SELECT
-- só a admin, mas src/lib/auth.tsx faz `supabase.from("user_roles").select("role")
-- .eq("user_id", userId)` como o PRÓPRIO usuário (client anon/authenticated, não
-- service role) pra descobrir seu papel e liberar telas/ações no app inteiro. Com
-- USING só admin, todo usuário não-admin passaria a receber 0 linhas (bloqueio
-- silencioso do RLS, sem erro) — o app trataria todo mundo como sem papel nenhum.
-- Corrigido pra permitir também o próprio usuário ler sua própria linha.
DROP POLICY IF EXISTS "Roles visíveis para autenticados" ON public.user_roles;
CREATE POLICY "Roles visíveis para autenticados" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    has_role((select auth.uid()), 'admin'::app_role)
    OR user_id = (select auth.uid())
  );
