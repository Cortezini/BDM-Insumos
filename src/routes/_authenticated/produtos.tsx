import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { RecordModal, type Field } from "@/components/shared/RecordModal";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import { currency, number, exportToCSV } from "@/lib/format";
import type { Product, Supplier, ProductCategory, Location as Loc } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/produtos")({ component: Page });

function Page() {
  const list = useList<Product>(
    "products",
    "*, category:product_categories(*), supplier:suppliers(*), location:locations(*)",
  );
  const cats = useList<ProductCategory>("product_categories", "*", "name");
  const sups = useList<Supplier>("suppliers", "*", "name");
  const locs = useList<Loc>("locations", "*", "name");
  const upsertCat = useUpsert("product_categories");
  const upsert = useUpsert("products");
  const del = useDelete("products");
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const fields: Field[] = useMemo(
    () => [
      { name: "name", label: "Nome do produto", type: "text", required: true },
      { name: "sku", label: "SKU / Código", type: "text", required: true },
      {
        name: "category_id",
        label: "Categoria",
        type: "select",
        allowEmpty: true,
        options: (cats.data ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      { name: "unit", label: "Unidade (UN, KG, L...)", type: "text", required: true },
      {
        name: "supplier_id",
        label: "Fornecedor padrão",
        type: "select",
        allowEmpty: true,
        options: (sups.data ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: "location_id",
        label: "Localização",
        type: "select",
        allowEmpty: true,
        options: (locs.data ?? []).map((l) => ({ value: l.id, label: l.name })),
      },
      { name: "min_stock", label: "Estoque mínimo", type: "number", step: "0.001" },
      { name: "reference_price", label: "Preço de referência (R$)", type: "currency" },
      { name: "active", label: "Status", type: "switch" },
    ],
    [cats.data, sups.data, locs.data],
  );

  const rows = list.data ?? [];

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Catálogo de itens e saldos atuais."
        actions={
          <>
            <Button variant="outline" onClick={() => setCatOpen(true)}>
              Nova categoria
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV(
                  "produtos.csv",
                  rows.map((p) => ({
                    sku: p.sku,
                    nome: p.name,
                    categoria: p.category?.name ?? "",
                    unidade: p.unit,
                    estoque: p.current_stock,
                    minimo: p.min_stock,
                    custo_medio: p.avg_cost,
                    preco_ref: p.reference_price,
                  })),
                )
              }
            >
              <Download className="size-4 mr-2" /> Exportar
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4 mr-2" /> Novo produto
            </Button>
          </>
        }
      />
      <DataTable
        data={rows}
        searchKeys={["name", "sku"]}
        columns={[
          { key: "sku", header: "SKU", className: "font-mono text-xs" },
          {
            key: "name",
            header: "Produto",
            searchValue: (r) => [r.name, r.category?.name].join(" "),
            render: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.category?.name ?? "Sem categoria"}
                </div>
              </div>
            ),
          },
          { key: "unit", header: "Unid." },
          {
            key: "current_stock",
            header: "Estoque",
            sortValue: (r) => Number(r.current_stock),
            render: (r) => {
              const low = Number(r.min_stock) > 0 && Number(r.current_stock) <= Number(r.min_stock);
              return (
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{number(Number(r.current_stock))}</span>
                  {low && (
                    <Badge className="bg-[color:var(--warning)]/15 text-[color:var(--warning)] hover:bg-[color:var(--warning)]/20">
                      Baixo
                    </Badge>
                  )}
                </div>
              );
            },
          },
          { key: "avg_cost", header: "Custo médio", render: (r) => currency(Number(r.avg_cost)) },
          {
            key: "reference_price",
            header: "Preço ref.",
            render: (r) => currency(Number(r.reference_price)),
          },
          {
            key: "supplier",
            header: "Fornecedor",
            searchValue: (r) => r.supplier?.name,
            render: (r) => r.supplier?.name ?? "—",
          },
          {
            key: "active",
            header: "Status",
            searchValue: (r) => (r.active ? "Ativo" : "Inativo"),
            render: (r) => (
              <Badge variant={r.active ? "default" : "secondary"}>
                {r.active ? "Ativo" : "Inativo"}
              </Badge>
            ),
          },
        ]}
        onEdit={(r) => {
          setEditing(r);
          setOpen(true);
        }}
        onDelete={(r) => del.mutate(r.id)}
      />

      <RecordModal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar produto" : "Novo produto"}
        fields={fields}
        initial={
          (editing ?? { active: true, unit: "UN", min_stock: 0, reference_price: 0 }) as Record<
            string,
            unknown
          >
        }
        submitting={upsert.isPending}
        onSubmit={async (v) => {
          await upsert.mutateAsync(v);
          setOpen(false);
        }}
      />
      <RecordModal
        open={catOpen}
        onOpenChange={setCatOpen}
        title="Nova categoria"
        fields={[{ name: "name", label: "Nome", type: "text", required: true }]}
        submitting={upsertCat.isPending}
        onSubmit={async (v) => {
          await upsertCat.mutateAsync(v);
          setCatOpen(false);
        }}
      />
    </div>
  );
}
