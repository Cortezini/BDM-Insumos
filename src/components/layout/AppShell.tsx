import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Truck,
  Users,
  Building2,
  MapPin,
  ArrowLeftRight,
  BarChart3,
  Settings,
  LogOut,
  Sun,
  Moon,
  Search,
  Bell,
  Boxes,
  Calculator,
  Network,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { can, getDefaultRoute, getRoutePermission } from "@/lib/permissions";
import type { PermissionKey } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 2. ADICIONADO "COTAÇÕES" NA LISTA DE NAVEGAÇÃO DO MENU
const nav: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: PermissionKey;
}> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { to: "/produtos", label: "Produtos", icon: Package, permission: "products.view" },
  {
    to: "/movimentacoes",
    label: "Movimentações",
    icon: ArrowLeftRight,
    permission: "movements.view",
  },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, permission: "suppliers.view" },
  { to: "/quotations", label: "Cotações", icon: Calculator, permission: "quotations.view" },
  { to: "/assets", label: "Ativos de TI", icon: Network, permission: "assets.view" },
  { to: "/pessoas", label: "Pessoas", icon: Users, permission: "people.view" },
  {
    to: "/centros-de-custo",
    label: "Centros de Custo",
    icon: Building2,
    permission: "cost_centers.view",
  },
  { to: "/localizacoes", label: "Localizações", icon: MapPin, permission: "locations.view" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, permission: "reports.view" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, permission: "settings.view" },
];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const routePermission = getRoutePermission(pathname);
  const hasRouteAccess = !routePermission || can(profile, routePermission);
  const defaultRoute = getDefaultRoute(profile);
  const visibleNav = nav.filter((item) => can(profile, item.permission));

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-sm">
            <Boxes className="size-5" />
          </div>
          <div>
            <div className="font-semibold text-sm leading-none">BDM</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Gestão de Insumos</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const active =
              pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-9 rounded-full bg-accent grid place-items-center text-accent-foreground text-sm font-semibold">
              {(profile?.full_name ?? profile?.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {profile?.full_name ?? profile?.email}
              </div>
              <div className="text-[11px] text-muted-foreground capitalize">{profile?.role}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={signOut} title="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/60 backdrop-blur flex items-center gap-3 px-5">
          <div className="relative flex-1 max-w-xl">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produtos, fornecedores, pessoas..."
              className="pl-9 bg-background"
            />
          </div>
          <Button size="icon" variant="ghost" onClick={toggle} title="Alternar tema">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" title="Notificações">
            <Bell className="size-4" />
          </Button>
        </header>
        <main className="flex-1 p-6 overflow-x-hidden">
          {hasRouteAccess ? (
            <Outlet />
          ) : (
            <div className="min-h-[60vh] grid place-items-center">
              <div className="max-w-md text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Acesso restrito</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Seu usuário não tem permissão para acessar esta tela.
                </p>
                {defaultRoute && (
                  <Button asChild className="mt-4">
                    <Link to={defaultRoute}>Ir para minha tela inicial</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
