alter table public.stock_movements enable row level security;

drop policy if exists "authenticated users can do everything on stock_movements"
  on public.stock_movements;
drop policy if exists "authenticated users can view permitted stock_movements"
  on public.stock_movements;
drop policy if exists "authenticated users can insert permitted stock_movements"
  on public.stock_movements;
drop policy if exists "admins can update stock_movements"
  on public.stock_movements;
drop policy if exists "admins can delete stock_movements"
  on public.stock_movements;

create policy "authenticated users can view permitted stock_movements"
  on public.stock_movements
  for select
  to authenticated
  using (
    private.has_permission(auth.uid(), 'movements.view')
    or (type = 'in' and private.has_permission(auth.uid(), 'movements.view_in'))
    or (type = 'out' and private.has_permission(auth.uid(), 'movements.view_out'))
  );

create policy "authenticated users can insert permitted stock_movements"
  on public.stock_movements
  for insert
  to authenticated
  with check (
    (type = 'in' and private.has_permission(auth.uid(), 'movements.create_in'))
    or (type = 'out' and private.has_permission(auth.uid(), 'movements.create_out'))
  );

create policy "admins can update stock_movements"
  on public.stock_movements
  for update
  to authenticated
  using (private.is_admin(auth.uid()))
  with check (private.is_admin(auth.uid()));

create policy "admins can delete stock_movements"
  on public.stock_movements
  for delete
  to authenticated
  using (private.is_admin(auth.uid()));
