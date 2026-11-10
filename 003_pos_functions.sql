-- ============================================================================
-- 003_pos_functions.sql
-- Database functions the app calls: checkout, refunds, stock changes,
-- adding and removing products. Each runs as one transaction: if anything
-- fails, nothing is saved. Safe to run more than once. Run AFTER 002.
-- ============================================================================

-- Remove older versions of these functions (whatever their arguments were).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ms_checkout', 'ms_remove_product', 'ms_adjust_stock', 'ms_refund', 'ms_create_product', 'ms_tier')
  loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;

-- Loyalty tier from lifetime spend (₵).
create function public.ms_tier(p_spent numeric)
returns text language sql immutable as $$
  select case
    when p_spent >= 10000 then 'Platinum'
    when p_spent >= 5000  then 'Gold'
    when p_spent >= 1500  then 'Silver'
    else 'Bronze' end;
$$;

-- ── Checkout ────────────────────────────────────────────────────────────────
-- Prices, VAT and totals are worked out here from the database, never trusted
-- from the browser. Salespeople cannot give more discount than the owner's limit.
-- p_items: [{"product_id": 1, "quantity": 2}, ...]
create function public.ms_checkout(
  p_items           jsonb,
  p_customer_id     bigint  default null,
  p_discount_pct    numeric default 0,
  p_payment_method  text    default 'Cash',
  p_amount_tendered numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.ms_my_role();
  v_settings  public.ms_settings;
  v_name      text;
  v_txn_id    bigint;
  v_code      text;
  v_line      record;
  v_prod      record;
  v_subtotal  numeric := 0;
  v_discount  numeric;
  v_tax       numeric;
  v_total     numeric;
  v_change    numeric;
  v_points    integer := 0;
  v_cust      public.ms_customers;
  v_new_spent numeric;
  v_created   timestamptz;
begin
  if v_role not in ('owner', 'sales') then
    raise exception 'You are not allowed to make sales';
  end if;

  select * into v_settings from public.ms_settings where id = 1;
  select full_name into v_name from public.ms_profiles where id = auth.uid();

  p_discount_pct := coalesce(p_discount_pct, 0);
  if p_discount_pct < 0 or p_discount_pct > 100 then
    raise exception 'Discount must be between 0 and 100%%';
  end if;
  if v_role = 'sales' and p_discount_pct > v_settings.max_discount_pct then
    raise exception 'Discount is above your limit of %', v_settings.max_discount_pct || '%';
  end if;
  if p_payment_method not in ('Cash', 'Card', 'Mobile Money') then
    raise exception 'Unknown payment method %', p_payment_method;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The cart is empty';
  end if;

  insert into public.ms_transactions (txn_code, customer_id, payment_method, status, cashier_id, cashier_name, discount_pct)
  values ('TMP-' || gen_random_uuid(), p_customer_id, p_payment_method, 'Completed', auth.uid(), v_name, p_discount_pct)
  returning id, created_at into v_txn_id, v_created;

  v_code := 'TXN-' || to_char(v_created at time zone 'UTC', 'YYMMDD') || '-' || lpad(v_txn_id::text, 5, '0');

  -- Same product sent twice is merged into one line.
  for v_line in
    select (e->>'product_id')::bigint as product_id, sum((e->>'quantity')::int) as qty
    from jsonb_array_elements(p_items) e
    group by 1
  loop
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Quantities must be at least 1';
    end if;

    select p.id, p.name, p.price, p.cost, i.stock into v_prod
    from public.ms_products p
    join public.ms_inventory i on i.product_id = p.id
    where p.id = v_line.product_id and p.active
    for update of i;

    if not found then
      raise exception 'A product in the cart is no longer available';
    end if;
    if v_settings.block_oversell and v_prod.stock < v_line.qty then
      raise exception 'Only % of "%" left in stock', v_prod.stock, v_prod.name;
    end if;

    insert into public.ms_transaction_items (transaction_id, product_id, product_name, quantity, unit_price, unit_cost, line_total)
    values (v_txn_id, v_prod.id, v_prod.name, v_line.qty, v_prod.price, v_prod.cost, round(v_prod.price * v_line.qty, 2));

    update public.ms_inventory
    set stock = greatest(0, stock - v_line.qty), updated_at = now()
    where product_id = v_prod.id;

    v_subtotal := v_subtotal + round(v_prod.price * v_line.qty, 2);
  end loop;

  v_discount := round(v_subtotal * p_discount_pct / 100, 2);
  v_tax      := round((v_subtotal - v_discount) * v_settings.vat_rate / 100, 2);
  v_total    := v_subtotal - v_discount + v_tax;

  if p_payment_method = 'Cash' and p_amount_tendered is not null then
    if p_amount_tendered < v_total then
      raise exception 'Cash received (₵%) is less than the total (₵%)', p_amount_tendered, v_total;
    end if;
    v_change := p_amount_tendered - v_total;
  end if;

  if p_customer_id is not null then
    select * into v_cust from public.ms_customers where id = p_customer_id for update;
    if not found then raise exception 'Customer not found'; end if;
    v_points    := floor(v_total)::int;   -- 1 point per ₵1
    v_new_spent := v_cust.total_spent + v_total;
    update public.ms_customers set
      total_spent = v_new_spent,
      visit_count = visit_count + 1,
      points      = points + v_points,
      tier        = public.ms_tier(v_new_spent),
      last_visit  = current_date
    where id = p_customer_id;
  end if;

  update public.ms_transactions set
    txn_code        = v_code,
    subtotal        = v_subtotal,
    discount_amount = v_discount,
    tax             = v_tax,
    total           = v_total,
    amount_tendered = case when p_payment_method = 'Cash' then p_amount_tendered end,
    change_due      = v_change,
    points_earned   = v_points
  where id = v_txn_id;

  return jsonb_build_object(
    'id', v_txn_id, 'txn_code', v_code, 'created_at', v_created,
    'subtotal', v_subtotal, 'discount_pct', p_discount_pct, 'discount_amount', v_discount,
    'tax', v_tax, 'vat_rate', v_settings.vat_rate, 'total', v_total,
    'payment_method', p_payment_method, 'amount_tendered', p_amount_tendered, 'change_due', v_change,
    'points_earned', v_points,
    'customer_points', case when p_customer_id is not null then v_cust.points + v_points end,
    'cashier_name', v_name
  );
end;
$$;

-- ── Refund a whole sale (owner only) ────────────────────────────────────────
-- Puts the items back in stock and takes back the customer's points.
create function public.ms_refund(p_txn_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn   public.ms_transactions;
  v_item  record;
  v_old   integer;
  v_name  text;
  v_spent numeric;
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can refund sales'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason for the refund'; end if;

  select * into v_txn from public.ms_transactions where id = p_txn_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_txn.status = 'Refunded' then raise exception 'This sale was already refunded'; end if;

  select full_name into v_name from public.ms_profiles where id = auth.uid();

  for v_item in
    select ti.product_id, ti.quantity, coalesce(ti.product_name, p.name) as name
    from public.ms_transaction_items ti
    left join public.ms_products p on p.id = ti.product_id
    where ti.transaction_id = p_txn_id and ti.product_id is not null
  loop
    select stock into v_old from public.ms_inventory where product_id = v_item.product_id for update;
    if found then
      update public.ms_inventory set stock = stock + v_item.quantity, updated_at = now()
      where product_id = v_item.product_id;
      insert into public.ms_stock_movements (product_id, product_name, old_stock, new_stock, change, reason, created_by, created_by_name)
      values (v_item.product_id, v_item.name, v_old, v_old + v_item.quantity, v_item.quantity,
              'Refund ' || coalesce(v_txn.txn_code, '#' || v_txn.id), auth.uid(), v_name);
    end if;
  end loop;

  if v_txn.customer_id is not null then
    select greatest(0, total_spent - v_txn.total) into v_spent from public.ms_customers where id = v_txn.customer_id;
    update public.ms_customers set
      total_spent = v_spent,
      points      = greatest(0, points - coalesce(v_txn.points_earned, floor(v_txn.total)::int)),
      tier        = public.ms_tier(v_spent)
    where id = v_txn.customer_id;
  end if;

  update public.ms_transactions set
    status = 'Refunded', refunded_at = now(), refunded_by = auth.uid(), refund_reason = trim(p_reason)
  where id = p_txn_id;
end;
$$;

-- ── Change stock (staff) ────────────────────────────────────────────────────
-- p_mode 'add' = receive/add units (negative to take away), 'set' = stock count.
create function public.ms_adjust_stock(p_product_id bigint, p_quantity integer, p_mode text, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old  integer;
  v_new  integer;
  v_name text;
  v_prod text;
begin
  if not public.ms_is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason for the stock change'; end if;

  select i.stock, p.name into v_old, v_prod
  from public.ms_inventory i join public.ms_products p on p.id = i.product_id
  where i.product_id = p_product_id
  for update of i;
  if not found then raise exception 'Product not found'; end if;

  v_new := case when p_mode = 'set' then p_quantity else v_old + p_quantity end;
  if v_new < 0 then raise exception 'Stock cannot go below zero'; end if;
  if v_new = v_old then return v_new; end if;

  select full_name into v_name from public.ms_profiles where id = auth.uid();

  update public.ms_inventory set stock = v_new, updated_at = now() where product_id = p_product_id;
  insert into public.ms_stock_movements (product_id, product_name, old_stock, new_stock, change, reason, created_by, created_by_name)
  values (p_product_id, v_prod, v_old, v_new, v_new - v_old, trim(p_reason), auth.uid(), v_name);
  return v_new;
end;
$$;

-- ── Add a product with its opening stock (staff) ────────────────────────────
create function public.ms_create_product(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint;
  v_stock integer := greatest(0, coalesce((p->>'stock')::int, 0));
  v_name  text;
begin
  if not public.ms_is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Product name is required'; end if;

  insert into public.ms_products (name, sku, barcode, category, price, cost)
  values (
    trim(p->>'name'), nullif(trim(p->>'sku'), ''), nullif(trim(p->>'barcode'), ''),
    coalesce(nullif(p->>'category', ''), 'Other'),
    coalesce((p->>'price')::numeric, 0), coalesce((p->>'cost')::numeric, 0)
  )
  returning id into v_id;

  insert into public.ms_inventory (product_id, stock, reorder_level, expiry_date, supplier)
  values (v_id, v_stock, greatest(0, coalesce((p->>'reorder_level')::int, 0)),
          nullif(p->>'expiry_date', '')::date, nullif(trim(p->>'supplier'), ''));

  if v_stock > 0 then
    select full_name into v_name from public.ms_profiles where id = auth.uid();
    insert into public.ms_stock_movements (product_id, product_name, old_stock, new_stock, change, reason, created_by, created_by_name)
    values (v_id, trim(p->>'name'), 0, v_stock, v_stock, 'Opening stock', auth.uid(), v_name);
  end if;
  return v_id;
end;
$$;

-- ── Remove a product (owner only) ───────────────────────────────────────────
-- The product is hidden, not deleted, so past sales and reports stay correct.
create function public.ms_remove_product(p_product_id bigint, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod  public.ms_products;
  v_stock integer;
  v_name  text;
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can remove products'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please choose a reason'; end if;

  select * into v_prod from public.ms_products where id = p_product_id and active for update;
  if not found then raise exception 'Product not found'; end if;
  select coalesce(stock, 0) into v_stock from public.ms_inventory where product_id = p_product_id for update;
  v_stock := coalesce(v_stock, 0);
  select full_name into v_name from public.ms_profiles where id = auth.uid();

  insert into public.ms_product_removals (product_id, product_name, sku, quantity, unit_cost, loss_value, reason, note, removed_by, removed_by_name)
  values (v_prod.id, v_prod.name, v_prod.sku, v_stock, v_prod.cost, round(v_stock * v_prod.cost, 2),
          trim(p_reason), nullif(trim(p_note), ''), auth.uid(), v_name);

  if v_stock > 0 then
    insert into public.ms_stock_movements (product_id, product_name, old_stock, new_stock, change, reason, created_by, created_by_name)
    values (v_prod.id, v_prod.name, v_stock, 0, -v_stock, 'Removed: ' || trim(p_reason), auth.uid(), v_name);
  end if;

  update public.ms_inventory set stock = 0, updated_at = now() where product_id = p_product_id;
  -- Free the SKU and barcode so they can be reused by a new product.
  update public.ms_products set
    active  = false,
    sku     = case when sku is null then null else sku || '~removed-' || id end,
    barcode = null
  where id = p_product_id;
end;
$$;

-- Only signed-in users can call these (each one checks the role itself).
revoke execute on function public.ms_checkout(jsonb, bigint, numeric, text, numeric) from public, anon;
revoke execute on function public.ms_refund(bigint, text) from public, anon;
revoke execute on function public.ms_adjust_stock(bigint, integer, text, text) from public, anon;
revoke execute on function public.ms_create_product(jsonb) from public, anon;
revoke execute on function public.ms_remove_product(bigint, text, text) from public, anon;
grant execute on function public.ms_checkout(jsonb, bigint, numeric, text, numeric) to authenticated;
grant execute on function public.ms_refund(bigint, text) to authenticated;
grant execute on function public.ms_adjust_stock(bigint, integer, text, text) to authenticated;
grant execute on function public.ms_create_product(jsonb) to authenticated;
grant execute on function public.ms_remove_product(bigint, text, text) to authenticated;
