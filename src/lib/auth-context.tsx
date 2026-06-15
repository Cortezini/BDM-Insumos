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
import { can, getDefaultRoute } from "./permissions";

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

  function getEffectiveProfile(baseProfile: Profile | null, membership: CompanyMembership | null) {
    if (!baseProfile || !membership) return baseProfile;
    return {
      ...baseProfile,
      role: membership.role,
      permissions: membership.permissions,
    };
  }

  async function loadMemberships(uid: string) {
    const { data, error } = await db
      .from("company_members")
      .select("*, company:companies(id, name, document, active, created_at)")
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
    const nextMemberships = await loadMemberships(uid);
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
    navigate({ to: getDefaultRoute(nextProfile) ?? "/" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth/login" });
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
  const effectiveProfile = useMemo(
    () => getEffectiveProfile(profile, activeMembership),
    [activeMembership, profile],
  );

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
