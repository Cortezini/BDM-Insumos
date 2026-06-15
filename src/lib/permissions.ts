import type { CompanyRole, GlobalRole, PermissionKey, Profile, UserRole } from "./database.types";

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  group: string;
};

type PermissionRequirement = PermissionKey | readonly PermissionKey[];

export const SAAS_PERMISSIONS: PermissionDefinition[] = [
  { key: "saas.companies.view", label: "Ver empresas", group: "Admin SaaS" },
  { key: "saas.companies.manage", label: "Gerenciar empresas", group: "Admin SaaS" },
  { key: "saas.users.view", label: "Ver usuarios globais", group: "Admin SaaS" },
  { key: "saas.users.manage", label: "Gerenciar usuarios globais", group: "Admin SaaS" },
  { key: "saas.logs.view", label: "Ver logs administrativos", group: "Admin SaaS" },
];

export const PERMISSIONS: PermissionDefinition[] = [
  { key: "company.users.view", label: "Ver usuarios da empresa", group: "Usuarios" },
  { key: "company.users.manage", label: "Gerenciar usuarios da empresa", group: "Usuarios" },
  { key: "dashboard.view", label: "Dashboard", group: "Telas" },
  { key: "products.view", label: "Produtos", group: "Telas" },
  { key: "movements.view", label: "Ver todas movimentacoes", group: "Movimentacoes" },
  { key: "movements.view_in", label: "Ver entradas", group: "Movimentacoes" },
  { key: "movements.view_out", label: "Ver saidas", group: "Movimentacoes" },
  { key: "suppliers.view", label: "Fornecedores", group: "Telas" },
  { key: "quotations.view", label: "Cotacoes", group: "Telas" },
  { key: "assets.view", label: "Ativos de TI", group: "Telas" },
  { key: "people.view", label: "Pessoas", group: "Telas" },
  { key: "cost_centers.view", label: "Centros de custo", group: "Telas" },
  { key: "locations.view", label: "Localizacoes", group: "Telas" },
  { key: "reports.view", label: "Relatorios", group: "Telas" },
  { key: "settings.view", label: "Configuracoes", group: "Telas" },
  { key: "audit_logs.view", label: "Visualizar logs", group: "Sistema" },
  { key: "movements.create_in", label: "Registrar entradas", group: "Movimentacoes" },
  { key: "movements.create_out", label: "Registrar saidas", group: "Movimentacoes" },
  { key: "quotations.create", label: "Criar cotacoes", group: "Cotacoes" },
];

export const ALL_PERMISSIONS = [...SAAS_PERMISSIONS, ...PERMISSIONS];

export const COMPANY_ROLES: Array<{ value: CompanyRole; label: string }> = [
  { value: "admin_empresa", label: "Admin da Empresa" },
  { value: "gestor", label: "Gestor" },
  { value: "almoxarife", label: "Almoxarife" },
  { value: "solicitante", label: "Solicitante" },
  { value: "auditor", label: "Auditor" },
];

export const GLOBAL_ROLES: Array<{ value: GlobalRole; label: string }> = [
  { value: "super_admin", label: "Super Admin" },
  { value: "suporte", label: "Suporte" },
  { value: "financeiro", label: "Financeiro" },
  { value: "comercial", label: "Comercial" },
];

export const MODULES: Array<{ value: string; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "products", label: "Produtos" },
  { value: "movements", label: "Movimentacoes" },
  { value: "suppliers", label: "Fornecedores" },
  { value: "quotations", label: "Cotacoes" },
  { value: "assets", label: "Ativos de TI" },
  { value: "people", label: "Pessoas" },
  { value: "cost_centers", label: "Centros de custo" },
  { value: "locations", label: "Localizacoes" },
  { value: "reports", label: "Relatorios" },
  { value: "audit_logs", label: "Logs" },
];

export const DEFAULT_COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, PermissionKey[]> = {
  admin_empresa: [],
  gestor: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "movements.view_in",
    "movements.view_out",
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
    "company.users.view",
  ],
  almoxarife: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "movements.view_in",
    "movements.view_out",
    "movements.create_in",
    "movements.create_out",
    "suppliers.view",
    "assets.view",
    "locations.view",
  ],
  solicitante: ["dashboard.view", "products.view", "quotations.view", "quotations.create"],
  auditor: [
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
    "audit_logs.view",
  ],
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
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
  ...DEFAULT_COMPANY_ROLE_PERMISSIONS,
};

export const ROUTE_PERMISSIONS = [
  {
    path: "/admin-saas/empresas",
    match: (pathname: string) => pathname.startsWith("/admin-saas/empresas"),
    permissions: "saas.companies.view",
  },
  {
    path: "/admin-saas/usuarios",
    match: (pathname: string) => pathname.startsWith("/admin-saas/usuarios"),
    permissions: "saas.users.view",
  },
  {
    path: "/usuarios-empresa",
    match: (pathname: string) => pathname.startsWith("/usuarios-empresa"),
    permissions: "company.users.view",
  },
  { path: "/", match: (pathname: string) => pathname === "/", permissions: "dashboard.view" },
  {
    path: "/produtos",
    match: (pathname: string) => pathname.startsWith("/produtos"),
    permissions: "products.view",
  },
  {
    path: "/movimentacoes",
    match: (pathname: string) => pathname.startsWith("/movimentacoes"),
    permissions: ["movements.view", "movements.view_in", "movements.view_out"],
  },
  {
    path: "/fornecedores",
    match: (pathname: string) => pathname.startsWith("/fornecedores"),
    permissions: "suppliers.view",
  },
  {
    path: "/quotations",
    match: (pathname: string) => pathname.startsWith("/quotations"),
    permissions: "quotations.view",
  },
  {
    path: "/assets",
    match: (pathname: string) => pathname.startsWith("/assets"),
    permissions: "assets.view",
  },
  {
    path: "/pessoas",
    match: (pathname: string) => pathname.startsWith("/pessoas"),
    permissions: "people.view",
  },
  {
    path: "/centros-de-custo",
    match: (pathname: string) => pathname.startsWith("/centros-de-custo"),
    permissions: "cost_centers.view",
  },
  {
    path: "/localizacoes",
    match: (pathname: string) => pathname.startsWith("/localizacoes"),
    permissions: "locations.view",
  },
  {
    path: "/relatorios",
    match: (pathname: string) => pathname.startsWith("/relatorios"),
    permissions: "reports.view",
  },
  {
    path: "/configuracoes",
    match: (pathname: string) => pathname.startsWith("/configuracoes"),
    permissions: "settings.view",
  },
  {
    path: "/logs",
    match: (pathname: string) => pathname.startsWith("/logs"),
    permissions: "audit_logs.view",
  },
] as const satisfies ReadonlyArray<{
  path: string;
  match: (pathname: string) => boolean;
  permissions: PermissionRequirement;
}>;

export type AppRoutePath = (typeof ROUTE_PERMISSIONS)[number]["path"];

export function normalizeCompanyRole(role: UserRole): UserRole {
  if (role === "admin") return "admin_empresa";
  if (role === "operator") return "almoxarife";
  if (role === "viewer") return "auditor";
  return role;
}

export function getRoleLabel(role: UserRole | null | undefined) {
  if (!role) return "";
  const normalized = normalizeCompanyRole(role);
  return (
    [...GLOBAL_ROLES, ...COMPANY_ROLES].find((item) => item.value === normalized)?.label ??
    normalized
  );
}

function isSaasPermission(permission: PermissionKey) {
  return permission.startsWith("saas.");
}

export function can(profile: Profile | null, permission: PermissionKey) {
  if (!profile) return false;
  if (profile.must_change_password) return false;
  const role = normalizeCompanyRole(profile.role);
  if (role === "super_admin") return true;
  if (role === "admin_empresa") return !isSaasPermission(permission);
  return (profile.permissions ?? []).includes(permission);
}

export function canAny(profile: Profile | null, permissions: PermissionRequirement) {
  const required = Array.isArray(permissions) ? permissions : [permissions];
  return required.some((permission) => can(profile, permission));
}

export function getRoutePermissions(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_PERMISSIONS.find((route) => route.match(normalized))?.permissions ?? null;
}

export function getDefaultRoute(profile: Profile | null): AppRoutePath | null {
  if (profile?.role === "super_admin") return "/admin-saas/empresas";
  return ROUTE_PERMISSIONS.find((route) => canAny(profile, route.permissions))?.path ?? null;
}
