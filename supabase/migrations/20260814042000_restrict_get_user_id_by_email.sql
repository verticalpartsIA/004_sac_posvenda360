-- Issue #103 / #72: anon must not execute user lookup RPCs.
-- Keep authenticated explicit because existing app flows may still depend on it.

REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
