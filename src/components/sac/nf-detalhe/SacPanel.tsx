import { MessageCircle, Save } from "lucide-react";

export type SacForm = {
  previsao_pos_venda: string;
  status_pos_venda: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";
  data_pos_venda: string;
  responsavel_pos_venda: string;
};

export function SacPanel({
  sac,
  onSacChange,
  savingSac,
  msgSac,
  onSalvarSac,
}: {
  sac: SacForm;
  onSacChange: (v: SacForm) => void;
  savingSac: boolean;
  msgSac: string;
  onSalvarSac: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-blue-50 px-5 py-3">
        <MessageCircle className="h-4 w-4 text-blue-700" />
        <h2 className="text-sm font-semibold text-blue-800">SAC — Controle de Pós-Venda</h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Previsão do contato SAC
            </label>
            <input
              type="date"
              value={sac.previsao_pos_venda}
              onChange={(e) => onSacChange({ ...sac, previsao_pos_venda: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Status pós-venda
            </label>
            <select
              value={sac.status_pos_venda}
              onChange={(e) =>
                onSacChange({
                  ...sac,
                  status_pos_venda: e.target.value as SacForm["status_pos_venda"],
                })
              }
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="CONCLUIDO">Concluído</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Data do contato
            </label>
            <input
              type="date"
              value={sac.data_pos_venda}
              onChange={(e) => onSacChange({ ...sac, data_pos_venda: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Responsável pelo contato
            </label>
            <input
              type="text"
              value={sac.responsavel_pos_venda}
              placeholder="Nome de quem fez o contato"
              onChange={(e) => onSacChange({ ...sac, responsavel_pos_venda: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            onClick={onSalvarSac}
            disabled={savingSac}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingSac ? "Salvando..." : "Salvar SAC"}
          </button>
          {msgSac && <span className="text-sm text-muted-foreground">{msgSac}</span>}
        </div>
      </div>
    </div>
  );
}
