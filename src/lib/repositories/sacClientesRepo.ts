import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `sac_clientes`. */
export function updateByCnpj(cnpj: string, patch: TablesUpdate<"sac_clientes">) {
  return supabase.from("sac_clientes").update(patch).eq("cnpj", cnpj);
}

/** Telefone/nome dos clientes, para resolver o nome de exibição de tickets criados
 * automaticamente pelo WhatsApp só com o número (ver #92). */
export function listTelefones() {
  return supabase.from("sac_clientes").select("telefone, whatsapp, nome_fantasia, razao_social");
}
