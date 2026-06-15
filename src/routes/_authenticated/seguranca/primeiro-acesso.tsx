import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeAdminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-context";
import type { Profile } from "@/lib/database.types";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { getDefaultRoute } from "@/lib/permissions";
import { MFA_ROUTE } from "@/lib/security-routes";

export const Route = createFileRoute("/_authenticated/seguranca/primeiro-acesso")({
  component: FirstAccessPage,
});

type ChangePasswordResponse = {
  profile: Profile;
};

function FirstAccessPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const passwordPolicy = useMemo(
    () =>
      validatePasswordPolicy(newPassword, {
        email: profile?.email,
        fullName: profile?.full_name,
      }),
    [newPassword, profile?.email, profile?.full_name],
  );
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = passwordPolicy.valid && passwordsMatch && !saving;

  const goToDefaultRoute = (nextProfile: Profile | null) => {
    navigate({
      to: nextProfile?.must_enroll_mfa ? MFA_ROUTE : (getDefaultRoute(nextProfile) ?? "/"),
      replace: true,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordPolicy.valid) {
      toast.error("A nova senha ainda nao atende aos criterios de seguranca.");
      return;
    }
    if (!passwordsMatch) {
      toast.error("A confirmacao da senha nao confere.");
      return;
    }

    setSaving(true);
    try {
      await invokeAdminAction<ChangePasswordResponse>("change_first_login_password", {
        currentPassword,
        newPassword,
      });
      const nextProfile = await refreshProfile();
      toast.success("Senha atualizada com sucesso");
      goToDefaultRoute(nextProfile);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar a senha.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile?.must_change_password) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              Primeiro acesso concluido
            </CardTitle>
            <CardDescription>Sua conta ja esta liberada para uso.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => goToDefaultRoute(profile ?? null)}>
              Continuar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <CardTitle className="text-xl">Trocar senha no primeiro acesso</CardTitle>
          <CardDescription>
            Defina uma senha forte para liberar o acesso as telas do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha atual ou temporaria</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Opcional para convite por e-mail"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-2 rounded-md border border-border p-3 text-sm">
              {passwordPolicy.checks.map((check) => (
                <div key={check.label} className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span className={check.passed ? "text-foreground" : "text-muted-foreground"}>
                    {check.label}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                {passwordsMatch ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={passwordsMatch ? "text-foreground" : "text-muted-foreground"}>
                  Confirmacao igual a nova senha
                </span>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={() => void signOut()}>
                <LogOut className="mr-2 size-4" />
                Sair
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Atualizar senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
