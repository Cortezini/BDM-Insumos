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
    .select("id, email, full_name, role, permissions, global_role, blocked")
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

  if (!email) throw new HttpError(400, "Informe o e-mail do usuario.");
  if (password && password.length < 6)
    throw new HttpError(400, "A senha deve ter ao menos 6 caracteres.");

  const existingProfile = await admin
    .from("profiles")
    .select("id, email, full_name, role, permissions, global_role, blocked")
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
      };

  if (globalRole) profilePayload.global_role = globalRole;

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

const authenticatedHandler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const claims = ctx.userClaims as Record<string, unknown> | undefined;
    const callerId = text(claims?.sub);
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
