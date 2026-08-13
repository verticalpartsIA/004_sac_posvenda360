import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake do client Supabase: registra a cadeia de chamadas (.from/.select/.eq/...)
// sem tocar em rede. O client real (@/integrations/supabase/client) é um Proxy
// que lança se as env vars de Supabase não estiverem definidas — o que é o caso
// em teste — então ele precisa ser mockado antes de qualquer repositório ser importado.
const { fromCalls, storageCalls, resetCalls, supabaseMock } = vi.hoisted(() => {
  const fromCalls: { table: string; ops: [string, unknown[]][] }[] = [];
  const storageCalls: { bucket: string; ops: [string, unknown[]][] }[] = [];

  function makeQueryBuilder(table: string) {
    const ops: [string, unknown[]][] = [];
    fromCalls.push({ table, ops });
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "single", "maybeSingle", "order", "update", "insert"]) {
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

  return {
    fromCalls,
    storageCalls,
    resetCalls: () => {
      fromCalls.length = 0;
      storageCalls.length = 0;
    },
    supabaseMock: {
      from: (table: string) => makeQueryBuilder(table),
      storage: { from: (bucket: string) => makeStorageBuilder(bucket) },
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
});
