import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_ROLES = ["admin_empresa", "gestor", "almoxarife", "solicitante", "auditor"] as const;

const GLOBAL_ROLES = ["super_admin", "suporte", "financeiro", "comercial"] as const;
const FIRST_ACCESS_PATH = "/seguranca/primeiro-acesso";
const MIN_PASSWORD_LENGTH = 10;
const TEMP_PASSWORD_LENGTH = 24;

const MODULES = [
  "dashboard",
  "products",
  "movements",
  "suppliers",
  "quotations",
  "assets",
  "people",
  "cost_centers",
  "locations",
  "reports",
  "audit_logs",
] as const;

const DEFAULT_ROLE_PERMISSIONS: Record<(typeof COMPANY_ROLES)[number], string[]> = {
  admin_empresa: [],
  gestor: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "movements.view_in",
    "movements.view_out",
    "movements.create_in",
    "movements.create_out",
    "suppliers.view",
    "quotations.view",
    "quotations.create",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "company.users.view",
  ],
  almoxarife: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "movements.view_in",
    "movements.view_out",
    "movements.create_in",
    "movements.create_out",
    "suppliers.view",
    "assets.view",
    "locations.view",
  ],
  solicitante: ["dashboard.view", "products.view", "quotations.view", "quotations.create"],
  auditor: [
    "dashboard.view",
    "products.view",
    "movements.view",
    "suppliers.view",
    "quotations.view",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "audit_logs.view",
  ],
};

type JsonRecord = Record<string, unknown>;

type CallerProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  permissions: string[] | null;
  global_role: string | null;
  blocked: boolean;
  must_change_password: boolean;
  must_enroll_mfa: boolean;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getServiceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  if (secretKey) return secretKey;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    const first = Object.values(parsed)[0];
    if (first) return first;
  }

  throw new HttpError(500, "Chave administrativa do Supabase nao configurada.");
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new HttpError(500, "SUPABASE_URL nao configurada.");

  return createClient(url, getServiceKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getAnonClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new HttpError(500, "Cliente anonimo do Supabase nao configurado.");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function response(status: number, body: JsonRecord) {
  return Response.json(body, { status, headers: corsHeaders });
}

function withCors(res: Response) {
  const headers = new Headers(res.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function asPayload(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function nullableText(value: unknown) {
  const next = text(value);
  return next.length ? next : null;
}

function getFirstAccessRedirectTo(payload: JsonRecord) {
  const explicit = text(payload.redirectTo ?? payload.redirect_to);
  if (explicit) return explicit;

  const appUrl = text(
    Deno.env.get("APP_URL") ??
      Deno.env.get("SITE_URL") ??
      Deno.env.get("PUBLIC_SITE_URL") ??
      Deno.env.get("SUPABASE_AUTH_SITE_URL"),
  );

  if (!appUrl) return undefined;
  return `${appUrl.replace(/\/+$/, "")}${FIRST_ACCESS_PATH}`;
}

function validatePasswordStrength(password: string, email: string, fullName: string | null) {
  const normalizedPassword = password.toLowerCase();
  const emailLocalPart = email.split("@")[0]?.toLowerCase() ?? "";
  const nameParts =
    fullName
      ?.toLowerCase()
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4) ?? [];

  const failures: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH)
    failures.push(`minimo de ${MIN_PASSWORD_LENGTH} caracteres`);
  if (!/[A-Z]/.test(password)) failures.push("uma letra maiuscula");
  if (!/[a-z]/.test(password)) failures.push("uma letra minuscula");
  if (!/\d/.test(password)) failures.push("um numero");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("um simbolo");
  if (emailLocalPart.length >= 4 && normalizedPassword.includes(emailLocalPart)) {
    failures.push("nao conter partes do e-mail");
  }
  if (nameParts.some((part) => normalizedPassword.includes(part))) {
    failures.push("nao conter partes do nome");
  }

  return failures;
}

function assertPasswordStrength(password: string, email: string, fullName: string | null) {
  const failures = validatePasswordStrength(password, email, fullName);
  if (failures.length) {
    throw new HttpError(400, `A senha deve ter ${failures.join(", ")}.`);
  }
}

function isAal2(jwtClaims: Record<string, unknown> | undefined) {
  return jwtClaims?.aal === "aal2";
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*_-+=";
  const random = new Uint8Array(TEMP_PASSWORD_LENGTH);
  crypto.getRandomValues(random);

  const password = Array.from(random, (byte) => chars[byte % chars.length]).join("");
  return `${password}Aa1!`;
}

function positiveInteger(value: unknown, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.floor(next);
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length)),
  );
}

function normalizeModules(value: unknown) {
  const requested = uniqueStrings(value);
  const allowed = new Set<string>(MODULES);
  const modules = requested.filter((item) => allowed.has(item));
  return modules.length ? modules : [...MODULES];
}

function normalizePermissions(role: string, value: unknown) {
  const explicit = uniqueStrings(value);
  if (explicit.length) return explicit;
  if (role in DEFAULT_ROLE_PERMISSIONS) {
    return DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS];
  }
  return [];
}

function isCompanyRole(value: unknown): value is (typeof COMPANY_ROLES)[number] {
  return (
    typeof value === "string" && COMPANY_ROLES.includes(value as (typeof COMPANY_ROLES)[number])
  );
}

function isGlobalRole(value: unknown): value is (typeof GLOBAL_ROLES)[number] {
  return typeof value === "string" && GLOBAL_ROLES.includes(value as (typeof GLOBAL_ROLES)[number]);
}

function isSuperAdmin(profile: CallerProfile) {
  if (profile.must_change_password || profile.must_enroll_mfa) return false;
  return profile.global_role === "super_admin" || profile.role === "admin";
}

function assertSuperAdmin(profile: CallerProfile) {
  if (!isSuperAdmin(profile)) {
    throw new HttpError(403, "Apenas o Super Admin pode executar esta acao.");
  }
}

async function getCaller(admin: SupabaseClient, callerId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, role, permissions, global_role, blocked, must_change_password, must_enroll_mfa",
    )
    .eq("id", callerId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(403, "Perfil do usuario logado nao encontrado.");

  const profile = data as CallerProfile;
  if (profile.blocked) throw new HttpError(403, "Usuario bloqueado.");

  return profile;
}

async function getCompany(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin
    .from("companies")
    .select("id, name, active, user_limit")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Empresa nao encontrada.");

  return data as { id: string; name: string; active: boolean; user_limit: number };
}

async function assertCompanyAdmin(admin: SupabaseClient, caller: CallerProfile, companyId: string) {
  if (caller.must_change_password || caller.must_enroll_mfa) {
    throw new HttpError(403, "Conclua as etapas de seguranca antes de administrar usuarios.");
  }

  if (isSuperAdmin(caller)) return;

  const company = await getCompany(admin, companyId);
  if (!company.active) throw new HttpError(403, "Empresa inativa.");

  const { data, error } = await admin
    .from("company_members")
    .select("id, role, active")
    .eq("company_id", companyId)
    .eq("user_id", caller.id)
    .eq("active", true)
    .in("role", ["admin", "admin_empresa"])
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(403, "Usuario sem permissao para administrar esta empresa.");
}

async function ensureUserLimit(admin: SupabaseClient, companyId: string, targetUserId?: string) {
  const company = await getCompany(admin, companyId);
  const query = admin
    .from("company_members")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("active", true);

  const { count, error } = targetUserId ? await query.neq("user_id", targetUserId) : await query;

  if (error) throw new HttpError(500, error.message);
  if ((count ?? 0) >= company.user_limit) {
    throw new HttpError(
      409,
      `Limite de usuarios atingido para ${company.name}. Limite atual: ${company.user_limit}.`,
    );
  }
}

async function resolveLogCompanyId(
  admin: SupabaseClient,
  preferredCompanyId: string | null,
  targetUserId?: string,
) {
  if (preferredCompanyId) return preferredCompanyId;

  if (targetUserId) {
    const { data } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data?.company_id) return data.company_id as string;
  }

  const { data } = await admin
    .from("companies")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

async function writeAuditLog(
  admin: SupabaseClient,
  args: {
    action: string;
    tableName: string;
    recordId?: string | null;
    description: string;
    companyId?: string | null;
    callerId: string;
    metadata?: JsonRecord;
    oldData?: JsonRecord | null;
    newData?: JsonRecord | null;
    targetUserId?: string;
  },
) {
  const companyId = await resolveLogCompanyId(admin, args.companyId ?? null, args.targetUserId);
  if (!companyId) return;

  const { error } = await admin.from("audit_logs").insert({
    company_id: companyId,
    action: args.action,
    table_name: args.tableName,
    record_id: args.recordId ?? null,
    description: args.description,
    metadata: args.metadata ?? {},
    old_data: args.oldData ?? null,
    new_data: args.newData ?? null,
    user_id: args.callerId,
  });

  if (error) throw new HttpError(500, error.message);
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, error.message);

    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }

  return null;
}

async function createOrResolveUser(
  admin: SupabaseClient,
  payload: JsonRecord,
  caller: CallerProfile,
) {
  const email = text(payload.email).toLowerCase();
  const fullName = nullableText(payload.fullName ?? payload.full_name);
  const password = text(payload.password);
  const now = new Date().toISOString();

  if (!email) throw new HttpError(400, "Informe o e-mail do usuario.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Informe um e-mail valido.");
  }
  if (password) assertPasswordStrength(password, email, fullName);

  const existingProfile = await admin
    .from("profiles")
    .select(
      "id, email, full_name, role, permissions, global_role, blocked, must_change_password, password_change_required_at, first_login_completed_at, must_enroll_mfa, mfa_required_at",
    )
    .eq("email", email)
    .maybeSingle();

  if (existingProfile.error) throw new HttpError(500, existingProfile.error.message);

  let userId = (existingProfile.data?.id as string | undefined) ?? null;
  let createdInAuth = false;
  let invited = false;

  if (!userId) {
    const existingAuthUser = await findAuthUserByEmail(admin, email);

    if (existingAuthUser) {
      userId = existingAuthUser.id;
    } else if (password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw new HttpError(500, error.message);
      userId = data.user?.id ?? null;
      createdInAuth = true;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: getFirstAccessRedirectTo(payload),
      });
      if (error) throw new HttpError(500, error.message);
      userId = data.user?.id ?? null;
      invited = true;
    }
  }

  if (!userId) throw new HttpError(500, "Nao foi possivel obter o ID do usuario.");

  const globalRole = isGlobalRole(payload.globalRole) ? payload.globalRole : null;
  if (globalRole && !isSuperAdmin(caller)) {
    throw new HttpError(403, "Apenas o Super Admin pode atribuir perfil global.");
  }

  const profilePayload: JsonRecord = existingProfile.data
    ? {
        email,
        full_name: fullName ?? existingProfile.data.full_name,
        updated_at: new Date().toISOString(),
      }
    : {
        id: userId,
        email,
        full_name: fullName,
        role: "viewer",
        permissions: [],
        blocked: false,
        must_change_password: true,
        password_change_required_at: now,
        must_enroll_mfa: true,
        mfa_required_at: now,
        invited_at: invited ? now : null,
      };

  if (globalRole) profilePayload.global_role = globalRole;
  if (existingProfile.data && existingProfile.data.must_change_password) {
    profilePayload.password_change_required_at =
      existingProfile.data.password_change_required_at ?? now;
  }
  if (existingProfile.data && existingProfile.data.must_enroll_mfa) {
    profilePayload.mfa_required_at = existingProfile.data.mfa_required_at ?? now;
  }

  const profileRequest = existingProfile.data
    ? admin.from("profiles").update(profilePayload).eq("id", userId)
    : admin.from("profiles").insert(profilePayload);

  const { error: profileError } = await profileRequest;

  if (profileError) throw new HttpError(500, profileError.message);

  return { userId, email, fullName, createdInAuth, invited };
}

async function createCompany(admin: SupabaseClient, caller: CallerProfile, payload: JsonRecord) {
  assertSuperAdmin(caller);

  const name = text(payload.name);
  if (!name) throw new HttpError(400, "Informe o nome da empresa.");

  const companyPayload = {
    name,
    document: nullableText(payload.document),
    plan: text(payload.plan, "basico") || "basico",
    user_limit: positiveInteger(payload.userLimit ?? payload.user_limit, 10),
    modules: normalizeModules(payload.modules),
    active: payload.active !== false,
  };

  const { data: company, error } = await admin
    .from("companies")
    .insert(companyPayload)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "company_created",
    tableName: "companies",
    recordId: company.id,
    description: `Empresa criada: ${company.name}`,
    companyId: company.id,
    callerId: caller.id,
    newData: company,
  });

  const firstAdmin = asPayload(payload.firstAdmin);
  if (text(firstAdmin.email)) {
    await createCompanyUser(admin, caller, {
      ...firstAdmin,
      companyId: company.id,
      role: "admin_empresa",
      permissions: [],
    });
  }

  return { company };
}

async function updateCompany(admin: SupabaseClient, caller: CallerProfile, payload: JsonRecord) {
  assertSuperAdmin(caller);

  const companyId = text(payload.companyId ?? payload.id);
  if (!companyId) throw new HttpError(400, "Informe a empresa.");

  const updatePayload: JsonRecord = {
    updated_at: new Date().toISOString(),
  };

  if ("name" in payload) updatePayload.name = text(payload.name);
  if ("document" in payload) updatePayload.document = nullableText(payload.document);
  if ("plan" in payload) updatePayload.plan = text(payload.plan, "basico") || "basico";
  if ("userLimit" in payload || "user_limit" in payload) {
    updatePayload.user_limit = positiveInteger(payload.userLimit ?? payload.user_limit, 10);
  }
  if ("modules" in payload) updatePayload.modules = normalizeModules(payload.modules);
  if ("active" in payload) updatePayload.active = payload.active === true;

  const { data: previous } = await admin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();
  const { data: company, error } = await admin
    .from("companies")
    .update(updatePayload)
    .eq("id", companyId)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: company.active ? "company_updated" : "company_status_updated",
    tableName: "companies",
    recordId: company.id,
    description: `Empresa atualizada: ${company.name}`,
    companyId: company.id,
    callerId: caller.id,
    oldData: previous,
    newData: company,
  });

  return { company };
}

async function createCompanyUser(
  admin: SupabaseClient,
  caller: CallerProfile,
  payload: JsonRecord,
) {
  const companyId = text(payload.companyId ?? payload.company_id);
  if (!companyId) throw new HttpError(400, "Informe a empresa.");

  await assertCompanyAdmin(admin, caller, companyId);

  const role = isCompanyRole(payload.role) ? payload.role : "solicitante";
  if (!isSuperAdmin(caller) && role === "admin_empresa") {
    throw new HttpError(403, "Apenas o Super Admin pode criar outro Admin da Empresa.");
  }

  const user = await createOrResolveUser(admin, payload, caller);
  await ensureUserLimit(admin, companyId, user.userId);

  const permissions = normalizePermissions(role, payload.permissions);

  const { data: membership, error } = await admin
    .from("company_members")
    .upsert(
      {
        company_id: companyId,
        user_id: user.userId,
        role,
        permissions,
        active: true,
      },
      { onConflict: "company_id,user_id" },
    )
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "company_user_created",
    tableName: "company_members",
    recordId: user.userId,
    description: `Usuario criado/vinculado: ${user.email}`,
    companyId,
    callerId: caller.id,
    metadata: {
      target_user_id: user.userId,
      target_email: user.email,
      role,
      created_in_auth: user.createdInAuth,
      invited: user.invited,
    },
    newData: membership,
    targetUserId: user.userId,
  });

  return { user, membership };
}

async function updateMembership(admin: SupabaseClient, caller: CallerProfile, payload: JsonRecord) {
  const companyId = text(payload.companyId ?? payload.company_id);
  const userId = text(payload.userId ?? payload.user_id);
  if (!companyId || !userId) throw new HttpError(400, "Informe empresa e usuario.");

  await assertCompanyAdmin(admin, caller, companyId);

  const previousResult = await admin
    .from("company_members")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (previousResult.error) throw new HttpError(500, previousResult.error.message);
  if (!previousResult.data) throw new HttpError(404, "Vinculo do usuario nao encontrado.");

  const updatePayload: JsonRecord = {};
  const role = isCompanyRole(payload.role) ? payload.role : previousResult.data.role;

  if (!isSuperAdmin(caller) && role === "admin_empresa") {
    throw new HttpError(403, "Apenas o Super Admin pode atribuir Admin da Empresa.");
  }

  if ("role" in payload) updatePayload.role = role;
  if ("permissions" in payload)
    updatePayload.permissions = normalizePermissions(role, payload.permissions);
  if ("active" in payload) {
    const nextActive = payload.active === true;
    if (nextActive && !previousResult.data.active) await ensureUserLimit(admin, companyId, userId);
    updatePayload.active = nextActive;
  }

  if (!Object.keys(updatePayload).length) return { membership: previousResult.data };

  const { data: membership, error } = await admin
    .from("company_members")
    .update(updatePayload)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "company_user_membership_updated",
    tableName: "company_members",
    recordId: userId,
    description: "Perfil do usuario da empresa atualizado",
    companyId,
    callerId: caller.id,
    metadata: { target_user_id: userId, role: membership.role, active: membership.active },
    oldData: previousResult.data,
    newData: membership,
    targetUserId: userId,
  });

  return { membership };
}

async function setUserBlocked(admin: SupabaseClient, caller: CallerProfile, payload: JsonRecord) {
  assertSuperAdmin(caller);

  const userId = text(payload.userId ?? payload.user_id);
  const blocked = payload.blocked === true;
  if (!userId) throw new HttpError(400, "Informe o usuario.");
  if (userId === caller.id && blocked)
    throw new HttpError(400, "Voce nao pode bloquear seu proprio usuario.");

  const { data: previous } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const authUpdate = await admin.auth.admin.updateUserById(userId, {
    ban_duration: blocked ? "876000h" : "none",
  });
  if (authUpdate.error) throw new HttpError(500, authUpdate.error.message);

  const { data: profile, error } = await admin
    .from("profiles")
    .update({
      blocked,
      blocked_at: blocked ? new Date().toISOString() : null,
      blocked_by: blocked ? caller.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: blocked ? "company_user_blocked" : "company_user_unblocked",
    tableName: "profiles",
    recordId: userId,
    description: blocked ? "Usuario bloqueado" : "Usuario desbloqueado",
    callerId: caller.id,
    oldData: previous,
    newData: profile,
    targetUserId: userId,
  });

  return { profile };
}

async function updateGlobalRole(admin: SupabaseClient, caller: CallerProfile, payload: JsonRecord) {
  assertSuperAdmin(caller);

  const userId = text(payload.userId ?? payload.user_id);
  const globalRole =
    payload.globalRole === null || payload.global_role === null
      ? null
      : text(payload.globalRole ?? payload.global_role);

  if (!userId) throw new HttpError(400, "Informe o usuario.");
  if (globalRole !== null && !isGlobalRole(globalRole)) {
    throw new HttpError(400, "Perfil global invalido.");
  }

  const { data: previous } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const { data: profile, error } = await admin
    .from("profiles")
    .update({ global_role: globalRole, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "user_global_role_updated",
    tableName: "profiles",
    recordId: userId,
    description: "Perfil global do usuario atualizado",
    callerId: caller.id,
    metadata: { target_user_id: userId, global_role: globalRole },
    oldData: previous,
    newData: profile,
    targetUserId: userId,
  });

  return { profile };
}

async function getManagedCompanyUser(
  admin: SupabaseClient,
  caller: CallerProfile,
  payload: JsonRecord,
) {
  const companyId = text(payload.companyId ?? payload.company_id);
  const userId = text(payload.userId ?? payload.user_id);
  if (!companyId || !userId) throw new HttpError(400, "Informe empresa e usuario.");

  await assertCompanyAdmin(admin, caller, companyId);

  const { data: membership, error: membershipError } = await admin
    .from("company_members")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw new HttpError(500, membershipError.message);
  if (!membership) throw new HttpError(404, "Usuario nao pertence a esta empresa.");

  const { data: targetProfile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new HttpError(500, profileError.message);
  if (!targetProfile) throw new HttpError(404, "Perfil do usuario nao encontrado.");

  const targetGlobalRole = targetProfile.global_role as string | null;
  const targetCompanyRole = String(membership.role);
  if (
    !isSuperAdmin(caller) &&
    (targetGlobalRole || targetCompanyRole === "admin" || targetCompanyRole === "admin_empresa")
  ) {
    throw new HttpError(403, "Admin da Empresa nao pode alterar senha de outro administrador.");
  }

  return {
    companyId,
    userId,
    membership,
    targetProfile: targetProfile as JsonRecord & {
      id: string;
      email: string;
      full_name: string | null;
    },
  };
}

async function updateProfilePasswordFlags(
  admin: SupabaseClient,
  args: {
    userId: string;
    now: string;
  },
) {
  const { data, error } = await admin
    .from("profiles")
    .update({
      must_change_password: true,
      password_change_required_at: args.now,
      password_reset_requested_at: args.now,
      updated_at: args.now,
    })
    .eq("id", args.userId)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);
  return data as JsonRecord;
}

async function setUserTemporaryPassword(
  admin: SupabaseClient,
  caller: CallerProfile,
  payload: JsonRecord,
) {
  const { companyId, userId, targetProfile } = await getManagedCompanyUser(admin, caller, payload);
  const password = text(payload.password ?? payload.newPassword ?? payload.new_password);
  if (!password) throw new HttpError(400, "Informe a senha temporaria.");

  assertPasswordStrength(password, targetProfile.email, targetProfile.full_name);

  const { data: previous } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const authUpdate = await admin.auth.admin.updateUserById(userId, { password });
  if (authUpdate.error) throw new HttpError(500, authUpdate.error.message);

  const now = new Date().toISOString();
  const profile = await updateProfilePasswordFlags(admin, { userId, now });

  await writeAuditLog(admin, {
    action: "user_temporary_password_set",
    tableName: "profiles",
    recordId: userId,
    description: "Senha temporaria definida por administrador",
    companyId,
    callerId: caller.id,
    metadata: { target_user_id: userId, target_email: targetProfile.email },
    oldData: previous,
    newData: profile,
    targetUserId: userId,
  });

  return { profile };
}

async function clearUserPassword(
  admin: SupabaseClient,
  caller: CallerProfile,
  payload: JsonRecord,
) {
  const { companyId, userId, targetProfile } = await getManagedCompanyUser(admin, caller, payload);
  const resetPassword = generateTemporaryPassword();
  const redirectTo = getFirstAccessRedirectTo(payload);

  const { data: previous } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const authUpdate = await admin.auth.admin.updateUserById(userId, { password: resetPassword });
  if (authUpdate.error) throw new HttpError(500, authUpdate.error.message);

  const resetEmail = await getAnonClient().auth.resetPasswordForEmail(targetProfile.email, {
    redirectTo,
  });
  if (resetEmail.error) throw new HttpError(500, resetEmail.error.message);

  const now = new Date().toISOString();
  const profile = await updateProfilePasswordFlags(admin, { userId, now });

  await writeAuditLog(admin, {
    action: "user_password_cleared",
    tableName: "profiles",
    recordId: userId,
    description: "Senha limpa e link de redefinicao enviado",
    companyId,
    callerId: caller.id,
    metadata: {
      target_user_id: userId,
      target_email: targetProfile.email,
      reset_email_sent: true,
    },
    oldData: previous,
    newData: profile,
    targetUserId: userId,
  });

  return { profile };
}

async function completeMfaEnrollment(
  admin: SupabaseClient,
  caller: CallerProfile,
  jwtClaims: Record<string, unknown> | undefined,
) {
  if (!isAal2(jwtClaims)) {
    throw new HttpError(403, "Confirme o codigo do autenticador antes de concluir o 2FA.");
  }

  const { data: previous } = await admin
    .from("profiles")
    .select("*")
    .eq("id", caller.id)
    .maybeSingle();

  const now = new Date().toISOString();
  const { data: profile, error } = await admin
    .from("profiles")
    .update({
      must_enroll_mfa: false,
      mfa_enrolled_at: previous?.mfa_enrolled_at ?? now,
      mfa_last_verified_at: now,
      updated_at: now,
    })
    .eq("id", caller.id)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "user_mfa_enrolled",
    tableName: "profiles",
    recordId: caller.id,
    description: "2FA cadastrado no primeiro acesso",
    callerId: caller.id,
    metadata: { target_user_id: caller.id, target_email: caller.email },
    oldData: previous,
    newData: profile,
    targetUserId: caller.id,
  });

  return { profile };
}

async function recordMfaVerification(
  admin: SupabaseClient,
  caller: CallerProfile,
  jwtClaims: Record<string, unknown> | undefined,
) {
  if (!isAal2(jwtClaims)) {
    throw new HttpError(403, "Sessao 2FA invalida.");
  }

  const now = new Date().toISOString();
  const { data: profile, error } = await admin
    .from("profiles")
    .update({ mfa_last_verified_at: now, updated_at: now })
    .eq("id", caller.id)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "user_mfa_verified",
    tableName: "profiles",
    recordId: caller.id,
    description: "2FA confirmado no login",
    callerId: caller.id,
    metadata: { target_user_id: caller.id, target_email: caller.email },
    newData: profile,
    targetUserId: caller.id,
  });

  return { profile };
}

async function verifyCurrentPassword(caller: CallerProfile, currentPassword: string) {
  if (!currentPassword) return;

  const client = getAnonClient();
  const { error } = await client.auth.signInWithPassword({
    email: caller.email,
    password: currentPassword,
  });

  await client.auth.signOut().catch(() => undefined);

  if (error) {
    throw new HttpError(400, "Senha atual ou temporaria invalida.");
  }
}

async function changeFirstLoginPassword(
  admin: SupabaseClient,
  caller: CallerProfile,
  payload: JsonRecord,
) {
  if (!caller.must_change_password) {
    throw new HttpError(400, "Nao ha troca obrigatoria de senha pendente.");
  }

  const currentPassword = text(payload.currentPassword ?? payload.current_password);
  const newPassword = text(payload.newPassword ?? payload.new_password ?? payload.password);
  if (!newPassword) throw new HttpError(400, "Informe a nova senha.");

  assertPasswordStrength(newPassword, caller.email, caller.full_name);

  if (currentPassword && currentPassword === newPassword) {
    throw new HttpError(400, "A nova senha deve ser diferente da senha atual.");
  }

  await verifyCurrentPassword(caller, currentPassword);

  const { data: previous } = await admin
    .from("profiles")
    .select("*")
    .eq("id", caller.id)
    .maybeSingle();

  const authUpdate = await admin.auth.admin.updateUserById(caller.id, {
    password: newPassword,
  });
  if (authUpdate.error) throw new HttpError(500, authUpdate.error.message);

  const now = new Date().toISOString();
  const { data: profile, error } = await admin
    .from("profiles")
    .update({
      must_change_password: false,
      password_changed_at: now,
      first_login_completed_at: previous?.first_login_completed_at ?? now,
      last_login_at: now,
      updated_at: now,
    })
    .eq("id", caller.id)
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog(admin, {
    action: "user_first_login_password_changed",
    tableName: "profiles",
    recordId: caller.id,
    description: "Senha atualizada no primeiro acesso",
    callerId: caller.id,
    metadata: {
      target_user_id: caller.id,
      target_email: caller.email,
      verified_current_password: Boolean(currentPassword),
    },
    oldData: previous,
    newData: profile,
    targetUserId: caller.id,
  });

  return { profile };
}

const authenticatedHandler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const claims = ctx.userClaims as Record<string, unknown> | undefined;
    const jwtClaims = ctx.jwtClaims as Record<string, unknown> | undefined;
    const callerId = text(claims?.id ?? claims?.sub ?? jwtClaims?.sub);
    if (!callerId) throw new HttpError(401, "Sessao invalida.");

    const admin = getAdminClient();
    const caller = await getCaller(admin, callerId);
    const body = asPayload(await req.json().catch(() => ({})));
    const action = text(body.action);
    const payload = asPayload(body.payload);

    switch (action) {
      case "create_company":
        return response(200, await createCompany(admin, caller, payload));
      case "update_company":
        return response(200, await updateCompany(admin, caller, payload));
      case "create_company_user":
        return response(200, await createCompanyUser(admin, caller, payload));
      case "update_membership":
        return response(200, await updateMembership(admin, caller, payload));
      case "set_user_blocked":
        return response(200, await setUserBlocked(admin, caller, payload));
      case "update_global_role":
        return response(200, await updateGlobalRole(admin, caller, payload));
      case "set_user_temporary_password":
        return response(200, await setUserTemporaryPassword(admin, caller, payload));
      case "clear_user_password":
        return response(200, await clearUserPassword(admin, caller, payload));
      case "change_first_login_password":
        return response(200, await changeFirstLoginPassword(admin, caller, payload));
      case "complete_mfa_enrollment":
        return response(200, await completeMfaEnrollment(admin, caller, jwtClaims));
      case "record_mfa_verification":
        return response(200, await recordMfaVerification(admin, caller, jwtClaims));
      default:
        throw new HttpError(400, "Acao administrativa invalida.");
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return response(err.status, { error: err.message });
    }

    const message = err instanceof Error ? err.message : "Erro desconhecido.";
    return response(500, { error: message });
  }
});

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    return withCors(await authenticatedHandler(req));
  },
};
