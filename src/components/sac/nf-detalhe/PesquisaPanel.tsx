import { CheckCircle2, Save } from "lucide-react";
import { fmtDate } from "./helpers";
import { SimNao } from "./SimNao";
import { Estrelas } from "./Estrelas";
import type { Pesquisa } from "./types";

export type PesquisaForm = Omit<Pesquisa, "id" | "respondida_em">;

const SIM_NAO_PERGUNTAS: { key: keyof PesquisaForm; label: string }[] = [
  { key: "produto_correto", label: "O produto chegou correto?" },
  { key: "atendeu_prazo", label: "Atendeu o prazo de entrega?" },
  { key: "recebeu_nota_boleto", label: "Recebeu a nota fiscal e boleto?" },
  { key: "produto_atendeu_expectativas", label: "O produto atendeu as expectativas?" },
  { key: "dificuldade_compra", label: "Teve dificuldade na compra?" },
  { key: "compraria_novamente", label: "Compraria novamente?" },
];

const TEXTO_PERGUNTAS: { key: keyof PesquisaForm; label: string }[] = [
  { key: "pontos_positivos", label: "Pontos positivos da experiência" },
  { key: "pontos_melhoria", label: "Algo a melhorar?" },
  { key: "sugestoes", label: "Alguma sugestão?" },
  { key: "observacoes", label: "Observações gerais" },
];

export function PesquisaPanel({
  pesq,
  onPesqChange,
  respondidaEm,
  savingPesq,
  msgPesq,
  onSalvarPesquisa,
}: {
  pesq: PesquisaForm;
  onPesqChange: (v: PesquisaForm) => void;
  respondidaEm: string | null | undefined;
  savingPesq: boolean;
  msgPesq: string;
  onSalvarPesquisa: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-green-50 px-5 py-3">
        <CheckCircle2 className="h-4 w-4 text-green-700" />
        <h2 className="text-sm font-semibold text-green-800">Pesquisa de Satisfação</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {respondidaEm ? `Preenchida em ${fmtDate(respondidaEm)}` : "Não preenchida ainda"}
        </span>
      </div>
      <div className="p-5 space-y-5">
        {/* Perguntas Sim/Não */}
        {SIM_NAO_PERGUNTAS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
          >
            <span className="text-sm font-medium">{label}</span>
            <SimNao
              value={pesq[key] as boolean | null}
              onChange={(v) => onPesqChange({ ...pesq, [key]: v })}
            />
          </div>
        ))}

        {/* Avaliação atendimento */}
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <span className="text-sm font-medium">Avaliação do atendimento</span>
          <Estrelas
            value={pesq.avaliacao_atendimento}
            onChange={(v) => onPesqChange({ ...pesq, avaliacao_atendimento: v })}
          />
        </div>

        {/* NPS */}
        <div className="border-b pb-4">
          <label className="block text-sm font-medium mb-2">
            NPS — De 0 a 10, quanto indicaria a VerticalParts?
            {pesq.nps_score !== null && (
              <span className="ml-2 font-bold text-primary">{pesq.nps_score}</span>
            )}
          </label>
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPesqChange({ ...pesq, nps_score: i })}
                className={
                  "h-9 w-9 rounded-lg border text-sm font-semibold transition-all " +
                  (pesq.nps_score === i
                    ? i >= 9
                      ? "bg-green-500 text-white border-green-500"
                      : i >= 7
                        ? "bg-amber-400 text-white border-amber-400"
                        : "bg-red-500 text-white border-red-500"
                    : "hover:bg-muted")
                }
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Campos de texto */}
        {TEXTO_PERGUNTAS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
            <textarea
              rows={2}
              value={(pesq[key] as string) ?? ""}
              onChange={(e) => onPesqChange({ ...pesq, [key]: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        ))}

        <div className="flex items-center gap-3 border-t pt-4">
          <button
            onClick={onSalvarPesquisa}
            disabled={savingPesq}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingPesq ? "Salvando..." : "Salvar Pesquisa"}
          </button>
          {msgPesq && <span className="text-sm text-muted-foreground">{msgPesq}</span>}
        </div>
      </div>
    </div>
  );
}
