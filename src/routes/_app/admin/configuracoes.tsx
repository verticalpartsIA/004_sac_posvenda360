import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BackToDashboard } from "@/components/app/BackToDashboard";
import * as slaConfigRepo from "@/lib/repositories/slaConfigRepo";
import { Save, Building, Clock, Bell, Plug, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  const [empresa, setEmpresa] = useState({
    razao: "VerticalParts Indústria Ltda",
    cnpj: "00.000.000/0001-00",
    email: "posvenda@verticalparts.com",
    telefone: "(11) 4000-0000",
  });
  const [sla, setSla] = useState({ baixa: 72, media: 48, alta: 24, critica: 12, alerta50: true, alerta80: true, alerta100: true });
  const [notif, setNotif] = useState({ email: true, whatsapp: true, npsAuto: true, npsDias: 7 });
  const [integ, setInteg] = useState({ erpUrl: "", whatsappToken: "", emailFrom: "no-reply@verticalparts.com" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [slaLoaded, setSlaLoaded] = useState(false);

  // Carrega os valores reais de `sla_config` — as outras seções (Empresa, Notificações,
  // Integrações) não têm tabela própria ainda, então continuam só com o valor local (ver #94).
  useEffect(() => {
    slaConfigRepo.listAllFull().then(({ data, error }) => {
      if (error) {
        console.error("[Configurações] Falha ao carregar sla_config", error);
        return;
      }
      if (!data?.length) return;
      const byPriority = Object.fromEntries(data.map((r) => [r.priority, r]));
      const first = data[0];
      setSla((prev) => ({
        baixa: byPriority.baixa?.hours ?? prev.baixa,
        media: byPriority.media?.hours ?? prev.media,
        alta: byPriority.alta?.hours ?? prev.alta,
        critica: byPriority.critica?.hours ?? prev.critica,
        // A tela usa um único toggle por limiar (não por prioridade) — usa a primeira
        // linha como referência; ao salvar, os 3 toggles valem para as 4 prioridades.
        alerta50: first.warn_50_pct,
        alerta80: first.warn_80_pct,
        alerta100: first.warn_100_pct,
      }));
      setSlaLoaded(true);
    });
  }, []);

  async function salvar() {
    setSaving(true);
    setSaveError(null);
    const patch = {
      warn_50_pct: sla.alerta50,
      warn_80_pct: sla.alerta80,
      warn_100_pct: sla.alerta100,
    };
    const results = await Promise.all([
      slaConfigRepo.updateByPriority("baixa", { ...patch, hours: sla.baixa }),
      slaConfigRepo.updateByPriority("media", { ...patch, hours: sla.media }),
      slaConfigRepo.updateByPriority("alta", { ...patch, hours: sla.alta }),
      slaConfigRepo.updateByPriority("critica", { ...patch, hours: sla.critica }),
    ]);
    const failed = results.find((r) => r.error);
    setSaving(false);
    if (failed?.error) {
      console.error("[Configurações] Falha ao salvar sla_config", failed.error);
      setSaveError("Não foi possível salvar o SLA. Tente novamente.");
      return;
    }
    // RLS bloqueia UPDATE de quem não tem papel admin sem gerar erro — 0 linhas
    // retornadas é como isso aparece aqui.
    if (results.some((r) => !r.data?.length)) {
      setSaveError("Você não tem permissão para alterar o SLA (só admin).");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-6">
      <BackToDashboard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">Parâmetros gerais, SLA, notificações e integrações</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={salvar}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}
          </button>
          {saveError && <span className="text-xs text-destructive">{saveError}</span>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Só a seção <strong>SLA por prioridade</strong> é salva de verdade agora — as demais ainda são só
        pré-visualização (ver issue #94).
      </p>

      <Section icon={Building} title="Empresa" note={{ text: "Não salva ainda", tone: "pending" }}>
        <Grid>
          <Field label="Razão social"><input value={empresa.razao} onChange={(e) => setEmpresa({ ...empresa, razao: e.target.value })} className={inp} /></Field>
          <Field label="CNPJ"><input value={empresa.cnpj} onChange={(e) => setEmpresa({ ...empresa, cnpj: e.target.value })} className={inp} /></Field>
          <Field label="Email"><input value={empresa.email} onChange={(e) => setEmpresa({ ...empresa, email: e.target.value })} className={inp} /></Field>
          <Field label="Telefone"><input value={empresa.telefone} onChange={(e) => setEmpresa({ ...empresa, telefone: e.target.value })} className={inp} /></Field>
        </Grid>
      </Section>

      <Section
        icon={Clock}
        title="SLA por prioridade (horas)"
        note={slaLoaded ? { text: "Conectado a sla_config", tone: "ok" } : undefined}
      >
        <Grid>
          <Field label="Baixa"><input type="number" value={sla.baixa} onChange={(e) => setSla({ ...sla, baixa: Number(e.target.value) })} className={inp} /></Field>
          <Field label="Média"><input type="number" value={sla.media} onChange={(e) => setSla({ ...sla, media: Number(e.target.value) })} className={inp} /></Field>
          <Field label="Alta"><input type="number" value={sla.alta} onChange={(e) => setSla({ ...sla, alta: Number(e.target.value) })} className={inp} /></Field>
          <Field label="Crítica"><input type="number" value={sla.critica} onChange={(e) => setSla({ ...sla, critica: Number(e.target.value) })} className={inp} /></Field>
        </Grid>
        <div className="mt-3 flex flex-wrap gap-3">
          <Toggle checked={sla.alerta50} onChange={(v) => setSla({ ...sla, alerta50: v })} label="Alerta a 50% do SLA" />
          <Toggle checked={sla.alerta80} onChange={(v) => setSla({ ...sla, alerta80: v })} label="Alerta a 80%" />
          <Toggle checked={sla.alerta100} onChange={(v) => setSla({ ...sla, alerta100: v })} label="Alerta de SLA estourado" />
        </div>
      </Section>

      <Section icon={Bell} title="Notificações & NPS" note={{ text: "Não salva ainda", tone: "pending" }}>
        <div className="flex flex-wrap gap-3">
          <Toggle checked={notif.email} onChange={(v) => setNotif({ ...notif, email: v })} label="Notificações por email" />
          <Toggle checked={notif.whatsapp} onChange={(v) => setNotif({ ...notif, whatsapp: v })} label="Notificações por WhatsApp" />
          <Toggle checked={notif.npsAuto} onChange={(v) => setNotif({ ...notif, npsAuto: v })} label="Disparo automático de NPS pós-resolução" />
        </div>
        <Grid>
          <Field label="Disparo proativo NPS (dias após venda)">
            <input type="number" value={notif.npsDias} onChange={(e) => setNotif({ ...notif, npsDias: Number(e.target.value) })} className={inp} />
          </Field>
        </Grid>
      </Section>

      <Section icon={Plug} title="Integrações" note={{ text: "Não salva ainda", tone: "pending" }}>
        <Grid>
          <Field label="URL do ERP"><input value={integ.erpUrl} onChange={(e) => setInteg({ ...integ, erpUrl: e.target.value })} className={inp} placeholder="https://erp.verticalparts.com/api" /></Field>
          <Field label="Email remetente"><input value={integ.emailFrom} onChange={(e) => setInteg({ ...integ, emailFrom: e.target.value })} className={inp} /></Field>
          <Field label="Token WhatsApp Business"><input value={integ.whatsappToken} onChange={(e) => setInteg({ ...integ, whatsappToken: e.target.value })} className={inp} placeholder="••••••••" /></Field>
        </Grid>
      </Section>
    </div>
  );
}

const inp = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
function Section({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  note?: { text: string; tone: "ok" | "pending" };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-[var(--shadow-elegant)]">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-gold" />
        <h2 className="text-base font-semibold">{title}</h2>
        {note && (
          <span
            className={
              "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
              (note.tone === "ok" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")
            }
          >
            {note.text}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}
