import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake do http.mjs: registra cada chamada de sbFetch (path/método/body) e responde
// conforme o padrão real da rota (busca de ticket aberto, criação de ticket,
// inserção de whatsapp_messages), sem tocar em rede/Supabase de verdade.
const { calls, state, resetMock } = vi.hoisted(() => {
  const calls = [];
  const state = { ticketSearchResult: [] };
  return {
    calls,
    state,
    resetMock: () => {
      calls.length = 0;
      state.ticketSearchResult = [];
    },
  };
});

vi.mock("../http.mjs", () => ({
  sbFetch: vi.fn((path, opts = {}) => {
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    if (path.startsWith("/rest/v1/tickets?") && method === "GET") {
      return Promise.resolve({ ok: true, json: async () => state.ticketSearchResult });
    }
    if (path === "/rest/v1/tickets" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => [{ id: "ticket-novo", code: "T-100" }],
      });
    }
    if (path === "/rest/v1/whatsapp_messages" && method === "POST") {
      return Promise.resolve({ ok: true, json: async () => [{ id: "wa-msg-1" }] });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }),
  readBody: vi.fn(async (req) => req.__body ?? ""),
  WH_APIKEY: () => "test-apikey",
  EVO_URL: "http://evo.test",
  SB_URL: "http://sb.test",
  SB_SERVICE_KEY: () => "sb-key",
  evoSendText: vi.fn(async () => ({ ok: true })),
  STT_URL: () => "http://stt.test",
  STT_APIKEY: () => "",
  ANTHROPIC_KEY: () => "",
  CLAUDE_MODEL: () => "claude-haiku",
  NOTIFY_URL: () => "",
}));

vi.mock("../ai/index.mjs", () => ({
  callClaudeWithHistory: vi.fn(async () => null),
  atendimentoContexto: () => "contexto de horário (teste)",
}));

const { evoSendText } = await import("../http.mjs");
const { callClaudeWithHistory } = await import("../ai/index.mjs");
const { extractBody, extractMediaType, handleWhatsappWebhook, automateIncoming } =
  await import("./index.mjs");

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : undefined;
    },
  };
}

function makeReq({ method = "POST", headers = {}, body } = {}) {
  return { method, headers, __body: body !== undefined ? JSON.stringify(body) : "" };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetMock();
  vi.clearAllMocks();
  delete process.env.CLAUDE_AUTO_REPLY;
  delete process.env.HERMES_AUTO_REPLY;
});

describe("extractBody", () => {
  it("extrai texto de mensagem simples e estendida", () => {
    expect(extractBody({ conversation: "oi" })).toBe("oi");
    expect(extractBody({ extendedTextMessage: { text: "oi 2" } })).toBe("oi 2");
  });

  it("usa marcador pra mídia sem legenda, e a legenda quando existe", () => {
    expect(extractBody({ imageMessage: {} })).toBe("[imagem]");
    expect(extractBody({ imageMessage: { caption: "olha isso" } })).toBe("olha isso");
    expect(extractBody({ videoMessage: {} })).toBe("[vídeo]");
    expect(extractBody({ audioMessage: {} })).toBe("[áudio]");
    expect(extractBody({ documentMessage: {} })).toBe("[documento]");
    expect(extractBody({ documentMessage: { fileName: "nota.pdf" } })).toBe(
      "[documento: nota.pdf]",
    );
  });

  it("retorna null para mensagem vazia/desconhecida", () => {
    expect(extractBody(null)).toBeNull();
    expect(extractBody({})).toBeNull();
  });
});

describe("extractMediaType", () => {
  it("identifica cada tipo de mídia e retorna null pra texto puro", () => {
    expect(extractMediaType({ imageMessage: {} })).toBe("image");
    expect(extractMediaType({ audioMessage: {} })).toBe("audio");
    expect(extractMediaType({ documentMessage: {} })).toBe("document");
    expect(extractMediaType({ conversation: "oi" })).toBeNull();
  });
});

describe("handleWhatsappWebhook", () => {
  it("GET responde health-check sem exigir apikey", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(makeReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejeita apikey inválida com 401", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(makeReq({ headers: { apikey: "errada" }, body: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it("ignora evento que não é messages.upsert", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(
      makeReq({ headers: { apikey: "test-apikey" }, body: { event: "connection.update" } }),
      res,
    );
    expect(res.body).toEqual({ ok: true, skipped: true });
  });

  it("ignora mensagem de grupo e broadcast de status", async () => {
    const grupo = makeRes();
    await handleWhatsappWebhook(
      makeReq({
        headers: { apikey: "test-apikey" },
        body: {
          event: "messages.upsert",
          data: { key: { remoteJid: "123-456@g.us" }, message: { conversation: "oi" } },
        },
      }),
      grupo,
    );
    expect(grupo.body).toEqual({ ok: true, skipped: "group_or_broadcast" });

    const broadcast = makeRes();
    await handleWhatsappWebhook(
      makeReq({
        headers: { apikey: "test-apikey" },
        body: {
          event: "messages.upsert",
          data: { key: { remoteJid: "status@broadcast" }, message: { conversation: "oi" } },
        },
      }),
      broadcast,
    );
    expect(broadcast.body).toEqual({ ok: true, skipped: "group_or_broadcast" });
  });

  it("ignora mensagem sem corpo nem mídia reconhecida", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(
      makeReq({
        headers: { apikey: "test-apikey" },
        body: {
          event: "messages.upsert",
          data: { key: { remoteJid: "5511999999999@s.whatsapp.net" }, message: {} },
        },
      }),
      res,
    );
    expect(res.body).toEqual({ ok: true, skipped: "no_body" });
  });

  it("salva a mensagem e dispara automação (busca de ticket aberto) para cliente externo", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(
      makeReq({
        headers: { apikey: "test-apikey" },
        body: {
          event: "messages.upsert",
          data: {
            key: { remoteJid: "5511999999999@s.whatsapp.net", id: "wamid-1" },
            pushName: "Cliente Teste",
            message: { conversation: "Preciso de ajuda" },
          },
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    await flush();

    const insertMsg = calls.find(
      (c) => c.path === "/rest/v1/whatsapp_messages" && c.method === "POST",
    );
    expect(insertMsg?.body).toMatchObject({
      remote_jid: "5511999999999@s.whatsapp.net",
      from_me: false,
      body: "Preciso de ajuda",
    });
    const ticketSearch = calls.find(
      (c) => c.path.startsWith("/rest/v1/tickets?") && c.method === "GET",
    );
    expect(ticketSearch).toBeTruthy();
  });

  it("NÃO dispara automação para mensagens enviadas por nós mesmos (fromMe)", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(
      makeReq({
        headers: { apikey: "test-apikey" },
        body: {
          event: "messages.upsert",
          data: {
            key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true },
            message: { conversation: "resposta nossa" },
          },
        },
      }),
      res,
    );
    await flush();
    expect(calls.find((c) => c.path.startsWith("/rest/v1/tickets?"))).toBeUndefined();
  });

  it("trata @lid (widget do site) como cliente externo também", async () => {
    const res = makeRes();
    await handleWhatsappWebhook(
      makeReq({
        headers: { apikey: "test-apikey" },
        body: {
          event: "messages.upsert",
          data: {
            key: { remoteJid: "184920392922@lid" },
            message: { conversation: "oi via site" },
          },
        },
      }),
      res,
    );
    await flush();
    expect(calls.find((c) => c.path.startsWith("/rest/v1/tickets?"))).toBeTruthy();
  });
});

describe("automateIncoming", () => {
  it("cria ticket novo quando não há nenhum ticket aberto pra essa thread", async () => {
    state.ticketSearchResult = [];
    await automateIncoming({
      remoteJid: "5511999999999@s.whatsapp.net",
      pushName: "Cliente Teste",
      displayBody: "Olá, preciso de suporte",
      insertedId: "wa-1",
    });

    const createCall = calls.find((c) => c.path === "/rest/v1/tickets" && c.method === "POST");
    expect(createCall?.body).toMatchObject({
      customer: "Cliente Teste",
      customer_telefone: "5511999999999",
      channel: "whatsapp",
      status: "aberto",
      priority: "media",
      whatsapp_thread_id: "5511999999999@s.whatsapp.net",
    });
  });

  it("reaproveita ticket aberto existente em vez de criar outro", async () => {
    state.ticketSearchResult = [{ id: "ticket-existente", code: "T-1" }];
    await automateIncoming({
      remoteJid: "5511999999999@s.whatsapp.net",
      pushName: "Cliente Teste",
      displayBody: "Mais uma mensagem",
      insertedId: "wa-2",
    });

    expect(calls.find((c) => c.path === "/rest/v1/tickets" && c.method === "POST")).toBeUndefined();
    const linkMsg = calls.find((c) => c.path === "/rest/v1/ticket_messages" && c.method === "POST");
    expect(linkMsg?.body).toMatchObject({ ticket_id: "ticket-existente" });
  });

  it("NÃO chama o Claude nem envia WhatsApp quando a auto-resposta está desligada (padrão)", async () => {
    state.ticketSearchResult = [];
    await automateIncoming({
      remoteJid: "5511999999999@s.whatsapp.net",
      pushName: "Cliente Teste",
      displayBody: "oi",
      insertedId: "wa-3",
    });

    expect(callClaudeWithHistory).not.toHaveBeenCalled();
    expect(evoSendText).not.toHaveBeenCalled();
  });

  it("com auto-resposta ligada e Claude indisponível: usa fallback fixo e escala o ticket (sem IA real)", async () => {
    process.env.CLAUDE_AUTO_REPLY = "true";
    state.ticketSearchResult = [];
    await automateIncoming({
      remoteJid: "5511999999999@s.whatsapp.net",
      pushName: "Cliente Teste",
      displayBody: "oi",
      insertedId: "wa-4",
    });

    expect(callClaudeWithHistory).toHaveBeenCalledWith("5511999999999@s.whatsapp.net");
    expect(evoSendText).toHaveBeenCalledWith(
      "5511999999999",
      expect.stringContaining("já estou acionando nosso time"),
    );
    const escalonamento = calls.find(
      (c) => c.path === "/rest/v1/tickets?id=eq.ticket-novo" && c.method === "PATCH",
    );
    expect(escalonamento?.body).toMatchObject({ priority: "alta" });
    const notaInterna = calls.find(
      (c) =>
        c.path === "/rest/v1/ticket_messages" &&
        c.method === "POST" &&
        c.body?.kind === "nota_interna",
    );
    expect(notaInterna).toBeTruthy();
  });
});
