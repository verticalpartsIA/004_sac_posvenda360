# Conector MCP para o Claude

O VP Pós-Venda 360 expõe um servidor MCP remoto (Streamable HTTP) via
Supabase Edge Function, permitindo que o Claude (claude.ai, Claude Desktop
ou Claude Code) consulte e opere ocorrências (RO), tickets internos e dados
de pós-venda diretamente em conversa.

## Endpoint

```
https://jkbklzlbhhfnamaeislb.supabase.co/functions/v1/mcp-server
```

Código-fonte: `supabase/functions/mcp-server/index.ts`.

## Autenticação: chave na URL (sem OAuth)

O domínio compartilhado `*.supabase.co` aplica CSP sandbox em HTML servido
por Edge Functions, o que impede qualquer tela de login OAuth de renderizar
ou submeter formulário (aprendido ao integrar VPRequisições). Por isso este
servidor não implementa OAuth: a autenticação é só uma chave compartilhada,
aceita via query string `?key=` (ou header `Authorization: Bearer`, para
outros clientes MCP).

O token não é uma variável de ambiente Deno — ele é validado contra o hash
(SHA-256) guardado na tabela `public.mcp_api_keys`
(migration `supabase/migrations/20260710060000_mcp_api_keys.sql`), com RLS
habilitado sem policies (só o `service_role` consegue ler). O valor em texto
puro nunca é persistido em lugar nenhum.

Para gerar um novo token e revogar o antigo:

```sql
update public.mcp_api_keys set active = false where label = 'claude-web-connector';
insert into public.mcp_api_keys (label, token_hash) values ('novo-label', '<sha256-hex-do-novo-token>');
```

## Como conectar no claude.ai

1. Configurações → Conectores → Adicionar conector → Adicionar conector personalizado.
2. **Nome:** `VP Pós-Venda 360`
3. **URL do servidor MCP remoto** (a URL inteira, incluindo `?key=`):
   ```
   https://jkbklzlbhhfnamaeislb.supabase.co/functions/v1/mcp-server?key=<token-de-acesso>
   ```
4. Deixe os campos de OAuth Client ID/Secret em branco e clique em Adicionar.

O claude.ai pode mostrar um aviso de "não foi possível registrar no serviço
de login" durante a conexão — é a sondagem de descoberta OAuth que ele tenta
por padrão, mesmo sem precisar dela. A chave da URL autentica a requisição
de qualquer forma; o aviso é cosmético.

## Ferramentas disponíveis

**Leitura:** `list_tickets`, `get_ticket`, `list_internal_tickets`,
`list_clientes`, `list_notas_fiscais`, `dashboard_summary`.

**Escrita:** `add_ticket_message`, `update_ticket_status`, `conclude_ticket`,
`create_internal_ticket`, `update_internal_ticket_status`.

`conclude_ticket` reproduz a regra de negócio da tela de detalhe: exige
causa raiz e justificativa (mínimo 10 caracteres) antes de marcar a
ocorrência como concluída — `update_ticket_status` recusa `concluido`
explicitamente e orienta a usar `conclude_ticket`.

Todas as ações de escrita usam o `service_role` do Supabase e, quando
aplicável, registram evento em `audit_log`. Não há diferenciação de papel
por usuário — qualquer portador do token pode executar qualquer ferramenta.
Trate o token com o mesmo cuidado que uma credencial de administrador do
sistema.

## Notas sobre o schema

O banco tem duas famílias de tabelas relacionadas a "clientes":
`clientes`/`produtos` (vinculadas a `tickets` via FK, mas vazias — o app
denormaliza dados do cliente/peça direto nos campos `customer`/`part` do
próprio ticket) e `sac_clientes`/`sac_notas_fiscais` (populadas, ligadas ao
módulo de rastreio de entrega e pesquisa pós-entrega). As ferramentas de
leitura de cliente/nota fiscal usam a segunda família, que é a que tem dados
reais.

Não foram expostas ferramentas para o módulo de automação via WhatsApp
(Hermes/Verti — auto-resposta por IA, `handoffs`, `internal_contacts`) nem
para configuração de SLA (`sla_config`) — são mais operacionais/sensíveis a
erro de configuração do que administração do dia a dia.
