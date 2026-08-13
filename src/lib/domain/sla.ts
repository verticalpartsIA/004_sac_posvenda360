import type { Ticket } from "@/lib/types";

function formatDuration(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem = Math.round(hours % 24);
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  }
  return `${hours.toFixed(1)}h`;
}

export function slaStatus(t: Ticket): {
  pct: number;
  label: string;
  tone: "ok" | "warn" | "danger";
  overdueHours: number;
} {
  const elapsed = (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
  const pct = Math.min(100, (elapsed / t.slaHours) * 100);
  if (t.status === "concluido")
    return { pct: 100, label: "SLA cumprido", tone: "ok", overdueHours: 0 };
  if (pct >= 100) {
    const overdueHours = Math.max(0, elapsed - t.slaHours);
    return {
      pct: 100,
      label: `SLA estourado há ${formatDuration(overdueHours)}`,
      tone: "danger",
      overdueHours,
    };
  }
  const restantes = Math.max(0, t.slaHours - elapsed).toFixed(1);
  if (pct >= 80)
    return { pct, label: `80% - ${restantes}h restantes`, tone: "danger", overdueHours: 0 };
  if (pct >= 50)
    return { pct, label: `${restantes}h restantes (50%)`, tone: "warn", overdueHours: 0 };
  return { pct, label: `${restantes}h restantes`, tone: "ok", overdueHours: 0 };
}
