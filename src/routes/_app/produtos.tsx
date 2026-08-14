import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackToDashboard } from "@/components/app/BackToDashboard";
import type { OmieProduto } from "@/integrations/supabase/erp-client";
import { fetchProdutosAtivosFn } from "@/integrations/supabase/erp-server-fn";
import { Package, RefreshCw, Search, AlertCircle, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export const Route = createFileRoute("/_app/produtos")({
  loader: () => fetchProdutosAtivosFn(),
  component: ProdutosPage,
});

type SortCol = "codigo_produto" | "codigo" | "descricao" | "marca" | "estoque";
type SortDir = "asc" | "desc";

function SortIcon({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: SortDir } }) {
  if (sort.col !== col) return <ChevronsUpDown className="inline ml-1 h-3 w-3 opacity-40" />;
  return sort.dir === "asc"
    ? <ChevronUp className="inline ml-1 h-3 w-3" />
    : <ChevronDown className="inline ml-1 h-3 w-3" />;
}

function ProdutosPage() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "descricao", dir: "asc" });

  function toggleSort(col: SortCol) {
    setSort((prev) => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      await router.invalidate();
    } catch {
      setError("Falha ao recarregar produtos do ERP.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const list = initial.filter((p) =>
      [p.codigo_produto, p.codigo ?? "", p.descricao, p.marca ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
    );
    return [...list].sort((a, b) => {
      const av = a[sort.col] ?? "";
      const bv = b[sort.col] ?? "";
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [initial, q, sort]);

  function Th({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
    return (
      <th
        className={`px-4 py-3 cursor-pointer select-none hover:text-foreground ${right ? "text-right" : "text-left"}`}
        onClick={() => toggleSort(col)}
      >
        {label}
        <SortIcon col={col} sort={sort} />
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <BackToDashboard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">ERP · Omie</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Recarregando..." : `${initial.length} produtos ativos sincronizados do ERP`}
          </p>
        </div>
        <button
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recarregar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar produtos"
          placeholder="Buscar por código, descrição ou marca..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th col="codigo_produto" label="Cód. Omie" />
              <Th col="codigo" label="Cód. VP" />
              <Th col="descricao" label="Descrição" />
              <Th col="marca" label="Marca" />
              <Th col="estoque" label="Estoque" right />
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && !error &&
              filtered.map((p) => (
                <tr key={p.codigo_produto} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.codigo_produto}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.codigo ? (
                      <span className="font-semibold text-primary">{p.codigo}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.descricao}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.marca || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {p.estoque != null ? (
                      <span className={p.estoque > 0 ? "text-success font-semibold" : "text-destructive"}>
                        {p.estoque}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            {(loading || filtered.length === 0) && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <Package className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {loading
                    ? "Carregando produtos do ERP..."
                    : initial.length === 0
                      ? "Nenhum produto ativo no ERP."
                      : "Nenhum produto encontrado para essa busca."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
