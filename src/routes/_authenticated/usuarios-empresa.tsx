import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { invokeAdminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/supabase";
import {
  COMPANY_ROLES,
  DEFAULT_COMPANY_ROLE_PERMISSIONS,
  PERMISSIONS,
  getRoleLabel,
  normalizeCompanyRole,
} from "@/lib/permissions";
import type { CompanyRole, PermissionKey, Profile, UserRole } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/usuarios-empresa")({
  component: CompanyUsersPage,
});

type CompanyUserRow = {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  permissions: PermissionKey[] | null;
  active: boolean;
  created_at: string;
  profile: Profile | null;
};

type UserForm = {
  fullName: string;
  email: string;
  password: string;
  role: CompanyRole;
};

function emptyForm(): UserForm {
  return {
    fullName: "",
    email: "",
    password: "",
    role: "solicitante",
  };
}

function CompanyUsersPage() {
  const qc = useQueryClient();
  const { activeCompany, profile, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const canManage = hasPermission("company.users.manage");
  const canAssignCompanyAdmin = profile?.role === "super_admin";

  const permissionGroups = useMemo(
    () =>
      Array.from(new Set(PERMISSIONS.map((permission) => permission.group))).map((group) => ({
        group,
        permissions: PERMISSIONS.filter((permission) => permission.group === group),
      })),
    [],
  );

  const roleOptions = useMemo(
    () =>
      COMPANY_ROLES.filter((role) => canAssignCompanyAdmin || role.value !== "admin_empresa").map(
        (role) => ({ value: role.value, label: role.label }),
      ),
    [canAssignCompanyAdmin],
  );

  const users = useQuery<CompanyUserRow[]>({
    queryKey: ["company-users", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await db
        .from("company_members")
        .select(
          "id, company_id, user_id, role, permissions, active, created_at, profile:profiles(*)",
        )
        .eq("company_id", activeCompany!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as Array<Omit<CompanyUserRow, "role"> & { role: UserRole }>).map(
        (row) => ({ ...row, role: normalizeCompanyRole(row.role) as CompanyRole }),
      );
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["company-users", activeCompany?.id] });
    qc.invalidateQueries({ queryKey: ["company_members"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
  };

  const createUser = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error("Selecione uma empresa.");
      return invokeAdminAction("create_company_user", {
        companyId: activeCompany.id,
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
        permissions: DEFAULT_COMPANY_ROLE_PERMISSIONS[form.role],
      });
    },
    onSuccess: () => {
      toast.success("Usuario criado");
      setOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMembership = useMutation({
    mutationFn: async ({
      row,
      role,
      permissions,
      active,
    }: {
      row: CompanyUserRow;
      role?: CompanyRole;
      permissions?: PermissionKey[];
      active?: boolean;
    }) =>
      invokeAdminAction("update_membership", {
        companyId: row.company_id,
        userId: row.user_id,
        role,
        permissions,
        active,
      }),
    onSuccess: () => {
      toast.success("Usuario atualizado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleExpandedUser = (id: string) => {
    setExpandedUsers((current) =>
      current.includes(id) ? current.filter((userId) => userId !== id) : [...current, id],
    );
  };

  const togglePermission = (row: CompanyUserRow, permission: PermissionKey, enabled: boolean) => {
    const current = row.permissions ?? [];
    const next = enabled
      ? Array.from(new Set([...current, permission]))
      : current.filter((item) => item !== permission);

    updateMembership.mutate({ row, permissions: next });
  };

  return (
    <div>
      <PageHeader
        title="Usuarios da Empresa"
        description={activeCompany?.name}
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm());
              setOpen(true);
            }}
            disabled={!canManage || !activeCompany}
          >
            <Plus className="mr-2 size-4" />
            Novo usuario
          </Button>
        }
      />

      <div className="space-y-2">
        {users.isLoading && (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            Carregando usuarios...
          </div>
        )}

        {users.data?.map((userRow) => {
          const isExpanded = expandedUsers.includes(userRow.user_id);
          const isCompanyAdmin = userRow.role === "admin_empresa";
          const permissionCount = isCompanyAdmin
            ? "Acesso total"
            : `${userRow.permissions?.length ?? 0} permissoes`;

          return (
            <Collapsible
              key={userRow.id}
              open={isExpanded}
              onOpenChange={() => toggleExpandedUser(userRow.user_id)}
              className="rounded-md border border-border bg-card"
            >
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {userRow.profile?.full_name ?? userRow.profile?.email}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {userRow.profile?.email}
                      </div>
                    </div>
                  </button>
                </CollapsibleTrigger>

                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <Badge variant={userRow.active ? "default" : "secondary"}>
                    {userRow.active ? "Ativo" : "Inativo"}
                  </Badge>
                  {userRow.profile?.blocked && <Badge variant="destructive">Bloqueado</Badge>}
                  <Badge variant="outline">{permissionCount}</Badge>
                  <SearchableSelect
                    value={userRow.role}
                    onValueChange={(value) => {
                      const role = value as CompanyRole;
                      updateMembership.mutate({
                        row: userRow,
                        role,
                        permissions: DEFAULT_COMPANY_ROLE_PERMISSIONS[role],
                      });
                    }}
                    options={roleOptions}
                    disabled={!canManage || updateMembership.isPending}
                    className="h-9 w-44"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManage || updateMembership.isPending}
                    onClick={() =>
                      updateMembership.mutate({ row: userRow, active: !userRow.active })
                    }
                  >
                    {userRow.active ? "Inativar" : "Ativar"}
                  </Button>
                </div>
              </div>

              <CollapsibleContent>
                <div className="border-t border-border p-3">
                  {isCompanyAdmin ? (
                    <Badge variant="outline">Acesso total</Badge>
                  ) : (
                    <div className="space-y-4">
                      {permissionGroups.map(({ group, permissions }) => (
                        <div key={group}>
                          <div className="mb-2 text-xs font-medium text-muted-foreground">
                            {group}
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {permissions.map((permission) => {
                              const checked = (userRow.permissions ?? []).includes(permission.key);

                              return (
                                <label
                                  key={permission.key}
                                  className="flex items-center gap-2 rounded-md border border-border px-2 py-2 text-xs"
                                >
                                  <Checkbox
                                    checked={checked}
                                    disabled={!canManage || updateMembership.isPending}
                                    onCheckedChange={(value) =>
                                      togglePermission(userRow, permission.key, value === true)
                                    }
                                  />
                                  <span className="leading-tight">{permission.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {users.data?.length === 0 && (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            Nenhum usuario encontrado.
          </div>
        )}
      </div>

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
            <div className="space-y-2">
              <Label>Senha temporaria</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
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
