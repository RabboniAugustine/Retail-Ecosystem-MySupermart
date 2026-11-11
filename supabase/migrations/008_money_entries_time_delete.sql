-- ============================================================================
-- 008_money_entries_time_delete.sql
-- Money in / out entries (transfers, money in, money out):
--   * record the exact date AND time,
--   * the owner can delete a wrong entry (both sides of a transfer together);
--     a copy is kept in ms_deleted_records with who deleted it and why,
--   * the account statement shows the time of each entry.
-- Safe to run more than once. Run AFTER 007.
-- ============================================================================

-- Links the two lines of a transfer (and gives every manual entry an id to delete by).
alter table public.ms_money_movements add column if not exists entry_group uuid;

-- Existing manual entries: a transfer's two lines were written at the same moment.
with t as (
  select created_at, created_by, abs(amount) as amt, gen_random_uuid() as g
  from public.ms_money_movements
  where kind = 'transfer' and entry_group is null
  group by created_at, created_by, abs(amount)
)
update public.ms_money_movements m set entry_group = t.g
from t
where m.kind = 'transfer' and m.entry_group is null
  and m.created_at = t.created_at and m.created_by is not distinct from t.created_by and abs(m.amount) = t.amt;

update public.ms_money_movements set entry_group = gen_random_uuid()
where kind in ('money_in', 'money_out', 'transfer') and entry_group is null;

-- Record a manual entry at a given date and time (replaces the date-only version).
drop function if exists public.ms_money_entry(text, numeric, text, text, text, date);

create or replace function public.ms_money_entry(
  p_kind text, p_amount numeric, p_from text, p_to text, p_description text,
  p_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_at    timestamptz := coalesce(p_at, now());
  v_desc  text := nullif(trim(p_description), '');
  v_group uuid := gen_random_uuid();
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can record money movements'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'The date and time cannot be in the future'; end if;
  select full_name into v_name from public.ms_profiles where id = auth.uid();

  if p_kind = 'transfer' then
    if p_from is null or p_to is null or p_from = p_to then raise exception 'Choose two different accounts'; end if;
    insert into public.ms_money_movements (account, amount, kind, description, occurred_at, created_by, created_by_name, entry_group) values
      (p_from, -p_amount, 'transfer', coalesce(v_desc, 'Transfer to ' || p_to), v_at, auth.uid(), v_name, v_group),
      (p_to, p_amount, 'transfer', coalesce(v_desc, 'Transfer from ' || p_from), v_at, auth.uid(), v_name, v_group);
  elsif p_kind = 'money_in' then
    if p_to is null then raise exception 'Choose the account'; end if;
    insert into public.ms_money_movements (account, amount, kind, description, occurred_at, created_by, created_by_name, entry_group)
    values (p_to, p_amount, 'money_in', coalesce(v_desc, 'Money in'), v_at, auth.uid(), v_name, v_group);
  elsif p_kind = 'money_out' then
    if p_from is null then raise exception 'Choose the account'; end if;
    insert into public.ms_money_movements (account, amount, kind, description, occurred_at, created_by, created_by_name, entry_group)
    values (p_from, -p_amount, 'money_out', coalesce(v_desc, 'Money out'), v_at, auth.uid(), v_name, v_group);
  else
    raise exception 'Unknown entry type %', p_kind;
  end if;
  return v_group;
end;
$$;

-- Owner deletes a wrong manual entry. Sales, refunds, purchases and expenses are
-- not deleted here; they have their own delete / void / refund actions.
create or replace function public.ms_delete_money_entry(p_group uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_name text;
  v_amt  numeric;
  v_desc text;
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can delete money entries'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason for deleting this entry'; end if;

  select jsonb_agg(to_jsonb(m) order by m.amount), max(abs(m.amount)), min(m.description)
  into v_rows, v_amt, v_desc
  from public.ms_money_movements m
  where m.entry_group = p_group and m.kind in ('transfer', 'money_in', 'money_out');
  if v_rows is null then raise exception 'Entry not found (it may already have been deleted)'; end if;

  select full_name into v_name from public.ms_profiles where id = auth.uid();
  insert into public.ms_deleted_records (record_type, record_code, amount, reason, snapshot, deleted_by, deleted_by_name)
  values ('money', v_desc, v_amt, trim(p_reason), jsonb_build_object('lines', v_rows), auth.uid(), v_name);

  delete from public.ms_money_movements where entry_group = p_group and kind in ('transfer', 'money_in', 'money_out');
end;
$$;

-- Account statement: same as before, plus the time ('at') of each line.
create or replace function public.ms_report_statement(p_account text, p_from date, p_to date, p_tz text default 'Africa/Accra')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_open numeric; v_lines jsonb;
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can view reports'; end if;
  select coalesce(sum(amount), 0) into v_open from public.ms_money_movements
  where account = p_account and (occurred_at at time zone p_tz)::date < p_from;

  with m as (
    select * from public.ms_money_movements
    where account = p_account and (occurred_at at time zone p_tz)::date between p_from and p_to
  ), lines as (
    select (occurred_at at time zone p_tz)::date as day, min(occurred_at) as at,
      'Sales (' || count(*) || ')' as description, sum(amount) as amount, 'sale' as kind
    from m where kind = 'sale' group by 1
    union all
    select (occurred_at at time zone p_tz)::date, occurred_at, description, amount, kind
    from m where kind <> 'sale'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', day, 'at', at, 'description', description, 'kind', kind,
      'money_in', case when amount > 0 then amount else 0 end,
      'money_out', case when amount < 0 then -amount else 0 end) order by day, (kind <> 'sale'), at), '[]'::jsonb)
  into v_lines from lines;

  return jsonb_build_object('opening', v_open, 'lines', v_lines,
    'closing', v_open + coalesce((select sum(amount) from public.ms_money_movements
      where account = p_account and (occurred_at at time zone p_tz)::date between p_from and p_to), 0));
end;
$$;

revoke execute on function public.ms_money_entry(text, numeric, text, text, text, timestamptz) from public, anon;
revoke execute on function public.ms_delete_money_entry(uuid, text) from public, anon;
grant execute on function public.ms_money_entry(text, numeric, text, text, text, timestamptz) to authenticated;
grant execute on function public.ms_delete_money_entry(uuid, text) to authenticated;

notify pgrst, 'reload schema';
