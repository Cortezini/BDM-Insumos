import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { db } from "@/lib/supabase";
import { dateTimeBR } from "@/lib/format";
import type { AuditLog, Profile } from "@/lib/database.types";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/logs")({ component: LogsPage });

const actionLabels: Record<string, string> = {
  asset_created: "Ativo cadastrado",
  asset_updated: "Ativo atualizado",
  record_created: "Cadastro",
  quotation_created: "Cotação criada",
  quotation_approved: "Aprovação",
  quotation_rejected: "Rejeição",
  quotation_deleted: "Cotação excluída",
  quotation_updated: "Cotação atualizada",
  quotation_status_updated: "Status atualizado",
  stock_in: "Entrada",
  stock_out: "Saída",
  company_user_permissions_updated: "Permissões da empresa",
  user_permissions_updated: "Permissões",
};

const actionClasses: Record<string, string> = {
  asset_created: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  asset_updated: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  record_created: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  quotation_created: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  quotation_approved: "bg-green-500/10 text-green-600 border-green-500/20",
  quotation_rejected: "bg-destructive/10 text-destructive border-destructive/20",
  stock_in: "bg-[color:var(--success)]/15 text-[color:var(--success)] border-transparent",
  stock_out: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  company_user_permissions_updated: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  user_permissions_updated: "bg-violet-500/10 text-violet-600 border-violet-500/20",
};

const tableLabels: Record<string, string> = {
  asset_types: "Tipos de ativo",
  audit_logs: "Logs",
  companies: "Empresas",
  company_members: "Usuários por empresa",
  cost_centers: "Centros de custo",
  locations: "Localizações",
  people: "Pessoas",
  product_categories: "Categorias de produtos",
  products: "Produtos",
  profiles: "Usuários e permissões",
  quotations: "Cotações",
  stock_movements: "Movimentações",
  suppliers: "Fornecedores",
  ti_assets: "Ativos de TI",
};

function getTableLabel(tableName: string) {
  return (
    tableLabels[tableName] ??
    tableName
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function getActionLabel(log: AuditLog) {
  if (log.action === "record_created" && log.table_name === "ti_assets") {
    return "Ativo cadastrado";
  }

  return actionLabels[log.action] ?? log.action;
}

function getActionClass(log: AuditLog) {
  if (log.action === "record_created" && log.table_name === "ti_assets") {
    return actionClasses.asset_created;
  }

  return actionClasses[log.action] ?? "border-border";
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stringifyDetails(value: unknown) {
  if (!value) return "{}";
  return JSON.stringify(value, null, 2);
}

function LogsPage() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("todos");
  const [tableFilter, setTableFilter] = useState("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const logs = useQuery<AuditLog[]>({
    queryKey: ["audit_logs", "list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("audit_logs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AuditLog[];
    },
  });

  const profiles = useQuery<Profile[]>({
    queryKey: ["profiles", "audit-log-users", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("company_members")
        .select("user_id, role, permissions, profile:profiles(id, email, full_name, created_at)")
        .eq("company_id", companyId);
      if (error) throw error;
      return (
        (data ?? []) as {
          user_id: string;
          role: Profile["role"];
          permissions: Profile["permissions"];
          profile: Pick<Profile, "id" | "email" | "full_name" | "created_at"> | null;
        }[]
      ).map((row) => ({
        id: row.user_id,
        email: row.profile?.email ?? "",
        full_name: row.profile?.full_name ?? null,
        role: row.role,
        permissions: row.permissions,
        created_at: row.profile?.created_at ?? "",
      }));
    },
  });

  const profileById = useMemo(() => {
    return new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  }, [profiles.data]);

  const actions = useMemo(
    () => Array.from(new Set((logs.data ?? []).map((log) => log.action))).sort(),
    [logs.data],
  );

  const tables = useMemo(
    () => Array.from(new Set((logs.data ?? []).map((log) => log.table_name))).sort(),
    [logs.data],
  );

  const actionOptions = useMemo(
    () => [
      { value: "todos", label: "Todas as ações", pinned: true },
      ...actions.map((action) => ({
        value: action,
        label: actionLabels[action] ?? action,
      })),
    ],
    [actions],
  );

  const tableOptions = useMemo(
    () => [
      { value: "todos", label: "Todas as telas", pinned: true },
      ...tables.map((table) => ({
        value: table,
        label: getTableLabel(table),
      })),
    ],
    [tables],
  );

  const filteredLogs = useMemo(() => {
    const search = normalizeSearchText(query.trim());

    return (logs.data ?? []).filter((log) => {
      const profile = log.user_id ? profileById.get(log.user_id) : null;
      const userLabel = profile?.full_name ?? profile?.email ?? log.user_id ?? "Sistema";
      const matchesAction = actionFilter === "todos" || log.action === actionFilter;
      const matchesTable = tableFilter === "todos" || log.table_name === tableFilter;
      const matchesQuery =
        !search ||
        normalizeSearchText(log.description).includes(search) ||
        normalizeSearchText(log.table_name).includes(search) ||
        normalizeSearchText(getTableLabel(log.table_name)).includes(search) ||
        normalizeSearchText(log.action).includes(search) ||
        normalizeSearchText(getActionLabel(log)).includes(search) ||
        normalizeSearchText(userLabel).includes(search);

      return matchesAction && matchesTable && matchesQuery;
    });
  }, [actionFilter, logs.data, profileById, query, tableFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, query, tableFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLogs = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);

  const isLoading = logs.isLoading || profiles.isLoading;

  return (
    <div>
      <PageHeader
        title="Logs"
        description="Histórico de aprovações, rejeições, cadastros, entradas e saídas."
      />

      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_220px]">
          <div className="space-y-2">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Descrição, usuário ou tabela"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ação</Label>
            <SearchableSelect
              value={actionFilter}
              onValueChange={setActionFilter}
              options={actionOptions}
              searchPlaceholder="Digite a ação..."
              emptyText="Nenhuma ação encontrada."
            />
          </div>

          <div className="space-y-2">
            <Label>Tela / tabela</Label>
            <SearchableSelect
              value={tableFilter}
              onValueChange={setTableFilter}
              options={tableOptions}
              searchPlaceholder="Digite a tela..."
              emptyText="Nenhuma tela encontrada."
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[940px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Carregando logs...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Nenhum log encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log) => {
                  const profile = log.user_id ? profileById.get(log.user_id) : null;
                  const userLabel =
                    profile?.full_name ?? profile?.email ?? log.user_id?.slice(0, 8) ?? "Sistema";

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {dateTimeBR(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getActionClass(log)}>
                          {getActionLabel(log)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md">
                          <div className="font-medium">{log.description}</div>
                          {log.record_id && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Registro: {log.record_id}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{userLabel}</TableCell>
                      <TableCell className="text-sm">{getTableLabel(log.table_name)}</TableCell>
                      <TableCell>
                        <details className="max-w-sm">
                          <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary">
                            <ScrollText className="size-3.5" />
                            Ver
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                            {stringifyDetails({
                              metadata: log.metadata,
                              old_data: log.old_data,
                              new_data: log.new_data,
                            })}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {filteredLogs.length} registros · página {safePage} de {totalPages}
        </span>
        <div className="grid grid-cols-2 gap-1 sm:flex">
          <Button
            size="sm"
            variant="outline"
            disabled={safePage === 1}
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
