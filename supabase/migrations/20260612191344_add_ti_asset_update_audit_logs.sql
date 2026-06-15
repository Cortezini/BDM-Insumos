create or replace function private.audit_ti_asset_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  asset_summary text;
  changed_fields text[];
begin
  if tg_op = 'INSERT' then
    asset_summary := coalesce(
      nullif(new.name, ''),
      nullif(new.patrimony_tag, ''),
      nullif(new.serial_number, ''),
      new.id::text,
      'ativo'
    );

    perform private.write_audit_log(
      'asset_created',
      tg_table_name,
      new.id::text,
      'Ativo de TI cadastrado: ' || asset_summary,
      jsonb_build_object(
        'entity', 'Ativo de TI',
        'summary', asset_summary,
        'asset_id', new.id
      ),
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

    asset_summary := coalesce(
      nullif(new.name, ''),
      nullif(old.name, ''),
      nullif(new.patrimony_tag, ''),
      nullif(old.patrimony_tag, ''),
      nullif(new.serial_number, ''),
      nullif(old.serial_number, ''),
      new.id::text,
      'ativo'
    );

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

  return new;
end;
$$;

drop trigger if exists audit_ti_assets_created on public.ti_assets;
drop trigger if exists audit_ti_asset_changes on public.ti_assets;

create trigger audit_ti_asset_changes
  after insert or update on public.ti_assets
  for each row
  execute function private.audit_ti_asset_changes();
