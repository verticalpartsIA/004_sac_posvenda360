# RELATÓRIO — pv360: botão de excluir ticket + limpeza de tickets e NFs

**Data:** 2026-08-20
**Autor:** Claude (Claude Code) a pedido de Gelson Simões
**Escopo:** implementar exclusão de tickets pelo operador na tela `/ocorrencias`, limpar a base de tickets em produção e remover 40 Notas Fiscais indevidas do rastreio SAC (`/sac`).
**Relatório anterior:** `2026_06_17_relatorio.md`.

---

## 0. TL;DR — o que foi feito

| Frente | Resultado |
|---|---|
| Botão "Excluir ticket" | Implementado na listagem `/ocorrencias` e no detalhe do ticket, com confirmação. Liberado para `operador`, `qualidade`, `gestor` e `admin` (antes só `admin`). Commit `3c2d42a`, deploy em produção confirmado (`200 OK`). |
| Limpeza de tickets | Apagados **71 tickets** (`tickets`) e **11 chamados internos** (`internal_tickets`) da produção, a pedido do Gelson. Log de auditoria registrado antes do apagão. |
| Ajuste de schema | `sac_devolucoes.ticket_id` passou de sem `ON DELETE` (bloqueava exclusão) para `ON DELETE SET NULL`. |
| Limpeza de NFs no `/sac` | Removidas **40 Notas Fiscais** de `sac_notas_fiscais` (rastreio interno do pv360) que não deveriam contar como pendência de pós-venda: NFs canceladas, prestação de serviço, retorno de bem do ativo e duplicidades. Omie **não foi tocado** — ação só na base do pv360. |

---

## 1. Botão de excluir ticket (`/ocorrencias`)

### 1.1 Pedido
Gelson pediu um botão para o operador poder excluir tickets quando quiser, direto na tela de ocorrências.

### 1.2 O que mudou
- **UI:** botão "Excluir" (ícone lixeira) em cada linha da lista `/ocorrencias` e no cabeçalho do detalhe (`/ocorrencia/$ro`), com diálogo de confirmação (`AlertDialog`) e toast de resultado (`sonner`). Clique no botão não dispara a navegação da linha (evento isolado com `preventDefault`/`stopPropagation`).
- **Store (`src/lib/store.tsx`):** nova ação `deleteTicket(id)` — chama `ticketsRepo.remove`, registra em `audit_log` (`ticket_deleted`) e recarrega a lista.
- **Repositório (`ticketsRepo.ts`):** nova função `remove(id)`.
- **Banco (RLS):** policy `tickets_delete` alterada — antes só `admin`, agora `operador`, `qualidade`, `gestor` e `admin` também podem excluir (mesmo padrão já usado em `tickets_update`).
- **Banco (FK):** `sac_devolucoes.ticket_id` estava sem `ON DELETE` (bloqueava com erro de FK a exclusão de ticket com devolução vinculada); alterado para `ON DELETE SET NULL` — o registro de devolução (rastreio da Expedição) continua existindo, só perde o vínculo.

### 1.3 Migração e deploy
- Migração `supabase/migrations/20260820120000_tickets_delete_operador.sql` aplicada em produção via Supabase Management API e commitada no repo.
- Build de produção e os 100 testes (`vitest`) passando antes do push.
- Commit `3c2d42a` → push para `main` → deploy automático via GitHub Actions (`deploy-hostinger.yml`) confirmado no ar (`https://posvenda360.vpsistema.com/ocorrencias` respondendo `200`).

---

## 2. Limpeza dos tickets em produção

A pedido do Gelson, apagados **todos** os tickets então existentes na base do pv360:

- **71 tickets** em `tickets` (incluindo um aberto no mesmo dia, `RO-2026-00113`).
- **11 chamados internos** em `internal_tickets`.

Antes de apagar, foi registrado um log em `audit_log` (`action: tickets_bulk_deleted`) com a contagem de linhas removidas, para rastreabilidade. Confirmado por consulta direta: `0` linhas restantes em ambas as tabelas.

---

## 3. Limpeza de Notas Fiscais indevidas no `/sac`

### 3.1 Pedido
Gelson passou uma lista de 49 linhas (NF, Cliente, Emissão, Status + observação própria) de Notas Fiscais que estavam poluindo a tela de pendências do SAC (`/sac`) por não serem vendas reais — NFs canceladas, prestação de serviço, retorno de bem do ativo, ou duplicidade.

### 3.2 Investigação
- Confirmado que a origem da tela `/sac` é a tabela `sac_notas_fiscais`, populada via webhook do Omie (`ingerirNFdoOmie`, em `src/lib/sac-engine.ts`) **sem filtro** por tipo de operação — todo pedido faturado no Omie entra como pendência, mesmo quando não é uma venda de mercadoria.
- Das 49 NFs informadas, **40 existiam** na base (batendo Cliente/Emissão/Status exatamente) e **9 não existiam** (`20952, 21074, 21102, 21166, 20960, 20963, 21121, 21036, 21139`) — nada a fazer nessas 9.
- Checado que nenhuma das 40 tinha devolução, pesquisa de satisfação, log de comunicação ou chamado vinculado — exclusão sem conflito de integridade referencial.

### 3.3 Ação
- Registrado log em `audit_log` (`action: nfs_bulk_deleted`) com a lista de NFs removidas.
- Apagadas as 40 linhas de `sac_notas_fiscais`. Confirmado por consulta direta: `0` linhas restantes para os 40 números.
- **Omie não foi acessado em nenhum momento** — a ação afetou só a tabela de rastreio interno do pv360; as Notas Fiscais reais no ERP permanecem intactas.

---

## 4. Pendências / próximos passos

1. Nenhuma pendência técnica aberta desta sessão — todas as ações solicitadas foram concluídas e verificadas.
2. Vale considerar, numa próxima sessão, adicionar um filtro na ingestão (`ingerirNFdoOmie`) para não trazer automaticamente NFs de natureza não-comercial (serviço, retorno de ativo, cancelada) para `sac_notas_fiscais`, evitando que o mesmo tipo de poluição volte a se acumular no `/sac`.

---

*Gerado por Claude (Claude Code) em 2026-08-20, a pedido de Gelson Simões.*
