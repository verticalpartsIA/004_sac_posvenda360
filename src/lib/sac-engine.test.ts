import { describe, expect, it } from "vitest";
import { mensagemAlertaAtraso, mensagemPesquisa, mensagemVIP } from "./sac-engine";

describe("mensagemVIP", () => {
  it("inclui número da NF e nome do cliente", () => {
    const msg = mensagemVIP("12345", "Acme Ltda");
    expect(msg).toContain("Acme Ltda");
    expect(msg).toContain("12345");
  });

  it("inclui o código de rastreio quando informado", () => {
    const msg = mensagemVIP("12345", "Acme Ltda", "BR123456789");
    expect(msg).toContain("BR123456789");
  });

  it("omite a seção de rastreio quando não informado", () => {
    const msg = mensagemVIP("12345", "Acme Ltda");
    expect(msg).not.toContain("Rastreio");
  });
});

describe("mensagemPesquisa", () => {
  it("monta o link de pesquisa com o token informado", () => {
    const msg = mensagemPesquisa("12345", "Acme Ltda", "tok-abc-123");
    expect(msg).toContain("https://posvenda360.vpsistema.com/nps/form/tok-abc-123");
    expect(msg).toContain("Acme Ltda");
  });
});

describe("mensagemAlertaAtraso", () => {
  it("inclui número da NF e nome do cliente", () => {
    const msg = mensagemAlertaAtraso("12345", "Acme Ltda");
    expect(msg).toContain("12345");
    expect(msg).toContain("Acme Ltda");
  });
});
