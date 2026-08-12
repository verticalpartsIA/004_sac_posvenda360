import { describe, expect, it } from "vitest";
import { holidaysFor } from "./feriados.js";

describe("holidaysFor", () => {
  it("inclui os 10 feriados de data fixa (nacionais + SP + Guarulhos)", () => {
    const hol = holidaysFor(2026);
    expect(hol["01-01"]).toBe("Confraternização Universal");
    expect(hol["04-21"]).toBe("Tiradentes");
    expect(hol["05-01"]).toBe("Dia do Trabalho");
    expect(hol["09-07"]).toBe("Independência do Brasil");
    expect(hol["10-12"]).toBe("Nossa Senhora Aparecida");
    expect(hol["11-02"]).toBe("Finados");
    expect(hol["11-15"]).toBe("Proclamação da República");
    expect(hol["11-20"]).toBe("Consciência Negra");
    expect(hol["12-25"]).toBe("Natal");
    expect(hol["07-09"]).toBe("Revolução Constitucionalista (Estado de SP)");
    expect(hol["12-08"]).toBe("Aniversário de Guarulhos");
  });

  it("inclui os 4 feriados móveis (calculados a partir da Páscoa)", () => {
    const hol = holidaysFor(2026);
    const labels = Object.values(hol);
    expect(labels).toContain("Carnaval (segunda)");
    expect(labels).toContain("Carnaval (terça)");
    expect(labels).toContain("Sexta-feira Santa");
    expect(labels).toContain("Corpus Christi");
  });

  it("retorna sempre exatamente 15 feriados por ano", () => {
    expect(Object.keys(holidaysFor(2026))).toHaveLength(15);
    expect(Object.keys(holidaysFor(2027))).toHaveLength(15);
  });

  it("mantém a distância fixa entre os feriados móveis e a Páscoa (Computus)", () => {
    // Sexta-feira Santa = Páscoa - 2 dias; Corpus Christi = Páscoa + 60 dias;
    // Carnaval = Páscoa - 47/-48 dias. Verificamos a consistência interna do
    // cálculo (guarda contra regressão na extração), independente da data exata.
    const hol = holidaysFor(2026);
    const mmddToUtc = (mmdd: string) => {
      const [mo, da] = mmdd.split("-").map(Number);
      return Date.UTC(2026, mo - 1, da);
    };
    const sextaSanta = Object.entries(hol).find(([, nome]) => nome === "Sexta-feira Santa")![0];
    const corpusChristi = Object.entries(hol).find(([, nome]) => nome === "Corpus Christi")![0];
    const pascoaMs = mmddToUtc(sextaSanta) + 2 * 86400000;
    expect(mmddToUtc(corpusChristi) - pascoaMs).toBe(60 * 86400000);
  });
});
