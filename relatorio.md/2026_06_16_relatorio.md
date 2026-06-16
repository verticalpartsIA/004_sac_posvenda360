# RELATÓRIO — pv360/Verti: Contatos internos migrados para banco de dados (sem mais deploy)

**Data:** 2026-06-16
**Autor:** Claude (Claude Code) a pedido de Gelson Simões
**Escopo:** Tirar a lista de **colaboradores internos** de dentro do código (`INTERNAL_CONTACTS`
fixo no `server.mjs`) e movê-la para uma **tabela no Supabase** (`internal_contacts`), para que
adicionar/desligar/editar um interno passe a ser uma operação de banco — **sem precisar mexer no
código nem republicar o app**. Inclui o cadastro do 2º número do Gelson.
**Relatórios anteriores:** `2026_06_15_relatorio.md`, `2026_06_11_relatorio.md`,
`../2026_06_12_relatorio.md`.

---

> ℹ️ **Contexto:** até ontem (v1.x→v2.x) os colaboradores internos viviam num objeto
> `INTERNAL_CONTACTS` **hard-coded** em `hostinger/server.mjs`. Cada inclusão/alteração exigia
> editar o código, comitar e esperar o Hostinger republicar. A partir de hoje a **fonte da
> verdade é o banco**; o objeto no código virou apenas *fallback* de emergência.

---

## 0. TL;DR — estado final

| Frente | Resultado |
|---|---|
| Tabela no banco | ✅ `internal_contacts` criada e populada no Supabase pv360 (`jkbklzlbhhfnamaeislb`). **32 contatos**. |
| Segurança (RLS) | ✅ Row Level Security ligada — só o app (service_role) lê; ninguém acessa pela chave pública. |
| Leitura no app | ✅ A Verti lê da tabela com **cache de 5 min** (não consulta o banco a cada mensagem) + *fallback* no código se o banco falhar. |
| 2º número do Gelson | ✅ (11) 97476-9151 cadastrado como interno/**diretoria** (além do (12) 99200-4047). |
| Linha do bot | ✅ 11997663780 (linha do Evolution/atendente Jéssica) **não** está na lista — não se autorreconhece. |
| Deploy | ✅ No ar como **`verti-2.6-internos-db`** (validado ao vivo). |
| Gestão futura | ✅ Adicionar/desligar/editar interno = operação de banco — **sem deploy**. |

Deploys do pv360 neste dia: **`verti-2.5` → `verti-2.6-internos-db`**.

---

## 1. O que mudou e por quê

**Problema:** a lista de internos estava embutida no código (`INTERNAL_CONTACTS`). Toda vez que
um colaborador entrava, saía ou trocava de número, era preciso editar `server.mjs`, comitar e
republicar — fluxo lento e que dependia de mim (Claude) a cada vez.

**Solução:** mover os contatos para uma **tabela** no Supabase do pv360. O app passa a consultar a
tabela; o objeto antigo no código fica só como rede de segurança caso o banco esteja inacessível.

### Estrutura da tabela `internal_contacts`
| Coluna | Conteúdo |
|---|---|
| `phone` | DDD + número, **sem o 55** (ex.: `12992004047`) — é a chave de reconhecimento por telefone |
| `nome` | nome do colaborador |
| `cargo` | cargo |
| `dept` | departamento |
| `nivel` | nível de acesso (`diretoria` = vê tudo com sigilo; demais = equipe) |
| `ativo` | `true`/`false` — desligar alguém é só marcar `false` (preserva o histórico) |

---

## 2. Migração dos dados

- **32 contatos** migrados do código para a tabela (incluindo os **dois números do Gelson**).
- **Diretoria** (nível com sigilo total de faturamento/salários/total vendido — ver
  `feedback-verti-sigilo-faturamento-salarios`):
  - Diego Maeno (CEO) — 11934095836
  - Gelson Simões (Consultor Téc Estratégico) — **12992004047** e **11974769151**
  - Juliana (Diretoria) — 11974913360
- A linha do **bot** (11997663780, Evolution/atendente Jéssica) foi mantida **fora** da lista, de
  propósito, para a Verti não se autorreconhecer como interno.

---

## 3. Segurança

- **RLS (Row Level Security) ativada** na tabela: somente o app, usando a `service_role`, consegue
  ler. A chave pública (`anon`) **não** enxerga a tabela — os números dos colaboradores não vazam.
- Isso é coerente com o histórico do repo de evitar exposição de dados sensíveis em bundle público.

---

## 4. Código (commits do dia)

- `07e4e60` — **verti-2.5**: cadastra o 2º número do Gelson (11) 97476-9151 como interno/diretoria.
- `a9b3b10` — **verti-2.6**: `INTERNAL_CONTACTS` migrado para a tabela `internal_contacts`
  (leitura com cache de 5 min + *fallback* no código).
- Mudança no `hostinger/server.mjs`: a função que resolve "quem está falando" agora lê a tabela
  (com cache em memória de 5 min) em vez do objeto fixo; o objeto fixo permanece como *fallback*.

---

## 5. Validação ao vivo (pós-deploy)

Verificado em **2026-06-16 ~13:28 BRT**:

- `GET /api/whatsapp/status` → `deploy_version: "verti-2.6-internos-db"`, `claude_model:
  claude-opus-4-8`, `auto_reply_ativo: true`, `stt_url_set/stt_apikey_set: true`, `env_file_loaded:
  true`.
- Leitura direta na tabela (`internal_contacts`):
  - Contagem: **32** registros.
  - Diretoria: Diego, Gelson (2 números) e Juliana — todos `ativo: true`.
  - (12) 99200-4047 → reconhecido como **diretoria**, ativo.
  - 11997663780 (bot) → **ausente**, conforme esperado.

**Conclusão:** ao mandar mensagem de qualquer um dos números do Gelson, a Verti reconhece como
**diretoria** → trata como equipe (sem pedir CNPJ), libera consulta de qualquer pedido e **mantém o
sigilo** de faturamento/salários/total vendido.

---

## 6. Como gerenciar daqui pra frente (sem deploy)

A partir de agora, mexer em quem é interno **não precisa de código nem republish**. Basta pedir em
linguagem natural (ex. ao Claude):

- **Adicionar:** "adiciona o Fulano, vendedor, celular (11) 9xxxx-xxxx" → `INSERT` na tabela.
- **Desligar:** "desliga o Beltrano" → marca `ativo = false` (some do reconhecimento, histórico fica).
- **Editar:** "troca o número da Maria para ..." → `UPDATE`.

A mudança vale na próxima mensagem (no máximo **5 min**, por causa do cache de leitura).

---

## 7. Em andamento (NÃO publicado ainda)

Há trabalho **iniciado e ainda não comitado/deployado** no `server.mjs` local, sobre o sistema de
**cobrança de handoffs** (quando a Verti passa um atendimento a um responsável interno):

- Nova função `marcarHandoffsRespondidos`: quando o responsável **responde**, os handoffs dele são
  marcados como `respondido` → a Verti **para de cobrar**.
- Cobrança que **reinsiste**: em vez de cobrar uma vez só, reagenda a próxima cobrança a cada
  **+2h úteis** (com contador `cobrancas` e mensagem "lembrete (Nª vez)") até o responsável responder.

> ⚠️ Esse bloco está **apenas no working tree local**, **não** está no `verti-2.6` em produção.
> Fica registrado aqui para retomada — precisa de revisão, commit e deploy antes de valer.

---

## Resumo de uma linha

Os colaboradores internos saíram do código e foram para uma **tabela no banco** (`internal_contacts`,
32 contatos, RLS ligada, cache de 5 min, *fallback* no código), publicado como **`verti-2.6-internos-db`**
e validado ao vivo — gestão futura de internos passa a ser **sem deploy**.
