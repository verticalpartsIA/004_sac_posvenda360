import { describe, expect, it } from "vitest";
import { classificarABC, parseDateBR } from "./omie-client";

describe("classificarABC (re-export)", () => {
  // Cobertura completa dos limiares está em ./domain/curva-abc.test.ts — este é
  // só um smoke-test de que o re-export a partir do domínio compartilhado funciona.
  it("re-exporta a implementação de lib/domain/curva-abc", () => {
    expect(classificarABC(60000)).toBe("A");
  });
});

describe("parseDateBR (re-export)", () => {
  // Cobertura completa está em ./domain/data-br.test.ts — este é só um
  // smoke-test de que o re-export a partir do domínio compartilhado funciona.
  it("re-exporta a implementação de lib/domain/data-br", () => {
    expect(parseDateBR("25/12/2026")).toBe("2026-12-25");
  });
});
