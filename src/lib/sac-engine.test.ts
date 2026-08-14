import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OmieCliente, OmiePedido } from "./omie-client";

// Fake do client @supabase/supabase-js: createClient() é chamado sob demanda dentro de
// getSb() (não no import), então o mock só precisa cobrir a mesma cadeia usada pelo
// código real (.from/.select/.eq/.single/.upsert/.update/.insert). Cada builder é
// "thenable" (implementa .then) pra funcionar tanto com quanto sem await de um método
// terminal — como o próprio supabase-js.
const { fromCalls, tableResponses, resetSupabase, createClientMock } = vi.hoisted(() => {
  const fromCalls: { table: string; ops: [string, unknown[]][] }[] = [];
  const tableResponses: Record<string, Array<{ data: unknown; error: unknown }>> = {};

  function nextResponse(table: string) {
    const queue = tableResponses[table];
    if (queue && queue.length > 0) return queue.shift()!;
    return { data: null, error: null };
  }

  function makeBuilder(table: string) {
    const ops: [string, unknown[]][] = [];
    fromCalls.push({ table, ops });
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "upsert", "update", "insert", "single", "maybeSingle"]) {
      builder[method] = (...args: unknown[]) => {
        ops.push([method, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextResponse(table)).then(resolve, reject);
    return builder;
  }

  return {
    fromCalls,
    tableResponses,
    resetSupabase: () => {
      fromCalls.length = 0;
      for (const k of Object.keys(tableResponses)) delete tableResponses[k];
    },
    createClientMock: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

const fetchMock = vi.fn(async (_url: string, _opts?: unknown) => ({ ok: true }));
vi.stubGlobal("fetch", fetchMock);

const sacEngine = await import("./sac-engine");

function queue(table: string, ...responses: Array<{ data: unknown; error?: unknown }>) {
  tableResponses[table] = responses.map((r) => ({ error: null, ...r }));
}

beforeEach(() => {
  resetSupabase();
  fetchMock.mockClear();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

// ── #104: motor de pós-venda / OODA ──────────────────────────────────────────────
describe("triggerPosVendaFlow", () => {
  it("Classe A com WhatsApp: envia mensagem VIP e registra o log", async () => {
    queue("sac_notas_fiscais", {
      data: {
        id: "nf-1",
        nf_numero: "1001",
        status_entrega: "EMITIDA",
        previsao_entrega: null,
        sac_clientes: { whatsapp: "11999999999", nome_fantasia: "Cliente A" },
      },
    });

    await sacEngine.triggerPosVendaFlow("nf-1", "A");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/message/sendText/");

    const logCall = fromCalls.find((c) => c.table === "sac_logs_comunicacao");
    expect(logCall).toBeTruthy();
    expect(logCall!.ops[0]).toEqual([
      "insert",
      [expect.objectContaining({ tipo_mensagem: "VIP_FOLLOWUP", status_envio: "ENVIADO" })],
    ]);
  });

  it("Classe B/C: NÃO dispara a mensagem VIP mesmo com WhatsApp disponível", async () => {
    queue("sac_notas_fiscais", {
      data: {
        id: "nf-2",
        nf_numero: "1002",
        status_entrega: "EMITIDA",
        previsao_entrega: null,
        sac_clientes: { whatsapp: "11999999999", nome_fantasia: "Cliente B" },
      },
    });

    await sacEngine.triggerPosVendaFlow("nf-2", "B");

    expect(fetchMock).not.toHaveBeenCalled();
    const logCall = fromCalls.find((c) => c.table === "sac_logs_comunicacao");
    expect(logCall).toBeUndefined();
  });

  it("entrega com previsão vencida e ainda não ENTREGUE: marca ATRASADA e envia alerta", async () => {
    queue("sac_notas_fiscais", {
      data: {
        id: "nf-3",
        nf_numero: "1003",
        status_entrega: "EMITIDA",
        previsao_entrega: "2020-01-01",
        sac_clientes: { whatsapp: "11988888888", nome_fantasia: "Cliente C" },
      },
    });

    await sacEngine.triggerPosVendaFlow("nf-3", "C");

    const updateCall = fromCalls.find(
      (c) => c.table === "sac_notas_fiscais" && c.ops.some(([m]) => m === "update"),
    );
    expect(updateCall!.ops.find(([m]) => m === "update")![1]).toEqual([
      { status_entrega: "ATRASADA" },
    ]);
    const logCall = fromCalls.find((c) => c.table === "sac_logs_comunicacao");
    expect(logCall!.ops[0]).toEqual([
      "insert",
      [expect.objectContaining({ tipo_mensagem: "ALERTA_ATRASO" })],
    ]);
  });

  it("entrega já marcada ENTREGUE não dispara alerta de atraso mesmo com previsão vencida", async () => {
    queue("sac_notas_fiscais", {
      data: {
        id: "nf-4",
        nf_numero: "1004",
        status_entrega: "ENTREGUE",
        previsao_entrega: "2020-01-01",
        sac_clientes: { whatsapp: "11977777777", nome_fantasia: "Cliente D" },
      },
    });

    await sacEngine.triggerPosVendaFlow("nf-4", "C");

    const updateCall = fromCalls.find(
      (c) => c.table === "sac_notas_fiscais" && c.ops.some(([m]) => m === "update"),
    );
    expect(updateCall).toBeUndefined();
  });

  it("NF inexistente: não quebra e não faz nenhuma chamada de rede", async () => {
    queue("sac_notas_fiscais", { data: null });
    await expect(sacEngine.triggerPosVendaFlow("nf-inexistente", "A")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dispararPesquisaSatisfacao", () => {
  it("cria a pesquisa, envia o link por WhatsApp e marca pesquisa_enviada", async () => {
    queue("sac_notas_fiscais", {
      data: {
        id: "nf-5",
        nf_numero: "1005",
        pesquisa_enviada: false,
        sac_clientes: { whatsapp: "11966666666", nome_fantasia: "Cliente E" },
      },
    });
    queue("sac_pesquisas", { data: { token: "tok-123" } });

    await sacEngine.dispararPesquisaSatisfacao("nf-5");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const insertPesquisa = fromCalls.find((c) => c.table === "sac_pesquisas");
    expect(insertPesquisa!.ops[0]).toEqual(["insert", [{ nf_id: "nf-5" }]]);

    const updateNf = fromCalls.find(
      (c) => c.table === "sac_notas_fiscais" && c.ops.some(([m]) => m === "update"),
    );
    const [, updateArgs] = updateNf!.ops.find(([m]) => m === "update")!;
    expect((updateArgs[0] as { pesquisa_enviada: boolean }).pesquisa_enviada).toBe(true);
  });

  it("NF que já recebeu pesquisa antes: não cria outra nem envia de novo", async () => {
    queue("sac_notas_fiscais", {
      data: { id: "nf-6", nf_numero: "1006", pesquisa_enviada: true },
    });

    await sacEngine.dispararPesquisaSatisfacao("nf-6");

    expect(fetchMock).not.toHaveBeenCalled();
    const insertPesquisa = fromCalls.find((c) => c.table === "sac_pesquisas");
    expect(insertPesquisa).toBeUndefined();
  });
});

// ── #102: ingestão de NF do Omie ─────────────────────────────────────────────────
describe("ingerirNFdoOmie", () => {
  const pedido: OmiePedido = {
    cabecalho: {
      codigo_pedido: 555,
      numero_pedido: "PED-555",
      codigo_cliente: 999,
      data_previsao: "01/09/2026",
      etapa: "50",
    },
    total_pedido: { valor_total_pedido: 75000 }, // Classe A (>= 50000)
    frete: {
      codigo_rastreio: "BR123",
      previsao_entrega: "10/09/2026",
      nome_transportador: "Transportadora X",
    },
    infoCadastro: { dFat: "01/08/2026" },
  };

  const cliente: OmieCliente = {
    codigo_cliente_omie: 999,
    razao_social: "Cliente Omie Ltda",
    nome_fantasia: "Cliente Omie",
    cnpj_cpf: "12.345.678/0001-90",
    telefone1_ddd: "11",
    telefone1_numero: "988887777",
  };

  it("classifica ABC pelo valor, faz upsert de cliente e NF, e dispara o pós-venda", async () => {
    queue("sac_clientes", { data: { id: "cliente-1" } });
    // 2 respostas na mesma fila: 1ª pro upsert desta função, 2ª pro triggerPosVendaFlow
    // (disparado internamente sem await) quando ele buscar a NF de novo.
    queue("sac_notas_fiscais", { data: { id: "nf-nova" } }, { data: null });

    const result = await sacEngine.ingerirNFdoOmie(pedido, cliente);

    expect(result).toEqual({ nfId: "nf-nova", classeAbc: "A" });

    const clienteUpsert = fromCalls.find((c) => c.table === "sac_clientes");
    const [, upsertArgs] = clienteUpsert!.ops.find(([m]) => m === "upsert")!;
    expect(upsertArgs[0]).toMatchObject({
      cnpj: "12345678000190",
      razao_social: "Cliente Omie Ltda",
      classe_abc: "A",
      telefone: "11988887777",
      whatsapp: "11988887777",
    });
    expect(upsertArgs[1]).toEqual({ onConflict: "cnpj" });

    const nfUpsertCall = fromCalls.find(
      (c) => c.table === "sac_notas_fiscais" && c.ops.some(([m]) => m === "upsert"),
    );
    const [, nfUpsertArgs] = nfUpsertCall!.ops.find(([m]) => m === "upsert")!;
    expect(nfUpsertArgs[0]).toMatchObject({
      numero_pedido_omie: "PED-555",
      cliente_id: "cliente-1",
      cnpj_cliente: "12345678000190",
      classe_abc: "A",
      valor_total: 75000,
      transportadora: "Transportadora X",
      codigo_rastreio: "BR123",
      status_entrega: "EMITIDA",
      codigo_pedido_omie: 555,
    });
    expect(nfUpsertArgs[1]).toEqual({ onConflict: "nf_numero" });
  });

  it("classifica B e C corretamente conforme as faixas de valor", async () => {
    queue("sac_clientes", { data: { id: "cliente-2" } });
    queue("sac_notas_fiscais", { data: { id: "nf-b" } }, { data: null });
    const pedidoB = { ...pedido, total_pedido: { valor_total_pedido: 20000 } };
    const resultB = await sacEngine.ingerirNFdoOmie(pedidoB, cliente);
    expect(resultB.classeAbc).toBe("B");

    queue("sac_clientes", { data: { id: "cliente-3" } });
    queue("sac_notas_fiscais", { data: { id: "nf-c" } }, { data: null });
    const pedidoC = { ...pedido, total_pedido: { valor_total_pedido: 1000 } };
    const resultC = await sacEngine.ingerirNFdoOmie(pedidoC, cliente);
    expect(resultC.classeAbc).toBe("C");
  });

  it("sem previsão de entrega/frete no pedido: grava null em vez de quebrar", async () => {
    queue("sac_clientes", { data: { id: "cliente-4" } });
    queue("sac_notas_fiscais", { data: { id: "nf-sem-frete" } }, { data: null });

    const pedidoSemFrete: OmiePedido = { ...pedido, frete: undefined };
    await sacEngine.ingerirNFdoOmie(pedidoSemFrete, cliente);

    const nfUpsertCall = fromCalls.find(
      (c) => c.table === "sac_notas_fiscais" && c.ops.some(([m]) => m === "upsert"),
    );
    const [, nfUpsertArgs] = nfUpsertCall!.ops.find(([m]) => m === "upsert")!;
    expect(nfUpsertArgs[0]).toMatchObject({
      transportadora: null,
      codigo_rastreio: null,
      previsao_entrega: null,
    });
  });
});
