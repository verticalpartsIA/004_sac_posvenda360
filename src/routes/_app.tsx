import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/components/app/AppLayout";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    // Skip auth check during SSR — localStorage isn't available server-side.
    // The client will redirect to /login on hydration if there's no session.
    if (typeof window === "undefined") return;
    const { data } = await getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: () => <AppLayout />,
});
