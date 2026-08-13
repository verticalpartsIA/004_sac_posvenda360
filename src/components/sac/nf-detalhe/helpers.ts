import { Package, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { holidaysFor } from "@/lib/domain/feriados.js";

// Pula fim de semana e feriado (feriados vêm de lib/domain/feriados, a mesma
// fonte usada pelo backend — ver #64). ANTES desta troca havia aqui uma quarta
// cópia do calendário de feriados, incompleta (faltavam Consciência Negra,
// Revolução Constitucionalista/SP e Aniversário de Guarulhos) e que também
// pulava a própria Páscoa (domingo, já non-útil por cair sempre em fim de
// semana) — unificar corrige essa divergência, não só move o código.
export function addBusinessDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T12:00:00"); // evita timezone shift
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const mmdd =
      String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    if (holidaysFor(date.getFullYear())[mmdd]) continue;
    added++;
  }
  return date.toISOString().slice(0, 10);
}

export const STATUS_CONFIG = {
  EMITIDA: { label: "Emitida", icon: Package, cls: "bg-blue-50 text-blue-700 border-blue-200" },
  EM_TRANSITO: {
    label: "Em trânsito",
    icon: Clock,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  ENTREGUE: {
    label: "Entregue",
    icon: CheckCircle2,
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  ATRASADA: {
    label: "Atrasada",
    icon: AlertTriangle,
    cls: "bg-red-50 text-red-700 border-red-200",
  },
};

export const ABC_CLS = {
  A: "bg-gold text-black",
  B: "bg-blue-100 text-blue-800",
  C: "bg-muted text-muted-foreground",
};

export function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR");
}
