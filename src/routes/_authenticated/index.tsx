import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, TrendingUp, TrendingDown, Wallet, Truck, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { db } from "@/lib/supabase";
import { PageHeader } from "@/components/shared/PageHeader";
import { currency, number, dateTimeBR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/")({ component: DashboardPage });

interface Stats {
  totalProducts: number;
  inMonth: number;
  outMonth: number;
  balance: number;
  suppliers: number;
  lowStock: number;
}

function DashboardPage() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;

  const { data: stats } = useQuery<Stats>({
    queryKey: ["dashboard", "stats", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [products, movsIn, movsOut, suppliers, low] = await Promise.all([
        db
          .from("products")
          .select("current_stock, avg_cost, min_stock, active")
          .eq("company_id", companyId),
        db
          .from("stock_movements")
          .select("quantity")
          .eq("company_id", companyId)
          .eq("type", "in")
          .gte("movement_date", monthStart),
        db
          .from("stock_movements")
          .select("quantity")
          .eq("company_id", companyId)
          .eq("type", "out")
          .gte("movement_date", monthStart),
        db
          .from("suppliers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("active", true),
        db
          .from("products")
          .select("id, current_stock, min_stock")
          .eq("company_id", companyId)
          .eq("active", true),
      ]);
      const prods = (products.data ?? []) as {
        current_stock: number;
        avg_cost: number;
        min_stock: number;
      }[];
      const inSum = ((movsIn.data ?? []) as { quantity: number }[]).reduce(
        (s, m) => s + Number(m.quantity),
        0,
      );
      const outSum = ((movsOut.data ?? []) as { quantity: number }[]).reduce(
        (s, m) => s + Number(m.quantity),
        0,
      );
      const balance = prods.reduce((s, p) => s + Number(p.current_stock) * Number(p.avg_cost), 0);
      const lowCount = ((low.data ?? []) as { current_stock: number; min_stock: number }[]).filter(
        (p) => Number(p.min_stock) > 0 && Number(p.current_stock) <= Number(p.min_stock),
      ).length;
      return {
        totalProducts: prods.length,
        inMonth: inSum,
        outMonth: outSum,
        balance,
        suppliers: suppliers.count ?? 0,
        lowStock: lowCount,
      };
    },
  });

  const { data: chart } = useQuery({
    queryKey: ["dashboard", "chart", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const from = new Date(Date.now() - 29 * 86400 * 1000);
      from.setHours(0, 0, 0, 0);
      const { data } = await db
        .from("stock_movements")
        .select("type, quantity, movement_date")
        .eq("company_id", companyId)
        .gte("movement_date", from.toISOString());
      const days: Record<string, { day: string; entradas: number; saidas: number }> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        days[key] = {
          day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          entradas: 0,
          saidas: 0,
        };
      }
      ((data ?? []) as { type: "in" | "out"; quantity: number; movement_date: string }[]).forEach(
        (m) => {
          const k = m.movement_date.slice(0, 10);
          if (!days[k]) return;
          if (m.type === "in") days[k].entradas += Number(m.quantity);
          else days[k].saidas += Number(m.quantity);
        },
      );
      return Object.values(days);
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["dashboard", "recent", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await db
        .from("stock_movements")
        .select("id, type, quantity, movement_date, product:products(name, sku)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(6);
      return (data ?? []) as {
        id: string;
        type: "in" | "out";
        quantity: number;
        movement_date: string;
        product: { name: string; sku: string } | null;
      }[];
    },
  });

  const { data: alerts } = useQuery({
    queryKey: ["dashboard", "alerts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id, name, sku, current_stock, min_stock")
        .eq("company_id", companyId)
        .eq("active", true);
      return (
        (data ?? []) as {
          id: string;
          name: string;
          sku: string;
          current_stock: number;
          min_stock: number;
        }[]
      )
        .filter((p) => Number(p.min_stock) > 0 && Number(p.current_stock) <= Number(p.min_stock))
        .slice(0, 6);
    },
  });

  const cards = [
    {
      label: "Total de produtos",
      value: number(stats?.totalProducts ?? 0),
      icon: Package,
      color: "text-primary",
    },
    {
      label: "Entradas no mês",
      value: number(stats?.inMonth ?? 0),
      icon: TrendingUp,
      color: "text-[color:var(--success)]",
    },
    {
      label: "Saídas no mês",
      value: number(stats?.outMonth ?? 0),
      icon: TrendingDown,
      color: "text-destructive",
    },
    {
      label: "Saldo em estoque",
      value: currency(stats?.balance ?? 0),
      icon: Wallet,
      color: "text-primary",
    },
    {
      label: "Fornecedores ativos",
      value: number(stats?.suppliers ?? 0),
      icon: Truck,
      color: "text-foreground",
    },
    {
      label: "Alertas de estoque",
      value: number(stats?.lowStock ?? 0),
      icon: AlertTriangle,
      color: "text-[color:var(--warning)]",
    },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão executiva do seu inventário." />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {c.label}
                </div>
                <Icon className={`size-4 ${c.color}`} />
              </div>
              <div className="text-xl font-semibold tabular-nums">{c.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Movimentações — últimos 30 dias</h3>
              <p className="text-xs text-muted-foreground">Entradas vs saídas</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart ?? []} margin={{ left: -10, right: 8 }}>
                <defs>
                  <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.16 155)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.65 0.16 155)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="oklch(0.91 0.012 255)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  dataKey="entradas"
                  stroke="oklch(0.55 0.16 155)"
                  fill="url(#g-in)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="saidas"
                  stroke="oklch(0.55 0.22 25)"
                  fill="url(#g-out)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">Alertas de estoque baixo</h3>
          <p className="text-xs text-muted-foreground mb-4">Itens no mínimo ou abaixo</p>
          {alerts?.length ? (
            <ul className="space-y-2.5">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.sku}</div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-[color:var(--warning)]/15 text-[color:var(--warning)]">
                    {number(a.current_stock)} / {number(a.min_stock)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Tudo em ordem. ✅</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5 xl:col-span-2">
          <h3 className="font-semibold mb-4">Movimentações recentes</h3>
          {recent?.length ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Produto</th>
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-right py-2">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2.5">{dateTimeBR(r.movement_date)}</td>
                    <td className="py-2.5">{r.product?.name ?? "—"}</td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          r.type === "in"
                            ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {r.type === "in" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{number(r.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Entradas x Saídas (mês)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Entradas", v: stats?.inMonth ?? 0 },
                  { name: "Saídas", v: stats?.outMonth ?? 0 },
                ]}
              >
                <CartesianGrid
                  stroke="oklch(0.91 0.012 255)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="v" fill="oklch(0.60 0.18 255)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
