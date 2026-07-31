import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MessageCircle, Search, RefreshCw, Wifi, WifiOff, Plus, X, Send, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp-threads")({
  component: WhatsappThreads,
});

// tipos
type WaMsg = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

type Thread = {
  remoteJid: string;
  pushName: string | null;
  lastBody: string;
  lastAt: string;
  fromMe: boolean;
  ticketId: string | null;
  unread: number;
};

// helpers
function jidToPhone(jid: string) {
  return jid.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@c.us", "");
}

function displayName(t: Thread) {
  if (t.pushName) return t.pushName;
  return jidToPhone(t.remoteJid);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function toThreads(rows: WaMsg[]): Thread[] {
  const map = new Map<string, Thread>();
  const cutoff = Date.now() - 3600_000;

  for (const r of rows) {
    if (!map.has(r.remote_jid)) {
      map.set(r.remote_jid, {
        remoteJid: r.remote_jid,
        pushName: r.push_name,
        lastBody: r.body,
        lastAt: r.created_at,
        fromMe: r.from_me,
        ticketId: r.ticket_id,
        unread: 0,
      });
    }
    const t = map.get(r.remote_jid)!;
    if (!r.from_me && new Date(r.created_at).getTime() > cutoff) {
      t.unread++;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );
}

// componente modal nova conversa
function NovaConversaModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (remoteJid: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!titulo.trim() || !cleanPhone || !msg.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/whatsapp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          text: msg.trim(),
          customerName: name.trim() || undefined,
          reason: titulo.trim(),
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? "Erro ao iniciar conversa");
      }
      const result = (await r.json()) as { remoteJid: string };
      onSuccess(result.remoteJid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar conversa");
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onKeyDown={handleKey}
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl mx-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Criar ticket e iniciar conversa</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-xs text-muted-foreground">
          Um ticket é aberto junto com a conversa, para acompanhar essa ocorrência no SAC.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Título da ocorrência *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="Ex: Peça com avaria no transporte"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium">Numero WhatsApp *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="5511999999999 (DDI + DDD + numero)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Inclua o codigo do pais (55 para Brasil) e DDD, sem espacos ou tracos.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Nome do contato</label>
            <input
              className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="Ex: Joao Silva (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Primeira mensagem *</label>
            <textarea
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="Digite a mensagem inicial..."
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={!titulo.trim() || !phone.trim() || !msg.trim() || busy}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors",
                titulo.trim() && phone.trim() && msg.trim() && !busy
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {busy ? "Enviando..." : "Criar ticket e enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// modal de confirmação de exclusão
function ConfirmDeleteModal({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl mx-4">
        <h2 className="text-lg font-semibold">Excluir {count === 1 ? "conversa" : `${count} conversas`}?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Isso apaga permanentemente {count === 1 ? "as mensagens desta conversa" : "as mensagens dessas conversas"} do
          WhatsApp. Essa ação não pode ser desfeita.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// componente principal
function WhatsappThreads() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canDelete = hasRole("admin");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const msgsRef = useRef<WaMsg[]>([]);

  async function load() {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("id,remote_jid,push_name,body,from_me,ticket_id,created_at,instance,message_id,media_type,media_url,raw")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[threads] load error:", error.message);
      setOnline(false);
      setLoading(false);
      return;
    }
    setOnline(true);
    msgsRef.current = (data as WaMsg[]) ?? [];
    setThreads(toThreads(msgsRef.current));
    setLoading(false);
  }

  useEffect(() => {
    load();

    // Realtime: qualquer INSERT na tabela atualiza a lista instantaneamente
    const channel = supabase
      .channel("wa-threads-realtime")
      .on<WaMsg>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          setOnline(true);
          msgsRef.current = [payload.new, ...msgsRef.current].slice(0, 500);
          setThreads(toThreads(msgsRef.current));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setOnline(true);
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setOnline(false);
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = threads.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.pushName ?? "").toLowerCase().includes(q) ||
      jidToPhone(t.remoteJid).includes(q) ||
      t.lastBody.toLowerCase().includes(q)
    );
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.remoteJid));

  function toggleOne(remoteJid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(remoteJid)) next.delete(remoteJid);
      else next.add(remoteJid);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach((t) => next.delete(t.remoteJid));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((t) => next.add(t.remoteJid));
      return next;
    });
  }

  async function confirmDelete() {
    setDeleting(true);
    const jids = Array.from(selected);
    const { error } = await supabase.from("whatsapp_messages").delete().in("remote_jid", jids);
    setDeleting(false);
    setConfirmingDelete(false);
    if (error) {
      console.error("[threads] delete error:", error.message);
      return;
    }
    msgsRef.current = msgsRef.current.filter((m) => !jids.includes(m.remote_jid));
    setThreads(toThreads(msgsRef.current));
    setSelected(new Set());
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Comunicação</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {threads.length} conversa(s) · instancia{" "}
            <span className="font-mono text-xs">pv360</span>
            {online ? (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
                <Wifi className="h-3 w-3" /> online
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-1 text-red-500">
                <WifiOff className="h-3 w-3" /> offline
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && selected.size > 0 && (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:opacity-90 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir ({selected.size})
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Criar ticket e iniciar conversa
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-lg border bg-card py-2 pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          placeholder="Buscar por nome ou numero..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {canDelete && filtered.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAll}
            className="h-3.5 w-3.5 rounded border-input"
          />
          Selecionar tudo
        </label>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Nenhuma conversa ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mensagens recebidas ou iniciadas aparecerão aqui.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Criar ticket e iniciar conversa
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
          <ul className="divide-y">
            {filtered.map((t) => {
              const name = displayName(t);
              return (
                <li key={t.remoteJid} className="flex items-center">
                  {canDelete && (
                    <input
                      type="checkbox"
                      checked={selected.has(t.remoteJid)}
                      onChange={() => toggleOne(t.remoteJid)}
                      className="ml-4 h-3.5 w-3.5 shrink-0 rounded border-input"
                    />
                  )}
                  <Link
                    to="/thread/$id"
                    params={{ id: t.remoteJid }}
                    className="flex flex-1 items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {initials(name)}
                      </div>
                      {t.unread > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                          {t.unread}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-sm">{name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {relativeTime(t.lastAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {t.fromMe && (
                          <span className="text-[11px] text-muted-foreground">Voce:</span>
                        )}
                        <p className="truncate text-sm text-muted-foreground">{t.lastBody}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {jidToPhone(t.remoteJid)}
                        </span>
                        {t.ticketId && (
                          <span className="inline-flex items-center rounded bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                            ticket vinculado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg className="h-4 w-4 shrink-0 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Modal nova conversa */}
      {showModal && (
        <NovaConversaModal
          onClose={() => setShowModal(false)}
          onSuccess={(remoteJid) => {
            setShowModal(false);
            navigate({ to: "/thread/$id", params: { id: remoteJid } });
          }}
        />
      )}

      {/* Modal confirmação de exclusão */}
      {confirmingDelete && (
        <ConfirmDeleteModal
          count={selected.size}
          busy={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}