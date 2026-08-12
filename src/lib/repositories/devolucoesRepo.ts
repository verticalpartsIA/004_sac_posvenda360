import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `sac_devolucoes`. */
export function listByNfId(nfId: string) {
  return supabase
    .from("sac_devolucoes")
    .select("id,motivo,status,valor_estimado,aberta_em")
    .eq("nf_id", nfId)
    .order("aberta_em", { ascending: false });
}

export function abrir(payload: TablesInsert<"sac_devolucoes">) {
  return supabase.from("sac_devolucoes").insert(payload);
}
