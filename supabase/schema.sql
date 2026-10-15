-- =====================================================================
-- Lapo Doli: skema database untuk Supabase (PostgreSQL)
--
-- Cara pakai: buka Supabase > SQL Editor > New query, tempel seluruh isi
-- file ini, lalu tekan Run. Aman dijalankan ulang.
-- Setelah itu daftarkan email admin (lihat README, langkah 3).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Admin
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);

-- Dipakai oleh aturan keamanan: apakah pengguna yang login adalah admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Tabel
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          text primary key,
  name        text not null,
  description text not null default '',
  price       integer not null default 0 check (price >= 0),
  emoji       text not null default '',
  available   boolean not null default true,
  sort        integer not null default 0,
  -- varian: [{"name":"250ml","price":35000}, {"name":"Pakai gota"}]; tanpa price = ikut harga menu
  options     jsonb not null default '[]'::jsonb,
  -- tambahan: [{"id":"nasi","name":"Nasi","price":5000}]
  addons      jsonb not null default '[]'::jsonb,
  -- alamat gambar: jalur di storage "menu" atau alamat statis seperti /assets/menu/x.svg
  image       text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.pos (
  id         text primary key,
  date       date not null unique,
  open       boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id   text primary key default 'shop',
  data jsonb not null default '{}'::jsonb
);

-- Penghitung nomor pesanan per PO (hanya diakses lewat fungsi create_orders)
create table if not exists public.counters (
  po_id text primary key references public.pos(id) on delete cascade,
  n     integer not null default 0
);

create table if not exists public.orders (
  id          text primary key,                 -- contoh: 1809-03 (tanggal PO + urutan)
  gid         text not null,                    -- pengikat pesanan gabungan beberapa tanggal
  po_id       text not null references public.pos(id) on delete restrict,
  po_date     date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  source      text not null default 'web',      -- web atau wa
  nama        text not null,
  hp          text not null,
  fulfil      text not null check (fulfil in ('antar', 'ambil')),
  area        text not null default '',
  alamat      text not null default '',
  pickup_loc  text not null default '',
  notes       text not null default '',
  method      text not null check (method in ('transfer', 'qris')),
  items       jsonb not null,
  ongkir      integer not null default 0 check (ongkir >= 0),
  total       integer not null check (total >= 0),
  group_total integer not null check (group_total >= 0),
  group_count integer not null default 1,
  hours       text not null default '',
  pay_status  text not null default 'cek' check (pay_status in ('cek', 'lunas', 'ditolak')),
  status      text not null default 'baru' check (status in ('baru', 'diproses', 'diantar', 'selesai', 'batal'))
);
create index if not exists orders_po_idx on public.orders (po_id);
create index if not exists orders_gid_idx on public.orders (gid);
create index if not exists orders_created_idx on public.orders (created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Aturan keamanan (Row Level Security)
--    - Semua orang boleh MELIHAT menu, PO, dan pengaturan toko.
--    - Hanya admin yang boleh mengubah apa pun, dan hanya admin yang boleh melihat pesanan.
--    - Pembeli membuat pesanan lewat fungsi create_orders, bukan menulis tabel langsung.
-- ---------------------------------------------------------------------
alter table public.admins   enable row level security;
alter table public.products enable row level security;
alter table public.pos      enable row level security;
alter table public.settings enable row level security;
alter table public.counters enable row level security;
alter table public.orders   enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (true);
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists pos_read on public.pos;
create policy pos_read on public.pos for select using (true);
drop policy if exists pos_admin on public.pos;
create policy pos_admin on public.pos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists orders_admin on public.orders;
create policy orders_admin on public.orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- counters: tanpa kebijakan = tidak ada akses langsung

revoke all on public.orders, public.counters, public.admins from anon;
revoke all on public.counters from authenticated;

-- ---------------------------------------------------------------------
-- 4. Nomor HP: samakan format (0812... dan +62812... dianggap sama)
-- ---------------------------------------------------------------------
create or replace function public.norm_hp(t text)
returns text language sql immutable as $$
  select case when d like '0%' then '62' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) s;
$$;

-- ---------------------------------------------------------------------
-- 5. Membuat pesanan (dipanggil pembeli dan admin)
--    Semua dicek di server: PO masih dibuka dan belum lewat jam tutup,
--    harga dihitung ulang dari tabel menu (pembeli tidak bisa mengubah harga),
--    nomor pesanan dibuat atomik per PO.
--
--    payload:
--      { nama, hp, fulfil: 'antar'|'ambil', area, alamat, notes, method: 'transfer'|'qris',
--        groups: [ { po_id, lines: [ { pid, opt?, addon?, qty, note? } ] } ],
--        -- khusus admin: ongkir, paid, source
--      }
-- ---------------------------------------------------------------------
create or replace function public.create_orders(payload jsonb, as_admin boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  v_cutoff text; v_hours text; v_pick_hours text; v_pick_loc text; v_flat integer;
  v_fulfil text; v_method text; v_nama text; v_hp text; v_area text; v_alamat text; v_notes text;
  v_gid text; v_source text; v_paid boolean; v_ongkir integer; v_total_all integer := 0; v_count integer;
  grp jsonb; line jsonb; g jsonb;
  p public.products; po public.pos;
  built jsonb := '[]'::jsonb; items jsonb; food integer; qty integer; price integer;
  opts jsonb; opt jsonb; idx integer; ad jsonb; addon_id text;
  mainq jsonb; addq jsonb; k text; seq integer; oid text; out jsonb := '[]'::jsonb;
begin
  if as_admin and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select data into st from public.settings where id = 'shop';
  st := coalesce(st, '{}'::jsonb);
  v_cutoff := case when coalesce(st ->> 'poCutoff', '') ~ '^\d{1,2}[:.]\d{2}$'
                   then lpad(replace(st ->> 'poCutoff', '.', ':'), 5, '0') else '10:00' end;
  v_hours := coalesce(nullif(st ->> 'deliveryHours', ''), '12.00 - 14.00');
  v_pick_hours := coalesce(nullif(st ->> 'pickupHours', ''), v_hours);
  v_pick_loc := coalesce(nullif(st ->> 'pickupLocation', ''), 'Bassura City Mall, Lobi Selatan');
  v_flat := coalesce(nullif(st ->> 'ongkir', '')::integer, 10000);

  v_nama := btrim(coalesce(payload ->> 'nama', ''));
  if char_length(v_nama) < 2 or char_length(v_nama) > 80 then raise exception 'invalid_nama'; end if;
  v_hp := btrim(coalesce(payload ->> 'hp', ''));
  if regexp_replace(v_hp, '[\s-]', '', 'g') !~ '^(\+?62|0)8[0-9]{7,12}$' then raise exception 'invalid_hp'; end if;
  v_fulfil := coalesce(payload ->> 'fulfil', 'antar');
  if v_fulfil not in ('antar', 'ambil') then raise exception 'invalid_fulfil'; end if;
  v_method := coalesce(payload ->> 'method', 'transfer');
  if v_method not in ('transfer', 'qris') then raise exception 'invalid_method'; end if;
  if v_fulfil = 'antar' then
    v_area := coalesce(payload ->> 'area', '');
    if v_area not in ('Jakarta Pusat', 'Jakarta Utara', 'Jakarta Barat', 'Jakarta Selatan', 'Jakarta Timur') then
      raise exception 'invalid_area';
    end if;
    v_alamat := btrim(coalesce(payload ->> 'alamat', ''));
    if char_length(v_alamat) < 10 or char_length(v_alamat) > 300 then raise exception 'invalid_alamat'; end if;
  else
    v_area := ''; v_alamat := '';
  end if;
  v_notes := left(btrim(coalesce(payload ->> 'notes', '')), 300);
  v_source := case when as_admin then coalesce(nullif(payload ->> 'source', ''), 'wa') else 'web' end;
  v_paid := as_admin and coalesce((payload ->> 'paid')::boolean, false);

  if jsonb_typeof(payload -> 'groups') is distinct from 'array'
     or jsonb_array_length(payload -> 'groups') = 0
     or jsonb_array_length(payload -> 'groups') > 10 then
    raise exception 'invalid_groups';
  end if;
  v_gid := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- Tahap 1: validasi dan hitung harga tiap tanggal PO
  for grp in select e.value from jsonb_array_elements(payload -> 'groups') e loop
    select * into po from public.pos where id = grp ->> 'po_id';
    if not found then raise exception 'po_not_found'; end if;
    if exists (select 1 from jsonb_array_elements(built) b where b ->> 'po_id' = po.id) then
      raise exception 'duplicate_po';
    end if;
    if not as_admin then
      if not po.open or now() >= ((po.date::text || ' ' || v_cutoff || ':00+07')::timestamptz) then
        raise exception 'po_closed:%', to_char(po.date, 'YYYY-MM-DD');
      end if;
    end if;

    items := '[]'::jsonb; food := 0; mainq := '{}'::jsonb; addq := '{}'::jsonb;
    if jsonb_typeof(grp -> 'lines') is distinct from 'array' or jsonb_array_length(grp -> 'lines') > 60 then
      raise exception 'invalid_lines';
    end if;
    for line in select e.value from jsonb_array_elements(grp -> 'lines') e loop
      qty := (line ->> 'qty')::integer;
      if qty is null or qty < 1 or qty > 99 then raise exception 'invalid_qty'; end if;
      select * into p from public.products where id = line ->> 'pid';
      if not found or (not p.available and not as_admin) then
        raise exception 'menu_unavailable:%', coalesce(line ->> 'pid', '');
      end if;

      if nullif(line ->> 'addon', '') is not null then
        addon_id := line ->> 'addon'; ad := null;
        select e.value into ad from jsonb_array_elements(p.addons) e where e.value ->> 'id' = addon_id limit 1;
        if ad is null then raise exception 'invalid_addon'; end if;
        price := coalesce((ad ->> 'price')::integer, 0);
        items := items || jsonb_build_array(jsonb_build_object(
          'pid', p.id, 'name', ad ->> 'name', 'option', 'untuk ' || p.name, 'addon', true,
          'note', '', 'price', price, 'qty', qty));
        k := p.id || '::' || addon_id;
        addq := jsonb_set(addq, array[k], to_jsonb(coalesce((addq ->> k)::integer, 0) + qty));
      else
        opts := p.options;
        if jsonb_array_length(opts) > 0 then
          if nullif(line ->> 'opt', '') is null then raise exception 'option_required'; end if;
          idx := (line ->> 'opt')::integer;
          if idx < 0 or idx >= jsonb_array_length(opts) then raise exception 'invalid_option'; end if;
          opt := opts -> idx;
          price := coalesce((opt ->> 'price')::integer, p.price);
          items := items || jsonb_build_array(jsonb_build_object(
            'pid', p.id, 'name', p.name, 'option', opt ->> 'name', 'addon', false,
            'note', left(btrim(coalesce(line ->> 'note', '')), 120), 'price', price, 'qty', qty));
        else
          price := p.price;
          items := items || jsonb_build_array(jsonb_build_object(
            'pid', p.id, 'name', p.name, 'option', '', 'addon', false,
            'note', left(btrim(coalesce(line ->> 'note', '')), 120), 'price', price, 'qty', qty));
        end if;
        mainq := jsonb_set(mainq, array[p.id], to_jsonb(coalesce((mainq ->> p.id)::integer, 0) + qty));
      end if;
      food := food + price * qty;
    end loop;

    if mainq = '{}'::jsonb then raise exception 'empty_group'; end if;
    for k in select jsonb_object_keys(addq) loop
      if (addq ->> k)::integer > coalesce((mainq ->> split_part(k, '::', 1))::integer, 0) then
        raise exception 'addon_exceeds_main';
      end if;
    end loop;

    if as_admin and nullif(payload ->> 'ongkir', '') is not null then
      v_ongkir := greatest(0, (payload ->> 'ongkir')::integer);
    else
      v_ongkir := case when v_fulfil = 'antar' then v_flat else 0 end;
    end if;
    v_total_all := v_total_all + food + v_ongkir;
    built := built || jsonb_build_array(jsonb_build_object(
      'po_id', po.id, 'po_date', po.date, 'items', items, 'food', food, 'ongkir', v_ongkir));
  end loop;
  v_count := jsonb_array_length(built);

  -- Tahap 2: simpan, dengan nomor urut atomik per PO (contoh 1809-03)
  for g in select e.value from jsonb_array_elements(built) e loop
    insert into public.counters (po_id, n) values (g ->> 'po_id', 1)
      on conflict (po_id) do update set n = public.counters.n + 1
      returning n into seq;
    oid := to_char((g ->> 'po_date')::date, 'DDMM') || '-' || lpad(seq::text, 2, '0');
    insert into public.orders (id, gid, po_id, po_date, source, nama, hp, fulfil, area, alamat, pickup_loc,
                               notes, method, items, ongkir, total, group_total, group_count, hours, pay_status)
    values (oid, v_gid, g ->> 'po_id', (g ->> 'po_date')::date, v_source, v_nama, v_hp, v_fulfil, v_area, v_alamat,
            case when v_fulfil = 'ambil' then v_pick_loc else '' end,
            v_notes, v_method, g -> 'items', (g ->> 'ongkir')::integer,
            (g ->> 'food')::integer + (g ->> 'ongkir')::integer, v_total_all, v_count,
            case when v_fulfil = 'ambil' then v_pick_hours else v_hours end,
            case when v_paid then 'lunas' else 'cek' end);
    out := out || jsonb_build_array(jsonb_build_object(
      'id', oid, 'gid', v_gid, 'po_id', g ->> 'po_id', 'po_date', g ->> 'po_date',
      'total', (g ->> 'food')::integer + (g ->> 'ongkir')::integer, 'fulfil', v_fulfil,
      'hours', case when v_fulfil = 'ambil' then v_pick_hours else v_hours end,
      'pickup_loc', case when v_fulfil = 'ambil' then v_pick_loc else '' end,
      'items', g -> 'items'));
  end loop;

  return out;
end;
$$;

revoke all on function public.create_orders(jsonb, boolean) from public;
grant execute on function public.create_orders(jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Cek status pesanan oleh pembeli (butuh nomor pesanan dan nomor HP yang sama)
-- ---------------------------------------------------------------------
create or replace function public.track_orders(ids text[], phone text)
returns table (id text, po_date date, fulfil text, hours text, pickup_loc text, total integer, pay_status text, status text)
language sql stable security definer
set search_path = public
as $$
  select o.id, o.po_date, o.fulfil, o.hours, o.pickup_loc, o.total, o.pay_status, o.status
  from public.orders o
  where coalesce(array_length(ids, 1), 0) between 1 and 20
    and o.id = any (ids)
    and public.norm_hp(o.hp) = public.norm_hp(phone)
  order by o.po_date, o.id;
$$;

revoke all on function public.track_orders(text[], text) from public;
grant execute on function public.track_orders(text[], text) to anon, authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Update langsung ke layar admin (Realtime) dan penyimpanan gambar
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['products', 'pos', 'settings', 'orders'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('menu', 'menu', true)
      on conflict (id) do update set public = true;
    execute 'drop policy if exists menu_public_read on storage.objects';
    execute $p$create policy menu_public_read on storage.objects for select using (bucket_id = 'menu')$p$;
    execute 'drop policy if exists menu_admin_insert on storage.objects';
    execute $p$create policy menu_admin_insert on storage.objects for insert to authenticated
               with check (bucket_id = 'menu' and public.is_admin())$p$;
    execute 'drop policy if exists menu_admin_update on storage.objects';
    execute $p$create policy menu_admin_update on storage.objects for update to authenticated
               using (bucket_id = 'menu' and public.is_admin())$p$;
    execute 'drop policy if exists menu_admin_delete on storage.objects';
    execute $p$create policy menu_admin_delete on storage.objects for delete to authenticated
               using (bucket_id = 'menu' and public.is_admin())$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. Data awal: pengaturan toko dan menu (boleh diubah nanti dari halaman admin)
-- ---------------------------------------------------------------------
insert into public.settings (id, data) values ('shop', jsonb_build_object(
  'waNumber', '6281375205386',
  'bankName', 'Seabank',
  'bankNumber', '901912654821',
  'bankHolder', 'a.n. Ricky Halomoan',
  'ongkir', 10000,
  'qrisPath', '/assets/qris.png',
  'deliveryHours', '12.00 - 14.00',
  'pickupHours', '12.00 - 14.00',
  'pickupLocation', 'Bassura City Mall, Lobi Selatan',
  'poCutoff', '10:00'
)) on conflict (id) do nothing;

insert into public.products (id, name, description, price, emoji, available, sort, options, addons, image) values
  ('kecap', 'Babi Kecap', 'Babi empuk dimasak manis gurih dengan kecap dan bumbu rempah.', 35000, '🍖', true, 1,
   '[{"name":"250ml","price":35000},{"name":"500ml","price":70000}]',
   '[{"id":"nasi","name":"Nasi","price":5000},{"id":"sop","name":"Sop","price":0}]', '/assets/menu/babi-kecap.svg'),
  ('saksang', 'Babi Saksang', 'Khas Batak, bumbu andaliman dan rempah pekat, pedas harum.', 40000, '🥘', true, 2,
   '[{"name":"Pakai gota"},{"name":"Tidak pakai gota"}]',
   '[{"id":"nasi","name":"Nasi","price":5000},{"id":"sop","name":"Sop","price":0}]', '/assets/menu/babi-saksang.svg'),
  ('teri', 'Teri Medan Balado', 'Teri Medan renyah dengan sambal balado pedas.', 25000, '🌶️', true, 3,
   '[{"name":"250ml","price":25000},{"name":"500ml","price":50000}]',
   '[{"id":"nasi","name":"Nasi","price":5000}]', '/assets/menu/teri-medan-balado.svg'),
  ('napinadar', 'Ayam Napinadar', 'Ayam khas Batak Toba berbumbu andaliman, pedas dan harum.', 40000, '🍗', true, 4,
   '[{"name":"250ml - Pakai gota","price":40000},{"name":"250ml - Tidak pakai gota","price":40000},{"name":"500ml - Pakai gota","price":75000},{"name":"500ml - Tidak pakai gota","price":75000}]',
   '[{"id":"nasi","name":"Nasi","price":5000}]', '/assets/menu/ayam-napinadar.svg')
on conflict (id) do nothing;
