import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { db } from "@/lib/supabase";
import { currency, number, dateTimeBR, dateBR, exportToCSV, exportToPDF } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: Page });

function Page() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const movs = useQuery({
    queryKey: ["report", "movements", from, to],
    queryFn: async () => {
      const { data } = await db
        .from("stock_movements")
        .select("*, product:products(name, sku, unit), supplier:suppliers(name), person:people(full_name), cost_center:cost_centers(name)")
        .gte("movement_date", from)
        .lte("movement_date", to + "T23:59:59")
        .order("movement_date", { ascending: false });
      return data ?? [];
    },
  });

  const inventory = useQuery({
    queryKey: ["report", "inventory"],
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("*, category:product_categories(name), supplier:suppliers(name), location:locations(name)")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  type Mov = {
    id: string; movement_date: string; type: "in" | "out"; quantity: number; unit_cost: number | null;
    reason: string | null; product?: { name: string; sku: string; unit: string } | null;
    supplier?: { name: string } | null; person?: { full_name: string } | null; cost_center?: { name: string } | null;
  };
  type Inv = {
    id: string; sku: string; name: string; unit: string; current_stock: number; min_stock: number;
    avg_cost: number; reference_price: number;
    category?: { name: string } | null; supplier?: { name: string } | null; location?: { name: string } | null;
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
              <Button variant="outline" onClick={() => exportToCSV(`movimentacoes_${from}_${to}.csv`,
                movRows.map((m) => ({
                  data: dateTimeBR(m.movement_date), tipo: m.type === "in" ? "Entrada" : "Saída",
                  sku: m.product?.sku ?? "", produto: m.product?.name ?? "",
                  quantidade: m.quantity, custo: m.unit_cost ?? "",
                  fornecedor: m.supplier?.name ?? "", solicitante: m.person?.full_name ?? "",
                  centro_custo: m.cost_center?.name ?? "", motivo: m.reason ?? "",
                })))
              }>
                <Download className="size-4 mr-2" /> CSV
              </Button>
              <Button onClick={() => exportToPDF(
                `Movimentações ${dateBR(from)} a ${dateBR(to)}`,
                ["Data", "Tipo", "SKU", "Produto", "Qtd", "Custo", "Origem/Destino"],
                movRows.map((m) => [
                  dateTimeBR(m.movement_date),
                  m.type === "in" ? "Entrada" : "Saída",
                  m.product?.sku ?? "",
                  m.product?.name ?? "",
                  number(Number(m.quantity)),
                  m.unit_cost ? currency(Number(m.unit_cost)) : "—",
                  m.type === "in" ? m.supplier?.name ?? "—" : m.person?.full_name ?? "—",
                ]),
              )}>
                <Printer className="size-4 mr-2" /> PDF
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Data</th>
                  <th className="text-left px-4 py-2.5">Tipo</th>
                  <th className="text-left px-4 py-2.5">Produto</th>
                  <th className="text-right px-4 py-2.5">Qtd</th>
                  <th className="text-right px-4 py-2.5">Custo</th>
                  <th className="text-left px-4 py-2.5">Origem / Destino</th>
                </tr>
              </thead>
              <tbody>
                {movRows.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2.5">{dateTimeBR(m.movement_date)}</td>
                    <td className="px-4 py-2.5">{m.type === "in" ? "Entrada" : "Saída"}</td>
                    <td className="px-4 py-2.5">{m.product?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{number(Number(m.quantity))}</td>
                    <td className="px-4 py-2.5 text-right">{m.unit_cost ? currency(Number(m.unit_cost)) : "—"}</td>
                    <td className="px-4 py-2.5">{m.type === "in" ? m.supplier?.name ?? "—" : m.person?.full_name ?? "—"}</td>
                  </tr>
                ))}
                {movRows.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Sem movimentações no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => exportToCSV("inventario.csv",
              invRows.map((p) => ({
                sku: p.sku, produto: p.name, categoria: p.category?.name ?? "",
                unidade: p.unit, estoque: p.current_stock, minimo: p.min_stock,
                custo_medio: p.avg_cost, valor_total: Number(p.current_stock) * Number(p.avg_cost),
              })))
            }>
              <Download className="size-4 mr-2" /> CSV
            </Button>
            <Button onClick={() => exportToPDF(
              "Inventário atual",
              ["SKU", "Produto", "Categoria", "Unid.", "Estoque", "Mínimo", "Custo médio", "Valor total"],
              invRows.map((p) => [
                p.sku, p.name, p.category?.name ?? "—", p.unit,
                number(Number(p.current_stock)), number(Number(p.min_stock)),
                currency(Number(p.avg_cost)),
                currency(Number(p.current_stock) * Number(p.avg_cost)),
              ]),
            )}>
              <Printer className="size-4 mr-2" /> PDF
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">SKU</th>
                  <th className="text-left px-4 py-2.5">Produto</th>
                  <th className="text-left px-4 py-2.5">Categoria</th>
                  <th className="text-right px-4 py-2.5">Estoque</th>
                  <th className="text-right px-4 py-2.5">Mínimo</th>
                  <th className="text-right px-4 py-2.5">Custo médio</th>
                  <th className="text-right px-4 py-2.5">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {invRows.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-2.5">{p.name}</td>
                    <td className="px-4 py-2.5">{p.category?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{number(Number(p.current_stock))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{number(Number(p.min_stock))}</td>
                    <td className="px-4 py-2.5 text-right">{currency(Number(p.avg_cost))}</td>
                    <td className="px-4 py-2.5 text-right">{currency(Number(p.current_stock) * Number(p.avg_cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}