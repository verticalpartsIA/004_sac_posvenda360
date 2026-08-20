-- Libera a exclusão de tickets (SAC/Ocorrências) para operador, qualidade e
-- gestor também — antes só admin podia excluir. Pedido do Gelson pra dar ao
-- operador o controle de limpar tickets quando precisar, direto pela tela.
DROP POLICY IF EXISTS tickets_delete ON public.tickets;
CREATE POLICY tickets_delete ON public.tickets FOR DELETE TO authenticated
  USING (
    has_role((select auth.uid()), 'operador'::app_role) OR
    has_role((select auth.uid()), 'qualidade'::app_role) OR
    has_role((select auth.uid()), 'gestor'::app_role) OR
    has_role((select auth.uid()), 'admin'::app_role)
  );

-- sac_devolucoes.ticket_id não tinha ON DELETE definido (default RESTRICT),
-- o que bloqueava com erro de FK a exclusão de um ticket que já tivesse
-- devolução vinculada. Ao excluir o ticket, só desfaz o vínculo — o
-- registro de devolução em si (rastreio da Expedição) continua existindo.
ALTER TABLE public.sac_devolucoes DROP CONSTRAINT sac_devolucoes_ticket_id_fkey;
ALTER TABLE public.sac_devolucoes ADD CONSTRAINT sac_devolucoes_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;
