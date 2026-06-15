export const COMPANY_SCOPED_TABLES = new Set([
  "suppliers",
  "people",
  "cost_centers",
  "locations",
  "product_categories",
  "asset_types",
  "products",
  "stock_movements",
  "ti_assets",
  "quotations",
  "audit_logs",
]);

export function isCompanyScopedTable(table: string) {
  return COMPANY_SCOPED_TABLES.has(table);
}
