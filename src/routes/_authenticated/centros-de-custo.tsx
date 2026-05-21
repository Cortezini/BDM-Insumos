import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { RecordModal, type Field } from "@/components/shared/RecordModal";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import type { CostCenter } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/centros-de-custo")({ component: Page });

const fields: Field[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "code", label: "Código", type: "text" },
  { name: "responsible", label: "Responsável", type: "text" },
  { name: "active", label: "Status", type: "switch" },
  { name: "description", label: "Descrição", type: "textarea" },
];

function Page() {
  const list = useList<CostCenter>("cost_centers");
  const upsert = useUpsert("cost_centers");
  const del = useDelete("cost_centers");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);

  return (
    <div>
      <PageHeader
        title="Centros de Custo"
        description="Departamentos e centros que recebem materiais."
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4 mr-2" /> Novo centro
          </Button>
        }
      />
      <DataTable
        data={list.data ?? []}
        searchKeys={["name", "code", "responsible"]}
        columns={[
          { key: "code", header: "Código" },
          { key: "name", header: "Nome" },
          { key: "responsible", header: "Responsável" },
          {
            key: "active",
            header: "Status",
            render: (r) => <Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Ativo" : "Inativo"}</Badge>,
          },
        ]}
        onEdit={(r) => { setEditing(r); setOpen(true); }}
        onDelete={(r) => del.mutate(r.id)}
      />
      <RecordModal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar centro de custo" : "Novo centro de custo"}
        fields={fields}
        initial={(editing ?? { active: true }) as Record<string, unknown>}
        submitting={upsert.isPending}
        onSubmit={async (v) => { await upsert.mutateAsync(v); setOpen(false); }}
      />
    </div>
  );
}