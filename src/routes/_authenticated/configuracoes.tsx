import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { db } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { toast } from "sonner";
import type { PermissionKey, Profile, UserRole } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { profile, hasRole } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");

  const users = useQuery<Profile[]>({
    queryKey: ["profiles", "list"],
    queryFn: async () => {
      const { data } = await db
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Profile[];
    },
    enabled: hasRole("admin"),
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
      const payload =
        role === "admin" ? { role } : { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] };
      const { error } = await db.from("profiles").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissão atualizada");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: PermissionKey[] }) => {
      const { error } = await db.from("profiles").update({ permissions }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["profiles"] });
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
              {users.data?.map((u) => (
                <div key={u.id} className="p-3 rounded-md border border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.full_name ?? u.email}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <Select
                      value={u.role}
                      onValueChange={(v) => updateRole.mutate({ id: u.id, role: v as UserRole })}
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

                  {u.role === "admin" ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Administradores têm acesso total e aprovam cotações.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PERMISSIONS.map((permission) => {
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
                  )}
                </div>
              ))}
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
