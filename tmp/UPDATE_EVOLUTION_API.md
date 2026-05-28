# Missão: Atualizar Evolution API para suporte a @lid

Você é o Claude Code rodando na VPS da VerticalParts (72.61.48.156).
Execute os passos abaixo em ordem. Pare e relate se qualquer passo falhar.

---

## Contexto

- **Problema:** Evolution API v2.2.3 bloqueia envio para contatos `@lid` no endpoint HTTP
- **Solução:** Atualizar para a versão mais recente que tem suporte nativo a @lid
- **Containers relevantes:**
  - `evolution-api` (porta 8080) → instância principal `pv360`
  - `evolution_api` (porta 8081) → instância secundária
- **NÃO mexa em:** `n8n`, `postgres`, `redis`, `traefik`, `hermes-agent`

---

## Passo 1 — Diagnóstico (só leitura, sem riscos)

```bash
# Versão atual
curl -s http://localhost:8080/ | python3 -m json.tool

# Imagem em uso
docker inspect evolution-api --format 'Imagem: {{.Config.Image}}'
docker inspect evolution_api --format 'Imagem: {{.Config.Image}}'

# Localiza o docker-compose
find /root /home /opt /srv -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null | head -20

# Mostra o docker-compose encontrado (substitua o caminho)
cat $(find /root /home /opt /srv -name "docker-compose.yml" 2>/dev/null | head -1)
```

**Anote:** caminho do docker-compose e nome exato da imagem antes de continuar.

---

## Passo 2 — Verifica versão mais nova disponível

```bash
# Verifica tags disponíveis no Docker Hub
curl -s "https://hub.docker.com/v2/repositories/atendai/evolution-api/tags?page_size=10" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
tags = [(t['name'], t['last_updated'][:10]) for t in d.get('results', [])]
for name, date in tags:
    print(f'  {date}  {name}')
"
```

Se existir versão 2.3+ ou `latest` mais nova que 2.2.3, prossiga.

---

## Passo 3 — Backup da configuração atual

```bash
# Salva configuração do container atual
docker inspect evolution-api > /root/evolution-api-backup-$(date +%Y%m%d).json

# Anota variáveis de ambiente
docker inspect evolution-api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  > /root/evolution-api-env-backup-$(date +%Y%m%d).txt

cat /root/evolution-api-env-backup-$(date +%Y%m%d).txt
```

---

## Passo 4 — Puxa a imagem nova (sem derrubar nada ainda)

```bash
docker pull atendai/evolution-api:latest
```

Aguarde o download completar. Se demorar muito, verifique conectividade:
```bash
curl -s https://hub.docker.com --max-time 5 -o /dev/null -w "%{http_code}"
```

---

## Passo 5 — Atualiza o container `evolution-api` (porta 8080)

Substitua `CAMINHO_DO_COMPOSE` pelo caminho encontrado no Passo 1.

```bash
cd CAMINHO_DO_COMPOSE

# Atualiza só o evolution-api, sem tocar nos outros serviços
docker compose pull evolution-api
docker compose up -d --no-deps --force-recreate evolution-api

# Aguarda 10 segundos para subir
sleep 10

# Verifica se está rodando
docker ps --filter name=evolution-api --format "{{.Names}} | {{.Status}} | {{.Image}}"

# Confirma nova versão
curl -s http://localhost:8080/ | python3 -m json.tool
```

---

## Passo 6 — Verifica se instância pv360 continua conectada

```bash
curl -s http://localhost:8080/instance/connectionState/pv360 \
  -H "apikey: suporte123" | python3 -m json.tool
```

**Esperado:** `"state": "open"`

Se retornar `close` ou `connecting`, aguarde 30 segundos e teste novamente.
Se continuar desconectado após 2 minutos, execute o rollback (Passo 8).

---

## Passo 7 — Testa envio para contato @lid (o teste crítico)

```bash
# Usa o @lid de teste do Gelson
curl -s --max-time 30 \
  http://localhost:8080/message/sendText/pv360 \
  -H "apikey: suporte123" \
  -H "Content-Type: application/json" \
  -d '{"number":"140141192568976@lid","text":"[teste auto-reply @lid - Evolution API atualizada]"}' \
  | python3 -m json.tool
```

**Sucesso:** resposta com `"status": "PENDING"` ou `"key"` com `remoteJid`
**Falha:** resposta com `"exists": false` → a versão nova não resolveu, execute rollback

---

## Passo 8 — Rollback (SE necessário)

Só execute se algo deu errado nos passos anteriores:

```bash
cd CAMINHO_DO_COMPOSE

# Volta para versão específica conhecida
docker compose down evolution-api
docker pull atendai/evolution-api:v2.2.3
# Edita o docker-compose.yml para usar a tag v2.2.3 em vez de latest
sed -i 's|atendai/evolution-api:latest|atendai/evolution-api:v2.2.3|g' docker-compose.yml
docker compose up -d evolution-api

# Verifica
sleep 10
curl -s http://localhost:8080/instance/connectionState/pv360 \
  -H "apikey: suporte123"
```

---

## Passo 9 — Reportar resultado

Após executar, relate:
1. Versão anterior e versão nova instalada
2. Resultado do Passo 6 (estado da conexão pv360)
3. Resultado do Passo 7 (teste @lid) — cole a resposta JSON completa
4. Qualquer erro encontrado

---

## Notas de segurança

- Os dados do WhatsApp ficam no volume Docker, não na imagem — atualizar não perde histórico
- O webhook do Hostinger continuará apontando para o mesmo endpoint
- A instância `pv360` se reconecta automaticamente após restart do container
- Se o QR code aparecer após restart, é preciso escanear novamente — mas isso é raro em updates normais
