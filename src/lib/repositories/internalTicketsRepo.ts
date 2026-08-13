import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `internal_tickets` (chamados internos). */
export function listAll() {
  return supabase.from("internal_tickets").select("*").order("opened_at", { ascending: false });
}

export function insert(payload: TablesInsert<"internal_tickets">) {
  return supabase.from("internal_tickets").insert(payload).select("id").single();
}

export function update(id: string, patch: TablesUpdate<"internal_tickets">) {
  return supabase.from("internal_tickets").update(patch).eq("id", id);
}
