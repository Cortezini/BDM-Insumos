drop policy if exists "Acesso total tipos de ativos" on public.asset_types;
drop policy if exists "authenticated users can do everything on cost_centers" on public.cost_centers;
drop policy if exists "authenticated users can do everything on locations" on public.locations;
drop policy if exists "authenticated users can do everything on people" on public.people;
drop policy if exists "authenticated users can do everything on product_categories" on public.product_categories;
drop policy if exists "authenticated users can do everything on products" on public.products;
drop policy if exists "authenticated users can do everything on profiles" on public.profiles;
drop policy if exists "Permitir acesso total às cotações" on public.quotations;
drop policy if exists "authenticated users can do everything on suppliers" on public.suppliers;
drop policy if exists "Acesso total ativos ti" on public.ti_assets;

comment on schema private is
  'Schema interno para funcoes security definer, regras multiempresa, seguranca e auditoria. Nao expor via Data API.';
