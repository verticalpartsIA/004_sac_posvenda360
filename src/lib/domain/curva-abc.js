/**
 * Classificação de Curva ABC por valor total do pedido/NF.
 * Fonte única — consumida pelo frontend (UI) e pelo backend (hostinger/server.mjs).
 * @param {number} valorTotal
 * @returns {"A"|"B"|"C"}
 */
export function classificarABC(valorTotal) {
  if (valorTotal >= 50000) return "A";
  if (valorTotal >= 10000) return "B";
  return "C";
}
