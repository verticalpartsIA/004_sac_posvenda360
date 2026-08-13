import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `sac_pesquisas` (NPS). */
export function getByNfId(nfId: string) {
  return supabase.from("sac_pesquisas").select("*").eq("nf_id", nfId).maybeSingle();
}

export function update(id: string, patch: TablesUpdate<"sac_pesquisas">) {
  return supabase.from("sac_pesquisas").update(patch).eq("id", id);
}

export function insert(payload: TablesInsert<"sac_pesquisas">) {
  return supabase.from("sac_pesquisas").insert(payload);
}

/** Pesquisas já respondidas, mais recente primeiro — alimenta o NPS consolidado do Store (ver #67). */
export function listRespondidas() {
  return supabase
    .from("sac_pesquisas")
    .select(
      "id,nps_score,observacoes,respondida_em,created_at,sac_notas_fiscais(razao_social_cliente,nf_numero)",
    )
    .not("respondida_em", "is", null)
    .order("respondida_em", { ascending: false });
}
