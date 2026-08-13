/**
 * Mapa de vídeos-tutorial por rota.
 *
 * Os vídeos são auto-hospedados no Supabase Storage (bucket público
 * `Videos_Tutoriais`) e servidos como MP4 direto — sem YouTube/Drive, sem
 * moderação, sem login, sem trava de bot. Aqui guardamos apenas a URL pública.
 * Para adicionar/trocar: suba o mp4 no bucket e ajuste a URL aqui.
 *
 * A chave é o `pathname` da rota (ex.: "/dashboard").
 */
export type Tutorial = {
  titulo: string;
  /** URL pública do arquivo .mp4 (Supabase Storage, bucket público). */
  videoUrl: string;
};

const TUTORIAIS: Record<string, Tutorial> = {
  "/dashboard": {
    titulo: "Como usar o Dashboard",
    videoUrl:
      "https://jkbklzlbhhfnamaeislb.supabase.co/storage/v1/object/public/Videos_Tutoriais/dashboard.mp4",
  },
};

/** Retorna o tutorial da rota informada, ou `null` se não houver. */
export function getTutorial(rota: string): Tutorial | null {
  return TUTORIAIS[rota] ?? null;
}
