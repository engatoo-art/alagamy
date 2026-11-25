-- =====================================================================
--  العجمي للخضروات والفاكهة — قاعدة البيانات الكاملة
--  الصق الملف ده كله في Supabase ← SQL Editor ← Run
--  (آمن تشغيله أكتر من مرة)
-- =====================================================================

set check_function_bodies = off;

create or replace function public.cairo_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Cairo')::date $$;

-- ============================ الجداول ================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  role text not null default 'accountant' check (role in ('admin','accountant')),
  active boolean not null default false,
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default 'العجمي للخضروات والفاكهة',
  phone text not null default '',
  address text not null default '',
  default_commission numeric(5,2) not null default 10,
  receipt_footer text not null default 'شكرًا لتعاملكم معنا',
  updated_at timestamptz not null default now()
);
insert into public.shop_settings(id) values (1) on conflict do nothing;
alter table public.shop_settings add column if not exists invoice_title text not null
  default 'محلات عبده العجمي وأولاده (محمد وعبدالرحمن)';

create table if not exists public.crate_types (
  id serial primary key,
  name text not null unique,
  deposit numeric(12,2) not null default 0 check (deposit >= 0),
  active boolean not null default true
);
-- الأنواع الافتراضية بتتضاف أول مرة بس
insert into public.crate_types(name, deposit)
select * from (values ('صندوق بلاستيك كبير', 50), ('صندوق بلاستيك صغير', 30), ('صندوق خشب (بدون رهن)', 0)) v(name, deposit)
where not exists (select 1 from public.crate_types);

create table if not exists public.items (
  id serial primary key,
  name text not null unique,
  default_unit text not null default 'kg' check (default_unit in ('kg','count')),
  active boolean not null default true
);

create table if not exists public.suppliers (
  id serial primary key,
  name text not null,
  phone text not null default '',
  commission_pct numeric(5,2) not null default 10 check (commission_pct between 0 and 100),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id serial primary key,
  name text not null,
  phone text not null default '',
  address text not null default '',
  credit_approved boolean not null default false,
  credit_requested boolean not null default false,
  credit_limit numeric(14,2) not null default 0,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.customers add column if not exists guarantor text not null default '';
alter table public.customers add column if not exists rating_pay int not null default 0 check (rating_pay between 0 and 5);
alter table public.customers add column if not exists rating_general int not null default 0 check (rating_general between 0 and 5);
alter table public.customers add column if not exists rating_note text not null default '';

create sequence if not exists public.settlement_no_seq;
create table if not exists public.settlements (
  id serial primary key,
  settle_no int not null unique default nextval('public.settlement_no_seq'),
  supplier_id int not null references public.suppliers(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  total_qty_in numeric(14,2) not null default 0,
  total_qty numeric(14,2) not null default 0,
  total_weight numeric(14,3) not null default 0,
  gross_sales numeric(14,2) not null default 0,
  commission_pct numeric(5,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  freight numeric(14,2) not null default 0,
  unloading numeric(14,2) not null default 0,
  other_expenses numeric(14,2) not null default 0,
  other_label text not null default '',
  net_amount numeric(14,2) not null default 0,
  details jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  reject_reason text not null default '',
  paid_by uuid references public.profiles(id),
  paid_at timestamptz,
  notes text not null default ''
);

create table if not exists public.shipments (
  id serial primary key,
  supplier_id int not null references public.suppliers(id),
  ship_date date not null default public.cairo_today(),
  truck text not null default '',
  driver text not null default '',
  freight numeric(14,2) not null default 0,
  unloading numeric(14,2) not null default 0,
  other_expenses numeric(14,2) not null default 0,
  notes text not null default '',
  settlement_id int references public.settlements(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.shipment_items (
  id serial primary key,
  shipment_id int not null references public.shipments(id) on delete cascade,
  item_id int not null references public.items(id),
  qty numeric(12,2) not null check (qty > 0),
  notes text not null default ''
);

create sequence if not exists public.sale_no_seq;
create table if not exists public.sales (
  id serial primary key,
  sale_no int unique,
  sale_date date not null default public.cairo_today(),
  created_at timestamptz not null default now(),
  customer_id int references public.customers(id),
  customer_name text not null default '',
  payment_type text not null check (payment_type in ('cash','credit')),
  goods_total numeric(14,2) not null default 0,
  deposit_total numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required','pending','approved','rejected')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  reject_reason text not null default '',
  voided boolean not null default false,
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  void_reason text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id)
);

create table if not exists public.sale_lines (
  id serial primary key,
  sale_id int not null references public.sales(id) on delete cascade,
  shipment_item_id int references public.shipment_items(id),
  item_id int not null references public.items(id),
  unit text not null check (unit in ('kg','count')),
  qty numeric(12,2) not null default 0,
  weight numeric(12,3) not null default 0,
  price numeric(12,2) not null default 0,
  amount numeric(14,2) not null default 0,
  crate_type_id int references public.crate_types(id),
  crates int not null default 0,
  deposit_unit numeric(12,2) not null default 0,
  deposit_amount numeric(14,2) not null default 0
);

create table if not exists public.customer_payments (
  id serial primary key,
  pay_date date not null default public.cairo_today(),
  created_at timestamptz not null default now(),
  customer_id int not null references public.customers(id),
  amount numeric(14,2) not null check (amount > 0),
  notes text not null default '',
  voided boolean not null default false,
  created_by uuid references public.profiles(id)
);

create table if not exists public.crate_returns (
  id serial primary key,
  return_date date not null default public.cairo_today(),
  created_at timestamptz not null default now(),
  customer_id int not null references public.customers(id),
  crate_type_id int not null references public.crate_types(id),
  count int not null check (count > 0),
  unit_deposit numeric(12,2) not null default 0,
  amount numeric(14,2) not null default 0,
  method text not null check (method in ('cash','account')),
  notes text not null default '',
  created_by uuid references public.profiles(id)
);

create table if not exists public.cash_movements (
  id serial primary key,
  mv_date date not null default public.cairo_today(),
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  description text not null default '',
  party text not null default '',
  ref_type text not null default '',
  ref_id int,
  created_by uuid references public.profiles(id)
);

-- عهدة كل محاسب: بتتفتح وتتقفل، والعهدة اللي بعدها بتبدأ بنفس الفلوس
create table if not exists public.cash_shifts (
  id serial primary key,
  user_id uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  opening_amount numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  total_in numeric(14,2) not null default 0,
  total_out numeric(14,2) not null default 0,
  expected_amount numeric(14,2) not null default 0,
  counted_amount numeric(14,2),
  difference numeric(14,2) not null default 0,
  notes text not null default ''
);
create unique index if not exists ux_one_open_shift on public.cash_shifts((true)) where status = 'open';
alter table public.cash_movements add column if not exists shift_id int references public.cash_shifts(id);
create index if not exists ix_cash_shift on public.cash_movements(shift_id);

create index if not exists ix_sales_date on public.sales(sale_date);
create index if not exists ix_sales_customer on public.sales(customer_id);
create index if not exists ix_lines_sale on public.sale_lines(sale_id);
create index if not exists ix_lines_shipitem on public.sale_lines(shipment_item_id);
create index if not exists ix_shipitems_ship on public.shipment_items(shipment_id);
create index if not exists ix_ship_supplier on public.shipments(supplier_id);
create index if not exists ix_pay_customer on public.customer_payments(customer_id);
create index if not exists ix_ret_customer on public.crate_returns(customer_id);
create index if not exists ix_cash_date on public.cash_movements(mv_date);

-- ========================= أدوات مساعدة ==============================

create or replace function public._n(p jsonb, k text, d numeric default 0) returns numeric
language sql immutable as $$ select coalesce(nullif(trim(p->>k), '')::numeric, d) $$;

create or replace function public._i(p jsonb, k text) returns int
language sql immutable as $$ select nullif(trim(p->>k), '')::int $$;

create or replace function public._t(p jsonb, k text) returns text
language sql immutable as $$ select coalesce(trim(p->>k), '') $$;

create or replace function public._d(p jsonb, k text, d date default null) returns date
language sql stable as $$ select coalesce(nullif(trim(p->>k), '')::date, d, public.cairo_today()) $$;

create or replace function public._has(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select active and (role = 'admin' or coalesce((perms->>perm)::boolean, false))
    from profiles where id = auth.uid()), false)
$$;

-- بتبقى true بس جوه تنفيذ طلب وافق عليه المدير
create or replace function public._approved_run() returns boolean
language sql stable as $$ select coalesce(current_setting('app.approved_run', true), '') = '1' $$;

create or replace function public._need(perm text default null) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'لازم تسجل دخول الأول';
  end if;
  if not exists (select 1 from profiles where id = auth.uid() and active) then
    raise exception 'حسابك لسه مش متفعل — كلم المدير';
  end if;
  if perm is not null and not public._has(perm) and not public._approved_run() then
    raise exception 'مش عندك صلاحية للعملية دي';
  end if;
end $$;

create or replace function public._need_any(perms text[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare x text;
begin
  perform public._need(null);
  if public._approved_run() then return; end if;
  foreach x in array perms loop
    if public._has(x) then return; end if;
  end loop;
  raise exception 'مش عندك صلاحية للعملية دي';
end $$;

create or replace function public._uname(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), username) from profiles where id = uid
$$;

create or replace function public._customer_balance(cid int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(grand_total - paid_amount) from sales where customer_id = cid and not voided), 0)
       - coalesce((select sum(amount) from customer_payments where customer_id = cid and not voided), 0)
       - coalesce((select sum(amount) from crate_returns where customer_id = cid and method = 'account'), 0)
$$;

create or replace function public._customer_crates(cid int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'crate_type_id', ct.id, 'name', ct.name, 'deposit', ct.deposit, 'count', g.cnt
         ) order by ct.name), '[]'::jsonb)
  from (
    select crate_type_id, sum(given) - sum(ret) as cnt from (
      select l.crate_type_id, l.crates as given, 0 as ret
        from sale_lines l join sales s on s.id = l.sale_id
       where s.customer_id = cid and not s.voided and l.crates > 0 and l.deposit_unit > 0
      union all
      select crate_type_id, 0, count from crate_returns where customer_id = cid
    ) x group by crate_type_id having sum(given) - sum(ret) <> 0
  ) g join crate_types ct on ct.id = g.crate_type_id
$$;

create or replace function public._cash_balance(upto date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
  from cash_movements where mv_date <= upto
$$;

create or replace function public._open_shift_for_me() returns int
language plpgsql security definer set search_path = public as $$
declare sh cash_shifts;
begin
  select * into sh from cash_shifts where status = 'open' limit 1;
  if not found then
    if _has('approve') then return null; end if;
    raise exception 'مفيش عهدة مفتوحة — افتح عهدتك الأول من صفحة العهدة';
  end if;
  if sh.user_id <> auth.uid() and not _has('approve') then
    raise exception 'العهدة مفتوحة دلوقتي باسم % — لازم تتقفل الأول وبعدين تفتح عهدتك', _uname(sh.user_id);
  end if;
  return sh.id;
end $$;

create or replace function public._cash(dir text, amt numeric, cat text, descr text, party text,
                                        rtype text, rid int, d date default null) returns void
language plpgsql security definer set search_path = public as $$
declare sid int;
begin
  if amt is null or amt <= 0 then return; end if;
  sid := _open_shift_for_me();
  insert into cash_movements(mv_date, direction, amount, category, description, party, ref_type, ref_id, created_by, shift_id)
  values (coalesce(d, cairo_today()), dir, round(amt, 2), cat, coalesce(descr, ''), coalesce(party, ''),
          coalesce(rtype, ''), rid, auth.uid(), sid);
end $$;

create or replace function public._shipitem_sold(siid int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.qty), 0) from sale_lines l join sales s on s.id = l.sale_id
  where l.shipment_item_id = siid and not s.voided
$$;

-- ======================= المستخدمين الجدد ============================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles(id, username, full_name, role, active)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when first_user then 'admin' else 'accountant' end,
          first_user)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========================= بداية البرنامج ============================

create or replace function public.app_bootstrap(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  if auth.uid() is null then raise exception 'لازم تسجل دخول الأول'; end if;
  select * into me from profiles where id = auth.uid();
  if not found then raise exception 'الحساب غير موجود'; end if;
  if not me.active then
    return jsonb_build_object('me', to_jsonb(me));
  end if;
  return jsonb_build_object(
    'me', to_jsonb(me),
    'settings', (select to_jsonb(s) from shop_settings s where id = 1),
    'crate_types', (select coalesce(jsonb_agg(to_jsonb(c) order by c.deposit desc, c.name), '[]') from crate_types c),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name), '[]') from items i)
  );
end $$;

-- =========================== المستخدمين ==============================

create or replace function public.list_users(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need('users');
  return (select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at), '[]') from profiles u);
end $$;

create or replace function public.save_user(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := (p->>'id')::uuid; r profiles;
begin
  perform _need('users');
  select * into r from profiles where id = uid;
  if not found then raise exception 'المستخدم غير موجود'; end if;
  if uid = auth.uid() and (coalesce(p->>'role', r.role) <> 'admin' or coalesce((p->>'active')::boolean, true) = false) then
    raise exception 'مينفعش تشيل صلاحية المدير أو توقف حسابك انت';
  end if;
  update profiles set
    full_name = coalesce(p->>'full_name', full_name),
    role = coalesce(p->>'role', role),
    active = coalesce((p->>'active')::boolean, active),
    perms = coalesce(p->'perms', perms)
  where id = uid returning * into r;
  return to_jsonb(r);
end $$;

-- ===================== الإعدادات والأصناف والصناديق ===================

create or replace function public.save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r shop_settings;
begin
  perform _need('settings');
  update shop_settings set
    shop_name = coalesce(nullif(_t(p, 'shop_name'), ''), shop_name),
    phone = coalesce(p->>'phone', phone),
    address = coalesce(p->>'address', address),
    default_commission = _n(p, 'default_commission', default_commission),
    receipt_footer = coalesce(p->>'receipt_footer', receipt_footer),
    invoice_title = coalesce(nullif(_t(p, 'invoice_title'), ''), invoice_title),
    updated_at = now()
  where id = 1 returning * into r;
  return to_jsonb(r);
end $$;

create or replace function public.save_crate_type(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r crate_types;
begin
  perform _need('settings');
  if _t(p, 'name') = '' then raise exception 'اكتب اسم الصندوق'; end if;
  if _i(p, 'id') is null then
    insert into crate_types(name, deposit, active) values (_t(p, 'name'), _n(p, 'deposit'), coalesce((p->>'active')::boolean, true))
    returning * into r;
  else
    update crate_types set name = _t(p, 'name'), deposit = _n(p, 'deposit'), active = coalesce((p->>'active')::boolean, active)
    where id = _i(p, 'id') returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.save_item(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r items; unit text := coalesce(nullif(_t(p, 'default_unit'), ''), 'kg');
begin
  perform _need_any(array['settings','suppliers','sales']);
  if _t(p, 'name') = '' then raise exception 'اكتب اسم الصنف'; end if;
  if _i(p, 'id') is null then
    insert into items(name, default_unit) values (_t(p, 'name'), unit)
    on conflict (name) do update set active = true
    returning * into r;
  else
    update items set name = _t(p, 'name'), default_unit = unit, active = coalesce((p->>'active')::boolean, active)
    where id = _i(p, 'id') returning * into r;
  end if;
  return to_jsonb(r);
end $$;

-- ============================ الزباين ================================

create or replace function public.list_customers(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := '%' || _t(p, 'search') || '%';
begin
  perform _need(null);
  return (
    select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address, 'notes', c.notes,
        'credit_approved', c.credit_approved, 'credit_requested', c.credit_requested,
        'credit_limit', c.credit_limit, 'active', c.active,
        'balance', _customer_balance(c.id),
        'crates', _customer_crates(c.id)) as x
      from customers c
      where (c.name ilike q or c.phone ilike q)
        and (coalesce((p->>'include_inactive')::boolean, false) or c.active)
    ) t
    where not coalesce((p->>'only_debt')::boolean, false) or (x->>'balance')::numeric <> 0
  );
end $$;

create or replace function public.save_customer(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r customers; can_approve boolean := _has('approve');
begin
  perform _need_any(array['customers','sales']);
  if _t(p, 'name') = '' then raise exception 'اكتب اسم الزبون'; end if;
  if _i(p, 'id') is null then
    insert into customers(name, phone, address, notes, guarantor, credit_approved, credit_limit, credit_requested)
    values (_t(p, 'name'), _t(p, 'phone'), _t(p, 'address'), _t(p, 'notes'), _t(p, 'guarantor'),
            case when can_approve then coalesce((p->>'credit_approved')::boolean, false) else false end,
            case when can_approve then _n(p, 'credit_limit') else 0 end,
            case when can_approve then false else coalesce((p->>'credit_requested')::boolean, false) end)
    returning * into r;
  else
    update customers set
      name = _t(p, 'name'), phone = _t(p, 'phone'), address = _t(p, 'address'), notes = _t(p, 'notes'),
      guarantor = coalesce(p->>'guarantor', guarantor),
      active = coalesce((p->>'active')::boolean, active),
      credit_approved = case when can_approve then coalesce((p->>'credit_approved')::boolean, credit_approved) else credit_approved end,
      credit_limit = case when can_approve then _n(p, 'credit_limit', credit_limit) else credit_limit end,
      credit_requested = case when can_approve then false
                              else coalesce((p->>'credit_requested')::boolean, credit_requested) end
    where id = _i(p, 'id') returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.customer_statement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid int := _i(p, 'id'); c customers; d1 date := _d(p, 'from', date '2000-01-01'); d2 date := _d(p, 'to');
        opening numeric; ents jsonb;
begin
  perform _need(null);
  select * into c from customers where id = cid;
  if not found then raise exception 'الزبون غير موجود'; end if;

  drop table if exists _st;
  create temp table _st on commit drop as
  select * from (
    select s.sale_date as dt, s.created_at as ts, 'sale'::text as kind, s.id as ref_id, s.sale_no as ref_no,
           case when s.payment_type = 'cash' then 'فاتورة بيع نقدي' else 'فاتورة بيع آجل' end as descr,
           s.grand_total as debit, s.paid_amount as credit, 0::numeric as info,
           s.approval_status as status
      from sales s where s.customer_id = cid and not s.voided
    union all
    select pay_date, created_at, 'payment', id, id, 'دفعة نقدية' || case when notes <> '' then ' — ' || notes else '' end,
           0, amount, 0, '' from customer_payments where customer_id = cid and not voided
    union all
    select r.return_date, r.created_at, 'crates', r.id, r.id,
           'مرتجع ' || r.count || ' ' || ct.name || case when r.method = 'cash' then ' (رد رهن نقدي)' else ' (خصم من الحساب)' end,
           0, case when r.method = 'account' then r.amount else 0 end,
           case when r.method = 'cash' then r.amount else 0 end, ''
      from crate_returns r join crate_types ct on ct.id = r.crate_type_id where r.customer_id = cid
  ) u;

  select coalesce(sum(debit - credit), 0) into opening from _st where dt < d1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', dt, 'kind', kind, 'ref_id', ref_id, 'ref_no', ref_no, 'description', descr,
           'debit', debit, 'credit', credit, 'info', info, 'status', status,
           'balance', run,
           'lines', case when kind = 'sale' then (
              select coalesce(jsonb_agg(jsonb_build_object(
                'item', i.name, 'unit', l.unit, 'qty', l.qty, 'weight', l.weight, 'price', l.price,
                'amount', l.amount, 'crates', l.crates, 'crate', ct.name, 'deposit', l.deposit_amount) order by l.id), '[]')
              from sale_lines l join items i on i.id = l.item_id left join crate_types ct on ct.id = l.crate_type_id
              where l.sale_id = ref_id) else null end
         ) order by dt, ts), '[]')
  into ents from (
    select *, opening + sum(debit - credit) over (order by dt, ts, kind, ref_id rows unbounded preceding) as run
    from _st where dt between d1 and d2) z;

  return jsonb_build_object(
    'customer', to_jsonb(c),
    'balance', _customer_balance(cid),
    'crates', _customer_crates(cid),
    'from', d1, 'to', d2,
    'opening', opening,
    'entries', ents,
    'totals', (select jsonb_build_object('debit', coalesce(sum(debit), 0), 'credit', coalesce(sum(credit), 0))
               from _st where dt between d1 and d2)
  );
end $$;

create or replace function public.add_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid int := _i(p, 'customer_id'); amt numeric := round(_n(p, 'amount'), 2); c customers; pid int;
begin
  perform _need('collections');
  select * into c from customers where id = cid;
  if not found then raise exception 'اختار الزبون'; end if;
  if amt <= 0 then raise exception 'اكتب المبلغ'; end if;
  insert into customer_payments(customer_id, amount, notes, created_by) values (cid, amt, _t(p, 'notes'), auth.uid())
  returning id into pid;
  perform _cash('in', amt, 'collection', 'تحصيل من ' || c.name || case when _t(p, 'notes') <> '' then ' — ' || _t(p, 'notes') else '' end,
                c.name, 'payment', pid);
  return jsonb_build_object('id', pid, 'amount', amt, 'customer', c.name, 'balance', _customer_balance(cid),
                            'date', cairo_today(), 'by', _uname(auth.uid()));
end $$;

create or replace function public.void_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r customer_payments;
begin
  perform _need('approve');
  select * into r from customer_payments where id = _i(p, 'id');
  if not found or r.voided then raise exception 'الدفعة غير موجودة أو ملغية'; end if;
  update customer_payments set voided = true where id = r.id;
  perform _cash('out', r.amount, 'payment_void', 'إلغاء دفعة رقم ' || r.id, '', 'payment', r.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.return_crates(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid int := _i(p, 'customer_id'); v_ctid int := _i(p, 'crate_type_id'); cnt int := _i(p, 'count');
        meth text := coalesce(nullif(_t(p, 'method'), ''), 'account'); c customers; ct crate_types;
        outstanding int; amt numeric; rid int;
begin
  perform _need('collections');
  select * into c from customers where id = cid;
  if not found then raise exception 'اختار الزبون'; end if;
  select * into ct from crate_types where id = v_ctid;
  if not found then raise exception 'اختار نوع الصندوق'; end if;
  if coalesce(cnt, 0) <= 0 then raise exception 'اكتب عدد الصناديق'; end if;
  if meth not in ('cash', 'account') then raise exception 'طريقة رد الرهن غير صحيحة'; end if;
  select coalesce((x->>'count')::int, 0) into outstanding
    from jsonb_array_elements(_customer_crates(cid)) x where (x->>'crate_type_id')::int = v_ctid;
  if coalesce(outstanding, 0) < cnt then
    raise exception 'الزبون عليه % صندوق بس من النوع ده', coalesce(outstanding, 0);
  end if;
  amt := round(cnt * ct.deposit, 2);
  insert into crate_returns(customer_id, crate_type_id, count, unit_deposit, amount, method, notes, created_by)
  values (cid, v_ctid, cnt, ct.deposit, amt, meth, _t(p, 'notes'), auth.uid()) returning id into rid;
  if meth = 'cash' then
    perform _cash('out', amt, 'crate_refund', 'رد رهن ' || cnt || ' ' || ct.name || ' — ' || c.name, c.name, 'crate_return', rid);
  end if;
  return jsonb_build_object('id', rid, 'amount', amt, 'count', cnt, 'crate', ct.name, 'method', meth,
                            'customer', c.name, 'balance', _customer_balance(cid), 'crates', _customer_crates(cid),
                            'date', cairo_today(), 'by', _uname(auth.uid()));
end $$;

-- ===================== الموردين والنقلات ============================

create or replace function public.list_suppliers(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := '%' || _t(p, 'search') || '%';
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'phone', s.phone, 'commission_pct', s.commission_pct, 'notes', s.notes, 'active', s.active,
      'open_shipments', (select count(*) from shipments sh where sh.supplier_id = s.id and sh.settlement_id is null),
      'pending_amount', (select coalesce(sum(net_amount), 0) from settlements st where st.supplier_id = s.id and st.status = 'pending'),
      'due_amount', (select coalesce(sum(net_amount), 0) from settlements st where st.supplier_id = s.id and st.status = 'approved'),
      'paid_amount', (select coalesce(sum(net_amount), 0) from settlements st where st.supplier_id = s.id and st.status = 'paid')
    ) order by s.name), '[]')
    from suppliers s
    where (s.name ilike q or s.phone ilike q) and (coalesce((p->>'include_inactive')::boolean, false) or s.active));
end $$;

create or replace function public.save_supplier(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r suppliers;
begin
  perform _need('suppliers');
  if _t(p, 'name') = '' then raise exception 'اكتب اسم المورد'; end if;
  if _i(p, 'id') is null then
    insert into suppliers(name, phone, commission_pct, notes)
    values (_t(p, 'name'), _t(p, 'phone'),
            _n(p, 'commission_pct', (select default_commission from shop_settings where id = 1)), _t(p, 'notes'))
    returning * into r;
  else
    update suppliers set name = _t(p, 'name'), phone = _t(p, 'phone'),
      commission_pct = _n(p, 'commission_pct', commission_pct), notes = _t(p, 'notes'),
      active = coalesce((p->>'active')::boolean, active)
    where id = _i(p, 'id') returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public._shipment_json(sid int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', sh.id, 'supplier_id', sh.supplier_id, 'supplier', su.name, 'ship_date', sh.ship_date,
    'truck', sh.truck, 'driver', sh.driver, 'freight', sh.freight, 'unloading', sh.unloading,
    'other_expenses', sh.other_expenses, 'notes', sh.notes, 'settlement_id', sh.settlement_id,
    'settle_no', (select settle_no from settlements where id = sh.settlement_id),
    'settle_status', (select status from settlements where id = sh.settlement_id),
    'created_by', _uname(sh.created_by),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', si.id, 'item_id', si.item_id, 'item', i.name, 'default_unit', i.default_unit, 'qty', si.qty, 'notes', si.notes,
        'sold_qty', agg.qty, 'sold_weight', agg.weight, 'sold_amount', agg.amount,
        'remaining', si.qty - agg.qty,
        'avg_price', case when agg.weight > 0 then round(agg.amount / agg.weight, 2)
                          when agg.qty > 0 then round(agg.amount / agg.qty, 2) else 0 end
      ) order by si.id), '[]')
      from shipment_items si join items i on i.id = si.item_id
      cross join lateral (
        select coalesce(sum(l.qty), 0) qty, coalesce(sum(l.weight), 0) weight, coalesce(sum(l.amount), 0) amount
        from sale_lines l join sales s on s.id = l.sale_id where l.shipment_item_id = si.id and not s.voided
      ) agg
      where si.shipment_id = sh.id)
  )
  from shipments sh join suppliers su on su.id = sh.supplier_id where sh.id = sid
$$;

create or replace function public.save_shipment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid int := _i(p, 'id'); sh shipments; it jsonb; iid int; siid int; keep int[] := '{}'; sold numeric;
begin
  perform _need('suppliers');
  if _i(p, 'supplier_id') is null then raise exception 'اختار المورد'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'ضيف صنف واحد على الأقل'; end if;

  if sid is null then
    insert into shipments(supplier_id, ship_date, truck, driver, freight, unloading, other_expenses, notes, created_by)
    values (_i(p, 'supplier_id'), _d(p, 'ship_date'), _t(p, 'truck'), _t(p, 'driver'), _n(p, 'freight'),
            _n(p, 'unloading'), _n(p, 'other_expenses'), _t(p, 'notes'), auth.uid())
    returning * into sh;
  else
    select * into sh from shipments where id = sid for update;
    if not found then raise exception 'النقلة غير موجودة'; end if;
    if sh.settlement_id is not null then raise exception 'النقلة دي اتعملها تصفية ومينفعش تتعدل'; end if;
    update shipments set supplier_id = _i(p, 'supplier_id'), ship_date = _d(p, 'ship_date'), truck = _t(p, 'truck'),
      driver = _t(p, 'driver'), freight = _n(p, 'freight'), unloading = _n(p, 'unloading'),
      other_expenses = _n(p, 'other_expenses'), notes = _t(p, 'notes')
    where id = sid returning * into sh;
  end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    iid := _i(it, 'item_id');
    if iid is null then
      if _t(it, 'item_name') = '' then raise exception 'اختار الصنف'; end if;
      insert into items(name, default_unit) values (_t(it, 'item_name'), coalesce(nullif(_t(it, 'default_unit'), ''), 'kg'))
      on conflict (name) do update set active = true returning id into iid;
    end if;
    if _n(it, 'qty') <= 0 then raise exception 'اكتب عدد الطرود لكل صنف'; end if;
    siid := _i(it, 'id');
    if siid is null then
      insert into shipment_items(shipment_id, item_id, qty, notes) values (sh.id, iid, _n(it, 'qty'), _t(it, 'notes'))
      returning id into siid;
    else
      sold := _shipitem_sold(siid);
      if _n(it, 'qty') < sold then raise exception 'مينفعش العدد يقل عن اللي اتباع (%)', sold; end if;
      update shipment_items set item_id = case when sold > 0 then item_id else iid end, qty = _n(it, 'qty'), notes = _t(it, 'notes')
      where id = siid and shipment_id = sh.id;
    end if;
    keep := keep || siid;
  end loop;

  if exists (select 1 from shipment_items si where si.shipment_id = sh.id and not si.id = any(keep) and _shipitem_sold(si.id) > 0) then
    raise exception 'فيه صنف اتباع منه ومينفعش يتشال من النقلة';
  end if;
  delete from shipment_items si where si.shipment_id = sh.id and not si.id = any(keep);

  return _shipment_json(sh.id);
end $$;

create or replace function public.delete_shipment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sh shipments;
begin
  perform _need('approve');
  select * into sh from shipments where id = _i(p, 'id');
  if not found then raise exception 'النقلة غير موجودة'; end if;
  if sh.settlement_id is not null then raise exception 'النقلة دي اتعملها تصفية'; end if;
  if exists (select 1 from shipment_items si where si.shipment_id = sh.id and _shipitem_sold(si.id) > 0) then
    raise exception 'النقلة دي اتباع منها ومينفعش تتمسح';
  end if;
  delete from shipments where id = sh.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.list_shipments(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st text := coalesce(nullif(_t(p, 'status'), ''), 'open');
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(_shipment_json(sh.id) order by sh.ship_date desc, sh.id desc), '[]')
          from shipments sh
          where (_i(p, 'supplier_id') is null or sh.supplier_id = _i(p, 'supplier_id'))
            and (st = 'all' or (st = 'open' and sh.settlement_id is null) or (st = 'settled' and sh.settlement_id is not null))
            and sh.ship_date between _d(p, 'from', date '2000-01-01') and _d(p, 'to', date '2999-12-31'));
end $$;

create or replace function public.shipment_detail(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform _need(null);
  r := _shipment_json(_i(p, 'id'));
  if r is null then raise exception 'النقلة غير موجودة'; end if;
  return r || jsonb_build_object('sales', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'sale_id', s.id, 'sale_no', s.sale_no, 'date', s.sale_date,
      'customer', coalesce(c.name, nullif(s.customer_name, ''), 'نقدي'),
      'item', i.name, 'unit', l.unit, 'qty', l.qty, 'weight', l.weight, 'price', l.price, 'amount', l.amount
    ) order by s.sale_date, s.id), '[]')
    from sale_lines l join sales s on s.id = l.sale_id join items i on i.id = l.item_id
    join shipment_items si on si.id = l.shipment_item_id
    left join customers c on c.id = s.customer_id
    where si.shipment_id = _i(p, 'id') and not s.voided));
end $$;

create or replace function public.available_stock(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(x order by x->>'item', x->>'ship_date'), '[]') from (
    select jsonb_build_object(
      'shipment_item_id', si.id, 'item_id', i.id, 'item', i.name, 'default_unit', i.default_unit,
      'shipment_id', sh.id, 'ship_date', sh.ship_date, 'supplier', su.name,
      'qty', si.qty, 'remaining', si.qty - _shipitem_sold(si.id)) as x
    from shipment_items si join shipments sh on sh.id = si.shipment_id
    join items i on i.id = si.item_id join suppliers su on su.id = sh.supplier_id
    where sh.settlement_id is null
  ) t where (x->>'remaining')::numeric > 0);
end $$;

-- ============================== البيع ================================

create or replace function public.get_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform _need(null);
  select jsonb_build_object(
    'sale', to_jsonb(s),
    'customer', to_jsonb(c),
    'customer_display', coalesce(c.name, nullif(s.customer_name, ''), 'زبون نقدي'),
    'created_by_name', _uname(s.created_by),
    'balance', case when s.customer_id is not null then _customer_balance(s.customer_id) else null end,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'item', i.name, 'unit', l.unit, 'qty', l.qty, 'weight', l.weight, 'price', l.price,
        'amount', l.amount, 'crate', ct.name, 'crates', l.crates, 'deposit_unit', l.deposit_unit,
        'deposit_amount', l.deposit_amount, 'supplier', su.name) order by l.id), '[]')
      from sale_lines l join items i on i.id = l.item_id
      left join crate_types ct on ct.id = l.crate_type_id
      left join shipment_items si on si.id = l.shipment_item_id
      left join shipments sh on sh.id = si.shipment_id
      left join suppliers su on su.id = sh.supplier_id
      where l.sale_id = s.id),
    'settings', (select to_jsonb(x) from shop_settings x where id = 1)
  ) into r
  from sales s left join customers c on c.id = s.customer_id
  where s.id = _i(p, 'id') or (_i(p, 'id') is null and s.sale_no = _i(p, 'sale_no'));
  if r is null then raise exception 'الفاتورة غير موجودة'; end if;
  return r;
end $$;

create or replace function public.create_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cid int := _i(p, 'customer_id'); c customers; ptype text := coalesce(nullif(_t(p, 'payment_type'), ''), 'cash');
  ln jsonb; sid int; siid int; iid int; unit text; qty numeric; wt numeric; price numeric; amt numeric;
  v_ctid int; crates int; dep numeric; remaining numeric; open_ship boolean;
  goods numeric := 0; deps numeric := 0; disc numeric := round(_n(p, 'discount'), 2); grand numeric; paid numeric;
  approval text := 'not_required'; bal numeric;
begin
  perform _need('sales');
  if ptype not in ('cash', 'credit') then raise exception 'طريقة الدفع غير صحيحة'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'ضيف صنف واحد على الأقل'; end if;
  if cid is not null then
    select * into c from customers where id = cid;
    if not found then raise exception 'الزبون غير موجود'; end if;
  end if;
  if ptype = 'credit' and cid is null then raise exception 'البيع الآجل لازم يكون لزبون مسجل'; end if;

  insert into sales(customer_id, customer_name, payment_type, notes, created_by)
  values (cid, case when cid is null then _t(p, 'customer_name') else '' end, ptype, _t(p, 'notes'), auth.uid())
  returning id into sid;

  for ln in select * from jsonb_array_elements(p->'lines') loop
    siid := _i(ln, 'shipment_item_id');
    iid := _i(ln, 'item_id');
    if siid is not null then
      select si.item_id, sh.settlement_id is null into iid, open_ship
        from shipment_items si join shipments sh on sh.id = si.shipment_id where si.id = siid for update of si;
      if iid is null then raise exception 'الصنف غير موجود في النقلة'; end if;
      if not open_ship then raise exception 'النقلة دي اتقفلت (اتعملها تصفية)'; end if;
    end if;
    if iid is null then raise exception 'اختار الصنف في كل سطر'; end if;
    unit := coalesce(nullif(_t(ln, 'unit'), ''), 'kg');
    if unit not in ('kg', 'count') then raise exception 'وحدة البيع غير صحيحة'; end if;
    qty := _n(ln, 'qty'); wt := _n(ln, 'weight'); price := _n(ln, 'price');
    if qty < 0 or wt < 0 or price < 0 then raise exception 'مينفعش أرقام بالسالب'; end if;
    if unit = 'kg' and wt <= 0 then raise exception 'اكتب الوزن للصنف اللي بيتباع بالكيلو'; end if;
    if unit = 'count' and qty <= 0 then raise exception 'اكتب العدد للصنف اللي بيتباع بالعدد'; end if;
    if price <= 0 then raise exception 'اكتب سعر كل صنف'; end if;
    if siid is not null then
      select si.qty - _shipitem_sold(si.id) into remaining from shipment_items si where si.id = siid;
      if qty > remaining then raise exception 'الكمية أكبر من الباقي في النقلة (الباقي %)', remaining; end if;
    end if;
    amt := round(case when unit = 'kg' then wt * price else qty * price end, 2);
    v_ctid := _i(ln, 'crate_type_id'); crates := coalesce(_i(ln, 'crates'), 0); dep := 0;
    if crates < 0 then raise exception 'عدد الصناديق غير صحيح'; end if;
    if v_ctid is not null and crates > 0 then
      select deposit into dep from crate_types where id = v_ctid;
      dep := coalesce(dep, 0);
      if dep > 0 and cid is null then raise exception 'رهن الصناديق لازم يكون لزبون مسجل علشان نتابع المرتجع'; end if;
    else
      crates := 0; v_ctid := null;
    end if;
    insert into sale_lines(sale_id, shipment_item_id, item_id, unit, qty, weight, price, amount, crate_type_id, crates, deposit_unit, deposit_amount)
    values (sid, siid, iid, unit, qty, wt, price, amt, v_ctid, crates, dep, round(crates * dep, 2));
    goods := goods + amt; deps := deps + round(crates * dep, 2);
  end loop;

  grand := goods + deps - disc;
  if grand < 0 then raise exception 'الخصم أكبر من الفاتورة'; end if;
  if ptype = 'cash' then
    paid := grand;
  else
    paid := least(greatest(round(_n(p, 'paid_amount'), 2), 0), grand);
    bal := _customer_balance(cid);
    if _has('approve') then
      approval := 'not_required';
    elsif not c.credit_approved then
      approval := 'pending';
    elsif c.credit_limit > 0 and bal + (grand - paid) > c.credit_limit then
      approval := 'pending';
    end if;
  end if;

  -- رقم الفاتورة بيتحدد في الآخر بعد ما كل حاجة تتراجع، علشان الأرقام تمشي ورا بعض من غير فراغات
  update sales set goods_total = goods, deposit_total = deps, discount = disc, grand_total = grand,
                   paid_amount = paid, approval_status = approval, sale_no = nextval('public.sale_no_seq')
  where id = sid;

  perform _cash('in', paid, 'sale',
                'فاتورة بيع رقم ' || (select sale_no from sales where id = sid) ||
                case when ptype = 'credit' then ' (دفعة من آجل)' else '' end,
                coalesce(c.name, nullif(_t(p, 'customer_name'), ''), 'زبون نقدي'), 'sale', sid);

  return get_sale(jsonb_build_object('id', sid));
end $$;

create or replace function public.list_sales(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := _t(p, 'search');
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'sale_no', s.sale_no, 'date', s.sale_date, 'time', to_char(s.created_at at time zone 'Africa/Cairo', 'HH24:MI'),
      'customer_id', s.customer_id, 'customer', coalesce(c.name, nullif(s.customer_name, ''), 'زبون نقدي'),
      'payment_type', s.payment_type, 'goods_total', s.goods_total, 'deposit_total', s.deposit_total,
      'grand_total', s.grand_total, 'paid_amount', s.paid_amount, 'approval_status', s.approval_status,
      'voided', s.voided, 'by', _uname(s.created_by),
      'items', (select string_agg(i.name, '، ' order by l.id) from sale_lines l join items i on i.id = l.item_id where l.sale_id = s.id)
    ) order by s.id desc), '[]')
    from sales s left join customers c on c.id = s.customer_id
    where s.sale_date between _d(p, 'from') and _d(p, 'to')
      and (_i(p, 'customer_id') is null or s.customer_id = _i(p, 'customer_id'))
      and (coalesce(nullif(_t(p, 'payment_type'), ''), 'all') = 'all' or s.payment_type = _t(p, 'payment_type'))
      and (coalesce((p->>'include_voided')::boolean, false) or not s.voided)
      and (q = '' or s.sale_no::text = q or c.name ilike '%' || q || '%' or s.customer_name ilike '%' || q || '%'));
end $$;

create or replace function public.void_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  perform _need('approve');
  select * into s from sales where id = _i(p, 'id') for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if s.voided then raise exception 'الفاتورة ملغية بالفعل'; end if;
  if exists (select 1 from sale_lines l join shipment_items si on si.id = l.shipment_item_id
             join shipments sh on sh.id = si.shipment_id where l.sale_id = s.id and sh.settlement_id is not null) then
    raise exception 'مينفعش تلغي الفاتورة دي لأن النقلة بتاعتها اتعملها تصفية';
  end if;
  update sales set voided = true, voided_by = auth.uid(), voided_at = now(), void_reason = _t(p, 'reason') where id = s.id;
  perform _cash('out', s.paid_amount, 'sale_void', 'إلغاء فاتورة رقم ' || s.sale_no, '', 'sale', s.id);
  return jsonb_build_object('ok', true);
end $$;

-- ======================== تصفية الموردين =============================

create or replace function public.preview_settlement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sup suppliers; ids int[]; bad int;
begin
  perform _need_any(array['settlements','approve']);
  select * into sup from suppliers where id = _i(p, 'supplier_id');
  if not found then raise exception 'اختار المورد'; end if;
  select coalesce(array_agg(x::int), '{}') into ids from jsonb_array_elements_text(coalesce(p->'shipment_ids', '[]')) x;
  if array_length(ids, 1) is null then raise exception 'اختار نقلة واحدة على الأقل'; end if;
  select count(*) into bad from shipments where id = any(ids) and (supplier_id <> sup.id or settlement_id is not null);
  if bad > 0 then raise exception 'فيه نقلة مش تبع المورد ده أو اتعملها تصفية قبل كده'; end if;

  return jsonb_build_object(
    'supplier', to_jsonb(sup),
    'shipment_ids', to_jsonb(ids),
    'shipments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ship_date', ship_date, 'truck', truck) order by ship_date), '[]')
                  from shipments where id = any(ids)),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'item', item, 'unit', unit, 'price', price, 'qty', qty, 'weight', weight, 'amount', amount)
                order by item, unit, price desc), '[]')
              from (select i.name item, l.unit, l.price, sum(l.qty) qty, sum(l.weight) weight, sum(l.amount) amount
                    from sale_lines l join sales s on s.id = l.sale_id join items i on i.id = l.item_id
                    join shipment_items si on si.id = l.shipment_item_id
                    where si.shipment_id = any(ids) and not s.voided
                    group by i.name, l.unit, l.price) g),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'item', i.name, 'qty_in', si_tot.qty_in, 'qty_sold', coalesce(sold.qty, 0), 'weight', coalesce(sold.weight, 0),
                'amount', coalesce(sold.amount, 0), 'remaining', si_tot.qty_in - coalesce(sold.qty, 0)) order by i.name), '[]')
              from (select item_id, sum(qty) qty_in from shipment_items where shipment_id = any(ids) group by item_id) si_tot
              join items i on i.id = si_tot.item_id
              left join (select si.item_id, sum(l.qty) qty, sum(l.weight) weight, sum(l.amount) amount
                         from sale_lines l join sales s on s.id = l.sale_id join shipment_items si on si.id = l.shipment_item_id
                         where si.shipment_id = any(ids) and not s.voided group by si.item_id) sold on sold.item_id = si_tot.item_id),
    'totals', (select jsonb_build_object(
                'qty_in', (select coalesce(sum(qty), 0) from shipment_items where shipment_id = any(ids)),
                'qty', coalesce(sum(l.qty), 0), 'weight', coalesce(sum(l.weight), 0), 'gross', coalesce(sum(l.amount), 0))
               from sale_lines l join sales s on s.id = l.sale_id join shipment_items si on si.id = l.shipment_item_id
               where si.shipment_id = any(ids) and not s.voided),
    'commission_pct', sup.commission_pct,
    'freight', (select coalesce(sum(freight), 0) from shipments where id = any(ids)),
    'unloading', (select coalesce(sum(unloading), 0) from shipments where id = any(ids)),
    'other_expenses', (select coalesce(sum(other_expenses), 0) from shipments where id = any(ids))
  );
end $$;

create or replace function public.get_settlement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform _need(null);
  select to_jsonb(st) || jsonb_build_object(
    'supplier', to_jsonb(su),
    'created_by_name', _uname(st.created_by), 'decided_by_name', _uname(st.decided_by), 'paid_by_name', _uname(st.paid_by),
    'shipments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ship_date', ship_date, 'truck', truck) order by ship_date), '[]')
                  from shipments where settlement_id = st.id),
    'settings', (select to_jsonb(x) from shop_settings x where id = 1))
  into r
  from settlements st join suppliers su on su.id = st.supplier_id where st.id = _i(p, 'id');
  if r is null then raise exception 'التصفية غير موجودة'; end if;
  return r;
end $$;

create or replace function public.create_settlement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pv jsonb; ids int[]; pct numeric; gross numeric; comm numeric; fr numeric; un numeric; oth numeric; net numeric; stid int;
begin
  perform _need('settlements');
  pv := preview_settlement(p);
  select array_agg(x::int) into ids from jsonb_array_elements_text(pv->'shipment_ids') x;
  pct := _n(p, 'commission_pct', (pv->>'commission_pct')::numeric);
  if pct < 0 or pct > 100 then raise exception 'نسبة العمولة غير صحيحة'; end if;
  gross := (pv->'totals'->>'gross')::numeric;
  comm := round(gross * pct / 100, 2);
  fr := _n(p, 'freight', (pv->>'freight')::numeric);
  un := _n(p, 'unloading', (pv->>'unloading')::numeric);
  oth := _n(p, 'other_expenses', (pv->>'other_expenses')::numeric);
  net := gross - comm - fr - un - oth;

  insert into settlements(supplier_id, created_by, total_qty_in, total_qty, total_weight, gross_sales, commission_pct,
                          commission_amount, freight, unloading, other_expenses, other_label, net_amount, details, notes)
  values (_i(p, 'supplier_id'), auth.uid(), (pv->'totals'->>'qty_in')::numeric, (pv->'totals'->>'qty')::numeric,
          (pv->'totals'->>'weight')::numeric, gross, pct, comm, fr, un, oth, _t(p, 'other_label'), net,
          jsonb_build_object('lines', pv->'lines', 'items', pv->'items'), _t(p, 'notes'))
  returning id into stid;
  update shipments set settlement_id = stid where id = any(ids);
  return get_settlement(jsonb_build_object('id', stid));
end $$;

create or replace function public.list_settlements(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st text := coalesce(nullif(_t(p, 'status'), ''), 'all');
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'settle_no', s.settle_no, 'date', (s.created_at at time zone 'Africa/Cairo')::date,
      'supplier_id', s.supplier_id, 'supplier', su.name, 'gross_sales', s.gross_sales, 'commission_amount', s.commission_amount,
      'expenses', s.freight + s.unloading + s.other_expenses, 'net_amount', s.net_amount, 'status', s.status,
      'total_weight', s.total_weight, 'total_qty', s.total_qty, 'by', _uname(s.created_by)
    ) order by s.id desc), '[]')
    from settlements s join suppliers su on su.id = s.supplier_id
    where (st = 'all' or s.status = st) and (_i(p, 'supplier_id') is null or s.supplier_id = _i(p, 'supplier_id')));
end $$;

create or replace function public.decide_settlement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s settlements; ok boolean := coalesce((p->>'approve')::boolean, false);
begin
  perform _need('approve');
  select * into s from settlements where id = _i(p, 'id') for update;
  if not found then raise exception 'التصفية غير موجودة'; end if;
  if s.status <> 'pending' then raise exception 'التصفية دي اتراجعت قبل كده'; end if;
  if ok then
    update settlements set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = s.id;
  else
    update settlements set status = 'rejected', decided_by = auth.uid(), decided_at = now(), reject_reason = _t(p, 'reason')
    where id = s.id;
    update shipments set settlement_id = null where settlement_id = s.id;
  end if;
  return get_settlement(jsonb_build_object('id', s.id));
end $$;

create or replace function public.pay_settlement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s settlements; sup text;
begin
  perform _need('payouts');
  select * into s from settlements where id = _i(p, 'id') for update;
  if not found then raise exception 'التصفية غير موجودة'; end if;
  if s.status = 'pending' then raise exception 'التصفية لسه مستنية موافقة المدير'; end if;
  if s.status <> 'approved' then raise exception 'التصفية دي مش جاهزة للصرف'; end if;
  select name into sup from suppliers where id = s.supplier_id;
  update settlements set status = 'paid', paid_by = auth.uid(), paid_at = now() where id = s.id;
  if s.net_amount > 0 then
    perform _cash('out', s.net_amount, 'supplier_payment', 'صرف تصفية رقم ' || s.settle_no || ' — ' || sup, sup, 'settlement', s.id);
  end if;
  return get_settlement(jsonb_build_object('id', s.id));
end $$;

-- =========================== الموافقات ================================

create or replace function public.pending_approvals(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need('approve');
  return jsonb_build_object(
    'sales', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'sale_no', s.sale_no, 'date', s.sale_date, 'customer', c.name, 'customer_id', c.id,
        'grand_total', s.grand_total, 'paid_amount', s.paid_amount, 'remaining', s.grand_total - s.paid_amount,
        'balance', _customer_balance(c.id), 'credit_limit', c.credit_limit, 'credit_approved', c.credit_approved,
        'by', _uname(s.created_by)) order by s.id), '[]')
      from sales s join customers c on c.id = s.customer_id
      where s.approval_status = 'pending' and not s.voided),
    'settlements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'settle_no', s.settle_no, 'supplier', su.name, 'gross_sales', s.gross_sales,
        'commission_amount', s.commission_amount, 'expenses', s.freight + s.unloading + s.other_expenses,
        'net_amount', s.net_amount, 'total_weight', s.total_weight, 'by', _uname(s.created_by),
        'date', (s.created_at at time zone 'Africa/Cairo')::date) order by s.id), '[]')
      from settlements s join suppliers su on su.id = s.supplier_id where s.status = 'pending'),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'balance', _customer_balance(c.id)) order by c.id), '[]')
      from customers c where c.credit_requested and not c.credit_approved),
    'users', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name)
        order by u.created_at), '[]') from profiles u where not u.active and _has('users')),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('by', _uname(r.requested_by)) order by r.id), '[]')
      from change_requests r where r.status = 'pending')
  );
end $$;

create or replace function public.decide_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sales; ok boolean := coalesce((p->>'approve')::boolean, false);
begin
  perform _need('approve');
  select * into s from sales where id = _i(p, 'id') for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if s.approval_status <> 'pending' or s.voided then raise exception 'الفاتورة دي اتراجعت قبل كده'; end if;
  if ok then
    update sales set approval_status = 'approved', decided_by = auth.uid(), decided_at = now() where id = s.id;
  else
    update sales set approval_status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      reject_reason = _t(p, 'reason'), voided = true, voided_by = auth.uid(), voided_at = now(),
      void_reason = 'رفض الآجل' || case when _t(p, 'reason') <> '' then ' — ' || _t(p, 'reason') else '' end
    where id = s.id;
    perform _cash('out', s.paid_amount, 'sale_void', 'رفض آجل فاتورة رقم ' || s.sale_no, '', 'sale', s.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.decide_customer_credit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r customers;
begin
  perform _need('approve');
  update customers set credit_requested = false,
    credit_approved = coalesce((p->>'approve')::boolean, false),
    credit_limit = case when coalesce((p->>'approve')::boolean, false) then _n(p, 'credit_limit') else 0 end
  where id = _i(p, 'id') returning * into r;
  if not found then raise exception 'الزبون غير موجود'; end if;
  return to_jsonb(r);
end $$;

-- ============================ العهدة ================================

create or replace function public.add_cash(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare dir text := _t(p, 'direction'); cat text := _t(p, 'category'); amt numeric := round(_n(p, 'amount'), 2); mid int;
begin
  perform _need('cash');
  if dir = 'in' and cat not in ('funding', 'other_in') then raise exception 'نوع الوارد غير صحيح'; end if;
  if dir = 'out' and cat not in ('transport', 'bill', 'withdrawal', 'salary', 'other_out') then raise exception 'نوع المصروف غير صحيح'; end if;
  if dir not in ('in', 'out') then raise exception 'اختار وارد أو منصرف'; end if;
  if amt <= 0 then raise exception 'اكتب المبلغ'; end if;
  if _t(p, 'description') = '' then raise exception 'اكتب البيان'; end if;
  insert into cash_movements(direction, amount, category, description, party, ref_type, created_by, shift_id)
  values (dir, amt, cat, _t(p, 'description'), _t(p, 'party'), 'manual', auth.uid(), _open_shift_for_me()) returning id into mid;
  return jsonb_build_object('id', mid, 'balance', _cash_balance(cairo_today()),
    'movement', (select to_jsonb(m) || jsonb_build_object('by', _uname(m.created_by)) from cash_movements m where id = mid));
end $$;

create or replace function public.cash_day(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d1 date := _d(p, 'from', _d(p, 'date')); d2 date := _d(p, 'to', _d(p, 'date'));
begin
  perform _need_any(array['cash','reports']);
  return jsonb_build_object(
    'from', d1, 'to', d2,
    'opening', _cash_balance(d1 - 1),
    'closing', _cash_balance(d2),
    'total_in', (select coalesce(sum(amount), 0) from cash_movements where direction = 'in' and mv_date between d1 and d2),
    'total_out', (select coalesce(sum(amount), 0) from cash_movements where direction = 'out' and mv_date between d1 and d2),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('direction', direction, 'category', category, 'total', total, 'count', cnt)
                    order by direction, total desc), '[]')
                    from (select direction, category, sum(amount) total, count(*) cnt from cash_movements
                          where mv_date between d1 and d2 group by direction, category) g),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.mv_date, 'time', to_char(m.created_at at time zone 'Africa/Cairo', 'HH24:MI'),
        'direction', m.direction, 'amount', m.amount, 'category', m.category, 'description', m.description,
        'party', m.party, 'ref_type', m.ref_type, 'ref_id', m.ref_id, 'by', _uname(m.created_by)) order by m.created_at, m.id), '[]')
      from cash_movements m where m.mv_date between d1 and d2)
  );
end $$;

-- ========================= عهد المحاسبين =============================

create or replace function public._shift_json(sid int) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(sh) || jsonb_build_object(
    'user_name', _uname(sh.user_id), 'closed_by_name', _uname(sh.closed_by),
    'live_in', coalesce((select sum(amount) from cash_movements where shift_id = sh.id and direction = 'in'
                         and category <> 'shift_over'), 0),
    'live_out', coalesce((select sum(amount) from cash_movements where shift_id = sh.id and direction = 'out'
                          and category <> 'shift_short'), 0),
    'count', (select count(*) from cash_movements where shift_id = sh.id))
  from cash_shifts sh where sh.id = sid
$$;

create or replace function public.current_shift(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid int; last_id int;
begin
  perform _need(null);
  select id into sid from cash_shifts where status = 'open' limit 1;
  select id into last_id from cash_shifts where status = 'closed' order by closed_at desc limit 1;
  return jsonb_build_object(
    'shift', case when sid is null then null else _shift_json(sid) end,
    'last', case when last_id is null then null else _shift_json(last_id) end,
    'cash_balance', _cash_balance(date '2999-12-31'),
    'mine', sid is not null and (select user_id from cash_shifts where id = sid) = auth.uid()
  );
end $$;

create or replace function public.open_shift(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid int;
begin
  perform _need_any(array['sales','cash','collections','payouts']);
  if exists (select 1 from cash_shifts where status = 'open') then
    raise exception 'فيه عهدة مفتوحة باسم % — لازم تتقفل الأول',
      (select _uname(user_id) from cash_shifts where status = 'open' limit 1);
  end if;
  insert into cash_shifts(user_id, opening_amount, notes)
  values (auth.uid(), _cash_balance(date '2999-12-31'), _t(p, 'notes')) returning id into sid;
  return _shift_json(sid);
end $$;

create or replace function public.close_shift(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sh cash_shifts; tin numeric; tout numeric; expected numeric; counted numeric; diff numeric;
begin
  perform _need(null);
  select * into sh from cash_shifts where status = 'open' for update;
  if not found then raise exception 'مفيش عهدة مفتوحة'; end if;
  if sh.user_id <> auth.uid() and not _has('approve') then
    raise exception 'العهدة دي باسم % — هو أو المدير بس اللي يقفلها', _uname(sh.user_id);
  end if;
  select coalesce(sum(amount) filter (where direction = 'in'), 0), coalesce(sum(amount) filter (where direction = 'out'), 0)
    into tin, tout from cash_movements where shift_id = sh.id;
  expected := sh.opening_amount + tin - tout;
  counted := case when nullif(trim(p->>'counted'), '') is null then expected else round(_n(p, 'counted'), 2) end;
  if counted < 0 then raise exception 'المبلغ الفعلي مينفعش يبقى بالسالب'; end if;
  diff := counted - expected;
  -- العجز أو الزيادة بيتسجلوا علشان رصيد العهدة الجديدة يبقى نفس الفلوس اللي اتسلّمت فعلًا
  if diff < 0 then
    insert into cash_movements(direction, amount, category, description, ref_type, ref_id, created_by, shift_id)
    values ('out', -diff, 'shift_short', 'عجز في عهدة ' || _uname(sh.user_id), 'shift', sh.id, auth.uid(), sh.id);
  elsif diff > 0 then
    insert into cash_movements(direction, amount, category, description, ref_type, ref_id, created_by, shift_id)
    values ('in', diff, 'shift_over', 'زيادة في عهدة ' || _uname(sh.user_id), 'shift', sh.id, auth.uid(), sh.id);
  end if;
  update cash_shifts set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    total_in = tin, total_out = tout, expected_amount = expected, counted_amount = counted, difference = diff,
    notes = case when _t(p, 'notes') <> '' then _t(p, 'notes') else notes end
  where id = sh.id;
  return shift_report(jsonb_build_object('id', sh.id));
end $$;

create or replace function public.shift_report(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid int := _i(p, 'id'); r jsonb;
begin
  perform _need(null);
  r := _shift_json(sid);
  if r is null then raise exception 'العهدة غير موجودة'; end if;
  if (r->>'user_id')::uuid <> auth.uid() and not _has('cash') and not _has('reports') then
    raise exception 'مش عندك صلاحية تشوف عهدة محاسب تاني';
  end if;
  return r || jsonb_build_object(
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('direction', direction, 'category', category, 'total', total, 'count', cnt)
                    order by direction, total desc), '[]')
                    from (select direction, category, sum(amount) total, count(*) cnt from cash_movements
                          where shift_id = sid group by direction, category) g),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.mv_date, 'time', to_char(m.created_at at time zone 'Africa/Cairo', 'HH24:MI'),
        'direction', m.direction, 'amount', m.amount, 'category', m.category, 'description', m.description,
        'ref_type', m.ref_type, 'ref_id', m.ref_id, 'by', _uname(m.created_by)) order by m.created_at, m.id), '[]')
      from cash_movements m where m.shift_id = sid),
    'settings', (select to_jsonb(x) from shop_settings x where id = 1));
end $$;

create or replace function public.list_shifts(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(_shift_json(sh.id) order by sh.opened_at desc), '[]')
          from cash_shifts sh
          where (sh.opened_at at time zone 'Africa/Cairo')::date between _d(p, 'from', cairo_today() - 30) and _d(p, 'to')
            and (sh.user_id = auth.uid() or _has('cash') or _has('reports')));
end $$;

-- ===================== تعديل الفواتير والبضاعة =======================

create or replace function public.edit_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sales; ln jsonb; l sale_lines; v_qty numeric; v_wt numeric; v_price numeric; amt numeric; room numeric;
        goods numeric; grand numeric; delta numeric; newpaid numeric;
begin
  perform _need('approve');
  select * into s from sales where id = _i(p, 'id') for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if s.voided then raise exception 'الفاتورة دي ملغية'; end if;
  if exists (select 1 from sale_lines x join shipment_items si on si.id = x.shipment_item_id
             join shipments sh on sh.id = si.shipment_id where x.sale_id = s.id and sh.settlement_id is not null) then
    raise exception 'مينفعش تتعدل لأن النقلة بتاعتها اتعملها فاتورة مورد';
  end if;
  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    select * into l from sale_lines where id = _i(ln, 'id') and sale_id = s.id;
    if not found then raise exception 'سطر غير موجود في الفاتورة'; end if;
    v_qty := _n(ln, 'qty', l.qty); v_wt := _n(ln, 'weight', l.weight); v_price := _n(ln, 'price', l.price);
    if v_qty < 0 or v_wt < 0 or v_price <= 0 then raise exception 'الأرقام غير صحيحة'; end if;
    if l.unit = 'kg' and v_wt <= 0 then raise exception 'اكتب الوزن'; end if;
    if l.shipment_item_id is not null then
      select si.qty - _shipitem_sold(si.id) + l.qty into room from shipment_items si where si.id = l.shipment_item_id;
      if v_qty > room then raise exception 'العدد أكبر من الموجود في النقلة (المتاح %)', room; end if;
    end if;
    amt := round(case when l.unit = 'kg' then v_wt * v_price else v_qty * v_price end, 2);
    update sale_lines set qty = v_qty, weight = v_wt, price = v_price, amount = amt where id = l.id;
  end loop;
  select coalesce(sum(amount), 0) into goods from sale_lines where sale_id = s.id;
  grand := goods + s.deposit_total - s.discount;
  if grand < 0 then raise exception 'الخصم أكبر من الفاتورة'; end if;
  newpaid := case when s.payment_type = 'cash' then grand else least(s.paid_amount, grand) end;
  delta := newpaid - s.paid_amount;
  update sales set goods_total = goods, grand_total = grand, paid_amount = newpaid,
    notes = trim(notes || case when _t(p, 'reason') <> '' then ' | تعديل: ' || _t(p, 'reason') else ' | اتعدلت' end)
  where id = s.id;
  if delta > 0 then
    perform _cash('in', delta, 'sale_edit', 'فرق تعديل فاتورة رقم ' || s.sale_no, '', 'sale', s.id);
  elsif delta < 0 then
    perform _cash('out', -delta, 'sale_edit', 'فرق تعديل فاتورة رقم ' || s.sale_no, '', 'sale', s.id);
  end if;
  return get_sale(jsonb_build_object('id', s.id));
end $$;

-- البضاعة الموجودة: كل صنف في كل نقلة لسه ما اتعملهاش فاتورة مورد
create or replace function public.list_stock(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := '%' || _t(p, 'search') || '%';
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(x order by x->>'item', x->>'ship_date'), '[]') from (
    select jsonb_build_object(
      'shipment_item_id', si.id, 'item_id', i.id, 'item', i.name, 'default_unit', i.default_unit,
      'shipment_id', sh.id, 'ship_date', sh.ship_date, 'truck', sh.truck, 'supplier_id', su.id, 'supplier', su.name,
      'qty', si.qty, 'sold', _shipitem_sold(si.id), 'remaining', si.qty - _shipitem_sold(si.id)) as x
    from shipment_items si join shipments sh on sh.id = si.shipment_id
    join items i on i.id = si.item_id join suppliers su on su.id = sh.supplier_id
    where sh.settlement_id is null and (i.name ilike q or su.name ilike q)
  ) t where coalesce((p->>'include_empty')::boolean, false) or (x->>'remaining')::numeric > 0);
end $$;

create or replace function public.stock_adjust(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare si shipment_items; open_ship boolean; sold numeric; newq numeric := _n(p, 'qty', -1);
begin
  perform _need('approve');
  select * into si from shipment_items where id = _i(p, 'shipment_item_id') for update;
  if not found then raise exception 'الصنف غير موجود'; end if;
  select settlement_id is null into open_ship from shipments where id = si.shipment_id;
  if not open_ship then raise exception 'النقلة دي اتعملها فاتورة مورد'; end if;
  sold := _shipitem_sold(si.id);
  if newq < sold then raise exception 'العدد مينفعش يقل عن اللي اتباع (%)', sold; end if;
  if newq = 0 then
    delete from shipment_items where id = si.id;
    delete from shipments sh where sh.id = si.shipment_id and not exists (select 1 from shipment_items where shipment_id = sh.id);
  else
    update shipment_items set qty = newq where id = si.id;
  end if;
  return jsonb_build_object('ok', true, 'qty', newq, 'sold', sold);
end $$;

-- طلبات تعديل وحذف المحاسبين، والمدير بيوافق أو يرفض
create table if not exists public.change_requests (
  id serial primary key,
  kind text not null check (kind in ('void_sale','edit_sale','stock_adjust','delete_shipment','void_payment')),
  target_id int,
  payload jsonb not null default '{}'::jsonb,
  summary text not null default '',
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decide_note text not null default ''
);

create or replace function public.request_change(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := _t(p, 'kind'); rid int;
begin
  perform _need(null);
  if k not in ('void_sale','edit_sale','stock_adjust','delete_shipment','void_payment') then raise exception 'نوع الطلب غير صحيح'; end if;
  if exists (select 1 from change_requests where kind = k and target_id = _i(p, 'target_id') and status = 'pending') then
    raise exception 'فيه طلب على نفس الحاجة لسه مستني موافقة المدير';
  end if;
  insert into change_requests(kind, target_id, payload, summary, reason, requested_by)
  values (k, _i(p, 'target_id'), coalesce(p->'payload', '{}'::jsonb), _t(p, 'summary'), _t(p, 'reason'), auth.uid())
  returning id into rid;
  return jsonb_build_object('id', rid);
end $$;

create or replace function public.decide_change(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r change_requests; ok boolean := coalesce((p->>'approve')::boolean, false);
begin
  perform _need('approve');
  select * into r from change_requests where id = _i(p, 'id') for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then raise exception 'الطلب ده اتراجع قبل كده'; end if;
  if ok then
    perform set_config('app.approved_run', '1', true);
    if r.kind = 'void_sale' then perform void_sale(r.payload || jsonb_build_object('id', r.target_id, 'reason', r.reason));
    elsif r.kind = 'edit_sale' then perform edit_sale(r.payload || jsonb_build_object('id', r.target_id, 'reason', r.reason));
    elsif r.kind = 'stock_adjust' then perform stock_adjust(r.payload || jsonb_build_object('shipment_item_id', r.target_id));
    elsif r.kind = 'delete_shipment' then perform delete_shipment(jsonb_build_object('id', r.target_id));
    elsif r.kind = 'void_payment' then perform void_payment(jsonb_build_object('id', r.target_id));
    end if;
    perform set_config('app.approved_run', '', true);
  end if;
  update change_requests set status = case when ok then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decide_note = _t(p, 'note')
  where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.list_requests(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need(null);
  return (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('by', _uname(r.requested_by), 'decided_by_name', _uname(r.decided_by))
          order by r.id desc), '[]')
          from change_requests r
          where (coalesce(nullif(_t(p, 'status'), ''), 'pending') = 'all' or r.status = coalesce(nullif(_t(p, 'status'), ''), 'pending'))
            and (_has('approve') or r.requested_by = auth.uid())
          limit 200);
end $$;

-- تعديل فاتورة المورد (العمولة والنولون والدخان) قبل الصرف
create or replace function public.edit_settlement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s settlements; pct numeric; comm numeric; fr numeric; un numeric; oth numeric;
begin
  perform _need_any(array['settlements','approve']);
  select * into s from settlements where id = _i(p, 'id') for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if s.status not in ('pending','approved') then raise exception 'الفاتورة دي اتصرفت أو اترفضت ومينفعش تتعدل'; end if;
  pct := _n(p, 'commission_pct', s.commission_pct);
  if pct < 0 or pct > 100 then raise exception 'نسبة العمولة غير صحيحة'; end if;
  comm := round(s.gross_sales * pct / 100, 2);
  fr := _n(p, 'freight', s.freight); un := _n(p, 'unloading', s.unloading); oth := _n(p, 'other_expenses', s.other_expenses);
  update settlements set commission_pct = pct, commission_amount = comm, freight = fr, unloading = un, other_expenses = oth,
    other_label = coalesce(p->>'other_label', other_label), notes = coalesce(p->>'notes', notes),
    net_amount = gross_sales - comm - fr - un - oth,
    -- لو المحاسب عدّل بعد موافقة المدير، ترجع تستنى موافقة تاني
    status = case when _has('approve') then status else 'pending' end,
    decided_by = case when _has('approve') then decided_by else null end,
    decided_at = case when _has('approve') then decided_at else null end
  where id = s.id;
  return get_settlement(jsonb_build_object('id', s.id));
end $$;

-- ============================ الزمامات ================================

-- تاريخ أقدم فاتورة آجل لسه ما اتسددتش (الدفعات بتتخصم من الأقدم للأحدث)
create or replace function public._oldest_unpaid(cid int) returns date
language sql stable security definer set search_path = public as $$
  with paid as (
    select coalesce((select sum(amount) from customer_payments where customer_id = cid and not voided), 0)
         + coalesce((select sum(amount) from crate_returns where customer_id = cid and method = 'account'), 0) as total
  ), debts as (
    select sale_date, sum(grand_total - paid_amount) over (order by sale_date, id) as cum
    from sales where customer_id = cid and not voided and grand_total - paid_amount > 0
  )
  select min(sale_date) from debts, paid where cum > paid.total
$$;

create or replace function public.report_zimam(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := '%' || _t(p, 'search') || '%'; mind int := coalesce(_i(p, 'min_days'), 0); today date := cairo_today();
begin
  perform _need_any(array['reports','collections','customers']);
  return (select coalesce(jsonb_agg(x order by
            case when _t(p, 'sort') = 'balance' then -(x->>'balance')::numeric else -(x->>'days_late')::numeric end), '[]')
    from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'guarantor', c.guarantor,
        'rating_pay', c.rating_pay, 'rating_general', c.rating_general, 'rating_note', c.rating_note,
        'credit_limit', c.credit_limit, 'balance', b.bal, 'oldest_unpaid', b.oldest,
        'days_late', coalesce(today - b.oldest, 0),
        'last_payment', (select max(pay_date) from customer_payments where customer_id = c.id and not voided),
        'days_since_payment', today - (select max(pay_date) from customer_payments where customer_id = c.id and not voided),
        'purchases', (select count(*) from sales where customer_id = c.id and not voided),
        'credit_purchases', (select count(*) from sales where customer_id = c.id and not voided and payment_type = 'credit'),
        'total_purchases', (select coalesce(sum(grand_total), 0) from sales where customer_id = c.id and not voided),
        'last_sale', (select max(sale_date) from sales where customer_id = c.id and not voided),
        'payments_count', (select count(*) from customer_payments where customer_id = c.id and not voided),
        'crates', _customer_crates(c.id)) as x
      from customers c
      cross join lateral (select _customer_balance(c.id) as bal, _oldest_unpaid(c.id) as oldest) b
      where b.bal > 0 and (c.name ilike q or c.phone ilike q or c.guarantor ilike q)
        and coalesce(today - b.oldest, 0) >= mind
    ) t);
end $$;

create or replace function public.rate_customer(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r customers;
begin
  perform _need_any(array['customers','collections','approve']);
  update customers set
    rating_pay = least(greatest(coalesce(_i(p, 'rating_pay'), rating_pay), 0), 5),
    rating_general = least(greatest(coalesce(_i(p, 'rating_general'), rating_general), 0), 5),
    rating_note = coalesce(p->>'rating_note', rating_note),
    guarantor = coalesce(p->>'guarantor', guarantor)
  where id = _i(p, 'id') returning * into r;
  if not found then raise exception 'الزبون غير موجود'; end if;
  return to_jsonb(r);
end $$;

-- ============================ التقارير ================================

create or replace function public.report_sales_detail(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d1 date := _d(p, 'from'); d2 date := _d(p, 'to'); q text := '%' || _t(p, 'search') || '%';
begin
  perform _need('reports');
  drop table if exists _rl;
  create temp table _rl on commit drop as
    select s.id sale_id, s.sale_no, s.sale_date, to_char(s.created_at at time zone 'Africa/Cairo', 'HH24:MI') tm,
           coalesce(c.name, nullif(s.customer_name, ''), 'زبون نقدي') customer, s.payment_type,
           i.name item, su.name supplier, l.unit, l.qty, l.weight, l.price, l.amount, l.crates
    from sale_lines l join sales s on s.id = l.sale_id join items i on i.id = l.item_id
    left join customers c on c.id = s.customer_id
    left join shipment_items si on si.id = l.shipment_item_id left join shipments sh on sh.id = si.shipment_id
    left join suppliers su on su.id = sh.supplier_id
    where not s.voided and s.sale_date between d1 and d2
      and (i.name ilike q or coalesce(c.name, s.customer_name, '') ilike q or coalesce(su.name, '') ilike q);
  return jsonb_build_object('from', d1, 'to', d2,
    'lines', (select coalesce(jsonb_agg(to_jsonb(r) order by r.item, r.sale_date, r.sale_no), '[]') from _rl r),
    'by_item', (select coalesce(jsonb_agg(jsonb_build_object('item', item, 'qty', qty, 'weight', weight, 'amount', amount,
                  'customers', customers, 'avg', case when weight > 0 then round(amount / weight, 2) when qty > 0 then round(amount / qty, 2) else 0 end)
                  order by amount desc), '[]')
                from (select item, sum(qty) qty, sum(weight) weight, sum(amount) amount, count(distinct customer) customers from _rl group by item) g),
    'by_customer', (select coalesce(jsonb_agg(jsonb_build_object('customer', customer, 'qty', qty, 'weight', weight, 'amount', amount, 'invoices', inv)
                  order by amount desc), '[]')
                from (select customer, sum(qty) qty, sum(weight) weight, sum(amount) amount, count(distinct sale_id) inv from _rl group by customer) g),
    'totals', (select jsonb_build_object('qty', coalesce(sum(qty), 0), 'weight', coalesce(sum(weight), 0), 'amount', coalesce(sum(amount), 0),
                'invoices', count(distinct sale_id), 'customers', count(distinct customer)) from _rl));
end $$;

create or replace function public.report_money(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d1 date := _d(p, 'from'); d2 date := _d(p, 'to'); dir text := coalesce(nullif(_t(p, 'direction'), ''), 'in');
begin
  perform _need_any(array['reports','cash']);
  return jsonb_build_object('from', d1, 'to', d2, 'direction', dir,
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
        'date', m.mv_date, 'time', to_char(m.created_at at time zone 'Africa/Cairo', 'HH24:MI'), 'amount', m.amount,
        'category', m.category, 'description', m.description, 'party', m.party, 'ref_type', m.ref_type, 'ref_id', m.ref_id,
        'by', _uname(m.created_by)) order by m.mv_date, m.created_at), '[]')
      from cash_movements m where m.direction = dir and m.mv_date between d1 and d2),
    'by_party', (select coalesce(jsonb_agg(jsonb_build_object('party', party, 'count', cnt, 'total', total) order by total desc), '[]')
      from (select coalesce(nullif(party, ''), 'بدون اسم') party, count(*) cnt, sum(amount) total from cash_movements
            where direction = dir and mv_date between d1 and d2 group by 1) g),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', cnt, 'total', total) order by total desc), '[]')
      from (select category, count(*) cnt, sum(amount) total from cash_movements
            where direction = dir and mv_date between d1 and d2 group by 1) g),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('date', mv_date, 'count', cnt, 'total', total) order by mv_date), '[]')
      from (select mv_date, count(*) cnt, sum(amount) total from cash_movements
            where direction = dir and mv_date between d1 and d2 group by 1) g),
    'total', (select coalesce(sum(amount), 0) from cash_movements where direction = dir and mv_date between d1 and d2),
    'count', (select count(*) from cash_movements where direction = dir and mv_date between d1 and d2));
end $$;

create or replace function public.dashboard(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date := cairo_today();
begin
  perform _need(null);
  return jsonb_build_object(
    'today', d,
    'sales_count', (select count(*) from sales where sale_date = d and not voided),
    'sales_total', (select coalesce(sum(grand_total), 0) from sales where sale_date = d and not voided),
    'cash_sales', (select coalesce(sum(grand_total), 0) from sales where sale_date = d and not voided and payment_type = 'cash'),
    'credit_sales', (select coalesce(sum(grand_total - paid_amount), 0) from sales where sale_date = d and not voided and payment_type = 'credit'),
    'collections', (select coalesce(sum(amount), 0) from customer_payments where pay_date = d and not voided),
    'cash_in', (select coalesce(sum(amount), 0) from cash_movements where mv_date = d and direction = 'in'),
    'cash_out', (select coalesce(sum(amount), 0) from cash_movements where mv_date = d and direction = 'out'),
    'cash_balance', case when _has('cash') or _has('reports') then _cash_balance(d) else null end,
    'total_debts', (select coalesce(sum(b), 0) from (select _customer_balance(id) b from customers) x where b > 0),
    'debtors', (select count(*) from (select _customer_balance(id) b from customers) x where b > 0),
    'open_shipments', (select count(*) from shipments where settlement_id is null),
    'crates_out', (select coalesce(sum(l.crates), 0) from sale_lines l join sales s on s.id = l.sale_id
                   where not s.voided and l.deposit_unit > 0 and s.customer_id is not null)
                  - (select coalesce(sum(count), 0) from crate_returns),
    'pending', case when _has('approve') then
        (select count(*) from sales where approval_status = 'pending' and not voided)
      + (select count(*) from settlements where status = 'pending')
      + (select count(*) from customers where credit_requested and not credit_approved)
      + (select count(*) from profiles where not active and _has('users'))
      + (select count(*) from change_requests where status = 'pending') else 0 end,
    'to_pay', (select coalesce(sum(net_amount), 0) from settlements where status = 'approved'),
    'week', (select coalesce(jsonb_agg(jsonb_build_object('date', g.d, 'total',
              (select coalesce(sum(grand_total), 0) from sales where sale_date = g.d and not voided)) order by g.d), '[]')
             from (select generate_series(d - 6, d, interval '1 day')::date d) g),
    'recent', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', s.id, 'sale_no', s.sale_no, 'customer', coalesce(c.name, nullif(s.customer_name, ''), 'زبون نقدي'),
               'grand_total', s.grand_total, 'payment_type', s.payment_type, 'approval_status', s.approval_status,
               'time', to_char(s.created_at at time zone 'Africa/Cairo', 'HH24:MI')) x
        from sales s left join customers c on c.id = s.customer_id
        where not s.voided order by s.id desc limit 8) t)
  );
end $$;

create or replace function public.report_period(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d1 date := _d(p, 'from'); d2 date := _d(p, 'to');
begin
  perform _need('reports');
  return jsonb_build_object(
    'from', d1, 'to', d2,
    'sales', (select jsonb_build_object(
        'count', count(*), 'goods', coalesce(sum(goods_total), 0), 'deposits', coalesce(sum(deposit_total), 0),
        'discount', coalesce(sum(discount), 0), 'total', coalesce(sum(grand_total), 0),
        'cash', coalesce(sum(grand_total) filter (where payment_type = 'cash'), 0),
        'credit', coalesce(sum(grand_total - paid_amount) filter (where payment_type = 'credit'), 0),
        'credit_paid', coalesce(sum(paid_amount) filter (where payment_type = 'credit'), 0))
      from sales where sale_date between d1 and d2 and not voided),
    'voided', (select count(*) from sales where sale_date between d1 and d2 and voided),
    'collections', (select coalesce(sum(amount), 0) from customer_payments where pay_date between d1 and d2 and not voided),
    'crate_returns', (select jsonb_build_object('count', coalesce(sum(count), 0),
        'cash', coalesce(sum(amount) filter (where method = 'cash'), 0),
        'account', coalesce(sum(amount) filter (where method = 'account'), 0))
      from crate_returns where return_date between d1 and d2),
    'commission', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(gross_sales), 0),
        'commission', coalesce(sum(commission_amount), 0), 'net', coalesce(sum(net_amount), 0))
      from settlements where status in ('approved', 'paid')
        and (coalesce(decided_at, created_at) at time zone 'Africa/Cairo')::date between d1 and d2),
    'supplier_paid', (select coalesce(sum(amount), 0) from cash_movements where category = 'supplier_payment' and mv_date between d1 and d2),
    'cash', cash_day(jsonb_build_object('from', d1, 'to', d2)) - 'movements',
    'expenses', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'total', total) order by total desc), '[]')
                 from (select category, sum(amount) total from cash_movements
                       where direction = 'out' and category in ('transport', 'bill', 'salary', 'other_out', 'withdrawal')
                         and mv_date between d1 and d2 group by category) g),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item', item, 'qty', qty, 'weight', weight, 'amount', amount) order by amount desc), '[]')
              from (select i.name item, sum(l.qty) qty, sum(l.weight) weight, sum(l.amount) amount
                    from sale_lines l join sales s on s.id = l.sale_id join items i on i.id = l.item_id
                    where s.sale_date between d1 and d2 and not s.voided group by i.name) g),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('customer', name, 'count', cnt, 'total', total) order by total desc), '[]')
                  from (select coalesce(c.name, 'زبون نقدي') name, count(*) cnt, sum(s.grand_total) total
                        from sales s left join customers c on c.id = s.customer_id
                        where s.sale_date between d1 and d2 and not s.voided group by coalesce(c.name, 'زبون نقدي')
                        order by sum(s.grand_total) desc limit 15) g),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('date', g.d,
               'sales', (select coalesce(sum(grand_total), 0) from sales where sale_date = g.d and not voided),
               'cash_in', (select coalesce(sum(amount), 0) from cash_movements where mv_date = g.d and direction = 'in'),
               'cash_out', (select coalesce(sum(amount), 0) from cash_movements where mv_date = g.d and direction = 'out'),
               'closing', _cash_balance(g.d)) order by g.d), '[]')
             from (select generate_series(d1, d2, interval '1 day')::date d) g where d2 - d1 <= 62)
  );
end $$;

create or replace function public.report_debts(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need_any(array['reports','collections','customers']);
  return (select coalesce(jsonb_agg(x order by (x->>'balance')::numeric desc), '[]') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'balance', _customer_balance(c.id),
           'credit_limit', c.credit_limit, 'crates', _customer_crates(c.id),
           'last_payment', (select max(pay_date) from customer_payments where customer_id = c.id and not voided),
           'last_sale', (select max(sale_date) from sales where customer_id = c.id and not voided)) x
    from customers c) t
    where (x->>'balance')::numeric <> 0 or jsonb_array_length(x->'crates') > 0);
end $$;

-- ======================= النسخة الاحتياطية ============================

create or replace function public.export_all(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _need('backup');
  return jsonb_build_object(
    'exported_at', now(),
    'shop_settings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from shop_settings x),
    'users', (select coalesce(jsonb_agg(to_jsonb(x) - 'perms'), '[]') from profiles x),
    'crate_types', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from crate_types x),
    'items', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from items x),
    'customers', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('balance', _customer_balance(x.id)) order by id), '[]') from customers x),
    'suppliers', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from suppliers x),
    'shipments', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from shipments x),
    'shipment_items', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from shipment_items x),
    'sales', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from sales x),
    'sale_lines', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from sale_lines x),
    'customer_payments', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from customer_payments x),
    'crate_returns', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from crate_returns x),
    'settlements', (select coalesce(jsonb_agg(to_jsonb(x) - 'details' order by id), '[]') from settlements x),
    'cash_movements', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from cash_movements x),
    'change_requests', (select coalesce(jsonb_agg(to_jsonb(x) order by id), '[]') from change_requests x),
    'cash_shifts', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('user_name', _uname(x.user_id)) order by id), '[]') from cash_shifts x)
  );
end $$;

-- ============================ الحماية ================================
-- الجداول مقفولة تمامًا، وكل التعامل بيتم من خلال الدوال اللي فوق بعد التأكد من الصلاحيات

do $$
declare t text;
begin
  foreach t in array array['profiles','shop_settings','crate_types','items','suppliers','customers','settlements',
                           'shipments','shipment_items','sales','sale_lines','customer_payments','crate_returns','cash_movements',
                           'cash_shifts','change_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.app_bootstrap(jsonb), public.list_users(jsonb), public.save_user(jsonb), public.save_settings(jsonb),
  public.save_crate_type(jsonb), public.save_item(jsonb), public.list_customers(jsonb), public.save_customer(jsonb),
  public.customer_statement(jsonb), public.add_payment(jsonb), public.void_payment(jsonb), public.return_crates(jsonb),
  public.list_suppliers(jsonb), public.save_supplier(jsonb), public.save_shipment(jsonb), public.delete_shipment(jsonb),
  public.list_shipments(jsonb), public.shipment_detail(jsonb), public.available_stock(jsonb), public.get_sale(jsonb),
  public.create_sale(jsonb), public.list_sales(jsonb), public.void_sale(jsonb), public.preview_settlement(jsonb),
  public.get_settlement(jsonb), public.create_settlement(jsonb), public.list_settlements(jsonb),
  public.decide_settlement(jsonb), public.pay_settlement(jsonb), public.pending_approvals(jsonb), public.decide_sale(jsonb),
  public.decide_customer_credit(jsonb), public.add_cash(jsonb), public.cash_day(jsonb), public.dashboard(jsonb),
  public.report_period(jsonb), public.report_debts(jsonb), public.export_all(jsonb),
  public.current_shift(jsonb), public.open_shift(jsonb), public.close_shift(jsonb), public.shift_report(jsonb),
  public.list_shifts(jsonb), public.edit_sale(jsonb), public.list_stock(jsonb), public.stock_adjust(jsonb),
  public.request_change(jsonb), public.decide_change(jsonb), public.list_requests(jsonb), public.edit_settlement(jsonb),
  public.report_sales_detail(jsonb), public.report_money(jsonb), public.report_zimam(jsonb), public.rate_customer(jsonb)
to authenticated;

-- تم ✔
