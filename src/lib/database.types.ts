// Lightweight typing — keeps Supabase client generic without locking schema.
// You can regenerate richer types with `supabase gen types typescript`.
export type Database = Record<string, unknown>;

export type LegacyUserRole = "admin" | "operator" | "viewer";
export type GlobalRole = "super_admin" | "suporte" | "financeiro" | "comercial";
export type CompanyRole = "admin_empresa" | "gestor" | "almoxarife" | "solicitante" | "auditor";
export type UserRole = LegacyUserRole | GlobalRole | CompanyRole;
export type PermissionKey =
  | "saas.companies.view"
  | "saas.companies.manage"
  | "saas.users.view"
  | "saas.users.manage"
  | "saas.logs.view"
  | "company.users.view"
  | "company.users.manage"
  | "dashboard.view"
  | "products.view"
  | "movements.view"
  | "movements.view_in"
  | "movements.view_out"
  | "movements.create_in"
  | "movements.create_out"
  | "suppliers.view"
  | "quotations.view"
  | "quotations.create"
  | "assets.view"
  | "people.view"
  | "cost_centers.view"
  | "locations.view"
  | "reports.view"
  | "settings.view"
  | "audit_logs.view";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  permissions: PermissionKey[] | null;
  global_role: GlobalRole | null;
  blocked: boolean;
  blocked_at: string | null;
  blocked_by: string | null;
  must_change_password: boolean;
  password_change_required_at: string | null;
  password_changed_at: string | null;
  first_login_completed_at: string | null;
  invited_at: string | null;
  last_login_at: string | null;
  must_enroll_mfa: boolean;
  mfa_required_at: string | null;
  mfa_enrolled_at: string | null;
  mfa_last_verified_at: string | null;
  password_reset_requested_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Company {
  id: string;
  name: string;
  document: string | null;
  plan: string;
  user_limit: number;
  modules: string[];
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CompanyMembership {
  id: string;
  company_id: string;
  user_id: string;
  role: UserRole;
  permissions: PermissionKey[] | null;
  active: boolean;
  created_at: string;
  company?: Company | null;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  document: string | null;
  contact: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Person {
  id: string;
  company_id: string;
  full_name: string;
  document: string | null;
  role: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface CostCenter {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  responsible: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface Location {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  category_id: string | null;
  unit: string;
  supplier_id: string | null;
  min_stock: number;
  current_stock: number;
  avg_cost: number;
  reference_price: number;
  location_id: string | null;
  active: boolean;
  created_at: string;
  // joins
  category?: ProductCategory | null;
  supplier?: Supplier | null;
  location?: Location | null;
}

export type MovementType = "in" | "out";

export interface StockMovement {
  id: string;
  company_id: string;
  type: MovementType;
  movement_date: string;
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  supplier_id: string | null;
  person_id: string | null;
  cost_center_id: string | null;
  location_id: string | null;
  reason: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  // joins
  product?: Product | null;
  supplier?: Supplier | null;
  person?: Person | null;
  cost_center?: CostCenter | null;
  location?: Location | null;
}

export interface AuditLog {
  id: string;
  company_id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}
