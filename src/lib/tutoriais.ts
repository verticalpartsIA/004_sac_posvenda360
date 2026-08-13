/**
 * Mapa de vídeos-tutorial por rota.
 *
 * Os vídeos são auto-hospedados no bucket público `Videos_Tutoriais` do
 * Supabase Storage do próprio projeto (mp4, tocado com o `<video>` nativo do
 * navegador). Histórico: Google Drive (ficou privado) → YouTube (removido por
 * ToS) → YouTube re-upload (embed travava pedindo confirmação "não é robô") →
 * auto-hospedado (aqui). Plataforma pública de vídeo se mostrou host errado
 * para tutorial interno.
 *
 * Para adicionar/trocar um tutorial: suba o mp4 no bucket `Videos_Tutoriais` e
 * edite este arquivo (não há tabela no banco por enquanto; quando não-devs
 * precisarem editar sem deploy, migrar para uma tabela `tutoriais`).
 *
 * A chave é o `pathname` da rota (ex.: "/dashboard").
 */
export type Tutorial = {
  titulo: string;
  /** URL direta do mp4 (bucket público do Supabase Storage), usada em `<video src>`. */
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
