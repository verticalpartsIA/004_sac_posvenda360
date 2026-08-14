-- Issue #72 — get_user_id_by_email (SECURITY DEFINER) exposta ao anon (enumeração de contas)
-- Ação mínima e segura: revoga do anon. NÃO revoga de authenticated aqui — o próprio achado
-- diz que isso exige confirmar quem chama a função antes (provável fluxo de convite/roles).
-- search_path desta função é corrigido junto das outras na migration 20260814100200.
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon;
