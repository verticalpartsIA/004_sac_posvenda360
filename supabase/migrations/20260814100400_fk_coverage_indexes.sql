-- Issue #76 — 10 foreign keys sem índice de cobertura
-- ⚠️ CREATE INDEX CONCURRENTLY não roda dentro de transação. Se for aplicar via
-- `supabase db push` (que envolve tudo numa transação), vai falhar — rode este
-- arquivo direto no SQL Editor do Supabase (statement a statement) ou via
-- `psql -f` fora de uma transação explícita.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_tickets_assigned_to ON public.internal_tickets(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_tickets_linked_occurrence_id ON public.internal_tickets(linked_occurrence_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_tickets_opened_by ON public.internal_tickets(opened_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_produto_id ON public.tickets(produto_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_records_cliente_id ON public.nps_records(cliente_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sac_devolucoes_ticket_id ON public.sac_devolucoes(ticket_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sac_pesquisas_nf_id ON public.sac_pesquisas(nf_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_messages_author_id ON public.ticket_messages(author_id);
