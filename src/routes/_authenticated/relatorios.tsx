import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ClipboardCheck,
  Download,
  PackageSearch,
  Printer,
  ShieldCheck,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { db } from "@/lib/supabase";
import { currency, number, dateTimeBR, dateBR, exportToCSV, exportToPDF } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: Page });

const DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_DAYS_LIMIT = 90;
const REORDER_DAYS_LIMIT = 30;

type MovementType = "in" | "out";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  current_stock: number | string | null;
  min_stock: number | string | null;
  avg_cost: number | string | null;
  reference_price: number | string | null;
  active: boolean | null;
  created_at: string;
  category?: { name: string | null } | null;
  supplier?: { name: string | null } | null;
  location?: { name: string | null } | null;
};

type MovementRow = {
  id: string;
  movement_date: string;
  type: MovementType;
  product_id: string;
  quantity: number | string;
  unit_cost: number | string | null;
  supplier_id: string | null;
  person_id: string | null;
  cost_center_id: string | null;
  location_id: string | null;
  reason: string | null;
  notes: string | null;
  product?: {
    name: string | null;
    sku: string | null;
    unit: string | null;
    avg_cost?: number | string | null;
  } | null;
  supplier?: { name: string | null } | null;
  person?: { full_name: string | null } | null;
  cost_center?: { name: string | null } | null;
  location?: { name: string | null } | null;
};

type QuoteRow = {
  id: string;
  product_id: string;
  supplier_id: string;
  price: number | string;
  quote_date: string | null;
  purchase_link: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  product?: { name: string | null; sku: string | null } | null;
  supplier?: { name: string | null } | null;
};

type AssetRow = {
  id: string;
  asset_type_id: string | null;
  name: string | null;
  serial_number: string | null;
  patrimony_tag: string | null;
  status: string | null;
  ip_address: string | null;
  mac_address: string | null;
  location_id: string | null;
  responsible_person_id: string | null;
  created_at: string;
  asset_type?: { name: string | null } | null;
};

type SimpleNameRow = {
  id: string;
  name: string | null;
};

type PersonRow = {
  id: string;
  full_name: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  table_name: string;
  description: string | null;
  user_id: string | null;
  created_at: string;
};

type ReportTableProps<T extends { id: string }> = {
  title: string;
  subtitle?: string;
  data: T[];
  columns: Column<T>[];
  searchKeys?: (keyof T)[];
  emptyText: string;
  csvFilename?: string;
  csvRows?: Record<string, unknown>[];
  pdfTitle?: string;
  pdfHeaders?: string[];
  pdfRows?: (string | number)[][];
  children?: ReactNode;
};

type StockValueRow = {
  id: string;
  group: string;
  items: number;
  quantity: number;
  totalValue: number;
};

type GroupReportRow = {
  id: string;
  name: string;
  count: number;
  quantity: number;
  totalValue: number;
};

type ProductMetricRow = {
  id: string;
  sku: string;
  product: string;
  category: string;
  unit: string;
  quantity: number;
  totalValue: number;
  extra?: string;
  extraSort?: number;
};

type PriceHistoryRow = {
  id: string;
  sku: string;
  product: string;
  sources: string;
  count: number;
  min: number;
  max: number;
  average: number;
  lastPrice: number;
  lastDate: string;
};

type QuoteSavingsRow = {
  id: string;
  sku: string;
  product: string;
  quotes: number;
  suppliers: number;
  min: number;
  max: number;
  savings: number;
  savingsPct: number;
};

type PendingPurchaseRow = {
  id: string;
  product: string;
  supplier: string;
  price: number;
  status: string;
  createdAt: string;
  purchaseLink: string | null;
};

type AssetGroupRow = {
  id: string;
  name: string;
  count: number;
};

type AssetDetailRow = {
  id: string;
  asset: string;
  typeName: string;
  status: string;
  responsible: string;
  location: string;
  patrimonyTag: string;
};

type ReorderRow = {
  id: string;
  sku: string;
  product: string;
  stock: number;
  minStock: number;
  avgDailyOut: number;
  daysToMinimum: number;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: string | null | undefined, fallback = "Sem informacao") {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function startOfDay(value: string) {
  return `${value}T00:00:00`;
}

function endOfDay(value: string) {
  return `${value}T23:59:59`;
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso).getTime();
  if (!Number.isFinite(date)) return null;
  return Math.max(0, Math.floor((Date.now() - date) / DAY_MS));
}

function getQuoteDate(quote: QuoteRow) {
  return quote.quote_date ?? quote.created_at;
}

function getStatusLabel(status: QuoteRow["status"]) {
  const labels: Record<QuoteRow["status"], string> = {
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
  };
  return labels[status] ?? status;
}

const actionLabels: Record<string, string> = {
  asset_created: "Ativo cadastrado",
  asset_updated: "Ativo atualizado",
  asset_deleted: "Ativo excluido",
  record_created: "Cadastro",
  record_updated: "Atualizacao",
  record_deleted: "Exclusao",
  quotation_created: "Cotacao criada",
  quotation_approved: "Aprovacao",
  quotation_rejected: "Rejeicao",
  quotation_deleted: "Cotacao excluida",
  quotation_updated: "Cotacao atualizada",
  quotation_status_updated: "Status atualizado",
  stock_in: "Entrada",
  stock_out: "Saida",
  stock_movement_updated: "Movimentacao atualizada",
  stock_movement_deleted: "Movimentacao excluida",
  company_user_created: "Usuario criado",
  company_user_blocked: "Usuario bloqueado",
  company_user_unblocked: "Usuario desbloqueado",
  user_permissions_updated: "Permissoes",
};

const tableLabels: Record<string, string> = {
  asset_types: "Tipos de ativo",
  audit_logs: "Logs",
  companies: "Empresas",
  company_members: "Usuarios por empresa",
  cost_centers: "Centros de custo",
  locations: "Localizacoes",
  people: "Pessoas",
  product_categories: "Categorias",
  products: "Produtos",
  profiles: "Usuarios",
  quotations: "Cotacoes",
  stock_movements: "Movimentacoes",
  suppliers: "Fornecedores",
  ti_assets: "Ativos de TI",
};

function getActionLabel(row: AuditRow) {
  if (row.action === "record_created" && row.table_name === "ti_assets") return "Ativo cadastrado";
  return actionLabels[row.action] ?? row.action;
}

function getTableLabel(tableName: string) {
  return tableLabels[tableName] ?? tableName;
}

function isLossOrAdjustment(movement: MovementRow) {
  const value = `${movement.reason ?? ""} ${movement.notes ?? ""}`.toLowerCase();
  return ["perda", "quebra", "venc", "ajuste", "diverg", "avaria"].some((term) =>
    value.includes(term),
  );
}

function resolvePurchaseLink(link: string | null) {
  const trimmed = link?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ReportTable<T extends { id: string }>({
  title,
  subtitle,
  data,
  columns,
  searchKeys,
  emptyText,
  csvFilename,
  csvRows,
  pdfTitle,
  pdfHeaders,
  pdfRows,
  children,
}: ReportTableProps<T>) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {csvFilename && csvRows && (
            <Button
              variant="outline"
              disabled={csvRows.length === 0}
              onClick={() => exportToCSV(csvFilename, csvRows)}
            >
              <Download className="mr-2 size-4" /> CSV
            </Button>
          )}
          {pdfTitle && pdfHeaders && pdfRows && (
            <Button
              disabled={pdfRows.length === 0}
              onClick={() => exportToPDF(pdfTitle, pdfHeaders, pdfRows)}
            >
              <Printer className="mr-2 size-4" /> PDF
            </Button>
          )}
        </div>
      </div>
      {children}
      <DataTable
        data={data}
        columns={columns}
        searchKeys={searchKeys}
        emptyText={emptyText}
        pageSize={10}
      />
    </section>
  );
}

function Page() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const movs = useQuery<MovementRow[]>({
    queryKey: ["report", "movements", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_movements")
        .select(
          "*, product:products(name, sku, unit, avg_cost), supplier:suppliers(name), person:people(full_name), cost_center:cost_centers(name), location:locations(name)",
        )
        .eq("company_id", companyId)
        .gte("movement_date", startOfDay(from))
        .lte("movement_date", endOfDay(to))
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });

  const allMovements = useQuery<MovementRow[]>({
    queryKey: ["report", "movements-all", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_movements")
        .select(
          "*, product:products(name, sku, unit, avg_cost), supplier:suppliers(name), person:people(full_name), cost_center:cost_centers(name), location:locations(name)",
        )
        .eq("company_id", companyId)
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });

  const inventory = useQuery<ProductRow[]>({
    queryKey: ["report", "inventory", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select(
          "*, category:product_categories(name), supplier:suppliers(name), location:locations(name)",
        )
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const quotations = useQuery<QuoteRow[]>({
    queryKey: ["report", "quotations", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("quotations")
        .select("*, product:products(name, sku), supplier:suppliers(name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    },
  });

  const assets = useQuery<AssetRow[]>({
    queryKey: ["report", "assets", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("ti_assets")
        .select("*, asset_type:asset_types(name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssetRow[];
    },
  });

  const locations = useQuery<SimpleNameRow[]>({
    queryKey: ["report", "locations", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("locations")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SimpleNameRow[];
    },
  });

  const people = useQuery<PersonRow[]>({
    queryKey: ["report", "people", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("people")
        .select("id, full_name")
        .eq("company_id", companyId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as PersonRow[];
    },
  });

  const auditLogs = useQuery<AuditRow[]>({
    queryKey: ["report", "audit", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("audit_logs")
        .select("id, action, table_name, description, user_id, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const movRows = useMemo(() => movs.data ?? [], [movs.data]);
  const allMovRows = useMemo(() => allMovements.data ?? [], [allMovements.data]);
  const invRows = useMemo(() => inventory.data ?? [], [inventory.data]);
  const quoteRows = useMemo(() => quotations.data ?? [], [quotations.data]);
  const assetRows = useMemo(() => assets.data ?? [], [assets.data]);
  const locationRows = useMemo(() => locations.data ?? [], [locations.data]);
  const peopleRows = useMemo(() => people.data ?? [], [people.data]);
  const auditRows = useMemo(() => auditLogs.data ?? [], [auditLogs.data]);

  const locationById = useMemo(
    () => new Map(locationRows.map((location) => [location.id, text(location.name)])),
    [locationRows],
  );

  const personById = useMemo(
    () => new Map(peopleRows.map((person) => [person.id, text(person.full_name)])),
    [peopleRows],
  );

  const reports = useMemo(() => {
    const productsById = new Map(invRows.map((product) => [product.id, product]));
    const periodDays = daysBetween(from, to);

    const lowStock = invRows
      .filter(
        (product) =>
          toNumber(product.min_stock) > 0 &&
          toNumber(product.current_stock) <= toNumber(product.min_stock),
      )
      .map<ProductMetricRow>((product) => ({
        id: product.id,
        sku: text(product.sku, ""),
        product: text(product.name),
        category: text(product.category?.name),
        unit: text(product.unit, ""),
        quantity: toNumber(product.current_stock),
        totalValue: toNumber(product.current_stock) * toNumber(product.avg_cost),
        extra: number(toNumber(product.min_stock)),
      }))
      .sort((a, b) => a.quantity - b.quantity);

    const lastMovementByProduct = new Map<string, string>();
    allMovRows.forEach((movement) => {
      const current = lastMovementByProduct.get(movement.product_id);
      if (!current || new Date(movement.movement_date) > new Date(current)) {
        lastMovementByProduct.set(movement.product_id, movement.movement_date);
      }
    });

    const idleProducts = invRows
      .map<ProductMetricRow>((product) => {
        const lastMovement = lastMovementByProduct.get(product.id) ?? null;
        const idleDays = daysSince(lastMovement);
        return {
          id: product.id,
          sku: text(product.sku, ""),
          product: text(product.name),
          category: text(product.category?.name),
          unit: text(product.unit, ""),
          quantity: toNumber(product.current_stock),
          totalValue: toNumber(product.current_stock) * toNumber(product.avg_cost),
          extra: idleDays === null ? "Nunca movimentado" : `${number(idleDays)} dias`,
          extraSort: idleDays ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .filter((product) => (product.extraSort ?? 0) >= IDLE_DAYS_LIMIT)
      .sort((a, b) => {
        const aNever = a.extra === "Nunca movimentado";
        const bNever = b.extra === "Nunca movimentado";
        if (aNever && !bNever) return -1;
        if (!aNever && bNever) return 1;
        return (b.extraSort ?? 0) - (a.extraSort ?? 0);
      });

    const groupMovements = (
      rows: MovementRow[],
      getKey: (movement: MovementRow) => string,
      getName: (movement: MovementRow) => string,
    ) => {
      const groups = new Map<string, GroupReportRow>();
      rows.forEach((movement) => {
        const key = getKey(movement);
        const quantity = toNumber(movement.quantity);
        const unitCost = toNumber(movement.unit_cost ?? movement.product?.avg_cost);
        const previous =
          groups.get(key) ??
          ({
            id: key,
            name: getName(movement),
            count: 0,
            quantity: 0,
            totalValue: 0,
          } satisfies GroupReportRow);
        previous.count += 1;
        previous.quantity += quantity;
        previous.totalValue += quantity * unitCost;
        groups.set(key, previous);
      });
      return Array.from(groups.values()).sort((a, b) => b.quantity - a.quantity);
    };

    const costCenterConsumption = groupMovements(
      movRows.filter((movement) => movement.type === "out"),
      (movement) => movement.cost_center_id ?? "sem-centro",
      (movement) => text(movement.cost_center?.name, "Sem centro de custo"),
    );

    const supplierEntries = groupMovements(
      movRows.filter((movement) => movement.type === "in"),
      (movement) => movement.supplier_id ?? "sem-fornecedor",
      (movement) => text(movement.supplier?.name, "Sem fornecedor"),
    );

    const personOutputs = groupMovements(
      movRows.filter((movement) => movement.type === "out"),
      (movement) => movement.person_id ?? "sem-solicitante",
      (movement) => text(movement.person?.full_name, "Sem solicitante"),
    );

    const topConsumed = groupMovements(
      movRows.filter((movement) => movement.type === "out"),
      (movement) => movement.product_id,
      (movement) => text(movement.product?.name),
    ).map((row) => {
      const product = productsById.get(row.id);
      return {
        ...row,
        name: `${text(product?.sku, "")}${product?.sku ? " - " : ""}${row.name}`,
      };
    });

    const stockValueByCategory = Array.from(
      invRows.reduce((map, product) => {
        const key = text(product.category?.name, "Sem categoria");
        const previous =
          map.get(key) ??
          ({
            id: key,
            group: key,
            items: 0,
            quantity: 0,
            totalValue: 0,
          } satisfies StockValueRow);
        previous.items += 1;
        previous.quantity += toNumber(product.current_stock);
        previous.totalValue += toNumber(product.current_stock) * toNumber(product.avg_cost);
        map.set(key, previous);
        return map;
      }, new Map<string, StockValueRow>()),
    )
      .map(([, row]) => row)
      .sort((a, b) => b.totalValue - a.totalValue);

    const outByProduct = new Map<string, number>();
    movRows
      .filter((movement) => movement.type === "out")
      .forEach((movement) => {
        outByProduct.set(
          movement.product_id,
          (outByProduct.get(movement.product_id) ?? 0) + toNumber(movement.quantity),
        );
      });

    const reorder = invRows
      .map<ReorderRow | null>((product) => {
        const totalOut = outByProduct.get(product.id) ?? 0;
        const avgDailyOut = totalOut / periodDays;
        if (avgDailyOut <= 0 || toNumber(product.min_stock) <= 0) return null;
        const daysToMinimum =
          (toNumber(product.current_stock) - toNumber(product.min_stock)) / avgDailyOut;
        if (daysToMinimum > REORDER_DAYS_LIMIT) return null;
        return {
          id: product.id,
          sku: text(product.sku, ""),
          product: text(product.name),
          stock: toNumber(product.current_stock),
          minStock: toNumber(product.min_stock),
          avgDailyOut,
          daysToMinimum,
        };
      })
      .filter((row): row is ReorderRow => Boolean(row))
      .sort((a, b) => a.daysToMinimum - b.daysToMinimum);

    const priceStats = new Map<
      string,
      {
        id: string;
        sku: string;
        product: string;
        prices: number[];
        sources: Set<string>;
        lastPrice: number;
        lastDate: string;
      }
    >();
    const addPrice = (
      productId: string,
      sku: string,
      product: string,
      price: number,
      date: string,
      source: string,
    ) => {
      if (price <= 0) return;
      const previous =
        priceStats.get(productId) ??
        ({
          id: productId,
          sku,
          product,
          prices: [],
          sources: new Set<string>(),
          lastPrice: price,
          lastDate: date,
        } satisfies {
          id: string;
          sku: string;
          product: string;
          prices: number[];
          sources: Set<string>;
          lastPrice: number;
          lastDate: string;
        });
      previous.prices.push(price);
      previous.sources.add(source);
      if (new Date(date) >= new Date(previous.lastDate)) {
        previous.lastPrice = price;
        previous.lastDate = date;
      }
      priceStats.set(productId, previous);
    };

    quoteRows.forEach((quote) =>
      addPrice(
        quote.product_id,
        text(quote.product?.sku, ""),
        text(quote.product?.name),
        toNumber(quote.price),
        getQuoteDate(quote),
        "Cotacao",
      ),
    );
    allMovRows
      .filter((movement) => movement.type === "in")
      .forEach((movement) =>
        addPrice(
          movement.product_id,
          text(movement.product?.sku, ""),
          text(movement.product?.name),
          toNumber(movement.unit_cost),
          movement.movement_date,
          "Entrada",
        ),
      );

    const priceHistory = Array.from(priceStats.values())
      .map<PriceHistoryRow>((stat) => ({
        id: stat.id,
        sku: stat.sku,
        product: stat.product,
        sources: Array.from(stat.sources).join(" / "),
        count: stat.prices.length,
        min: Math.min(...stat.prices),
        max: Math.max(...stat.prices),
        average: stat.prices.reduce((sum, price) => sum + price, 0) / stat.prices.length,
        lastPrice: stat.lastPrice,
        lastDate: stat.lastDate,
      }))
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

    const quotesByProduct = new Map<string, QuoteRow[]>();
    quoteRows.forEach((quote) => {
      const rows = quotesByProduct.get(quote.product_id) ?? [];
      rows.push(quote);
      quotesByProduct.set(quote.product_id, rows);
    });

    const quoteSavings = Array.from(quotesByProduct.entries())
      .map<QuoteSavingsRow | null>(([productId, quotes]) => {
        if (quotes.length < 2) return null;
        const prices = quotes.map((quote) => toNumber(quote.price)).filter((price) => price > 0);
        if (prices.length < 2) return null;
        const product = productsById.get(productId);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const savings = max - min;
        return {
          id: productId,
          sku: text(product?.sku ?? quotes[0]?.product?.sku, ""),
          product: text(product?.name ?? quotes[0]?.product?.name),
          quotes: quotes.length,
          suppliers: new Set(quotes.map((quote) => quote.supplier_id)).size,
          min,
          max,
          savings,
          savingsPct: max > 0 ? (savings / max) * 100 : 0,
        };
      })
      .filter((row): row is QuoteSavingsRow => Boolean(row))
      .sort((a, b) => b.savings - a.savings);

    const pendingPurchases = quoteRows
      .filter((quote) => quote.status === "approved")
      .filter((quote) => {
        const quoteDate = new Date(quote.created_at);
        return !allMovRows.some((movement) => {
          if (movement.type !== "in") return false;
          if (movement.product_id !== quote.product_id) return false;
          if (quote.supplier_id && movement.supplier_id !== quote.supplier_id) return false;
          return new Date(movement.movement_date) >= quoteDate;
        });
      })
      .map<PendingPurchaseRow>((quote) => ({
        id: quote.id,
        product: text(quote.product?.name),
        supplier: text(quote.supplier?.name),
        price: toNumber(quote.price),
        status: getStatusLabel(quote.status),
        createdAt: quote.created_at,
        purchaseLink: quote.purchase_link,
      }));

    const lossAdjustments = movRows
      .filter(isLossOrAdjustment)
      .map<ProductMetricRow>((movement) => ({
        id: movement.id,
        sku: text(movement.product?.sku, ""),
        product: text(movement.product?.name),
        category: movement.type === "in" ? "Entrada" : "Saida",
        unit: text(movement.product?.unit, ""),
        quantity: toNumber(movement.quantity),
        totalValue: toNumber(movement.quantity) * toNumber(movement.unit_cost),
        extra: movement.reason ?? movement.notes ?? "",
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const assetsByStatus = Array.from(
      assetRows.reduce((map, asset) => {
        const status = text(asset.status, "Sem status");
        const previous =
          map.get(status) ?? ({ id: status, name: status, count: 0 } satisfies AssetGroupRow);
        previous.count += 1;
        map.set(status, previous);
        return map;
      }, new Map<string, AssetGroupRow>()),
    )
      .map(([, row]) => row)
      .sort((a, b) => b.count - a.count);

    const assetsByType = Array.from(
      assetRows.reduce((map, asset) => {
        const typeName = text(asset.asset_type?.name, "Sem tipo");
        const previous =
          map.get(typeName) ?? ({ id: typeName, name: typeName, count: 0 } satisfies AssetGroupRow);
        previous.count += 1;
        map.set(typeName, previous);
        return map;
      }, new Map<string, AssetGroupRow>()),
    )
      .map(([, row]) => row)
      .sort((a, b) => b.count - a.count);

    const assetDetails = assetRows.map<AssetDetailRow>((asset) => ({
      id: asset.id,
      asset: text(asset.name),
      typeName: text(asset.asset_type?.name, "Sem tipo"),
      status: text(asset.status, "Sem status"),
      responsible: text(personById.get(asset.responsible_person_id ?? ""), "Sem responsavel"),
      location: text(locationById.get(asset.location_id ?? ""), "Sem localizacao"),
      patrimonyTag: text(asset.patrimony_tag, ""),
    }));

    const audit = auditRows.map((log) => ({
      ...log,
      actionLabel: getActionLabel(log),
      tableLabel: getTableLabel(log.table_name),
    }));

    return {
      lowStock,
      idleProducts,
      costCenterConsumption,
      supplierEntries,
      personOutputs,
      topConsumed,
      stockValueByCategory,
      reorder,
      priceHistory,
      quoteSavings,
      pendingPurchases,
      lossAdjustments,
      assetsByStatus,
      assetsByType,
      assetDetails,
      audit,
    };
  }, [
    allMovRows,
    assetRows,
    auditRows,
    from,
    invRows,
    locationById,
    movRows,
    personById,
    quoteRows,
    to,
  ]);

  const summaryCards = useMemo(() => {
    const totalStockValue = invRows.reduce(
      (sum, product) => sum + toNumber(product.current_stock) * toNumber(product.avg_cost),
      0,
    );
    const totalOut = movRows
      .filter((movement) => movement.type === "out")
      .reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
    const totalSavings = reports.quoteSavings.reduce((sum, row) => sum + row.savings, 0);

    return [
      {
        label: "Valor em estoque",
        value: currency(totalStockValue),
        icon: Wallet,
        color: "text-primary",
      },
      {
        label: "Estoque baixo",
        value: number(reports.lowStock.length),
        icon: TrendingDown,
        color: "text-[color:var(--warning)]",
      },
      {
        label: "Saidas no periodo",
        value: number(totalOut),
        icon: Activity,
        color: "text-destructive",
      },
      {
        label: "Economia potencial",
        value: currency(totalSavings),
        icon: ClipboardCheck,
        color: "text-[color:var(--success)]",
      },
      {
        label: "Ativos de TI",
        value: number(assetRows.length),
        icon: PackageSearch,
        color: "text-foreground",
      },
      {
        label: "Logs recentes",
        value: number(auditRows.length),
        icon: ShieldCheck,
        color: "text-primary",
      },
    ];
  }, [
    assetRows.length,
    auditRows.length,
    invRows,
    movRows,
    reports.lowStock.length,
    reports.quoteSavings,
  ]);

  const productMetricColumns: Column<ProductMetricRow>[] = [
    { key: "sku", header: "SKU", className: "font-mono text-xs" },
    { key: "product", header: "Produto" },
    { key: "category", header: "Categoria / Tipo" },
    {
      key: "quantity",
      header: "Qtd",
      render: (row) => number(row.quantity),
      sortValue: (row) => row.quantity,
      className: "text-right tabular-nums",
    },
    {
      key: "totalValue",
      header: "Valor",
      render: (row) => currency(row.totalValue),
      sortValue: (row) => row.totalValue,
      className: "text-right",
    },
    { key: "extra", header: "Detalhe" },
  ];

  const groupColumns: Column<GroupReportRow>[] = [
    { key: "name", header: "Nome" },
    {
      key: "count",
      header: "Mov.",
      render: (row) => number(row.count),
      sortValue: (row) => row.count,
      className: "text-right tabular-nums",
    },
    {
      key: "quantity",
      header: "Qtd",
      render: (row) => number(row.quantity),
      sortValue: (row) => row.quantity,
      className: "text-right tabular-nums",
    },
    {
      key: "totalValue",
      header: "Valor",
      render: (row) => currency(row.totalValue),
      sortValue: (row) => row.totalValue,
      className: "text-right",
    },
  ];

  return (
    <div>
      <PageHeader title="Relatorios" description="Analises e exportacoes por area." />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Ate</Label>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Resumo</TabsTrigger>
          <TabsTrigger value="movements">Movimentacoes</TabsTrigger>
          <TabsTrigger value="inventory">Inventario atual</TabsTrigger>
          <TabsTrigger value="stock">Estoque</TabsTrigger>
          <TabsTrigger value="consumption">Consumo</TabsTrigger>
          <TabsTrigger value="purchases">Compras</TabsTrigger>
          <TabsTrigger value="assets">Ativos TI</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {card.label}
                    </div>
                    <Icon className={`size-4 ${card.color}`} />
                  </div>
                  <div className="text-xl font-semibold tabular-nums">{card.value}</div>
                </div>
              );
            })}
          </div>

          <ReportTable
            title="Valor total em estoque"
            subtitle="Agrupado por categoria de produto."
            data={reports.stockValueByCategory}
            searchKeys={["group"]}
            emptyText="Nenhum valor em estoque."
            csvFilename="valor_total_estoque.csv"
            csvRows={reports.stockValueByCategory.map((row) => ({
              categoria: row.group,
              itens: row.items,
              quantidade: row.quantity,
              valor_total: row.totalValue,
            }))}
            pdfTitle="Valor total em estoque"
            pdfHeaders={["Categoria", "Itens", "Quantidade", "Valor total"]}
            pdfRows={reports.stockValueByCategory.map((row) => [
              row.group,
              number(row.items),
              number(row.quantity),
              currency(row.totalValue),
            ])}
            columns={[
              { key: "group", header: "Categoria" },
              {
                key: "items",
                header: "Itens",
                render: (row) => number(row.items),
                sortValue: (row) => row.items,
                className: "text-right tabular-nums",
              },
              {
                key: "quantity",
                header: "Quantidade",
                render: (row) => number(row.quantity),
                sortValue: (row) => row.quantity,
                className: "text-right tabular-nums",
              },
              {
                key: "totalValue",
                header: "Valor total",
                render: (row) => currency(row.totalValue),
                sortValue: (row) => row.totalValue,
                className: "text-right",
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="movements" className="mt-4 space-y-4">
          <ReportTable
            title="Movimentacoes"
            subtitle={`${dateBR(from)} a ${dateBR(to)}`}
            data={movRows}
            searchKeys={["reason", "notes"]}
            emptyText="Sem movimentacoes no periodo."
            csvFilename={`movimentacoes_${from}_${to}.csv`}
            csvRows={movRows.map((movement) => ({
              data: dateTimeBR(movement.movement_date),
              tipo: movement.type === "in" ? "Entrada" : "Saida",
              sku: movement.product?.sku ?? "",
              produto: movement.product?.name ?? "",
              quantidade: movement.quantity,
              custo: movement.unit_cost ?? "",
              fornecedor: movement.supplier?.name ?? "",
              solicitante: movement.person?.full_name ?? "",
              centro_custo: movement.cost_center?.name ?? "",
              motivo: movement.reason ?? "",
            }))}
            pdfTitle={`Movimentacoes ${dateBR(from)} a ${dateBR(to)}`}
            pdfHeaders={["Data", "Tipo", "SKU", "Produto", "Qtd", "Custo", "Origem/Destino"]}
            pdfRows={movRows.map((movement) => [
              dateTimeBR(movement.movement_date),
              movement.type === "in" ? "Entrada" : "Saida",
              movement.product?.sku ?? "",
              movement.product?.name ?? "",
              number(toNumber(movement.quantity)),
              movement.unit_cost ? currency(toNumber(movement.unit_cost)) : "-",
              movement.type === "in"
                ? (movement.supplier?.name ?? "-")
                : (movement.person?.full_name ?? "-"),
            ])}
            columns={[
              {
                key: "movement_date",
                header: "Data",
                render: (movement) => dateTimeBR(movement.movement_date),
                sortValue: (movement) => movement.movement_date,
              },
              {
                key: "type",
                header: "Tipo",
                searchValue: (movement) => (movement.type === "in" ? "Entrada" : "Saida"),
                render: (movement) => (movement.type === "in" ? "Entrada" : "Saida"),
              },
              {
                key: "product",
                header: "Produto",
                searchValue: (movement) =>
                  [movement.product?.sku, movement.product?.name, movement.product?.unit].join(" "),
                render: (movement) => movement.product?.name ?? "-",
              },
              {
                key: "quantity",
                header: "Qtd",
                render: (movement) => number(toNumber(movement.quantity)),
                sortValue: (movement) => toNumber(movement.quantity),
                className: "text-right tabular-nums",
              },
              {
                key: "unit_cost",
                header: "Custo",
                render: (movement) =>
                  movement.unit_cost ? currency(toNumber(movement.unit_cost)) : "-",
                sortValue: (movement) => toNumber(movement.unit_cost),
                className: "text-right",
              },
              {
                key: "ref",
                header: "Origem / Destino",
                searchValue: (movement) =>
                  [
                    movement.supplier?.name,
                    movement.person?.full_name,
                    movement.cost_center?.name,
                    movement.location?.name,
                  ].join(" "),
                render: (movement) =>
                  movement.type === "in"
                    ? (movement.supplier?.name ?? "-")
                    : (movement.person?.full_name ?? "-"),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4 space-y-4">
          <ReportTable
            title="Inventario atual"
            data={invRows}
            searchKeys={["sku", "name", "unit"]}
            emptyText="Nenhum item no inventario."
            csvFilename="inventario.csv"
            csvRows={invRows.map((product) => ({
              sku: product.sku,
              produto: product.name,
              categoria: product.category?.name ?? "",
              unidade: product.unit,
              estoque: product.current_stock,
              minimo: product.min_stock,
              custo_medio: product.avg_cost,
              valor_total: toNumber(product.current_stock) * toNumber(product.avg_cost),
            }))}
            pdfTitle="Inventario atual"
            pdfHeaders={[
              "SKU",
              "Produto",
              "Categoria",
              "Unid.",
              "Estoque",
              "Minimo",
              "Custo medio",
              "Valor total",
            ]}
            pdfRows={invRows.map((product) => [
              product.sku ?? "",
              product.name ?? "",
              product.category?.name ?? "-",
              product.unit ?? "",
              number(toNumber(product.current_stock)),
              number(toNumber(product.min_stock)),
              currency(toNumber(product.avg_cost)),
              currency(toNumber(product.current_stock) * toNumber(product.avg_cost)),
            ])}
            columns={[
              { key: "sku", header: "SKU", className: "font-mono text-xs" },
              {
                key: "name",
                header: "Produto",
                searchValue: (product) =>
                  [product.name, product.category?.name, product.supplier?.name].join(" "),
              },
              {
                key: "category",
                header: "Categoria",
                searchValue: (product) => product.category?.name,
                render: (product) => product.category?.name ?? "-",
              },
              {
                key: "current_stock",
                header: "Estoque",
                render: (product) => number(toNumber(product.current_stock)),
                sortValue: (product) => toNumber(product.current_stock),
                className: "text-right tabular-nums",
              },
              {
                key: "min_stock",
                header: "Minimo",
                render: (product) => number(toNumber(product.min_stock)),
                sortValue: (product) => toNumber(product.min_stock),
                className: "text-right tabular-nums",
              },
              {
                key: "avg_cost",
                header: "Custo medio",
                render: (product) => currency(toNumber(product.avg_cost)),
                sortValue: (product) => toNumber(product.avg_cost),
                className: "text-right",
              },
              {
                key: "total_value",
                header: "Valor total",
                render: (product) =>
                  currency(toNumber(product.current_stock) * toNumber(product.avg_cost)),
                sortValue: (product) =>
                  toNumber(product.current_stock) * toNumber(product.avg_cost),
                className: "text-right",
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-8">
          <ReportTable
            title="Estoque baixo"
            subtitle="Produtos ativos abaixo ou no estoque minimo."
            data={reports.lowStock}
            columns={productMetricColumns}
            searchKeys={["sku", "product", "category"]}
            emptyText="Nenhum produto com estoque baixo."
            csvFilename="estoque_baixo.csv"
            csvRows={reports.lowStock.map((row) => ({
              sku: row.sku,
              produto: row.product,
              categoria: row.category,
              estoque: row.quantity,
              minimo: row.extra,
              valor: row.totalValue,
            }))}
            pdfTitle="Estoque baixo"
            pdfHeaders={["SKU", "Produto", "Categoria", "Estoque", "Minimo", "Valor"]}
            pdfRows={reports.lowStock.map((row) => [
              row.sku,
              row.product,
              row.category,
              number(row.quantity),
              row.extra ?? "",
              currency(row.totalValue),
            ])}
          />

          <ReportTable
            title="Produtos sem movimentacao"
            subtitle={`Sem movimentacao ha ${IDLE_DAYS_LIMIT}+ dias ou nunca movimentados.`}
            data={reports.idleProducts}
            columns={productMetricColumns}
            searchKeys={["sku", "product", "category", "extra"]}
            emptyText="Nenhum produto parado neste criterio."
            csvFilename="produtos_sem_movimentacao.csv"
            csvRows={reports.idleProducts.map((row) => ({
              sku: row.sku,
              produto: row.product,
              categoria: row.category,
              estoque: row.quantity,
              valor: row.totalValue,
              periodo_sem_movimento: row.extra,
            }))}
          />

          <ReportTable
            title="Itens proximos de reposicao"
            subtitle={`Previsao baseada nas saidas entre ${dateBR(from)} e ${dateBR(to)}.`}
            data={reports.reorder}
            searchKeys={["sku", "product"]}
            emptyText="Nenhum item proximo de reposicao."
            csvFilename="itens_proximos_reposicao.csv"
            csvRows={reports.reorder.map((row) => ({
              sku: row.sku,
              produto: row.product,
              estoque: row.stock,
              minimo: row.minStock,
              consumo_medio_diario: row.avgDailyOut,
              dias_ate_minimo: row.daysToMinimum,
            }))}
            columns={[
              { key: "sku", header: "SKU", className: "font-mono text-xs" },
              { key: "product", header: "Produto" },
              {
                key: "stock",
                header: "Estoque",
                render: (row) => number(row.stock),
                sortValue: (row) => row.stock,
                className: "text-right tabular-nums",
              },
              {
                key: "minStock",
                header: "Minimo",
                render: (row) => number(row.minStock),
                sortValue: (row) => row.minStock,
                className: "text-right tabular-nums",
              },
              {
                key: "avgDailyOut",
                header: "Media diaria",
                render: (row) => number(row.avgDailyOut),
                sortValue: (row) => row.avgDailyOut,
                className: "text-right tabular-nums",
              },
              {
                key: "daysToMinimum",
                header: "Dias ate minimo",
                render: (row) => number(Math.max(0, Math.ceil(row.daysToMinimum))),
                sortValue: (row) => row.daysToMinimum,
                className: "text-right tabular-nums",
              },
            ]}
          />

          <ReportTable
            title="Perdas e ajustes"
            subtitle="Movimentacoes identificadas por motivo ou observacao."
            data={reports.lossAdjustments}
            columns={productMetricColumns}
            searchKeys={["sku", "product", "extra"]}
            emptyText="Nenhuma perda ou ajuste no periodo."
            csvFilename="perdas_ajustes.csv"
            csvRows={reports.lossAdjustments.map((row) => ({
              sku: row.sku,
              produto: row.product,
              tipo: row.category,
              quantidade: row.quantity,
              valor: row.totalValue,
              detalhe: row.extra,
            }))}
          />
        </TabsContent>

        <TabsContent value="consumption" className="mt-4 space-y-8">
          <ReportTable
            title="Consumo por centro de custo"
            data={reports.costCenterConsumption}
            columns={groupColumns}
            searchKeys={["name"]}
            emptyText="Sem saidas por centro de custo no periodo."
            csvFilename="consumo_por_centro_custo.csv"
            csvRows={reports.costCenterConsumption.map((row) => ({
              centro_custo: row.name,
              movimentacoes: row.count,
              quantidade: row.quantity,
              valor_estimado: row.totalValue,
            }))}
          />

          <ReportTable
            title="Saidas por solicitante"
            data={reports.personOutputs}
            columns={groupColumns}
            searchKeys={["name"]}
            emptyText="Sem saidas por solicitante no periodo."
            csvFilename="saidas_por_solicitante.csv"
            csvRows={reports.personOutputs.map((row) => ({
              solicitante: row.name,
              movimentacoes: row.count,
              quantidade: row.quantity,
              valor_estimado: row.totalValue,
            }))}
          />

          <ReportTable
            title="Ranking de produtos mais consumidos"
            data={reports.topConsumed}
            columns={groupColumns}
            searchKeys={["name"]}
            emptyText="Sem consumo de produtos no periodo."
            csvFilename="ranking_produtos_consumidos.csv"
            csvRows={reports.topConsumed.map((row) => ({
              produto: row.name,
              movimentacoes: row.count,
              quantidade: row.quantity,
              valor_estimado: row.totalValue,
            }))}
          />
        </TabsContent>

        <TabsContent value="purchases" className="mt-4 space-y-8">
          <ReportTable
            title="Entradas por fornecedor"
            data={reports.supplierEntries}
            columns={groupColumns}
            searchKeys={["name"]}
            emptyText="Sem entradas por fornecedor no periodo."
            csvFilename="entradas_por_fornecedor.csv"
            csvRows={reports.supplierEntries.map((row) => ({
              fornecedor: row.name,
              movimentacoes: row.count,
              quantidade: row.quantity,
              valor: row.totalValue,
            }))}
          />

          <ReportTable
            title="Historico de preco por produto"
            data={reports.priceHistory}
            searchKeys={["sku", "product", "sources"]}
            emptyText="Nenhum historico de preco encontrado."
            csvFilename="historico_preco_produto.csv"
            csvRows={reports.priceHistory.map((row) => ({
              sku: row.sku,
              produto: row.product,
              origem: row.sources,
              registros: row.count,
              menor: row.min,
              maior: row.max,
              media: row.average,
              ultimo_preco: row.lastPrice,
              ultima_data: row.lastDate,
            }))}
            columns={[
              { key: "sku", header: "SKU", className: "font-mono text-xs" },
              { key: "product", header: "Produto" },
              { key: "sources", header: "Origem" },
              {
                key: "count",
                header: "Reg.",
                render: (row) => number(row.count),
                sortValue: (row) => row.count,
                className: "text-right tabular-nums",
              },
              {
                key: "min",
                header: "Menor",
                render: (row) => currency(row.min),
                sortValue: (row) => row.min,
                className: "text-right",
              },
              {
                key: "average",
                header: "Media",
                render: (row) => currency(row.average),
                sortValue: (row) => row.average,
                className: "text-right",
              },
              {
                key: "lastPrice",
                header: "Ultimo",
                render: (row) => currency(row.lastPrice),
                sortValue: (row) => row.lastPrice,
                className: "text-right",
              },
            ]}
          />

          <ReportTable
            title="Economia nas cotacoes"
            subtitle="Comparacao entre maior e menor preco por produto."
            data={reports.quoteSavings}
            searchKeys={["sku", "product"]}
            emptyText="Sem produtos com duas ou mais cotacoes."
            csvFilename="economia_cotacoes.csv"
            csvRows={reports.quoteSavings.map((row) => ({
              sku: row.sku,
              produto: row.product,
              cotacoes: row.quotes,
              fornecedores: row.suppliers,
              menor_preco: row.min,
              maior_preco: row.max,
              economia: row.savings,
              economia_percentual: row.savingsPct,
            }))}
            columns={[
              { key: "sku", header: "SKU", className: "font-mono text-xs" },
              { key: "product", header: "Produto" },
              {
                key: "quotes",
                header: "Cotacoes",
                render: (row) => number(row.quotes),
                sortValue: (row) => row.quotes,
                className: "text-right tabular-nums",
              },
              {
                key: "min",
                header: "Menor",
                render: (row) => currency(row.min),
                sortValue: (row) => row.min,
                className: "text-right",
              },
              {
                key: "max",
                header: "Maior",
                render: (row) => currency(row.max),
                sortValue: (row) => row.max,
                className: "text-right",
              },
              {
                key: "savings",
                header: "Economia",
                render: (row) => currency(row.savings),
                sortValue: (row) => row.savings,
                className: "text-right",
              },
              {
                key: "savingsPct",
                header: "%",
                render: (row) => `${number(row.savingsPct)}%`,
                sortValue: (row) => row.savingsPct,
                className: "text-right",
              },
            ]}
          />

          <ReportTable
            title="Compras pendentes"
            subtitle="Cotacoes aprovadas sem entrada posterior correspondente."
            data={reports.pendingPurchases}
            searchKeys={["product", "supplier", "status"]}
            emptyText="Nenhuma compra pendente encontrada."
            csvFilename="compras_pendentes.csv"
            csvRows={reports.pendingPurchases.map((row) => ({
              produto: row.product,
              fornecedor: row.supplier,
              preco: row.price,
              status: row.status,
              data: row.createdAt,
              link: row.purchaseLink,
            }))}
            columns={[
              { key: "product", header: "Produto" },
              { key: "supplier", header: "Fornecedor" },
              {
                key: "price",
                header: "Preco",
                render: (row) => currency(row.price),
                sortValue: (row) => row.price,
                className: "text-right",
              },
              {
                key: "createdAt",
                header: "Data",
                render: (row) => dateBR(row.createdAt),
                sortValue: (row) => row.createdAt,
              },
              {
                key: "purchaseLink",
                header: "Link",
                render: (row) => {
                  const href = resolvePurchaseLink(row.purchaseLink);
                  return href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      Abrir
                    </a>
                  ) : (
                    "-"
                  );
                },
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-4 space-y-8">
          <ReportTable
            title="Ativos de TI por status"
            data={reports.assetsByStatus}
            searchKeys={["name"]}
            emptyText="Nenhum ativo cadastrado."
            csvFilename="ativos_ti_por_status.csv"
            csvRows={reports.assetsByStatus.map((row) => ({
              status: row.name,
              quantidade: row.count,
            }))}
            columns={[
              { key: "name", header: "Status" },
              {
                key: "count",
                header: "Quantidade",
                render: (row) => number(row.count),
                sortValue: (row) => row.count,
                className: "text-right tabular-nums",
              },
            ]}
          />

          <ReportTable
            title="Ativos de TI por tipo"
            data={reports.assetsByType}
            searchKeys={["name"]}
            emptyText="Nenhum tipo de ativo encontrado."
            csvFilename="ativos_ti_por_tipo.csv"
            csvRows={reports.assetsByType.map((row) => ({
              tipo: row.name,
              quantidade: row.count,
            }))}
            columns={[
              { key: "name", header: "Tipo" },
              {
                key: "count",
                header: "Quantidade",
                render: (row) => number(row.count),
                sortValue: (row) => row.count,
                className: "text-right tabular-nums",
              },
            ]}
          />

          <ReportTable
            title="Ativos por responsavel e localizacao"
            data={reports.assetDetails}
            searchKeys={["asset", "typeName", "status", "responsible", "location", "patrimonyTag"]}
            emptyText="Nenhum ativo encontrado."
            csvFilename="ativos_por_responsavel_localizacao.csv"
            csvRows={reports.assetDetails.map((row) => ({
              ativo: row.asset,
              tipo: row.typeName,
              status: row.status,
              responsavel: row.responsible,
              localizacao: row.location,
              patrimonio: row.patrimonyTag,
            }))}
            columns={[
              { key: "asset", header: "Ativo" },
              { key: "typeName", header: "Tipo" },
              { key: "status", header: "Status" },
              { key: "responsible", header: "Responsavel" },
              { key: "location", header: "Localizacao" },
              { key: "patrimonyTag", header: "Patrimonio", className: "font-mono text-xs" },
            ]}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4 space-y-8">
          <ReportTable
            title="Auditoria de alteracoes"
            subtitle="Ultimos 250 registros de log."
            data={reports.audit}
            searchKeys={["action", "table_name", "description", "actionLabel", "tableLabel"]}
            emptyText="Nenhum log encontrado."
            csvFilename="auditoria.csv"
            csvRows={reports.audit.map((row) => ({
              data: row.created_at,
              acao: row.actionLabel,
              tabela: row.tableLabel,
              descricao: row.description,
              usuario: row.user_id,
            }))}
            columns={[
              {
                key: "created_at",
                header: "Data",
                render: (row) => dateTimeBR(row.created_at),
                sortValue: (row) => row.created_at,
              },
              { key: "actionLabel", header: "Acao" },
              { key: "tableLabel", header: "Tabela" },
              { key: "description", header: "Descricao" },
              { key: "user_id", header: "Usuario", className: "font-mono text-xs" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
