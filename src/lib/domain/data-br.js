/**
 * DD/MM/YYYY (formato Omie) → YYYY-MM-DD.
 * Fonte única — consumida pelo backend (hostinger/server.mjs), pelo frontend
 * (src/lib/omie-client.ts) e pela rota espelho (src/routes/api/sac/sync-faturamento.ts).
 * Retorna null para entrada ausente/inválida ou para o sentinel "00/00/0000"
 * que o Omie usa para representar "sem data".
 * @param {string | null | undefined} dateBR
 * @returns {string | null}
 */
export function parseDateBR(dateBR) {
  if (!dateBR || typeof dateBR !== "string" || !dateBR.includes("/")) return null;
  if (dateBR === "00/00/0000") return null;
  const [dd, mm, yyyy] = dateBR.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Soma `dias` (pode ser negativo) a uma data DD/MM/YYYY, retornando DD/MM/YYYY.
 * @param {string} dataBR
 * @param {number} dias
 * @returns {string}
 */
export function addDiasBR(dataBR, dias) {
  const [d, m, y] = dataBR.split("/").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
}

/**
 * Soma `dias` ÚTEIS (pula sábado e domingo — não considera feriados) a uma
 * data YYYY-MM-DD, retornando YYYY-MM-DD.
 * @param {string} dataISO
 * @param {number} dias
 * @returns {string}
 */
export function adicionarDiasUteis(dataISO, dias) {
  const d = new Date(dataISO + "T12:00:00");
  let adicionados = 0;
  while (adicionados < dias) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) adicionados++;
  }
  return d.toISOString().slice(0, 10);
}
