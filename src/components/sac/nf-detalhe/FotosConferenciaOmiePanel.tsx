import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OmieItem } from "./types";

export function FotosConferenciaOmiePanel({
  fotosConferencia,
  itensOmie,
  enviandoFotosOmie,
  msgFotosOmie,
  onEnviarFotosOmie,
}: {
  fotosConferencia: Record<number, string | null>;
  itensOmie: OmieItem[];
  enviandoFotosOmie: boolean;
  msgFotosOmie: string;
  onEnviarFotosOmie: () => void;
}) {
  const fotos = Object.entries(fotosConferencia).filter(([, url]) => url != null);
  if (fotos.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-orange-50 px-5 py-3">
        <Camera className="h-4 w-4 text-orange-700" />
        <h2 className="text-sm font-semibold text-orange-800">Fotos da Conferência → Omie</h2>
        <span className="ml-auto text-[11px] text-orange-500 font-medium">
          {fotos.length} foto(s) prontas
        </span>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-xs text-muted-foreground">
          As fotos abaixo serão enviadas como <strong>anexos</strong> ao pedido no Omie (aba Anexos
          da Proposta Comercial).
        </p>
        <div className="flex flex-wrap gap-2">
          {fotos.map(([idx, url]) => {
            const item = itensOmie[Number(idx)];
            return (
              <div key={idx} className="relative">
                <a href={url!} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url!}
                    alt={item?.produto?.descricao ?? `Item ${idx}`}
                    className="h-16 w-20 rounded-lg border object-cover hover:opacity-90 transition-opacity"
                  />
                </a>
                <p className="text-[10px] text-muted-foreground text-center mt-0.5 max-w-[80px] truncate">
                  {item?.produto?.descricao ?? `Item ${idx}`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onEnviarFotosOmie}
            disabled={enviandoFotosOmie}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {enviandoFotosOmie ? "Enviando..." : "Enviar fotos ao Omie"}
          </button>
          {msgFotosOmie && (
            <span
              className={cn(
                "text-sm",
                msgFotosOmie.startsWith("Erro") ? "text-red-600" : "text-green-600",
              )}
            >
              {msgFotosOmie}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
