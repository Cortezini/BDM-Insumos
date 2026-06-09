create schema if not exists private;

alter table public.profiles
  add column if not exists permissions jsonb not null default '[
    "dashboard.view",
    "products.view",
    "movements.view",
    "suppliers.view",
    "quotations.view",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "settings.view"
  ]'::jsonb;

do $$
begin
  alter table public.profiles
    add constraint profiles_permissions_is_array
    check (jsonb_typeof(permissions) = 'array');
exception
  when duplicate_object then null;
end;
$$;

update public.profiles
set permissions = case
  when role = 'operator' then '[
    "dashboard.view",
    "products.view",
    "movements.view",
    "movements.create_in",
    "movements.create_out",
    "suppliers.view",
    "quotations.view",
    "quotations.create",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "settings.view"
  ]'::jsonb
  when role = 'viewer' then '[
    "dashboard.view",
    "products.view",
    "movements.view",
    "suppliers.view",
    "quotations.view",
    "assets.view",
    "people.view",
    "cost_centers.view",
    "locations.view",
    "reports.view",
    "settings.view"
  ]'::jsonb
  else permissions
end
where role in ('operator', 'viewer')
  and (
    permissions is null
    or permissions = '[]'::jsonb
    or permissions = '[
      "dashboard.view",
      "products.view",
      "movements.view",
      "suppliers.view",
      "quotations.view",
      "assets.view",
      "people.view",
      "cost_centers.view",
      "locations.view",
      "reports.view",
      "settings.view"
    ]'::jsonb
  );

alter table public.quotations
  add column if not exists status text,
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text;

update public.quotations
set status = 'approved'
where status is null;

alter table public.quotations
  alter column status set default 'pending',
  alter column status set not null;

do $$
begin
  alter table public.quotations
    add constraint quotations_status_check
    check (status in ('pending', 'approved', 'rejected'));
exception
  when duplicate_object then null;
end;
$$;

create or replace function private.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

create or replace function private.has_permission(user_id uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and (
        role = 'admin'
        or permissions ? permission_key
      )
  );
$$;

create or replace function private.enforce_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions) then
    if not private.is_admin(auth.uid()) then
      raise exception 'Apenas administradores podem alterar permissões.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_admin_fields on public.profiles;
create trigger enforce_profile_admin_fields
  before update on public.profiles
  for each row
  execute function private.enforce_profile_admin_fields();

create or replace function private.enforce_quotation_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not private.is_admin(auth.uid()) then
      raise exception 'Apenas administradores podem excluir cotações.';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if not private.has_permission(auth.uid(), 'quotations.create') then
      raise exception 'Usuário sem permissão para criar cotações.';
    end if;

    new.status := coalesce(new.status, 'pending');
    new.requested_by := coalesce(new.requested_by, auth.uid());

    if new.status <> 'pending' and not private.is_admin(auth.uid()) then
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
      if not private.is_admin(auth.uid()) then
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

drop trigger if exists enforce_quotation_permissions on public.quotations;
create trigger enforce_quotation_permissions
  before insert or update or delete on public.quotations
  for each row
  execute function private.enforce_quotation_permissions();

create or replace function private.enforce_stock_movement_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.type = 'in' and not private.has_permission(auth.uid(), 'movements.create_in') then
    raise exception 'Usuário sem permissão para registrar entradas.';
  end if;

  if new.type = 'out' and not private.has_permission(auth.uid(), 'movements.create_out') then
    raise exception 'Usuário sem permissão para registrar saídas.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_stock_movement_permissions on public.stock_movements;
create trigger enforce_stock_movement_permissions
  before insert on public.stock_movements
  for each row
  execute function private.enforce_stock_movement_permissions();
