import { Truck, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "./helpers";
import { SimNao } from "./SimNao";
import type { NFDetalhe } from "./types";

export type ExpedicaoForm = {
  tipo_entrega: "TRANSPORTADORA" | "ENTREGA_PROPRIA" | "RETIRADA_CLIENTE";
  transportadora: string;
  codigo_rastreio: string;
  retirado_por: string;
  data_coleta: string;
  transportadora_entregou: boolean | null;
  data_entrega_real: string;
  comprovante_entrega: string;
};

export function ExpedicaoPanel({
  exp,
  onExpChange,
  statusCalculado,
  savingExp,
  msgExp,
  onSalvarExpedicao,
}: {
  exp: ExpedicaoForm;
  onExpChange: (v: ExpedicaoForm) => void;
  statusCalculado: NFDetalhe["status_entrega"];
  savingExp: boolean;
  msgExp: string;
  onSalvarExpedicao: () => void;
}) {
  const cfg = STATUS_CONFIG[statusCalculado];
  const Icon = cfg.icon;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-amber-50 px-5 py-3">
        <Truck className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-amber-800">Expedição — Confirmação de Entrega</h2>
      </div>
      <div className="p-5 space-y-4">
        {/* Linha 1: Status + Tipo de entrega */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Status da entrega
            </label>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                cfg.cls,
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {cfg.label}
              <span className="ml-auto text-xs opacity-60">calculado automaticamente</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tipo de entrega
            </label>
            <select
              value={exp.tipo_entrega}
              onChange={(e) =>
                onExpChange({
                  ...exp,
                  tipo_entrega: e.target.value as ExpedicaoForm["tipo_entrega"],
                })
              }
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="TRANSPORTADORA">Transportadora</option>
              <option value="ENTREGA_PROPRIA">Entrega própria (VerticalParts)</option>
              <option value="RETIRADA_CLIENTE">Retirada pelo cliente</option>
            </select>
          </div>
        </div>

        {/* Campos condicionais por tipo */}
        {exp.tipo_entrega === "TRANSPORTADORA" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Transportadora
              </label>
              <input
                type="text"
                value={exp.transportadora}
                placeholder="Ex.: Correios, Jadlog, Sequoia…"
                onChange={(e) => onExpChange({ ...exp, transportadora: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Código de rastreio
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={exp.codigo_rastreio}
                  placeholder="Ex.: AA123456789BR"
                  onChange={(e) =>
                    onExpChange({ ...exp, codigo_rastreio: e.target.value.toUpperCase() })
                  }
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm font-mono"
                />
                {exp.codigo_rastreio && (
                  <a
                    href={`https://rastreamento.correios.com.br/app/index.php?objetos=${exp.codigo_rastreio}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted shrink-0"
                  >
                    Rastrear
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {exp.tipo_entrega === "RETIRADA_CLIENTE" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Quem retirou
            </label>
            <input
              type="text"
              value={exp.retirado_por}
              placeholder="Nome completo e documento (RG/CPF)"
              onChange={(e) => onExpChange({ ...exp, retirado_por: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        {/* Datas + comprovante */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {exp.tipo_entrega === "RETIRADA_CLIENTE"
                ? "Data da retirada"
                : "Data coleta / retirada"}
            </label>
            <input
              type="date"
              value={exp.data_coleta}
              onChange={(e) => onExpChange({ ...exp, data_coleta: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Data de entrega real
            </label>
            <input
              type="date"
              value={exp.data_entrega_real}
              onChange={(e) => onExpChange({ ...exp, data_entrega_real: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Comprovante de entrega
            </label>
            <input
              type="text"
              value={exp.comprovante_entrega}
              placeholder="Código, protocolo ou observação"
              onChange={(e) => onExpChange({ ...exp, comprovante_entrega: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {exp.tipo_entrega === "TRANSPORTADORA" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Transportadora entregou?
            </label>
            <SimNao
              value={exp.transportadora_entregou}
              onChange={(v) => onExpChange({ ...exp, transportadora_entregou: v })}
            />
          </div>
        )}
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            onClick={onSalvarExpedicao}
            disabled={savingExp}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingExp ? "Salvando..." : "Salvar Expedição"}
          </button>
          {msgExp && <span className="text-sm text-muted-foreground">{msgExp}</span>}
        </div>
      </div>
    </div>
  );
}
