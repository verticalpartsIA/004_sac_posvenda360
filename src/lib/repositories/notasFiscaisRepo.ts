import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/**
 * Acesso a dados da tabela `sac_notas_fiscais`.
 * Fonte única de queries — componentes não devem chamar `supabase.from("sac_notas_fiscais")` direto.
 */
export function getDetalhe(nfId: string) {
  return supabase
    .from("sac_notas_fiscais")
    .select("*, obs_omie, dados_omie, sac_clientes(nome_fantasia,whatsapp,email,telefone,contato)")
    .eq("id", nfId)
    .single();
}

export function update(nfId: string, patch: TablesUpdate<"sac_notas_fiscais">) {
  return supabase.from("sac_notas_fiscais").update(patch).eq("id", nfId);
}
