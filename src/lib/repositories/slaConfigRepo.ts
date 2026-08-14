import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TicketPriority = Database["public"]["Enums"]["ticket_priority"];

/** Acesso a dados da tabela `sla_config` (prazo em horas por prioridade — ver #90). */
export function listAll() {
  return supabase.from("sla_config").select("priority, hours");
}

/** Linha completa (horas + toggles de alerta), para a tela de configurações (ver #94). */
export function listAllFull() {
  return supabase
    .from("sla_config")
    .select("priority, hours, warn_50_pct, warn_80_pct, warn_100_pct");
}

/** `.select()` no update é proposital: sem ele, um UPDATE bloqueado pela RLS (usuário sem
 * papel admin) retorna sucesso com 0 linhas afetadas e nenhum erro — o chamador precisa
 * conferir `data` vazio pra saber que nada foi salvo de verdade (ver /admin/configuracoes). */
export function updateByPriority(
  priority: TicketPriority,
  patch: { hours: number; warn_50_pct: boolean; warn_80_pct: boolean; warn_100_pct: boolean },
) {
  return supabase.from("sla_config").update(patch).eq("priority", priority).select("priority");
}
