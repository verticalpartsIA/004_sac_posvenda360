# Relatório Técnico — VP Pós-Venda 360°
**Data:** 2026-06-11  
**Gerado por:** Claude Sonnet 4.6 (assistente IA da VerticalParts)  
**Repositório:** https://github.com/verticalpartsIA/resolve-360  
**Produção:** https://posvenda360.vpsistema.com

---

## 1. O Que é Este Projeto

**VP Pós-Venda 360°** é uma plataforma web de gestão de pós-venda desenvolvida para a **VerticalParts** — empresa especializada em peças para elevadores, escadas rolantes e esteiras (importações e nacionais). Marcas principais: BST, Monarch, Fermator.

### Problema resolvido
Antes do sistema, a equipe gerenciava 150+ ocorrências/mês via planilhas Excel, sem:
- Visibilidade de SLA em tempo real
- Rastreamento de causa-raiz
- Pesquisa NPS automatizada
- Relatórios de qualidade
- Integração com WhatsApp

### Solução implementada
Plataforma web em tempo real com:
- Gestão completa de ocorrências (ROs) com SLA automático
- Caixa de entrada WhatsApp integrada
- Tickets internos entre departamentos
- NPS pós-fechamento automatizado
- Dashboard de KPIs para gestores
- Relatório FO-504 exportável em Excel (padrão de qualidade)
- Auto-resposta WhatsApp via Hermes (Claude AI)

---

## 2. Stack Técnico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React | 19 |
| Roteamento | TanStack Router | v1 |
| Server State | TanStack Query | v5 |
| Build | Vite + TanStack Start | 7.x |
| Estilo | Tailwind CSS | v4 |
| Componentes UI | shadcn/ui (Radix UI) | latest |
| Ícones | Lucide React | latest |
| Formulários | React Hook Form + Zod | latest |
| Banco de dados | Supabase (PostgreSQL + Auth + RLS) | latest |
| Package manager | Bun | latest |
| Notificações toast | Sonner | latest |
| Excel export | xlsx (SheetJS) | latest |
| WhatsApp gateway | Evolution API v2 (Baileys) | 2.2.3 |
| IA auto-reply | Anthropic Claude (Haiku/Sonnet) | API v1 |
| Deploy | Hostinger Node.js | — |
| CI/CD | GitHub Actions | — |

---

## 3. Estrutura de Arquivos

```
resolve-360/
├── nodejs/                          ← Aplicação principal
│   ├── src/
│   │   ├── routes/                  ← Todas as páginas (TanStack Router)
│   │   │   ├── __root.tsx           ← Root layout, AuthProvider, StoreProvider
│   │   │   ├── _app.tsx             ← Wrapper de rotas protegidas
│   │   │   ├── _app/
│   │   │   │   ├── dashboard.tsx          ← Fila do operador
│   │   │   │   ├── nova-ocorrencia.tsx    ← Wizard 4 etapas
│   │   │   │   ├── ocorrencias.tsx        ← Lista de tickets
│   │   │   │   ├── ocorrencia.$ro.tsx     ← Detalhe do ticket
│   │   │   │   ├── thread.$id.tsx         ← Conversa WhatsApp individual
│   │   │   │   ├── whatsapp-threads.tsx   ← Caixa de entrada WhatsApp
│   │   │   │   ├── tickets-internos.tsx   ← Tickets interdepartamentais
│   │   │   │   ├── clientes.tsx           ← Lista de clientes (ERP)
│   │   │   │   ├── cliente.$cnpj.tsx      ← Histórico do cliente
│   │   │   │   ├── gestor/
│   │   │   │   │   ├── kpis.tsx           ← Dashboard KPIs
│   │   │   │   │   ├── relatorios-fo504.tsx ← Export Excel FO-504
│   │   │   │   │   ├── recorrencia.tsx    ← Análise de recorrência
│   │   │   │   │   ├── sla-departamentos.tsx
│   │   │   │   │   └── custo-nao-qualidade.tsx
│   │   │   │   ├── nps/
│   │   │   │   │   ├── dashboard.tsx      ← NPS score + tendências
│   │   │   │   │   ├── relatorios.tsx
│   │   │   │   │   └── respostas.tsx      ← Respostas individuais
│   │   │   │   └── admin/
│   │   │   │       ├── usuarios.tsx       ← Gestão de roles
│   │   │   │       ├── sla-config.tsx     ← SLA por prioridade
│   │   │   │       ├── audit-log.tsx      ← Log imutável LGPD
│   │   │   │       ├── integracoes.tsx    ← Status das integrações
│   │   │   │       └── configuracoes.tsx
│   │   │   ├── login.tsx
│   │   │   ├── register.tsx
│   │   │   ├── recover-password.tsx
│   │   │   └── nps.form.$token.tsx        ← Formulário NPS público (sem auth)
│   │   ├── lib/
│   │   │   ├── store.tsx            ← Estado global, mutations Supabase, normalização
│   │   │   ├── auth.tsx             ← AuthProvider, useAuth hook
│   │   │   ├── types.ts             ← Tipos TypeScript: Ticket, InternalTicket, NpsRecord…
│   │   │   ├── wa-server.ts         ← Helper para envio WhatsApp (Evolution API)
│   │   │   └── hermes.ts            ← Agente Claude auto-reply WhatsApp
│   │   ├── integrations/supabase/
│   │   │   ├── client.ts            ← Cliente Supabase (browser)
│   │   │   ├── client.server.ts     ← Cliente Supabase (Node.js, service role)
│   │   │   ├── erp-client.ts        ← Tipos ERP Omie
│   │   │   ├── erp-client.server.ts ← Fetch ERP lado servidor
│   │   │   ├── erp-server-fn.ts     ← Server functions para ERP
│   │   │   ├── auth-middleware.ts
│   │   │   └── types.ts             ← Tipos gerados pelo Supabase
│   │   ├── components/
│   │   │   ├── app/
│   │   │   │   ├── StatusBadge.tsx  ← Pills de status coloridos
│   │   │   │   ├── SlaBar.tsx       ← Barra de progresso SLA
│   │   │   │   └── AppLayout.tsx    ← Wrapper de página padrão
│   │   │   └── ui/                  ← shadcn/ui: button, input, dialog, table…
│   │   ├── router.tsx               ← Setup TanStack Router
│   │   └── styles.css               ← Tailwind + CSS vars customizadas
│   ├── supabase/migrations/         ← SQL: schema, RLS, funções
│   ├── hostinger/server.mjs         ← Entry point Node.js produção + webhook WhatsApp
│   ├── vite.config.ts               ← Vite + TanStack Start (BUILD_TARGET=node)
│   ├── package.json
│   └── .env.example                 ← Referência de todas as vars de ambiente
├── tmp/
│   └── UPDATE_EVOLUTION_API.md      ← Instrução para Claude Code na VPS atualizar Evolution API
├── 2026_06_11_relatorio.md          ← Este arquivo
└── .github/workflows/
    └── deploy-hostinger.yml         ← CI/CD: push main → deploy automático
```

---

## 4. Banco de Dados (Supabase)

**Projeto:** `jkbklzlbhhfnamaeislb`  
**URL:** `https://jkbklzlbhhfnamaeislb.supabase.co`

### Tabelas principais

```sql
-- Ocorrências (ROs)
tickets (
  id UUID PRIMARY KEY,
  ro_code TEXT UNIQUE,           -- ex: RO-2026-00042
  customer_cnpj TEXT,
  customer_name TEXT,
  product_code TEXT,
  product_name TEXT,
  reason TEXT,                   -- motivo da ocorrência
  narrative TEXT,                -- descrição detalhada
  status TEXT,                   -- aberto | analise | laudo | concluido
  priority TEXT,                 -- baixa | media | alta | critica
  sla_hours INTEGER,             -- horas limite
  root_cause TEXT,               -- responsável: venda | expedicao | engenharia | cliente | fornecedor
  root_cause_justification TEXT, -- obrigatório ao fechar (≥10 chars)
  technical_report TEXT,         -- laudo técnico
  cost_non_quality NUMERIC,      -- custo da não-qualidade (R$)
  opened_by UUID,                -- FK profiles
  whatsapp_thread_id TEXT,       -- JID Evolution API
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
)

-- Mensagens internas do ticket
ticket_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets,
  author_id UUID REFERENCES profiles,
  content TEXT,
  created_at TIMESTAMPTZ
)

-- Tickets interdepartamentais
internal_tickets (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets,
  department TEXT,               -- Comercial | Expedição | Engenharia | Produção | Compras | Qualidade
  subject TEXT,
  description TEXT,
  status TEXT,                   -- aberto | em_andamento | concluido
  sla_hours INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
)

-- Mensagens WhatsApp (Evolution API webhook)
whatsapp_messages (
  id UUID PRIMARY KEY,
  instance TEXT,                 -- 'pv360'
  remote_jid TEXT,               -- ex: 5511999999999@s.whatsapp.net ou 123456@lid
  message_id TEXT,               -- ID único da mensagem no WhatsApp
  from_me BOOLEAN,
  body TEXT,                     -- conteúdo da mensagem
  ticket_id UUID REFERENCES tickets,
  phone TEXT GENERATED ALWAYS AS (
    CASE WHEN remote_jid LIKE '%@s.whatsapp.net'
         THEN replace(remote_jid, '@s.whatsapp.net', '')
         ELSE NULL END
  ) STORED,
  created_at TIMESTAMPTZ
)

-- Pesquisas NPS
nps_records (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets,
  token UUID UNIQUE,             -- link tokenizado (sem auth)
  score_q1 INTEGER,              -- 0-10: "recomendar VerticalParts"
  score_q2 INTEGER,              -- 0-10: "satisfação com resolução"
  score_q3 INTEGER,              -- 0-10: "agilidade no atendimento"
  category TEXT,                 -- promoter (9-10) | neutral (7-8) | detractor (0-6)
  feedback TEXT,                 -- comentário livre
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- Perfis de usuário
profiles (
  id UUID PRIMARY KEY REFERENCES auth.users,
  display_name TEXT,
  department TEXT,
  phone TEXT,
  avatar_url TEXT
)

-- Roles por usuário
user_roles (
  user_id UUID REFERENCES auth.users,
  role TEXT,                     -- operador | qualidade | gestor | admin
  PRIMARY KEY (user_id, role)
)

-- Log de auditoria imutável (LGPD)
audit_log (
  id UUID PRIMARY KEY,
  actor_id UUID,
  actor_name TEXT,
  action TEXT,                   -- created_ticket | changed_status | closed_ticket | etc.
  entity_type TEXT,
  entity_id TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ
)

-- Configuração de SLA por prioridade
sla_config (
  priority TEXT PRIMARY KEY,     -- baixa | media | alta | critica
  hours INTEGER                  -- horas limite padrão
)

-- Notificações in-app
notifications (
  id UUID PRIMARY KEY,
  user_id UUID,
  title TEXT,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)
```

### RLS e Funções

```sql
-- Função de verificação de role (usada em todas as políticas RLS)
CREATE OR REPLACE FUNCTION has_role(uid UUID, role TEXT) RETURNS BOOLEAN ...

-- RLS habilitado em todas as tabelas
-- Políticas: SELECT, INSERT, UPDATE, DELETE por role

-- ⚠️ Bug conhecido (26/05/2026):
--    REVOKE EXECUTE em has_role() quebrou INSERT de tickets.
--    Fix aplicado via MCP Supabase + Promise.race 20s no client.
--    Ver detalhes completos em nodejs/src/integrations/supabase/client.ts
```

---

## 5. Autenticação e Roles

- **Provider:** Supabase Auth (email/senha)
- **Roles disponíveis** (cumulativos — um usuário pode ter múltiplos):

| Role | Permissões |
|------|-----------|
| `operador` | Abrir/atualizar tickets, criar tickets internos, enviar WhatsApp |
| `qualidade` | Tudo do operador + preencher campos de qualidade (causa-raiz, contenção, custo), fechar tickets |
| `gestor` | Tudo do qualidade + visualizar KPIs, exportar relatórios FO-504 |
| `admin` | Tudo + gerenciar usuários/roles, configurar SLA, ver audit log, gerenciar integrações |

---

## 6. Fluxo de Negócio — Ciclo do Ticket

```
1. ABERTURA
   ├── Via WhatsApp (webhook Evolution API recebe mensagem)
   └── Via wizard manual (4 etapas)
       ├── Etapa 1: Canal + busca cliente no ERP Omie (por CNPJ ou nome)
       ├── Etapa 2: Produto + motivo + narrativa + uploads de evidências
       ├── Etapa 3: Ações de contenção + ticket interno opcional
       └── Etapa 4: Revisão + confirmação + notificação

2. CÓDIGO GERADO
   └── RO-YYYY-NNNNN (ex: RO-2026-00042)

3. CICLO DE STATUS
   Aberto → Em Análise → Laudo Técnico → Concluído

4. ALERTAS SLA (por cor)
   ├── Verde: 0–50% do tempo limite
   ├── Amarelo: 50–80%
   └── Vermelho: 80–100% (urgente!)

5. FECHAMENTO (role "qualidade" — obrigatório preencher)
   ├── Causa-raiz: venda | expedição | engenharia | cliente | fornecedor
   ├── Justificativa (mínimo 10 caracteres)
   └── Laudo técnico

6. PÓS-FECHAMENTO
   └── Link NPS enviado automaticamente ao cliente (token UUID único, sem login)

7. NPS (formulário público /nps/form/:token)
   ├── Q1: "Probabilidade de recomendar VerticalParts?" (0-10)
   │       → classifica: promoter (9-10) | neutral (7-8) | detractor (0-6)
   ├── Q2: "Satisfação com a resolução?" (0-10)
   └── Q3: "Agilidade no atendimento?" (0-10)
```

### Categorias de Ocorrência (padrão FO-OEA-Q-502)

| Campo | Opções |
|-------|--------|
| Motivo | Devolução Total, Devolução Parcial, Reparo, Troca de Material, Atraso na Entrega, Destinatário Errado, Menor Quantidade, Outros |
| Responsável | Comercial, Expedição, Engenharia, Produção, Almoxarifado, Fornecedor, Motorista |
| Origem | Interno / Externo |
| Contenção | Sucatear, Retrabalhar, Seleção, Reclassificar, Aceito sob concessão, Devolver |

---

## 7. KPIs do Gestor

| KPI | Cálculo | Meta |
|-----|---------|------|
| NPS Score | % Promotores − % Detratores | ≥ 70 |
| SLA Compliance | % tickets fechados dentro do SLA | ≥ 95% |
| MTTR | Média de horas do aberto ao fechado | < 48h |
| Recorrência | % clientes com 2+ tickets no período | < 10% |
| Custo Não-Qualidade | Soma do campo `cost_non_quality` em R$ | — |
| Tempo Resposta Interno | Média por departamento em horas | por dept |

Filtros disponíveis: 7d / 30d / 90d / todos; por tier de cliente A/B/C.

---

## 8. Relatório FO-504 (Excel — 5 abas)

| Aba | Conteúdo |
|-----|---------|
| Resumo Executivo | Totais, NPS, SLA compliance vs período anterior |
| Ocorrências Detalhadas | 30+ colunas por formulário de qualidade |
| Pareto de Causas | Top 5 motivos de reclamação |
| Distribuição NPS | Contagem e % de promotores/neutros/detratores |
| Ações Corretivas | Tickets internos com responsáveis e prazos |

---

## 9. Integração WhatsApp (Evolution API)

**Instância principal:** `pv360`  
**URL:** `http://72.61.48.156:8080`  
**Versão instalada:** 2.2.3  
**Número WhatsApp:** +55 (11) 99766-3780

### Webhook (recebe mensagens da Evolution API)
```
POST https://posvenda360.vpsistema.com/api/whatsapp/webhook
Header: apikey: <EVOLUTION_APIKEY>
```
Fluxo do webhook:
1. Valida a API key
2. Upsert da mensagem na tabela `whatsapp_messages`
3. Chama `autoReplyWithHermes()` se `HERMES_AUTO_REPLY=true`

### Envio de mensagem
```
POST http://72.61.48.156:8080/message/sendText/pv360
Header: apikey: suporte123
Body: { "number": "5511999999999", "text": "mensagem" }
```

### ⚠️ Problema conhecido: contatos @lid
Contatos WhatsApp com privacidade avançada usam JID no formato `123456789@lid`.

| Situação | Comportamento |
|----------|--------------|
| Receber mensagem de @lid | ✅ Funciona — webhook recebe normalmente |
| Enviar para @lid via HTTP | ❌ Retorna `{"exists": false}` — Evolution 2.2.3 bloqueado |
| @lid na base de Gelson | ~86% das conversas (ele tem múltiplos números + privacidade ativada) |
| @lid na base de clientes externos | ~9% estimado |

**Status atual no código:** `hermes.ts` detecta `@lid` via `remoteJid.endsWith("@lid")` e retorna cedo com log de aviso.  
**Solução planejada:** Atualizar Evolution API para v2.3+ com suporte nativo a @lid.  
**Instrução de atualização:** ver `tmp/UPDATE_EVOLUTION_API.md` (9 passos para Claude Code executar na VPS).

---

## 10. Agente Hermes (Auto-Reply WhatsApp via Claude AI)

**Arquivo:** `nodejs/src/lib/hermes.ts`  
**Modelo padrão:** `claude-haiku-4-5` (configurável via `HERMES_MODEL`)  
**Ativação:** `HERMES_AUTO_REPLY=true` no ambiente Hostinger

### Fluxo completo
```
1. Webhook recebe mensagem
2. Verifica: não é grupo (@g.us) → ignora
3. Verifica: não é mídia pura (imagem/audio/video sem texto) → ignora
4. Verifica: é @lid → retorna cedo (limitação Evolution API)
5. Busca últimas 20 mensagens do contato no Supabase
6. normalizeHistory(): une mensagens do mesmo role, garante que começa com "user"
   (API Anthropic exige alternância user/assistant)
7. POST https://api.anthropic.com/v1/messages
   Headers: x-api-key, anthropic-version: 2023-06-01
   Body: { model, max_tokens: 1024, system: SYSTEM_PROMPT, messages }
8. Envia resposta via Evolution API sendText
9. Salva resposta no Supabase (from_me: true, ticket_id vinculado)
```

### System Prompt resumido
Atendente de pós-venda VerticalParts. Mensagens curtas (3-4 linhas), tom profissional mas amigável, pt-BR coloquial. Pode ajudar com: acompanhamento de pedidos, dúvidas sobre peças/compatibilidade, status de entregas, abertura de reclamações. Nunca inventa números de pedido, preços ou prazos. Se perguntado se é robô, responde com honestidade.

### Variáveis de ambiente (Hermes)
```env
ANTHROPIC_API_KEY=sk-ant-...        # Chave Anthropic (obrigatória)
HERMES_MODEL=claude-haiku-4-5       # Modelo (haiku=rápido/barato, sonnet=melhor)
HERMES_AUTO_REPLY=true              # Liga/desliga auto-reply
EVOLUTION_APIKEY=suporte123         # API key Evolution API
```

---

## 11. Infraestrutura VPS

**VPS:** `72.61.48.156` (Hostinger)  
**OS:** Ubuntu 24.04 + Docker + Traefik  
**Plano:** KVM 1 — 1 CPU, 4 GB RAM, 50 GB Disco  
**Validade:** 2027-03-19

### Containers Docker em execução

| Container | Porta ext. | Descrição | docker-compose? |
|-----------|-----------|-----------|-----------------|
| `evolution-api` | 8080 | WhatsApp gateway principal (instância `pv360`) | ❌ Criado manual via `docker run` |
| `evolution_api` | 8081 | Evolution secundária (vpautomation-evolution) | ✅ `/docker/vpautomation-evolution/` |
| `n8n` | 5678 | Automação de fluxos (n8n) | ✅ `/docker/vpautomation-n8n/` |
| `traefik` | 80/443 | Reverse proxy / SSL automático | ✅ |
| `postgres` | 5432 (int.) | PostgreSQL compartilhado (banco `evolution` + `n8n`) | ✅ `/docker/vp-infra/` |
| `redis` | 6379 (int.) | Cache Redis | ✅ `/docker/vp-infra/` |
| `vpautomation-hermes` | 4860 | Hermes legacy (OpenRouter) — NÃO é o do pv360 | ✅ `/docker/vpautomation-hermes/` |

### ⚠️ Atenção crítica: `evolution-api` (porta 8080 — pv360)
```
- Foi criado via `docker run` manual, SEM docker-compose
- SEM volumes persistentes externos (dados dentro do container)
- Backup automático: /root/evolution-api-backup-YYYYMMDD.json
- Atualizar requer recriar o container com os mesmos parâmetros
- Se o container for removido sem backup, o QR do WhatsApp precisa ser reescaneado
```

### Rede Docker compartilhada
```
Nome: vp-automation (bridge)
Containers conectados: postgres, redis, n8n, evolution_api, vpautomation-hermes
```

---

## 12. Deploy / CI/CD

**Branch de produção:** `main`  
**URL de produção:** `https://posvenda360.vpsistema.com`

### Fluxo automático
```
git push origin main
    ↓
GitHub Actions: .github/workflows/deploy-hostinger.yml
    ↓
bun install → BUILD_TARGET=node bun run build
    ↓
Output: dist/server/server.js + assets estáticos
    ↓
Deploy automático para Hostinger Node.js
    ↓
https://posvenda360.vpsistema.com (live em ~2-3 min)
```

### Variáveis de build
```bash
BUILD_TARGET=node   # OBRIGATÓRIO — sem isso gera bundle para Cloudflare Workers
```

### Entry point produção
```
hostinger/server.mjs   ← Node.js HTTP server
dist/server/server.js  ← Bundle gerado pelo build
```

---

## 13. Variáveis de Ambiente (Referência completa)

```env
# ──── Supabase (projeto principal PV360 jkbklzlbhhfnamaeislb) ────
SUPABASE_URL=https://jkbklzlbhhfnamaeislb.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJ...       # anon key (pública, segura no frontend)
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # service role (NUNCA expor no frontend)
VITE_SUPABASE_PROJECT_ID=jkbklzlbhhfnamaeislb
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_URL=https://jkbklzlbhhfnamaeislb.supabase.co

# ──── WhatsApp / Evolution API ────
EVOLUTION_APIKEY=suporte123

# ──── Claude / Anthropic — Hermes auto-reply ────
ANTHROPIC_API_KEY=sk-ant-...
HERMES_MODEL=claude-haiku-4-5         # ou claude-sonnet-4-6 para melhor qualidade
HERMES_AUTO_REPLY=false               # mude para "true" para ativar

# ──── Notificações opcionais (n8n / Slack / Telegram) ────
NOTIFY_WEBHOOK_URL=

# ──── vpclick (usuários/avatares — somente leitura) ────
VPCLICK_URL=https://sfpnjwllcmentoocylow.supabase.co
VPCLICK_SERVICE_KEY=eyJ...
VITE_VPCLICK_ANON_KEY=eyJ...

# ──── bd_Omie ERP (clientes e produtos — somente leitura) ────
ERP_URL=https://kgecbycsyrtdhmdziuul.supabase.co
ERP_SERVICE_KEY=eyJ...
ERP_ANON_KEY=eyJ...
VITE_ERP_URL=https://kgecbycsyrtdhmdziuul.supabase.co
VITE_ERP_ANON_KEY=eyJ...
```

---

## 14. Projetos Supabase Relacionados

| Projeto | ID Supabase | Finalidade |
|---------|------------|-----------|
| PV360 (principal) | `jkbklzlbhhfnamaeislb` | Tickets, WhatsApp, NPS, usuários, audit |
| bd_Omie ERP | `kgecbycsyrtdhmdziuul` | Espelho leitura: clientes e produtos do Omie ERP |
| vpclick | `sfpnjwllcmentoocylow` | Usuários/avatares (leitura — dados de colaboradores) |
| Omie Schema novo | `hrhwplqlbuwfextznkea` | Espelho ~90 tabelas de todas as APIs Omie (criado 26/05/2026) |

---

## 15. Outros Projetos da Organização verticalpartsIA

| Repositório | Sistema | URL Produção |
|-------------|---------|-------------|
| `resolve-360` | VP Pós-Venda 360° (este projeto) | posvenda360.vpsistema.com |
| `vpprd` | VP PRD — Cotação de Importação | — |
| `vp-requisi-es-pro` | VP Requisições Pro | maroon-dove-178367.hostingersite.com |
| `vpsistema` | Portal Central vpsistema | vpsistema.com |
| `vp-proposta-comercial` | Propostas Comerciais | propostas.vpsistema.com |
| `developer_omie_com_br_service-list` | BD Omie Schema | — |

---

## 16. Integrações Externas

| Serviço | Finalidade | Onde configurado |
|---------|-----------|-----------------|
| Anthropic Claude | Auto-reply Hermes (Haiku/Sonnet) | `ANTHROPIC_API_KEY` no Hostinger |
| Omie ERP | Dados de clientes e produtos (leitura) | Supabase bd_Omie + `ERP_SERVICE_KEY` |
| Evolution API (pv360) | WhatsApp gateway principal | Rodando na VPS 72.61.48.156:8080 |
| Evolution API (vpautomation) | WhatsApp secundário | VPS 72.61.48.156:8081, `/docker/vpautomation-evolution/` |
| n8n | Automação de fluxos / notificações | VPS 72.61.48.156:5678 |
| OpenRouter | Hermes legado (vpautomation-hermes, NÃO pv360) | `/docker/vpautomation-hermes/` |
| Google Gemini | IA auxiliar (não no pv360 atualmente) | `GEMINI_API_KEY` |

---

## 17. Status Atual e Pendências (2026-06-11)

### ✅ Funcionando
- Criação e gestão completa de tickets (ROs) com wizard 4 etapas
- Ciclo de status Aberto → Análise → Laudo → Concluído com SLA
- Tickets internos interdepartamentais
- Caixa de entrada WhatsApp (leitura e envio)
- Exibição de @lid com label "contato @lid (número oculto pelo WhatsApp)" em âmbar
- NPS tokenizado (formulário público sem login)
- Dashboard KPIs (NPS, SLA, MTTR, Recorrência)
- Relatório FO-504 Excel (5 abas)
- Hermes auto-reply para contatos `@s.whatsapp.net`
- Anthropic API integrada diretamente (sem Ollama)
- `normalizeHistory()` garantindo alternância user/assistant na API Anthropic

### 🔴 Pendente / Issues conhecidos

**1. @lid auto-reply (prioridade alta)**
- Evolution API v2.2.3 retorna `{"exists": false}` para JIDs `@lid`
- Afeta ~86% dos contatos de teste (Gelson tem múltiplos números + privacidade)
- Afeta ~9% da base geral de clientes
- Hermes pula silenciosamente e loga: `[hermes] ⚠️ contato @lid — auto-reply não suportado`
- Solução: atualizar Evolution API para v2.3+
- Instrução pronta: ver `tmp/UPDATE_EVOLUTION_API.md`
- Complicação: `evolution-api` (8080) não tem docker-compose, precisa recriar container manualmente

**2. Env vars placeholder no Hostinger**
- Verificar se `SUPABASE_PUBLISHABLE_KEY`, `VITE_VPCLICK_ANON_KEY` e `ERP_ANON_KEY` têm valores reais ou ainda são placeholders

**3. Teste com cliente externo real**
- Validar fluxo completo de auto-reply com número `@s.whatsapp.net` de cliente externo (não números do Gelson)

---

## 18. Histórico de Bugs Críticos Resolvidos

| Data | Bug | Fix |
|------|-----|-----|
| 26/05/2026 | `has_role()` com REVOKE EXECUTE quebrou INSERT de tickets | Fix via MCP Supabase + Promise.race 20s |
| Jun/2026 | Hermes chamando `localhost:32768` (era `ttyd`, não Ollama) | Reescrito para chamar Anthropic API diretamente |
| Jun/2026 | `ANTHROPIC_API_KEY` truncada no painel Hostinger | Gelson corrigiu para chave completa |
| Jun/2026 | Git push rejeitado (non-fast-forward, 4 commits à frente) | fetch + merge, manteve callClaude() remoto + normalizeHistory() local |
| Jun/2026 | `bun.lockb` filemode change bloqueando rebase | `git config core.fileMode false` |
| Jun/2026 | Thread view mostrava ID numérico para @lid | Corrigido para mostrar label âmbar em `thread.$id.tsx` |

---

## 19. Comandos Úteis

```bash
# ──── Desenvolvimento local ────
cd nodejs
bun install
bun run dev

# ──── Build produção ────
BUILD_TARGET=node bun run build

# ──── Testar se Claude está respondendo (do servidor produção) ────
curl https://posvenda360.vpsistema.com/api/test-claude

# ──── Verificar status da instância pv360 ────
curl -s http://72.61.48.156:8080/instance/connectionState/pv360 \
  -H "apikey: suporte123"

# ──── Ver logs do container evolution-api ────
docker logs evolution-api --tail 100

# ──── Ver todos os containers na VPS ────
docker ps

# ──── Backup da config do evolution-api antes de atualizar ────
docker inspect evolution-api > /root/evolution-api-backup-$(date +%Y%m%d).json

# ──── Atualizar Evolution API (instrução completa) ────
cat tmp/UPDATE_EVOLUTION_API.md

# ──── Conectar na VPS ────
ssh root@72.61.48.156
```

---

## 20. Colaboradores VerticalParts

| Cargo | Nome | Email |
|-------|------|-------|
| CEO | Diego Maeno | diego@verticalparts.com.br |
| Consultor Estratégico | Gelson Simões | gelson.simoes@verticalparts.com.br |
| Coord. Administrativa | Juliana Anderson | juliana@verticalparts.com.br |
| Marketing | Giovanna Maeno | giovanna@verticalparts.com.br |
| Gerente Comercial | Guilherme Garcia | guilherme@verticalparts.com.br |
| Líder Comercial | Marcus Braz | marcus.braz@verticalparts.com.br |
| Consultor Comercial | Rafael Nunes | rafael@verticalparts.com.br |
| Coord. Compras | Bianca Maeno | bianca@verticalparts.com.br |
| Analista Financeiro | Milene Gusmão | milene@verticalparts.com.br |
| Engenheiro | Alexandre Schmidt | alexandre@verticalparts.com.br |
| Analista de Projetos | Vinicius Leite | vinicius@verticalparts.com.br |
| Sup. de Logística | Danilo Oliveira | danilo@verticalparts.com.br |
| Supervisor Inst/Mont. | Mauricio Araujo | mauricio@verticalparts.com.br |

---

## 21. Referências de Credenciais

Todas as credenciais estão em:
`C:\Users\gelso\VerticalParts\CredenciaisMD\credenciais_master.md`

**NUNCA versionar senhas, API keys ou service role keys neste repositório.**

| Credencial | Onde encontrar |
|-----------|---------------|
| SSH VPS | credenciais_master.md → Seção 2. HOSTINGER |
| Supabase keys | credenciais_master.md → Seção 4. SUPABASE → [4] VP PÓS-VENDA 360 |
| GitHub tokens | credenciais_master.md → Seção 3. GITHUB → Token `Claude_posvenda` |
| Anthropic API Key | credenciais_master.md → Seção 5. INTEGRAÇÕES → Anthropic |
| Evolution API key | env `EVOLUTION_APIKEY` no Hostinger (valor: suporte123) |
| MCP config recomendado | credenciais_master.md → Seção 6. MCP CONFIG |

---

*Relatório gerado em 2026-06-11 por Claude Sonnet 4.6.*  
*Para atualizar: edite este arquivo diretamente e faça push para `main`.*  
*Próxima sessão: leia este arquivo para recuperar o contexto completo do projeto.*
