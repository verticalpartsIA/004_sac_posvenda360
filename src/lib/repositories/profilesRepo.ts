import { supabase } from "@/integrations/supabase/client";

/** Acesso a dados da tabela `profiles`. */
export function listAll() {
  return supabase.from("profiles").select("user_id, display_name, departamento");
}
