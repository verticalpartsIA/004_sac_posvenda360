import { ClipboardList, CheckCircle2, AlertTriangle, Camera, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OmieItem } from "./types";

export function ConferenciaPanel({
  itensOmie,
  obsOmieNota,
  conferencias,
  onConferenciaChange,
  fotosConferencia,
  uploadingFoto,
  onUploadFoto,
  onRemoverFoto,
  enviandoFotoItem,
  msgFotoItem,
  fotoItemPublicada,
  onEnviarFotoOmieItem,
  codigoPedidoOmie,
  temDivergencia,
  todasPreenchidas,
  divergenciaReportada,
  obsDiv,
  onObsDivChange,
  reportandoDiv,
  msgDiv,
  onReportarDivergencia,
}: {
  itensOmie: OmieItem[];
  obsOmieNota: string | null;
  conferencias: Record<number, number | null>;
  onConferenciaChange: (idx: number, v: number | null) => void;
  fotosConferencia: Record<number, string | null>;
  uploadingFoto: Record<number, boolean>;
  onUploadFoto: (idx: number, file: File) => void;
  onRemoverFoto: (idx: number) => void;
  enviandoFotoItem: Record<number, boolean>;
  msgFotoItem: Record<number, string>;
  fotoItemPublicada: Record<number, boolean>;
  onEnviarFotoOmieItem: (idx: number) => void;
  codigoPedidoOmie: string | null;
  temDivergencia: boolean;
  todasPreenchidas: boolean;
  divergenciaReportada: boolean;
  obsDiv: string;
  onObsDivChange: (v: string) => void;
  reportandoDiv: boolean;
  msgDiv: string;
  onReportarDivergencia: () => void;
}) {
  if (itensOmie.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-purple-50 px-5 py-3">
        <ClipboardList className="h-4 w-4 text-purple-700" />
        <h2 className="text-sm font-semibold text-purple-800">Conferência de Itens — Poka-Yoke</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {Object.values(conferencias).filter((v) => v != null).length} / {itensOmie.length}{" "}
          conferidos
        </span>
      </div>
      <div className="p-5 space-y-3">
        {/* Obs vendedor/cliente */}
        {obsOmieNota && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3">
            <span className="font-medium text-amber-700">Obs. vendedor/cliente: </span>
            <span className="text-amber-900">{obsOmieNota}</span>
          </div>
        )}
        {/* Cabeçalho da tabela */}
        <div className="grid grid-cols-[1fr_72px_88px_44px] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b">
          <span>Produto</span>
          <span className="text-center">Pedido</span>
          <span className="text-center">Conferido</span>
          <span />
        </div>
        {/* Itens */}
        {itensOmie.map((item, i) => {
          const qtdPedida = item.produto?.quantidade ?? 0;
          const qtdConf = conferencias[i];
          const preenchido = qtdConf != null;
          const ok = preenchido && qtdConf === qtdPedida;
          const div = preenchido && qtdConf !== qtdPedida;
          return (
            <div key={i} className="py-2 border-b last:border-0 space-y-2">
              <div className="grid grid-cols-[1fr_72px_88px_44px] gap-2 items-center">
                <div>
                  <p className="text-sm font-medium leading-tight">
                    {item.produto?.descricao ?? `Item ${i + 1}`}
                  </p>
                  {item.produto?.codigo_produto && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                      SKU {item.produto.codigo_produto}
                    </p>
                  )}
                </div>
                <span className="text-center text-sm tabular-nums">{qtdPedida}</span>
                <input
                  type="number"
                  min={0}
                  value={qtdConf ?? ""}
                  placeholder="—"
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    onConferenciaChange(i, v);
                  }}
                  className={cn(
                    "w-full rounded-lg border px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-1",
                    ok && "border-green-400 bg-green-50 text-green-800 focus:ring-green-400",
                    div && "border-red-400 bg-red-50 text-red-800 focus:ring-red-400",
                    !preenchido && "border-border bg-background focus:ring-ring",
                  )}
                />
                <div className="flex justify-center">
                  {ok && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {div && <AlertTriangle className="h-5 w-5 text-red-500" />}
                </div>
              </div>
              {/* Foto do item conferido */}
              <div className="pl-0">
                {fotosConferencia[i] ? (
                  <div className="flex items-center gap-3">
                    <div className="relative inline-block">
                      <a href={fotosConferencia[i]!} target="_blank" rel="noopener noreferrer">
                        <img
                          src={fotosConferencia[i]!}
                          alt={`Foto item ${i + 1}`}
                          className="h-20 w-28 rounded-lg border object-cover hover:opacity-90 transition-opacity"
                        />
                      </a>
                      <button
                        onClick={() => onRemoverFoto(i)}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => onEnviarFotoOmieItem(i)}
                        disabled={enviandoFotoItem[i] || !codigoPedidoOmie}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                          fotoItemPublicada[i]
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-orange-600 text-white hover:bg-orange-700",
                        )}
                        title={!codigoPedidoOmie ? "NF sem pedido Omie vinculado" : undefined}
                      >
                        {fotoItemPublicada[i] ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {enviandoFotoItem[i]
                          ? "Publicando..."
                          : fotoItemPublicada[i]
                            ? "Publicada no Omie"
                            : "Publicar Imagem no Omie"}
                      </button>
                      {msgFotoItem[i] && !fotoItemPublicada[i] && (
                        <span className="text-[11px] text-red-600">{msgFotoItem[i]}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <label
                    className={cn(
                      "inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors",
                      uploadingFoto[i] && "opacity-50 pointer-events-none",
                    )}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {uploadingFoto[i] ? "Enviando..." : "Foto do item"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadFoto(i, f);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {/* Bloco de divergência */}
        {temDivergencia && (
          <div
            className={cn(
              "rounded-lg border p-3 space-y-2",
              divergenciaReportada ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50",
            )}
          >
            {!divergenciaReportada ? (
              <>
                <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Divergência detectada — reporte antes de
                  salvar
                </p>
                <textarea
                  rows={2}
                  value={obsDiv}
                  onChange={(e) => onObsDivChange(e.target.value)}
                  placeholder="Descreva a divergência (opcional)"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={onReportarDivergencia}
                    disabled={reportandoDiv}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {reportandoDiv ? "Reportando..." : "Reportar Divergência"}
                  </button>
                  {msgDiv && <span className="text-xs text-muted-foreground">{msgDiv}</span>}
                </div>
              </>
            ) : (
              <p className="text-sm text-amber-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                Divergência reportada — time notificado. Pode salvar com ressalva.
              </p>
            )}
          </div>
        )}
        {/* Tudo OK */}
        {todasPreenchidas && !temDivergencia && (
          <div className="rounded-lg border border-green-300 bg-green-50 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-800 font-medium">
              Todos os itens conferidos — expedição liberada.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
