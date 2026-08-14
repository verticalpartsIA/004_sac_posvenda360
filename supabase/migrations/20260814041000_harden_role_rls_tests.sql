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

DROP POLICY IF EXISTS "Roles visíveis para autenticados" ON public.user_roles;
CREATE POLICY "Roles visíveis para autenticados" ON public.user_roles
  FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));
