-- Diagnóstico p/ issues #77 e #79 (parte de políticas) — NÃO é migration, só consulta.
-- Rode isto no SQL Editor do Supabase e me cole o resultado — a partir dele eu gero
-- as reescritas exatas de política (DROP/CREATE POLICY preservando a lógica 1:1).
--
-- Por quê não fazer isso às cegas: reescrever RLS sem ver a condição USING/WITH CHECK
-- atual arrisca abrir acesso indevido ou bloquear acesso legítimo — o próprio achado #77
-- classifica o risco como "Baixo/Médio, SE a lógica for preservada 1:1".

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
