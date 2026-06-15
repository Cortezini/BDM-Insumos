create schema if not exists private;

alter table public.companies
  add column if not exists plan text not null default 'basico',
  add column if not exists user_limit integer not null default 10,
  add column if not exists modules jsonb not null default '[
    "dashboard",
    "products",
    "movements",
    "suppliers",
    "quotations",
    "assets",
    "people",
    "cost_centers",
    "locations",
    "reports",
    "audit_logs"
  ]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.companies
    add constraint companies_user_limit_positive
    check (user_limit > 0);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.companies
    add constraint companies_modules_is_array
    check (jsonb_typeof(modules) = 'array');
exception
  when duplicate_object then null;
end;
$$;

alter table public.profiles
  add column if not exists global_role text,
  add column if not exists blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.profiles
    add constraint profiles_global_role_check
    check (
      global_role is null
      or global_role in ('super_admin', 'suporte', 'financeiro', 'comercial')
    );
exception
  when duplicate_object then null;
end;
$$;

with first_legacy_admin as (
  select id
  from public.profiles
  where role = 'admin'
  order by created_at, id
  limit 1
)
update public.profiles p
set global_role = 'super_admin'
from first_legacy_admin a
where p.id = a.id
  and p.global_role is null
  and not exists (
    select 1
    from public.profiles
    where global_role = 'super_admin'
  );

alter table public.company_members
  drop constraint if exists company_members_role_check;

alter table public.company_members
  add constraint company_members_role_check
  check (
    role in (
      'admin',
      'operator',
      'viewer',
      'admin_empresa',
      'gestor',
      'almoxarife',
      'solicitante',
      'auditor'
    )
  );

create index if not exists profiles_global_role_idx
  on public.profiles(global_role);

create index if not exists profiles_blocked_idx
  on public.profiles(blocked);

create index if not exists companies_plan_idx
  on public.companies(plan);

create or replace function private.is_profile_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select blocked
    from public.profiles
    where id = p_user_id
  ), true);
$$;

create or replace function private.is_super_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and not p.blocked
      and (
        p.global_role = 'super_admin'
        or p.role = 'admin'
      )
  );
$$;

create or replace function private.current_company_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select cm.company_id
      from public.company_members cm
      join public.companies c on c.id = cm.company_id
      join public.profiles p on p.id = cm.user_id
      where cm.user_id = p_user_id
        and cm.active
        and c.active
        and not p.blocked
      order by cm.created_at, cm.company_id
      limit 1
    ),
    (
      select c.id
      from public.companies c
      where c.active
        and private.is_super_admin(p_user_id)
      order by c.created_at, c.id
      limit 1
    )
  );
$$;

create or replace function private.is_company_member(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_super_admin(p_user_id)
  or exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.active
      and c.active
      and not p.blocked
  );
$$;

create or replace function private.is_company_admin(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_super_admin(p_user_id)
  or exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.role in ('admin', 'admin_empresa')
      and cm.active
      and c.active
      and not p.blocked
  );
$$;

create or replace function private.can_manage_company_users(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_company_admin(p_user_id, p_company_id);
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
  select private.is_super_admin(p_user_id)
  or exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.active
      and c.active
      and not p.blocked
      and (
        cm.role in ('admin', 'admin_empresa')
        or cm.permissions ? p_permission_key
      )
  );
$$;

create or replace function private.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_super_admin(is_admin.user_id)
  or exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = is_admin.user_id
      and cm.role in ('admin', 'admin_empresa')
      and cm.active
      and c.active
      and not p.blocked
  );
$$;

create or replace function private.has_permission(user_id uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_super_admin(has_permission.user_id)
  or exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    join public.profiles p on p.id = cm.user_id
    where cm.user_id = has_permission.user_id
      and cm.active
      and c.active
      and not p.blocked
      and (
        cm.role in ('admin', 'admin_empresa')
        or cm.permissions ? has_permission.permission_key
      )
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = has_permission.user_id
      and not p.blocked
      and p.permissions ? has_permission.permission_key
  );
$$;

create or replace function private.enforce_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.global_role is distinct from old.global_role)
    or (new.blocked is distinct from old.blocked)
    or (new.blocked_at is distinct from old.blocked_at)
    or (new.blocked_by is distinct from old.blocked_by) then
    if not private.is_super_admin(auth.uid()) then
      raise exception 'Apenas super administradores podem alterar funcoes globais ou bloqueio.';
    end if;
  end if;

  if (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions) then
    if not private.is_super_admin(auth.uid()) then
      raise exception 'Apenas super administradores podem alterar permissoes globais.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_profile_admin_fields on public.profiles;
create trigger enforce_profile_admin_fields
  before update on public.profiles
  for each row
  execute function private.enforce_profile_admin_fields();

create or replace function private.audit_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions)
    or (new.global_role is distinct from old.global_role)
    or (new.blocked is distinct from old.blocked) then
    perform private.write_audit_log(
      case
        when new.blocked is distinct from old.blocked and new.blocked then 'company_user_blocked'
        when new.blocked is distinct from old.blocked and not new.blocked then 'company_user_unblocked'
        else 'user_permissions_updated'
      end,
      tg_table_name,
      new.id::text,
      'Usuario atualizado: ' || coalesce(new.email, new.id::text),
      jsonb_build_object(
        'target_user_id', new.id,
        'target_email', new.email,
        'old_role', old.role,
        'new_role', new.role,
        'old_global_role', old.global_role,
        'new_global_role', new.global_role,
        'old_permissions', old.permissions,
        'new_permissions', new.permissions,
        'old_blocked', old.blocked,
        'new_blocked', new.blocked
      ),
      to_jsonb(old),
      to_jsonb(new),
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profile_permissions on public.profiles;
create trigger audit_profile_permissions
  after update on public.profiles
  for each row
  execute function private.audit_profile_permissions();

create or replace function private.audit_company_member_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_email text;
  log_action text;
  log_description text;
begin
  select email
  into target_email
  from public.profiles
  where id = coalesce(new.user_id, old.user_id);

  if tg_op = 'INSERT' then
    log_action := 'company_user_membership_created';
    log_description := 'Usuario vinculado a empresa: ' || coalesce(target_email, new.user_id::text);
  elsif (new.role is distinct from old.role)
    or (new.permissions is distinct from old.permissions)
    or (new.active is distinct from old.active) then
    log_action := 'company_user_membership_updated';
    log_description := 'Usuario da empresa atualizado: ' || coalesce(target_email, new.user_id::text);
  else
    return new;
  end if;

  perform private.write_audit_log(
    log_action,
    tg_table_name,
    coalesce(new.user_id, old.user_id)::text,
    log_description,
    jsonb_build_object(
      'company_id', coalesce(new.company_id, old.company_id),
      'target_user_id', coalesce(new.user_id, old.user_id),
      'target_email', target_email,
      'old_role', case when tg_op = 'UPDATE' then old.role else null end,
      'new_role', new.role,
      'old_permissions', case when tg_op = 'UPDATE' then old.permissions else null end,
      'new_permissions', new.permissions,
      'old_active', case when tg_op = 'UPDATE' then old.active else null end,
      'new_active', new.active
    ),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists audit_company_member_changes on public.company_members;
create trigger audit_company_member_changes
  after insert or update on public.company_members
  for each row
  execute function private.audit_company_member_changes();

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "admins can view managed profiles" on public.profiles;
create policy "admins can view managed profiles"
  on public.profiles
  for select
  to authenticated
  using (
    private.is_super_admin(auth.uid())
    or exists (
      select 1
      from public.company_members target_member
      where target_member.user_id = profiles.id
        and private.is_company_admin(auth.uid(), target_member.company_id)
    )
  );

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "super admins can manage profiles" on public.profiles;
create policy "super admins can manage profiles"
  on public.profiles
  for all
  to authenticated
  using (private.is_super_admin(auth.uid()))
  with check (private.is_super_admin(auth.uid()));

drop policy if exists "company members can view companies" on public.companies;
drop policy if exists "company admins can update companies" on public.companies;
drop policy if exists "company members and super admins can view companies" on public.companies;
create policy "company members and super admins can view companies"
  on public.companies
  for select
  to authenticated
  using (
    private.is_super_admin(auth.uid())
    or private.is_company_member(auth.uid(), id)
  );

drop policy if exists "super admins can insert companies" on public.companies;
create policy "super admins can insert companies"
  on public.companies
  for insert
  to authenticated
  with check (private.is_super_admin(auth.uid()));

drop policy if exists "super admins can update companies" on public.companies;
create policy "super admins can update companies"
  on public.companies
  for update
  to authenticated
  using (private.is_super_admin(auth.uid()))
  with check (private.is_super_admin(auth.uid()));

drop policy if exists "users can view company memberships" on public.company_members;
drop policy if exists "company admins can manage memberships" on public.company_members;
drop policy if exists "users and admins can view company memberships" on public.company_members;
create policy "users and admins can view company memberships"
  on public.company_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.is_super_admin(auth.uid())
    or private.is_company_admin(auth.uid(), company_id)
  );

drop policy if exists "super admins can manage company memberships" on public.company_members;
create policy "super admins can manage company memberships"
  on public.company_members
  for all
  to authenticated
  using (private.is_super_admin(auth.uid()))
  with check (private.is_super_admin(auth.uid()));

drop policy if exists "company users can view audit logs" on public.audit_logs;
drop policy if exists "super admins and company users can view audit logs" on public.audit_logs;
create policy "super admins and company users can view audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    private.is_super_admin(auth.uid())
    or private.has_company_permission(auth.uid(), company_id, 'audit_logs.view')
  );

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.companies to authenticated;
grant select, insert, update, delete on public.company_members to authenticated;
grant select on public.audit_logs to authenticated;
