import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, db } from "./supabase";
import type {
  Company,
  CompanyMembership,
  PermissionKey,
  Profile,
  UserRole,
} from "./database.types";
import { ALL_PERMISSIONS, can, getDefaultRoute, normalizeCompanyRole } from "./permissions";
import { FIRST_ACCESS_ROUTE, MFA_ROUTE } from "./security-routes";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  companies: Company[];
  activeCompany: Company | null;
  activeMembership: CompanyMembership | null;
  needsMfa: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  setActiveCompanyId: (companyId: string) => void;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: PermissionKey) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const ACTIVE_COMPANY_STORAGE_KEY = "inventory.active_company_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setMemberships([]);
        setActiveCompanyIdState(null);
        setNeedsMfa(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getStoredActiveCompanyId() {
    return window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
  }

  function persistActiveCompanyId(companyId: string | null) {
    if (companyId) {
      window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
    } else {
      window.localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    }
  }

  function isSuperAdminProfile(baseProfile: Profile | null) {
    if (!baseProfile || baseProfile.must_change_password || baseProfile.must_enroll_mfa) {
      return false;
    }
    return baseProfile.global_role === "super_admin";
  }

  function getEffectiveProfile(
    baseProfile: Profile | null,
    membership: CompanyMembership | null,
    securityLocked = needsMfa,
  ) {
    if (!baseProfile) return baseProfile;
    if (baseProfile.must_change_password || baseProfile.must_enroll_mfa || securityLocked) {
      return {
        ...baseProfile,
        permissions: [],
      };
    }
    if (isSuperAdminProfile(baseProfile)) {
      return {
        ...baseProfile,
        role: "super_admin" as UserRole,
        permissions: ALL_PERMISSIONS.map((permission) => permission.key),
      };
    }
    if (!membership) return baseProfile;

    return {
      ...baseProfile,
      role: normalizeCompanyRole(membership.role),
      permissions: membership.permissions,
    };
  }

  async function getMfaStatus(baseProfile: Profile | null) {
    if (!baseProfile || baseProfile.must_change_password) {
      setNeedsMfa(false);
      return { needsChallenge: false, needsEnrollment: false, needsMfa: false };
    }

    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

    const currentLevel = aal?.currentLevel ?? "aal1";
    const nextLevel = aal?.nextLevel ?? "aal1";
    const hasVerifiedTotp = (factors?.totp ?? []).some((factor) => factor.status === "verified");
    const needsChallenge = hasVerifiedTotp && nextLevel === "aal2" && currentLevel !== "aal2";
    const needsEnrollment = baseProfile.must_enroll_mfa && !hasVerifiedTotp;
    const nextNeedsMfa = needsChallenge || needsEnrollment || baseProfile.must_enroll_mfa;

    setNeedsMfa(nextNeedsMfa);
    return { needsChallenge, needsEnrollment, needsMfa: nextNeedsMfa };
  }

  async function loadMemberships(uid: string, baseProfile: Profile | null) {
    if (isSuperAdminProfile(baseProfile)) {
      const { data, error } = await db
        .from("companies")
        .select("id, name, document, active, plan, user_limit, modules, created_at, updated_at")
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) {
        console.warn("[Auth] Nao foi possivel carregar empresas do Super Admin.", error.message);
        setMemberships([]);
        setActiveCompanyIdState(null);
        return [];
      }

      const nextMemberships = ((data ?? []) as Company[]).map(
        (company): CompanyMembership => ({
          id: `super-${company.id}`,
          company_id: company.id,
          user_id: uid,
          role: "admin_empresa",
          permissions: [],
          active: company.active,
          created_at: company.created_at,
          company,
        }),
      );

      const storedCompanyId = getStoredActiveCompanyId();
      const nextCompanyId =
        nextMemberships.find((membership) => membership.company_id === storedCompanyId)
          ?.company_id ??
        nextMemberships[0]?.company_id ??
        null;

      setMemberships(nextMemberships);
      setActiveCompanyIdState(nextCompanyId);
      persistActiveCompanyId(nextCompanyId);

      return nextMemberships;
    }

    const { data, error } = await db
      .from("company_members")
      .select(
        "*, company:companies(id, name, document, active, plan, user_limit, modules, created_at, updated_at)",
      )
      .eq("user_id", uid)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[Auth] Não foi possível carregar empresas do usuário.", error.message);
      setMemberships([]);
      setActiveCompanyIdState(null);
      return [];
    }

    const nextMemberships = (data ?? []) as CompanyMembership[];
    const nextCompanyId = nextMemberships[0]?.company_id ?? null;

    setMemberships(nextMemberships);
    setActiveCompanyIdState(nextCompanyId);
    persistActiveCompanyId(nextCompanyId);

    return nextMemberships;
  }

  async function loadProfile(uid: string) {
    const { data } = await db.from("profiles").select("*").eq("id", uid).maybeSingle();
    const nextProfile = (data as Profile | null) ?? null;
    if (nextProfile?.blocked) {
      setProfile(nextProfile);
      setMemberships([]);
      setActiveCompanyIdState(null);
      persistActiveCompanyId(null);
      setLoading(false);
      return nextProfile;
    }

    if (nextProfile?.must_change_password) {
      setProfile(nextProfile);
      setMemberships([]);
      setActiveCompanyIdState(null);
      persistActiveCompanyId(null);
      setNeedsMfa(false);
      setLoading(false);
      return nextProfile;
    }

    const mfaStatus = await getMfaStatus(nextProfile);
    if (mfaStatus.needsMfa) {
      setProfile(nextProfile);
      setMemberships([]);
      setActiveCompanyIdState(null);
      persistActiveCompanyId(null);
      setLoading(false);
      return nextProfile;
    }

    const nextMemberships = await loadMemberships(uid, nextProfile);
    const selectedMembership = isSuperAdminProfile(nextProfile)
      ? (nextMemberships.find(
          (membership) => membership.company_id === getStoredActiveCompanyId(),
        ) ??
        nextMemberships[0] ??
        null)
      : (nextMemberships[0] ?? null);

    setProfile(nextProfile);
    setLoading(false);
    return getEffectiveProfile(nextProfile, selectedMembership, mfaStatus.needsMfa);
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const nextProfile = data.user ? await loadProfile(data.user.id) : null;
    if (nextProfile?.blocked) {
      await supabase.auth.signOut();
      throw new Error("Usuario bloqueado. Fale com o administrador.");
    }
    const mfaStatus = await getMfaStatus(nextProfile);
    navigate({
      to: nextProfile?.must_change_password
        ? FIRST_ACCESS_ROUTE
        : mfaStatus.needsMfa
          ? MFA_ROUTE
          : (getDefaultRoute(nextProfile) ?? "/"),
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth/login" });
  };

  const refreshProfile = async () => {
    const uid = session?.user?.id;
    if (!uid) return null;
    return loadProfile(uid);
  };

  const activeMembership = useMemo(() => {
    if (!memberships.length) return null;
    return (
      memberships.find((membership) => membership.company_id === activeCompanyId) ??
      memberships[0] ??
      null
    );
  }, [activeCompanyId, memberships]);

  const activeCompany = activeMembership?.company ?? null;
  const companies = useMemo(
    () => memberships.map((membership) => membership.company).filter(Boolean) as Company[],
    [memberships],
  );
  const effectiveProfile = getEffectiveProfile(profile, activeMembership);

  const setActiveCompanyId = (companyId: string) => {
    if (!isSuperAdminProfile(profile)) return;
    if (!memberships.some((membership) => membership.company_id === companyId)) return;
    setActiveCompanyIdState(companyId);
    persistActiveCompanyId(companyId);
  };

  const hasRole = (...roles: UserRole[]) =>
    !!effectiveProfile && roles.includes(effectiveProfile.role);
  const hasPermission = (permission: PermissionKey) => can(effectiveProfile, permission);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile: effectiveProfile,
        companies,
        activeCompany,
        activeMembership,
        needsMfa,
        loading,
        signIn,
        signOut,
        refreshProfile,
        setActiveCompanyId,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
