# RELATÓRIO — pv360/Verti: Áudio, Claude puro (Opus), Colaboradores internos e Omie ao vivo

**Data:** 2026-06-15
**Autor:** Claude (Claude Code) a pedido de Gelson Simões
**Escopo:** (1) consertar o bot do Telegram (modelo indisponível); (2) fazer a atendente **Verti**
do pv360 **ouvir áudios** de clientes e responder em texto; (3) remover o "naming Hermes" e migrar
para **Claude Opus**; (4) ajuste de tom ("nossos atendentes"); (5) reconhecer **colaboradores
internos** e consultar **pedidos no Omie em tempo real**.
**Relatórios anteriores:** `2026_06_11_relatorio.md`, `2026_06_11_v1_relatorio.md`,
`../2026_06_12_relatorio.md` (SAC v2, Poka-Yoke, Audit Log).

---

> ⚠️ **DOIS SISTEMAS DIFERENTES tocados neste dia:**
> 1. **Ponte Telegram↔Claude** — bot do Telegram em `/root/telegram-claude/` no VPS (NÃO faz parte
>    do repo `resolve-360`). É o canal interno do Gelson/Diego falarem com o Claude.
> 2. **pv360 / "Verti"** — atendente de **WhatsApp** do Pós-Venda 360 (este repo, `hostinger/server.mjs`).
>
> "Hermes" era só **nome legado de código** no pv360 (módulo de auto-reply) — NÃO é o agente CFO do
> Telegram. Neste dia o naming "Hermes" do pv360 foi removido (ver §5).

---

## 0. TL;DR — estado final

| Frente | Resultado |
|---|---|
| Bot Telegram | Estava **mudo** o dia todo. Causa: modelo fixo `claude-fable-5`, **indisponível para chamadas headless**. Trocado para **Opus 4.8**. No ar. |
| Verti ouve áudio | ✅ Transcrição **local** (faster-whisper no VPS) → Verti responde **em texto** começando com `🎙️ Entendi seu áudio: "..."`. Testado de ponta a ponta. |
| Modelo da Verti | **claude-haiku-4-5 → claude-opus-4-8** (respostas muito melhores). |
| "Hermes" removido | naming migrado para Claude (env, arquivo, logs); persona ao cliente segue **Verti**. |
| Tom | "equipe humana" → **"nossos atendentes"** (soava robótico/frio). |
| Colaboradores internos | 30 números reconhecidos como **equipe** (sem pedir CNPJ); podem perguntar sobre pedidos. |
| Omie ao vivo | nova ferramenta `consultar_pedido_ao_vivo` → consulta **direto no Omie**, dado fresco. |
| Durabilidade | Opus + chave do STT fixados como **default no código** (o `.env` é apagado no republish). |

Deploys do pv360 neste dia: **`verti-1.4-audio` → `verti-1.5-audio` → `verti-1.6-internos-omie`**.

---

## 1. Conserto do bot do Telegram (fora deste repo)

- **Sintoma:** durante 14–15/06 a ponte do Telegram não respondia; logs com `claude rc=1` (saída vazia).
- **Causa-raiz:** `/root/telegram-claude/bridge.py` tinha `MODEL = 'claude-fable-5'`. Reproduzido na
  mão: `claude -p --model claude-fable-5` retorna `is_error:true` + *"Claude Fable 5 is currently
  unavailable"* (acesso **headless** ao Fable 5 bloqueado). A sessão **interativa** do Fable 5 funciona —
  por isso o Claude Code seguia OK, mas o bot (que usa `claude -p`) quebrava.
- **Correção:** `MODEL = 'claude-opus-4-8'` + `systemctl restart telegram-claude.service`. Opus 4.8 e
  Sonnet 4.6 testados OK no headless; Gelson escolheu Opus.
- **Lição:** se a ponte ficar muda com `claude rc=1`, checar disponibilidade do modelo em headless
  (`claude -p --model X --output-format json`).

## 2. Verti passa a OUVIR áudio (e responder em texto)

**Objetivo do Gelson:** clientes mandam áudio no WhatsApp; a Verti deve **entender** e responder
**em texto** (sem voz de volta), dizendo que entendeu o áudio.

**Por que precisou de serviço externo:** a API da Anthropic **não aceita áudio** como entrada. A
transcrição (STT) tem que ser feita fora — escolhido **open-source local no VPS** (faster-whisper),
alinhado à diretriz "100% Claude; lacunas = open source local".

**Fluxo implementado** (`hostinger/server.mjs`):
```
Cliente manda voz no WhatsApp
 → Evolution (webhookBase64=true) envia o áudio em base64 no webhook
   → server.mjs detecta audioMessage  → automateIncoming(isAudio=true, data)
     → transcreverAudio(data): pega data.message.base64 (fallback getBase64FromMediaMessage)
       → POST http://72.61.48.156:8090/transcribe (serviço STT no VPS) → texto pt-BR
         → grava o texto como corpo da msg no banco (histórico + ticket corretos)
           → Claude (Opus) responde; server prefixa: 🎙️ Entendi seu áudio: "<transcrição>"
```
- A transcrição roda **depois do `200 OK`** do webhook (não bloqueia a Evolution).
- Funções novas: `transcreverAudio(data)`; `automateIncoming` ganhou `isAudio`/`data` e o prefixo
  de reconhecimento; webhook passa `mediaType==="audio"` adiante.
- **Teste real (Gelson):** áudio "Olá Verti, tudo bem? Está no ar?" → log
  `[stt] transcrito (5636ms)` → `[automate] ✅ Claude respondeu ... "🎙️ Entendi seu áudio: ..."`.
  Round-trip ~11s. O campo `data.message.base64` funcionou de primeira (sem precisar do fallback).

## 3. Serviço de transcrição (STT) no VPS — `/root/stt-service/` (fora deste repo)

- **Arquivos:** `stt.py` (HTTP stdlib + faster-whisper), `.env` (apikey), `stt-service.service` (systemd).
- **Porta:** 8090 (0.0.0.0). **Modelo:** faster-whisper `small` int8 CPU, `language=pt`, `vad_filter`.
  Reusa o `venv` de `/root/telegram-claude`. Aquece no boot.
- **Endpoint:** `POST /transcribe` (header `apikey`, JSON `{audio_base64, ext}`) → `{ok, text, ms}`;
  `GET /health`.
- **Dicionário de contexto (initial_prompt):** enviesa o whisper p/ os termos da VerticalParts
  (Verti, BST/Monarch/Fermator, nota fiscal, pedido…). Antes ouvia "Verti" como "Verdes"; corrigido.
- **Recursos:** VPS tem 15 GB RAM (folga); custo zero por uso. Conectividade host pv360 → VPS:8090
  confirmada (ufw inativo).

## 4. Modelo: Haiku → Opus

- Antes a Verti rodava em **`claude-haiku-4-5`** (modelo mais fraco) → respostas rasas, "robóticas".
- Agora **`claude-opus-4-8`**. (Fable 5 está indisponível p/ headless; Opus é o topo disponível.)

## 5. Remoção do "naming Hermes" (Claude puro)

O cliente **nunca viu** "Hermes" (a persona sempre foi **Verti**). "Hermes" era só interno:
- `src/lib/hermes.ts` → **`src/lib/claude-reply.ts`**; `autoReplyWithHermes` → **`autoReplyWithClaude`**.
- `src/routes/api/webhook/evolution.ts` atualizado (import + chamada). *(Obs.: a rota TanStack é de dev;
  produção usa `hostinger/server.mjs`.)*
- Env: `HERMES_MODEL` → **`CLAUDE_MODEL`**, `HERMES_AUTO_REPLY` → **`CLAUDE_AUTO_REPLY`** (com fallback
  para os nomes antigos). Logs `[hermes]` → `[claude]`.

## 6. Tom: "equipe humana" → "nossos atendentes"

- Feedback do Gelson: a resposta com "equipe humana" parecia que "um alienígena atendeu".
- Trocado no `CLAUDE_BASE_PROMPT` e no contexto de horário/feriado (`atendimentoContexto`): agora usa
  **"nossos atendentes"/"nossa equipe"**, com **regra explícita proibindo** a expressão "equipe humana".
- Deploy `verti-1.5-audio`.

## 7. Colaboradores internos + consulta ao Omie em tempo real (`verti-1.6`)

**Reconhecimento de internos** — `INTERNAL_CONTACTS` reescrito com o **roster oficial (30 colaboradores)**
passado pelo Gelson (nome, cargo, depto, celular DDD+número). Quando um desses números fala com a Verti:
- é tratado como **EQUIPE** (não cliente): saudação pelo nome, **sem pedir CNPJ**, sem trava de validação;
- pode perguntar sobre **qualquer pedido/venda** (andamento, faturamento, se já saiu, previsão).
- Correções de cadastro: Diego (CEO) estava com número antigo; Bianca estava como "Jurídico" (é Compras);
  "Maria Fernanda/limpeza" era na verdade **Fernanda Freires (TI)**.
- **Importante:** a linha **(11) 99766-3780** (antes registrada como "Gelson") **NÃO é mais do Gelson** —
  é a **linha do bot na Evolution/WhatsApp**, hoje operada pela atendente de pós-venda **Jéssica**. Foi
  **removida** do mapa de internos. O número pessoal do Gelson agora é **(12) 99200-4047**.

**Ferramenta nova `consultar_pedido_ao_vivo`** (em `ATENDENTE_TOOLS` + `execAtendenteTool`):
- Reaproveita `omieCall("produtos/pedido", "ConsultarPedido", {numero_pedido})` — **dado fresco do Omie**,
  em vez do espelho Supabase (a pedido do Gelson: "buscar na fonte, a resposta é fresca").
- Retorna: `numero_pedido, codigo_pedido, cliente (via ConsultarCliente), codigo_cliente, etapa +
  etapa_descricao, bloqueado, data_previsao, valor_total, quantidade_itens, codigo_vendedor (codVend)`.
- **Sem trava de cliente** (internos são confiáveis; a trava existe p/ cliente externo).
- Disponível **só para internos** (a Verti é instruída a NÃO usá-la com cliente externo).
- API Omie ao vivo validada: 25.870 pedidos; `ConsultarPedido` por `numero_pedido` funciona.

## 8. Durabilidade da configuração (lição importante de deploy)

- O **`nodejs/.env`** (gitignored) **NÃO sobrevive** ao republish do Hostinger — é apagado no deploy.
- Portanto, **`CLAUDE_MODEL=claude-opus-4-8`** e a **chave do STT** foram fixados como **default no
  código** (`hostinger/server.mjs`) — mesmo padrão dos demais segredos já hardcoded no repo (privado).
- `CLAUDE_MODEL` **não cai mais** para `HERMES_MODEL` (que no painel = haiku). Assim Opus + áudio
  permanecem ativos sem depender de `.env` nem do painel.
- (Permanente ideal no futuro: mover esses valores p/ as variáveis de ambiente do app no hPanel.)

## 9. Mecânica de deploy e operação (para a próxima IA)

- **Repo:** `verticalpartsIA/resolve-360` (privado). Produção do pv360 = `hostinger/server.mjs`
  (Node puro, independente do build TanStack/React).
- **Onde roda:** hospedagem Node do Hostinger (**não** é o VPS). App em
  `~/domains/posvenda360.vpsistema.com/nodejs/`, servido por **Passenger** (LiteSpeed), startup
  `hostinger/server.mjs`. Acesso por SSH (porta 65002, usuário `u969661049`).
- **Deploy usado (determinístico):** `git push origin main` →, no host via SSH:
  `git fetch <repo> main && git reset --hard FETCH_HEAD && touch tmp/restart.txt`
  (`tmp/restart.txt` reinicia o Passenger). O Hostinger também republica sozinho no push.
- **Verificação:** `GET https://posvenda360.vpsistema.com/api/whatsapp/status` →
  `deploy_version`, `claude_model`, `auto_reply_ativo`, `stt_apikey_set`.
- **Env real do app:** vem do Passenger/painel **e** de um loader de `nodejs/.env` no próprio app
  (loga `[env] Carregado`). ⚠️ o `~/.env` do **home** NÃO é a fonte do app (tem valores divergentes).
- Credenciais (SSH, tokens, chaves) **não** estão neste relatório de propósito — ver memória/.env seguros.

## 10. Linha do tempo dos commits (`main`)

| Commit | deploy_version | O quê |
|---|---|---|
| `6164bea` | verti-1.4-audio | Ouvir áudio (STT) + Claude puro + Opus + loader .env |
| `0562868` | verti-1.5-audio | "equipe humana" → "nossos atendentes" |
| `a9a54d6` | verti-1.6-internos-omie | Roster de internos + `consultar_pedido_ao_vivo` (Omie ao vivo) |
| `3e61aea` | (1.6) | Defaults duráveis (Opus + STT no código) |
| `d9d0e34` | (1.6) | Cadastra nº pessoal do Gelson (12) 99200-4047 como interno |

## 11. Pendências / próximos passos

1. **Legenda de etapas do Omie** — falta o Gelson confirmar o significado das etapas desta conta
   (vistas: `00`, `10`, `60`, `70`). Hoje há um mapa **provisório** (`70`=faturado, `00/10`=aberto,
   `60`=a faturar) marcado como "a confirmar". O espelho `omie_orders` tem `status=None` (não ajuda).
2. **Escopo do acesso interno** — hoje **qualquer interno vê qualquer pedido**. Definir se deve
   **restringir cada vendedor aos pedidos dele** (pelo `codVend`) ou manter acesso livre de equipe.
3. **Teste real de interno** — validar de um número interno (ex.: (12) 99200-4047 do Gelson) que a
   Verti reconhece como equipe e puxa o pedido ao vivo (`[claude] tool consultar_pedido_ao_vivo`).
4. **Expandir consultas internas** com base no service-list do Omie
   (https://developer.omie.com.br/service-list/): situação de NF, separação/expedição etc.
5. (Opcional) mover Opus/STT/segredos para as variáveis de ambiente do app no hPanel (durável e limpo).

## 12. Arquivos criados/alterados

**Repo `resolve-360`:**
- `hostinger/server.mjs` — loader de `.env`; `transcreverAudio`; áudio no `automateIncoming`;
  `consultar_pedido_ao_vivo` (tool + executor); `INTERNAL_CONTACTS` (roster); contexto de interno;
  defaults Opus/STT; tom "nossos atendentes"; `deploy_version`.
- `src/lib/hermes.ts` → `src/lib/claude-reply.ts` (renomeado, símbolos/logs/env atualizados).
- `src/routes/api/webhook/evolution.ts` — import/chamada renomeados.
- `.gitignore` — ignora `deploy-pv360/` (pacote auxiliar local, não versionado).

**No VPS (fora do repo):**
- `/root/telegram-claude/bridge.py` — modelo Fable 5 → Opus 4.8.
- `/root/stt-service/` — serviço STT novo (`stt.py`, `.env`, systemd `stt-service.service`).
