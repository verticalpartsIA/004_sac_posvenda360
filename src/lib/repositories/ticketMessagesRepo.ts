import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `ticket_messages` (respostas de chamados internos). Projeção
 * enxuta: mapInternalResponse só lê id/created_at/author_name/body, e o carregamento do
 * Store filtra por internal_ticket_id — attachments/author_id/kind/ticket_id ficam de fora
 * (ver #109). */
export function listAll() {
  return supabase
    .from("ticket_messages")
    .select("id, created_at, author_name, body, internal_ticket_id")
    .order("created_at", { ascending: true });
}

export function insert(payload: TablesInsert<"ticket_messages">) {
  return supabase.from("ticket_messages").insert(payload);
}
