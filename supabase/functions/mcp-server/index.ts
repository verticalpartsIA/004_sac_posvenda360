import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─── Servidor MCP remoto do VP Pós-Venda 360 ───────────────────────────────
// Expõe o sistema de ocorrências (RO), tickets internos, notas fiscais e
// pesquisas de satisfação como ferramentas MCP para que o Claude (claude.ai /
// Claude Code) possa consultar e operar via um "conector personalizado"
// (Streamable HTTP transport).
//
// Autenticação: chave compartilhada, aceita via header Authorization: Bearer
// <token> OU via query string ?key=<token>. O modo query permite embutir a
// credencial direto na URL do conector do claude.ai — necessário porque o
// domínio compartilhado *.supabase.co aplica CSP sandbox em HTML servido por
// Edge Functions, o que impede qualquer tela de login OAuth de funcionar.
// Sem tela de login, sem OAuth: a primeira requisição já chega autenticada.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "posvenda360-mcp", version: "1.0.0" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

function jsonResponse(body: unknown, status = 200) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(new TextEncoder().encode(JSON.stringify(body)), { status, headers });
}

// ─── Acesso a dados (PostgREST via service_role) ───────────────────────────

async function supabaseRest<T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PATCH" | "DELETE" | "HEAD"; body?: unknown; headers?: Record<string, string> },
): Promise<{ data: T; count: number }> {
  const method = options?.method || "GET";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Supabase respondeu com status ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch {
      // texto simples, mantém message
    }
    throw new Error(message);
  }

  const contentRange = response.headers.get("content-range");
  const count = contentRange ? Number(contentRange.split("/")[1]) || 0 : 0;

  if (method === "HEAD" || response.status === 204) {
    return { data: null as T, count };
  }

  const text = await response.text();
  if (!text) return { data: null as T, count };
  return { data: JSON.parse(text) as T, count };
}

// ─── Autenticação por chave compartilhada (hash em mcp_api_keys) ──────────

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isAuthorized(req: Request, url: URL): Promise<boolean> {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const bearerToken = match ? match[1].trim() : "";
  const keyParam = (url.searchParams.get("key") || "").trim();

  for (const token of [bearerToken, keyParam]) {
    if (!token) continue;
    const tokenHash = await sha256Hex(token);
    const { data } = await supabaseRest<Array<{ id: string }>>(
      `mcp_api_keys?select=id&token_hash=eq.${tokenHash}&active=eq.true&limit=1`,
    );
    if (Array.isArray(data) && data.length > 0) return true;
  }
  return false;
}

// ─── Domínio: constantes e helpers ─────────────────────────────────────────

const TICKET_STATUSES = ["aberto", "em_atendimento", "aguardando_cliente", "aguardando_interno", "concluido", "cancelado"] as const;
const TICKET_PRIORITIES = ["baixa", "media", "alta", "critica"] as const;
const ROOT_CAUSES = ["venda", "expedicao", "engenharia", "cliente", "fornecedor", "produto", "producao"] as const;
const INTERNAL_DEPTS = ["comercial", "expedicao", "engenharia", "producao", "compras", "qualidade"] as const;
const INTERNAL_STATUSES = ["aberto", "em_andamento", "resolvido", "cancelado"] as const;

async function findTicketByCode(code: string) {
  const { data } = await supabaseRest<Array<Record<string, unknown>>>(
    `tickets?select=id,code,status,priority,root_cause&code=eq.${encodeURIComponent(code)}&limit=1`,
  );
  const ticket = data?.[0];
  if (!ticket) throw new Error(`Ocorrência ${code} não encontrada.`);
  return ticket;
}

async function findInternalTicketByCode(code: string) {
  const { data } = await supabaseRest<Array<Record<string, unknown>>>(
    `internal_tickets?select=id,code,status&code=eq.${encodeURIComponent(code)}&limit=1`,
  );
  const ticket = data?.[0];
  if (!ticket) throw new Error(`Ticket interno ${code} não encontrado.`);
  return ticket;
}

async function logAudit(entityType: string, entityId: string, action: string, payload: Record<string, unknown>) {
  await supabaseRest("audit_log", {
    method: "POST",
    body: [{ entity_type: entityType, entity_id: entityId, action, actor_name: "Claude (MCP)", payload }],
  });
}

// ─── Ferramentas MCP ────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "list_tickets",
    description: "Lista ocorrências (RO) com filtros opcionais por status, prioridade, canal, causa raiz ou busca por cliente/peça.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: TICKET_STATUSES },
        priority: { type: "string", enum: TICKET_PRIORITIES },
        root_cause: { type: "string", enum: ROOT_CAUSES },
        search: { type: "string", description: "Busca por cliente ou peça." },
        limit: { type: "number", description: "Máximo de resultados (padrão 30, máx 100)." },
      },
    },
    handler: async (args) => {
      const limit = Math.min(Number(args.limit) || 30, 100);
      const params = new URLSearchParams({
        select: "id,code,customer,part,status,priority,channel,occurrence_reason,root_cause,sla_hours,nps,created_at,resolved_at",
        order: "created_at.desc",
        limit: String(limit),
      });
      if (args.status) params.set("status", `eq.${args.status}`);
      if (args.priority) params.set("priority", `eq.${args.priority}`);
      if (args.root_cause) params.set("root_cause", `eq.${args.root_cause}`);
      if (args.search) {
        const term = String(args.search).replace(/[,()]/g, "");
        params.set("or", `(customer.ilike.*${term}*,part.ilike.*${term}*,code.ilike.*${term}*)`);
      }
      const { data, count } = await supabaseRest(`tickets?${params.toString()}`, {
        headers: { Prefer: "count=exact" },
      });
      return { total: count, tickets: data };
    },
  },
  {
    name: "get_ticket",
    description: "Retorna o detalhe completo de uma ocorrência pelo código (ex: RO-2026-00042): dados gerais, mensagens/notas, WhatsApp vinculado, tickets internos vinculados e auditoria.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
    handler: async (args) => {
      const code = String(args.code);
      const { data: tickets } = await supabaseRest<Array<Record<string, unknown>>>(
        `tickets?select=*&code=eq.${encodeURIComponent(code)}&limit=1`,
      );
      const ticket = tickets?.[0];
      if (!ticket) throw new Error(`Ocorrência ${code} não encontrada.`);
      const id = ticket.id as string;

      const [messages, whatsapp, internalLinked, audit] = await Promise.all([
        supabaseRest(`ticket_messages?select=kind,author_name,body,created_at&ticket_id=eq.${id}&order=created_at.asc`),
        supabaseRest(`whatsapp_messages?select=push_name,from_me,body,media_type,created_at&ticket_id=eq.${id}&order=created_at.asc&limit=50`),
        supabaseRest(`internal_tickets?select=code,target_department,status,subject,priority&linked_occurrence_id=eq.${id}`),
        supabaseRest(`audit_log?select=action,actor_name,payload,created_at&entity_id=eq.${id}&order=created_at.desc&limit=30`),
      ]);

      return {
        ticket,
        messages: messages.data,
        whatsapp_messages: whatsapp.data,
        internal_tickets: internalLinked.data,
        audit_log: audit.data,
      };
    },
  },
  {
    name: "list_internal_tickets",
    description: "Lista tickets internos (chamados entre departamentos) com filtros opcionais por status ou departamento alvo.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: INTERNAL_STATUSES },
        target_department: { type: "string", enum: INTERNAL_DEPTS },
        limit: { type: "number", description: "Máximo de resultados (padrão 30, máx 100)." },
      },
    },
    handler: async (args) => {
      const limit = Math.min(Number(args.limit) || 30, 100);
      const params = new URLSearchParams({
        select: "id,code,target_department,priority,status,subject,linked_customer,opened_at,closed_at",
        order: "opened_at.desc",
        limit: String(limit),
      });
      if (args.status) params.set("status", `eq.${args.status}`);
      if (args.target_department) params.set("target_department", `eq.${args.target_department}`);
      const { data } = await supabaseRest(`internal_tickets?${params.toString()}`);
      return { internal_tickets: data };
    },
  },
  {
    name: "list_clientes",
    description: "Busca clientes cadastrados (base de notas fiscais/pós-venda) por CNPJ, razão social ou nome fantasia.",
    inputSchema: {
      type: "object",
      properties: { search: { type: "string" }, limit: { type: "number" } },
    },
    handler: async (args) => {
      const limit = Math.min(Number(args.limit) || 30, 100);
      const params = new URLSearchParams({
        select: "id,cnpj,razao_social,nome_fantasia,classe_abc,email,telefone,whatsapp,gerente_conta",
        order: "razao_social.asc",
        limit: String(limit),
      });
      if (args.search) {
        const term = String(args.search).replace(/[,()]/g, "");
        params.set("or", `(razao_social.ilike.*${term}*,nome_fantasia.ilike.*${term}*,cnpj.ilike.*${term}*)`);
      }
      const { data } = await supabaseRest(`sac_clientes?${params.toString()}`);
      return { clientes: data };
    },
  },
  {
    name: "list_notas_fiscais",
    description: "Lista notas fiscais com status de entrega e pós-venda, filtráveis por status de entrega ou CNPJ do cliente.",
    inputSchema: {
      type: "object",
      properties: {
        status_entrega: { type: "string", enum: ["EMITIDA", "EM_TRANSITO", "ENTREGUE", "ATRASADA"] },
        status_pos_venda: { type: "string", enum: ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO"] },
        cnpj_cliente: { type: "string" },
        limit: { type: "number" },
      },
    },
    handler: async (args) => {
      const limit = Math.min(Number(args.limit) || 30, 100);
      const params = new URLSearchParams({
        select: "nf_numero,razao_social_cliente,cnpj_cliente,data_emissao,valor_total,transportadora,status_entrega,previsao_entrega,data_entrega_real,status_pos_venda",
        order: "data_emissao.desc",
        limit: String(limit),
      });
      if (args.status_entrega) params.set("status_entrega", `eq.${args.status_entrega}`);
      if (args.status_pos_venda) params.set("status_pos_venda", `eq.${args.status_pos_venda}`);
      if (args.cnpj_cliente) params.set("cnpj_cliente", `eq.${args.cnpj_cliente}`);
      const { data } = await supabaseRest(`sac_notas_fiscais?${params.toString()}`);
      return { notas_fiscais: data };
    },
  },
  {
    name: "dashboard_summary",
    description: "Resumo executivo: ocorrências abertas, em risco de SLA, concluídas no mês, NPS médio e tickets internos pendentes.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      const count = async (table: string, filters: Record<string, string>) => {
        const params = new URLSearchParams({ select: "id", ...filters });
        const { count } = await supabaseRest(`${table}?${params.toString()}`, {
          method: "HEAD",
          headers: { Prefer: "count=exact" },
        });
        return count;
      };

      const [emAndamento, aberto, concluidasNoMes, internosAbertos, npsRows] = await Promise.all([
        count("tickets", { status: "in.(em_atendimento,aguardando_cliente,aguardando_interno)" }),
        count("tickets", { status: "eq.aberto" }),
        count("tickets", { status: "eq.concluido", resolved_at: `gte.${firstDayOfMonth.toISOString()}` }),
        count("internal_tickets", { status: "in.(aberto,em_andamento)" }),
        supabaseRest<Array<{ nps: number | null }>>("tickets?select=nps&nps=not.is.null&order=created_at.desc&limit=100"),
      ]);

      const npsValues = (npsRows.data ?? []).map((r) => r.nps).filter((n): n is number => n !== null);
      const npsMedio = npsValues.length ? npsValues.reduce((a, b) => a + b, 0) / npsValues.length : null;

      return {
        em_atendimento: emAndamento,
        abertas: aberto,
        concluidas_no_mes: concluidasNoMes,
        tickets_internos_pendentes: internosAbertos,
        nps_medio_ultimos_100: npsMedio,
      };
    },
  },
  {
    name: "add_ticket_message",
    description: "Adiciona uma nota interna (ou registro de mensagem) a uma ocorrência.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        author_name: { type: "string" },
        body: { type: "string" },
        kind: { type: "string", enum: ["whatsapp", "email", "telefone", "nota_interna"], description: "Padrão nota_interna." },
      },
      required: ["code", "author_name", "body"],
    },
    handler: async (args) => {
      const ticket = await findTicketByCode(String(args.code));
      const { data } = await supabaseRest<Array<{ id: string }>>("ticket_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: [{ ticket_id: ticket.id, author_name: args.author_name, body: args.body, kind: args.kind ?? "nota_interna" }],
      });
      return { message_id: data?.[0]?.id, ticket_code: ticket.code };
    },
  },
  {
    name: "update_ticket_status",
    description: "Atualiza o status de uma ocorrência (exceto para 'concluido' — use conclude_ticket, que exige causa raiz).",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        status: { type: "string", enum: TICKET_STATUSES.filter((s) => s !== "concluido") },
      },
      required: ["code", "status"],
    },
    handler: async (args) => {
      const status = String(args.status);
      if (status === "concluido") throw new Error("Use a ferramenta conclude_ticket para concluir uma ocorrência (exige causa raiz e justificativa).");
      const ticket = await findTicketByCode(String(args.code));
      await supabaseRest(`tickets?id=eq.${ticket.id}`, { method: "PATCH", body: { status } });
      await logAudit("ticket", ticket.id as string, "STATUS_CHANGED", { from: ticket.status, to: status, origem: "mcp" });
      return { code: ticket.code, status };
    },
  },
  {
    name: "conclude_ticket",
    description: "Conclui uma ocorrência, exigindo causa raiz e justificativa (mesma regra de negócio da tela de detalhe).",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        root_cause: { type: "string", enum: ROOT_CAUSES },
        justificativa: { type: "string", description: "Mínimo 10 caracteres." },
        relatorio_tecnico: { type: "string", description: "Opcional; se informado, é registrado como nota interna." },
      },
      required: ["code", "root_cause", "justificativa"],
    },
    handler: async (args) => {
      const justificativa = String(args.justificativa);
      if (justificativa.trim().length < 10) throw new Error("justificativa deve ter ao menos 10 caracteres.");
      const ticket = await findTicketByCode(String(args.code));

      await supabaseRest(`tickets?id=eq.${ticket.id}`, {
        method: "PATCH",
        body: {
          status: "concluido",
          root_cause: args.root_cause,
          nc_descricao: justificativa,
          resolved_at: new Date().toISOString(),
        },
      });

      if (args.relatorio_tecnico) {
        await supabaseRest("ticket_messages", {
          method: "POST",
          body: [{ ticket_id: ticket.id, author_name: "Claude (MCP)", body: String(args.relatorio_tecnico), kind: "nota_interna" }],
        });
      }

      await logAudit("ticket", ticket.id as string, "CONCLUDED", { root_cause: args.root_cause, justificativa, origem: "mcp" });
      return { code: ticket.code, status: "concluido", root_cause: args.root_cause };
    },
  },
  {
    name: "create_internal_ticket",
    description: "Cria um ticket interno para outro departamento, opcionalmente vinculado a uma ocorrência existente.",
    inputSchema: {
      type: "object",
      properties: {
        linked_occurrence_code: { type: "string" },
        target_department: { type: "string", enum: INTERNAL_DEPTS },
        subject: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: TICKET_PRIORITIES, description: "Padrão media." },
      },
      required: ["target_department", "subject"],
    },
    handler: async (args) => {
      let linkedId: string | null = null;
      let linkedCustomer: string | null = null;
      if (args.linked_occurrence_code) {
        const { data } = await supabaseRest<Array<{ id: string; customer: string }>>(
          `tickets?select=id,customer&code=eq.${encodeURIComponent(String(args.linked_occurrence_code))}&limit=1`,
        );
        const t = data?.[0];
        if (!t) throw new Error(`Ocorrência ${args.linked_occurrence_code} não encontrada.`);
        linkedId = t.id;
        linkedCustomer = t.customer;
      }

      const { data } = await supabaseRest<Array<{ id: string; code: string }>>("internal_tickets", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: [
          {
            linked_occurrence_id: linkedId,
            linked_customer: linkedCustomer,
            target_department: args.target_department,
            subject: args.subject,
            description: args.description ?? null,
            priority: args.priority ?? "media",
          },
        ],
      });
      const created = data?.[0];
      if (!created) throw new Error("O ticket interno foi enviado, mas o Supabase não retornou o registro criado.");
      return { code: created.code };
    },
  },
  {
    name: "update_internal_ticket_status",
    description: "Atualiza o status de um ticket interno (aberto, em_andamento, resolvido, cancelado), opcionalmente com uma resposta.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        status: { type: "string", enum: INTERNAL_STATUSES },
        response: { type: "string" },
      },
      required: ["code", "status"],
    },
    handler: async (args) => {
      const ticket = await findInternalTicketByCode(String(args.code));
      const patch: Record<string, unknown> = { status: args.status };
      if (args.response) patch.response = args.response;
      if (args.status === "resolvido") patch.closed_at = new Date().toISOString();
      await supabaseRest(`internal_tickets?id=eq.${ticket.id}`, { method: "PATCH", body: patch });
      return { code: ticket.code, status: args.status };
    },
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ─── JSON-RPC / MCP plumbing (Streamable HTTP, sem estado de sessão) ──────

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg: Record<string, unknown>) {
  const { method, id, params } = msg as { method?: string; id?: unknown; params?: Record<string, unknown> };

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }

  if (method === "tools/call") {
    const name = String(params?.name ?? "");
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool) {
      return rpcResult(id, { content: [{ type: "text", text: `Ferramenta desconhecida: ${name}` }], isError: true });
    }
    try {
      const result = await tool.handler((params?.arguments as Record<string, unknown>) ?? {});
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rpcResult(id, { content: [{ type: "text", text: `Erro: ${message}` }], isError: true });
    }
  }

  if (id === undefined) return null; // notificação desconhecida: ignora
  return rpcError(id, -32601, `Método não suportado: ${method}`);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "not_found" }, 404);
  }

  if (!(await isAuthorized(req, url))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const results = (await Promise.all(body.map((m) => handleMessage(m as Record<string, unknown>)))).filter(
      (r) => r !== null,
    );
    if (results.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
    return jsonResponse(results);
  }

  const result = await handleMessage(body as Record<string, unknown>);
  if (result === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return jsonResponse(result);
});
