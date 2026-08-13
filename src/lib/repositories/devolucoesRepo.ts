import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `sac_devolucoes`. */
export function listByNfId(nfId: string) {
  return supabase
    .from("sac_devolucoes")
    .select("id,motivo,status,valor_estimado,aberta_em")
    .eq("nf_id", nfId)
    .order("aberta_em", { ascending: false });
}

/** Todas as devoluções (aberta/recebida/concluída/cancelada), mais recentes primeiro (tela /sac/devolucoes). */
export function listAll() {
  return supabase
    .from("sac_devolucoes")
    .select(
      "id,nf_id,motivo,status,valor_estimado,observacoes_abertura,aberta_em,aberta_por," +
        "recebida_em,recebida_por,quantidade_recebida,condicao_recebimento,fotos,observacoes_recebimento," +
        "concluida_em,valor_prejuizo_final,observacoes_conclusao," +
        "sac_notas_fiscais(nf_numero,numero_pedido_omie,razao_social_cliente)",
    )
    .order("aberta_em", { ascending: false })
    .limit(300);
}

export function abrir(payload: TablesInsert<"sac_devolucoes">) {
  return supabase.from("sac_devolucoes").insert(payload);
}

export function update(id: string, patch: TablesUpdate<"sac_devolucoes">) {
  return supabase.from("sac_devolucoes").update(patch).eq("id", id);
}
