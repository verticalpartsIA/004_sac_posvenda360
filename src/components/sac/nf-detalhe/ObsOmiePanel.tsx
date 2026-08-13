import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function ObsOmiePanel({
  obsOmie,
  onObsOmieChange,
  savingObs,
  msgObs,
  onEnviarObsOmie,
}: {
  obsOmie: string;
  onObsOmieChange: (v: string) => void;
  savingObs: boolean;
  msgObs: string;
  onEnviarObsOmie: () => void;
}) {
  return (
    <div className="rounded-xl border border-orange-200 bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-orange-50 px-5 py-3">
        <Send className="h-4 w-4 text-orange-600" />
        <h2 className="text-sm font-semibold text-orange-800">Observações → Omie</h2>
        <span className="ml-auto text-[11px] text-orange-500 font-medium">
          Enviado ao pedido no ERP
        </span>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-xs text-muted-foreground">
          O texto abaixo será <strong>anexado</strong> ao campo Observações do pedido no Omie (aba
          Observações da Proposta Comercial). Campos internos do pós-venda ficam apenas no site.
        </p>
        <textarea
          rows={4}
          value={obsOmie}
          onChange={(e) => onObsOmieChange(e.target.value)}
          placeholder={
            "Ex.: EXP confirmou entrega em 12/06/2026. Cliente recebeu e assinou comprovante."
          }
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={onEnviarObsOmie}
            disabled={savingObs || !obsOmie.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {savingObs ? "Enviando..." : "Enviar para Omie"}
          </button>
          {msgObs && (
            <span
              className={cn(
                "text-sm",
                msgObs.startsWith("Erro") ? "text-red-600" : "text-green-600",
              )}
            >
              {msgObs}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
