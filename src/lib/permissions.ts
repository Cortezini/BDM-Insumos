import type { PermissionKey, Profile, UserRole } from "./database.types";

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  group: string;
};

export const PERMISSIONS: PermissionDefinition[] = [
  { key: "dashboard.view", label: "Dashboard", group: "Telas" },
  { key: "products.view", label: "Produtos", group: "Telas" },
  { key: "movements.view", label: "Movimentações", group: "Telas" },
  { key: "suppliers.view", label: "Fornecedores", group: "Telas" },
  { key: "quotations.view", label: "Cotações", group: "Telas" },
  { key: "assets.view", label: "Ativos de TI", group: "Telas" },
  { key: "people.view", label: "Pessoas", group: "Telas" },
  { key: "cost_centers.view", label: "Centros de custo", group: "Telas" },
  { key: "locations.view", label: "Localizações", group: "Telas" },
  { key: "reports.view", label: "Relatórios", group: "Telas" },
  { key: "settings.view", label: "Configurações", group: "Telas" },
  { key: "movements.create_in", label: "Registrar entradas", group: "Movimentações" },
  { key: "movements.create_out", label: "Registrar saídas", group: "Movimentações" },
  { key: "quotations.create", label: "Criar cotações", group: "Cotações" },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<UserRole, "admin">, PermissionKey[]> = {
  operator: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "movements.create_in",
    "movements.create_out",
    "suppliers.view",
    "quotations.view",
    "quotations.create",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "settings.view",
  ],
  viewer: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "suppliers.view",
    "quotations.view",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "settings.view",
  ],
};

export const ROUTE_PERMISSIONS = [
  { path: "/", match: (pathname: string) => pathname === "/", key: "dashboard.view" },
  {
    path: "/produtos",
    match: (pathname: string) => pathname.startsWith("/produtos"),
    key: "products.view",
  },
  {
    path: "/movimentacoes",
    match: (pathname: string) => pathname.startsWith("/movimentacoes"),
    key: "movements.view",
  },
  {
    path: "/fornecedores",
    match: (pathname: string) => pathname.startsWith("/fornecedores"),
    key: "suppliers.view",
  },
  {
    path: "/quotations",
    match: (pathname: string) => pathname.startsWith("/quotations"),
    key: "quotations.view",
  },
  {
    path: "/assets",
    match: (pathname: string) => pathname.startsWith("/assets"),
    key: "assets.view",
  },
  {
    path: "/pessoas",
    match: (pathname: string) => pathname.startsWith("/pessoas"),
    key: "people.view",
  },
  {
    path: "/centros-de-custo",
    match: (pathname: string) => pathname.startsWith("/centros-de-custo"),
    key: "cost_centers.view",
  },
  {
    path: "/localizacoes",
    match: (pathname: string) => pathname.startsWith("/localizacoes"),
    key: "locations.view",
  },
  {
    path: "/relatorios",
    match: (pathname: string) => pathname.startsWith("/relatorios"),
    key: "reports.view",
  },
  {
    path: "/configuracoes",
    match: (pathname: string) => pathname.startsWith("/configuracoes"),
    key: "settings.view",
  },
] as const satisfies ReadonlyArray<{
  path: string;
  match: (pathname: string) => boolean;
  key: PermissionKey;
}>;

export type AppRoutePath = (typeof ROUTE_PERMISSIONS)[number]["path"];

export function can(profile: Profile | null, permission: PermissionKey) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return (profile.permissions ?? []).includes(permission);
}

export function getRoutePermission(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_PERMISSIONS.find((route) => route.match(normalized))?.key ?? null;
}

export function getDefaultRoute(profile: Profile | null): AppRoutePath | null {
  return ROUTE_PERMISSIONS.find((route) => can(profile, route.key))?.path ?? null;
}
