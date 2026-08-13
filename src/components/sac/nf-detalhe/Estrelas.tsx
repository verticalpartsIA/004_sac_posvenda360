import { cn } from "@/lib/utils";

// Estrelas 1-5
export function Estrelas({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "text-xl transition-all hover:scale-110",
            n <= (value ?? 0) ? "text-gold" : "text-muted-foreground/30",
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}
