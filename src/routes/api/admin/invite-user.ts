import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

const SB_URL = "https://jkbklzlbhhfnamaeislb.supabase.co";

export const APIRoute = createAPIFileRoute("/api/admin/invite-user")({
  POST: async ({ request }) => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return Response.json({ error: "Configuração de servidor incompleta." }, { status: 500 });
    }

    let body: { email?: string; role?: string };
    try {
      body = (await request.json()) as { email?: string; role?: string };
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const { email, role } = body;
    if (!email || !email.includes("@")) {
      return Response.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const sb = createClient(SB_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${new URL(request.url).origin}/dashboard`,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (role && data.user) {
      await sb.from("user_roles").insert({ user_id: data.user.id, role });
    }

    return Response.json({ ok: true, userId: data.user?.id });
  },
});
