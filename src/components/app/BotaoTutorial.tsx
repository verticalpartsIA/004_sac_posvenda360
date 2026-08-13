import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTutorial } from "@/lib/tutoriais";

/**
 * Botão de vídeo-tutorial contextual por tela. Descobre a rota atual (ou usa a
 * prop `rota`), busca o tutorial correspondente em `lib/tutoriais` e abre um
 * modal com o player embutido. Se não houver tutorial para a rota, não renderiza
 * nada. O vídeo (mp4 auto-hospedado no Supabase Storage) só é montado quando o
 * modal abre.
 */
export function BotaoTutorial({ rota }: { rota?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const tutorial = getTutorial(rota ?? pathname);

  if (!tutorial) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver tutorial em vídeo: ${tutorial.titulo}`}
        title="Ver tutorial"
        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlayCircle className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Tutorial</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tutorial.titulo}</DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full overflow-hidden rounded-md border bg-black">
            {open && (
              <video controls preload="metadata" src={tutorial.videoUrl} className="h-full w-full">
                Seu navegador não suporta reprodução de vídeo.
              </video>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
