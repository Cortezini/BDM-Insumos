export const MIN_PASSWORD_LENGTH = 10;

export type PasswordPolicyContext = {
  email?: string | null;
  fullName?: string | null;
};

export type PasswordPolicyResult = {
  valid: boolean;
  checks: Array<{
    label: string;
    passed: boolean;
  }>;
};

export function validatePasswordPolicy(
  password: string,
  context: PasswordPolicyContext = {},
): PasswordPolicyResult {
  const normalizedPassword = password.toLowerCase();
  const emailLocalPart = context.email?.split("@")[0]?.toLowerCase() ?? "";
  const nameParts =
    context.fullName
      ?.toLowerCase()
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4) ?? [];

  const avoidsPersonalData =
    (!emailLocalPart ||
      emailLocalPart.length < 4 ||
      !normalizedPassword.includes(emailLocalPart)) &&
    !nameParts.some((part) => normalizedPassword.includes(part));

  const checks = [
    {
      label: `Minimo de ${MIN_PASSWORD_LENGTH} caracteres`,
      passed: password.length >= MIN_PASSWORD_LENGTH,
    },
    { label: "Uma letra maiuscula", passed: /[A-Z]/.test(password) },
    { label: "Uma letra minuscula", passed: /[a-z]/.test(password) },
    { label: "Um numero", passed: /\d/.test(password) },
    { label: "Um simbolo", passed: /[^A-Za-z0-9]/.test(password) },
    { label: "Nao conter nome ou e-mail", passed: avoidsPersonalData },
  ];

  return {
    valid: checks.every((check) => check.passed),
    checks,
  };
}
