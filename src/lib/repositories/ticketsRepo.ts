import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `tickets` (ocorrências do SAC). */
export function listAll() {
  return supabase.from("tickets").select("*").order("created_at", { ascending: false });
}

export function insert(payload: TablesInsert<"tickets">) {
  return supabase.from("tickets").insert(payload).select("*").single();
}

export function update(id: string, patch: TablesUpdate<"tickets">) {
  return supabase.from("tickets").update(patch).eq("id", id);
}

export function remove(id: string) {
  return supabase.from("tickets").delete().eq("id", id);
}
