do $$
declare
  bdm_company_id uuid;
  scoped_table text;
begin
  select id
  into bdm_company_id
  from public.companies
  where lower(name) in ('bdm', 'bdm insumos')
  order by
    case when lower(name) = 'bdm' then 0 else 1 end,
    created_at,
    id
  limit 1;

  if bdm_company_id is null then
    insert into public.companies (name, active)
    values ('BDM', true)
    returning id into bdm_company_id;
  else
    update public.companies
    set name = 'BDM',
        active = true
    where id = bdm_company_id;
  end if;

  insert into public.company_members (company_id, user_id, role, permissions, active)
  select
    bdm_company_id,
    profiles.id,
    profiles.role,
    coalesce(profiles.permissions, '[]'::jsonb),
    true
  from public.profiles
  on conflict (company_id, user_id) do update
    set active = true;

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

    execute format('alter table public.%I disable trigger user', scoped_table);

    execute format(
      'update public.%I set company_id = $1 where company_id is distinct from $1',
      scoped_table
    )
    using bdm_company_id;

    execute format('alter table public.%I alter column company_id set not null', scoped_table);
    execute format('alter table public.%I enable trigger user', scoped_table);
  end loop;
end;
$$;
