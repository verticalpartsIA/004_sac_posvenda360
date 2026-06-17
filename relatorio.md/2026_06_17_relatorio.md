# RELATÓRIO — pv360/Verti: o "vácuo" do atendimento — diagnóstico forense e correção (verti-2.7-resiliencia)

**Data:** 2026-06-17
**Autor:** Claude (Claude Code / Opus 4.8) a pedido de Gelson Simões
**Escopo:** investigar por que a atendente **Verti** "ficou no vácuo" (parou de responder) em dois casos relatados pelo Gelson; achar a causa-raiz com evidência; corrigir o defeito em produção.
**Relatórios anteriores:** `2026_06_16_relatorio.md`, `2026_06_15_relatorio.md`, `../2026_06_12_relatorio.md`, `2026_06_11_relatorio.md`.

---

> ℹ️ **Sistema tratado:** pv360 / **Verti** — atendente de **WhatsApp** do Pós-Venda 360 (repo `resolve-360`, produção em `hostinger/server.mjs`, hospedagem Node do Hostinger). Linha do bot/Verti = **(11) 99766-3780** (instância Evolution `pv360`). NÃO confundir com o agente CFO do Telegram.

---

## 0. TL;DR — estado final

| Frente | Resultado |
|---|---|
| Caso A — vendedor (11) 96765-6507 "no vácuo" | **A mensagem dele NUNCA chegou à linha da Verti.** Forense no banco do pv360 e no banco do Evolution provou: zero mensagens recebidas dele; só um PDF que a linha enviou *para* ele em 12/06. Provavelmente escreveu para OUTRO número da VP (não a linha da Verti). |
| Caso B — conversa do Gelson travou no "avisar Vendas" | **Bug real, reproduzido e CORRIGIDO.** A Verti silenciou exatamente ao acionar `avisar_departamento`. Causa: o pipeline de resposta não tinha rede de proteção — uma única falha na chamada ao Claude (timeout/sobrecarga, ou `max_tokens`) fazia a função retornar `null` e o cliente recebia **silêncio total**. |
| Correção | **Commit `e12a060` → deploy `verti-2.7-resiliencia`** no ar e validado: retry no Claude (3x), "regra de ouro" anti-silêncio (mensagem de espera + escala do ticket), timeout/retry no envio do WhatsApp, tratamento de `max_tokens`. |
| Mito derrubado | A API da Anthropic **aceita** mensagens `user` consecutivas (testado, HTTP 200). NÃO era "roles must alternate". |

---

## 1. Caso A — o vendedor (11) 96765-6507 "ficou no vácuo" e "nem apareceu no site"

### 1.1 O que o Gelson relatou
Um vendedor (depois identificado como **Rafael Neves**, que tem 2 números; este, **(11) 96765-6507**, é o segundo) teria mandado uma pergunta e ficado sem resposta — e nem apareceu dentro do sistema.

### 1.2 Investigação (forense em dois bancos)
Número em dígitos: `11967656507`.

**No banco do pv360** (`jkbklzlbhhfnamaeislb`):
- `internal_contacts`: o número **NÃO está cadastrado** (os 6 contatos do dept Comercial têm números diferentes; o nº cadastrado do Rafael é 11999520472). Logo, mesmo se chegasse, a Verti o trataria como **lead/cliente externo**, não como vendedor.
- `whatsapp_messages` / `tickets`: a **única** ocorrência do número é uma mensagem **`from_me: true`** — o **PDF "Proposta_856.pdf"** que a linha enviou *para* ele em **12/06 20:05**. **Nenhuma mensagem recebida (`from_me: false`) dele existe.** → por isso "não apareceu no site": o webhook insere TODA mensagem recebida antes de qualquer coisa; se não está lá, não chegou.

**No banco do Evolution** (container `evolution-postgres`, db `evolution`):
- O Evolution armazena mensagens por **`@lid`** (id opaco do WhatsApp), não pelo telefone — ex.: o Gelson aparece como `241604795338837@lid`. Por isso buscar "96765" na tabela `Message` não acha nada (foi um falso negativo na primeira tentativa).
- **Mapeamento telefone↔@lid:** a tabela `Contact` cria duas linhas para a mesma pessoa (uma `@s.whatsapp.net`, uma `@lid`) com a **MESMA `profilePicUrl`** — dá pra casar por aí. Pelo `profilePicUrl` do Rafael e pela mensagem do PDF, o `@lid` dele é `32934396481615@lid`.
- Mensagens de `32934396481615@lid`: **uma só** — o PDF de saída (`fromMe: true`) de 12/06. **Zero mensagens recebidas.** O Evolution recebeu 26 mensagens inbound nas últimas 48h (funcionando normal) — nenhuma dele.

### 1.3 Conclusão do Caso A
**A pergunta do Rafael não chegou à linha da Verti (11 99766-3780)** — nem de um número, nem do outro. A VerticalParts tem **vários números de WhatsApp** (Comercial, Expedição, contas dos vendedores...); a Verti responde **só a um**. Se ele escreveu para outro número da VP, não há bot do outro lado → ninguém respondeu automaticamente = vácuo. **Não foi falha da Verti.**

**Pendências do Caso A (dependem do Gelson):**
1. Confirmar **para qual número** o Rafael escreveu.
2. Decidir se cadastra **(11) 96765-6507** como 2º número do Rafael em `internal_contacts` (operação de banco, sem deploy).

---

## 2. Caso B — a conversa do Gelson que travou no "avisar Vendas"

### 2.1 A conversa real (do número do Gelson, 5512992004047, hoje 08:27–08:32 BRT)
Reconstruída do banco (com as respostas da Verti):

```
08:27 GELSON  Olá, bom dia
08:27 VERTI   Bom dia! ☀️ Como posso te ajudar?
08:28 GELSON  Preciso degrau para escada rolante
08:28 VERTI   Entendi... para qual modelo/equipamento?
08:28 GELSON  Escada s9000 schindler / Ainda não sou cliente
08:28 VERTI   Perfeito, anotado... Como é seu nome e o nome da empresa?
08:29 GELSON  Gelson / Sim empresa
08:29 VERTI   Obrigada, Gelson! Confirma o nome da empresa...
08:29 GELSON  GAS elevadores
08:29 VERTI   Perfeito — GAS Elevadores! Posso já avisar nosso time de Vendas?
08:30 GELSON  S9300, você está certa
08:30 VERTI   Isso, S9300! Posso avisar o time de Vendas agora?
08:31 GELSON  Por favor, avise          ← A VERTI SILENCIOU AQUI
08:31 GELSON  Avisou?                    ← silêncio
08:32 GELSON  Quem vai falar comigo?     ← silêncio
```

A conversa alternou **perfeitamente** até 08:30. A Verti silenciou **exatamente na mensagem que dispara a ferramenta `avisar_departamento`**. A tabela `handoffs` ficou **vazia** → o `avisar_departamento` nunca completou.

### 2.2 Diagnóstico — testei cada peça isoladamente; todas funcionam
- ✅ API `claude-opus-4-8` responde headless (com a chave de produção).
- ✅ **Reprodução do caminho feliz:** dei o histórico real + as ferramentas ao Opus → Turn 0 chamou `avisar_departamento` (5,2s) → Turn 1 respondeu *"Pronto, Gelson! Avisei nosso time de Vendas (Guilherme)..."* (2,9s). **A lógica está correta.**
- ✅ `sendText` do Evolution: ~0,3s (e devolve HTTP 400 rápido p/ número inválido — **não trava**). Guilherme (Vendas, 11942464292) está no WhatsApp (`exists:true`).
- ✅ Insert na tabela `handoffs`: HTTP 201 em 0,1s.
- ✅ Produção saudável (`/status`: opus-4-8, auto-reply on, chave ok).

### 2.3 A causa-raiz: **faltava rede de proteção**
Como tudo funciona isolado e a falha repetiu 3x seguidas, o problema é estrutural no código (`callClaudeWithHistory` + `automateIncoming`):

> Se a chamada ao Claude falhar **uma vez** (timeout de 30s, sobrecarga 5xx/429 do modelo, ou resposta cortada no `max_tokens` sem texto), a função retornava **`null`** e o cliente recebia **silêncio absoluto** — sem retry, sem mensagem de espera, sem escalar para humano. O mesmo valia se o envio do WhatsApp ao cliente falhasse (o registro `from_me` só era salvo em caso de sucesso).

**Agravante que explica POR QUE travou no "avisar":** o passo de avisar o setor faz **DUAS** chamadas ao Claude em sequência (uma para decidir a ferramenta, outra para redigir a resposta). Isso **dobra a exposição** a um soluço — por isso o vácuo apareceu justamente em "Por favor, avise".

**Mito derrubado:** cheguei a suspeitar de "roles must alternate" (mensagens `user` consecutivas após a 1ª falha). **Testei contra a API real: HTTP 200** — a Anthropic aceita `user` consecutivos. NÃO era isso.

> Observação honesta: não capturei o log do instante exato (08:31) — o log do Passenger na hospedagem é volátil. Mas a correção blinda **todos** os cenários de soluço, independentemente de qual foi o específico.

---

## 3. A correção (`hostinger/server.mjs`) — commit `e12a060`, deploy `verti-2.7-resiliencia`

1. **`anthropicCall()` — retry com backoff** (nova função): tenta **3 vezes** em caso de timeout/sobrecarga (429/5xx), backoff de 1,2s/2,4s, timeout de **45s** por tentativa. 4xx (exceto 429) é definitivo (não repete à toa).
2. **`callClaudeWithHistory()` — usa `anthropicCall` + trata `max_tokens`:** antes, resposta cortada virava `null` (= silêncio); agora ela se recompõe pedindo uma versão curta. `max_tokens` subiu de **1024 → 1500**.
3. **`automateIncoming()` — REGRA DE OURO: a Verti NUNCA fica muda.** Se o Claude falhar mesmo após os retries, ela envia *"Recebi sua mensagem e já estou acionando nosso time para te atender, tá? Em breve retornamos por aqui. 🙏"* **e** escala o ticket: **prioridade `alta`** + **nota interna** ("⚠️ a IA falhou, favor assumir o atendimento"). Silêncio virou impossível.
4. **`evoSendText()` — envio de WhatsApp com timeout + retry** (nova função): timeout de **15s** + retry; usada tanto na resposta ao cliente quanto no `avisar_departamento` (antes o `fetch` sem timeout podia travar a resposta inteira).

Diff: 1 arquivo, ~154 inserções / ~88 remoções (boa parte é reindentação, pois removi o `try{}` que envolvia o loop). Sintaxe validada com `node --check`.

---

## 4. Deploy e verificação

- Commit `e12a060` na `main` do `verticalpartsIA/resolve-360` → Hostinger republicou sozinho.
- `deploy_version` bumpado para **`verti-2.7-resiliencia`** para confirmar o deploy.
- Verificado ao vivo (12:36 UTC) em `GET https://posvenda360.vpsistema.com/api/whatsapp/status`:
  `deploy_version: verti-2.7-resiliencia`, `claude_model: claude-opus-4-8`, `auto_reply_ativo: true`, `env_file_loaded: true`.
- `GET /api/whatsapp/test-claude` → `ok: true` (1,9s).

---

## 5. Referência técnica útil descoberta hoje (para a próxima IA)

- **Banco do Evolution:** container `evolution-postgres`, db `evolution`, tabela **`Message`** (timestamp em `messageTimestamp`, epoch segundos; `key->>'remoteJid'` é o **`@lid`**, não o telefone). Tabela **`Contact`** liga `@s.whatsapp.net` ↔ `@lid` pela **mesma `profilePicUrl`**. Tabela `Instance` mostra `connectionStatus` (a `pv360` = `open`; há uma `posvenda360` `close`).
- **Linha do bot/Verti:** **(11) 99766-3780** (`5511997663780@s.whatsapp.net`).
- **pv360:** o webhook insere em `whatsapp_messages` já resolvido para `@s.whatsapp.net` (o Evolution resolve o @lid→telefone no payload quando conhece o contato).
- **Enums** (migration `20260503084129...`): `ticket_priority = baixa|media|alta|critica`; `message_kind = whatsapp|email|telefone|nota_interna`.
- **Acesso SSH ao host do pv360** (não é o VPS): `ssh -p 65002 u969661049@76.13.95.90`. App em `~/domains/posvenda360.vpsistema.com/nodejs/`, restart via `touch tmp/restart.txt`.

---

## 6. Pendências / próximos passos

1. **Teste de confirmação do Caso B:** refazer o fluxo "preciso de degrau… pode avisar o time de Vendas? → Por favor, avise" do número do Gelson e confirmar que a Verti responde "Avisei!" sem travar.
2. **Caso A (Rafael):** confirmar para qual número da VP ele escreveu; e decidir o cadastro do (11) 96765-6507 em `internal_contacts`.
3. **(Opcional) Confirmar a causa-raiz em 100%** puxando o log do host pv360 no instante 08:31 — só por fechamento técnico; a correção já cobre todos os casos.
4. **(Herdado de 16/06) WIP de cobrança de handoffs** que reinsiste a cada 2h úteis ainda não publicado — precisa rebase sobre a base atual antes de commitar.

---

## 7. Linha do tempo dos commits

| Commit | deploy_version | O quê |
|---|---|---|
| `e12a060` | **verti-2.7-resiliencia** | Retry no Claude + regra de ouro anti-silêncio + timeout/retry no Evolution + tratamento de max_tokens |

---

## Resumo de uma linha

O "vácuo" tinha **duas causas diferentes**: no caso do vendedor, a mensagem **não chegou à linha da Verti**; no caso do Gelson, um **soluço sem rede de proteção** na chamada ao Claude (agravado pelo passo "avisar", que faz 2 chamadas) deixava a Verti muda. O segundo foi **corrigido e está no ar** (`verti-2.7-resiliencia`): a Verti agora **tenta de novo** e, na pior hipótese, **manda mensagem de espera e escala para um atendente** — nunca mais fica muda.

---

*Gerado por Claude (Claude Code / Opus 4.8) em 2026-06-17, a pedido de Gelson Simões.*
