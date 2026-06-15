import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Helpful runtime hint when env vars are missing in production builds
  console.warn(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Configure them in .env.local (dev) or Cloudflare env (prod).",
  );
}

export const supabase = createClient<Database>(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "inventory.auth",
  },
});

// Flexible client for ad-hoc queries — schema is enforced by Postgres + RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as any;
