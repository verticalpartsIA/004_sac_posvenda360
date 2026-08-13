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
