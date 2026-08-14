import { describe, expect, it } from "vitest";
import { slaStatus } from "./sla";
import type { Ticket } from "@/lib/types";

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    createdAt: new Date().toISOString(),
    slaHours: 24,
    status: "aberto",
    ...overrides,
  } as Ticket;
}

describe("slaStatus", () => {
  it("retorna SLA cumprido para ticket concluído, independente do tempo decorrido", () => {
    const t = ticket({
      createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      slaHours: 24,
      status: "concluido",
    });
    const r = slaStatus(t);
    expect(r).toEqual({ pct: 100, label: "SLA cumprido", tone: "ok", overdueHours: 0 });
  });

  it("marca como estourado (danger) quando o tempo decorrido passa do SLA", () => {
    const t = ticket({
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      slaHours: 24,
      status: "aberto",
    });
    const r = slaStatus(t);
    expect(r.tone).toBe("danger");
    expect(r.pct).toBe(100);
    expect(r.overdueHours).toBeCloseTo(6, 0);
    expect(r.label).toMatch(/^SLA estourado há/);
  });

  it("marca como danger (sem estourar) quando passou de 80% do prazo", () => {
    const t = ticket({
      createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      slaHours: 24,
      status: "aberto",
    });
    const r = slaStatus(t);
    expect(r.tone).toBe("danger");
    expect(r.pct).toBeCloseTo((20 / 24) * 100, 0);
  });

  it("marca como warn quando passou de 50% do prazo", () => {
    const t = ticket({
      createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
      slaHours: 24,
      status: "aberto",
    });
    const r = slaStatus(t);
    expect(r.tone).toBe("warn");
  });

  it("marca como ok quando ainda está bem dentro do prazo", () => {
    const t = ticket({
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      slaHours: 24,
      status: "aberto",
    });
    const r = slaStatus(t);
    expect(r.tone).toBe("ok");
    expect(r.overdueHours).toBe(0);
  });

  it("formata a duração estourada em dias quando passa de 24h", () => {
    const t = ticket({
      createdAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      slaHours: 24,
      status: "aberto",
    });
    const r = slaStatus(t);
    expect(r.label).toContain("1d");
  });
});

// #101: matriz nos limites exatos 50%/80%/100% — os 3 cortes usam `>=`, então um
// off-by-one (>) faria o ticket cair no tom mais brando bem na hora que ele deveria
// virar o mais crítico. Cada limite testado no valor exato e logo abaixo dele.
describe("slaStatus — limites exatos (50%/80%/100%)", () => {
  it("exatamente 50% já é warn; um instante antes ainda é ok", () => {
    const noLimite = ticket({
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12/24 = 50%
      slaHours: 24,
    });
    expect(slaStatus(noLimite).tone).toBe("warn");
    expect(slaStatus(noLimite).pct).toBeCloseTo(50, 1);

    const antesDoLimite = ticket({
      createdAt: new Date(Date.now() - 11.9 * 60 * 60 * 1000).toISOString(), // 49,58%
      slaHours: 24,
    });
    expect(slaStatus(antesDoLimite).tone).toBe("ok");
  });

  it("exatamente 80% já é danger (sem estourar); um instante antes ainda é warn", () => {
    const noLimite = ticket({
      createdAt: new Date(Date.now() - 19.2 * 60 * 60 * 1000).toISOString(), // 19.2/24 = 80%
      slaHours: 24,
    });
    const r = slaStatus(noLimite);
    expect(r.tone).toBe("danger");
    expect(r.pct).toBeCloseTo(80, 1);
    expect(r.overdueHours).toBe(0);
    expect(r.label).not.toMatch(/^SLA estourado/);

    const antesDoLimite = ticket({
      createdAt: new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString(), // 79,17%
      slaHours: 24,
    });
    expect(slaStatus(antesDoLimite).tone).toBe("warn");
  });

  it("exatamente 100% já conta como estourado (overdueHours 0), não como 80%", () => {
    const noLimite = ticket({
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24/24 = 100%
      slaHours: 24,
    });
    const r = slaStatus(noLimite);
    expect(r.tone).toBe("danger");
    expect(r.pct).toBe(100);
    expect(r.overdueHours).toBeCloseTo(0, 1);
    expect(r.label).toMatch(/^SLA estourado há/);

    const antesDoLimite = ticket({
      createdAt: new Date(Date.now() - 23.9 * 60 * 60 * 1000).toISOString(), // 99,58%
      slaHours: 24,
    });
    const r2 = slaStatus(antesDoLimite);
    expect(r2.tone).toBe("danger"); // já é >=80%
    expect(r2.overdueHours).toBe(0);
    expect(r2.label).not.toMatch(/^SLA estourado/);
  });

  it("sla_config vazio (ticket caiu no fallback DEFAULT_SLA_HOURS) não muda o comportamento — slaStatus só enxerga slaHours já resolvido", () => {
    // slaStatus recebe o ticket já com slaHours definido (por sla_config real ou pelo
    // fallback DEFAULT_SLA_HOURS quando a tabela está vazia — ver #90); a função em si
    // é agnóstica a de onde esse número veio, então o mesmo teste de limite vale igual.
    const viaFallback = ticket({
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      slaHours: 12, // ex.: DEFAULT_SLA_HOURS.critica
    });
    expect(slaStatus(viaFallback).tone).toBe("warn");
    expect(slaStatus(viaFallback).pct).toBeCloseTo(50, 1);
  });
});
