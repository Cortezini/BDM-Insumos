import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Calculator, TrendingDown, ArrowRightLeft } from "lucide-react";
import { useList, useUpsert, useDelete } from "@/lib/crud";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quotations")({
  component: QuotationsPage,
});

function QuotationsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ product_id: "", supplier_id: "", price: "" });
  const [analysisProductId, setAnalysisProductId] = useState<string>("all");

  const { data: quotes, isLoading: loadingQuotes } = useList("quotations");
  const { data: products, isLoading: loadingProducts } = useList("products");
  const { data: suppliers, isLoading: loadingSuppliers } = useList("suppliers");
  
  const upsertQuote = useUpsert("quotations");
  const deleteQuote = useDelete("quotations");

  // 1. Enriquece as cotações com os nomes reais (cruzando os IDs)
  const enrichedQuotes = useMemo(() => {
    if (!quotes || !products || !suppliers) return [];
    // Avisamos ao TS que quote é 'any' para evitar o erro unknown
    return (quotes as any[]).map((quote: any) => {
      const product = (products as any[]).find((p: any) => p.id === quote.product_id);
      const supplier = (suppliers as any[]).find((s: any) => s.id === quote.supplier_id);
      return {
        ...quote,
        productName: product?.name || "Produto excluído",
        supplierName: supplier?.name || "Fornecedor excluído",
      };
    }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [quotes, products, suppliers]);

  // 2. Motor de Inteligência: Comparativo de Fornecedores para um Produto Específico
  const supplierComparison = useMemo(() => {
    if (analysisProductId === "all" || !enrichedQuotes.length) return null;

    const productQuotes = enrichedQuotes.filter(q => q.product_id === analysisProductId);
    if (productQuotes.length === 0) return [];

    const stats: Record<string, { name: string; total: number; count: number; min: number; lastPrice: number; lastDate: string }> = {};

    productQuotes.forEach(q => {
      const price = Number(q.price);
      if (!stats[q.supplier_id]) {
        stats[q.supplier_id] = { 
          name: q.supplierName, 
          total: 0, 
          count: 0, 
          min: price,
          lastPrice: price, 
          lastDate: q.created_at
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
      .map(s => ({ ...s, average: s.total / s.count }))
      .sort((a, b) => a.lastPrice - b.lastPrice);

  }, [enrichedQuotes, analysisProductId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertQuote.mutateAsync({
        product_id: formData.product_id,
        supplier_id: formData.supplier_id,
        price: parseFloat(formData.price),
      });
      toast.success("Cotação registrada!");
      setIsOpen(false);
      setFormData({ product_id: "", supplier_id: "", price: "" });
    } catch (error) {
      toast.error("Erro ao registrar cotação.");
    }
  };

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const isLoading = loadingQuotes || loadingProducts || loadingSuppliers;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inteligência de Compras</h1>
          <p className="text-muted-foreground">Compare fornecedores e tome decisões baseadas em dados.</p>
        </div>
        
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nova Cotação</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Registrar Preço</SheetTitle></SheetHeader>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select value={formData.product_id} onValueChange={(v) => setFormData({ ...formData, product_id: v })} required>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(products as any[])?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })} required>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[])?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preço Ofertado (R$)</Label>
                <Input type="number" step="0.01" min="0" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full" disabled={upsertQuote.isPending}>Salvar Cotação</Button>
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
            <Select value={analysisProductId} onValueChange={setAnalysisProductId}>
              <SelectTrigger><SelectValue placeholder="Escolha um produto para analisar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">-- Selecione um produto --</SelectItem>
                {(products as any[])?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {analysisProductId === "all" ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-md border border-dashed">
            Selecione um produto acima para ver o ranking de fornecedores e médias.
          </div>
        ) : supplierComparison?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-md border border-dashed">
            Nenhuma cotação registrada para este produto ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {supplierComparison?.map((stat, idx) => (
              <div key={idx} className={`border rounded-md p-4 relative ${idx === 0 ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'bg-background'}`}>
                {idx === 0 && (
                  <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                    Melhor Preço
                  </span>
                )}
                <h3 className="font-semibold text-base mb-3 truncate" title={stat.name}>{stat.name}</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Preço Atual:</span>
                    <span className={`font-bold text-lg ${idx === 0 ? 'text-primary' : 'text-foreground'}`}>
                      {formatBRL(stat.lastPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-muted-foreground text-xs">Média Histórica:</span>
                    <span className="font-medium text-xs">{formatBRL(stat.average)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Menor já pago:</span>
                    <span className="font-medium text-xs text-green-600 dark:text-green-400">{formatBRL(stat.min)}</span>
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
              <TableHead className="text-right">Preço Cotado</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            ) : enrichedQuotes.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Nenhuma cotação encontrada.</TableCell></TableRow>
            ) : (
              enrichedQuotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>{new Date(quote.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell className="font-medium">{quote.productName}</TableCell>
                  <TableCell>{quote.supplierName}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(Number(quote.price))}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-destructive h-8 px-2 text-xs" onClick={() => deleteQuote.mutateAsync(quote.id)}>Excluir</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}