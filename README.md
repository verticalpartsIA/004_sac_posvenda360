<div align="center">

# 📦 VP Pós-Venda 360°

### Plataforma completa de pós-venda para a VerticalParts

Rastreabilidade total de ocorrências · Causa raiz · NPS · WhatsApp · Relatórios FO-504

[![Deploy](https://img.shields.io/badge/Produção-posvenda360.vpsistema.com-gold?style=for-the-badge&logo=googlechrome)](https://posvenda360.vpsistema.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![TanStack](https://img.shields.io/badge/TanStack_Start-React_19-FF4154?style=for-the-badge&logo=react)](https://tanstack.com/start)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Evolution_API-25D366?style=for-the-badge&logo=whatsapp)](https://github.com/EvolutionAPI)

</div>

---

## 🎯 Por que esse sistema existe?

A equipe de pós-venda da VerticalParts atendia **mais de 150 ocorrências por mês** registrando tudo manualmente em planilhas Excel (`FO-OEA-Q-504`). O processo tinha problemas sérios:

| Problema na planilha | Impacto no negócio |
|---|---|
| Sem visibilidade de SLA | Prazos estouravam sem alerta |
| Sem histórico do cliente | Mesmo erro se repetia sem rastreio |
| Causa raiz sem padrão | Não havia dado para reduzir reincidência |
| NPS coletado manualmente | Feedback do cliente chegava tarde demais |
| WhatsApp fora do sistema | Conversas se perdiam sem vínculo ao ticket |
| Sem relatório executivo automático | Gestor perdia horas montando planilha |

O **VP Pós-Venda 360°** substitui essa planilha com um sistema web completo: desde a abertura do chamado até o fechamento com causa raiz, NPS e relatório exportável no padrão exigido pela qualidade.

---

## ✨ Funcionalidades principais

- **Abertura guiada de ocorrências** em 4 passos com busca de clientes e produtos direto do ERP Omie
- **Gestão de SLA** com alertas automáticos em 50%, 80% e 100% do prazo
- **Análise de causa raiz** obrigatória ao concluir — venda, expedição, engenharia, cliente ou fornecedor
- **Tickets internos** entre departamentos vinculados à ocorrência
- **WhatsApp integrado** via Evolution API — todas as mensagens na tela, vinculadas ao ticket
- **NPS pós-resolução** automático por link tokenizado, sem exigir login do cliente
- **Relatório FO-OEA-Q-504** exportável em Excel com 5 abas (padrão da qualidade)
- **Dashboard gerencial** com KPIs: NPS, SLA Compliance, MTTR, Reincidência, Custo da Não Qualidade
- **Auditoria imutável** (LGPD) de cada ação no ticket
- **Controle de papéis**: Operador, Qualidade, Gestor e Admin

---

## 🖥️ Telas do sistema

### 🏠 Dashboard — Fila de atendimento

Tela inicial do operador. Mostra os 4 indicadores principais do dia e a fila de tickets ordenada por urgência de SLA.

| Card | O que mostra |
|---|---|
| **Em andamento** | Total de tickets abertos/em análise |
| **Risco de SLA** | Tickets acima de 80% do prazo |
| **Concluídos** | Fechados no período |
| **Via WhatsApp** | Ocorrências abertas por mensagem |

A fila exibe código, prioridade, cliente, peça, status e uma **barra de SLA colorida** (verde → amarelo → vermelho conforme aproxima do vencimento).

> 📸 _Adicione aqui um screenshot do dashboard com tickets em aberto_

---

### 📋 Lista de Ocorrências

Todos os tickets com filtros por status (Aberto / Análise / Laudo / Concluído) e busca livre por código, cliente ou peça.

Cada linha mostra motivo da ocorrência (devolução total, reparo, troca de material, etc.), setor responsável, prioridade e SLA em tempo real.

> 📸 _Adicione aqui um screenshot da lista de ocorrências filtrada_

---

### 🔍 Detalhe da Ocorrência (RO)

A tela mais importante do sistema. Centraliza tudo sobre um ticket:

```
┌─────────────────────────────────────────────────────┐
│  RO-2026-00042  │  Alta  │  WhatsApp  │  Em análise │
├─────────────────────────────────────────────────────┤
│  Cliente: MR Elevadores  │  Peça: Pente Alumínio    │
│  Motivo: Devolução Total  │  SLA: 78%  ████████░░   │
├─────────────────────────────────────────────────────┤
│  NARRATIVA                                           │
│  "Cliente verificou que o pente enviado não tinha..." │
├─────────────────────────────────────────────────────┤
│  AÇÕES   [Análise]  [Laudo]  [Concluir Ticket]      │
├─────────────────────────────────────────────────────┤
│  TICKETS INTERNOS VINCULADOS                         │
│  TI-2026-00017  │  Expedição  │  Em andamento       │
├─────────────────────────────────────────────────────┤
│  AUDITORIA  (imutável)                              │
│  15:32 · Caio → Movido para Análise                 │
│  14:10 · Sistema → Ticket criado                    │
└─────────────────────────────────────────────────────┘
```

Para **concluir**, o operador obrigatoriamente informa:
- ✅ Causa raiz (Venda / Expedição / Engenharia / Cliente / Fornecedor)
- ✅ Justificativa (mínimo 10 caracteres)
- ✅ Relatório técnico

Após concluir, o cliente recebe o link de **NPS** automaticamente.

> 📸 _Adicione aqui um screenshot do detalhe de uma ocorrência concluída com causa raiz preenchida_

---

### ➕ Nova Ocorrência — Formulário em 4 passos

Wizard guiado que impede abertura incompleta.

**Passo 1 — Triagem**
- Canal de entrada: WhatsApp ou Manual
- Busca o cliente direto do ERP Omie (nome, CNPJ ou telefone)
- Mostra histórico de ocorrências anteriores do cliente

**Passo 2 — Ocorrência**
- Busca produto no ERP (descrição, código ou marca)
- Motivo: Devolução Total, Devolução Parcial, Reparo, Troca de Material, Reclamação, Dúvida Técnica, Outros
- Setor responsável, Origem (Interno/Externo), NF, Quantidade, Valor
- Upload de fotos e narrativa livre

**Passo 3 — Ações**
- Ações de contenção (múltipla escolha): Sucatear, Retrabalhar, Seleção, Aceito por Concessão, Devolver ao Fornecedor
- Prioridade e SLA
- Opção de abrir ticket interno simultâneo (departamento + assunto)

**Passo 4 — Confirmação**
- Revisão completa antes de registrar
- Disparo automático de notificações (WhatsApp, e-mail, dashboard)

> 📸 _Adicione aqui um screenshot do passo 1 (Triagem) com cliente selecionado_

> 📸 _Adicione aqui um screenshot do passo 4 (Confirmação) mostrando a revisão_

---

### 💬 WhatsApp — Caixa de entrada

Todas as conversas recebidas no número da empresa em uma única tela, com:

- Status de conexão em tempo real (instância `pv360`)
- Nome do contato (via push name do WhatsApp)
- Última mensagem e horário relativo (agora / 5min / 2h / 3d)
- Badge de mensagens não lidas (última hora)
- Indicador se a conversa já tem ticket vinculado
- Atualização automática a cada 10 segundos

> 📸 _Adicione aqui um screenshot da caixa de entrada do WhatsApp_

---

### 🤝 Tickets Internos — Colaboração entre departamentos

Sistema de tickets entre setores (Comercial, Expedição, Engenharia, Produção, Compras, Qualidade) vinculados a ocorrências externas.

Layout em duas colunas:
- **Esquerda:** lista com status coloridos (Aberto / Em Andamento / Aguardando / Resolvido)
- **Direita:** thread de respostas com indicador de tempo de resposta por mensagem

Ao resolver, registra o **SLA cumprido ou violado** e grava resumo da resolução.

> 📸 _Adicione aqui um screenshot de um ticket interno com thread de respostas_

---

### 👥 Clientes — Integração com ERP Omie

Base completa de clientes sincronizada automaticamente do ERP Omie. Filtrável por CNPJ, razão social, cidade ou segmento.

Cada cliente tem página de **histórico de ocorrências** (`/cliente/:cnpj`) com todas as ROs associadas.

> 📸 _Adicione aqui um screenshot da lista de clientes_

---

### 📊 Dashboard do Gestor — KPIs em tempo real

6 métricas executivas com metas configuráveis:

| KPI | Meta | Cor |
|---|---|
| **NPS Score** | ≥ 70 | Verde se atingida |
| **SLA Compliance** | ≥ 95% | — |
| **MTTR** (tempo médio de resolução) | < 48h | — |
| **Reincidência** | < 10% | — |
| **Custo da Não Qualidade** | R$ — | Informativo |
| **Tempo médio de resposta interna** | — | Por departamento |

Filtros por período (7d / 30d / 90d / Tudo) e por **tier de cliente** (A / B / C).

Painéis extras: distribuição de causa raiz, NPS por categoria (promotores / neutros / detratores), custo por causa, tickets em risco de SLA.

Export: **CSV** e **PDF** direto do navegador.

> 📸 _Adicione aqui um screenshot do dashboard do gestor com KPIs_

---

### 📄 Relatório FO-OEA-Q-504

Relatório oficial de qualidade exportado em Excel (`xlsx`) com **5 abas**, no mesmo padrão do formulário físico usado pelo pós-venda:

| Aba | Conteúdo |
|---|---|
| **Resumo Executivo** | Comparativo vs período anterior, totais |
| **Ocorrências Detalhadas** | Tabela completa de ROs no período |
| **Análise de Causas** | Pareto dos top 5 motivos |
| **NPS** | Promotores / Neutros / Detratores + score |
| **Ações Corretivas** | Tickets internos com responsáveis |

Filtro por período: 30 dias / 90 dias / 365 dias / Tudo.
Preview das 5 abas na própria tela antes de exportar.

> 📸 _Adicione aqui um screenshot do relatório FO-504 com os cards de preview_

---

### ⭐ NPS — Formulário e Dashboard

**Formulário público** (sem login) acessível via link tokenizado enviado ao cliente após fechamento do ticket. Coleta 3 perguntas:
1. Probabilidade de recomendar a VerticalParts (0–10)
2. Resolução do problema (1–5)
3. Agilidade no atendimento (1–5)

**Dashboard NPS**: Score calculado (promotores − detratores), distribuição visual em barra empilhada, contagem por categoria.

> 📸 _Adicione aqui um screenshot do formulário de NPS (visão do cliente)_

---

### 🔐 Admin — Usuários e Permissões

Gestão de usuários com 4 papéis:

| Papel | Pode fazer |
|---|---|
| **Operador** | Abrir, atualizar e responder tickets |
| **Qualidade** | Tudo do operador + preencher campos de qualidade (causa, contenção, custo) |
| **Gestor** | Tudo + ver KPIs, relatórios e aprovar resoluções |
| **Admin** | Controle total: usuários, SLA config, audit log, integrações |

Papéis são toggles por usuário — um usuário pode ter múltiplos.

> 📸 _Adicione aqui um screenshot da tela de usuários_

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                          │
│   React 19 + TanStack Router + TanStack Query + Tailwind      │
└──────────────────────────┬───────────────────────────────────┘
                           │ SSR (node-server)
┌──────────────────────────▼───────────────────────────────────┐
│              SERVIDOR (Hostinger Node.js)                     │
│   TanStack Start · createServerFn · API Routes               │
│   posvenda360.vpsistema.com                                   │
└─────┬───────────────────┬──────────────────┬─────────────────┘
      │                   │                  │
┌─────▼──────┐  ┌─────────▼──────┐  ┌───────▼────────────────┐
│  Supabase  │  │   ERP Omie     │  │   Evolution API         │
│ PostgreSQL │  │  (bd_Omie)     │  │   WhatsApp Baileys      │
│ Auth + RLS │  │  Clientes      │  │   Instância: pv360      │
│ Storage    │  │  Produtos      │  │   IP: 72.61.48.156:8080 │
└────────────┘  └────────────────┘  └─────────────────────────┘
                                              │
                              ┌───────────────▼──────────┐
                              │  POST /api/webhook/       │
                              │  evolution                │
                              │  (recebe msgs recebidas)  │
                              └──────────────────────────┘
```

---

## 🗄️ Banco de dados — Supabase

**Projeto:** `jkbklzlbhhfnamaeislb`  
**URL:** `https://jkbklzlbhhfnamaeislb.supabase.co`

### Tabelas principais

| Tabela | Registros-chave |
|---|---|
| `tickets` | RO, cliente, produto, motivo, status, prioridade, SLA, causa raiz, custo |
| `ticket_messages` | Mensagens/notas internas vinculadas ao ticket |
| `internal_tickets` | Tickets entre departamentos |
| `whatsapp_messages` | Todas as mensagens recebidas/enviadas (Evolution API) |
| `clientes` | Base de clientes (sincronizada do Omie) |
| `produtos` | Catálogo de produtos (sincronizado do Omie) |
| `nps_records` | Respostas de NPS por ticket |
| `audit_log` | Histórico imutável de todas as ações |
| `notifications` | Notificações in-app por usuário |
| `sla_config` | Configuração de SLA por prioridade |

### Papéis (RLS)
```sql
CREATE TYPE public.app_role AS ENUM ('operador', 'gestor', 'admin');
```
Toda query passa por `has_role(auth.uid(), 'role')` — segurança em nível de linha garantida pelo Supabase.

---

## 📱 Integração WhatsApp (Evolution API)

```
Cliente envia mensagem
        │
        ▼
Evolution API (pv360)
        │  POST /api/webhook/evolution
        ▼
Servidor Node.js
  • Valida apikey
  • Extrai texto/mídia
  • Busca ticket vinculado (whatsapp_thread_id = remoteJid)
  • INSERT → whatsapp_messages
        │
        ▼
Supabase PostgreSQL
        │
        ▼
Tela WhatsApp atualiza (polling 10s)
```

Para **enviar** mensagens, o operador usa o botão "Enviar via WhatsApp" na tela do ticket → `wa-server.ts` → `POST /message/sendText/pv360`.

---

## 🔗 Integração ERP Omie

Banco `bd_Omie` (Supabase separado) sincroniza clientes e produtos do ERP Omie.

- **Clientes**: CNPJ, razão social, contato, cidade, segmento
- **Produtos**: Código ERP, descrição, marca, unidade, preço

O resolve-360 consome esse banco via **service role** (somente leitura) através de `erp-client.server.ts`. Nenhum dado do ERP é duplicado — é sempre lido ao vivo.

---

## 🚀 Tech Stack

| Camada | Tecnologia |
|---|---|
| Framework | TanStack Start (SSR) + TanStack Router v1 |
| UI | React 19 + Tailwind CSS v4 + Radix UI + shadcn/ui |
| State | TanStack Query v5 + Context (Store) |
| Backend | TanStack `createServerFn` + API Routes |
| Banco | Supabase (PostgreSQL + Auth + RLS) |
| WhatsApp | Evolution API v2 (Baileys) |
| ERP | Omie (via bd_Omie Supabase) |
| Excel | `xlsx` library |
| Deploy | Hostinger Node.js (auto-deploy via GitHub Actions) |
| Build | Vite + Bun |

---

## ⚙️ Variáveis de ambiente

```env
# Supabase — projeto principal
SUPABASE_URL=https://jkbklzlbhhfnamaeislb.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...

# WhatsApp
EVOLUTION_APIKEY=suporte123

# ERP Omie (somente leitura)
ERP_URL=https://kgecbycsyrtdhmdziuul.supabase.co
ERP_SERVICE_KEY=...
ERP_ANON_KEY=...
VITE_ERP_URL=...
VITE_ERP_ANON_KEY=...

# IA — primeira resposta automática (opcional)
OPENAI_API_KEY=sk-proj-...
```

---

## 📦 Deploy

O deploy é **automático** via GitHub Actions ao fazer push na branch `main`.

```
git push origin main
  └─► GitHub Actions (.github/workflows/deploy-hostinger.yml)
        ├─ bun install
        ├─ BUILD_TARGET=node bun run build
        └─► Hostinger Node.js (posvenda360.vpsistema.com)
```

---

## 🗂️ Estrutura de pastas

```
resolve-360/
├── src/
│   ├── routes/
│   │   ├── _app/                    # Rotas autenticadas
│   │   │   ├── dashboard.tsx        # Fila de atendimento
│   │   │   ├── nova-ocorrencia.tsx  # Wizard 4 passos
│   │   │   ├── ocorrencias.tsx      # Lista de tickets
│   │   │   ├── ocorrencia.$ro.tsx   # Detalhe do ticket
│   │   │   ├── tickets-internos.tsx # Tickets entre setores
│   │   │   ├── clientes.tsx         # Base de clientes (ERP)
│   │   │   ├── whatsapp-threads.tsx # Caixa de entrada WA
│   │   │   ├── meus-tickets.tsx     # Tickets do usuário logado
│   │   │   ├── gestor/              # Área do gestor
│   │   │   │   ├── kpis.tsx
│   │   │   │   ├── relatorios-fo504.tsx
│   │   │   │   ├── recorrencia.tsx
│   │   │   │   ├── sla-departamentos.tsx
│   │   │   │   └── custo-nao-qualidade.tsx
│   │   │   ├── nps/                 # NPS
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── relatorios.tsx
│   │   │   │   └── respostas.tsx
│   │   │   └── admin/               # Administração
│   │   │       ├── usuarios.tsx
│   │   │       ├── sla-config.tsx
│   │   │       ├── audit-log.tsx
│   │   │       ├── configuracoes.tsx
│   │   │       └── integracoes.tsx
│   │   ├── api/
│   │   │   └── webhook/
│   │   │       └── evolution.ts     # Webhook WhatsApp
│   │   ├── login.tsx
│   │   └── nps.form.$token.tsx      # Formulário NPS (público)
│   ├── lib/
│   │   ├── store.tsx                # State global + Supabase mutations
│   │   ├── auth.tsx                 # AuthProvider
│   │   ├── wa-server.ts             # Envio de mensagens WA
│   │   └── types.ts                 # TypeScript types
│   └── integrations/supabase/       # Clientes Supabase
├── supabase/migrations/             # Schema do banco
├── hostinger/server.mjs             # Servidor Node.js produção
└── .github/workflows/               # CI/CD auto-deploy
```

---

## 📊 Comparativo: Planilha × Sistema

| | Planilha Excel | VP Pós-Venda 360° |
|---|---|---|
| Abertura de chamado | Manual, sem validação | Wizard guiado, busca ERP |
| Controle de SLA | Nenhum | Automático, alertas em tempo real |
| Histórico do cliente | Busca manual | Automático por CNPJ |
| Causa raiz | Coluna livre | Campo obrigatório ao fechar |
| NPS | Não existe | Automático por link tokenizado |
| WhatsApp | Fora do sistema | Integrado, mensagens vinculadas |
| Relatório da qualidade | Montar manualmente | 1 clique, Excel com 5 abas |
| Visibilidade do gestor | Zero | Dashboard com 6 KPIs |
| Auditoria | Não existe | Imutável, LGPD-compliant |
| Acesso simultâneo | Conflito de edição | Multi-usuário sem conflito |

---

<div align="center">

Feito com ❤️ pela equipe VerticalParts · Suporte: [vpsistema.com](https://vpsistema.com)

</div>

---

## Contributors

- Gelson Simões — criador e responsável pelas soluções VerticalParts

---

**Feito por Gelson Simões**
