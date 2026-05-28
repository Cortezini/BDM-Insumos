import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Server, ShieldAlert, Cpu, Activity, MapPin, User, Pencil, Database } from "lucide-react";
import { useList, useUpsert, useDelete } from "@/lib/crud";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assets")({
  component: TIAssetsPage,
});

const initialForm = {
  id: undefined as string | undefined,
  name: "",
  asset_type_id: "",
  location_id: "",
  responsible_person_id: "",
  serial_number: "",
  patrimony_tag: "",
  status: "Disponível",
  ip_address: "",
  mac_address: "",
  notes: ""
};

function TIAssetsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [formData, setFormData] = useState(initialForm);

  // Estados locais para controle de paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10); // Quantidade fixa de 10 itens por página

  // Consumindo tabelas reais do banco de dados do Supabase
  const { data: assets, isLoading: loadingAssets } = useList("ti_assets");
  const { data: assetTypes, isLoading: loadingTypes } = useList("asset_types");
  const { data: locations, isLoading: loadingLocations } = useList("locations"); 
  const { data: people, isLoading: loadingPeople } = useList("people"); 
  
  const upsertAsset = useUpsert("ti_assets");
  const deleteAsset = useDelete("ti_assets");

  // Efeito reativo para resetar a paginação ao mudar o filtro dos cards
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus]);

  // Reseta o formulário automaticamente se o usuário fechar a Sheet lateral
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialForm);
    }
  }, [isOpen]);

  // Cruzamento de dados de tabelas estrangeiras (IDs -> Nomes reais do Banco)
  const enrichedAssets = useMemo(() => {
    if (!assets || !assetTypes || !locations || !people) return [];
    
    return (assets as any[]).map((asset: any) => {
      const type = (assetTypes as any[]).find((t: any) => t.id === asset.asset_type_id);
      const loc = (locations as any[]).find((l: any) => l.id === asset.location_id);
      const person = (people as any[]).find((p: any) => p.id === asset.responsible_person_id);
      
      return {
        ...asset,
        typeName: type?.name || "Sem Categoria",
        locationName: loc?.name || "Não alocado",
        responsibleName: person?.full_name || "Sem responsável"
      };
    });
  }, [assets, assetTypes, locations, people]);

  // Aplicação do filtro por Status selecionado nos Cards
  const filteredAssets = useMemo(() => {
    if (filterStatus === "todos") return enrichedAssets;
    return enrichedAssets.filter((a: any) => a.status === filterStatus);
  }, [enrichedAssets, filterStatus]);

  // Cálculo da Paginação: Fatiamento matemático do array principal
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredAssets.slice(start, end);
  }, [filteredAssets, currentPage, pageSize]);

  // Totalizador matemático de páginas
  const totalPages = useMemo(() => {
    return Math.ceil(filteredAssets.length / pageSize);
  }, [filteredAssets, pageSize]);

  // Agregadores para os cards contadores do topo da tela
  const counters = useMemo(() => {
    if (!assets) return { total: 0, emUso: 0, manutencao: 0, backup: 0 };
    const arr = assets as any[];
    return {
      total: arr.length,
      emUso: arr.filter(a => a.status === "Em Uso").length,
      manutencao: arr.filter(a => a.status === "Manutenção").length,
      backup: arr.filter(a => a.status === "Backup").length
    };
  }, [assets]);

  // Função disparada ao clicar no Lápis (Prepara a UI para edição)
  const handleEdit = (asset: any) => {
    setFormData({
      id: asset.id,
      name: asset.name || "",
      asset_type_id: asset.asset_type_id || "",
      location_id: asset.location_id || "",
      responsible_person_id: asset.responsible_person_id || "",
      serial_number: asset.serial_number || "",
      patrimony_tag: asset.patrimony_tag || "",
      status: asset.status || "Disponível",
      ip_address: asset.ip_address || "",
      mac_address: asset.mac_address || "",
      notes: asset.notes || ""
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertAsset.mutateAsync(formData);
      toast.success(formData.id ? "Ativo atualizado com sucesso!" : "Ativo registrado com sucesso!");
      setIsOpen(false);
    } catch (error) {
      toast.error("Erro ao salvar alterações do dispositivo no banco.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja remover este dispositivo do inventário de TI?")) {
      await deleteAsset.mutateAsync(id);
      toast.success("Ativo excluído com sucesso.");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      "Disponível": "bg-green-500/10 text-green-500 hover:bg-green-500/10 border-green-500/20",
      "Em Uso": "bg-blue-500/10 text-blue-500 hover:bg-blue-500/10 border-blue-500/20",
      "Manutenção": "bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 border-amber-500/20",
      "Backup": "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/10 border-indigo-500/20",
      "Descartado": "bg-muted text-muted-foreground hover:bg-muted border-transparent"
    };
    return <Badge variant="outline" className={variants[status] || ""}>{status}</Badge>;
  };

  const isLoading = loadingAssets || loadingTypes || loadingLocations || loadingPeople;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventário de TI</h1>
          <p className="text-muted-foreground">Controle centralizado de hardware, infraestrutura e atribuições.</p>
        </div>
        
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button onClick={() => setFormData(initialForm)}>
              <Plus className="mr-2 h-4 w-4" /> Novo Ativo
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto max-w-md w-full">
            <SheetHeader>
              <SheetTitle>{formData.id ? "Editar Dispositivo" : "Cadastrar Dispositivo"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4 pb-6">
              <div className="space-y-2">
                <Label>Nome do Dispositivo</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required placeholder="Ex: Servidor Storage Dell" />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Ativo</Label>
                <Select value={formData.asset_type_id} onValueChange={(v) => setFormData({...formData, asset_type_id: v})} required>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
                  <SelectContent>
                    {(assetTypes as any[])?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Localização</Label>
                  <Select value={formData.location_id} onValueChange={(v) => setFormData({...formData, location_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(locations as any[])?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select value={formData.responsible_person_id} onValueChange={(v) => setFormData({...formData, responsible_person_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(people as any[])?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nº de Série</Label>
                  <Input value={formData.serial_number} onChange={(e) => setFormData({...formData, serial_number: e.target.value})} placeholder="S/N" />
                </div>
                <div className="space-y-2">
                  <Label>Tag Patrimônio</Label>
                  <Input value={formData.patrimony_tag} onChange={(e) => setFormData({...formData, patrimony_tag: e.target.value})} placeholder="Tag Interna" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-primary font-semibold">Status Operacional</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                  <SelectTrigger className="border-primary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Disponível">Disponível</SelectItem>
                    <SelectItem value="Em Uso">Em Uso</SelectItem>
                    <SelectItem value="Manutenção">Manutenção</SelectItem>
                    <SelectItem value="Backup">Backup</SelectItem>
                    <SelectItem value="Descartado">Descartado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4 font-semibold text-sm text-primary flex items-center gap-1">
                <Cpu className="size-4" /> Configurações de Rede
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Endereço IP</Label>
                  <Input value={formData.ip_address} onChange={(e) => setFormData({...formData, ip_address: e.target.value})} placeholder="Ex: 192.168.1.10" />
                </div>
                <div className="space-y-2">
                  <Label>Endereço MAC</Label>
                  <Input value={formData.mac_address} onChange={(e) => setFormData({...formData, mac_address: e.target.value})} placeholder="Ex: 00:1A:2B:3C:4D:5E" />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Observações / Specs</Label>
                <Input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Especificações técnicas ou detalhes..." />
              </div>

              <Button type="submit" className="w-full mt-4" disabled={upsertAsset.isPending}>
                {formData.id ? "Atualizar Ativo" : "Salvar Ativo"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* CARDS CONTADORES INDICADORES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div onClick={() => setFilterStatus("todos")} className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-primary/50 ${filterStatus === 'todos' ? 'ring-1 ring-primary border-primary' : ''}`}>
          <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground font-medium">Total Geral</span><Server className="size-4 text-muted-foreground" /></div>
          <div className="text-2xl font-bold mt-2">{counters.total}</div>
        </div>
        
        <div onClick={() => setFilterStatus("Em Uso")} className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-blue-500/50 ${filterStatus === 'Em Uso' ? 'ring-1 ring-blue-500 border-blue-500' : ''}`}>
          <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground font-medium">Em Operação</span><Activity className="size-4 text-blue-500" /></div>
          <div className="text-2xl font-bold mt-2 text-blue-500">{counters.emUso}</div>
        </div>
        
        <div onClick={() => setFilterStatus("Manutenção")} className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-amber-500/50 ${filterStatus === 'Manutenção' ? 'ring-1 ring-amber-500 border-amber-500' : ''}`}>
          <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground font-medium">Em Manutenção</span><ShieldAlert className="size-4 text-amber-500" /></div>
          <div className="text-2xl font-bold mt-2 text-amber-500">{counters.manutencao}</div>
        </div>

        <div onClick={() => setFilterStatus("Backup")} className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-indigo-500/50 ${filterStatus === 'Backup' ? 'ring-1 ring-indigo-500 border-indigo-500' : ''}`}>
          <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground font-medium">Em Backup</span><Database className="size-4 text-indigo-500" /></div>
          <div className="text-2xl font-bold mt-2 text-indigo-500">{counters.backup}</div>
        </div>
      </div>

      {/* TABELA DE DISPOSITIVOS */}
      <div className="border rounded-lg bg-background shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Ativo</TableHead>
              <TableHead>Categoria / Local / Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Identificadores</TableHead>
              <TableHead>Endereço IP / MAC</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            ) : paginatedAssets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Nenhum ativo de TI encontrado.</TableCell>
              </TableRow>
            ) : (
              paginatedAssets.map((asset: any) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{asset.name}</div>
                    <div className="text-xs text-muted-foreground max-w-xs truncate" title={asset.notes}>{asset.notes || "Sem notas descritivas"}</div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{asset.typeName}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="size-3 text-muted-foreground" /> {asset.locationName}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                      <User className="size-3 text-primary" /> {asset.responsibleName}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(asset.status)}</TableCell>
                  <TableCell className="text-xs space-y-0.5">
                    <div><span className="text-muted-foreground font-medium">S/N:</span> {asset.serial_number || "—"}</div>
                    <div><span className="text-muted-foreground font-medium">PAT:</span> {asset.patrimony_tag || "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs font-mono space-y-0.5">
                    <div className="text-primary font-semibold">{asset.ip_address || "—"}</div>
                    <div className="text-muted-foreground">{asset.mac_address || "—"}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => handleEdit(asset)} title="Editar dispositivo">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(asset.id)} title="Excluir dispositivo">
                        X
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* COMPONENTE DE PAGINAÇÃO INTEGRADO NA BASE DA TABELA */}
        <div className="flex items-center justify-between px-4 py-4 border-t bg-muted/20">
          <div className="text-sm text-muted-foreground">
            A mostrar de {filteredAssets.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} até{" "}
            {Math.min(currentPage * pageSize, filteredAssets.length)} de{" "}
            <span className="font-semibold">{filteredAssets.length}</span> ativos
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            
            <div className="text-sm font-medium text-foreground">
              Página {currentPage} de {totalPages || 1}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Seguinte
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}