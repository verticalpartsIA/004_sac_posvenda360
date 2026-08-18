-- O vpsistema (portal central) provisiona/replica contas aqui via
-- `invite-user` e `sso-proxy`, enviando nome/departamento em
-- `raw_user_meta_data` com as chaves `name`/`department` — mas essa trigger
-- só lia `display_name`, então o nome real nunca era gravado e sempre caía
-- no fallback (e-mail). `departamento` nunca era lido de jeito nenhum.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, departamento)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'display_name',
      NEW.email
    ),
    NEW.raw_user_meta_data->>'department'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operador');

  RETURN NEW;
END;
$$;

-- Backfill: contas já criadas antes desse fix têm nome/departamento reais
-- perdidos em `auth.users.raw_user_meta_data` (o vpsistema já enviava esses
-- dados na criação, só não eram lidos) — resgata sem depender de novo login.
UPDATE public.profiles p
SET
  display_name = COALESCE(
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'display_name',
    p.display_name
  ),
  departamento = COALESCE(u.raw_user_meta_data->>'department', p.departamento)
FROM auth.users u
WHERE u.id = p.user_id
  AND (
    u.raw_user_meta_data ? 'name'
    OR u.raw_user_meta_data ? 'display_name'
    OR u.raw_user_meta_data ? 'department'
  );
