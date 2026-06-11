import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import {
  RecordModal,
  type Field,
  type RecordModalSetValues,
  type RecordModalValues,
} from "@/components/shared/RecordModal";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import { exportToCSV, dateBR } from "@/lib/format";
import type { Supplier } from "@/lib/database.types";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fornecedores")({ component: Page });

type CnpjLookupResponse = {
  name?: string;
  document?: string;
  contact?: string;
  email?: string;
  address?: string;
  status?: string;
  source?: string;
  error?: string;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function Page() {
  const { session } = useAuth();
  const list = useList<Supplier>("suppliers");
  const upsert = useUpsert("suppliers");
  const del = useDelete("suppliers");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);

  const rows = list.data ?? [];
  const modalInitial = useMemo(() => (editing ?? { active: true }) as RecordModalValues, [editing]);

  const lookupCnpj = useCallback(
    async (values: RecordModalValues, setValues: RecordModalSetValues) => {
      const cnpj = onlyDigits(String(values.document ?? ""));

      if (cnpj.length !== 14) {
        toast.error("Digite um CNPJ com 14 dígitos para buscar na BrasilAPI.");
        return;
      }

      if (!session?.access_token) {
        toast.error("Faça login novamente para consultar o CNPJ.");
        return;
      }

      setCnpjLookupLoading(true);
      try {
        const response = await fetch(`/api/cnpj?cnpj=${cnpj}`, {
          headers: {
            authorization: `Bearer ${session.access_token}`,
          },
        });
        const data = (await response.json()) as CnpjLookupResponse;

        if (!response.ok) {
          throw new Error(data.error || "Não foi possível consultar o CNPJ.");
        }

        setValues((current) => ({
          ...current,
          name: data.name || current.name || "",
          document: data.document || current.document || "",
          contact: data.contact || current.contact || "",
          email: data.email || current.email || "",
          address: data.address || current.address || "",
        }));

        toast.success(`Dados carregados pela ${data.source || "BrasilAPI"}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao consultar o CNPJ.");
      } finally {
        setCnpjLookupLoading(false);
      }
    },
    [session?.access_token],
  );

  const fields = useMemo<Field[]>(
    () => [
      { name: "name", label: "Nome / Razão social", type: "text", required: true },
      {
        name: "document",
        label: "CNPJ / CPF",
        type: "text",
        action: {
          label: "Buscar",
          loadingLabel: "Buscando...",
          loading: cnpjLookupLoading,
          onClick: lookupCnpj,
        },
      },
      { name: "contact", label: "Contato", type: "text" },
      { name: "email", label: "E-mail", type: "email" },
      { name: "address", label: "Endereço", type: "text" },
      { name: "active", label: "Status", type: "switch" },
      { name: "notes", label: "Observações", type: "textarea" },
    ],
    [cnpjLookupLoading, lookupCnpj],
  );

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Cadastro e gestão de fornecedores."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV("fornecedores.csv", rows as unknown as Record<string, unknown>[])
              }
            >
              <Download className="size-4 mr-2" />
              Exportar
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
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
            searchValue: (r) => (r.active ? "Ativo" : "Inativo"),
            render: (r) => (
              <Badge variant={r.active ? "default" : "secondary"}>
                {r.active ? "Ativo" : "Inativo"}
              </Badge>
            ),
          },
          { key: "created_at", header: "Criado em", render: (r) => dateBR(r.created_at) },
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
        title={editing ? "Editar fornecedor" : "Novo fornecedor"}
        fields={fields}
        initial={modalInitial}
        submitting={upsert.isPending}
        onSubmit={async (v) => {
          await upsert.mutateAsync(v);
          setOpen(false);
        }}
      />
    </div>
  );
}
