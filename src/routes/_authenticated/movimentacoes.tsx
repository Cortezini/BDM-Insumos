import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Download, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { RecordModal, type Field } from "@/components/shared/RecordModal";
import { useList } from "@/lib/crud";
import { db } from "@/lib/supabase";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { currency, number, dateTimeBR, exportToCSV } from "@/lib/format";
import { toast } from "sonner";
import type {
  StockMovement, Product, Supplier, Person, CostCenter, Location as Loc, MovementType,
} from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/movimentacoes")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useList<StockMovement>(
    "stock_movements",
    "*, product:products(id, name, sku, unit, current_stock, avg_cost), supplier:suppliers(name), person:people(full_name), cost_center:cost_centers(name), location:locations(name)",
    "movement_date",
  );
  const products = useList<Product>("products", "*", "name");
  const suppliers = useList<Supplier>("suppliers", "*", "name");
  const people = useList<Person>("people", "*", "full_name");
  const ccs = useList<CostCenter>("cost_centers", "*", "name");
  const locs = useList<Loc>("locations", "*", "name");

  const [filter, setFilter] = useState<"all" | MovementType>("all");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MovementType>("in");

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const productId = payload.product_id as string;
      const product = (products.data ?? []).find((p) => p.id === productId);
      if (!product) throw new Error("Produto não encontrado");
      const qty = Number(payload.quantity);
      if (!qty || qty <= 0) throw new Error("Informe uma quantidade válida");
      if (type === "out" && qty > Number(product.current_stock)) {
        throw new Error("Estoque insuficiente para esta saída");
      }

      const movement = {
        type,
        product_id: productId,
        quantity: qty,
        unit_cost: payload.unit_cost ? Number(payload.unit_cost) : null,
        supplier_id: (payload.supplier_id as string) || null,
        person_id: (payload.person_id as string) || null,
        cost_center_id: (payload.cost_center_id as string) || null,
        location_id: (payload.location_id as string) || product.location_id,
        reason: (payload.reason as string) || null,
        notes: (payload.notes as string) || null,
        movement_date: (payload.movement_date as string) || new Date().toISOString(),
        user_id: user?.id ?? null,
      };

      const { error } = await db.from("stock_movements").insert(movement);
      if (error) throw error;

      const newStock =
        type === "in" ? Number(product.current_stock) + qty : Number(product.current_stock) - qty;
      let newAvg = Number(product.avg_cost);
      if (type === "in" && movement.unit_cost && movement.unit_cost > 0) {
        const totalValue = Number(product.current_stock) * Number(product.avg_cost) + qty * movement.unit_cost;
        newAvg = newStock > 0 ? totalValue / newStock : movement.unit_cost;
      }
      const { error: upErr } = await db
        .from("products")
        .update({ current_stock: newStock, avg_cost: newAvg })
        .eq("id", productId);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Movimentação registrada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baseFields: Field[] = useMemo(
    () => [
      { name: "movement_date", label: "Data e hora", type: "date" },
      {
        name: "product_id",
        label: "Produto",
        type: "select",
        required: true,
        options: (products.data ?? []).map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
      },
      { name: "quantity", label: "Quantidade", type: "number", required: true, step: "0.001" },
    ],
    [products.data],
  );

  const inFields: Field[] = [
    ...baseFields,
    { name: "unit_cost", label: "Custo unitário (R$)", type: "number", step: "0.01" },
    {
      name: "supplier_id",
      label: "Fornecedor",
      type: "select",
      allowEmpty: true,
      options: (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    },
    {
      name: "location_id",
      label: "Localização destino",
      type: "select",
      allowEmpty: true,
      options: (locs.data ?? []).map((l) => ({ value: l.id, label: l.name })),
    },
    { name: "reason", label: "Motivo / Nº NF", type: "text" },
    { name: "notes", label: "Observações", type: "textarea" },
  ];

  const outFields: Field[] = [
    ...baseFields,
    {
      name: "person_id",
      label: "Solicitante",
      type: "select",
      allowEmpty: true,
      options: (people.data ?? []).map((p) => ({ value: p.id, label: p.full_name })),
    },
    {
      name: "cost_center_id",
      label: "Centro de custo",
      type: "select",
      allowEmpty: true,
      options: (ccs.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "location_id",
      label: "Localização origem",
      type: "select",
      allowEmpty: true,
      options: (locs.data ?? []).map((l) => ({ value: l.id, label: l.name })),
    },
    { name: "reason", label: "Motivo / Requisição", type: "text" },
    { name: "notes", label: "Observações", type: "textarea" },
  ];

  const rows = (list.data ?? []).filter((m) => (filter === "all" ? true : m.type === filter));

  return (
    <div>
      <PageHeader
        title="Movimentações"
        description="Registre entradas e saídas com rastreabilidade."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV(
                  "movimentacoes.csv",
                  rows.map((m) => ({
                    data: dateTimeBR(m.movement_date),
                    tipo: m.type === "in" ? "Entrada" : "Saída",
                    produto: m.product?.name ?? "",
                    sku: m.product?.sku ?? "",
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
              <Download className="size-4 mr-2" /> Exportar
            </Button>
            <Button variant="outline" onClick={() => { setType("out"); setOpen(true); }}>
              <ArrowUpFromLine className="size-4 mr-2" /> Saída
            </Button>
            <Button onClick={() => { setType("in"); setOpen(true); }}>
              <ArrowDownToLine className="size-4 mr-2" /> Entrada
            </Button>
          </>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="in">Entradas</TabsTrigger>
          <TabsTrigger value="out">Saídas</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        data={rows}
        searchKeys={["reason"]}
        columns={[
          { key: "movement_date", header: "Data", render: (r) => dateTimeBR(r.movement_date), sortValue: (r) => r.movement_date },
          {
            key: "type",
            header: "Tipo",
            render: (r) => (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                  r.type === "in"
                    ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                    : "bg-destructive/15 text-destructive"
                }`}
              >
                {r.type === "in" ? <ArrowDownToLine className="size-3" /> : <ArrowUpFromLine className="size-3" />}
                {r.type === "in" ? "Entrada" : "Saída"}
              </span>
            ),
          },
          { key: "product", header: "Produto", render: (r) => r.product?.name ?? "—" },
          { key: "quantity", header: "Qtd", render: (r) => number(Number(r.quantity)), className: "text-right tabular-nums" },
          { key: "unit_cost", header: "Custo unit.", render: (r) => (r.unit_cost ? currency(Number(r.unit_cost)) : "—") },
          { key: "ref", header: "Origem / Destino", render: (r) =>
            r.type === "in" ? r.supplier?.name ?? "—" : `${r.person?.full_name ?? "—"}${r.cost_center?.name ? ` · ${r.cost_center.name}` : ""}`,
          },
          { key: "reason", header: "Motivo" },
        ]}
      />

      <RecordModal
        open={open}
        onOpenChange={setOpen}
        title={type === "in" ? "Nova entrada" : "Nova saída"}
        description={type === "in" ? "Registre uma entrada de produto no estoque." : "Registre uma saída do estoque."}
        fields={type === "in" ? inFields : outFields}
        initial={{ movement_date: new Date().toISOString().slice(0, 10) }}
        submitting={create.isPending}
        onSubmit={async (v) => { await create.mutateAsync(v); }}
      />
    </div>
  );
}