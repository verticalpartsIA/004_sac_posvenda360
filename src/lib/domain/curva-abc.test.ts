import { describe, expect, it } from "vitest";
import { classificarABC } from "./curva-abc.js";

describe("classificarABC", () => {
  it("classifica como A quando valor >= 50000", () => {
    expect(classificarABC(50000)).toBe("A");
    expect(classificarABC(120000)).toBe("A");
  });

  it("classifica como B quando valor está entre 10000 (inclusive) e 50000 (exclusive)", () => {
    expect(classificarABC(10000)).toBe("B");
    expect(classificarABC(49999.99)).toBe("B");
  });

  it("classifica como C quando valor < 10000", () => {
    expect(classificarABC(9999.99)).toBe("C");
    expect(classificarABC(0)).toBe("C");
  });
});
