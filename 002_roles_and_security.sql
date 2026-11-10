-- ============================================================================
-- 002_roles_and_security.sql
-- Logins and roles (owner / sales), shop settings, and access rules.
-- Replaces the old "anyone with the link can read and write" test policies.
-- Safe to run more than once. Run AFTER 001.
-- ============================================================================

-- ── Staff profiles ──────────────────────────────────────────────────────────
-- role: owner    = full access
--       sales    = POS, stock and customers
--       pending  = signed up, waiting for the owner to approve
--       disabled = access removed
create table if not exists public.ms_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  role        text not null default 'pending'
              check (role in ('owner', 'sales', 'pending', 'disabled')),
  created_at  timestamptz not null default now()
);

-- New sign-ups get a profile automatically. The very first account becomes
-- the owner; everyone after that waits for the owner's approval.
create or replace function public.ms_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ms_profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.ms_profiles where role = 'owner') then 'pending' else 'owner' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ms_on_auth_user_created on auth.users;
create trigger ms_on_auth_user_created
  after insert on auth.users
  for each row execute function public.ms_handle_new_user();

-- Accounts that existed before this migration get a profile too.
insert into public.ms_profiles (id, full_name, email, role)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)), u.email, 'pending'
from auth.users u
on conflict (id) do nothing;

-- If there is still no owner, the oldest account becomes the owner.
update public.ms_profiles set role = 'owner'
where id = (select id from public.ms_profiles order by created_at limit 1)
  and not exists (select 1 from public.ms_profiles where role = 'owner');

-- ── Shop settings (single row) ──────────────────────────────────────────────
create table if not exists public.ms_settings (
  id                int primary key default 1 check (id = 1),
  shop_name         text not null default 'My Supermart',
  address           text,
  phone             text,
  vat_rate          numeric(5,2) not null default 12.5,
  max_discount_pct  numeric(5,2) not null default 10,
  block_oversell    boolean not null default true,
  display_message   text not null default 'Welcome! Thank you for shopping with us.',
  receipt_footer    text not null default 'Thank you for shopping with us!',
  updated_at        timestamptz not null default now()
);
insert into public.ms_settings (id) values (1) on conflict (id) do nothing;

-- ── Role helpers used by the access rules ───────────────────────────────────
create or replace function public.ms_my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.ms_profiles where id = auth.uid()), 'none');
$$;

create or replace function public.ms_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.ms_my_role() = 'owner';
$$;

create or replace function public.ms_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.ms_my_role() in ('owner', 'sales');
$$;

-- Owner changes a staff member's role (approve, disable, promote).
create or replace function public.ms_set_staff_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can change staff roles'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role not in ('owner', 'sales', 'pending', 'disabled') then raise exception 'Unknown role %', p_role; end if;
  update public.ms_profiles set role = p_role where id = p_user_id;
end;
$$;

-- Owner renames a staff member (or anyone renames themselves).
create or replace function public.ms_set_staff_name(p_user_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() and not public.ms_is_owner() then raise exception 'Not allowed'; end if;
  update public.ms_profiles set full_name = nullif(trim(p_name), '') where id = p_user_id;
end;
$$;

-- ── Turn on Row Level Security and remove every old policy ──────────────────
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'ms_products', 'ms_inventory', 'ms_customers', 'ms_suppliers', 'ms_transactions',
    'ms_transaction_items', 'ms_expenses', 'ms_product_removals', 'ms_stock_movements',
    'ms_profiles', 'ms_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- Logged-out visitors get nothing.
revoke all on
  public.ms_products, public.ms_inventory, public.ms_customers, public.ms_suppliers,
  public.ms_transactions, public.ms_transaction_items, public.ms_expenses,
  public.ms_product_removals, public.ms_stock_movements, public.ms_profiles, public.ms_settings
from anon;

-- ── Access rules ────────────────────────────────────────────────────────────
-- Profiles: you see your own; the owner sees everyone. Changes go through functions.
create policy profiles_read on public.ms_profiles for select to authenticated
  using (id = auth.uid() or public.ms_is_owner());

-- Settings: any signed-in user can read; only the owner can change.
create policy settings_read on public.ms_settings for select to authenticated using (true);
create policy settings_owner_update on public.ms_settings for update to authenticated
  using (public.ms_is_owner()) with check (public.ms_is_owner());

-- Products: staff read, add and edit; only the owner deletes (removal goes through ms_remove_product).
create policy products_read on public.ms_products for select to authenticated using (public.ms_is_staff());
create policy products_insert on public.ms_products for insert to authenticated with check (public.ms_is_staff());
create policy products_update on public.ms_products for update to authenticated
  using (public.ms_is_staff()) with check (public.ms_is_staff());
create policy products_delete on public.ms_products for delete to authenticated using (public.ms_is_owner());

-- Inventory: staff read and edit details. Stock numbers only change through
-- ms_adjust_stock / ms_checkout so every change is logged.
create policy inventory_read on public.ms_inventory for select to authenticated using (public.ms_is_staff());
create policy inventory_insert on public.ms_inventory for insert to authenticated with check (public.ms_is_staff());
create policy inventory_update on public.ms_inventory for update to authenticated
  using (public.ms_is_staff()) with check (public.ms_is_staff());
revoke update on public.ms_inventory from authenticated;
grant update (reorder_level, expiry_date, supplier, updated_at) on public.ms_inventory to authenticated;

-- Customers: staff read, add and edit; only the owner deletes.
create policy customers_read on public.ms_customers for select to authenticated using (public.ms_is_staff());
create policy customers_insert on public.ms_customers for insert to authenticated with check (public.ms_is_staff());
create policy customers_update on public.ms_customers for update to authenticated
  using (public.ms_is_staff()) with check (public.ms_is_staff());
create policy customers_delete on public.ms_customers for delete to authenticated using (public.ms_is_owner());
-- Loyalty totals are only changed by checkout/refund.
revoke update on public.ms_customers from authenticated;
grant update (name, customer_code, phone, email) on public.ms_customers to authenticated;

-- Suppliers: staff can read the list; only the owner manages it.
create policy suppliers_read on public.ms_suppliers for select to authenticated using (public.ms_is_staff());
create policy suppliers_owner_write on public.ms_suppliers for all to authenticated
  using (public.ms_is_owner()) with check (public.ms_is_owner());

-- Sales: the owner sees all sales; a salesperson sees only their own.
-- Sales are created and refunded only through ms_checkout / ms_refund.
create policy transactions_read on public.ms_transactions for select to authenticated
  using (public.ms_is_owner() or (public.ms_is_staff() and cashier_id = auth.uid()));
create policy transaction_items_read on public.ms_transaction_items for select to authenticated
  using (exists (
    select 1 from public.ms_transactions t
    where t.id = transaction_id
      and (public.ms_is_owner() or (public.ms_is_staff() and t.cashier_id = auth.uid()))
  ));

-- Owner only.
create policy expenses_owner on public.ms_expenses for all to authenticated
  using (public.ms_is_owner()) with check (public.ms_is_owner());
create policy removals_owner_read on public.ms_product_removals for select to authenticated
  using (public.ms_is_owner());
create policy movements_owner_read on public.ms_stock_movements for select to authenticated
  using (public.ms_is_owner());

revoke execute on function public.ms_set_staff_role(uuid, text) from public, anon;
revoke execute on function public.ms_set_staff_name(uuid, text) from public, anon;
grant execute on function public.ms_set_staff_role(uuid, text) to authenticated;
grant execute on function public.ms_set_staff_name(uuid, text) to authenticated;
