alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_change_required_at timestamptz,
  add column if not exists password_changed_at timestamptz,
  add column if not exists first_login_completed_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists last_login_at timestamptz;

comment on column public.profiles.must_change_password
  is 'Forca o usuario a trocar a senha antes de acessar telas operacionais.';
comment on column public.profiles.password_change_required_at
  is 'Data em que a troca obrigatoria de senha foi solicitada.';
comment on column public.profiles.password_changed_at
  is 'Data da ultima troca de senha registrada pelo sistema.';
comment on column public.profiles.first_login_completed_at
  is 'Data em que o primeiro acesso seguro foi concluido.';
comment on column public.profiles.invited_at
  is 'Data do ultimo convite de acesso enviado pelo sistema.';
comment on column public.profiles.last_login_at
  is 'Data do ultimo login registrado pela aplicacao.';

create index if not exists profiles_must_change_password_idx
  on public.profiles(must_change_password);

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
      and not coalesce(p.must_change_password, false)
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
        and not coalesce(p.must_change_password, false)
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
      and not coalesce(p.must_change_password, false)
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
      and not coalesce(p.must_change_password, false)
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
      and not coalesce(p.must_change_password, false)
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
      and not coalesce(p.must_change_password, false)
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
      and not coalesce(p.must_change_password, false)
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
      and not coalesce(p.must_change_password, false)
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

  if (new.must_change_password is distinct from old.must_change_password)
    or (new.password_change_required_at is distinct from old.password_change_required_at)
    or (new.password_changed_at is distinct from old.password_changed_at)
    or (new.first_login_completed_at is distinct from old.first_login_completed_at)
    or (new.invited_at is distinct from old.invited_at)
    or (new.last_login_at is distinct from old.last_login_at) then
    raise exception 'Campos de seguranca do usuario sao gerenciados pelo sistema.';
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
