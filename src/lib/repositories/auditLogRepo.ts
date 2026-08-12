import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `audit_log`. */
export function registrar(entry: TablesInsert<"audit_log">) {
  return supabase.from("audit_log").insert(entry);
}
