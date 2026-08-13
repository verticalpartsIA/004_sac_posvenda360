/**
 * Mapa de vídeos-tutorial por rota.
 *
 * Piloto: os vídeos ficam no YouTube como "Não listado" (qualquer pessoa com o
 * link assiste, mas não aparece em busca/canal). Aqui guardamos apenas a URL de
 * embed — nenhum vídeo é armazenado no Supabase. Para adicionar/trocar um
 * tutorial, edite este arquivo (não há tabela no banco por enquanto; quando
 * não-devs precisarem editar sem deploy, migrar para uma tabela `tutoriais`).
 *
 * A chave é o `pathname` da rota (ex.: "/dashboard").
 */
export type Tutorial = {
  titulo: string;
  /**
   * URL de embed. YouTube: `https://www.youtube-nocookie.com/embed/<id>`
   * (domínio nocookie = privacidade aprimorada, sem cookies de rastreamento).
   */
  embedUrl: string;
};

const TUTORIAIS: Record<string, Tutorial> = {
  "/dashboard": {
    titulo: "Como usar o Dashboard",
    embedUrl: "https://www.youtube-nocookie.com/embed/sOOyyUyBfd8",
  },
};

/** Retorna o tutorial da rota informada, ou `null` se não houver. */
export function getTutorial(rota: string): Tutorial | null {
  return TUTORIAIS[rota] ?? null;
}
