import { useState } from "react";
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
  Menu,
  ScrollText,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { canAny, getDefaultRoute, getRoutePermissions } from "@/lib/permissions";
import type { PermissionKey } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const nav: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: PermissionKey | PermissionKey[];
}> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { to: "/produtos", label: "Produtos", icon: Package, permission: "products.view" },
  {
    to: "/movimentacoes",
    label: "Movimentações",
    icon: ArrowLeftRight,
    permission: ["movements.view", "movements.view_in", "movements.view_out"],
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
  { to: "/logs", label: "Logs", icon: ScrollText, permission: "audit_logs.view" },
];

function isActivePath(pathname: string, to: string) {
  return pathname === to || (to !== "/" && pathname.startsWith(to));
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { profile, signOut, companies, activeCompany, setActiveCompanyId } = useAuth();
  const { theme, toggle } = useTheme();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const routePermissions = getRoutePermissions(pathname);
  const hasRouteAccess = !routePermissions || canAny(profile, routePermissions);
  const defaultRoute = getDefaultRoute(profile);
  const visibleNav = nav.filter((item) => canAny(profile, item.permission));
  const userInitial = (profile?.full_name ?? profile?.email ?? "?").slice(0, 1).toUpperCase();

  const renderNavLink = (item: (typeof nav)[number], mobile = false) => {
    const active = isActivePath(pathname, item.to);
    const Icon = item.icon;

    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => {
          if (mobile) setMobileNavOpen(false);
        }}
        className={`flex items-center gap-3 rounded-md text-sm transition-colors ${
          mobile ? "px-3 py-3" : "px-3 py-2"
        } ${
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

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
          {visibleNav.map((item) => renderNavLink(item))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-9 rounded-full bg-accent grid place-items-center text-accent-foreground text-sm font-semibold">
              {userInitial}
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
        <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
          <div className="h-14 md:h-16 flex items-center gap-2 px-3 md:px-5">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="md:hidden" title="Abrir menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-[min(20rem,86vw)] flex-col bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-5 text-left">
                  <div className="flex items-center gap-2">
                    <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-sm">
                      <Boxes className="size-5" />
                    </div>
                    <div>
                      <SheetTitle className="text-sm leading-none text-sidebar-foreground">
                        BDM
                      </SheetTitle>
                      <SheetDescription className="mt-0.5 text-[11px] text-muted-foreground">
                        Gestão de Insumos
                      </SheetDescription>
                    </div>
                  </div>
                </SheetHeader>
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                  {visibleNav.map((item) => renderNavLink(item, true))}
                </nav>
                <div className="p-3 border-t border-sidebar-border">
                  <div className="flex items-center gap-3 px-2 py-2">
                    <div className="size-9 rounded-full bg-accent grid place-items-center text-accent-foreground text-sm font-semibold">
                      {userInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {profile?.full_name ?? profile?.email}
                      </div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {profile?.role}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setMobileNavOpen(false);
                        void signOut();
                      }}
                      title="Sair"
                    >
                      <LogOut className="size-4" />
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="md:hidden flex min-w-0 items-center gap-2">
              <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-sm">
                <Boxes className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-none">BDM</div>
                <div className="text-[11px] text-muted-foreground truncate">Gestão de Insumos</div>
              </div>
            </div>

            <div className="relative hidden sm:block flex-1 max-w-xl">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos, fornecedores, pessoas..."
                className="pl-9 bg-background"
              />
            </div>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {activeCompany && (
                <div className="hidden min-w-0 items-center gap-2 md:flex">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  {companies.length > 1 ? (
                    <Select value={activeCompany.id} onValueChange={setActiveCompanyId}>
                      <SelectTrigger className="h-9 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="max-w-48 truncate text-sm font-medium">
                      {activeCompany.name}
                    </span>
                  )}
                </div>
              )}
              <Button size="icon" variant="ghost" onClick={toggle} title="Alternar tema">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button size="icon" variant="ghost" title="Notificações">
                <Bell className="size-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
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
