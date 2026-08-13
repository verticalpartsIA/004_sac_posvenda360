import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, ABC_CLS, fmt, fmtDate } from "./helpers";
import type { NFDetalhe } from "./types";

export function NfHeader({
  nf,
  nomeCliente,
  showValor,
  onToggleShowValor,
}: {
  nf: NFDetalhe;
  nomeCliente: string;
  showValor: boolean;
  onToggleShowValor: () => void;
}) {
  const cfg = STATUS_CONFIG[nf.status_entrega];
  const StatusIcon = cfg.icon;

  return (
    <div className="flex items-start gap-3">
      <Link to="/sac" className="mt-1 rounded-lg border p-2 hover:bg-muted shrink-0">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">Pedido {nf.numero_pedido_omie ?? nf.nf_numero}</h1>
          {nf.numero_pedido_omie && nf.nf_numero !== nf.numero_pedido_omie && (
            <span className="text-xs text-muted-foreground font-mono">NF {nf.nf_numero}</span>
          )}
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              ABC_CLS[nf.classe_abc],
            )}
          >
            Classe {nf.classe_abc}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              cfg.cls,
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {nomeCliente} — CNPJ {nf.cnpj_cliente}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center justify-end gap-1.5">
          <span
            className={cn(
              "text-xl font-semibold tabular-nums transition-all",
              !showValor && "blur-sm select-none",
            )}
          >
            {fmt(nf.valor_total ?? 0)}
          </span>
          <button
            onClick={onToggleShowValor}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={showValor ? "Ocultar valor" : "Exibir valor"}
          >
            {showValor ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="text-xs text-muted-foreground">Emissão {fmtDate(nf.data_emissao)}</div>
      </div>
    </div>
  );
}
