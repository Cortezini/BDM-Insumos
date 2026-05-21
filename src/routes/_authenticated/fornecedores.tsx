import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { RecordModal, type Field } from "@/components/shared/RecordModal";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import { exportToCSV, dateBR } from "@/lib/format";
import type { Supplier } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/fornecedores")({ component: Page });

const fields: Field[] = [
  { name: "name", label: "Nome / Razão social", type: "text", required: true },
  { name: "document", label: "CNPJ / CPF", type: "text" },
  { name: "contact", label: "Contato", type: "text" },
  { name: "email", label: "E-mail", type: "email" },
  { name: "address", label: "Endereço", type: "text" },
  { name: "active", label: "Status", type: "switch" },
  { name: "notes", label: "Observações", type: "textarea" },
];

function Page() {
  const list = useList<Supplier>("suppliers");
  const upsert = useUpsert("suppliers");
  const del = useDelete("suppliers");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const rows = list.data ?? [];

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Cadastro e gestão de fornecedores."
        actions={
          <>
            <Button variant="outline" onClick={() => exportToCSV("fornecedores.csv", rows as unknown as Record<string, unknown>[])}>
              <Download className="size-4 mr-2" />
              Exportar
            </Button>
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4 mr-2" /> Novo fornecedor
            </Button>
          </>
        }
      />
      <DataTable
        data={rows}
        searchKeys={["name", "document", "email"]}
        columns={[
          { key: "name", header: "Nome" },
          { key: "document", header: "Documento" },
          { key: "contact", header: "Contato" },
          { key: "email", header: "E-mail" },
          {
            key: "active",
            header: "Status",
            render: (r) => (
              <Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Ativo" : "Inativo"}</Badge>
            ),
          },
          { key: "created_at", header: "Criado em", render: (r) => dateBR(r.created_at) },
        ]}
        onEdit={(r) => { setEditing(r); setOpen(true); }}
        onDelete={(r) => del.mutate(r.id)}
      />
      <RecordModal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar fornecedor" : "Novo fornecedor"}
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