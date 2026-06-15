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

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  companies: Company[];
  activeCompany: Company | null;
  activeMembership: CompanyMembership | null;
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
const FIRST_ACCESS_ROUTE = "/seguranca/primeiro-acesso";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
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
    if (!baseProfile || baseProfile.must_change_password) return false;
    return baseProfile.global_role === "super_admin" || baseProfile.role === "admin";
  }

  function getEffectiveProfile(baseProfile: Profile | null, membership: CompanyMembership | null) {
    if (!baseProfile) return baseProfile;
    if (baseProfile.must_change_password) {
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
    const storedCompanyId = getStoredActiveCompanyId();
    const nextCompanyId =
      nextMemberships.find((membership) => membership.company_id === storedCompanyId)?.company_id ??
      nextMemberships[0]?.company_id ??
      null;

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
      setLoading(false);
      return nextProfile;
    }

    const nextMemberships = await loadMemberships(uid, nextProfile);
    const storedCompanyId = getStoredActiveCompanyId();
    const selectedMembership =
      nextMemberships.find((membership) => membership.company_id === storedCompanyId) ??
      nextMemberships[0] ??
      null;

    setProfile(nextProfile);
    setLoading(false);
    return getEffectiveProfile(nextProfile, selectedMembership);
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const nextProfile = data.user ? await loadProfile(data.user.id) : null;
    if (nextProfile?.blocked) {
      await supabase.auth.signOut();
      throw new Error("Usuario bloqueado. Fale com o administrador.");
    }
    navigate({
      to: nextProfile?.must_change_password
        ? FIRST_ACCESS_ROUTE
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
