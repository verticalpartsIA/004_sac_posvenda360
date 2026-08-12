import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import * as whatsappMessagesRepo from "@/lib/repositories/whatsappMessagesRepo";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Send,
  RefreshCw,
  Phone,
  ExternalLink,
  CheckCheck,
  Pencil,
  Check,
  BookUser,
  Building2,
  User,
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

  // ── Agenda @lid ───────────────────────────────────────────────────────────
  const isLid = remoteJid.endsWith("@lid");
  const lidStorageKey = `lid-agenda:${remoteJid}`;

  type LidContact = { phone: string; nome: string; empresa: string };

  const [lidContact, setLidContact] = useState<LidContact | null>(() => {
    if (!isLid) return null;
    try {
      const cached = localStorage.getItem(lidStorageKey);
      return cached ? (JSON.parse(cached) as LidContact) : null;
    } catch { return null; }
  });
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [inputNome,    setInputNome]    = useState("");
  const [inputEmpresa, setInputEmpresa] = useState("");
  const [inputPhone,   setInputPhone]   = useState("");

  // Busca agenda no servidor ao montar (complementa o cache localStorage)
  useEffect(() => {
    if (!isLid) return;
    fetch(`/api/whatsapp/lid-agenda?jid=${encodeURIComponent(remoteJid)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.phone) {
          const entry: LidContact = {
            phone:   data.phone,
            nome:    data.nome    ?? "",
            empresa: data.empresa ?? "",
          };
          setLidContact(entry);
          localStorage.setItem(lidStorageKey, JSON.stringify(entry));
        }
      })
      .catch(() => {/* silencioso */});
  }, [isLid, remoteJid, lidStorageKey]);

  function openEditContact() {
    setInputNome(lidContact?.nome    ?? "");
    setInputEmpresa(lidContact?.empresa ?? "");
    setInputPhone(lidContact?.phone   ?? "");
    setEditingContact(true);
  }

  async function saveContact() {
    const cleanPhone = inputPhone.replace(/\D/g, "");
    if (!cleanPhone) return;
    setSavingContact(true);
    try {
      const r = await fetch("/api/whatsapp/lid-agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jid:     remoteJid,
          phone:   cleanPhone,
          nome:    inputNome.trim()    || null,
          empresa: inputEmpresa.trim() || null,
        }),
      });
      if (r.ok) {
        const entry: LidContact = {
          phone:   cleanPhone,
          nome:    inputNome.trim(),
          empresa: inputEmpresa.trim(),
        };
        setLidContact(entry);
        localStorage.setItem(lidStorageKey, JSON.stringify(entry));
        setEditingContact(false);
      }
    } catch { /* silencioso */ }
    finally { setSavingContact(false); }
  }

  // overridePhone derivado da agenda (para retrocompatibilidade com o send)
  const overridePhone = lidContact?.phone ?? "";

  const contactName =
    messages.find((m) => !m.from_me)?.push_name ?? jidToPhone(remoteJid);
  const phone = jidToPhone(remoteJid);
  const linkedTicket = messages.find((m) => m.ticket_id)?.ticket_id ?? null;

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data, error: e } = await whatsappMessagesRepo.listByRemoteJid(remoteJid);

    if (e) { console.error("[thread] load error:", e.message); return; }
    setMessages((data as WaMsg[]) ?? []);
    setLoading(false);
  }, [remoteJid]);

  useEffect(() => {
    load();

    // Realtime: novas mensagens desta conversa chegam instantaneamente
    const unsubscribe = whatsappMessagesRepo.subscribeToNewMessages(remoteJid, (novaMsg) => {
      setMessages((prev) => {
        // Remove o update otimista correspondente (se existir) e insere o real
        const withoutOptimistic = prev.filter(
          (m) => !(m.id.startsWith("opt-") && m.body === novaMsg.body && m.from_me === novaMsg.from_me),
        );
        // Evita duplicata de mensagens já presentes (ex.: própria insert do send)
        if (withoutOptimistic.some((m) => m.id === novaMsg.id)) return withoutOptimistic;
        return [...withoutOptimistic, novaMsg];
      });
    });

    return unsubscribe;
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
        body: JSON.stringify({
          remoteJid,
          text: body,
          ...(isLid && overridePhone ? { overridePhone } : {}),
        }),
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
          <p className="truncate font-semibold leading-tight">
            {/* Prioridade: nome da agenda > push_name das mensagens > JID */}
            {lidContact?.nome || contactName}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {lidContact?.empresa && (
              <span className="truncate text-muted-foreground">{lidContact.empresa} · </span>
            )}
            <Phone className="h-3 w-3 shrink-0" />
            {isLid
              ? lidContact?.phone
                ? <span className="font-mono">{lidContact.phone.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")}</span>
                : <span className="italic text-amber-500">número oculto (@lid)</span>
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
        {/* ── Agenda @lid ─────────────────────────────────────────────────── */}
        {isLid && (
          <div className={cn(
            "mb-2 rounded-lg border px-3 py-2 text-[11px]",
            lidContact
              ? "border-emerald-500/20 bg-emerald-500/6"
              : "border-amber-500/25 bg-amber-500/8",
          )}>

            {/* ── Estado: contato salvo na agenda ───────────────────────────── */}
            {lidContact && !editingContact && (
              <div className="flex items-start gap-2">
                <BookUser className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {lidContact.nome && (
                      <span className="font-medium text-foreground">{lidContact.nome}</span>
                    )}
                    {lidContact.empresa && (
                      <span className="text-muted-foreground">· {lidContact.empresa}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="h-2.5 w-2.5" />
                    <span className="font-mono">
                      {lidContact.phone.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")}
                    </span>
                    <span className="ml-1 text-emerald-600 dark:text-emerald-400">✓ entrega ativa</span>
                  </div>
                </div>
                <button
                  onClick={openEditContact}
                  className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Editar contato"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* ── Estado: formulário de edição / cadastro ───────────────────── */}
            {(editingContact || !lidContact) && (
              <div className="space-y-1.5">
                {!lidContact && (
                  <p className="mb-1.5 text-amber-600 dark:text-amber-400">
                    ⚠️ <span className="font-medium">@lid</span> — número oculto pelo WhatsApp.
                    Cadastre o contato para entregar mensagens.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex items-center gap-1 rounded border bg-background px-2 py-1">
                    <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <input
                      autoFocus={!lidContact}
                      type="text"
                      value={inputNome}
                      onChange={(e) => setInputNome(e.target.value)}
                      placeholder="Nome"
                      className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-1 rounded border bg-background px-2 py-1">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={inputEmpresa}
                      onChange={(e) => setInputEmpresa(e.target.value)}
                      placeholder="Empresa"
                      className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-1 items-center gap-1 rounded border bg-background px-2 py-1">
                    <Phone className="h-3 w-3 shrink-0 text-amber-500" />
                    <input
                      autoFocus={!!lidContact}
                      type="tel"
                      value={inputPhone}
                      onChange={(e) => setInputPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveContact(); if (e.key === "Escape") { if (lidContact) setEditingContact(false); } }}
                      placeholder="Telefone: 11999999999 *"
                      className="flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  {lidContact && (
                    <button
                      onClick={() => setEditingContact(false)}
                      className="rounded border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={saveContact}
                    disabled={!inputPhone.replace(/\D/g, "") || savingContact}
                    className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                  >
                    {savingContact
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Check className="h-3 w-3" />}
                    Salvar
                  </button>
                </div>
              </div>
            )}

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
