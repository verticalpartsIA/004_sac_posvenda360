import { describe, expect, it } from "vitest";
import { parseDateBR, addDiasBR, adicionarDiasUteis } from "./data-br.js";

describe("parseDateBR", () => {
  it("converte DD/MM/YYYY para YYYY-MM-DD", () => {
    expect(parseDateBR("25/12/2026")).toBe("2026-12-25");
  });

  it("preserva zeros à esquerda de dia e mês", () => {
    expect(parseDateBR("01/02/2026")).toBe("2026-02-01");
  });

  it("retorna null para o sentinel do Omie '00/00/0000'", () => {
    expect(parseDateBR("00/00/0000")).toBeNull();
  });

  it("retorna null para entrada ausente ou inválida", () => {
    expect(parseDateBR(null)).toBeNull();
    expect(parseDateBR(undefined)).toBeNull();
    expect(parseDateBR("")).toBeNull();
    expect(parseDateBR("não é uma data")).toBeNull();
  });
});

describe("addDiasBR", () => {
  it("soma dias positivos, virando o mês quando necessário", () => {
    expect(addDiasBR("28/02/2026", 3)).toBe("03/03/2026");
  });

  it("soma dias negativos", () => {
    expect(addDiasBR("05/01/2026", -10)).toBe("26/12/2025");
  });
});

describe("adicionarDiasUteis", () => {
  it("pula sábado e domingo", () => {
    // Sexta 07/08/2026 + 1 dia útil → segunda 10/08/2026
    expect(adicionarDiasUteis("2026-08-07", 1)).toBe("2026-08-10");
  });

  it("soma vários dias úteis cruzando um fim de semana", () => {
    // Quinta 06/08/2026 + 3 dias úteis → sex(1) seg(2) ter(3) = 11/08/2026
    expect(adicionarDiasUteis("2026-08-06", 3)).toBe("2026-08-11");
  });
});
