import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // SSR: localStorage isn't available — default to login redirect
    if (typeof window === "undefined") throw redirect({ to: "/login" });
    const { data } = await getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/login" });
  },
});
