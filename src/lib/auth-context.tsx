import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, db } from "./supabase";
import type { PermissionKey, Profile, UserRole } from "./database.types";
import { can, getDefaultRoute } from "./permissions";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: PermissionKey) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    const { data } = await db.from("profiles").select("*").eq("id", uid).maybeSingle();
    const nextProfile = (data as Profile | null) ?? null;
    setProfile(nextProfile);
    setLoading(false);
    return nextProfile;
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

  const hasRole = (...roles: UserRole[]) => !!profile && roles.includes(profile.role);
  const hasPermission = (permission: PermissionKey) => can(profile, permission);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        loading,
        signIn,
        signOut,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
