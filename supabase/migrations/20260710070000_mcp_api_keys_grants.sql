-- A tabela mcp_api_keys foi criada sem GRANT explícito para service_role
-- (diferente das demais tabelas do projeto, que recebem os grants por
-- default privileges). Sem esse GRANT, o PostgREST nega a leitura mesmo
-- para service_role, e a Edge Function do MCP falha com 500 em toda
-- requisição, pois a checagem de autenticação lança exceção não tratada.
grant select, insert, update, delete on public.mcp_api_keys to service_role;
