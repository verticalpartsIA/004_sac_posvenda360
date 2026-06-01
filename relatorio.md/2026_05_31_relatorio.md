# RELATÓRIO — Auto-atendimento WhatsApp do Pós-Venda 360 (Hermes do app)

**Data:** 2026-05-31 (madrugada de 01/06)
**Autor:** Claude (Claude Code) a pedido de Gelson Simões
**Objetivo da sessão:** fazer com que toda mensagem recebida no WhatsApp do Pós-Venda 360
crie um ticket automaticamente E a IA ("Hermes" do app) responda o cliente — e deixar o
atendente de IA mais preparado (horários, feriados, anti-golpe, tom).

---

> ⚠️ **ATENÇÃO — NÃO CONFUNDIR OS DOIS "HERMES":** o "Hermes" tratado neste relatório é a **IA de
> auto-resposta do WhatsApp do Pós-Venda 360** (código do app `resolve-360`, em `hostinger/server.mjs`).
> Ele **NÃO é** o **Hermes do Telegram** (o agente CFO de finanças/Omie, no container
> `vpautomation-hermes`). São **dois sistemas totalmente diferentes** que apenas compartilham o nome.
> Detalhes na seção 1.

---

## 0. TL;DR — estado final

- ✅ **Fluxo completo no ar:** mensagem do cliente no WhatsApp → app cria **ticket** automático
  (`tickets`, status `aberto`) + grava a mensagem (`whatsapp_messages`) → **IA responde** o cliente
  pelo WhatsApp. **Sem n8n** — é nativo do app `resolve-360`.
- ✅ **Auto-reply ativado** em produção (`HERMES_AUTO_REPLY=true` + chave Anthropic) e testado
  (Claude respondeu em ~800ms).
- ✅ **WhatsApp reconectado** após uma longa saga: a causa raiz era o **Evolution rodando uma
  imagem antiga** (`atendai/evolution-api:homolog`) que não gerava QR. Atualizado para a imagem
  oficial nova **`evoapicloud/evolution-api:latest` (v2.3.7)** → QR voltou a funcionar, instância
  pareada (número +55 11 99766-3780), webhook configurado.
- 🟡 **Enriquecimento do prompt do atendente** (horários, feriados, anti-golpe, tom) — código
  pronto e testado localmente, **aguardando mais dados do Gelson antes do deploy**.

---

## 1. Esclarecimento importante — existem DOIS "Hermes"

| | Hermes CFO | "Hermes" do app (este relatório) |
|---|---|---|
| O que é | Agente autônomo no **Telegram**, CFO digital (finanças/Omie) | Módulo de **auto-resposta de WhatsApp** do app Pós-Venda 360 |
| Onde vive | Container `vpautomation-hermes` | Código `resolve-360` (`hostinger/server.mjs`) |
| Função | Responde perguntas financeiras | Atende clientes no pós-venda |

São sistemas diferentes que compartilham o nome. Este relatório trata do **segundo**.

---

## 2. Descobertas de ambiente

- **O Claude Code desta sessão roda DENTRO do próprio VPS** (`srv1510643`, 72.61.48.156). Logo,
  Docker/arquivos/serviços são acessíveis localmente — **não precisa (nem funciona bem) SSH**.
- **n8n** (`http://72.61.48.156:5678`, v2.21.7) está no ar e saudável, mas **vazio** (0 workflows,
  0 credenciais, owner não configurado). Não é usado no fluxo de atendimento.
- A automação pedida (ticket + resposta) **já existia pronta no app** — n8n não era necessário.

---

## 3. Arquitetura do fluxo (resolve-360)

- App **VP Pós-Venda 360** (`posvenda360.vpsistema.com`), hospedado na **hospedagem web Node do
  Hostinger** (server `hcdn`) — **não** no VPS. Deploy via **integração Git do Hostinger** (push →
  republica). O GitHub Actions `deploy-hostinger.yml` NÃO publica (passos FTP/SSH ficam `skipped`).
- Handler de produção: **`hostinger/server.mjs`**, rota `POST /api/whatsapp/webhook`. (A rota
  TanStack `/api/webhook/evolution` NÃO é a de produção — dá 404.)
- Fluxo: webhook recebe `messages.upsert` do Evolution → procura ticket aberto por
  `whatsapp_thread_id` → se não houver, cria ticket → grava em `whatsapp_messages` → dispara
  auto-reply (Claude) e responde via Evolution `sendText`.
- Supabase do projeto: `jkbklzlbhhfnamaeislb`.

---

## 4. Ativação do auto-reply

- O `server.mjs` lê de runtime: `ANTHROPIC_API_KEY`, `EVOLUTION_APIKEY`, `HERMES_AUTO_REPLY`,
  `HERMES_MODEL`, `NOTIFY_WEBHOOK_URL`, `SUPABASE_SERVICE_ROLE_KEY` (URL do Supabase é fixa no código).
- O `.env` é gitignored → foi gerado e **enviado manualmente para a pasta do app no Hostinger**:
  `HERMES_AUTO_REPLY=true`, `HERMES_MODEL=claude-haiku-4-5`, `ANTHROPIC_API_KEY` (chave reaproveitada
  do Hermes CFO), `EVOLUTION_APIKEY=suporte123`, `SUPABASE_SERVICE_ROLE_KEY`.
- Verificação: `GET /api/whatsapp/status` → `auto_reply_ativo: true`, `claude_key_set: true`,
  `env_file_loaded: true`. `GET /api/whatsapp/test-claude` → `ok: true`.

---

## 5. A saga do WhatsApp / Evolution (causa raiz e conserto)

**Sintoma:** instância `pv360` desconectada desde ~11/05 (logout 401), presa em `connecting`,
nunca gerando QR nem código de pareamento.

**O que foi tentado e descartado:** logout + reconnect; restart da instância; restart do container;
deletar e recriar a instância; com proxy e sem proxy. Confirmado que rede (HTTP 200 ao WhatsApp) e
proxy (DataImpulse, IP residencial BR) estavam OK. Testado também o container limpo da 8081
(`v2.2.3`): **também não gerava QR**.

**Causa raiz:** o container de produção (porta **8080**, `/docker/evolution-api/`) rodava a imagem
**antiga `atendai/evolution-api:homolog`** (build de teste, Baileys desatualizado). O WhatsApp
recusava o handshake antes de emitir o QR.

**Conserto:**
1. Backup do compose (`docker-compose.yml.bak-*`).
2. Troca da imagem para a oficial nova **`evoapicloud/evolution-api:latest`** (v2.3.7) e recriação
   do container (`docker compose up -d`).
3. Instância `pv360` recriada já gerou QR normalmente. Proxy DataImpulse re-aplicado.
4. QR servido ao Gelson via página web temporária → **pareado com sucesso** (estado `open`,
   número 5511997663780).
5. Webhook configurado: `POST /webhook/set/pv360` → `https://posvenda360.vpsistema.com/api/whatsapp/webhook`,
   header `apikey: suporte123`, evento `MESSAGES_UPSERT`.

**Lição:** instância Evolution presa em `connecting` sem gerar QR (`count:0`), com rede/proxy OK
→ suspeitar de **imagem/Baileys desatualizado**; atualizar para `evoapicloud/evolution-api:latest`.

---

## 6. Enriquecimento do atendente de IA (PRONTO, aguardando deploy)

Alterações já feitas e testadas localmente em `hostinger/server.mjs` (ainda **não** commitadas/deployadas,
pois o Gelson vai passar mais dados de conhecimento antes):

- **Consciência de data/hora** (fuso America/Sao_Paulo): o prompt agora injeta um bloco
  "CONTEXTO DE HOJE" — sabe a data/hora atual e se está dentro do horário.
- **Horários:** Seg–Qui 07h–18h · Sex 07h–17h · fechado fim de semana/feriados. Fora do horário,
  o atendente continua ajudando mas avisa o prazo de retorno (sem prometer retorno humano imediato).
- **Feriados** (calculados automaticamente todo ano, incl. móveis via Páscoa/Computus): Nacionais +
  Estadual de SP (09/07) + Municipais de Guarulhos (08/12 aniversário). Validado: Corpus Christi
  2026 = 04/06; Carnaval 16-17/02; Sexta-feira Santa 03/04.
- **Anti-golpe:** nunca pede senha/cartão/CVV; VP nunca cobra por link no WhatsApp nem PIX p/ PF;
  orienta o cliente a não pagar cobranças suspeitas e escala como possível golpe.
- **Tom (de-escalonamento):** acolhe o sentimento antes de resolver, não culpa/discute com o cliente,
  evita respostas robóticas, e em casos delicados pede desculpas e aciona a equipe.

---

## 7. Credenciais/end-points úteis (para a próxima etapa)

- Evolution (8080): key `suporte123` · Manager `http://72.61.48.156:8080/manager` · instância `pv360`.
- Diagnóstico do app: `GET https://posvenda360.vpsistema.com/api/whatsapp/status` e `/api/whatsapp/test-claude`.
- Supabase pv360: `jkbklzlbhhfnamaeislb`. Tabelas: `tickets`, `whatsapp_messages`.
- Deploy do app: push na `main` do `verticalpartsIA/resolve-360` → Hostinger republica.

---

## 8. Pendências / próximos passos

- [ ] Receber do Gelson os **conhecimentos adicionais do Hermes** (em andamento) e então fazer o
      deploy do prompt enriquecido.
- [ ] Teste real ponta a ponta: enviar WhatsApp de outro número → conferir ticket criado + resposta.
- [ ] Versionar/guardar o `docker-compose.yml` novo do Evolution (`evoapicloud`) para não regredir
      ao `homolog` em futuro deploy.
- [ ] (Opcional) Considerar mover o "conhecimento" do atendente para uma base editável sem deploy
      (tabela no Supabase) no futuro.

---

*Gerado por Claude (Claude Code) em 2026-05-31/06-01, a pedido de Gelson Simões.*
