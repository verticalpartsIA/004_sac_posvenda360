-- Issue #77 — ~30 (na prática 27) políticas RLS re-avaliam auth.uid()/has_role(auth.uid(),...)
-- por linha. Fix: envolver a chamada em (select ...) para virar InitPlan (avaliado 1x por
-- query). Gerado a partir do dump real de pg_policies (comentário do issue #118) — cada
-- DROP/CREATE abaixo preserva cmd/roles/semântica 1:1, só adicionando o wrapper.
--
-- Issue #79 (parte 2/2) — a política "service role full access" em expedicao_conferencias
-- tem roles={public} (SEM restrição nenhuma — nome enganoso, não é "mal nomeada", é uma
-- policy aberta pra qualquer role, redundante com auth_all_exp_conf + service_all_exp_conf
-- que já cobrem authenticated e service_role corretamente). Recomendo dropar.

-- ── clientes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS clientes_delete ON public.clientes;
CREATE POLICY clientes_delete ON public.clientes FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS clientes_insert ON public.clientes;
CREATE POLICY clientes_insert ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS clientes_update ON public.clientes;
CREATE POLICY clientes_update ON public.clientes FOR UPDATE TO authenticated
  USING (((select auth.uid()) IS NOT NULL));

-- ── internal_tickets ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS internal_delete ON public.internal_tickets;
CREATE POLICY internal_delete ON public.internal_tickets FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS internal_insert ON public.internal_tickets;
CREATE POLICY internal_insert ON public.internal_tickets FOR INSERT TO authenticated
  WITH CHECK (
    has_role((select auth.uid()), 'operador'::app_role)
    OR has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS internal_update ON public.internal_tickets;
CREATE POLICY internal_update ON public.internal_tickets FOR UPDATE TO authenticated
  USING (
    has_role((select auth.uid()), 'operador'::app_role)
    OR has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

-- ── notifications ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notif_delete ON public.notifications;
CREATE POLICY notif_delete ON public.notifications FOR DELETE TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications FOR UPDATE TO authenticated
  USING (((select auth.uid()) = user_id));

-- ── nps_records ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS nps_update ON public.nps_records;
CREATE POLICY nps_update ON public.nps_records FOR UPDATE TO authenticated
  USING (
    has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

-- ── produtos ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS produtos_delete ON public.produtos;
CREATE POLICY produtos_delete ON public.produtos FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS produtos_insert ON public.produtos;
CREATE POLICY produtos_insert ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS produtos_update ON public.produtos;
CREATE POLICY produtos_update ON public.produtos FOR UPDATE TO authenticated
  USING (((select auth.uid()) IS NOT NULL));

-- ── profiles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Usuário edita seu próprio profile" ON public.profiles;
CREATE POLICY "Usuário edita seu próprio profile" ON public.profiles FOR UPDATE TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Usuário insere seu próprio profile" ON public.profiles;
CREATE POLICY "Usuário insere seu próprio profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id));

-- ── sla_config ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sla_insert ON public.sla_config;
CREATE POLICY sla_insert ON public.sla_config FOR INSERT TO authenticated
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS sla_update ON public.sla_config;
CREATE POLICY sla_update ON public.sla_config FOR UPDATE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- ── ticket_messages ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS msg_delete ON public.ticket_messages;
CREATE POLICY msg_delete ON public.ticket_messages FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS msg_insert ON public.ticket_messages;
CREATE POLICY msg_insert ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK ((((select auth.uid()) = author_id) OR (author_id IS NULL)));

DROP POLICY IF EXISTS msg_update ON public.ticket_messages;
CREATE POLICY msg_update ON public.ticket_messages FOR UPDATE TO authenticated
  USING (((select auth.uid()) = author_id));

-- ── tickets ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tickets_delete ON public.tickets;
CREATE POLICY tickets_delete ON public.tickets FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS tickets_insert ON public.tickets;
CREATE POLICY tickets_insert ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (
    has_role((select auth.uid()), 'operador'::app_role)
    OR has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets FOR UPDATE TO authenticated
  USING (
    has_role((select auth.uid()), 'operador'::app_role)
    OR has_role((select auth.uid()), 'qualidade'::app_role)
    OR has_role((select auth.uid()), 'gestor'::app_role)
    OR has_role((select auth.uid()), 'admin'::app_role)
  );

-- ── user_roles ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin gerencia roles - delete" ON public.user_roles;
CREATE POLICY "Admin gerencia roles - delete" ON public.user_roles FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin gerencia roles - insert" ON public.user_roles;
CREATE POLICY "Admin gerencia roles - insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin gerencia roles - update" ON public.user_roles;
CREATE POLICY "Admin gerencia roles - update" ON public.user_roles FOR UPDATE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- ── whatsapp_messages ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS wa_msg_delete ON public.whatsapp_messages;
CREATE POLICY wa_msg_delete ON public.whatsapp_messages FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- ── #79 (parte 2/2): remove a policy aberta (roles={public}, sem restrição real) ──
-- auth_all_exp_conf (authenticated) e service_all_exp_conf (service_role) já cobrem
-- os dois acessos legítimos; esta é redundante E mais ampla do que o nome sugere.
DROP POLICY IF EXISTS "service role full access" ON public.expedicao_conferencias;
