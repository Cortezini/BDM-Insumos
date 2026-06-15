import { supabase } from "./supabase";

export async function invokeAdminAction<T>(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, payload },
  });

  if (error) {
    const context = "context" in error ? (error.context as Response | undefined) : undefined;
    if (context) {
      try {
        const body = (await context.json()) as { error?: string };
        if (body.error) throw new Error(body.error);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) throw contextError;
      }
    }

    throw new Error(error.message);
  }

  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as T;
}
