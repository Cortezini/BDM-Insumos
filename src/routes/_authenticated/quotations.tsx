import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, ArrowRightLeft, ExternalLink, Check, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useList, useUpsert, useDelete } from "@/lib/crud";
import { db } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

import { SearchableSelect } from "@/components/shared/SearchableSelect";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quotations")({
  component: QuotationsPage,
});

const initialQuoteForm = {
  product_id: "",
  supplier_id: "",
  price: "",
  purchase_link: "",
};

type QuoteRecord = {
  id: string;
  product_id: string;
  supplier_id: string;
  price: number | string;
  purchase_link: string | null;
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

type ProductRecord = {
  id: string;
  name: string | null;
};

type SupplierRecord = {
  id: string;
  name: string | null;
};

type SupplierStats = {
  name: string;
  total: number;
  count: number;
  min: number;
  lastPrice: number;
  lastDate: string;
};

function QuotationsPage() {
  const qc = useQueryClient();
  const { hasRole, hasPermission } = useAuth();
  const canCreateQuote = hasPermission("quotations.create");
  const canReviewQuotes = hasRole("admin");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(initialQuoteForm);
  const [analysisProductId, setAnalysisProductId] = useState<string>("all");

  const { data: quotes, isLoading: loadingQuotes } = useList<QuoteRecord>("quotations");
  const { data: products, isLoading: loadingProducts } = useList<ProductRecord>("products");
  const { data: suppliers, isLoading: loadingSuppliers } = useList<SupplierRecord>("suppliers");

  const upsertQuote = useUpsert("quotations");
  const deleteQuote = useDelete("quotations");

  const productOptions = useMemo(
    () =>
      (products ?? []).map((product) => ({
        value: product.id,
        label: product.name || "Sem nome",
      })),
    [products],
  );

  const supplierOptions = useMemo(
    () =>
      (suppliers ?? []).map((supplier) => ({
        value: supplier.id,
        label: supplier.name || "Sem nome",
      })),
    [suppliers],
  );

  const analysisProductOptions = useMemo(
    () => [{ value: "all", label: "Selecione um produto", pinned: true }, ...productOptions],
    [productOptions],
  );

  const reviewQuote = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await db
        .from("quotations")
        .update({
          status,
          review_notes: status === "approved" ? null : "Reprovada pelo administrador",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success(variables.status === "approved" ? "Cotação aprovada" : "Cotação reprovada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 1. Enriquece as cotações com os nomes reais (cruzando os IDs)
  const enrichedQuotes = useMemo(() => {
    if (!quotes || !products || !suppliers) return [];

    return quotes
      .map((quote) => {
        const product = products.find((p) => p.id === quote.product_id);
        const supplier = suppliers.find((s) => s.id === quote.supplier_id);
        return {
          ...quote,
          productName: product?.name || "Produto excluído",
          supplierName: supplier?.name || "Fornecedor excluído",
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [quotes, products, suppliers]);

  // 2. Motor de Inteligência: Comparativo de Fornecedores para um Produto Específico
  const supplierComparison = useMemo(() => {
    if (analysisProductId === "all" || !enrichedQuotes.length) return null;

    const productQuotes = enrichedQuotes.filter((q) => q.product_id === analysisProductId);
    if (productQuotes.length === 0) return [];

    const stats: Record<string, SupplierStats> = {};

    productQuotes.forEach((q) => {
      const price = Number(q.price);
      if (!stats[q.supplier_id]) {
        stats[q.supplier_id] = {
          name: q.supplierName,
          total: 0,
          count: 0,
          min: price,
          lastPrice: price,
          lastDate: q.created_at,
        };
      }
      stats[q.supplier_id].total += price;
      stats[q.supplier_id].count += 1;
      if (price < stats[q.supplier_id].min) stats[q.supplier_id].min = price;

      if (new Date(q.created_at) > new Date(stats[q.supplier_id].lastDate)) {
        stats[q.supplier_id].lastPrice = price;
        stats[q.supplier_id].lastDate = q.created_at;
      }
    });

    return Object.values(stats)
      .map((s) => ({ ...s, average: s.total / s.count }))
      .sort((a, b) => a.lastPrice - b.lastPrice);
  }, [enrichedQuotes, analysisProductId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!canCreateQuote) {
        toast.error("Usuário sem permissão para criar cotações.");
        return;
      }

      if (!formData.product_id) {
        toast.error("Selecione o produto da cotação.");
        return;
      }

      if (!formData.supplier_id) {
        toast.error("Selecione o fornecedor da cotação.");
        return;
      }

      const price = Number.parseFloat(formData.price);
      if (!Number.isFinite(price) || price < 0) {
        toast.error("Informe um preço válido para a cotação.");
        return;
      }

      await upsertQuote.mutateAsync({
        product_id: formData.product_id,
        supplier_id: formData.supplier_id,
        price,
        purchase_link: formData.purchase_link.trim() || null,
        status: "pending",
      });
      toast.success("Cotação registrada para aprovação!");
      setIsOpen(false);
      setFormData(initialQuoteForm);
    } catch (error) {
      toast.error("Erro ao registrar cotação.");
    }
  };

  const formatBRL = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const getPurchaseLinkHref = (link: string | null) => {
    if (!link) return null;
    const trimmed = link.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const getStatusBadge = (status: QuoteRecord["status"]) => {
    const variants: Record<QuoteRecord["status"], string> = {
      pending: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-amber-500/20",
      approved: "bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-500/20",
      rejected: "bg-destructive/10 text-destructive hover:bg-destructive/10 border-destructive/20",
    };
    const labels: Record<QuoteRecord["status"], string> = {
      pending: "Pendente",
      approved: "Aprovada",
      rejected: "Reprovada",
    };

    return (
      <Badge variant="outline" className={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const isLoading = loadingQuotes || loadingProducts || loadingSuppliers;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inteligência de Compras</h1>
          <p className="text-muted-foreground">
            Compare fornecedores e tome decisões baseadas em dados.
          </p>
        </div>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          {canCreateQuote && (
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Nova Cotação
              </Button>
            </SheetTrigger>
          )}
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Registrar Preço</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Produto</Label>
                <SearchableSelect
                  value={formData.product_id}
                  onValueChange={(v) => setFormData({ ...formData, product_id: v })}
                  options={productOptions}
                  placeholder="Selecione..."
                  searchPlaceholder="Digite o produto..."
                  emptyText="Nenhum produto encontrado."
                  disabled={loadingProducts}
                />
              </div>
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <SearchableSelect
                  value={formData.supplier_id}
                  onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}
                  options={supplierOptions}
                  placeholder="Selecione..."
                  searchPlaceholder="Digite o fornecedor..."
                  emptyText="Nenhum fornecedor encontrado."
                  disabled={loadingSuppliers}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço Ofertado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Link de compra</Label>
                <Input
                  type="text"
                  inputMode="url"
                  value={formData.purchase_link}
                  onChange={(e) => setFormData({ ...formData, purchase_link: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={upsertQuote.isPending}>
                Salvar Cotação
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* PAINEL DE ANÁLISE COMPARATIVA */}
      <div className="border rounded-lg p-5 bg-card shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Comparativo por Produto</h2>
          </div>
          <div className="w-full md:w-72">
            <SearchableSelect
              value={analysisProductId}
              onValueChange={setAnalysisProductId}
              options={analysisProductOptions}
              placeholder="Escolha um produto para analisar"
              searchPlaceholder="Digite o produto..."
              emptyText="Nenhum produto encontrado."
              disabled={loadingProducts}
            />
          </div>
        </div>

        {analysisProductId === "all" ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-md border border-dashed">
            Selecione um produto acima para ver o ranking de fornecedores e médias.
          </div>
        ) : supplierComparison?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-md border border-dashed">
            Nenhuma cotação para este produto ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {supplierComparison?.map((stat, idx) => (
              <div
                key={idx}
                className={`border rounded-md p-4 relative ${
                  idx === 0 ? "border-primary ring-1 ring-primary/20 bg-primary/5" : "bg-background"
                }`}
              >
                {idx === 0 && (
                  <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                    Melhor Preço
                  </span>
                )}
                <h3 className="font-semibold text-base mb-3 truncate" title={stat.name}>
                  {stat.name}
                </h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Preço Atual:</span>
                    <span
                      className={`font-bold text-lg ${
                        idx === 0 ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {formatBRL(stat.lastPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-muted-foreground text-xs">Média Histórica:</span>
                    <span className="font-medium text-xs">{formatBRL(stat.average)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Menor já pago:</span>
                    <span className="font-medium text-xs text-green-600 dark:text-green-400">
                      {formatBRL(stat.min)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                    <span>Baseado em {stat.count} cotaçõe(s)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HISTÓRICO BRUTO */}
      <div className="border rounded-lg bg-background shadow-sm overflow-hidden mt-2">
        <div className="p-4 bg-muted/30 border-b">
          <h3 className="font-semibold">Histórico Geral de Registros</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Preço Cotado</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="w-[180px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : enrichedQuotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                  Nenhuma cotação encontrada.
                </TableCell>
              </TableRow>
            ) : (
              enrichedQuotes.map((quote) => {
                const purchaseLinkHref = getPurchaseLinkHref(quote.purchase_link);

                return (
                  <TableRow key={quote.id}>
                    <TableCell>{new Date(quote.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{quote.productName}</TableCell>
                    <TableCell>{quote.supplierName}</TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBRL(Number(quote.price))}
                    </TableCell>
                    <TableCell>
                      {purchaseLinkHref ? (
                        <a
                          href={purchaseLinkHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          Abrir <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canReviewQuotes && quote.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-green-600 hover:text-green-600"
                              disabled={reviewQuote.isPending}
                              onClick={() =>
                                reviewQuote.mutate({ id: quote.id, status: "approved" })
                              }
                            >
                              <Check className="mr-1 size-3" />
                              Aprovar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                              disabled={reviewQuote.isPending}
                              onClick={() =>
                                reviewQuote.mutate({ id: quote.id, status: "rejected" })
                              }
                            >
                              <X className="mr-1 size-3" />
                              Reprovar
                            </Button>
                          </>
                        )}
                        {canReviewQuotes && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-8 px-2 text-xs"
                            onClick={() => deleteQuote.mutateAsync(quote.id)}
                          >
                            Excluir
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
