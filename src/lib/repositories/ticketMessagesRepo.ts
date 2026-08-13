import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `ticket_messages` (respostas de chamados internos). */
export function listAll() {
  return supabase.from("ticket_messages").select("*").order("created_at", { ascending: true });
}

export function insert(payload: TablesInsert<"ticket_messages">) {
  return supabase.from("ticket_messages").insert(payload);
}
