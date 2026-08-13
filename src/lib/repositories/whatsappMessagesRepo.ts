import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type WaMsg = Tables<"whatsapp_messages">;

/** Acesso a dados da tabela `whatsapp_messages`. */
export function listByRemoteJid(remoteJid: string) {
  return supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("remote_jid", remoteJid)
    .order("created_at", { ascending: true });
}

/** As últimas mensagens de todas as conversas (tela /whatsapp-threads agrupa por remote_jid). */
export function listRecent(limit = 500) {
  return supabase
    .from("whatsapp_messages")
    .select(
      "id,remote_jid,push_name,body,from_me,ticket_id,created_at,instance,message_id,media_type,media_url,raw",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
}

export function deleteByRemoteJids(remoteJids: string[]) {
  return supabase.from("whatsapp_messages").delete().in("remote_jid", remoteJids);
}

/**
 * Assina todo INSERT novo na tabela (qualquer conversa), para a lista de
 * threads se atualizar em tempo real. Retorna uma função de cleanup.
 */
export function subscribeToAllNewMessages(
  onInsert: (msg: WaMsg) => void,
  onStatusChange: (status: "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR" | "TIMED_OUT") => void,
): () => void {
  const channel = supabase
    .channel("wa-threads-realtime")
    .on<WaMsg>(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "whatsapp_messages" },
      (payload) => onInsert(payload.new),
    )
    .subscribe((status) => onStatusChange(status));

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Assina novas mensagens (INSERT) de uma conversa em tempo real.
 * Retorna uma função de cleanup que cancela a assinatura.
 */
export function subscribeToNewMessages(
  remoteJid: string,
  onInsert: (msg: WaMsg) => void,
): () => void {
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
      (payload) => onInsert(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
