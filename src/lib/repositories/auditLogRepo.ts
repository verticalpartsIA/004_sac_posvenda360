import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/** Acesso a dados da tabela `audit_log`. */
export function registrar(entry: TablesInsert<"audit_log">) {
  return supabase.from("audit_log").insert(entry);
}

export type AuditLogFiltros = { entityType?: string; action?: string; actorName?: string };

/** Lista paginada do audit_log, mais recente primeiro, com filtros opcionais. */
export function listPaginado(filtros: AuditLogFiltros, range: { from: number; to: number }) {
  let query = supabase
    .from("audit_log")
    .select("id, created_at, entity_type, entity_id, action, actor_name, payload")
    .order("created_at", { ascending: false })
    .range(range.from, range.to);

  if (filtros.entityType) query = query.eq("entity_type", filtros.entityType);
  if (filtros.action) query = query.eq("action", filtros.action);
  if (filtros.actorName) query = query.ilike("actor_name", `%${filtros.actorName}%`);

  return query;
}
