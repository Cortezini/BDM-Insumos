import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { RecordModal, type Field } from "@/components/shared/RecordModal";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import { exportToCSV } from "@/lib/format";
import type { Person } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/pessoas")({ component: Page });

const fields: Field[] = [
  { name: "full_name", label: "Nome completo", type: "text", required: true },
  { name: "document", label: "CPF / Matrícula", type: "text" },
  { name: "role", label: "Cargo", type: "text" },
  { name: "department", label: "Departamento", type: "text" },
  { name: "phone", label: "Telefone", type: "text" },
  { name: "email", label: "E-mail", type: "email" },
  { name: "active", label: "Status", type: "switch" },
  { name: "notes", label: "Observações", type: "textarea" },
];

function Page() {
  const list = useList<Person>("people");
  const upsert = useUpsert("people");
  const del = useDelete("people");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const rows = list.data ?? [];

  return (
    <div>
      <PageHeader
        title="Pessoas"
        description="Colaboradores e solicitantes."
        actions={
          <>
            <Button variant="outline" onClick={() => exportToCSV("pessoas.csv", rows as unknown as Record<string, unknown>[])}>
              <Download className="size-4 mr-2" /> Exportar
            </Button>
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4 mr-2" /> Nova pessoa
            </Button>
          </>
        }
      />
      <DataTable
        data={rows}
        searchKeys={["full_name", "document", "email", "department"]}
        columns={[
          { key: "full_name", header: "Nome" },
          { key: "document", header: "Documento" },
          { key: "department", header: "Departamento" },
          { key: "role", header: "Cargo" },
          { key: "email", header: "E-mail" },
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
        title={editing ? "Editar pessoa" : "Nova pessoa"}
        fields={fields}
        initial={(editing ?? { active: true }) as Record<string, unknown>}
        submitting={upsert.isPending}
        onSubmit={async (v) => { await upsert.mutateAsync(v); setOpen(false); }}
      />
    </div>
  );
}