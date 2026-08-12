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
