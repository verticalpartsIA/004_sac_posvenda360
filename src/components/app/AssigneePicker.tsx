import { UserRound } from "lucide-react";
import type { TeamMember } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Repasse de responsável: mostra quem está com o ticket (nome real, via
 * `profiles`) e permite reatribuir para qualquer pessoa da equipe, não só
 * "atribuir a mim" (ver plano de repasse de tarefas na Dashboard).
 */
export function AssigneePicker({
  assignee,
  members,
  onChange,
  className,
}: {
  assignee: string | undefined;
  members: TeamMember[];
  onChange: (userId: string | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <select
        value={assignee ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring",
          !assignee && "text-muted-foreground",
        )}
      >
        <option value="">Sem responsável</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
