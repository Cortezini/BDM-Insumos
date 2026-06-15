create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer',
  permissions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

do $$
begin
  alter table public.company_members
    add constraint company_members_role_check
    check (role in ('admin', 'operator', 'viewer'));
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.company_members
    add constraint company_members_permissions_is_array
    check (jsonb_typeof(permissions) = 'array');
exception
  when duplicate_object then null;
end;
$$;

insert into public.companies (name)
select 'BDM Insumos'
where not exists (select 1 from public.companies);

with default_company as (
  select id
  from public.companies
  order by created_at, id
  limit 1
)
insert into public.company_members (company_id, user_id, role, permissions)
select
  default_company.id,
  profiles.id,
  profiles.role,
  coalesce(profiles.permissions, '[]'::jsonb)
from public.profiles
cross join default_company
on conflict (company_id, user_id) do nothing;

create index if not exists companies_active_idx
  on public.companies(active);

create index if not exists company_members_user_id_idx
  on public.company_members(user_id);

create index if not exists company_members_company_id_idx
  on public.company_members(company_id);

create or replace function private.current_company_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.company_id
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = p_user_id
    and cm.active
    and c.active
  order by cm.created_at, cm.company_id
  limit 1;
$$;

create or replace function private.is_company_member(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.active
      and c.active
  );
$$;

create or replace function private.is_company_admin(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.role = 'admin'
      and cm.active
      and c.active
  );
$$;

create or replace function private.has_company_permission(
  p_user_id uuid,
  p_company_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.active
      and c.active
      and (
        cm.role = 'admin'
        or cm.permissions ? p_permission_key
      )
  );
$$;

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user_id
      and cm.role = 'admin'
      and cm.active
      and c.active
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'admin'
  );
$$;

create or replace function private.has_permission(p_user_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user_id
      and cm.active
      and c.active
      and (
        cm.role = 'admin'
        or cm.permissions ? p_permission_key
      )
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        p.role = 'admin'
        or p.permissions ? p_permission_key
      )
  );
$$;

do $$
declare
  scoped_table text;
  default_company_id uuid;
begin
  select id
  into default_company_id
  from public.companies
  order by created_at, id
  limit 1;

  foreach scoped_table in array array[
    'suppliers',
    'people',
    'cost_centers',
    'locations',
    'product_categories',
    'asset_types',
    'products',
    'stock_movements',
    'ti_assets',
    'quotations',
    'audit_logs'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists company_id uuid references public.companies(id) on delete restrict',
      scoped_table
    );

    execute format(
      'update public.%I set company_id = $1 where company_id is null',
      scoped_table
    )
    using default_company_id;

    execute format(
      'alter table public.%I alter column company_id set not null',
      scoped_table
    );

    execute format(
      'create index if not exists %I on public.%I(company_id)',
      scoped_table || '_company_id_idx',
      scoped_table
    );
  end loop;
end;
$$;

create or replace function private.ensure_company_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.company_id is null then
    new.company_id := private.current_company_id(auth.uid());
  end if;

  if new.company_id is null then
    raise exception 'Usuário sem empresa vinculada.';
  end if;

  if not private.is_company_member(auth.uid(), new.company_id) then
    raise exception 'Usuário sem acesso à empresa informada.';
  end if;

  return new;
end;
$$;

create or replace function private.prevent_company_id_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'Não é permitido trocar a empresa de um registro.';
  end if;

  return new;
end;
$$;

do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'suppliers',
    'people',
    'cost_centers',
    'locations',
    'product_categories',
    'asset_types',
    'products',
    'stock_movements',
    'ti_assets',
    'quotations'
  ]
  loop
    execute format('drop trigger if exists ensure_company_id_%I on public.%I', scoped_table, scoped_table);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function private.ensure_company_id()',
      'ensure_company_id_' || scoped_table,
      scoped_table
    );

    execute format(
      'drop trigger if exists prevent_company_id_change_%I on public.%I',
      scoped_table,
      scoped_table
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.prevent_company_id_change()',
      'prevent_company_id_change_' || scoped_table,
      scoped_table
    );
  end loop;
end;
$$;

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
declare
  resolved_company_id uuid;
begin
  resolved_company_id := coalesce(
    nullif(p_new_data ->> 'company_id', '')::uuid,
    nullif(p_old_data ->> 'company_id', '')::uuid,
    nullif(p_metadata ->> 'company_id', '')::uuid,
    private.current_company_id(p_user_id)
  );

  insert into public.audit_logs (
    action,
    table_name,
    record_id,
    description,
    metadata,
    old_data,
    new_data,
    user_id,
    company_id
  )
  values (
    p_action,
    p_table_name,
    p_record_id,
    p_description,
    coalesce(p_metadata, '{}'::jsonb),
    p_old_data,
    p_new_data,
    p_user_id,
    resolved_company_id
  );
end;
$$;

create or replace function private.enforce_quotation_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id uuid;
begin
  target_company_id := coalesce(new.company_id, old.company_id);

  if tg_op = 'DELETE' then
    if not private.is_company_admin(auth.uid(), target_company_id) then
      raise exception 'Apenas administradores podem excluir cotações.';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    new.company_id := coalesce(new.company_id, private.current_company_id(auth.uid()));
    target_company_id := new.company_id;

    if not private.has_company_permission(auth.uid(), target_company_id, 'quotations.create') then
      raise exception 'Usuário sem permissão para criar cotações.';
    end if;

    new.status := coalesce(new.status, 'pending');
    new.requested_by := coalesce(new.requested_by, auth.uid());

    if new.status <> 'pending' and not private.is_company_admin(auth.uid(), target_company_id) then
      raise exception 'Apenas administradores podem aprovar cotações.';
    end if;

    if new.status in ('approved', 'rejected') then
      new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
      new.reviewed_at := coalesce(new.reviewed_at, now());
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if (new.status is distinct from old.status)
      or (new.reviewed_by is distinct from old.reviewed_by)
      or (new.reviewed_at is distinct from old.reviewed_at)
      or (new.review_notes is distinct from old.review_notes) then
      if not private.is_company_admin(auth.uid(), target_company_id) then
        raise exception 'Apenas administradores podem revisar cotações.';
      end if;

      if new.status in ('approved', 'rejected') then
        new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
        new.reviewed_at := coalesce(new.reviewed_at, now());
      end if;

      if new.status = 'pending' then
        new.reviewed_by := null;
        new.reviewed_at := null;
        new.review_notes := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_stock_movement_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.company_id := coalesce(new.company_id, private.current_company_id(auth.uid()));

  if new.type = 'in'
    and not private.has_company_permission(auth.uid(), new.company_id, 'movements.create_in') then
    raise exception 'Usuário sem permissão para registrar entradas.';
  end if;

  if new.type = 'out'
    and not private.has_company_permission(auth.uid(), new.company_id, 'movements.create_out') then
    raise exception 'Usuário sem permissão para registrar saídas.';
  end if;

  return new;
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
begin
  if (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions)
    or (new.active is distinct from old.active) then
    select email
    into target_email
    from public.profiles
    where id = new.user_id;

    perform private.write_audit_log(
      'company_user_permissions_updated',
      tg_table_name,
      new.user_id::text,
      'Permissões atualizadas para ' || coalesce(target_email, new.user_id::text),
      jsonb_build_object(
        'company_id', new.company_id,
        'target_user_id', new.user_id,
        'target_email', target_email,
        'old_role', old.role,
        'new_role', new.role,
        'old_permissions', old.permissions,
        'new_permissions', new.permissions,
        'old_active', old.active,
        'new_active', new.active
      ),
      to_jsonb(old),
      to_jsonb(new),
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_company_member_changes on public.company_members;
create trigger audit_company_member_changes
  after update on public.company_members
  for each row
  execute function private.audit_company_member_changes();

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

drop policy if exists "company members can view companies" on public.companies;
create policy "company members can view companies"
  on public.companies
  for select
  to authenticated
  using (private.is_company_member(auth.uid(), id));

drop policy if exists "company admins can update companies" on public.companies;
create policy "company admins can update companies"
  on public.companies
  for update
  to authenticated
  using (private.is_company_admin(auth.uid(), id))
  with check (private.is_company_admin(auth.uid(), id));

drop policy if exists "users can view company memberships" on public.company_members;
create policy "users can view company memberships"
  on public.company_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.is_company_admin(auth.uid(), company_id)
  );

drop policy if exists "company admins can manage memberships" on public.company_members;
create policy "company admins can manage memberships"
  on public.company_members
  for all
  to authenticated
  using (private.is_company_admin(auth.uid(), company_id))
  with check (private.is_company_admin(auth.uid(), company_id));

grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.company_members to authenticated;

do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'suppliers',
    'people',
    'cost_centers',
    'locations',
    'product_categories',
    'asset_types',
    'products',
    'ti_assets'
  ]
  loop
    execute format('alter table public.%I enable row level security', scoped_table);
    execute format(
      'drop policy if exists %I on public.%I',
      'company isolation ' || scoped_table,
      scoped_table
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.is_company_member(auth.uid(), company_id)) with check (private.is_company_member(auth.uid(), company_id))',
      'company isolation ' || scoped_table,
      scoped_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'company members can manage ' || scoped_table,
      scoped_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.is_company_member(auth.uid(), company_id)) with check (private.is_company_member(auth.uid(), company_id))',
      'company members can manage ' || scoped_table,
      scoped_table
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', scoped_table);
  end loop;
end;
$$;

alter table public.stock_movements enable row level security;

drop policy if exists "authenticated users can view permitted stock_movements"
  on public.stock_movements;
drop policy if exists "authenticated users can insert permitted stock_movements"
  on public.stock_movements;
drop policy if exists "admins can update stock_movements"
  on public.stock_movements;
drop policy if exists "admins can delete stock_movements"
  on public.stock_movements;
drop policy if exists "company isolation stock_movements"
  on public.stock_movements;

create policy "company isolation stock_movements"
  on public.stock_movements
  as restrictive
  for all
  to authenticated
  using (private.is_company_member(auth.uid(), company_id))
  with check (private.is_company_member(auth.uid(), company_id));

create policy "authenticated users can view permitted stock_movements"
  on public.stock_movements
  for select
  to authenticated
  using (
    private.has_company_permission(auth.uid(), company_id, 'movements.view')
    or (type = 'in' and private.has_company_permission(auth.uid(), company_id, 'movements.view_in'))
    or (type = 'out' and private.has_company_permission(auth.uid(), company_id, 'movements.view_out'))
  );

create policy "authenticated users can insert permitted stock_movements"
  on public.stock_movements
  for insert
  to authenticated
  with check (
    (type = 'in' and private.has_company_permission(auth.uid(), company_id, 'movements.create_in'))
    or (type = 'out' and private.has_company_permission(auth.uid(), company_id, 'movements.create_out'))
  );

create policy "admins can update stock_movements"
  on public.stock_movements
  for update
  to authenticated
  using (private.is_company_admin(auth.uid(), company_id))
  with check (private.is_company_admin(auth.uid(), company_id));

create policy "admins can delete stock_movements"
  on public.stock_movements
  for delete
  to authenticated
  using (private.is_company_admin(auth.uid(), company_id));

grant select, insert, update, delete on public.stock_movements to authenticated;

alter table public.quotations enable row level security;

drop policy if exists "company isolation quotations" on public.quotations;
drop policy if exists "company users can view quotations" on public.quotations;
drop policy if exists "company users can create quotations" on public.quotations;
drop policy if exists "company admins can update quotations" on public.quotations;
drop policy if exists "company admins can delete quotations" on public.quotations;

create policy "company isolation quotations"
  on public.quotations
  as restrictive
  for all
  to authenticated
  using (private.is_company_member(auth.uid(), company_id))
  with check (private.is_company_member(auth.uid(), company_id));

create policy "company users can view quotations"
  on public.quotations
  for select
  to authenticated
  using (private.has_company_permission(auth.uid(), company_id, 'quotations.view'));

create policy "company users can create quotations"
  on public.quotations
  for insert
  to authenticated
  with check (private.has_company_permission(auth.uid(), company_id, 'quotations.create'));

create policy "company admins can update quotations"
  on public.quotations
  for update
  to authenticated
  using (private.is_company_admin(auth.uid(), company_id))
  with check (private.is_company_admin(auth.uid(), company_id));

create policy "company admins can delete quotations"
  on public.quotations
  for delete
  to authenticated
  using (private.is_company_admin(auth.uid(), company_id));

grant select, insert, update, delete on public.quotations to authenticated;

alter table public.audit_logs enable row level security;

drop policy if exists "permitted users can view audit logs"
  on public.audit_logs;
drop policy if exists "company users can view audit logs"
  on public.audit_logs;

create policy "company users can view audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    private.has_company_permission(auth.uid(), company_id, 'audit_logs.view')
  );

grant select on public.audit_logs to authenticated;
