create or replace function private.can_review_quotations(p_user_id uuid, p_company_id uuid)
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
    where cm.user_id = p_user_id
      and cm.company_id = p_company_id
      and cm.active
      and c.active
      and private.user_security_ready(p_user_id)
      and cm.role in ('admin', 'admin_empresa', 'gestor')
  );
$$;

create or replace function private.enforce_quotation_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not private.is_company_admin(auth.uid(), old.company_id) then
      raise exception 'Apenas administradores da empresa podem excluir cotações.';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if not private.has_company_permission(auth.uid(), new.company_id, 'quotations.create') then
      raise exception 'Usuário sem permissão para criar cotações.';
    end if;

    new.status := coalesce(new.status, 'pending');
    new.requested_by := coalesce(new.requested_by, auth.uid());

    if new.status <> 'pending' and not private.can_review_quotations(auth.uid(), new.company_id) then
      raise exception 'Apenas administradores ou gestores da empresa podem aprovar cotações.';
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
      if not private.can_review_quotations(auth.uid(), coalesce(new.company_id, old.company_id)) then
        raise exception 'Apenas administradores ou gestores da empresa podem revisar cotações.';
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

drop policy if exists "company managers can review quotations" on public.quotations;
create policy "company managers can review quotations"
  on public.quotations
  for update
  using (private.can_review_quotations(auth.uid(), company_id))
  with check (private.can_review_quotations(auth.uid(), company_id));
