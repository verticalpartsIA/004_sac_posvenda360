import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/app/Logo";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { categorizeNps, NPS_CATEGORY_LABEL } from "@/lib/types";

export const Route = createFileRoute("/nps/form/$token")({ component: PublicNpsForm });

type PesquisaContext =
  | { checked: false }
  | { checked: true; isSacPesquisa: false }
  | { checked: true; isSacPesquisa: true; jaRespondida: boolean; nfNumero: string | null; clienteNome: string | null };

function PublicNpsForm() {
  const { token } = Route.useParams();
  const { submitNpsSurvey } = useStore();
  const [ctx, setCtx] = useState<PesquisaContext>({ checked: false });
  const [q1, setQ1] = useState<number | null>(null);
  const [q2, setQ2] = useState<number | null>(null);
  const [q3, setQ3] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submittedCategory, setSubmittedCategory] = useState<ReturnType<typeof categorizeNps> | null>(null);

  useEffect(() => {
    let alive = true;
    // Resolve o token contra sac_pesquisas — a pesquisa real disparada por
    // WhatsApp após entrega, vinculada a uma NF. Se não for encontrada,
    // trata como pesquisa genérica (fluxo antigo, ligada a um ticket).
    fetch(`/api/sac/pesquisa?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { found: boolean; jaRespondida?: boolean; nfNumero?: string | null; clienteNome?: string | null }) => {
        if (!alive) return;
        if (d.found) {
          setCtx({ checked: true, isSacPesquisa: true, jaRespondida: !!d.jaRespondida, nfNumero: d.nfNumero ?? null, clienteNome: d.clienteNome ?? null });
        } else {
          setCtx({ checked: true, isSacPesquisa: false });
        }
      })
      .catch(() => { if (alive) setCtx({ checked: true, isSacPesquisa: false }); });
    return () => { alive = false; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q1 === null || q2 === null || q3 === null) {
      toast.error("Por favor, responda todas as perguntas.");
      return;
    }
    const category = categorizeNps(q1);

    if (ctx.checked && ctx.isSacPesquisa) {
      setSubmitting(true);
      try {
        const observacoes = [
          `Satisfação com resolução/agilidade: ${q2}/10.`,
          `Atendimento: ${q3}/10.`,
          comment ? `Feedback: ${comment}` : null,
        ].filter(Boolean).join(" ");

        const r = await fetch("/api/sac/pesquisa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, npsScore: q1, observacoes }),
        });
        if (!r.ok) {
          toast.error("Esta pesquisa já foi respondida ou o link não é mais válido.");
          setCtx({ ...ctx, jaRespondida: true });
          return;
        }
        setSubmittedCategory(category);
        setDone(true);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Fluxo genérico (fora do disparo por NF) — mantém o comportamento anterior.
    submitNpsSurvey({
      customer: `Cliente (token ${token.slice(0, 8)})`,
      customerTier: "B",
      q1Recomendacao: q1,
      q2Resolucao: q2,
      q3Agilidade: q3,
      feedback: comment || undefined,
      trigger: "pos_resolucao",
    });
    setSubmittedCategory(category);
    setDone(true);
  };

  if (ctx.checked && ctx.isSacPesquisa && ctx.jaRespondida && !done) {
    return (
      <PublicShell>
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center text-2xl">✓</div>
          <h1 className="mt-4 text-xl font-semibold">Pesquisa já respondida</h1>
          <p className="mt-1 text-sm text-muted-foreground">Obrigado! Já recebemos sua resposta anteriormente para esta entrega.</p>
        </div>
      </PublicShell>
    );
  }

  if (done) {
    return (
      <PublicShell>
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-success/15 text-success grid place-items-center text-2xl">✓</div>
          <h1 className="mt-4 text-xl font-semibold">Obrigado pela sua resposta!</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sua opinião ajuda a VerticalParts a melhorar continuamente.</p>
          {submittedCategory && (
            <div className="mt-4 inline-flex rounded-full border border-gold/40 bg-gold-soft/40 px-4 py-1.5 text-xs font-semibold">
              Você foi classificado como: {NPS_CATEGORY_LABEL[submittedCategory]}
            </div>
          )}
        </div>
      </PublicShell>
    );
  }

  const nfContext = ctx.checked && ctx.isSacPesquisa ? ctx : null;

  return (
    <PublicShell>
      <form onSubmit={submit} className="space-y-6 rounded-xl border bg-card p-6 sm:p-8">
        <div>
          <p className="text-xs text-muted-foreground">
            {nfContext?.nfNumero ? `Pesquisa sobre a NF ${nfContext.nfNumero}` : `Pesquisa #${token.slice(0, 8)}`}
            {nfContext?.clienteNome ? ` — ${nfContext.clienteNome}` : ""}
          </p>
          <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Sua opinião é importante</h1>
          <p className="mt-1 text-sm text-muted-foreground">3 perguntas rápidas — escala 0 (nada provável) a 10 (extremamente provável).</p>
        </div>
        <Scale label="1. Quão provável é você recomendar a VerticalParts a um colega?" value={q1} onChange={setQ1} />
        <Scale label="2. Qual seu nível de satisfação com a resolução / agilidade?" value={q2} onChange={setQ2} />
        <Scale label="3. Como avalia o atendimento recebido?" value={q3} onChange={setQ3} />
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Feedback (opcional — texto ou áudio em breve)</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </label>
        {q1 !== null && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Pré-classificação: <strong className="text-foreground">{NPS_CATEGORY_LABEL[categorizeNps(q1)]}</strong>
          </div>
        )}
        <button disabled={submitting} className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {submitting ? "Enviando..." : "Enviar resposta"}
        </button>
      </form>
    </PublicShell>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button type="button" key={i} onClick={() => onChange(i)}
            className={`aspect-square rounded-md border text-xs font-semibold transition-colors ${
              value === i ? "border-gold bg-gold text-black" : "hover:border-gold/60"
            }`}>{i}</button>
        ))}
      </div>
    </div>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-black px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        © VerticalParts · <Link to="/login" className="hover:text-gold">Acesso interno</Link>
      </footer>
    </div>
  );
}
