# Relatório Técnico — VP Pós-Venda 360
**Projeto:** `verticalpartsIA/resolve-360`
**Atualizado em:** 2026-06-11
**Autor:** Claude Sonnet 4.6 + Gelson Simões

---

## Resumo Executivo

Sistema completo de pós-venda integrado ao ERP Omie, com pipeline SAC, módulo de expedição, tickets internos, sincronização com VP Click e SSO automático via vpsistema.

---

## 1. Arquitetura

```
Omie ERP (webhook)
    ↓
posvenda360.vpsistema.com/api/webhooks/omie
    ↓
hostinger/server.mjs (Node.js / lsnode)
    ↓
Supabase jkbklzlbhhfnamaeislb
    ↓ triggers
VP Click (sfpnjwllcmentoocylow) + Evolution API (WhatsApp)
```

**Stack:**
- React 19 + TanStack Router/Start (BUILD_TARGET=node)
- Supabase PostgreSQL + Auth + RLS
- Node.js HTTP server customizado (`hostinger/server.mjs`)
- lsnode (LiteSpeed runner na Hostinger — reinicia na 1ª requisição HTTP)
- pg_net para chamadas HTTP assíncronas dos triggers Postgres

---

## 2. Projetos Supabase

| Projeto | ID | URL |
|---|---|---|
| VP Pós-Venda 360 | `jkbklzlbhhfnamaeislb` | https://jkbklzlbhhfnamaeislb.supabase.co |
| vpsistema (Portal) | `ubdkoqxfwcraftesgmbw` | https://ubdkoqxfwcraftesgmbw.supabase.co |
| VP Click | `sfpnjwllcmentoocylow` | https://sfpnjwllcmentoocylow.supabase.co |
| BD Omie (ERP Mirror) | `kgecbycsyrtdhmdziuul` | https://kgecbycsyrtdhmdziuul.supabase.co |

---

## 3. Módulos Implementados

### 3.1 Motor SAC (OODA)
**Arquivo:** `hostinger/server.mjs` → `handleOmieWebhook()`, `handleSacEnviarPesquisa()`

- Recebe webhook do Omie quando NF é faturada
- Classifica cliente em Curva ABC: A ≥ R$50k | B ≥ R$10k | C < R$10k
- Envia WhatsApp automático via Evolution API para clientes Classe A
- Modelo Hermes: `claude-haiku-4-5-20251001`

**Tabelas criadas:**
- `sac_clientes` — cadastro + classificação ABC
- `sac_notas_fiscais` — NFs recebidas do webhook + dados expedição/pós-venda
- `sac_pesquisas` — pesquisas de satisfação
- `sac_logs_comunicacao` — histórico de WhatsApp/ligações

**Colunas adicionais em `sac_notas_fiscais`:**
`data_coleta`, `transportadora_entregou`, `data_entrega_real`, `comprovante_entrega`,
`previsao_pos_venda`, `status_pos_venda`, `data_pos_venda`, `responsavel_pos_venda`

### 3.2 Tickets Internos → VP Click
**Edge Function:** `handle-integration-event` v4 (Supabase `sfpnjwllcmentoocylow`)
**Trigger:** `trg_vpclick_interno` AFTER INSERT ON `internal_tickets`

Quando um ticket interno é criado no pós-venda, uma tarefa é criada automaticamente no VP Click:
- Assignee baseado no departamento citado
- Status mapeado: `aberto→Aberto`, `em_analise→Em Atendimento`, `concluido→Concluído`

**Mapeamento de departamentos → e-mails:**

| Departamento | Responsável |
|---|---|
| comercial | guilherme@verticalparts.com.br |
| expedicao | expedicao@verticalparts.com.br |
| engenharia | alexandre@verticalparts.com.br |
| producao | mauricio.araujo@verticalparts.com.br |
| compras | andreia.oliveira@verticalparts.com.br |
| qualidade | arilene.avila@verticalparts.com.br |

### 3.3 SSO — Sync vpsistema → posvenda360
**Implementado em:** 2026-06-11

**Edge Function:** `sync-user-posvenda360` (vpsistema `ubdkoqxfwcraftesgmbw`) — ACTIVE
**Secret:** `x-sync-secret: sync-pv360-2026-secret`

Ações:
- `invite` → convida usuário no posvenda360 via Admin API (idempotente)
- `ban` → bane usuário (`ban_duration: "876600h"` ≈ 100 anos)
- `unban` → remove ban (ou reenvia invite se não existia)

**Triggers no vpsistema:**
```sql
trg_sync_new_user_to_posvenda     AFTER INSERT ON public.profiles
trg_sync_user_status_to_posvenda  AFTER UPDATE OF is_active ON public.profiles
```

**Fluxo completo:**
1. Admin convida colaborador no vpsistema
2. vpsistema cria `auth.users` → `handle_new_user` → `profiles` INSERT → trigger dispara
3. Edge Function chama Admin API do posvenda360 → invite enviado ao e-mail
4. Colaborador aceita → posvenda360 cria `profiles + user_roles (operador)` automaticamente
5. Admin inativa no vpsistema (`is_active = false`) → colaborador banido no posvenda360
6. Admin reativa → ban removido, acesso restaurado

---

## 4. Infraestrutura de Produção

### Hostinger Hosting
```
URL:  https://posvenda360.vpsistema.com
SSH:  ssh u969661049@76.13.95.90 -p 65002
Servidor: lsnode (LiteSpeed)
```

### .env de Produção
Localização: `/home/u969661049/.env` (persiste entre deploys)

Variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ERP_URL`, `ERP_SERVICE_KEY`,
`OMIE_APP_KEY`, `OMIE_APP_SECRET`, `EVOLUTION_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_APIKEY`,
`VPCLICK_EDGE_URL`, `VPCLICK_SECRET`, `ANTHROPIC_API_KEY`, `HERMES_MODEL`

### Rotas registradas em `server.mjs`
```
POST /api/webhooks/omie       → handleOmieWebhook()
POST /api/sac/enviar-pesquisa → handleSacEnviarPesquisa()
```

---

## 5. Evolution API — WhatsApp

```
URL:       http://72.61.48.156:8080
Instância: pv360
APIKEY:    suporte123
Número:    +55 (11) 99766-3780
```

> ⚠️ Contatos `@lid` (agenda pessoal): Evolution API não consegue enviar via REST.
> Para produção com clientes externos, usar número dedicado de negócios.

---

## 6. Configuração do Webhook Omie (pendente)

```
Painel Omie → Configurações → Integrações → Webhooks → Adicionar
URL:    https://posvenda360.vpsistema.com/api/webhooks/omie
Evento: Pedido de Venda Faturado
```

---

## 7. Bugs Corrigidos

### 7.1 Webhook retornando `{"ok":true,"skipped":true}`
`payload.event` é string truthy → `ev.codigo_pedido = undefined`.
**Fix:** verificar `typeof payload.event === "object"` antes de usar como `ev`.

### 7.2 Rotas SAC retornando 404 em produção
`server.mjs` não tinha as rotas registradas. Corrigido via GitHub push.

---

## 8. Pendências

- [ ] Configurar webhook no painel Omie
- [ ] Renovar token Hostinger MCP (atual retorna 401)
- [ ] Configurar secrets GitHub CI/CD: `HOSTINGER_FTP_SERVER` e `HOSTINGER_SSH_HOST`

---

## 9. Arquivos Principais

| Arquivo | Descrição |
|---|---|
| `hostinger/server.mjs` | Servidor Node.js de produção |
| `supabase/migrations/20260611000003_sac_module.sql` | Tabelas SAC |
| `supabase/migrations/20260611000004_sac_expedicao_posvendas.sql` | Colunas expedição/pós-venda |
| Edge Function `handle-integration-event` v4 (VP Click) | Tickets internos → VP Click |
| Edge Function `sync-user-posvenda360` (vpsistema) | SSO sync colaboradores |
| Migration `sync_users_to_posvenda360` (vpsistema) | Triggers de sync |

---

*Relatório gerado por Claude Sonnet 4.6 em 2026-06-11*
