import { describe, expect, it } from "vitest";
import { BUSINESS_HOURS, prazoUtilMs } from "./prazo.js";

// Datas de referência: agosto/2026 não tem feriado fixo nem móvel (a Páscoa cai
// no máx. em abril, então o feriado móvel mais tardio — Corpus Christi, +60
// dias — cai no máx. em final de junho). 03/08/2026 é segunda; 07/08/2026 é
// sexta; 10/08/2026 é a segunda seguinte.
describe("prazoUtilMs", () => {
  it("soma minutos dentro da mesma janela comercial", () => {
    // Segunda 08:00 (SP) + 60min → Segunda 09:00 (SP)
    const start = Date.UTC(2026, 7, 3, 11, 0); // 08:00 SP = 11:00 UTC
    const expected = Date.UTC(2026, 7, 3, 12, 0); // 09:00 SP
    expect(prazoUtilMs(start, 60)).toBe(expected);
  });

  it("transborda para o próximo dia útil, pulando o fim de semana", () => {
    // Sexta 16:00 (SP) + 90min: só há 60min disponíveis até as 17h de sexta;
    // os 30min restantes começam segunda 07:00 (SP) → termina segunda 07:30 (SP)
    const start = Date.UTC(2026, 7, 7, 19, 0); // 16:00 SP sexta = 19:00 UTC
    const expected = Date.UTC(2026, 7, 10, 10, 30); // 07:30 SP segunda = 10:30 UTC
    expect(prazoUtilMs(start, 90)).toBe(expected);
  });

  it("aterrissa exatamente no fim da janela quando o prazo cobre o dia inteiro", () => {
    // Segunda 07:00 (SP) + 660min (11h = toda a janela de segunda) → 18:00 (SP) da mesma segunda
    const start = Date.UTC(2026, 7, 3, 10, 0); // 07:00 SP = 10:00 UTC
    const expected = Date.UTC(2026, 7, 3, 21, 0); // 18:00 SP = 21:00 UTC
    expect(prazoUtilMs(start, 660)).toBe(expected);
  });

  // Fecha a lacuna apontada na issue #100: até aqui nenhum teste cruzava um feriado de
  // verdade (só janela comercial/fim de semana). Os dois casos abaixo confirmam que
  // prazoUtilMs pula tanto um feriado FIXO quanto um MÓVEL (calculado a partir da Páscoa
  // em holidaysFor), não só o array estático de dias da semana sem feriado no meio.
  it("pula um feriado fixo (Natal) além do fim de semana seguinte", () => {
    // Quinta 24/12/2026 17:30 (SP) + 90min: 30min até 18h de quinta; os 60min restantes
    // não podem cair na sexta 25/12 (Natal, feriado) nem no fim de semana (26-27/12) →
    // começam na segunda 28/12 07:00 (SP) → terminam 08:00 (SP) da mesma segunda.
    const start = Date.UTC(2026, 11, 24, 20, 30); // 17:30 SP quinta = 20:30 UTC
    const expected = Date.UTC(2026, 11, 28, 11, 0); // 08:00 SP segunda = 11:00 UTC
    expect(prazoUtilMs(start, 90)).toBe(expected);
  });

  it("pula um feriado móvel (Corpus Christi, calculado via Páscoa/Computus)", () => {
    // Corpus Christi 2026 = 04/06 (quinta), 60 dias após a Páscoa (05/04/2026).
    // Quarta 03/06/2026 17:00 (SP) + 90min: 60min até 18h de quarta; os 30min restantes
    // pulam a quinta 04/06 (feriado móvel) → começam sexta 05/06 07:00 (SP) → terminam
    // 07:30 (SP) da mesma sexta.
    const start = Date.UTC(2026, 5, 3, 20, 0); // 17:00 SP quarta = 20:00 UTC
    const expected = Date.UTC(2026, 5, 5, 10, 30); // 07:30 SP sexta = 10:30 UTC
    expect(prazoUtilMs(start, 90)).toBe(expected);
  });
});

describe("BUSINESS_HOURS", () => {
  it("é Seg-Qui 07-18h e Sex 07-17h, sem entradas para Sáb/Dom", () => {
    expect(BUSINESS_HOURS[1]).toEqual([7, 18]);
    expect(BUSINESS_HOURS[4]).toEqual([7, 18]);
    expect(BUSINESS_HOURS[5]).toEqual([7, 17]);
    expect(BUSINESS_HOURS[0]).toBeUndefined();
    expect(BUSINESS_HOURS[6]).toBeUndefined();
  });
});
