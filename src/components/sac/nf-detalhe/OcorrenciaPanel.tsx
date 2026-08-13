import { Link } from "@tanstack/react-router";
import { AlertTriangle, PlusCircle } from "lucide-react";
import { OCCURRENCE_REASON_LABEL, STATUS_LABEL, type OccurrenceReason } from "@/lib/types";
import type { Ticket } from "@/lib/types";

export function OcorrenciaPanel({
  ocorrenciasVinculadas,
  motivoInicial,
  onMotivoInicialChange,
  onAbrirOcorrencia,
}: {
  ocorrenciasVinculadas: Ticket[];
  motivoInicial: OccurrenceReason | "";
  onMotivoInicialChange: (v: OccurrenceReason) => void;
  onAbrirOcorrencia: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-red-50 px-5 py-3">
        <AlertTriangle className="h-4 w-4 text-red-700" />
        <h2 className="text-sm font-semibold text-red-800">Ocorrência de Pós-Venda</h2>
      </div>
      <div className="p-5 space-y-3">
        {ocorrenciasVinculadas.length > 0 && (
          <div className="space-y-2">
            {ocorrenciasVinculadas.map((t) => (
              <Link
                key={t.id}
                to="/ocorrencia/$ro"
                params={{ ro: t.code }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-mono font-semibold">{t.code}</span>{" "}
                  <span className="text-muted-foreground">
                    · {STATUS_LABEL[t.status]}
                    {t.occurrenceReason && <> · {OCCURRENCE_REASON_LABEL[t.occurrenceReason]}</>}
                  </span>
                </span>
                <span className="text-xs font-semibold text-gold">Abrir ocorrência →</span>
              </Link>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={motivoInicial}
            onChange={(e) => onMotivoInicialChange(e.target.value as OccurrenceReason)}
            aria-label="Motivo inicial da ocorrência"
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Selecione o motivo inicial…</option>
            {(Object.keys(OCCURRENCE_REASON_LABEL) as OccurrenceReason[]).map((k) => (
              <option key={k} value={k}>
                {OCCURRENCE_REASON_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAbrirOcorrencia}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <PlusCircle className="h-4 w-4" /> Abrir ocorrência deste pedido
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Leva cliente, pedido, NF, transportadora e rastreio para a nova ocorrência. Nada é criado
          automaticamente — a ocorrência só existe se você concluir o fluxo em "Nova Ocorrência".
        </p>
      </div>
    </div>
  );
}
