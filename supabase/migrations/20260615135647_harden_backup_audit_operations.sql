create or replace function private.audit_generic_row_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_row jsonb;
  new_row jsonb;
  current_row jsonb;
  entity_label text;
  summary text;
  changed_fields text[];
  log_action text;
  log_description text;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  current_row := coalesce(new_row, old_row);
  entity_label := coalesce(nullif(tg_argv[0], ''), tg_table_name);

  if tg_op = 'UPDATE' and new_row = old_row then
    return new;
  end if;

  summary := coalesce(
    nullif(current_row ->> 'name', ''),
    nullif(current_row ->> 'full_name', ''),
    nullif(current_row ->> 'sku', ''),
    nullif(current_row ->> 'email', ''),
    nullif(current_row ->> 'patrimony_tag', ''),
    nullif(current_row ->> 'document', ''),
    current_row ->> 'id',
    current_row ->> 'user_id',
    'registro'
  );

  if tg_op = 'UPDATE' then
    select array_agg(diff.key order by diff.key)
    into changed_fields
    from (
      select new_fields.key
      from jsonb_each(new_row) as new_fields(key, value)
      join jsonb_each(old_row) as old_fields(key, value) using (key)
      where new_fields.value is distinct from old_fields.value
    ) as diff;

    log_action := 'record_updated';
    log_description := entity_label || ' atualizado: ' || summary;
  elsif tg_op = 'DELETE' then
    log_action := 'record_deleted';
    log_description := entity_label || ' excluido: ' || summary;
  else
    log_action := 'record_created';
    log_description := entity_label || ' cadastrado: ' || summary;
  end if;

  perform private.write_audit_log(
    log_action,
    tg_table_name,
    coalesce(current_row ->> 'id', current_row ->> 'user_id'),
    log_description,
    jsonb_build_object(
      'entity', entity_label,
      'summary', summary,
      'operation', tg_op,
      'changed_fields', coalesce(changed_fields, array[]::text[])
    ),
    old_row,
    new_row,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function private.audit_ti_asset_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  asset_summary text;
  changed_fields text[];
  row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  asset_summary := coalesce(
    nullif(row_data ->> 'name', ''),
    nullif(row_data ->> 'patrimony_tag', ''),
    nullif(row_data ->> 'serial_number', ''),
    row_data ->> 'id',
    'ativo'
  );

  if tg_op = 'INSERT' then
    perform private.write_audit_log(
      'asset_created',
      tg_table_name,
      new.id::text,
      'Ativo de TI cadastrado: ' || asset_summary,
      jsonb_build_object('entity', 'Ativo de TI', 'summary', asset_summary, 'asset_id', new.id),
      null,
      to_jsonb(new),
      auth.uid()
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;

    select array_agg(diff.key order by diff.key)
    into changed_fields
    from (
      select new_fields.key
      from jsonb_each(to_jsonb(new)) as new_fields(key, value)
      join jsonb_each(to_jsonb(old)) as old_fields(key, value) using (key)
      where new_fields.value is distinct from old_fields.value
    ) as diff;

    perform private.write_audit_log(
      'asset_updated',
      tg_table_name,
      new.id::text,
      'Ativo de TI atualizado: ' || asset_summary,
      jsonb_build_object(
        'entity', 'Ativo de TI',
        'summary', asset_summary,
        'asset_id', new.id,
        'changed_fields', coalesce(changed_fields, array[]::text[])
      ),
      to_jsonb(old),
      to_jsonb(new),
      auth.uid()
    );

    return new;
  end if;

  perform private.write_audit_log(
    'asset_deleted',
    tg_table_name,
    old.id::text,
    'Ativo de TI excluido: ' || asset_summary,
    jsonb_build_object('entity', 'Ativo de TI', 'summary', asset_summary, 'asset_id', old.id),
    to_jsonb(old),
    null,
    auth.uid()
  );

  return old;
end;
$$;

create or replace function private.audit_stock_movement_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb;
  movement_product_id uuid;
  product_label text;
  changed_fields text[];
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  movement_product_id := nullif(row_data ->> 'product_id', '')::uuid;

  select concat_ws(' - ', p.sku, p.name)
  into product_label
  from public.products p
  where p.id = movement_product_id;

  if tg_op = 'UPDATE' then
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;

    select array_agg(diff.key order by diff.key)
    into changed_fields
    from (
      select new_fields.key
      from jsonb_each(to_jsonb(new)) as new_fields(key, value)
      join jsonb_each(to_jsonb(old)) as old_fields(key, value) using (key)
      where new_fields.value is distinct from old_fields.value
    ) as diff;

    perform private.write_audit_log(
      'stock_movement_updated',
      tg_table_name,
      new.id::text,
      'Movimentacao atualizada: ' || coalesce(product_label, movement_product_id::text),
      jsonb_build_object(
        'product_id', new.product_id,
        'product', product_label,
        'type', new.type,
        'quantity', new.quantity,
        'changed_fields', coalesce(changed_fields, array[]::text[])
      ),
      to_jsonb(old),
      to_jsonb(new),
      coalesce(new.user_id, auth.uid())
    );

    return new;
  end if;

  perform private.write_audit_log(
    'stock_movement_deleted',
    tg_table_name,
    old.id::text,
    'Movimentacao excluida: ' || coalesce(product_label, movement_product_id::text),
    jsonb_build_object(
      'product_id', old.product_id,
      'product', product_label,
      'type', old.type,
      'quantity', old.quantity
    ),
    to_jsonb(old),
    null,
    coalesce(old.user_id, auth.uid())
  );

  return old;
end;
$$;

create or replace function private.audit_company_member_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_email text;
  old_row jsonb;
  new_row jsonb;
  target_user_id uuid;
  target_company_id uuid;
  log_action text;
  log_description text;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_user_id := nullif(coalesce(new_row ->> 'user_id', old_row ->> 'user_id'), '')::uuid;
  target_company_id := nullif(coalesce(new_row ->> 'company_id', old_row ->> 'company_id'), '')::uuid;

  select email
  into target_email
  from public.profiles
  where id = target_user_id;

  if tg_op = 'INSERT' then
    log_action := 'company_user_membership_created';
    log_description := 'Usuario vinculado a empresa: ' || coalesce(target_email, target_user_id::text);
  elsif tg_op = 'DELETE' then
    log_action := 'company_user_membership_deleted';
    log_description := 'Usuario removido da empresa: ' || coalesce(target_email, target_user_id::text);
  elsif (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions)
    or (new.active is distinct from old.active) then
    log_action := 'company_user_membership_updated';
    log_description := 'Usuario da empresa atualizado: ' || coalesce(target_email, target_user_id::text);
  else
    return new;
  end if;

  perform private.write_audit_log(
    log_action,
    tg_table_name,
    target_user_id::text,
    log_description,
    jsonb_build_object(
      'company_id', target_company_id,
      'target_user_id', target_user_id,
      'target_email', target_email,
      'old_role', old_row ->> 'role',
      'new_role', new_row ->> 'role',
      'old_permissions', old_row -> 'permissions',
      'new_permissions', new_row -> 'permissions',
      'old_active', old_row -> 'active',
      'new_active', new_row -> 'active'
    ),
    old_row,
    new_row,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  audit_table text;
  audit_label text;
begin
  for audit_table, audit_label in
    select *
    from (values
      ('products', 'Produto'),
      ('suppliers', 'Fornecedor'),
      ('people', 'Pessoa'),
      ('cost_centers', 'Centro de custo'),
      ('locations', 'Localizacao'),
      ('product_categories', 'Categoria de produto'),
      ('asset_types', 'Tipo de ativo')
    ) as labels(table_name, label)
  loop
    execute format('drop trigger if exists audit_%I_created on public.%I', audit_table, audit_table);
    execute format('drop trigger if exists audit_%I_changes on public.%I', audit_table, audit_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_generic_row_changes(%L)',
      'audit_' || audit_table || '_changes',
      audit_table,
      audit_label
    );
  end loop;
end;
$$;

drop trigger if exists audit_ti_assets_created on public.ti_assets;
drop trigger if exists audit_ti_asset_changes on public.ti_assets;
create trigger audit_ti_asset_changes
  after insert or update or delete on public.ti_assets
  for each row
  execute function private.audit_ti_asset_changes();

drop trigger if exists audit_stock_movement_changes on public.stock_movements;
create trigger audit_stock_movement_changes
  after update or delete on public.stock_movements
  for each row
  execute function private.audit_stock_movement_changes();

drop trigger if exists audit_company_member_changes on public.company_members;
create trigger audit_company_member_changes
  after insert or update or delete on public.company_members
  for each row
  execute function private.audit_company_member_changes();

create index if not exists audit_logs_company_created_at_idx
  on public.audit_logs (company_id, created_at desc);

create index if not exists audit_logs_company_action_created_at_idx
  on public.audit_logs (company_id, action, created_at desc);

revoke insert, update, delete on public.audit_logs from authenticated;
revoke all on public.audit_logs from anon;
grant select on public.audit_logs to authenticated;

comment on table public.audit_logs is
  'Trilha de auditoria imutavel da aplicacao. Escrita apenas por funcoes/servicos confiaveis; leitura via RLS por empresa.';
