import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { invokeAdminAction } from "@/lib/admin-api";
import { db } from "@/lib/supabase";
import {
  COMPANY_ROLES,
  DEFAULT_COMPANY_ROLE_PERMISSIONS,
  GLOBAL_ROLES,
  getRoleLabel,
  normalizeCompanyRole,
} from "@/lib/permissions";
import type {
  Company,
  CompanyRole,
  GlobalRole,
  PermissionKey,
  Profile,
  UserRole,
} from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/admin-saas/usuarios")({
  component: SaasUsersPage,
});

type CompanyUserRow = {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  permissions: PermissionKey[] | null;
  active: boolean;
  created_at: string;
  company: Company | null;
  profile: Profile | null;
};

type UserForm = {
  companyId: string;
  fullName: string;
  email: string;
  role: CompanyRole;
};

function emptyForm(companyId = ""): UserForm {
  return {
    companyId,
    fullName: "",
    email: "",
    role: "solicitante",
  };
}

function SaasUsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm());

  const companies = useQuery<Company[]>({
    queryKey: ["saas", "companies", "user-options"],
    queryFn: async () => {
      const { data, error } = await db
        .from("companies")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });

  const users = useQuery<CompanyUserRow[]>({
    queryKey: ["saas", "company-users"],
    queryFn: async () => {
      const { data, error } = await db
        .from("company_members")
        .select(
          "id, company_id, user_id, role, permissions, active, created_at, company:companies(*), profile:profiles(*)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<Omit<CompanyUserRow, "role"> & { role: UserRole }>).map(
        (row) => ({ ...row, role: normalizeCompanyRole(row.role) as CompanyRole }),
      );
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["saas", "company-users"] });
    qc.invalidateQueries({ queryKey: ["company_members"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
  };

  const createUser = useMutation({
    mutationFn: async () =>
      invokeAdminAction("create_company_user", {
        companyId: form.companyId,
        fullName: form.fullName,
        email: form.email,
        redirectTo: `${window.location.origin}/seguranca/primeiro-acesso`,
        role: form.role,
        permissions: DEFAULT_COMPANY_ROLE_PERMISSIONS[form.role],
      }),
    onSuccess: () => {
      toast.success("Convite enviado ao usuario");
      setOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMembership = useMutation({
    mutationFn: async ({
      row,
      role,
      active,
    }: {
      row: CompanyUserRow;
      role?: CompanyRole;
      active?: boolean;
    }) =>
      invokeAdminAction("update_membership", {
        companyId: row.company_id,
        userId: row.user_id,
        role,
        active,
        permissions: role ? DEFAULT_COMPANY_ROLE_PERMISSIONS[role] : undefined,
      }),
    onSuccess: () => {
      toast.success("Usuario atualizado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setBlocked = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      invokeAdminAction("set_user_blocked", { userId, blocked }),
    onSuccess: () => {
      toast.success("Bloqueio atualizado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateGlobalRole = useMutation({
    mutationFn: async ({ userId, globalRole }: { userId: string; globalRole: GlobalRole | null }) =>
      invokeAdminAction("update_global_role", { userId, globalRole }),
    onSuccess: () => {
      toast.success("Perfil global atualizado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const companyOptions = useMemo(
    () => (companies.data ?? []).map((company) => ({ value: company.id, label: company.name })),
    [companies.data],
  );

  const roleOptions = useMemo(
    () => COMPANY_ROLES.map((role) => ({ value: role.value, label: role.label })),
    [],
  );
  const globalRoleOptions = useMemo(
    () => [
      { value: "__none__", label: "Sem perfil global", pinned: true },
      ...GLOBAL_ROLES.map((role) => ({ value: role.value, label: role.label })),
    ],
    [],
  );

  const columns = useMemo<Column<CompanyUserRow>[]>(
    () => [
      {
        key: "user",
        header: "Usuario",
        render: (row) => (
          <div>
            <div className="font-medium">{row.profile?.full_name ?? row.profile?.email}</div>
            <div className="text-xs text-muted-foreground">{row.profile?.email}</div>
          </div>
        ),
        searchValue: (row) => `${row.profile?.full_name ?? ""} ${row.profile?.email ?? ""}`,
      },
      {
        key: "company",
        header: "Empresa",
        render: (row) => row.company?.name ?? "-",
        searchValue: (row) => row.company?.name,
      },
      {
        key: "role",
        header: "Perfil empresa",
        render: (row) => (
          <SearchableSelect
            value={row.role}
            onValueChange={(value) => updateMembership.mutate({ row, role: value as CompanyRole })}
            options={roleOptions}
            className="h-8 min-w-40"
            disabled={updateMembership.isPending}
          />
        ),
        searchValue: (row) => getRoleLabel(row.role),
      },
      {
        key: "global_role",
        header: "Perfil global",
        render: (row) => (
          <SearchableSelect
            value={row.profile?.global_role ?? "__none__"}
            onValueChange={(value) =>
              updateGlobalRole.mutate({
                userId: row.user_id,
                globalRole: value === "__none__" ? null : (value as GlobalRole),
              })
            }
            options={globalRoleOptions}
            className="h-8 min-w-40"
            disabled={updateGlobalRole.isPending}
          />
        ),
        searchValue: (row) => row.profile?.global_role,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant={row.active ? "default" : "secondary"}>
              {row.active ? "Ativo na empresa" : "Inativo na empresa"}
            </Badge>
            {row.profile?.must_change_password && <Badge variant="outline">Primeiro acesso</Badge>}
            {row.profile?.blocked && <Badge variant="destructive">Bloqueado</Badge>}
          </div>
        ),
        searchValue: (row) => `${row.active} ${row.profile?.blocked}`,
      },
      {
        key: "actions",
        header: "Acoes",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={updateMembership.isPending}
              onClick={() => updateMembership.mutate({ row, active: !row.active })}
            >
              {row.active ? "Inativar" : "Ativar"}
            </Button>
            <Button
              size="sm"
              variant={row.profile?.blocked ? "outline" : "destructive"}
              disabled={setBlocked.isPending}
              onClick={() =>
                setBlocked.mutate({ userId: row.user_id, blocked: !row.profile?.blocked })
              }
            >
              {row.profile?.blocked ? "Desbloquear" : "Bloquear"}
            </Button>
          </div>
        ),
      },
    ],
    [globalRoleOptions, roleOptions, setBlocked, updateGlobalRole, updateMembership],
  );

  const update = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div>
      <PageHeader
        title="Admin SaaS / Usuarios"
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm(companyOptions[0]?.value ?? ""));
              setOpen(true);
            }}
            disabled={!companyOptions.length}
          >
            <Plus className="mr-2 size-4" />
            Novo usuario
          </Button>
        }
      />

      <DataTable
        data={users.data ?? []}
        columns={columns}
        searchKeys={["role"]}
        emptyText={users.isLoading ? "Carregando usuarios..." : "Nenhum usuario encontrado."}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo usuario</DialogTitle>
          </DialogHeader>

          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              createUser.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Empresa</Label>
              <SearchableSelect
                value={form.companyId}
                onValueChange={(value) => update("companyId", value)}
                options={companyOptions}
              />
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <SearchableSelect
                value={form.role}
                onValueChange={(value) => update("role", value as CompanyRole)}
                options={roleOptions}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.fullName}
                onChange={(event) => update("fullName", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                required
              />
            </div>
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
