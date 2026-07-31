import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmtsemxiaGhmbmFtYWVpc2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc5MDM5MywiZXhwIjoyMDkzMzY2MzkzfQ.WoFDfpykUrwQcg0uzDwgfKSwWCy-7zrrJGWGOpo5drs",
);

// Resolve um token de /nps/form/$token contra sac_pesquisas — a pesquisa
// real disparada por WhatsApp após entrega, vinculada a uma NF. Sem RLS pra
// anon nessa tabela (só authenticated/service_role), então essa rota pública
// intermedeia a leitura/gravação com a service role.

export const APIRoute = createAPIFileRoute("/api/sac/pesquisa")({
  GET: async ({ request }) => {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) return Response.json({ error: "token obrigatório" }, { status: 400 });

    const { data, error } = await sb
      .from("sac_pesquisas")
      .select("respondida_em, sac_notas_fiscais(nf_numero, razao_social_cliente)")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[api/sac/pesquisa GET]", error.message);
      return Response.json({ error: "Erro interno" }, { status: 500 });
    }
    if (!data) return Response.json({ found: false });

    type NfFields = { nf_numero: string | null; razao_social_cliente: string | null };
    const nfRaw = data.sac_notas_fiscais as unknown as NfFields | NfFields[] | null;
    const nf = Array.isArray(nfRaw) ? nfRaw[0] ?? null : nfRaw;
    return Response.json({
      found: true,
      jaRespondida: data.respondida_em !== null,
      nfNumero: nf?.nf_numero ?? null,
      clienteNome: nf?.razao_social_cliente ?? null,
    });
  },

  POST: async ({ request }) => {
    let body: { token?: string; npsScore?: number; observacoes?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    const token = body.token?.trim();
    const npsScore = body.npsScore;
    if (!token || typeof npsScore !== "number" || npsScore < 0 || npsScore > 10 || !Number.isInteger(npsScore)) {
      return Response.json({ error: "token e npsScore (0-10) são obrigatórios" }, { status: 422 });
    }

    // Só atualiza se ainda não respondida — impede reenvio/duplo submit sobrescrever a resposta original.
    const { data, error } = await sb
      .from("sac_pesquisas")
      .update({
        nps_score: npsScore,
        observacoes: body.observacoes?.trim() || null,
        respondida_em: new Date().toISOString(),
      })
      .eq("token", token)
      .is("respondida_em", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[api/sac/pesquisa POST]", error.message);
      return Response.json({ error: "Erro interno" }, { status: 500 });
    }
    if (!data) return Response.json({ ok: false, reason: "invalido_ou_ja_respondida" }, { status: 409 });

    return Response.json({ ok: true });
  },
});
