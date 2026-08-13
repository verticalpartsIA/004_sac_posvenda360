import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `nps_records`. */
export function listAll() {
  return supabase.from("nps_records").select("*").order("survey_date", { ascending: false });
}

export function insert(payload: TablesInsert<"nps_records">) {
  return supabase.from("nps_records").insert(payload);
}
