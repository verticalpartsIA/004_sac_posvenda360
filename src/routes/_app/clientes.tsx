import { createFileRoute, Link, useRouter } from "@tanstack/react-router";

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function decodeHtmlFull(str: string): string {
  // Apply twice to handle double-encoded entities (&amp;amp; → &amp; → &)
  return decodeHtml(decodeHtml(str));
}
import { useMemo, useState } from "react";
import { BackToDashboard } from "@/components/app/BackToDashboard";
import type { OmieCliente } from "@/integrations/supabase/erp-client";
import { fetchClientesAtivosFn } from "@/integrations/supabase/erp-server-fn";
import { Building2, RefreshCw, Search, AlertCircle, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export const Route = createFileRoute("/_app/clientes")({
  loader: () => fetchClientesAtivosFn(),
  component: ClientesPage,
});

type SortCol = keyof Pick<OmieCliente, "codigo_integracao" | "cnpj_cpf" | "nome" | "cidade" | "estado" | "segmento">;
type SortDir = "asc" | "desc";

function SortIcon({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: SortDir } }) {
  if (sort.col !== col) return <ChevronsUpDown className="inline ml-1 h-3 w-3 opacity-40" />;
  return sort.dir === "asc"
    ? <ChevronUp className="inline ml-1 h-3 w-3" />
    : <ChevronDown className="inline ml-1 h-3 w-3" />;
}

function ClientesPage() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "nome", dir: "asc" });

  function toggleSort(col: SortCol) {
    setSort((prev) => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      await router.invalidate();
    } catch {
      setError("Falha ao recarregar clientes do ERP.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const list = initial.filter((c) =>
      [c.cnpj_cpf, c.nome, c.email ?? "", c.cidade ?? "", c.estado ?? "", c.segmento ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
    );
    return [...list].sort((a, b) => {
      const av = a[sort.col] ?? "";
      const bv = b[sort.col] ?? "";
      const cmp = String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [initial, q, sort]);

  function Th({ col, label }: { col: SortCol; label: string }) {
    return (
      <th
        className="px-4 py-3 text-left cursor-pointer select-none hover:text-foreground"
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
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Recarregando..." : `${initial.length} clientes ativos sincronizados do ERP`}
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

      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por CNPJ/CPF, razão social, cidade, segmento..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-elegant)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th col="codigo_integracao" label="Cód. Integração" />
              <Th col="cnpj_cpf" label="CNPJ / CPF" />
              <Th col="nome" label="Razão Social" />
              <Th col="cidade" label="Cidade / UF" />
              <Th col="segmento" label="Segmento" />
              <th className="px-4 py-3 text-left">Contato</th>
              <th className="px-4 py-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && !error &&
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.codigo_integracao || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.cnpj_cpf || "—"}</td>
                  <td className="px-4 py-3 font-medium">{decodeHtmlFull(c.nome)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[c.cidade, c.estado].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.segmento ? (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {c.segmento}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.email && <div>{c.email}</div>}
                    {c.telefone && <div className="text-muted-foreground">{c.telefone}</div>}
                    {!c.email && !c.telefone && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to="/cliente/$cnpj"
                      params={{ cnpj: c.cnpj_cpf || c.id }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Ver histórico <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            {(loading || filtered.length === 0) && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <Building2 className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {loading
                    ? "Carregando clientes do ERP..."
                    : initial.length === 0
                      ? "Nenhum cliente ativo no ERP."
                      : "Nenhum cliente encontrado para essa busca."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
