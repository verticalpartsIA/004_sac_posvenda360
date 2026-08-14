import { supabase } from "@/integrations/supabase/client";

/** Acesso a dados da tabela `sla_config` (prazo em horas por prioridade — ver #90). */
export function listAll() {
  return supabase.from("sla_config").select("priority, hours");
}
