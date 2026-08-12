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

const CAMPOS_PENDENTES =
  "id,nf_numero,chave_nfe,numero_pedido_omie,razao_social_cliente,classe_abc,valor_total,data_emissao,previsao_entrega,status_entrega,status_pos_venda,transportadora,codigo_rastreio,pesquisa_enviada,faturado,data_faturamento";

/** NFs com Entrega e/ou SAC ainda não concluídos (tela /sac). */
export function listPendentes() {
  return supabase
    .from("sac_notas_fiscais")
    .select(CAMPOS_PENDENTES)
    .or("status_entrega.neq.ENTREGUE,status_pos_venda.neq.CONCLUIDO")
    .order("data_emissao", { ascending: false })
    .limit(1000);
}

const CAMPOS_CONCLUIDAS =
  "id,nf_numero,chave_nfe,numero_pedido_omie,razao_social_cliente,classe_abc,valor_total,data_emissao,data_entrega_real,data_pos_venda,responsavel_pos_venda,pesquisa_enviada";

/** NFs com devolução (total ou parcial) — indicador de prejuízo (tela /gestor/kpis). */
export function listDevolvidas() {
  return supabase
    .from("sac_notas_fiscais")
    .select("valor_total,devolvido,devolvido_parcial,data_emissao")
    .or("devolvido.eq.true,devolvido_parcial.eq.true");
}

/** NFs com Entrega e SAC já concluídos (tela /sac/concluidos). */
export function listConcluidas() {
  return supabase
    .from("sac_notas_fiscais")
    .select(CAMPOS_CONCLUIDAS)
    .eq("status_entrega", "ENTREGUE")
    .eq("status_pos_venda", "CONCLUIDO")
    .order("data_pos_venda", { ascending: false })
    .limit(1000);
}
