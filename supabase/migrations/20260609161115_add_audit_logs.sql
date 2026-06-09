create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text not null,
  record_id text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  old_data jsonb,
  new_data jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_action_idx
  on public.audit_logs (action);

create index if not exists audit_logs_table_record_idx
  on public.audit_logs (table_name, record_id);

create index if not exists audit_logs_user_id_idx
  on public.audit_logs (user_id);

alter table public.audit_logs enable row level security;

drop policy if exists "permitted users can view audit logs"
  on public.audit_logs;

create policy "permitted users can view audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    private.is_admin(auth.uid())
    or private.has_permission(auth.uid(), 'audit_logs.view')
  );

grant select on public.audit_logs to authenticated;

create or replace function private.write_audit_log(
  p_action text,
  p_table_name text,
  p_record_id text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    action,
    table_name,
    record_id,
    description,
    metadata,
    old_data,
    new_data,
    user_id
  )
  values (
    p_action,
    p_table_name,
    p_record_id,
    p_description,
    coalesce(p_metadata, '{}'::jsonb),
    p_old_data,
    p_new_data,
    p_user_id
  );
end;
$$;

create or replace function private.audit_record_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb;
  entity_label text;
  summary text;
begin
  row_data := to_jsonb(new);
  entity_label := coalesce(nullif(tg_argv[0], ''), tg_table_name);
  summary := coalesce(
    nullif(row_data ->> 'name', ''),
    nullif(row_data ->> 'full_name', ''),
    nullif(row_data ->> 'sku', ''),
    nullif(row_data ->> 'email', ''),
    nullif(row_data ->> 'patrimony_tag', ''),
    row_data ->> 'id',
    'registro'
  );

  perform private.write_audit_log(
    'record_created',
    tg_table_name,
    row_data ->> 'id',
    entity_label || ' cadastrado: ' || summary,
    jsonb_build_object('entity', entity_label, 'summary', summary),
    null,
    row_data,
    auth.uid()
  );

  return new;
end;
$$;

create or replace function private.audit_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_label text;
  movement_action text;
  movement_description text;
begin
  select concat_ws(' - ', p.sku, p.name)
  into product_label
  from public.products p
  where p.id = new.product_id;

  if new.type = 'in' then
    movement_action := 'stock_in';
    movement_description := 'Entrada registrada';
  else
    movement_action := 'stock_out';
    movement_description := 'Saida registrada';
  end if;

  perform private.write_audit_log(
    movement_action,
    tg_table_name,
    new.id::text,
    movement_description || ': ' || coalesce(product_label, new.product_id::text),
    jsonb_build_object(
      'product_id', new.product_id,
      'product', product_label,
      'quantity', new.quantity,
      'unit_cost', new.unit_cost,
      'movement_date', new.movement_date,
      'supplier_id', new.supplier_id,
      'person_id', new.person_id,
      'cost_center_id', new.cost_center_id,
      'location_id', new.location_id
    ),
    null,
    to_jsonb(new),
    coalesce(new.user_id, auth.uid())
  );

  return new;
end;
$$;

create or replace function private.audit_quotation_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  log_action text;
  log_description text;
  log_user_id uuid;
begin
  if tg_op = 'INSERT' then
    log_action := 'quotation_created';
    log_description := 'Cotacao cadastrada';
    log_user_id := coalesce(new.requested_by, auth.uid());
  elsif tg_op = 'DELETE' then
    log_action := 'quotation_deleted';
    log_description := 'Cotacao excluida';
    log_user_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status = 'approved' then
        log_action := 'quotation_approved';
        log_description := 'Cotacao aprovada';
      elsif new.status = 'rejected' then
        log_action := 'quotation_rejected';
        log_description := 'Cotacao rejeitada';
      else
        log_action := 'quotation_status_updated';
        log_description := 'Status da cotacao atualizado';
      end if;

      log_user_id := coalesce(new.reviewed_by, auth.uid());
    else
      log_action := 'quotation_updated';
      log_description := 'Cotacao atualizada';
      log_user_id := auth.uid();
    end if;
  end if;

  if tg_op = 'DELETE' then
    perform private.write_audit_log(
      log_action,
      tg_table_name,
      old.id::text,
      log_description,
      jsonb_build_object(
        'product_id', old.product_id,
        'supplier_id', old.supplier_id,
        'price', old.price,
        'old_status', old.status,
        'new_status', null
      ),
      to_jsonb(old),
      null,
      log_user_id
    );

    return old;
  end if;

  perform private.write_audit_log(
    log_action,
    tg_table_name,
    new.id::text,
    log_description,
    jsonb_build_object(
      'product_id', new.product_id,
      'supplier_id', new.supplier_id,
      'price', new.price,
      'old_status', case when tg_op = 'UPDATE' then old.status else null end,
      'new_status', new.status
    ),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    log_user_id
  );

  return new;
end;
$$;

create or replace function private.audit_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions) then
    perform private.write_audit_log(
      'user_permissions_updated',
      tg_table_name,
      new.id::text,
      'Permissoes atualizadas para ' || coalesce(new.email, new.id::text),
      jsonb_build_object(
        'target_user_id', new.id,
        'target_email', new.email,
        'old_role', old.role,
        'new_role', new.role,
        'old_permissions', old.permissions,
        'new_permissions', new.permissions
      ),
      to_jsonb(old),
      to_jsonb(new),
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_products_created on public.products;
create trigger audit_products_created
  after insert on public.products
  for each row
  execute function private.audit_record_created('Produto');

drop trigger if exists audit_suppliers_created on public.suppliers;
create trigger audit_suppliers_created
  after insert on public.suppliers
  for each row
  execute function private.audit_record_created('Fornecedor');

drop trigger if exists audit_people_created on public.people;
create trigger audit_people_created
  after insert on public.people
  for each row
  execute function private.audit_record_created('Pessoa');

drop trigger if exists audit_cost_centers_created on public.cost_centers;
create trigger audit_cost_centers_created
  after insert on public.cost_centers
  for each row
  execute function private.audit_record_created('Centro de custo');

drop trigger if exists audit_locations_created on public.locations;
create trigger audit_locations_created
  after insert on public.locations
  for each row
  execute function private.audit_record_created('Localizacao');

drop trigger if exists audit_ti_assets_created on public.ti_assets;
create trigger audit_ti_assets_created
  after insert on public.ti_assets
  for each row
  execute function private.audit_record_created('Ativo de TI');

drop trigger if exists audit_product_categories_created on public.product_categories;
create trigger audit_product_categories_created
  after insert on public.product_categories
  for each row
  execute function private.audit_record_created('Categoria de produto');

drop trigger if exists audit_asset_types_created on public.asset_types;
create trigger audit_asset_types_created
  after insert on public.asset_types
  for each row
  execute function private.audit_record_created('Tipo de ativo');

drop trigger if exists audit_stock_movement_created on public.stock_movements;
create trigger audit_stock_movement_created
  after insert on public.stock_movements
  for each row
  execute function private.audit_stock_movement();

drop trigger if exists audit_quotation_changes on public.quotations;
create trigger audit_quotation_changes
  after insert or update or delete on public.quotations
  for each row
  execute function private.audit_quotation_changes();

drop trigger if exists audit_profile_permissions on public.profiles;
create trigger audit_profile_permissions
  after update on public.profiles
  for each row
  execute function private.audit_profile_permissions();
