import { Link } from "@tanstack/react-router";
import { PackageX, PackageOpen, PackageCheck, X, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./helpers";
import type { DevolucaoResumo } from "./types";

const DEVOLUCAO_STATUS_CFG = {
  aberta: {
    label: "Aguardando chegada",
    icon: PackageX,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  recebida: {
    label: "Recebida — aguardando fechamento",
    icon: PackageOpen,
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  concluida: {
    label: "Concluída",
    icon: PackageCheck,
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  cancelada: { label: "Cancelada", icon: X, cls: "bg-muted text-muted-foreground border-border" },
};

export function DevolucaoPanel({
  devolucoes,
  valorTotal,
  motivoDevolucao,
  onMotivoDevolucaoChange,
  obsDevolucao,
  onObsDevolucaoChange,
  abrindoDevolucao,
  onAbrirDevolucao,
}: {
  devolucoes: DevolucaoResumo[];
  valorTotal: number;
  motivoDevolucao: "devolucao_total" | "devolucao_parcial";
  onMotivoDevolucaoChange: (v: "devolucao_total" | "devolucao_parcial") => void;
  obsDevolucao: string;
  onObsDevolucaoChange: (v: string) => void;
  abrindoDevolucao: boolean;
  onAbrirDevolucao: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-orange-50 px-5 py-3">
        <PackageX className="h-4 w-4 text-orange-700" />
        <h2 className="text-sm font-semibold text-orange-800">Devolução de Produto</h2>
      </div>
      <div className="p-5 space-y-3">
        {devolucoes.length > 0 && (
          <div className="space-y-2">
            {devolucoes.map((d) => {
              const cfg = DEVOLUCAO_STATUS_CFG[d.status];
              const Icon = cfg.icon;
              return (
                <Link
                  key={d.id}
                  to="/sac/devolucoes"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      cfg.cls,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                  <span className="text-xs font-semibold text-gold">
                    Ver na tela de Devoluções →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={motivoDevolucao}
            onChange={(e) => onMotivoDevolucaoChange(e.target.value as typeof motivoDevolucao)}
            aria-label="Motivo da devolução"
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="devolucao_total">Devolução Total</option>
            <option value="devolucao_parcial">Devolução Parcial</option>
          </select>
          <input
            value={obsDevolucao}
            onChange={(e) => onObsDevolucaoChange(e.target.value)}
            placeholder="Observação (opcional)"
            className="min-w-[180px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={onAbrirDevolucao}
            disabled={abrindoDevolucao}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
          >
            <PlusCircle className="h-4 w-4" />{" "}
            {abrindoDevolucao ? "Abrindo..." : "Abrir devolução deste pedido"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Abre a devolução com o valor da NF ({fmt(valorTotal ?? 0)}) como prejuízo estimado. O
          recebimento físico e o fechamento acontecem na tela dedicada{" "}
          <Link to="/sac/devolucoes" className="text-gold hover:underline">
            Devoluções de Produto
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
