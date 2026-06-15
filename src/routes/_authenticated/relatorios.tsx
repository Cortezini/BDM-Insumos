import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { db } from "@/lib/supabase";
import { currency, number, dateTimeBR, dateBR, exportToCSV, exportToPDF } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: Page });

function Page() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const movs = useQuery({
    queryKey: ["report", "movements", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await db
        .from("stock_movements")
        .select(
          "*, product:products(name, sku, unit), supplier:suppliers(name), person:people(full_name), cost_center:cost_centers(name)",
        )
        .eq("company_id", companyId)
        .gte("movement_date", from)
        .lte("movement_date", to + "T23:59:59")
        .order("movement_date", { ascending: false });
      return data ?? [];
    },
  });

  const inventory = useQuery({
    queryKey: ["report", "inventory", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select(
          "*, category:product_categories(name), supplier:suppliers(name), location:locations(name)",
        )
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  type Mov = {
    id: string;
    movement_date: string;
    type: "in" | "out";
    quantity: number;
    unit_cost: number | null;
    reason: string | null;
    product?: { name: string; sku: string; unit: string } | null;
    supplier?: { name: string } | null;
    person?: { full_name: string } | null;
    cost_center?: { name: string } | null;
  };
  type Inv = {
    id: string;
    sku: string;
    name: string;
    unit: string;
    current_stock: number;
    min_stock: number;
    avg_cost: number;
    reference_price: number;
    category?: { name: string } | null;
    supplier?: { name: string } | null;
    location?: { name: string } | null;
  };

  const movRows = (movs.data ?? []) as Mov[];
  const invRows = (inventory.data ?? []) as Inv[];

  return (
    <div>
      <PageHeader title="Relatórios" description="Análises e exportações." />

      <Tabs defaultValue="movements">
        <TabsList>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
          <TabsTrigger value="inventory">Inventário atual</TabsTrigger>
        </TabsList>

        <TabsContent value="movements" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-border bg-card">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  exportToCSV(
                    `movimentacoes_${from}_${to}.csv`,
                    movRows.map((m) => ({
                      data: dateTimeBR(m.movement_date),
                      tipo: m.type === "in" ? "Entrada" : "Saída",
                      sku: m.product?.sku ?? "",
                      produto: m.product?.name ?? "",
                      quantidade: m.quantity,
                      custo: m.unit_cost ?? "",
                      fornecedor: m.supplier?.name ?? "",
                      solicitante: m.person?.full_name ?? "",
                      centro_custo: m.cost_center?.name ?? "",
                      motivo: m.reason ?? "",
                    })),
                  )
                }
              >
                <Download className="size-4 mr-2" /> CSV
              </Button>
              <Button
                onClick={() =>
                  exportToPDF(
                    `Movimentações ${dateBR(from)} a ${dateBR(to)}`,
                    ["Data", "Tipo", "SKU", "Produto", "Qtd", "Custo", "Origem/Destino"],
                    movRows.map((m) => [
                      dateTimeBR(m.movement_date),
                      m.type === "in" ? "Entrada" : "Saída",
                      m.product?.sku ?? "",
                      m.product?.name ?? "",
                      number(Number(m.quantity)),
                      m.unit_cost ? currency(Number(m.unit_cost)) : "—",
                      m.type === "in" ? (m.supplier?.name ?? "—") : (m.person?.full_name ?? "—"),
                    ]),
                  )
                }
              >
                <Printer className="size-4 mr-2" /> PDF
              </Button>
            </div>
          </div>

          <DataTable
            data={movRows}
            searchKeys={["reason"]}
            emptyText="Sem movimentações no período."
            columns={[
              {
                key: "movement_date",
                header: "Data",
                render: (m) => dateTimeBR(m.movement_date),
                sortValue: (m) => m.movement_date,
              },
              {
                key: "type",
                header: "Tipo",
                searchValue: (m) => (m.type === "in" ? "Entrada" : "Saída"),
                render: (m) => (m.type === "in" ? "Entrada" : "Saída"),
              },
              {
                key: "product",
                header: "Produto",
                searchValue: (m) => [m.product?.sku, m.product?.name, m.product?.unit].join(" "),
                render: (m) => m.product?.name ?? "—",
              },
              {
                key: "quantity",
                header: "Qtd",
                render: (m) => number(Number(m.quantity)),
                sortValue: (m) => Number(m.quantity),
                className: "text-right tabular-nums",
              },
              {
                key: "unit_cost",
                header: "Custo",
                render: (m) => (m.unit_cost ? currency(Number(m.unit_cost)) : "—"),
                sortValue: (m) => Number(m.unit_cost ?? 0),
                className: "text-right",
              },
              {
                key: "ref",
                header: "Origem / Destino",
                searchValue: (m) =>
                  [m.supplier?.name, m.person?.full_name, m.cost_center?.name].join(" "),
                render: (m) =>
                  m.type === "in" ? (m.supplier?.name ?? "—") : (m.person?.full_name ?? "—"),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV(
                  "inventario.csv",
                  invRows.map((p) => ({
                    sku: p.sku,
                    produto: p.name,
                    categoria: p.category?.name ?? "",
                    unidade: p.unit,
                    estoque: p.current_stock,
                    minimo: p.min_stock,
                    custo_medio: p.avg_cost,
                    valor_total: Number(p.current_stock) * Number(p.avg_cost),
                  })),
                )
              }
            >
              <Download className="size-4 mr-2" /> CSV
            </Button>
            <Button
              onClick={() =>
                exportToPDF(
                  "Inventário atual",
                  [
                    "SKU",
                    "Produto",
                    "Categoria",
                    "Unid.",
                    "Estoque",
                    "Mínimo",
                    "Custo médio",
                    "Valor total",
                  ],
                  invRows.map((p) => [
                    p.sku,
                    p.name,
                    p.category?.name ?? "—",
                    p.unit,
                    number(Number(p.current_stock)),
                    number(Number(p.min_stock)),
                    currency(Number(p.avg_cost)),
                    currency(Number(p.current_stock) * Number(p.avg_cost)),
                  ]),
                )
              }
            >
              <Printer className="size-4 mr-2" /> PDF
            </Button>
          </div>
          <DataTable
            data={invRows}
            searchKeys={["sku", "name", "unit"]}
            emptyText="Nenhum item no inventário."
            columns={[
              { key: "sku", header: "SKU", className: "font-mono text-xs" },
              {
                key: "name",
                header: "Produto",
                searchValue: (p) => [p.name, p.category?.name, p.supplier?.name].join(" "),
              },
              {
                key: "category",
                header: "Categoria",
                searchValue: (p) => p.category?.name,
                render: (p) => p.category?.name ?? "—",
              },
              {
                key: "current_stock",
                header: "Estoque",
                render: (p) => number(Number(p.current_stock)),
                sortValue: (p) => Number(p.current_stock),
                className: "text-right tabular-nums",
              },
              {
                key: "min_stock",
                header: "Mínimo",
                render: (p) => number(Number(p.min_stock)),
                sortValue: (p) => Number(p.min_stock),
                className: "text-right tabular-nums",
              },
              {
                key: "avg_cost",
                header: "Custo médio",
                render: (p) => currency(Number(p.avg_cost)),
                sortValue: (p) => Number(p.avg_cost),
                className: "text-right",
              },
              {
                key: "total_value",
                header: "Valor total",
                render: (p) => currency(Number(p.current_stock) * Number(p.avg_cost)),
                sortValue: (p) => Number(p.current_stock) * Number(p.avg_cost),
                className: "text-right",
              },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
