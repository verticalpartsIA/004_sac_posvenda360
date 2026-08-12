import { supabase } from "@/integrations/supabase/client";

const BUCKET = "sac-conferencia";

/**
 * Sobe a foto de conferência de um item da NF e já resolve a URL pública.
 * Acesso a dados do bucket `sac-conferencia` — componentes não devem chamar
 * `supabase.storage.from(...)` direto.
 */
export async function uploadFotoItem(nfId: string, itemIdx: number, file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${nfId}/item-${itemIdx}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) return { error, publicUrl: null };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { error: null, publicUrl: data.publicUrl };
}
