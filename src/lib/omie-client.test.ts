import { describe, expect, it } from "vitest";
import { classificarABC, parseDateBR } from "./omie-client";

describe("classificarABC (re-export)", () => {
  // Cobertura completa dos limiares está em ./domain/curva-abc.test.ts — este é
  // só um smoke-test de que o re-export a partir do domínio compartilhado funciona.
  it("re-exporta a implementação de lib/domain/curva-abc", () => {
    expect(classificarABC(60000)).toBe("A");
  });
});

describe("parseDateBR", () => {
  it("converte DD/MM/YYYY para YYYY-MM-DD", () => {
    expect(parseDateBR("25/12/2026")).toBe("2026-12-25");
  });

  it("preserva zeros à esquerda de dia e mês", () => {
    expect(parseDateBR("01/02/2026")).toBe("2026-02-01");
  });
});
