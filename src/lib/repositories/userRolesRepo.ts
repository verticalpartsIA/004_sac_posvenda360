import { supabase } from "@/integrations/supabase/client";
import type { Database, TablesInsert } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

/** Acesso a dados da tabela `user_roles`. */
export function listAll() {
  return supabase.from("user_roles").select("user_id, role").order("user_id");
}

export function remove(userId: string, role: AppRole) {
  return supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
}

export function add(entry: TablesInsert<"user_roles">) {
  return supabase.from("user_roles").insert(entry);
}
