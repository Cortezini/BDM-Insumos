import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeAdminAction } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-context";
import type { Profile } from "@/lib/database.types";
import { getDefaultRoute } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/seguranca/mfa")({
  component: MfaPage,
});

type MfaMode = "loading" | "enroll" | "challenge" | "ready";

type MfaActionResponse = {
  profile: Profile;
};

const TOTP_FRIENDLY_NAME = "Google Authenticator";

function isDuplicateFriendlyNameError(error: Error | null) {
  return /friendly name/i.test(error?.message ?? "");
}

function toQrImageSource(qrCode: string) {
  const value = qrCode.trim();
  if (!value) return "";
  if (value.startsWith("data:image/") || value.startsWith("http")) return value;
  if (value.startsWith("<svg")) return `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;
  return value;
}

function sanitizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function MfaPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile, signOut } = useAuth();
  const [mode, setMode] = useState<MfaMode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const goToDefaultRoute = useCallback(
    (nextProfile: Profile | null) => {
      navigate({ to: getDefaultRoute(nextProfile) ?? "/", replace: true });
    },
    [navigate],
  );

  const completeMfa = useCallback(async () => {
    const action = profile?.must_enroll_mfa ? "complete_mfa_enrollment" : "record_mfa_verification";
    await invokeAdminAction<MfaActionResponse>(action);
    const nextProfile = await refreshProfile();
    toast.success(profile?.must_enroll_mfa ? "2FA cadastrado com sucesso" : "2FA confirmado");
    goToDefaultRoute(nextProfile);
  }, [goToDefaultRoute, profile?.must_enroll_mfa, refreshProfile]);

  const startEnrollment = useCallback(async () => {
    const { data: existingFactors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;

    const totpFactors = existingFactors?.totp ?? [];
    const verifiedFactor = totpFactors.find((factor) => factor.status === "verified");
    if (verifiedFactor) {
      setFactorId(verifiedFactor.id);
      setMode("challenge");
      return;
    }

    for (const factor of totpFactors) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }

    let enrollment = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: TOTP_FRIENDLY_NAME,
    });

    if (isDuplicateFriendlyNameError(enrollment.error)) {
      enrollment = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `${TOTP_FRIENDLY_NAME} ${Date.now()}`,
      });
    }

    if (enrollment.error) throw enrollment.error;

    setFactorId(enrollment.data.id);
    setQrCode(enrollment.data.totp.qr_code);
    setSecret(enrollment.data.totp.secret);
    setMode("enroll");
  }, []);

  const regenerateQrCode = async () => {
    setSaving(true);
    setCode("");
    setQrCode("");
    setSecret("");
    try {
      await startEnrollment();
      toast.success("Novo QR Code gerado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel gerar um novo QR Code.",
      );
    } finally {
      setSaving(false);
    }
  };

  const loadMfaState = useCallback(async () => {
    try {
      setMode("loading");
      const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] =
        await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);

      if (factorsError) throw factorsError;
      if (aalError) throw aalError;

      const verifiedTotp = (factors?.totp ?? []).find((factor) => factor.status === "verified");
      const currentLevel = aal?.currentLevel ?? "aal1";
      const nextLevel = aal?.nextLevel ?? "aal1";

      if (profile?.must_enroll_mfa && !verifiedTotp) {
        await startEnrollment();
        return;
      }

      if (verifiedTotp && nextLevel === "aal2" && currentLevel !== "aal2") {
        setFactorId(verifiedTotp.id);
        setMode("challenge");
        return;
      }

      if (profile?.must_enroll_mfa && currentLevel === "aal2") {
        await completeMfa();
        return;
      }

      setMode("ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar o 2FA.");
      setMode("ready");
    }
  }, [completeMfa, profile?.must_enroll_mfa, startEnrollment]);

  useEffect(() => {
    void loadMfaState();
  }, [loadMfaState]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6 || !factorId) {
      toast.error("Informe o codigo de 6 digitos do autenticador.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error) throw error;

      await supabase.auth.refreshSession();
      await completeMfa();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Codigo 2FA invalido.");
    } finally {
      setSaving(false);
    }
  };

  if (mode === "ready") {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              2FA confirmado
            </CardTitle>
            <CardDescription>Sua sessao esta pronta para acessar o sistema.</CardDescription>
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
          <CardTitle className="text-xl">
            {mode === "challenge" ? "Confirmar 2FA" : "Cadastrar Google Authenticator"}
          </CardTitle>
          <CardDescription>
            {mode === "challenge"
              ? "Informe o codigo gerado pelo seu aplicativo autenticador."
              : "Escaneie o QR Code no Google Authenticator e informe o codigo gerado."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando 2FA...
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              {mode === "enroll" && (
                <div className="grid gap-3">
                  {qrCode ? (
                    <div className="grid place-items-center rounded-md border border-border bg-white p-4">
                      <img
                        src={toQrImageSource(qrCode)}
                        alt="QR Code para Google Authenticator"
                        className="size-52"
                      />
                    </div>
                  ) : (
                    <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                      O QR Code nao foi retornado. Use a chave manual abaixo ou gere um novo QR
                      Code.
                    </div>
                  )}
                  {secret && (
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs font-medium text-muted-foreground">Chave manual</div>
                      <div className="mt-1 break-all font-mono text-sm">{secret}</div>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void regenerateQrCode()}
                  >
                    Gerar novo QR Code
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="mfaCode">Codigo de 6 digitos</Label>
                <Input
                  id="mfaCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(sanitizeCode(event.target.value))}
                  placeholder="000000"
                  required
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => void signOut()}>
                  <LogOut className="mr-2 size-4" />
                  Sair
                </Button>
                <Button type="submit" disabled={saving || code.length !== 6}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Confirmar
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
