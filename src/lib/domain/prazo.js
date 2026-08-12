import { holidaysFor } from "./feriados.js";

// Horário comercial VerticalParts: Seg–Qui 07:00–18:00 | Sex 07:00–17:00 | Sáb/Dom fechado
/** @type {Record<number, [number, number]>} */
export const BUSINESS_HOURS = { 1: [7, 18], 2: [7, 18], 3: [7, 18], 4: [7, 18], 5: [7, 17] };

// SP = UTC-3 fixo (Brasil sem horário de verão desde 2019).
const SP_OFFSET_MS = 3 * 3600 * 1000;

function _spParts(utcMs) {
  const d = new Date(utcMs - SP_OFFSET_MS); // campos UTC deste objeto = relógio local de SP
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    da: d.getUTCDate(),
    dow: d.getUTCDay(),
    mmdd:
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"),
  };
}

const _spToUtcMs = (y, mo, da, h, mi) => Date.UTC(y, mo, da, h + 3, mi); // relógio SP -> instante UTC

/**
 * Avança `minutos` de tempo útil (Seg-Qui 07-18h, Sex 07-17h; pula fim de
 * semana e feriados) a partir de `startMs` (epoch ms).
 * @param {number} startMs
 * @param {number} minutos
 * @returns {number} epoch ms do instante final
 */
export function prazoUtilMs(startMs, minutos) {
  let cur = startMs,
    rem = minutos,
    guard = 0;
  while (rem > 0 && guard++ < 6000) {
    const p = _spParts(cur);
    const win = BUSINESS_HOURS[p.dow];
    const feriado = !!holidaysFor(p.y)[p.mmdd];
    if (!win || feriado) {
      cur = _spToUtcMs(p.y, p.mo, p.da + 1, 0, 0);
      continue;
    }
    const ini = _spToUtcMs(p.y, p.mo, p.da, win[0], 0);
    const fim = _spToUtcMs(p.y, p.mo, p.da, win[1], 0);
    if (cur < ini) {
      cur = ini;
      continue;
    }
    if (cur >= fim) {
      cur = _spToUtcMs(p.y, p.mo, p.da + 1, 0, 0);
      continue;
    }
    const disp = Math.floor((fim - cur) / 60000);
    if (rem <= disp) {
      cur += rem * 60000;
      rem = 0;
    } else {
      rem -= disp;
      cur = fim;
    }
  }
  return cur;
}
