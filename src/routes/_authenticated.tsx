import {
  createFileRoute,
  redirect,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/lib/supabase";
import { FIRST_ACCESS_ROUTE, MFA_ROUTE } from "@/lib/security-routes";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth/login" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, user, profile, needsMfa } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!loading && user && profile?.must_change_password && pathname !== FIRST_ACCESS_ROUTE) {
      navigate({ to: FIRST_ACCESS_ROUTE, replace: true });
      return;
    }

    if (!loading && user && !profile?.must_change_password && needsMfa && pathname !== MFA_ROUTE) {
      navigate({ to: MFA_ROUTE, replace: true });
    }
  }, [loading, user, profile?.must_change_password, needsMfa, pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }
  if (!user) return <Outlet />;
  return <AppShell />;
}
