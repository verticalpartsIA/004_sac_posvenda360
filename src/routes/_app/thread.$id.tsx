import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Send,
  RefreshCw,
  Phone,
  ExternalLink,
  CheckCheck,
} from "lucide-react";

export const Route = createFileRoute("/_app/thread/$id")({ component: ThreadView });

// ─── tipos ────────────────────────────────────────────────────────────────────
type WaMsg = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

// ─── helpers ──────────────────────────────────────────────────────────────────
function jidToPhone(jid: string) {
  return jid.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@c.us", "");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function groupByDate(msgs: WaMsg[]): Array<{ date: string; items: WaMsg[] }> {
  const groups: Array<{ date: string; items: WaMsg[] }> = [];
  let currentDate = "";

  for (const msg of msgs) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: formatDate(msg.created_at), items: [] });
    }
    groups[groups.length - 1].items.push(msg);
  }

  return groups;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── componente ───────────────────────────────────────────────────────────────
function ThreadView() {
  const { id: remoteJid } = Route.useParams();
  const [messages, setMessages] = useState<WaMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contactName =
    messages.find((m) => !m.from_me)?.push_name ?? jidToPhone(remoteJid);
  const phone = jidToPhone(remoteJid);
  const linkedTicket = messages.find((m) => m.ticket_id)?.ticket_id ?? null;

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("remote_jid", remoteJid)
      .order("created_at", { ascending: true });

    if (e) { console.error("[thread] load error:", e.message); return; }
    setMessages((data as WaMsg[]) ?? []);
    setLoading(false);
  }, [remoteJid]);

  useEffect(() => {
    load();

    // Realtime: novas mensagens desta conversa chegam instantaneamente
    const channel = supabase
      .channel(`wa-thread-${remoteJid}`)
      .on<WaMsg>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `remote_jid=eq.${remoteJid}`,
        },
        (payload) => {
          setMessages((prev) => {
            // Remove o update otimista correspondente (se existir) e insere o real
            const withoutOptimistic = prev.filter(
              (m) => !(m.id.startsWith("opt-") && m.body === payload.new.body && m.from_me === payload.new.from_me),
            );
            // Evita duplicata de mensagens já presentes (ex.: própria insert do send)
            if (withoutOptimistic.some((m) => m.id === payload.new.id)) return withoutOptimistic;
            return [...withoutOptimistic, payload.new];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, remoteJid]);

  // scroll para o fim ao receber novas mensagens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── envio ─────────────────────────────────────────────────────────────────
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSendError(null);
    setSending(true);

    // Update otimista
    const optimistic: WaMsg = {
      id: `opt-${Date.now()}`,
      remote_jid: remoteJid,
      push_name: null,
      body,
      from_me: true,
      media_type: null,
      ticket_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    try {
      const r = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteJid, text: body }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Erro ao enviar");
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erro ao enviar");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(body);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const groups = groupByDate(messages);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <Link
          to="/whatsapp-threads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {initials(contactName)}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{contactName}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Phone className="h-3 w-3" />
            {remoteJid.endsWith("@lid")
              ? <span className="italic text-amber-500">contato @lid (número oculto pelo WhatsApp)</span>
              : phone}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {linkedTicket && (
            <Link
              to="/ocorrencia/$ro"
              params={{ ro: linkedTicket }}
              className="inline-flex items-center gap-1 rounded-md bg-gold/10 px-2 py-1 text-[11px] font-medium text-gold hover:bg-gold/20"
            >
              <ExternalLink className="h-3 w-3" /> Ver ticket
            </Link>
          )}
          <button
            onClick={load}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ background: "hsl(var(--muted)/0.3)" }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.date}>
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {group.date}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-1.5">
                  {group.items.map((msg, idx) => {
                    const isMe = msg.from_me;
                    const prevMsg = group.items[idx - 1];
                    const showName = !isMe && (!prevMsg || prevMsg.from_me);

                    return (
                      <div
                        key={msg.id}
                        className={cn("flex", isMe ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                            isMe
                              ? "rounded-tr-sm bg-emerald-600 text-white"
                              : "rounded-tl-sm bg-card border",
                            msg.id.startsWith("opt-") && "opacity-60",
                          )}
                        >
                          {showName && (
                            <p className="mb-0.5 text-[10px] font-semibold text-emerald-600">
                              {msg.push_name ?? jidToPhone(msg.remote_jid)}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                          <div
                            className={cn(
                              "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                              isMe ? "text-emerald-100" : "text-muted-foreground",
                            )}
                          >
                            <span>{formatTime(msg.created_at)}</span>
                            {isMe && (
                              (msg.raw as Record<string, unknown> | null)?.lid_local_only
                                ? <span className="text-[9px] opacity-70">(local)</span>
                                : <CheckCheck className="h-3 w-3" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="border-t bg-card px-4 py-3">
        {/* Aviso @lid — exibido acima do input, não substitui */}
        {remoteJid.endsWith("@lid") && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
            <span className="mt-px text-[11px] text-amber-600 dark:text-amber-400">⚠️</span>
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-amber-600 dark:text-amber-400">Contato @lid</span>
              {" "}— WhatsApp oculta o número. Mensagens salvas localmente{" "}
              <span className="font-mono text-[10px]">(local)</span>, mas podem{" "}
              <span className="font-medium">não ser entregues</span>. Para garantir entrega,
              use o WhatsApp no <span className="font-mono font-medium">(11) 99766-3780</span>.
            </p>
          </div>
        )}

        {sendError && (
          <p className="mb-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-muted/40 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            placeholder="Digite uma mensagem… (Enter envia · Shift+Enter nova linha)"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
              text.trim() && !sending
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {sending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Enviando via <span className="font-mono">pv360</span> · (11) 99766-3780
        </p>
      </div>
    </div>
  );
}
