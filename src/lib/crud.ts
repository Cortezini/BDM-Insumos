import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "./supabase";
// Supabase typing is generic in this template; cast to a flexible client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

export function useList<T>(table: string, select = "*", orderBy = "created_at") {
  return useQuery({
    queryKey: [table, "list"],
    queryFn: async () => {
      const { data, error } = await db.from(table).select(select).order(orderBy, { ascending: false });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useUpsert(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = payload.id
        ? await db.from(table).update(payload).eq("id", payload.id as string)
        : await db.from(table).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Registro salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDelete(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Registro excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}