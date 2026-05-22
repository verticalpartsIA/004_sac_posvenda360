# INSTRUCTIONS — VP Pós-Venda 360° (`resolve-360`)

> **Para Claude Code:** Leia este arquivo inteiro antes de fazer qualquer alteração no projeto.
> Ele contém tudo que você precisa saber para trabalhar sem perguntar o óbvio.
> Última atualização: 2026-05-22.

---

## 1. IDENTIDADE DO PROJETO

| Atributo | Valor |
|---|---|
| **Nome** | VP Pós-Venda 360° |
| **Repositório** | `verticalpartsIA/resolve-360` |
| **URL produção** | `https://posvenda360.vpsistema.com` |
| **Empresa** | VerticalParts (autopeças B2B) |
| **Finalidade** | Substituir planilha Excel de ocorrências de pós-venda (FO-OEA-Q-504) por sistema web completo |

**O que o sistema faz:**
- Abre e acompanha ocorrências de clientes (devoluções, reparos, reclamações)
- Controla SLA por prioridade com alertas automáticos
- Coleta causa raiz obrigatória ao fechar
- Gerencia tickets internos entre departamentos
- Integra WhatsApp (recebe e envia mensagens vinculadas ao ticket)
- Coleta NPS após resolução
- Gera relatório Excel FO-OEA-Q-504 (5 abas, padrão da qualidade)
- Dashboard de KPIs para gestor

---

## 2. CREDENCIAIS — ONDE ENCONTRAR

**Arquivo mestre:** `C:\Users\gelso\VerticalParts\CredenciaisMD\credenciais.md`

Não copie credenciais para o código. Use sempre variáveis de ambiente.
Se você precisar de um token e o MCP GitHub falhar, use o **GITHUB TOKEN 4**.

### Tokens GitHub relevantes para este projeto

| Nome | Uso |
|---|---|
| `GITHUB TOKEN 4` — rotulado `Claude_posvenda` no `credenciais.md` | Push/commit no `verticalpartsIA/resolve-360` |
| `GITHUB TOKEN 2` — rotulado `vpsistema / GitHub MCP` no `credenciais.md` | Outros repos verticalpartsIA |

**REGRA CRÍTICA:** Nunca use tokens da conta `gelsonsimoes` para repos `verticalpartsIA`. Sempre use os tokens acima.

### Supabase — projeto principal (resolve-360)

| | |
|---|---|
| **Project ID** | `jkbklzlbhhfnamaeislb` |
| **URL** | `https://jkbklzlbhhfnamaeislb.supabase.co` |
| **Anon key** | ver `credenciais.md` → seção posvenda360 |
| **Service role** | ver `credenciais.md` → seção posvenda360 |

### ERP Omie (bd_Omie — somente leitura)

| | |
|---|---|
| **Project ID** | `kgecbycsyrtdhmdziuul` |
| **URL** | `https://kgecbycsyrtdhmdziuul.supabase.co` |
| **Service role** | var de ambiente `ERP_SERVICE_KEY` |

### WhatsApp — Evolution API

| | |
|---|---|
| **URL** | `http://72.61.48.156:8080` |
| **API Key** | `suporte123` (também em `EVOLUTION_APIKEY` no .env) |
| **Instância** | `pv360` |
| **Número conectado** | `+55 11 99766-3780` (conta pessoal Gelson — usado como canal de suporte) |
| **Status** | `connectionStatus: "open"` (verificado 2026-05-22) |

---

## 3. ARQUITETURA

```
Browser (React 19 + TanStack Router)
   │
   │  SSR via node-server
   ▼
Hostinger Node.js (posvenda360.vpsistema.com)
   ├── TanStack Start (createServerFn + API Routes)
   ├── hostinger/server.mjs  ← bootstrap do servidor
   └── dist/ (bundle compilado)
        │
        ├── Supabase (PostgreSQL + Auth + RLS)
        │    Project: jkbklzlbhhfnamaeislb
        │
        ├── Evolution API (WhatsApp)
        │    http://72.61.48.156:8080
        │    Instância: pv360
        │    Webhook: POST /api/webhook/evolution
        │
        └── ERP Omie (somente leitura)
             via bd_Omie Supabase: kgecbycsyrtdhmdziuul
             Sync automático: GitHub Actions a cada 2h
```

### Framework e build

- **TanStack Start** com `target: "node-server"` (Hostinger) e também suporta Cloudflare Workers (Lovable.dev)
- **Variável `BUILD_TARGET=node`** no workflow diferencia o build para Hostinger
- **Vite + Bun** para build e instalação de dependências
- **Tailwind CSS v4** + **Radix UI** + padrão `shadcn/ui`

---

## 4. DEPLOY

### Processo automático

```
git push origin main
  → GitHub Actions: .github/workflows/deploy-hostinger.yml
      1. bun install --frozen-lockfile
      2. BUILD_TARGET=node bun run build   ← gera dist/
      3. Empacota: dist/ + server.mjs + package.json
      4. FTP para Hostinger (HOSTINGER_FTP_*)
      5. SSH: escreve .env com secrets, npm install --omit=dev, restart
```

### Para commitar manualmente via CLI

```bash
GITHUB_TOKEN=<TOKEN_4_DO_CREDENCIAIS_MD> gh api \
  repos/verticalpartsIA/resolve-360/contents/CAMINHO/DO/ARQUIVO \
  -X PUT \
  -F message="feat: descrição" \
  -F content="$(base64 -w0 arquivo_local)" \
  -F sha="$(GITHUB_TOKEN=... gh api repos/.../contents/CAMINHO --jq '.sha')"
```

Ou pelo PowerShell (Windows):
```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("arquivo"))
$sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/verticalpartsIA/resolve-360/contents/CAMINHO" -Headers @{Authorization="token ghp_..."}).sha
Invoke-RestMethod -Uri "...mesmo caminho..." -Method PUT -Headers @{...} -Body (@{message="..."; content=$b64; sha=$sha} | ConvertTo-Json)
```

### GitHub Actions Secrets necessários

```
PROD_SUPABASE_URL
PROD_SUPABASE_PUBLISHABLE_KEY
PROD_SUPABASE_SERVICE_ROLE_KEY
PROD_VITE_SUPABASE_URL
PROD_VITE_SUPABASE_PUBLISHABLE_KEY
PROD_VITE_SUPABASE_PROJECT_ID
PROD_VITE_ERP_URL
PROD_VITE_ERP_ANON_KEY
PROD_ERP_SERVICE_KEY
HOSTINGER_FTP_SERVER / _USERNAME / _PASSWORD / _REMOTE_DIR
HOSTINGER_SSH_HOST / _USERNAME / _PRIVATE_KEY / _PORT / _APP_DIR / _RESTART_COMMAND
OMIE_APP_KEY / OMIE_APP_SECRET  (para sync de clientes)
```

---

## 5. BANCO DE DADOS

### Projeto: `jkbklzlbhhfnamaeislb`

### ENUMs (criados via migrations)

```sql
-- Status do ticket (banco) × status do app (frontend)
-- BANCO:  aberto | em_atendimento | aguardando_cliente | aguardando_interno | concluido | cancelado
-- APP:    aberto | analise | laudo | concluido
-- Mapeamento em: src/lib/store.tsx → normalizeTicketStatus() / denormalizeTicketStatus()

ticket_status: aberto | em_atendimento | aguardando_cliente | aguardando_interno | concluido | cancelado
ticket_priority: baixa | media | alta | critica
ticket_channel: whatsapp | telefone | email | portal | manual
occurrence_origin: interno | externo
resolution_status: em_analise | autorizado | recusado
occurrence_reason: devolucao_total | devolucao_parcial | reparo | troca | reclamacao | duvida_tecnica | outro
responsible_sector: comercial | expedicao | engenharia | producao | compras | qualidade | nao_aplica
containment_action: sucatear | retrabalhar | segregar | liberar_uso | devolver_fornecedor | outro
root_cause: venda | expedicao | engenharia | cliente | fornecedor
customer_tier: A | B | C
internal_dept: comercial | expedicao | engenharia | producao | compras | qualidade
internal_status: aberto | em_andamento | resolvido | cancelado
nps_category: promotor | neutro | detrator
message_kind: whatsapp | email | telefone | nota_interna
app_role: operador | gestor | admin
```

**ATENÇÃO — Divergência banco vs. frontend:**
Os ENUMs do banco e os types do frontend **NÃO são iguais**. O `store.tsx` tem funções `normalize*` e `denormalize*` que fazem a conversão. Nunca passe um valor do frontend direto ao banco sem verificar o mapeamento.

Exemplo de divergência:
- Frontend `troca_material` → banco `troca`
- Frontend `selecao` → banco `segregar`
- Frontend `aceito_concessao` → banco `liberar_uso`
- Frontend `almoxarifado` → banco `qualidade` (setor)
- Frontend `fornecedor` (setor) → banco `compras`

### Tabelas principais

#### `tickets`
```
id UUID PK
code TEXT UNIQUE  -- gerado: RO-YYYY-NNNNN (via sequence ro_seq)
ro_number TEXT    -- alias legível
cliente_id UUID FK → clientes
customer TEXT NOT NULL
customer_doc TEXT, customer_contato TEXT, customer_telefone TEXT
city TEXT, state TEXT
produto_id UUID FK → produtos
part TEXT NOT NULL, part_code TEXT NOT NULL
fornecedor TEXT, vendedor TEXT
nf_numero TEXT, nf_valor NUMERIC
quantity INT, unit_value NUMERIC
reason TEXT NOT NULL                    -- narrativa livre
occurrence_reason occurrence_reason    -- tipo do problema
responsible_sector responsible_sector
origin occurrence_origin               -- interno | externo
resolution_status resolution_status   -- em_analise | autorizado | recusado
channel ticket_channel
priority ticket_priority
status ticket_status DEFAULT 'aberto'
sla_hours INT DEFAULT 48
whatsapp_thread_id TEXT                -- remote_jid da conversa WA
acao_contencao containment_action[]   -- array de ações
nc_descricao TEXT                      -- descrição da não-conformidade
root_cause root_cause                  -- preenchido ao concluir (obrigatório)
custo_nao_qualidade NUMERIC
freight_cost_vp NUMERIC
freight_cost_customer NUMERIC
nps INT, nps_sent_at TIMESTAMPTZ
created_by UUID FK → auth.users        -- DEVE ser UUID, não string!
assigned_to UUID FK → auth.users       -- DEVE ser UUID, não string!
resolved_at TIMESTAMPTZ
created_at, updated_at TIMESTAMPTZ
```

#### `internal_tickets`
```
id UUID PK
code TEXT UNIQUE  -- TI-YYYY-NNNNN
linked_occurrence_id UUID FK → tickets
linked_customer TEXT
target_department internal_dept NOT NULL
priority ticket_priority
status internal_status DEFAULT 'aberto'
subject TEXT NOT NULL, description TEXT, response TEXT
sla_hours INT DEFAULT 24
opened_by UUID FK → auth.users         -- DEVE ser UUID, não string!
assigned_to UUID FK → auth.users       -- DEVE ser UUID, não string!
opened_at TIMESTAMPTZ, closed_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `whatsapp_messages`
```
id UUID PK
instance TEXT DEFAULT 'pv360'
remote_jid TEXT NOT NULL         -- ex.: 5511999887766@s.whatsapp.net
push_name TEXT
from_me BOOLEAN DEFAULT false
message_id TEXT
body TEXT NOT NULL
media_type TEXT                  -- image | video | audio | document | sticker
media_url TEXT
ticket_id UUID FK → tickets ON DELETE SET NULL
raw JSONB                        -- payload completo da Evolution API
created_at TIMESTAMPTZ
```

#### `profiles` e `user_roles`
```
profiles: id, user_id FK → auth.users, display_name, departamento, telefone, avatar_url
user_roles: id, user_id FK → auth.users, role app_role (operador|gestor|admin), UNIQUE(user_id, role)
```

Função crítica: `public.has_role(_user_id UUID, _role app_role) RETURNS BOOLEAN`
Usada em todas as RLS policies.

Auto-provisioning: `handle_new_user()` trigger cria `profile` + `user_roles(operador)` a cada novo signup.

#### `audit_log`
Imutável. Insert-only na prática (política permite apenas INSERT para authenticated).
```
entity_type TEXT, entity_id UUID, action TEXT, actor_id UUID, actor_name TEXT, payload JSONB
```
Ações conhecidas: `ticket_created`, `ticket_status_changed`, `ticket_resolved`, `internal_ticket_created`, `internal_ticket_linked`, `internal_ticket_status_changed`, `qualidade_updated`, `nps_received`, `ticket_nps_updated`

### RLS

Modelo geral:
- SELECT: todos `authenticated`
- INSERT/UPDATE: `operador OR qualidade OR gestor OR admin`
- DELETE: apenas `admin`
- `audit_log`: SELECT apenas `gestor OR admin`; INSERT qualquer `authenticated`
- `notifications`: SELECT/UPDATE/DELETE apenas o próprio `user_id`

---

## 6. STORE (`src/lib/store.tsx`)

O `StoreProvider` é um React Context que:
1. Faz `loadAll()` ao montar (busca todos os dados do Supabase)
2. Expõe funções de mutação que **persistem no Supabase**

### `createTicket` — ASYNC (versão atual)
```typescript
createTicket: (i: NewTicketInput) => Promise<Ticket>
```
- Faz `INSERT` direto no Supabase, espera o resultado, lança exceção se erro
- Retorna o ticket com o UUID real do banco
- **NÃO usa mais optimistic update** (versão antiga do código local usava)
- Chama `loadAll()` após inserir para atualizar o estado

**BUG CRÍTICO JÁ CORRIGIDO (commit 17f440de, 2026-05-22):**
Campos `created_by`, `assigned_to` (em tickets) e `opened_by` (em internal_tickets) devem ser `user?.id` (UUID), **não** `currentUser` (string como "admin"). Enviar string em coluna UUID causa erro de tipo no Postgres. A correção foi: usar `user?.id ?? null`.

### `createInternalTicket` — SÍNCRONO (optimistic)
Retorna `InternalTicket` otimista imediatamente. O insert real é fire-and-forget.
Diferente de `createTicket` que é async.

### currentUser vs user?.id
- `currentUser`: string legível para exibição (email prefix: "admin", "caio", "gelson"). Usar em `actor_name` do audit_log, exibições na UI.
- `user?.id`: UUID real do usuário autenticado. Usar em foreign keys: `created_by`, `assigned_to`, `opened_by`, `author_id`.

---

## 7. WHATSAPP — FLUXO COMPLETO

### Receber mensagens (webhook)

```
Evolution API (instância pv360)
  → POST https://posvenda360.vpsistema.com/api/webhook/evolution
  → Header: apikey: suporte123
  → Body: { event: "MESSAGES_UPSERT", instance: "pv360", data: { key, pushName, message, ... } }

src/routes/api/webhook/evolution.ts:
  1. Valida header apikey
  2. Só processa event === "messages.upsert"
  3. Extrai remoteJid, fromMe, body, mediaType
  4. Busca ticket aberto com whatsapp_thread_id = remoteJid
  5. INSERT whatsapp_messages (com ticket_id se encontrado)
```

**Webhook configurado em:** `http://72.61.48.156:8080/webhook/set/pv360` (já configurado, não mexer)

Para verificar/reconfigurar:
```bash
curl -X GET "http://72.61.48.156:8080/webhook/find/pv360" -H "apikey: suporte123"
```

Para reconfigurar se necessário:
```bash
curl -X POST "http://72.61.48.156:8080/webhook/set/pv360" \
  -H "apikey: suporte123" -H "Content-Type: application/json" \
  -d '{"webhook":{"url":"https://posvenda360.vpsistema.com/api/webhook/evolution","headers":{"apikey":"suporte123"},"enabled":true,"webhookByEvents":false,"webhookBase64":false,"events":["MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE","CONNECTION_UPDATE"]}}'
```

### Enviar mensagens

`src/lib/wa-server.ts` → `sendWhatsappMessage(createServerFn)`:
```
POST http://72.61.48.156:8080/message/sendText/pv360
Headers: { apikey: process.env.EVOLUTION_APIKEY }
Body: { number: "5511999887766", text: "mensagem" }
```
Após enviar, insere automaticamente em `whatsapp_messages` com `from_me: true`.

### Vincular conversa ao ticket
No formulário de nova ocorrência (Passo 1), ao selecionar canal WhatsApp, o operador informa o número (`whatsapp_thread_id`). Quando a Evolution API envia o webhook, o handler busca tickets com esse `whatsapp_thread_id` e vincula a mensagem.

---

## 8. INTEGRAÇÃO ERP OMIE

### Arquitetura
```
Omie ERP API (externa)
  ↓ (sync via scripts/sync-omie-clientes.ts, a cada 2h)
bd_Omie Supabase (kgecbycsyrtdhmdziuul)
  → tabela omie_customers
  → tabela omie_products (inferida)
  ↓ (service role, somente leitura)
resolve-360 server (erp-client.server.ts)
  → serverFetchClientesAtivos() → retorna OmieCliente[]
  → serverFetchProdutosAtivos() → retorna OmieProduto[]
```

### Tipos ERP
```typescript
OmieCliente: { id, codigo_integracao, cnpj_cpf, nome, email, telefone, cidade, estado, segmento }
OmieProduto: { codigo, codigo_produto, descricao, marca, unidade, preco }
```

O campo `telefone` já vem com DDD concatenado: `(11) 98877-6655`.

### NUNCA importar `erp-client.server.ts` no cliente
O arquivo tem `// NUNCA importe este arquivo em código client-side` no cabeçalho. Tem fallbacks de keys embutidas (apenas para server-side). Qualquer import em arquivo sem `.server.ts` vai vazar credenciais para o bundle.

Use `erp-server-fn.ts` (TanStack `createServerFn`) para expor ao cliente via RPC.

---

## 9. ROTAS E O QUE CADA UMA FAZ

### Rotas públicas (sem autenticação)
| Rota | Arquivo | Função |
|---|---|---|
| `/login` | `login.tsx` | Login com email/senha via Supabase Auth |
| `/register` | `register.tsx` | Criar conta |
| `/recover-password` | `recover-password.tsx` | Solicitar reset de senha |
| `/reset-password` | `reset-password.tsx` | Confirmar nova senha |
| `/nps/form/:token` | `nps.form.$token.tsx` | **Público** — formulário de NPS do cliente (sem login) |

### Rotas protegidas (`/_app/`)
| Rota | O que faz |
|---|---|
| `/dashboard` | Fila do operador — 4 KPI cards + tabela de tickets por SLA |
| `/nova-ocorrencia` | Wizard 4 passos para abrir ticket |
| `/ocorrencias` | Lista completa com filtros |
| `/ocorrencia/:ro` | Detalhe do ticket — ações, resolução, tickets internos, auditoria |
| `/ocorrencia/:ro/editar` | Edição de campos do ticket |
| `/tickets-internos` | Gerenciar tickets entre departamentos |
| `/clientes` | Lista de clientes do ERP |
| `/cliente/:cnpj` | Histórico de ocorrências do cliente |
| `/cliente/:cnpj/historico` | Variante de histórico |
| `/produto/:codigo` | Detalhes do produto |
| `/produtos` | Lista de produtos |
| `/whatsapp-threads` | Caixa de entrada WhatsApp (polling 10s) |
| `/thread/:id` | Conversa WhatsApp específica |
| `/meus-tickets` | Tickets do usuário logado |
| `/gestor/kpis` | Dashboard com 6 KPIs (período + tier filtros) |
| `/gestor/relatorios-fo504` | Relatório FO-504, preview + exportar Excel |
| `/gestor/recorrencia` | Análise de clientes com ocorrências repetidas |
| `/gestor/sla-departamentos` | SLA por departamento interno |
| `/gestor/custo-nao-qualidade` | Análise de custo por causa |
| `/nps/dashboard` | Score NPS + distribuição promotores/neutros/detratores |
| `/nps/relatorios` | Relatórios de NPS por período |
| `/nps/respostas` | Lista de respostas individuais |
| `/admin/usuarios` | Gerenciar usuários e papéis |
| `/admin/sla-config` | Configurar SLA por prioridade |
| `/admin/audit-log` | Ver log de auditoria |
| `/admin/configuracoes` | Configurações gerais (placeholder) |
| `/admin/integracoes` | Integrações (placeholder — WhatsApp, ERP) |

### API Routes
| Rota | Arquivo | Função |
|---|---|---|
| `POST /api/webhook/evolution` | `src/routes/api/webhook/evolution.ts` | Recebe mensagens da Evolution API |
| `GET /api/webhook/evolution` | idem | Health-check (retorna 200 OK) |

---

## 10. TIPO `Ticket` — CAMPOS IMPORTANTES

```typescript
interface Ticket {
  id: string                     // UUID do banco
  code: string                   // RO-YYYY-NNNNN
  roNumber?: string              // alias legível
  customer: string               // nome fantasia
  customerDoc?: string           // CNPJ/CPF
  part: string                   // descrição da peça
  partCode: string               // código ERP
  reason: string                 // narrativa da ocorrência
  status: "aberto"|"analise"|"laudo"|"concluido"
  priority: "baixa"|"media"|"alta"|"critica"
  channel: "whatsapp"|"manual"
  slaHours: number               // prazo em horas
  dataLimiteAtendimento: string  // ISO — calculado: created_at + slaHours
  occurrenceReason?: OccurrenceReason
  responsibleSector?: ResponsibleSector
  origin?: "interno"|"externo"
  resolutionStatus?: "autorizado"|"recusado"|"em_analise"
  acaoContencao?: ContainmentAction[]
  rootCause?: RootCause          // obrigatório ao concluir
  rootCauseJustification?: string
  technicalReport?: string
  whatsappThreadId?: string      // remote_jid para vincular WA
  nps?: number                   // 0-10
  audit: AuditLog[]              // histórico imutável
  internalTicketIds?: string[]   // IDs dos tickets internos vinculados
  // campos financeiros
  nfNumero?: string
  nfValor?: number
  quantity?: number
  freightCostVp?: number
  freightCostCustomer?: number
  custoNaoQualidade?: number
}
```

---

## 11. PAPÉIS E PERMISSÕES

```
operador: Abrir tickets, mover status, responder tickets internos
qualidade: Tudo do operador + preencher campos de qualidade (causa raiz, contenção, custo)
gestor:    Tudo + ver KPIs, relatórios, aprovar resoluções
admin:     Controle total: usuários, SLA config, audit log, integrações, deletar
```

Um usuário pode ter múltiplos papéis. A função `has_role(uid, role)` é usada diretamente nas RLS policies do Supabase. Isso significa que as permissões são garantidas no banco — não apenas no frontend.

---

## 12. BUGS CONHECIDOS E STATUS

### ✅ CORRIGIDO — Nova Ocorrência não salvava (commit 17f440de, 2026-05-22)
**Causa:** `created_by` e `assigned_to` (tickets) e `opened_by` (internal_tickets) recebiam `currentUser` (string "admin"), mas as colunas são `UUID REFERENCES auth.users`. Erro de tipo no Postgres.
**Fix:** Usar `user?.id ?? null` em vez de `currentUser`.
**Arquivo:** `src/lib/store.tsx` linhas 595-596, 747.

### ✅ CORRIGIDO — WhatsApp não recebia mensagens (2026-05-22)
**Causa 1:** Webhook apontava para URL antiga (`aliceblue-dove-844629.hostingersite.com`) que não existe.
**Causa 2:** Não havia rota de webhook no código.
**Fix 1:** Webhook reconfigurado para `https://posvenda360.vpsistema.com/api/webhook/evolution`.
**Fix 2:** Criado `src/routes/api/webhook/evolution.ts` (commit a327d13).

### ⚠️ PENDENTE — Admin/Usuários não persiste no Supabase
A tela `/admin/usuarios` tem estado local com 4 usuários hardcoded. Ainda não persiste criação/edição de usuários na tabela `user_roles` do Supabase. Para criar usuários realmente, use o painel do Supabase Auth diretamente.

### ⚠️ PENDENTE — Tela `/admin/integracoes`
É um `PagePlaceholder`. Sem implementação real ainda.

### ⚠️ PENDENTE — Classificação da Qualidade
A coluna "Classificação" da planilha FO-504 está armazenada no `audit_log` como payload JSON (`classificacaoQualidade`), não como coluna direta em `tickets`. Se for necessário filtrar/exportar por classificação, precisará ser migrada para coluna em `tickets`.

### ⚠️ PENDENTE — Campo DDD separado
A planilha tem DDD e Telefone em colunas distintas. O sistema armazena `(DDD) Numero` em `customer_telefone` concatenado. Baixa prioridade mas pode ser necessário para relatórios por região.

### ⚠️ MONITORAR — reportgen.io 409 no resolve-360
Não se aplica — esse é um problema do projeto `vp-requisi-es-pro` (VP Requisições), não deste.

---

## 13. PADRÕES DE CÓDIGO

### Criar uma nova Server Function
```typescript
import { createServerFn } from "@tanstack/react-start";

export const minhaFuncao = createServerFn()
  .validator((d: MeuInput) => d)
  .handler(async ({ data }) => {
    // Aqui roda no servidor. Pode acessar process.env, banco, etc.
    // NUNCA importar aqui código que só funciona no browser
    return resultado;
  });
```

### Criar uma nova API Route
```typescript
// src/routes/api/meu-endpoint.ts
import { createAPIFileRoute } from "@tanstack/react-start/api";

export const APIRoute = createAPIFileRoute("/api/meu-endpoint")({
  GET: async ({ request }) => new Response("OK"),
  POST: async ({ request }) => {
    const body = await request.json();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  },
});
```

### Padrão de mutation no store
```typescript
// 1. Mutação otimista (opcional, só se for rápido no banco)
setTickets(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));

// 2. Persist no banco
const { error } = await supabase.from("tickets").update(changes).eq("id", id);
if (error) { console.error(...); return; }

// 3. Escrever auditoria
await writeAudit("ticket", id, "nome_da_action", { detail: "..." });

// 4. Recarregar estado
await loadAll();
```

### Importações Supabase
```typescript
// Client-side (React components):
import { supabase } from "@/integrations/supabase/client";

// Server-side (server functions, API routes):
import { createClient } from "@supabase/supabase-js";
const sb = createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// ERP (apenas em arquivos .server.ts):
import { serverFetchClientesAtivos } from "@/integrations/supabase/erp-client.server";
```

---

## 14. ESTRUTURA DE ARQUIVOS

```
resolve-360/
├── .github/workflows/
│   ├── deploy-hostinger.yml       # CI/CD: push main → Hostinger
│   └── sync-omie-clientes.yml     # Cron 2h: Omie → bd_Omie Supabase
│
├── hostinger/
│   ├── server.mjs                 # Bootstrap Node.js para produção
│   ├── package.scripts.json       # Scripts extras para package.json de deploy
│   └── vite.config.node.ts        # Config Vite para build node
│
├── src/
│   ├── routes/
│   │   ├── __root.tsx             # Layout raiz: AuthProvider + StoreProvider + Toaster
│   │   ├── _app.tsx               # Layout protegido (verifica auth, sidebar, etc.)
│   │   ├── login.tsx, register.tsx, recover-password.tsx, reset-password.tsx
│   │   ├── nps.form.$token.tsx    # NPS público (sem auth)
│   │   ├── index.tsx              # Redirect → /dashboard
│   │   ├── api/
│   │   │   └── webhook/
│   │   │       └── evolution.ts   # POST /api/webhook/evolution ← WhatsApp
│   │   └── _app/
│   │       ├── dashboard.tsx
│   │       ├── nova-ocorrencia.tsx
│   │       ├── ocorrencias.tsx
│   │       ├── ocorrencia.$ro.tsx
│   │       ├── ocorrencia.$ro.editar.tsx
│   │       ├── tickets-internos.tsx
│   │       ├── clientes.tsx
│   │       ├── cliente.$cnpj.tsx
│   │       ├── cliente.$cnpj.historico.tsx
│   │       ├── produtos.tsx
│   │       ├── produto.$codigo.tsx
│   │       ├── whatsapp-threads.tsx
│   │       ├── thread.$id.tsx
│   │       ├── meus-tickets.tsx
│   │       ├── gestor/
│   │       │   ├── kpis.tsx
│   │       │   ├── relatorios-fo504.tsx
│   │       │   ├── recorrencia.tsx
│   │       │   ├── sla-departamentos.tsx
│   │       │   └── custo-nao-qualidade.tsx
│   │       ├── nps/
│   │       │   ├── dashboard.tsx
│   │       │   ├── relatorios.tsx
│   │       │   └── respostas.tsx
│   │       └── admin/
│   │           ├── usuarios.tsx    ⚠️ estado local, não persiste
│   │           ├── sla-config.tsx
│   │           ├── audit-log.tsx
│   │           ├── configuracoes.tsx  ← placeholder
│   │           └── integracoes.tsx   ← placeholder
│   │
│   ├── lib/
│   │   ├── store.tsx              # StoreProvider + todas as mutations
│   │   ├── auth.tsx               # AuthProvider (Supabase Auth)
│   │   ├── wa-server.ts           # sendWhatsappMessage (createServerFn)
│   │   ├── types.ts               # Todos os tipos TypeScript do domínio
│   │   └── utils.ts               # cn() e helpers
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts              # supabase client (browser, usa VITE_*)
│   │   ├── client.server.ts       # supabase admin client (server, usa SERVICE_ROLE)
│   │   ├── erp-client.ts          # tipos OmieCliente, OmieProduto
│   │   ├── erp-client.server.ts   # serverFetchClientesAtivos, serverFetchProdutosAtivos
│   │   ├── erp-server-fn.ts       # createServerFn wrappers para o ERP
│   │   ├── auth-middleware.ts     # middleware de autenticação SSR
│   │   └── types.ts               # tipos gerados (Database, Tables<>)
│   │
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   └── app/                   # components específicos do app
│   │
│   ├── router.tsx                 # createRouter com routeTree
│   ├── routeTree.gen.ts           # AUTO-GERADO pelo TanStack Router — não editar
│   └── styles.css                 # Tailwind CSS v4 global styles
│
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260503063612_*.sql   # profiles, user_roles, has_role, handle_new_user
│       ├── 20260503063631_*.sql   # (complementar)
│       ├── 20260503064447_*.sql   # (complementar)
│       ├── 20260503083959_*.sql   # (complementar)
│       ├── 20260503084129_*.sql   # ← PRINCIPAL: todos os enums + tabelas + policies
│       └── 20260511000001_*.sql   # whatsapp_messages table
│
├── scripts/
│   └── sync-omie-clientes.ts      # Script de sync Omie → bd_Omie
│
├── vite.config.ts                 # Vite: isNode=true → node-server, senão → Lovable/Cloudflare
├── package.json                   # bun run build, bun run dev, etc.
├── .env.example                   # Template de variáveis
├── README.md                      # Documentação pública (inclui telas, arquitetura)
└── INSTRUCTIONS.md                # Este arquivo
```

---

## 15. COMO FAZER TAREFAS COMUNS

### Adicionar um novo campo à tabela `tickets`

1. Criar migration SQL: `supabase/migrations/TIMESTAMP_descricao.sql`
2. Adicionar o campo ao INSERT em `store.tsx → createTicket`
3. Adicionar ao tipo `Ticket` em `types.ts`
4. Adicionar ao `mapTicket()` em `store.tsx`
5. Exibir/editar no componente relevante
6. Commitar e push → deploy automático

### Adicionar nova rota de página

1. Criar `src/routes/_app/nova-rota.tsx`
2. O TanStack Router regenera `routeTree.gen.ts` automaticamente no `bun run dev`
3. Se necessário adicionar ao menu lateral, editar `src/routes/_app.tsx`

### Adicionar nova rota de API

1. Criar `src/routes/api/meu-endpoint.ts` com `createAPIFileRoute`
2. Não precisa registrar em lugar nenhum — TanStack Start descobre automaticamente

### Verificar logs de produção

Logs ficam em `console.log` do servidor Node.js. Para acessar:
- Usar SSH no Hostinger (credenciais em `credenciais.md`)
- Ou ver o painel de logs do Hostinger

### Testar o webhook localmente

Não é possível diretamente (Evolution API está num IP externo). Alternativas:
- `ngrok` para expor localhost temporariamente
- Testar direto na produção após deploy

### Reconfigurar webhook Evolution API

```bash
curl -X POST "http://72.61.48.156:8080/webhook/set/pv360" \
  -H "apikey: suporte123" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"url":"https://posvenda360.vpsistema.com/api/webhook/evolution","headers":{"apikey":"suporte123"},"enabled":true,"webhookByEvents":false,"webhookBase64":false,"events":["MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE","CONNECTION_UPDATE"]}}'
```

### Verificar status da instância WhatsApp

```bash
curl -s "http://72.61.48.156:8080/instance/fetchInstances" -H "apikey: suporte123" | python3 -m json.tool
```
Campos importantes: `connectionStatus` (deve ser `"open"`), `_count.Message` (total de msgs)

---

## 16. VARIÁVEIS DE AMBIENTE — REFERÊNCIA COMPLETA

```bash
# Supabase principal (resolve-360)
SUPABASE_URL=https://jkbklzlbhhfnamaeislb.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role>
VITE_SUPABASE_URL=https://jkbklzlbhhfnamaeislb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=jkbklzlbhhfnamaeislb

# ERP bd_Omie (somente leitura)
ERP_URL=https://kgecbycsyrtdhmdziuul.supabase.co
ERP_SERVICE_KEY=<service role do bd_Omie>
ERP_ANON_KEY=<anon key do bd_Omie>
VITE_ERP_URL=https://kgecbycsyrtdhmdziuul.supabase.co
VITE_ERP_ANON_KEY=<anon key do bd_Omie>

# WhatsApp
EVOLUTION_APIKEY=suporte123

# IA — primeira resposta automática (opcional)
OPENAI_API_KEY=sk-proj-...

# Notificações externas (opcional)
NOTIFY_WEBHOOK_URL=
```

---

## 17. CONTEXTO DO NEGÓCIO

A VerticalParts vende peças para elevadores (pentes de alumínio, correias, amortecedores, cabos de aço, etc.) para empresas como MR Elevadores, ASS Manutenção, Elevtech Elevadores, Condomínios, etc.

O time de pós-venda (liderado por Caio) atende ~150 ocorrências/mês. Os problemas mais comuns são:
- Devolução Total: produto errado enviado
- Atraso na entrega: transportadora ou expedição
- Devolução Parcial: quantidade errada
- Reparo: produto com defeito

O relatório FO-OEA-Q-504 é uma exigência interna da qualidade (documentação ISO/OEA). A planilha tinha a mesma estrutura do sistema, mas manual.

O número WhatsApp `+55 11 99766-3780` é o canal oficial de suporte pós-venda — é o número conectado na instância `pv360` da Evolution API.

---

## 18. RELACIONAMENTO COM OUTROS PROJETOS

O `resolve-360` faz parte do ecossistema `vpsistema.com`. Os projetos relacionados:

| Projeto | URL | Repo | Supabase |
|---|---|---|---|
| **Portal Central** | `vpsistema.com` | `verticalpartsIA/vpsistema` | `ubdkoqxfwcraftesgmbw` |
| **VP Requisições Pro** | `vprequisicoes.vpsistema.com` | `verticalpartsIA/vp-requisi-es-pro` | `vvgcrhtmzvssfdazkkzk` |
| **VP Click** | `vpclick.vpsistema.com` | `verticalpartsIA/vp-click` | `sfpnjwllcmentoocylow` (vpclick) |
| **VP Catraca** | `catraca.vpsistema.com` | `verticalpartsIA/vp-catraca` | — |
| **Propostas** | `propostas.vpsistema.com` | `verticalpartsIA/vp-proposta-comercial` | — |
| **Visitas** | `visitas.vpsistema.com` | — | `bvvnoapdclxhuygptbza` |
| **bd_Omie** (ERP) | — | — | `kgecbycsyrtdhmdziuul` |

O SSO entre os sistemas é gerenciado pelo `sso-proxy` (Edge Function no projeto `ubdkoqxfwcraftesgmbw`). O `resolve-360` usa magic link para SSO (não `?sso_token=`).

---

## 19. CHECKLIST ANTES DE COMMITAR

- [ ] Não usei `currentUser` (string) em campos UUID (`created_by`, `assigned_to`, `opened_by`, `author_id`)
- [ ] Não importei `erp-client.server.ts` em código client-side
- [ ] Não coloquei credenciais hardcoded (use `process.env.NOME_VAR`)
- [ ] Novos campos de banco têm migration SQL correspondente
- [ ] `routeTree.gen.ts` não foi editado manualmente
- [ ] Token usado para commit é o `GITHUB TOKEN 4` (Claude_posvenda) — ver `credenciais.md`

---

*Gerado por Claude Sonnet 4.6 em 2026-05-22. Manter atualizado a cada mudança significativa.*
