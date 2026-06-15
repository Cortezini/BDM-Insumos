import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import { isCompanyScopedTable } from "./company-scope";
// Supabase typing is generic in this template; cast to a flexible client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

export function useList<T>(table: string, select = "*", orderBy = "created_at") {
  const { activeCompany } = useAuth();
  const companyScoped = isCompanyScopedTable(table);
  const companyId = activeCompany?.id ?? null;

  return useQuery({
    queryKey: [table, "list", companyScoped ? companyId : "global"],
    enabled: !companyScoped || !!companyId,
    queryFn: async () => {
      let query = db.from(table).select(select);

      if (companyScoped) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query.order(orderBy, { ascending: false });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useUpsert(table: string) {
  const qc = useQueryClient();
  const { activeCompany } = useAuth();
  const companyScoped = isCompanyScopedTable(table);
  const companyId = activeCompany?.id ?? null;

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (companyScoped && !companyId) {
        throw new Error("Selecione uma empresa antes de salvar.");
      }

      const scopedPayload =
        companyScoped && companyId
          ? { ...payload, company_id: payload.company_id ?? companyId }
          : payload;

      let request = payload.id
        ? db
            .from(table)
            .update(scopedPayload)
            .eq("id", payload.id as string)
        : db.from(table).insert(scopedPayload);

      if (payload.id && companyScoped) {
        request = request.eq("company_id", companyId);
      }

      const { error } = await request;
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
  const { activeCompany } = useAuth();
  const companyScoped = isCompanyScopedTable(table);
  const companyId = activeCompany?.id ?? null;

  return useMutation({
    mutationFn: async (id: string) => {
      if (companyScoped && !companyId) {
        throw new Error("Selecione uma empresa antes de excluir.");
      }

      let request = db.from(table).delete().eq("id", id);
      if (companyScoped) {
        request = request.eq("company_id", companyId);
      }

      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("Registro excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
