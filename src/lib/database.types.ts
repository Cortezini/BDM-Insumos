// Lightweight typing — keeps Supabase client generic without locking schema.
// You can regenerate richer types with `supabase gen types typescript`.
export type Database = Record<string, unknown>;

export type UserRole = "admin" | "operator" | "viewer";
export type PermissionKey =
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
  created_at: string;
}

export interface Supplier {
  id: string;
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
  name: string;
  code: string | null;
  responsible: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
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
