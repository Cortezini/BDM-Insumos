import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Server,
  ShieldAlert,
  Cpu,
  Activity,
  MapPin,
  User,
  Pencil,
  Database,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useList, useUpsert, useDelete } from "@/lib/crud";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assets")({
  component: TIAssetsPage,
});

const OPERATIONAL_STATUS_OPTIONS = ["Em Uso", "Manutenção", "Backup", "Descartado"] as const;
const DEFAULT_OPERATIONAL_STATUS = OPERATIONAL_STATUS_OPTIONS[0];

type AssetFormData = {
  id?: string;
  name: string;
  asset_type_id: string;
  location_id: string;
  responsible_person_id: string;
  serial_number: string;
  patrimony_tag: string;
  status: (typeof OPERATIONAL_STATUS_OPTIONS)[number];
  ip_address: string;
  mac_address: string;
  notes: string;
};

const initialForm: AssetFormData = {
  id: undefined,
  name: "",
  asset_type_id: "",
  location_id: "",
  responsible_person_id: "",
  serial_number: "",
  patrimony_tag: "",
  status: DEFAULT_OPERATIONAL_STATUS,
  ip_address: "",
  mac_address: "",
  notes: "",
};

type AssetRecord = {
  id: string;
  name: string | null;
  asset_type_id: string | null;
  location_id: string | null;
  responsible_person_id: string | null;
  serial_number: string | null;
  patrimony_tag: string | null;
  status: string | null;
  ip_address: string | null;
  mac_address: string | null;
  notes: string | null;
};

type AssetTypeRecord = {
  id: string;
  name: string | null;
};

type LocationRecord = {
  id: string;
  name: string | null;
};

type PersonRecord = {
  id: string;
  full_name: string | null;
};

type EnrichedAssetRecord = AssetRecord & {
  typeName: string;
  locationName: string;
  responsibleName: string;
};

function TIAssetsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterAssetType, setFilterAssetType] = useState<string>("todos");
  const [filterLocation, setFilterLocation] = useState<string>("todos");
  const [filterResponsible, setFilterResponsible] = useState<string>("todos");
  const [formData, setFormData] = useState(initialForm);

  // Estados locais para controle de paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10); // Quantidade fixa de 10 itens por página

  // Consumindo tabelas reais do banco de dados do Supabase
  const { data: assets, isLoading: loadingAssets } = useList<AssetRecord>("ti_assets");
  const { data: assetTypes, isLoading: loadingTypes } = useList<AssetTypeRecord>("asset_types");
  const { data: locations, isLoading: loadingLocations } = useList<LocationRecord>("locations");
  const { data: people, isLoading: loadingPeople } = useList<PersonRecord>("people");

  const upsertAsset = useUpsert("ti_assets");
  const deleteAsset = useDelete("ti_assets");

  const assetTypeOptions = useMemo(
    () =>
      (assetTypes ?? []).map((type) => ({
        value: type.id,
        label: type.name || "Sem nome",
      })),
    [assetTypes],
  );

  const locationOptions = useMemo(
    () =>
      (locations ?? []).map((location) => ({
        value: location.id,
        label: location.name || "Sem nome",
      })),
    [locations],
  );

  const peopleOptions = useMemo(
    () =>
      (people ?? []).map((person) => ({
        value: person.id,
        label: person.full_name || "Sem nome",
      })),
    [people],
  );

  const assetTypeFilterOptions = useMemo(
    () => [{ value: "todos", label: "Todas as categorias", pinned: true }, ...assetTypeOptions],
    [assetTypeOptions],
  );

  const locationFilterOptions = useMemo(
    () => [{ value: "todos", label: "Todas as localizações", pinned: true }, ...locationOptions],
    [locationOptions],
  );

  const peopleFilterOptions = useMemo(
    () => [{ value: "todos", label: "Todos os usuários", pinned: true }, ...peopleOptions],
    [peopleOptions],
  );

  const locationFormOptions = useMemo(
    () => [{ value: "", label: "Sem localização", pinned: true }, ...locationOptions],
    [locationOptions],
  );

  const peopleFormOptions = useMemo(
    () => [{ value: "", label: "Sem responsável", pinned: true }, ...peopleOptions],
    [peopleOptions],
  );

  // Efeito reativo para resetar a paginação ao mudar o filtro dos cards
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterAssetType, filterLocation, filterResponsible]);

  // Reseta o formulário automaticamente se o usuário fechar a Sheet lateral
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialForm);
    }
  }, [isOpen]);

  // Cruzamento de dados de tabelas estrangeiras (IDs -> Nomes reais do Banco)
  const enrichedAssets = useMemo(() => {
    if (!assets || !assetTypes || !locations || !people) return [];

    return assets.map((asset) => {
      const type = assetTypes.find((t) => t.id === asset.asset_type_id);
      const loc = locations.find((l) => l.id === asset.location_id);
      const person = people.find((p) => p.id === asset.responsible_person_id);

      return {
        ...asset,
        typeName: type?.name || "Sem Categoria",
        locationName: loc?.name || "Não alocado",
        responsibleName: person?.full_name || "Sem responsável",
      };
    }) satisfies EnrichedAssetRecord[];
  }, [assets, assetTypes, locations, people]);

  const assetsMatchingAdvancedFilters = useMemo(() => {
    return enrichedAssets.filter((a) => {
      const matchesAssetType = filterAssetType === "todos" || a.asset_type_id === filterAssetType;
      const matchesLocation = filterLocation === "todos" || a.location_id === filterLocation;
      const matchesResponsible =
        filterResponsible === "todos" || a.responsible_person_id === filterResponsible;

      return matchesAssetType && matchesLocation && matchesResponsible;
    });
  }, [enrichedAssets, filterAssetType, filterLocation, filterResponsible]);

  // Aplicação do filtro por Status selecionado nos Cards
  const filteredAssets = useMemo(() => {
    return assetsMatchingAdvancedFilters.filter((a) => {
      return filterStatus === "todos" || a.status === filterStatus;
    });
  }, [assetsMatchingAdvancedFilters, filterStatus]);

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
    const arr = assetsMatchingAdvancedFilters;
    return {
      total: arr.length,
      emUso: arr.filter((a) => a.status === "Em Uso").length,
      manutencao: arr.filter((a) => a.status === "Manutenção").length,
      backup: arr.filter((a) => a.status === "Backup").length,
    };
  }, [assetsMatchingAdvancedFilters]);

  // Função disparada ao clicar no Lápis (Prepara a UI para edição)
  const handleEdit = (asset: EnrichedAssetRecord) => {
    setFormData({
      id: asset.id,
      name: asset.name || "",
      asset_type_id: asset.asset_type_id || "",
      location_id: asset.location_id || "",
      responsible_person_id: asset.responsible_person_id || "",
      serial_number: asset.serial_number || "",
      patrimony_tag: asset.patrimony_tag || "",
      status: OPERATIONAL_STATUS_OPTIONS.includes(
        asset.status as (typeof OPERATIONAL_STATUS_OPTIONS)[number]
      )
        ? (asset.status as (typeof OPERATIONAL_STATUS_OPTIONS)[number])
        : DEFAULT_OPERATIONAL_STATUS,
      ip_address: asset.ip_address || "",
      mac_address: asset.mac_address || "",
      notes: asset.notes || "",
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.asset_type_id) {
        toast.error("Selecione o tipo de ativo.");
        return;
      }

      await upsertAsset.mutateAsync({
        ...formData,
        location_id: formData.location_id || null,
        responsible_person_id: formData.responsible_person_id || null,
      });
      toast.success(
        formData.id ? "Ativo atualizado com sucesso!" : "Ativo registrado com sucesso!",
      );
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
      Disponível: "bg-green-500/10 text-green-500 hover:bg-green-500/10 border-green-500/20",
      "Em Uso": "bg-blue-500/10 text-blue-500 hover:bg-blue-500/10 border-blue-500/20",
      Manutenção: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 border-amber-500/20",
      Backup: "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/10 border-indigo-500/20",
      Descartado: "bg-muted text-muted-foreground hover:bg-muted border-transparent",
    };
    return (
      <Badge variant="outline" className={variants[status] || ""}>
        {status}
      </Badge>
    );
  };

  const hasActiveFilters =
    filterStatus !== "todos" ||
    filterAssetType !== "todos" ||
    filterLocation !== "todos" ||
    filterResponsible !== "todos";

  const clearFilters = () => {
    setFilterStatus("todos");
    setFilterAssetType("todos");
    setFilterLocation("todos");
    setFilterResponsible("todos");
  };

  const isLoading = loadingAssets || loadingTypes || loadingLocations || loadingPeople;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventário de TI</h1>
          <p className="text-muted-foreground">
            Controle centralizado de hardware, infraestrutura e atribuições.
          </p>
        </div>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button onClick={() => setFormData(initialForm)}>
              <Plus className="mr-2 h-4 w-4" /> Novo Ativo
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto max-w-md w-full">
            <SheetHeader>
              <SheetTitle>
                {formData.id ? "Editar Dispositivo" : "Cadastrar Dispositivo"}
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4 pb-6">
              <div className="space-y-2">
                <Label>Nome do Dispositivo</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Servidor Storage Dell"
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Ativo</Label>
                <SearchableSelect
                  value={formData.asset_type_id}
                  onValueChange={(v) => setFormData({ ...formData, asset_type_id: v })}
                  options={assetTypeOptions}
                  placeholder="Selecione o tipo..."
                  searchPlaceholder="Digite o tipo..."
                  emptyText="Nenhum tipo encontrado."
                  disabled={loadingTypes}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Localização</Label>
                  <SearchableSelect
                    value={formData.location_id}
                    onValueChange={(v) => setFormData({ ...formData, location_id: v })}
                    options={locationFormOptions}
                    placeholder="Selecione..."
                    searchPlaceholder="Digite a localização..."
                    emptyText="Nenhuma localização encontrada."
                    disabled={loadingLocations}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <SearchableSelect
                    value={formData.responsible_person_id}
                    onValueChange={(v) => setFormData({ ...formData, responsible_person_id: v })}
                    options={peopleFormOptions}
                    placeholder="Selecione..."
                    searchPlaceholder="Digite o usuário..."
                    emptyText="Nenhum usuário encontrado."
                    disabled={loadingPeople}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nº de Série</Label>
                  <Input
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    placeholder="S/N"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tag Patrimônio</Label>
                  <Input
                    value={formData.patrimony_tag}
                    onChange={(e) => setFormData({ ...formData, patrimony_tag: e.target.value })}
                    placeholder="Tag Interna"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-primary font-semibold">Status Operacional</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as AssetFormData["status"] })}
                >
                  <SelectTrigger className="border-primary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATIONAL_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4 font-semibold text-sm text-primary flex items-center gap-1">
                <Cpu className="size-4" /> Configurações de Rede
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Endereço IP</Label>
                  <Input
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    placeholder="Ex: 192.168.1.10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Endereço MAC</Label>
                  <Input
                    value={formData.mac_address}
                    onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                    placeholder="Ex: 00:1A:2B:3C:4D:5E"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Observações / Specs</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Especificações técnicas ou detalhes..."
                />
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
        <div
          onClick={() => setFilterStatus("todos")}
          className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-primary/50 ${filterStatus === "todos" ? "ring-1 ring-primary border-primary" : ""}`}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-medium">Total Geral</span>
            <Server className="size-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold mt-2">{counters.total}</div>
        </div>

        <div
          onClick={() => setFilterStatus("Em Uso")}
          className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-blue-500/50 ${filterStatus === "Em Uso" ? "ring-1 ring-blue-500 border-blue-500" : ""}`}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-medium">Em Operação</span>
            <Activity className="size-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-blue-500">{counters.emUso}</div>
        </div>

        <div
          onClick={() => setFilterStatus("Manutenção")}
          className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-amber-500/50 ${filterStatus === "Manutenção" ? "ring-1 ring-amber-500 border-amber-500" : ""}`}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-medium">Em Manutenção</span>
            <ShieldAlert className="size-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-amber-500">{counters.manutencao}</div>
        </div>

        <div
          onClick={() => setFilterStatus("Backup")}
          className={`border rounded-lg p-4 bg-card cursor-pointer transition-all hover:border-indigo-500/50 ${filterStatus === "Backup" ? "ring-1 ring-indigo-500 border-indigo-500" : ""}`}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-medium">Em Backup</span>
            <Database className="size-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-indigo-500">{counters.backup}</div>
        </div>
      </div>

      {/* FILTROS AVANÇADOS */}
      <div className="border rounded-lg bg-background px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground lg:w-36 lg:pb-2">
            <SlidersHorizontal className="size-4 text-primary" />
            Filtros
          </div>

          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <SearchableSelect
                value={filterAssetType}
                onValueChange={setFilterAssetType}
                options={assetTypeFilterOptions}
                placeholder="Todas as categorias"
                searchPlaceholder="Digite a categoria..."
                emptyText="Nenhuma categoria encontrada."
                disabled={loadingTypes}
              />
            </div>

            <div className="space-y-2">
              <Label>Localização</Label>
              <SearchableSelect
                value={filterLocation}
                onValueChange={setFilterLocation}
                options={locationFilterOptions}
                placeholder="Todas as localizações"
                searchPlaceholder="Digite a localização..."
                emptyText="Nenhuma localização encontrada."
                disabled={loadingLocations}
              />
            </div>

            <div className="space-y-2">
              <Label>Usuário</Label>
              <SearchableSelect
                value={filterResponsible}
                onValueChange={setFilterResponsible}
                options={peopleFilterOptions}
                placeholder="Todos os usuários"
                searchPlaceholder="Digite o usuário..."
                emptyText="Nenhum usuário encontrado."
                disabled={loadingPeople}
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="lg:w-auto"
          >
            <X className="mr-2 size-4" />
            Limpar
          </Button>
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
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : paginatedAssets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Nenhum ativo de TI encontrado.
                </TableCell>
              </TableRow>
            ) : (
              paginatedAssets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{asset.name}</div>
                    <div
                      className="text-xs text-muted-foreground max-w-xs truncate"
                      title={asset.notes ?? undefined}
                    >
                      {asset.notes || "Sem notas descritivas"}
                    </div>
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
                  <TableCell>{getStatusBadge(asset.status ?? "")}</TableCell>
                  <TableCell className="text-xs space-y-0.5">
                    <div>
                      <span className="text-muted-foreground font-medium">S/N:</span>{" "}
                      {asset.serial_number || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">PAT:</span>{" "}
                      {asset.patrimony_tag || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono space-y-0.5">
                    <div className="text-primary font-semibold">{asset.ip_address || "—"}</div>
                    <div className="text-muted-foreground">{asset.mac_address || "—"}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary"
                        onClick={() => handleEdit(asset)}
                        title="Editar dispositivo"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(asset.id)}
                        title="Excluir dispositivo"
                      >
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
