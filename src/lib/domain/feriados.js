// Páscoa (Computus) → base dos feriados móveis
function easterSunday(year) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const _addDays = (date, n) => {
  const x = new Date(date);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const _mmdd = (d) =>
  String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

/**
 * Feriados (Nacional + Estado SP + Município Guarulhos), por ano.
 * Ajuste a gosto da equipe.
 * @param {number} year
 * @returns {Record<string, string>} mapa "MM-DD" → nome do feriado
 */
export function holidaysFor(year) {
  const e = easterSunday(year);
  return {
    [_mmdd(_addDays(e, -48))]: "Carnaval (segunda)",
    [_mmdd(_addDays(e, -47))]: "Carnaval (terça)",
    [_mmdd(_addDays(e, -2))]: "Sexta-feira Santa",
    [_mmdd(_addDays(e, 60))]: "Corpus Christi",
    "01-01": "Confraternização Universal",
    "04-21": "Tiradentes",
    "05-01": "Dia do Trabalho",
    "09-07": "Independência do Brasil",
    "10-12": "Nossa Senhora Aparecida",
    "11-02": "Finados",
    "11-15": "Proclamação da República",
    "11-20": "Consciência Negra",
    "12-25": "Natal",
    "07-09": "Revolução Constitucionalista (Estado de SP)",
    "12-08": "Aniversário de Guarulhos",
  };
}
