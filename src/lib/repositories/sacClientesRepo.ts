import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `sac_clientes`. */
export function updateByCnpj(cnpj: string, patch: TablesUpdate<"sac_clientes">) {
  return supabase.from("sac_clientes").update(patch).eq("cnpj", cnpj);
}
