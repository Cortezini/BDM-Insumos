import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageHeader } from "@/components/shared/PageHeader";
import { db } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { toast } from "sonner";
import type { PermissionKey, Profile, UserRole } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: Page });

type CompanyUserProfile = Profile & {
  membership_id: string;
  company_id: string;
};

function Page() {
  const qc = useQueryClient();
  const { profile, hasRole, activeCompany } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const permissionGroups = useMemo(
    () =>
      Array.from(new Set(PERMISSIONS.map((permission) => permission.group))).map((group) => ({
        group,
        permissions: PERMISSIONS.filter((permission) => permission.group === group),
      })),
    [],
  );

  const users = useQuery<CompanyUserProfile[]>({
    queryKey: ["company_members", "profiles", activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("company_members")
        .select(
          "id, company_id, user_id, role, permissions, profile:profiles(id, email, full_name, created_at)",
        )
        .eq("company_id", activeCompany!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (
        (data ?? []) as {
          id: string;
          company_id: string;
          user_id: string;
          role: UserRole;
          permissions: PermissionKey[] | null;
          profile: Pick<Profile, "id" | "email" | "full_name" | "created_at"> | null;
        }[]
      ).map((row) => ({
        id: row.user_id,
        membership_id: row.id,
        company_id: row.company_id,
        email: row.profile?.email ?? "",
        full_name: row.profile?.full_name ?? null,
        role: row.role,
        permissions: row.permissions,
        created_at: row.profile?.created_at ?? "",
      }));
    },
    enabled: hasRole("admin") && !!activeCompany,
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      if (!activeCompany) throw new Error("Selecione uma empresa antes de alterar permissões.");

      const payload =
        role === "admin" ? { role } : { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] };
      const { error } = await db
        .from("company_members")
        .update(payload)
        .eq("company_id", activeCompany.id)
        .eq("user_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissão atualizada");
      qc.invalidateQueries({ queryKey: ["company_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: PermissionKey[] }) => {
      if (!activeCompany) throw new Error("Selecione uma empresa antes de alterar permissões.");

      const { error } = await db
        .from("company_members")
        .update({ permissions })
        .eq("company_id", activeCompany.id)
        .eq("user_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["company_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePermission = (userProfile: Profile, permission: PermissionKey, enabled: boolean) => {
    const current = userProfile.permissions ?? [];
    const next = enabled
      ? Array.from(new Set([...current, permission]))
      : current.filter((item) => item !== permission);

    updatePermissions.mutate({ id: userProfile.id, permissions: next });
  };

  const toggleExpandedUser = (id: string) => {
    setExpandedUsers((current) =>
      current.includes(id) ? current.filter((userId) => userId !== id) : [...current, id],
    );
  };

  return (
    <div>
      <PageHeader title="Configurações" description="Perfil e gestão de usuários." />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Meu perfil</h3>
          <div className="space-y-4 max-w-md">
            <div>
              <Label>E-mail</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
            <div>
              <Label>Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label>Permissão</Label>
              <div className="mt-1.5">
                <Badge>{profile?.role}</Badge>
              </div>
            </div>
            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              Salvar
            </Button>
          </div>
        </section>

        {hasRole("admin") && (
          <section className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-semibold mb-1">Usuários</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Atribua permissões aos usuários cadastrados.
            </p>
            <div className="space-y-2">
              {users.data?.map((u) => {
                const isExpanded = expandedUsers.includes(u.id);
                const permissionCount =
                  u.role === "admin" ? "Acesso total" : `${u.permissions?.length ?? 0} permissões`;

                return (
                  <Collapsible
                    key={u.id}
                    open={isExpanded}
                    onOpenChange={() => toggleExpandedUser(u.id)}
                    className="rounded-md border border-border"
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
                              {u.full_name ?? u.email}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-2 sm:ml-auto">
                        <Badge variant="outline" className="whitespace-nowrap">
                          {permissionCount}
                        </Badge>
                        <Select
                          value={u.role}
                          onValueChange={(v) =>
                            updateRole.mutate({ id: u.id, role: v as UserRole })
                          }
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="operator">Operador</SelectItem>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="border-t border-border p-3">
                        {u.role === "admin" ? (
                          <p className="text-xs text-muted-foreground">
                            Administradores têm acesso total e aprovam cotações.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {permissionGroups.map(({ group, permissions }) => (
                              <div key={group}>
                                <div className="mb-2 text-xs font-medium text-muted-foreground">
                                  {group}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {permissions.map((permission) => {
                                    const checked = (u.permissions ?? []).includes(permission.key);

                                    return (
                                      <label
                                        key={permission.key}
                                        className="flex items-center gap-2 text-xs rounded-md border border-border px-2 py-2"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          disabled={updatePermissions.isPending}
                                          onCheckedChange={(value) =>
                                            togglePermission(u, permission.key, value === true)
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
                <p className="text-sm text-muted-foreground">Nenhum usuário ainda.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
