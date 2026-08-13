import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake do client Supabase: registra a cadeia de chamadas (.from/.select/.eq/...)
// sem tocar em rede. O client real (@/integrations/supabase/client) é um Proxy
// que lança se as env vars de Supabase não estiverem definidas — o que é o caso
// em teste — então ele precisa ser mockado antes de qualquer repositório ser importado.
type ChannelListener = { event: string; filter: unknown; callback: (payload: unknown) => void };
type ChannelEntry = {
  name: string;
  listeners: ChannelListener[];
  statusCallback?: (status: string) => void;
  removed: boolean;
  channel: unknown;
};

const { fromCalls, storageCalls, channelCalls, resetCalls, supabaseMock } = vi.hoisted(() => {
  const fromCalls: { table: string; ops: [string, unknown[]][] }[] = [];
  const storageCalls: { bucket: string; ops: [string, unknown[]][] }[] = [];
  const channelCalls: ChannelEntry[] = [];

  function makeQueryBuilder(table: string) {
    const ops: [string, unknown[]][] = [];
    fromCalls.push({ table, ops });
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of [
      "select",
      "eq",
      "single",
      "maybeSingle",
      "order",
      "update",
      "insert",
      "or",
      "limit",
      "range",
      "ilike",
      "delete",
      "in",
    ]) {
      builder[method] = (...args: unknown[]) => {
        ops.push([method, args]);
        return builder;
      };
    }
    return builder;
  }

  function makeStorageBuilder(bucket: string) {
    const ops: [string, unknown[]][] = [];
    storageCalls.push({ bucket, ops });
    return {
      upload: async (...args: unknown[]) => {
        ops.push(["upload", args]);
        return { error: null };
      },
      getPublicUrl: (...args: unknown[]) => {
        ops.push(["getPublicUrl", args]);
        return { data: { publicUrl: `https://cdn.test/${bucket}/${args[0]}` } };
      },
    };
  }

  function makeChannel(name: string) {
    const entry: ChannelEntry = { name, listeners: [], removed: false, channel: undefined };
    const channel = {
      on: (event: string, filter: unknown, callback: (payload: unknown) => void) => {
        entry.listeners.push({ event, filter, callback });
        return channel;
      },
      subscribe: (statusCallback?: (status: string) => void) => {
        entry.statusCallback = statusCallback;
        return channel;
      },
    };
    entry.channel = channel;
    channelCalls.push(entry);
    return channel;
  }

  return {
    fromCalls,
    storageCalls,
    channelCalls,
    resetCalls: () => {
      fromCalls.length = 0;
      storageCalls.length = 0;
      channelCalls.length = 0;
    },
    supabaseMock: {
      from: (table: string) => makeQueryBuilder(table),
      storage: { from: (bucket: string) => makeStorageBuilder(bucket) },
      channel: (name: string) => makeChannel(name),
      removeChannel: (channel: unknown) => {
        const entry = channelCalls.find((c) => c.channel === channel);
        if (entry) entry.removed = true;
      },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

beforeEach(() => {
  resetCalls();
});

const notasFiscaisRepo = await import("./notasFiscaisRepo");
const pesquisasRepo = await import("./pesquisasRepo");
const devolucoesRepo = await import("./devolucoesRepo");
const auditLogRepo = await import("./auditLogRepo");
const sacClientesRepo = await import("./sacClientesRepo");
const conferenciaStorageRepo = await import("./conferenciaStorageRepo");
const whatsappMessagesRepo = await import("./whatsappMessagesRepo");
const userRolesRepo = await import("./userRolesRepo");
const profilesRepo = await import("./profilesRepo");

describe("notasFiscaisRepo", () => {
  it("getDetalhe busca pelo id, com join de sac_clientes", () => {
    notasFiscaisRepo.getDetalhe("nf-1");
    expect(fromCalls).toHaveLength(1);
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_notas_fiscais");
    expect(ops[0][0]).toBe("select");
    expect(ops[1]).toEqual(["eq", ["id", "nf-1"]]);
    expect(ops[2][0]).toBe("single");
  });

  it("update filtra pelo id da NF", () => {
    notasFiscaisRepo.update("nf-1", { pesquisa_enviada: true });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_notas_fiscais");
    expect(ops[0]).toEqual(["update", [{ pesquisa_enviada: true }]]);
    expect(ops[1]).toEqual(["eq", ["id", "nf-1"]]);
  });

  it("listPendentes filtra Entrega e/ou SAC não concluídos, mais recentes primeiro, até 1000", () => {
    notasFiscaisRepo.listPendentes();
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_notas_fiscais");
    expect(ops[0][0]).toBe("select");
    expect(ops[1]).toEqual(["or", ["status_entrega.neq.ENTREGUE,status_pos_venda.neq.CONCLUIDO"]]);
    expect(ops[2]).toEqual(["order", ["data_emissao", { ascending: false }]]);
    expect(ops[3]).toEqual(["limit", [1000]]);
  });

  it("listConcluidas filtra Entrega ENTREGUE e SAC CONCLUIDO", () => {
    notasFiscaisRepo.listConcluidas();
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_notas_fiscais");
    expect(ops[1]).toEqual(["eq", ["status_entrega", "ENTREGUE"]]);
    expect(ops[2]).toEqual(["eq", ["status_pos_venda", "CONCLUIDO"]]);
    expect(ops[3]).toEqual(["order", ["data_pos_venda", { ascending: false }]]);
  });

  it("listDevolvidas filtra por devolvido ou devolvido_parcial", () => {
    notasFiscaisRepo.listDevolvidas();
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_notas_fiscais");
    expect(ops[1]).toEqual(["or", ["devolvido.eq.true,devolvido_parcial.eq.true"]]);
  });
});

describe("sacClientesRepo", () => {
  it("updateByCnpj filtra por cnpj, não por id", () => {
    sacClientesRepo.updateByCnpj("00000000000191", { whatsapp: "11999999999" });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_clientes");
    expect(ops[0]).toEqual(["update", [{ whatsapp: "11999999999" }]]);
    expect(ops[1]).toEqual(["eq", ["cnpj", "00000000000191"]]);
  });
});

describe("pesquisasRepo", () => {
  it("getByNfId busca pelo nf_id", () => {
    pesquisasRepo.getByNfId("nf-1");
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_pesquisas");
    expect(ops[1]).toEqual(["eq", ["nf_id", "nf-1"]]);
    expect(ops[2][0]).toBe("maybeSingle");
  });

  it("update filtra pelo id da pesquisa", () => {
    pesquisasRepo.update("pesq-1", { nps_score: 9 });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_pesquisas");
    expect(ops[0]).toEqual(["update", [{ nps_score: 9 }]]);
    expect(ops[1]).toEqual(["eq", ["id", "pesq-1"]]);
  });

  it("insert grava o payload sem filtro adicional", () => {
    pesquisasRepo.insert({ nf_id: "nf-1", nps_score: 9 });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_pesquisas");
    expect(ops).toEqual([["insert", [{ nf_id: "nf-1", nps_score: 9 }]]]);
  });
});

describe("devolucoesRepo", () => {
  it("listByNfId busca pelo nf_id, mais recentes primeiro", () => {
    devolucoesRepo.listByNfId("nf-1");
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_devolucoes");
    expect(ops[1]).toEqual(["eq", ["nf_id", "nf-1"]]);
    expect(ops[2]).toEqual(["order", ["aberta_em", { ascending: false }]]);
  });

  it("abrir grava o payload de abertura", () => {
    devolucoesRepo.abrir({ nf_id: "nf-1", motivo: "devolucao_total" });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_devolucoes");
    expect(ops).toEqual([["insert", [{ nf_id: "nf-1", motivo: "devolucao_total" }]]]);
  });

  it("listAll traz o join com sac_notas_fiscais, mais recentes primeiro, até 300", () => {
    devolucoesRepo.listAll();
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_devolucoes");
    expect(ops[0][0]).toBe("select");
    expect(ops[0][1][0] as string).toContain(
      "sac_notas_fiscais(nf_numero,numero_pedido_omie,razao_social_cliente)",
    );
    expect(ops[1]).toEqual(["order", ["aberta_em", { ascending: false }]]);
    expect(ops[2]).toEqual(["limit", [300]]);
  });

  it("update filtra pelo id da devolução", () => {
    devolucoesRepo.update("dev-1", { status: "concluida" });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("sac_devolucoes");
    expect(ops[0]).toEqual(["update", [{ status: "concluida" }]]);
    expect(ops[1]).toEqual(["eq", ["id", "dev-1"]]);
  });
});

describe("auditLogRepo", () => {
  it("registrar grava a entrada no audit_log", () => {
    auditLogRepo.registrar({ entity_type: "sac_nf", entity_id: "nf-1", action: "teste" });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("audit_log");
    expect(ops).toEqual([
      ["insert", [{ entity_type: "sac_nf", entity_id: "nf-1", action: "teste" }]],
    ]);
  });

  it("listPaginado pagina por range e não aplica filtro quando não informado", () => {
    auditLogRepo.listPaginado({}, { from: 0, to: 49 });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("audit_log");
    expect(ops[0][0]).toBe("select");
    expect(ops[1]).toEqual(["order", ["created_at", { ascending: false }]]);
    expect(ops[2]).toEqual(["range", [0, 49]]);
    expect(ops.some(([method]) => method === "eq" || method === "ilike")).toBe(false);
  });

  it("listPaginado aplica os 3 filtros quando informados", () => {
    auditLogRepo.listPaginado(
      { entityType: "sac_nf", action: "sac_salvo", actorName: "ana" },
      { from: 0, to: 49 },
    );
    const [{ ops }] = fromCalls;
    expect(ops).toEqual(
      expect.arrayContaining([
        ["eq", ["entity_type", "sac_nf"]],
        ["eq", ["action", "sac_salvo"]],
        ["ilike", ["actor_name", "%ana%"]],
      ]),
    );
  });
});

describe("conferenciaStorageRepo", () => {
  it("uploadFotoItem sobe no bucket sac-conferencia e resolve a URL pública", async () => {
    const file = { name: "foto.png" } as File;
    const { error, publicUrl } = await conferenciaStorageRepo.uploadFotoItem("nf-1", 2, file);
    expect(error).toBeNull();
    // upload() e getPublicUrl() cada um pega seu próprio `.storage.from(bucket)`
    expect(storageCalls).toHaveLength(2);
    expect(storageCalls.every((c) => c.bucket === "sac-conferencia")).toBe(true);
    const [uploadCall] = storageCalls[0].ops;
    const [publicUrlCall] = storageCalls[1].ops;
    expect(uploadCall[0]).toBe("upload");
    const [path] = uploadCall[1] as [string];
    expect(path).toMatch(/^nf-1\/item-2-\d+\.png$/);
    expect(publicUrlCall).toEqual(["getPublicUrl", [path]]);
    expect(publicUrl).toBe(`https://cdn.test/sac-conferencia/${path}`);
  });

  it("uploadFotoDevolucao sobe no bucket sac-conferencia com a convenção de path de devolução", async () => {
    const file = { name: "recebimento.jpg" } as File;
    const { error, publicUrl } = await conferenciaStorageRepo.uploadFotoDevolucao("dev-1", 0, file);
    expect(error).toBeNull();
    expect(storageCalls).toHaveLength(2);
    expect(storageCalls.every((c) => c.bucket === "sac-conferencia")).toBe(true);
    const [uploadCall] = storageCalls[0].ops;
    const [path] = uploadCall[1] as [string];
    expect(path).toMatch(/^devolucao\/dev-1\/\d+-0\.jpg$/);
    expect(publicUrl).toBe(`https://cdn.test/sac-conferencia/${path}`);
  });
});

describe("userRolesRepo", () => {
  it("listAll ordena por user_id", () => {
    userRolesRepo.listAll();
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("user_roles");
    expect(ops[0]).toEqual(["select", ["user_id, role"]]);
    expect(ops[1]).toEqual(["order", ["user_id"]]);
  });

  it("remove filtra por user_id e role juntos", () => {
    userRolesRepo.remove("user-1", "gestor");
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("user_roles");
    expect(ops[0][0]).toBe("delete");
    expect(ops[1]).toEqual(["eq", ["user_id", "user-1"]]);
    expect(ops[2]).toEqual(["eq", ["role", "gestor"]]);
  });

  it("add grava o par user_id/role", () => {
    userRolesRepo.add({ user_id: "user-1", role: "gestor" });
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("user_roles");
    expect(ops).toEqual([["insert", [{ user_id: "user-1", role: "gestor" }]]]);
  });
});

describe("profilesRepo", () => {
  it("listAll não aplica filtro (cruzado com user_roles no componente)", () => {
    profilesRepo.listAll();
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("profiles");
    expect(ops).toEqual([["select", ["user_id, display_name, departamento"]]]);
  });
});

describe("whatsappMessagesRepo", () => {
  it("listByRemoteJid busca pelo remote_jid, ordenado por created_at asc", () => {
    whatsappMessagesRepo.listByRemoteJid("5511999999999@s.whatsapp.net");
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("whatsapp_messages");
    expect(ops[0][0]).toBe("select");
    expect(ops[1]).toEqual(["eq", ["remote_jid", "5511999999999@s.whatsapp.net"]]);
    expect(ops[2]).toEqual(["order", ["created_at", { ascending: true }]]);
  });

  it("subscribeToNewMessages assina INSERT filtrado por remote_jid e cancela no cleanup", () => {
    const onInsert = vi.fn();
    const unsubscribe = whatsappMessagesRepo.subscribeToNewMessages("55119@x", onInsert);

    expect(channelCalls).toHaveLength(1);
    const [entry] = channelCalls;
    expect(entry.name).toBe("wa-thread-55119@x");
    expect(entry.listeners).toHaveLength(1);
    const [{ event, filter, callback }] = entry.listeners;
    expect(event).toBe("postgres_changes");
    expect(filter).toEqual({
      event: "INSERT",
      schema: "public",
      table: "whatsapp_messages",
      filter: "remote_jid=eq.55119@x",
    });

    callback({ new: { id: "m1", body: "oi" } });
    expect(onInsert).toHaveBeenCalledWith({ id: "m1", body: "oi" });

    expect(entry.removed).toBe(false);
    unsubscribe();
    expect(entry.removed).toBe(true);
  });

  it("listRecent ordena por created_at desc e respeita o limit informado", () => {
    whatsappMessagesRepo.listRecent(50);
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("whatsapp_messages");
    expect(ops[0][0]).toBe("select");
    expect(ops[1]).toEqual(["order", ["created_at", { ascending: false }]]);
    expect(ops[2]).toEqual(["limit", [50]]);
  });

  it("listRecent usa 500 como limit padrão", () => {
    whatsappMessagesRepo.listRecent();
    const [{ ops }] = fromCalls;
    expect(ops[2]).toEqual(["limit", [500]]);
  });

  it("deleteByRemoteJids apaga por lista de remote_jid", () => {
    whatsappMessagesRepo.deleteByRemoteJids(["a@x", "b@x"]);
    const [{ table, ops }] = fromCalls;
    expect(table).toBe("whatsapp_messages");
    expect(ops[0][0]).toBe("delete");
    expect(ops[1]).toEqual(["in", ["remote_jid", ["a@x", "b@x"]]]);
  });

  it("subscribeToAllNewMessages assina INSERT sem filtro por conversa e propaga status/insert/cleanup", () => {
    const onInsert = vi.fn();
    const onStatusChange = vi.fn();
    const unsubscribe = whatsappMessagesRepo.subscribeToAllNewMessages(onInsert, onStatusChange);

    expect(channelCalls).toHaveLength(1);
    const [entry] = channelCalls;
    expect(entry.name).toBe("wa-threads-realtime");
    const [{ event, filter, callback }] = entry.listeners;
    expect(event).toBe("postgres_changes");
    expect(filter).toEqual({ event: "INSERT", schema: "public", table: "whatsapp_messages" });

    callback({ new: { id: "m2" } });
    expect(onInsert).toHaveBeenCalledWith({ id: "m2" });

    entry.statusCallback?.("SUBSCRIBED");
    expect(onStatusChange).toHaveBeenCalledWith("SUBSCRIBED");

    expect(entry.removed).toBe(false);
    unsubscribe();
    expect(entry.removed).toBe(true);
  });
});
