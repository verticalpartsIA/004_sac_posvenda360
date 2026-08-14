import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as devolucoesRepo from "@/lib/repositories/devolucoesRepo";
import * as conferenciaStorageRepo from "@/lib/repositories/conferenciaStorageRepo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  PackageX,
  PackageCheck,
  PackageOpen,
  Camera,
  X,
  RefreshCw,
  CheckCircle2,
  Ban,
} from "lucide-react";

export const Route = createFileRoute("/_app/sac/devolucoes")({
  component: DevolucoesPage,
});

type DevolucaoRow = {
  id: string;
  nf_id: string;
  motivo: string;
  status: "aberta" | "recebida" | "concluida" | "cancelada";
  valor_estimado: number | null;
  observacoes_abertura: string | null;
  aberta_em: string;
  aberta_por: string | null;
  recebida_em: string | null;
  recebida_por: string | null;
  quantidade_recebida: number | null;
  condicao_recebimento: "perfeita" | "avariada" | "incompleta" | null;
  fotos: string[] | null;
  observacoes_recebimento: string | null;
  concluida_em: string | null;
  valor_prejuizo_final: number | null;
  observacoes_conclusao: string | null;
  sac_notas_fiscais: { nf_numero: string; numero_pedido_omie: string | null; razao_social_cliente: string | null } | null;
};

const MOTIVO_LABEL: Record<string, string> = {
  devolucao_total: "Devolução Total",
  devolucao_parcial: "Devolução Parcial",
};

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function DevolucoesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DevolucaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"aberta" | "recebida" | "concluida">("aberta");
  const [recebendoId, setRecebendoId] = useState<string | null>(null);
  const [concluindoId, setConcluindoId] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const { data, error } = await devolucoesRepo.listAll();
    if (error) console.error("[devolucoes] load error:", error.message);
    setRows((data as unknown as DevolucaoRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void carregar(); }, []);

  const filtradas = rows.filter((r) => r.status === tab);
  const contadores = {
    aberta: rows.filter((r) => r.status === "aberta").length,
    recebida: rows.filter((r) => r.status === "recebida").length,
    concluida: rows.filter((r) => r.status === "concluida").length,
  };

  async function cancelar(id: string) {
    if (!confirm("Cancelar esta devolução? Isso não pode ser desfeito.")) return;
    const motivo = prompt("Motivo do cancelamento (opcional):") ?? null;
    const { error } = await devolucoesRepo.update(id, {
      status: "cancelada",
      cancelada_em: new Date().toISOString(),
      cancelada_por: user?.email ?? null,
      motivo_cancelamento: motivo,
    });
    if (error) { console.error("[devolucoes] cancelar error:", error.message); return; }
    void carregar();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">SAC</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Devoluções de Produto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Expedição confirma o recebimento físico na portaria · SAC/Gestor fecha o prejuízo
        </p>
      </div>

      <div className="flex items-center gap-2">
        <TabButton active={tab === "aberta"} onClick={() => setTab("aberta")} icon={PackageX} label="Aguardando chegada" count={contadores.aberta} />
        <TabButton active={tab === "recebida"} onClick={() => setTab("recebida")} icon={PackageOpen} label="Recebidas" count={contadores.recebida} />
        <TabButton active={tab === "concluida"} onClick={() => setTab("concluida")} icon={PackageCheck} label="Concluídas" count={contadores.concluida} />
        <button onClick={carregar} className="ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <PackageX className="h-8 w-8 text-muted-foreground/40 mb-2" />
          {tab === "aberta" && "Nenhuma devolução aguardando chegada."}
          {tab === "recebida" && "Nenhuma devolução recebida aguardando fechamento."}
          {tab === "concluida" && "Nenhuma devolução concluída ainda."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((d) => (
            <div key={d.id} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-elegant)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/sac/$nf"
                      params={{ nf: d.nf_id }}
                      className="font-semibold tabular-nums hover:text-gold hover:underline"
                    >
                      Pedido {d.sac_notas_fiscais?.numero_pedido_omie ?? d.sac_notas_fiscais?.nf_numero ?? "—"}
                    </Link>
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      {MOTIVO_LABEL[d.motivo] ?? d.motivo}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{d.sac_notas_fiscais?.razao_social_cliente ?? "—"}</p>
                  {d.observacoes_abertura && <p className="text-xs text-muted-foreground mt-1">"{d.observacoes_abertura}"</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-semibold tabular-nums">{fmt(d.valor_estimado)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Aberta em {fmtDate(d.aberta_em)} · há {diasDesde(d.aberta_em)}d
                    {d.aberta_por && ` · ${d.aberta_por}`}
                  </div>
                </div>
              </div>

              {tab === "aberta" && (
                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  <button
                    onClick={() => setRecebendoId(d.id)}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    <PackageOpen className="h-4 w-4" /> Registrar recebimento
                  </button>
                  <button
                    onClick={() => cancelar(d.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancelar
                  </button>
                </div>
              )}

              {tab === "recebida" && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Info label="Recebido em" value={fmtDate(d.recebida_em)} />
                    <Info label="Recebido por" value={d.recebida_por ?? "—"} />
                    <Info label="Quantidade" value={d.quantidade_recebida != null ? String(d.quantidade_recebida) : "—"} />
                    <Info label="Condição" value={CONDICAO_LABEL[d.condicao_recebimento ?? ""] ?? "—"} />
                  </div>
                  {d.observacoes_recebimento && <p className="text-xs text-muted-foreground">"{d.observacoes_recebimento}"</p>}
                  {d.fotos && d.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {d.fotos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-lg border object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setConcluindoId(d.id)}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Concluir devolução
                  </button>
                </div>
              )}

              {tab === "concluida" && (
                <div className="mt-3 border-t pt-3 space-y-1 text-xs">
                  <p>
                    Concluída em <strong>{fmtDate(d.concluida_em)}</strong> · prejuízo final{" "}
                    <strong className="text-destructive">{fmt(d.valor_prejuizo_final)}</strong>
                  </p>
                  {d.observacoes_conclusao && <p className="text-muted-foreground">"{d.observacoes_conclusao}"</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {recebendoId && (
        <ReceberModal
          onClose={() => setRecebendoId(null)}
          onSave={async (vals) => {
            const fotos: string[] = [];
            for (const file of vals.fotos) {
              const { publicUrl } = await conferenciaStorageRepo.uploadFotoDevolucao(recebendoId, fotos.length, file);
              if (publicUrl) fotos.push(publicUrl);
            }
            const { error } = await devolucoesRepo.update(recebendoId, {
              status: "recebida",
              recebida_em: new Date().toISOString(),
              recebida_por: user?.email ?? null,
              quantidade_recebida: vals.quantidade,
              condicao_recebimento: vals.condicao,
              observacoes_recebimento: vals.observacoes || null,
              fotos: fotos.length ? fotos : null,
            });
            if (error) { console.error("[devolucoes] receber error:", error.message); return; }
            setRecebendoId(null);
            void carregar();
          }}
        />
      )}

      {concluindoId && (
        <ConcluirModal
          valorSugerido={rows.find((r) => r.id === concluindoId)?.valor_estimado ?? 0}
          onClose={() => setConcluindoId(null)}
          onSave={async (vals) => {
            const { error } = await devolucoesRepo.update(concluindoId, {
              status: "concluida",
              concluida_em: new Date().toISOString(),
              concluida_por: user?.email ?? null,
              valor_prejuizo_final: vals.valorFinal,
              observacoes_conclusao: vals.observacoes || null,
            });
            if (error) { console.error("[devolucoes] concluir error:", error.message); return; }
            setConcluindoId(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

const CONDICAO_LABEL: Record<string, string> = {
  perfeita: "Perfeita",
  avariada: "Avariada",
  incompleta: "Incompleta",
};

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-foreground text-background" : "bg-card hover:bg-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-background/20" : "bg-muted")}>{count}</span>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ReceberModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (v: { quantidade: number | null; condicao: "perfeita" | "avariada" | "incompleta"; observacoes: string; fotos: File[] }) => Promise<void>;
}) {
  const [quantidade, setQuantidade] = useState("");
  const [condicao, setCondicao] = useState<"perfeita" | "avariada" | "incompleta">("perfeita");
  const [observacoes, setObservacoes] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({ quantidade: quantidade ? Number(quantidade) : null, condicao, observacoes, fotos });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Registrar recebimento</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Quantidade recebida</label>
            <input type="number" min={0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm" placeholder="Ex: 3" />
          </div>
          <div>
            <label className="text-sm font-medium">Condição do produto</label>
            <select value={condicao} onChange={(e) => setCondicao(e.target.value as typeof condicao)}
              className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <option value="perfeita">Perfeita</option>
              <option value="avariada">Avariada</option>
              <option value="incompleta">Incompleta</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Fotos (opcional)</label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <Camera className="h-4 w-4" /> {fotos.length ? `${fotos.length} foto(s) selecionada(s)` : "Adicionar fotos"}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
            </label>
          </div>
          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              className="mt-1 w-full resize-none rounded-lg border bg-muted/40 px-3 py-2 text-sm" placeholder="Ex: caixa amassada, faltou 1 unidade..." />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60">
              {saving ? "Salvando..." : "Confirmar recebimento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConcluirModal({
  valorSugerido,
  onClose,
  onSave,
}: {
  valorSugerido: number;
  onClose: () => void;
  onSave: (v: { valorFinal: number; observacoes: string }) => Promise<void>;
}) {
  const [valor, setValor] = useState(String(valorSugerido ?? 0));
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({ valorFinal: Number(valor) || 0, observacoes });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Concluir devolução</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Prejuízo final (R$)</label>
            <input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm" />
            <p className="mt-1 text-[11px] text-muted-foreground">Pré-preenchido com o valor estimado da NF — ajuste se o prejuízo real foi diferente.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Observações de fechamento</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              className="mt-1 w-full resize-none rounded-lg border bg-muted/40 px-3 py-2 text-sm" placeholder="Ex: reembolso processado, crédito gerado..." />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving ? "Salvando..." : "Concluir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
