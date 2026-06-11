import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { RecordModal, type Field } from "@/components/shared/RecordModal";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import type { Location as Loc } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/localizacoes")({ component: Page });

const fields: Field[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "code", label: "Código", type: "text" },
  { name: "active", label: "Status", type: "switch" },
  { name: "description", label: "Descrição", type: "textarea" },
];

function Page() {
  const list = useList<Loc>("locations");
  const upsert = useUpsert("locations");
  const del = useDelete("locations");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loc | null>(null);

  return (
    <div>
      <PageHeader
        title="Localizações"
        description="Armazéns, prateleiras e pontos de estoque."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4 mr-2" /> Nova localização
          </Button>
        }
      />
      <DataTable
        data={list.data ?? []}
        searchKeys={["name", "code"]}
        columns={[
          { key: "code", header: "Código" },
          { key: "name", header: "Nome" },
          { key: "description", header: "Descrição" },
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
        title={editing ? "Editar localização" : "Nova localização"}
        fields={fields}
        initial={(editing ?? { active: true }) as Record<string, unknown>}
        submitting={upsert.isPending}
        onSubmit={async (v) => {
          await upsert.mutateAsync(v);
          setOpen(false);
        }}
      />
    </div>
  );
}
