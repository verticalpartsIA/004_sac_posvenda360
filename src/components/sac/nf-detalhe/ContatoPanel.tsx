import { Link } from "@tanstack/react-router";
import { MessageCircle, Phone, Save } from "lucide-react";
import { fmtDate } from "./helpers";
import type { NFDetalhe } from "./types";

export type ContatoForm = { whatsapp: string; email: string; contato_nome: string };

export function ContatoPanel({
  nf,
  contato,
  onContatoChange,
  savingContato,
  msgContato,
  onSalvarContato,
}: {
  nf: NFDetalhe;
  contato: ContatoForm;
  onContatoChange: (v: ContatoForm) => void;
  savingContato: boolean;
  msgContato: string;
  onSalvarContato: () => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground text-xs block mb-0.5">Transportadora</span>
          <span>{nf.transportadora ?? "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block mb-0.5">Rastreio</span>
          <span className="font-mono text-xs">{nf.codigo_rastreio ?? "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block mb-0.5">Previsão entrega</span>
          <span>{fmtDate(nf.previsao_entrega)}</span>
        </div>
        <div>
          <label className="text-muted-foreground text-xs block mb-0.5">Contato</label>
          <input
            type="text"
            value={contato.contato_nome}
            onChange={(e) => onContatoChange({ ...contato, contato_nome: e.target.value })}
            placeholder="Nome do contato"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-muted-foreground text-xs block mb-0.5">WhatsApp</label>
          <input
            type="tel"
            value={contato.whatsapp}
            onChange={(e) => onContatoChange({ ...contato, whatsapp: e.target.value })}
            placeholder="55 11 9xxxx-xxxx"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-muted-foreground text-xs block mb-0.5">E-mail</label>
          <input
            type="email"
            value={contato.email}
            onChange={(e) => onContatoChange({ ...contato, email: e.target.value })}
            placeholder="email@empresa.com"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
        {contato.whatsapp && (
          <Link
            to="/whatsapp-threads"
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Conversar no WhatsApp
          </Link>
        )}
        {contato.whatsapp && (
          <a
            href={`tel:${contato.whatsapp}`}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Phone className="h-3.5 w-3.5" /> Ligar
          </a>
        )}
        <button
          onClick={onSalvarContato}
          disabled={savingContato}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {savingContato ? "Salvando..." : "Salvar contato"}
        </button>
        {msgContato && <span className="text-xs text-muted-foreground">{msgContato}</span>}
      </div>
    </div>
  );
}
