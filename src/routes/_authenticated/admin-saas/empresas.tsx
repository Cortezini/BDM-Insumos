import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { invokeAdminAction } from "@/lib/admin-api";
import { db } from "@/lib/supabase";
import { MODULES } from "@/lib/permissions";
import type { Company } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/admin-saas/empresas")({
  component: CompaniesPage,
});

type CompanyForm = {
  id?: string;
  name: string;
  document: string;
  plan: string;
  userLimit: number;
  modules: string[];
  active: boolean;
  firstAdminName: string;
  firstAdminEmail: string;
  firstAdminPassword: string;
};

const planOptions = [
  { value: "basico", label: "Basico" },
  { value: "profissional", label: "Profissional" },
  { value: "enterprise", label: "Enterprise" },
];

function emptyForm(): CompanyForm {
  return {
    name: "",
    document: "",
    plan: "basico",
    userLimit: 10,
    modules: MODULES.map((module) => module.value),
    active: true,
    firstAdminName: "",
    firstAdminEmail: "",
    firstAdminPassword: "",
  };
}

function formFromCompany(company: Company): CompanyForm {
  return {
    id: company.id,
    name: company.name,
    document: company.document ?? "",
    plan: company.plan ?? "basico",
    userLimit: company.user_limit ?? 10,
    modules: company.modules?.length ? company.modules : MODULES.map((module) => module.value),
    active: company.active,
    firstAdminName: "",
    firstAdminEmail: "",
    firstAdminPassword: "",
  };
}

function CompaniesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanyForm>(emptyForm);

  const companies = useQuery<Company[]>({
    queryKey: ["saas", "companies"],
    queryFn: async () => {
      const { data, error } = await db
        .from("companies")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });

  const saveCompany = useMutation({
    mutationFn: async () => {
      const payload = {
        companyId: form.id,
        name: form.name,
        document: form.document,
        plan: form.plan,
        userLimit: Number(form.userLimit),
        modules: form.modules,
        active: form.active,
        firstAdmin: form.id
          ? undefined
          : {
              fullName: form.firstAdminName,
              email: form.firstAdminEmail,
              password: form.firstAdminPassword,
            },
      };

      return invokeAdminAction(form.id ? "update_company" : "create_company", payload);
    },
    onSuccess: () => {
      toast.success("Empresa salva");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["saas", "companies"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const columns = useMemo<Column<Company>[]>(
    () => [
      {
        key: "name",
        header: "Empresa",
        render: (company) => (
          <div>
            <div className="font-medium">{company.name}</div>
            {company.document && (
              <div className="text-xs text-muted-foreground">{company.document}</div>
            )}
          </div>
        ),
      },
      {
        key: "plan",
        header: "Plano",
        render: (company) => <Badge variant="outline">{company.plan}</Badge>,
      },
      {
        key: "user_limit",
        header: "Usuarios",
        render: (company) => `${company.user_limit} limite`,
        sortValue: (company) => company.user_limit,
      },
      {
        key: "modules",
        header: "Modulos",
        render: (company) => `${company.modules?.length ?? 0} ativos`,
        searchValue: (company) => company.modules?.join(" "),
      },
      {
        key: "active",
        header: "Status",
        render: (company) => (
          <Badge variant={company.active ? "default" : "secondary"}>
            {company.active ? "Ativa" : "Inativa"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const update = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleModule = (module: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      modules: checked
        ? Array.from(new Set([...current.modules, module]))
        : current.modules.filter((item) => item !== module),
    }));
  };

  const isEditing = !!form.id;

  return (
    <div>
      <PageHeader
        title="Admin SaaS / Empresas"
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm());
              setOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Nova empresa
          </Button>
        }
      />

      <DataTable
        data={companies.data ?? []}
        columns={columns}
        searchKeys={["name", "document", "plan"]}
        onEdit={(company) => {
          setForm(formFromCompany(company));
          setOpen(true);
        }}
        emptyText={companies.isLoading ? "Carregando empresas..." : "Nenhuma empresa encontrada."}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveCompany.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ / Documento</Label>
                <Input
                  value={form.document}
                  onChange={(event) => update("document", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <SearchableSelect
                  value={form.plan}
                  onValueChange={(value) => update("plan", value)}
                  options={planOptions}
                />
              </div>
              <div className="space-y-2">
                <Label>Limite de usuarios</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.userLimit}
                  onChange={(event) => update("userLimit", Number(event.target.value))}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked) => update("active", checked)}
                />
                <div>
                  <div className="text-sm font-medium">{form.active ? "Ativa" : "Inativa"}</div>
                </div>
              </div>
            </div>

            <div>
              <Label>Modulos</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((module) => (
                  <label
                    key={module.value}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={form.modules.includes(module.value)}
                      onCheckedChange={(checked) => toggleModule(module.value, checked === true)}
                    />
                    <span>{module.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {!isEditing && (
              <div className="rounded-md border border-border p-4">
                <h3 className="text-sm font-semibold">Primeiro Admin da Empresa</h3>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={form.firstAdminName}
                      onChange={(event) => update("firstAdminName", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={form.firstAdminEmail}
                      onChange={(event) => update("firstAdminEmail", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha temporaria</Label>
                    <Input
                      type="password"
                      value={form.firstAdminPassword}
                      onChange={(event) => update("firstAdminPassword", event.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveCompany.isPending}>
                {saveCompany.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
