import { cn } from "@/lib/utils";

// Botão Sim/Não/Não respondeu
export function SimNao({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex gap-2">
      {([true, false, null] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v === value ? null : v)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
            value === v
              ? v === true
                ? "bg-green-500 text-white border-green-500"
                : v === false
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-muted text-muted-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          {v === true ? "Sim" : v === false ? "Não" : "—"}
        </button>
      ))}
    </div>
  );
}
