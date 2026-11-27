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
  -- admin = email terdaftar di tabel admins DAN akun login dengan email itu sudah terverifikasi
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and exists (
        select 1 from auth.users u
        where u.id = auth.uid() and lower(u.email) = lower(a.email) and u.email_confirmed_at is not null
      )
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
-- batas porsi per tanggal PO; kosong = tanpa batas
alter table public.products add column if not exists quota integer check (quota is null or quota >= 0);

create table if not exists public.pos (
  id         text primary key,
  date       date not null unique,
  open       boolean not null default true,
  created_at timestamptz not null default now()
);
-- PO terjadwal: belum bisa dipesan sebelum waktu ini (kosong = langsung buka)
alter table public.pos add column if not exists opens_at timestamptz;
-- batas tutup khusus PO ini (HH:MM, jam Jakarta). Kosong = pakai jam di Pengaturan.
alter table public.pos add column if not exists cutoff text not null default '' check (cutoff = '' or cutoff ~ '^[0-2][0-9]:[0-5][0-9]$');
-- kuota khusus PO ini per menu, mis. {"kecap": 12}. Menu yang tidak ada di sini ikut kuota menu.
alter table public.pos add column if not exists quotas jsonb not null default '{}'::jsonb;

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
-- kode unik 1-100 yang ditambahkan ke jumlah bayar (hanya di pesanan pertama dari satu kali checkout)
alter table public.orders add column if not exists kode integer not null default 0 check (kode between 0 and 999);
-- jalur foto bukti bayar di bucket privat 'proofs' (kosong = belum ada)
alter table public.orders add column if not exists proof_path text not null default '';
-- kunci idempotensi dari browser: kirim ulang karena sinyal putus tidak membuat pesanan ganda
alter table public.orders add column if not exists client_ref text;
-- tautan lokasi Google Maps yang dipilih pembeli (hanya tautan Google, maksimal 300 karakter)
alter table public.orders add column if not exists maps_url text not null default '';
-- pembeli yang pesanannya sudah dibatalkan sistem tapi merasa sudah transfer menekan "Saya sudah transfer"
alter table public.orders add column if not exists claimed_at timestamptz;
-- pesanan lunas yang dibatalkan: perlu dikembalikan uangnya ('perlu') atau sudah ('selesai')
alter table public.orders add column if not exists refund text not null default '' check (refund in ('', 'perlu', 'selesai'));
-- perpanjangan batas bayar yang dipakai pembeli (sekali, 30 menit)
alter table public.orders add column if not exists extra_min integer not null default 0 check (extra_min in (0, 30));

-- Batas bayar (menit) diatur admin di Pengaturan (payWindowMin, 15 sampai 240, bawaan 60)
create or replace function public.pay_window()
returns interval
language sql stable security definer
set search_path = public
as $$
  select make_interval(mins => greatest(15, least(240, coalesce((select nullif(data ->> 'payWindowMin', '')::integer from public.settings where id = 'shop'), 60))));
$$;
create or replace function public.order_deadline(p_created timestamptz, p_extra integer)
returns timestamptz
language sql stable security definer
set search_path = public
as $$
  select p_created + public.pay_window() + make_interval(mins => coalesce(p_extra, 0));
$$;
revoke all on function public.pay_window() from public;
revoke all on function public.order_deadline(timestamptz, integer) from public;
grant execute on function public.pay_window() to anon, authenticated;
grant execute on function public.order_deadline(timestamptz, integer) to anon, authenticated;
create index if not exists orders_ref_idx on public.orders (client_ref) where client_ref is not null;
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
create index if not exists orders_hp_idx on public.orders (public.norm_hp(hp), created_at desc);

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
-- Urutan nomor pesanan: 01..99, lalu 100, 101, ... (lpad memotong angka yang lebih panjang dari 2 digit)
create or replace function public.fmt_seq(n integer)
returns text language sql immutable as $$ select case when n < 100 then lpad(n::text, 2, '0') else n::text end $$;

create or replace function public.create_orders(payload jsonb, as_admin boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  v_cutoff text; v_hours text; v_pick_hours text; v_pick_loc text; v_flat integer;
  v_fulfil text; v_method text; v_nama text; v_hp text; v_area text; v_alamat text; v_maps text; v_notes text;
  v_gid text; v_source text; v_paid boolean; v_ongkir integer; v_total_all integer := 0; v_count integer;
  grp jsonb; line jsonb; g jsonb;
  p public.products; po public.pos;
  built jsonb := '[]'::jsonb; items jsonb; food integer; qty integer; price integer;
  opts jsonb; opt jsonb; idx integer; ad jsonb; addon_id text;
  mainq jsonb; addq jsonb; k text; seq integer; v_quota integer; v_sold integer; v_kode integer := 0; v_first boolean := true; v_use_kode boolean := false; n_try integer; v_ref text; v_prev jsonb; oid text; out jsonb := '[]'::jsonb;
begin
  if as_admin and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Kirim ulang dengan kunci yang sama (dan nomor HP yang sama) mengembalikan pesanan yang sudah ada
  v_ref := case when as_admin then null else nullif(left(btrim(coalesce(payload ->> 'ref', '')), 40), '') end;
  if v_ref is not null then
    if v_ref !~ '^[A-Za-z0-9-]{8,40}$' then raise exception 'invalid_ref'; end if;
    perform pg_advisory_xact_lock(hashtext(v_ref));
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'gid', o.gid, 'po_id', o.po_id, 'po_date', o.po_date, 'total', o.total,
             'fulfil', o.fulfil, 'hours', o.hours, 'pickup_loc', o.pickup_loc, 'kode', o.kode, 'items', o.items) order by o.po_date, o.id), '[]'::jsonb)
      into v_prev from public.orders o
      where o.client_ref = v_ref and public.norm_hp(o.hp) = public.norm_hp(payload ->> 'hp');
    if jsonb_array_length(v_prev) > 0 then return v_prev; end if;
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
    v_maps := btrim(coalesce(payload ->> 'maps', ''));
    if char_length(v_maps) > 300 or v_maps !~ '^https://(www\.google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl)([/?]|$)' then v_maps := ''; end if;
  else
    v_area := ''; v_alamat := ''; v_maps := '';
  end if;
  v_notes := left(btrim(coalesce(payload ->> 'notes', '')), 300);
  -- Batasi spam (admin dikecualikan): satu nomor HP maksimal 3 kali kirim pesanan dalam 10 menit,
  -- dan maksimal 3 pesanan yang masih menunggu bayar (belum ada bukti, belum 1 jam) pada saat yang sama
  if not as_admin and (
       select count(distinct o.gid) from public.orders o
       where o.created_at > now() - interval '10 minutes' and public.norm_hp(o.hp) = public.norm_hp(v_hp)
     ) >= 3 then
    raise exception 'rate_limited';
  end if;
  if not as_admin and (
       select count(distinct o.gid) from public.orders o
       where o.status = 'baru' and o.pay_status = 'cek' and o.proof_path = ''
         and public.order_deadline(o.created_at, o.extra_min) > now() and public.norm_hp(o.hp) = public.norm_hp(v_hp)
     ) >= 3 then
    raise exception 'too_many_pending';
  end if;
  v_source := case when as_admin then coalesce(nullif(payload ->> 'source', ''), 'wa') else 'web' end;
  v_paid := as_admin and coalesce((payload ->> 'paid')::boolean, false);
  v_use_kode := not as_admin and coalesce(st ->> 'uniqueCode', 'true') <> 'false';

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
      if po.opens_at is not null and now() < po.opens_at then
        raise exception 'po_not_open:%', to_char(po.date, 'YYYY-MM-DD');
      end if;
      if not po.open or now() >= ((po.date::text || ' ' || coalesce(nullif(po.cutoff, ''), v_cutoff) || ':00+07')::timestamptz) then
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

    -- Kuota porsi per menu untuk tanggal PO ini (baris menu dikunci supaya dua pembeli tidak sama-sama lolos)
    if not as_admin then
      for k in select jsonb_object_keys(mainq) loop
        select quota into v_quota from public.products where id = k for update;
        v_quota := coalesce(nullif(po.quotas ->> k, '')::integer, v_quota);
        if v_quota is not null then
          select coalesce(sum((i.value ->> 'qty')::integer), 0) into v_sold
          from public.orders o, jsonb_array_elements(o.items) i
          where o.po_id = po.id and o.status <> 'batal' and o.pay_status <> 'ditolak'
            and not (o.pay_status = 'cek' and o.proof_path = '' and public.order_deadline(o.created_at, o.extra_min) < now())
            and i.value ->> 'pid' = k and not coalesce((i.value ->> 'addon')::boolean, false);
          if v_sold + (mainq ->> k)::integer > v_quota then
            raise exception 'sold_out:%:%', k, greatest(0, v_quota - v_sold);
          end if;
        end if;
      end loop;
    end if;

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

  -- Kode unik 1-100 dibuat di server: tidak sama dengan pesanan lain yang masih menunggu bayar dengan total yang sama
  if v_use_kode then
    for n_try in 1..100 loop
      v_kode := 1 + floor(random() * 100)::integer;
      exit when not exists (
        select 1 from public.orders o
        where o.kode = v_kode and o.group_total = v_total_all and o.pay_status = 'cek'
          and o.status <> 'batal' and public.order_deadline(o.created_at, o.extra_min) > now());
    end loop;
  end if;

  -- Tahap 2: simpan, dengan nomor urut atomik per PO (contoh 1809-03)
  for g in select e.value from jsonb_array_elements(built) e loop
    insert into public.counters (po_id, n) values (g ->> 'po_id', 1)
      on conflict (po_id) do update set n = public.counters.n + 1
      returning n into seq;
    oid := to_char((g ->> 'po_date')::date, 'DDMM') || '-' || public.fmt_seq(seq);
    -- Tanggal yang sama di tahun berikutnya memakai awalan DDMM yang sama: lewati nomor yang sudah terpakai
    while exists (select 1 from public.orders where id = oid) loop
      seq := seq + 1;
      oid := to_char((g ->> 'po_date')::date, 'DDMM') || '-' || public.fmt_seq(seq);
    end loop;
    update public.counters set n = greatest(n, seq) where po_id = g ->> 'po_id';
    insert into public.orders (id, gid, po_id, po_date, source, nama, hp, fulfil, area, alamat, maps_url, pickup_loc,
                               notes, method, items, ongkir, total, group_total, group_count, hours, pay_status, kode, client_ref)
    values (oid, v_gid, g ->> 'po_id', (g ->> 'po_date')::date, v_source, v_nama, v_hp, v_fulfil, v_area, v_alamat, v_maps,
            case when v_fulfil = 'ambil' then v_pick_loc else '' end,
            v_notes, v_method, g -> 'items', (g ->> 'ongkir')::integer,
            (g ->> 'food')::integer + (g ->> 'ongkir')::integer, v_total_all, v_count,
            case when v_fulfil = 'ambil' then v_pick_hours else v_hours end,
            case when v_paid then 'lunas' else 'cek' end,
            case when v_first then v_kode else 0 end, v_ref);
    out := out || jsonb_build_array(jsonb_build_object(
      'id', oid, 'gid', v_gid, 'po_id', g ->> 'po_id', 'po_date', g ->> 'po_date',
      'total', (g ->> 'food')::integer + (g ->> 'ongkir')::integer, 'fulfil', v_fulfil,
      'kode', case when v_first then v_kode else 0 end,
      'hours', case when v_fulfil = 'ambil' then v_pick_hours else v_hours end,
      'pickup_loc', case when v_fulfil = 'ambil' then v_pick_loc else '' end,
      'items', g -> 'items'));
    v_first := false;
  end loop;

  return out;
end;
$$;

revoke all on function public.create_orders(jsonb, boolean) from public;
grant execute on function public.create_orders(jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Cek status pesanan oleh pembeli (butuh nomor pesanan dan nomor HP yang sama)
-- ---------------------------------------------------------------------
drop function if exists public.track_orders(text[], text);
create or replace function public.track_orders(ids text[], phone text)
returns table (id text, po_date date, fulfil text, hours text, pickup_loc text, total integer, pay_status text, status text, has_proof boolean, claimed boolean, deadline timestamptz, extended boolean)
language sql stable security definer
set search_path = public
as $$
  select o.id, o.po_date, o.fulfil, o.hours, o.pickup_loc, o.total, o.pay_status, o.status, (o.proof_path <> '') as has_proof, (o.claimed_at is not null) as claimed, public.order_deadline(o.created_at, o.extra_min) as deadline, (o.extra_min > 0) as extended
  from public.orders o
  where coalesce(array_length(ids, 1), 0) between 1 and 20
    and o.id = any (ids)
    and public.norm_hp(o.hp) = public.norm_hp(phone)
  order by o.po_date, o.id;
$$;

revoke all on function public.track_orders(text[], text) from public;
grant execute on function public.track_orders(text[], text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6c. Bukti bayar: pembeli mengunggah foto, lalu mengaitkannya ke pesanan lewat kode gabungan (gid)
--     dan nomor HP yang sama. Hanya admin yang bisa melihat fotonya.
-- ---------------------------------------------------------------------
create or replace function public.attach_proof(p_gid text, phone text, p_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_gid !~ '^[A-Z0-9]{8}$' or p_path !~ ('^' || p_gid || '/[A-Za-z0-9_.-]{6,80}$') then
    return false;
  end if;
  -- bukti baru setelah ditolak mengembalikan status ke 'cek' supaya admin memeriksanya lagi
  update public.orders set proof_path = p_path, pay_status = case when pay_status = 'ditolak' then 'cek' else pay_status end
   where gid = p_gid and public.norm_hp(hp) = public.norm_hp(phone)
     and (status <> 'batal' or claimed_at is not null) and pay_status <> 'lunas';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.attach_proof(text, text, text) from public;
grant execute on function public.attach_proof(text, text, text) to anon, authenticated;

-- Pembeli yang pesanannya dibatalkan otomatis (belum bayar dalam 1 jam) tapi sudah transfer:
-- menandai pesanan supaya admin melihatnya, dan mengizinkan unggah bukti. Hanya dalam 24 jam, sekali saja.
create or replace function public.claim_paid(p_gid text, phone text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_gid !~ '^[A-Z0-9]{8}$' then return 0; end if;
  update public.orders set claimed_at = now()
   where gid = p_gid and public.norm_hp(hp) = public.norm_hp(phone)
     and status = 'batal' and pay_status = 'cek' and refund = '' and claimed_at is null
     and created_at > now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.claim_paid(text, text) from public;
grant execute on function public.claim_paid(text, text) to anon, authenticated;

-- Pembeli menambah waktu bayar 30 menit, sekali, selama batas belum lewat dan belum ada bukti.
create or replace function public.extend_pay(p_gid text, phone text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_gid !~ '^[A-Z0-9]{8}$' then return 0; end if;
  update public.orders set extra_min = 30
   where gid = p_gid and public.norm_hp(hp) = public.norm_hp(phone)
     and status = 'baru' and pay_status = 'cek' and proof_path = '' and extra_min = 0
     and public.order_deadline(created_at, 0) > now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.extend_pay(text, text) from public;
grant execute on function public.extend_pay(text, text) to anon, authenticated;

-- Pembeli membatalkan pesanannya sendiri selama belum ada bukti bayar dan belum dikonfirmasi.
-- Dicocokkan dengan kode gabungan (gid) dan nomor HP yang sama. Setelah bukti terkirim, pembatalan lewat admin.
create or replace function public.cancel_orders(p_gid text, phone text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_gid !~ '^[A-Z0-9]{8}$' then return 0; end if;
  update public.orders set status = 'batal'
   where gid = p_gid and public.norm_hp(hp) = public.norm_hp(phone)
     and status = 'baru' and pay_status = 'cek' and proof_path = '';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.cancel_orders(text, text) from public;
grant execute on function public.cancel_orders(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6b. Sisa kuota per menu dan tanggal PO (dibaca publik, hanya angka)
-- ---------------------------------------------------------------------
create or replace function public.po_remaining()
returns table (po_id text, pid text, remaining integer)
language sql stable security definer
set search_path = public
as $$
  select p.id as po_id, pr.id as pid,
         greatest(0, coalesce(nullif(p.quotas ->> pr.id, '')::integer, pr.quota) - coalesce(s.sold, 0))::integer as remaining
  from public.pos p
  cross join public.products pr
  left join (
    select o.po_id, i.value ->> 'pid' as pid, sum((i.value ->> 'qty')::integer) as sold
    from public.orders o, jsonb_array_elements(o.items) i
    where o.status <> 'batal' and o.pay_status <> 'ditolak'
      and not (o.pay_status = 'cek' and o.proof_path = '' and public.order_deadline(o.created_at, o.extra_min) < now())
      and not coalesce((i.value ->> 'addon')::boolean, false)
    group by 1, 2
  ) s on s.po_id = p.id and s.pid = pr.id
  where coalesce(nullif(p.quotas ->> pr.id, '')::integer, pr.quota) is not null;
$$;
revoke all on function public.po_remaining() from public;
grant execute on function public.po_remaining() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6d. Admin: ubah jumlah item pesanan (harga satuan tetap dari pesanan, total dihitung ulang di server)
--     Hanya untuk pesanan satu tanggal. Jumlah 0 menghapus baris. Tambahan tidak boleh melebihi menu utama.
-- ---------------------------------------------------------------------
create or replace function public.admin_edit_items(p_id text, p_qty integer[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare o public.orders%rowtype; it jsonb; n jsonb := '[]'::jsonb; i integer; q integer; food integer := 0; mainq jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into o from public.orders where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if o.group_count > 1 then raise exception 'group_order'; end if;
  if jsonb_array_length(o.items) <> coalesce(array_length(p_qty, 1), 0) then raise exception 'bad_items'; end if;
  i := 0;
  for it in select value from jsonb_array_elements(o.items) loop
    i := i + 1; q := p_qty[i];
    if q is null or q < 0 or q > 99 then raise exception 'bad_qty'; end if;
    if not coalesce((it ->> 'addon')::boolean, false) then
      mainq := mainq || jsonb_build_object(it ->> 'pid', coalesce((mainq ->> (it ->> 'pid'))::integer, 0) + q);
    end if;
  end loop;
  i := 0;
  for it in select value from jsonb_array_elements(o.items) loop
    i := i + 1; q := p_qty[i];
    if coalesce((it ->> 'addon')::boolean, false) and q > coalesce((mainq ->> (it ->> 'pid'))::integer, 0) then
      raise exception 'addon_exceeds_main';
    end if;
    if q > 0 then n := n || jsonb_set(it, '{qty}', to_jsonb(q)); food := food + (it ->> 'price')::integer * q; end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(n) e where not coalesce((e ->> 'addon')::boolean, false)) then
    raise exception 'empty_order';
  end if;
  update public.orders set items = n, total = food + ongkir, group_total = food + ongkir where id = p_id;
  return food + o.ongkir;
end;
$$;
revoke all on function public.admin_edit_items(text, integer[]) from public;
grant execute on function public.admin_edit_items(text, integer[]) to authenticated;

-- ---------------------------------------------------------------------
-- 6e. Log aktivitas admin dan catatan pelanggan (hanya admin)
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text not null default '',
  action text not null,
  target text not null default '',
  detail text not null default ''
);
alter table public.activity_log enable row level security;
drop policy if exists activity_admin on public.activity_log;
create policy activity_admin on public.activity_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.activity_log from anon;

create table if not exists public.customer_notes (
  hp         text primary key,
  note       text not null default '' check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.customer_notes enable row level security;
drop policy if exists customer_notes_admin on public.customer_notes;
create policy customer_notes_admin on public.customer_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.customer_notes from anon;

-- ---------------------------------------------------------------------
-- 6f. Batal otomatis: pesanan web yang belum dikonfirmasi, belum ada bukti bayar, dan sudah lewat 1 jam
--     dibatalkan oleh sistem (dicatat di log aktivitas). Pesanan manual (WhatsApp) tidak disentuh.
--     Dijadwalkan tiap 5 menit lewat pg_cron kalau ekstensinya tersedia (aktifkan di Supabase:
--     Database, Extensions, pg_cron). Tanpa pg_cron, admin tetap bisa membatalkan lewat tombol "Batalkan" di bar Lewat batas.
-- ---------------------------------------------------------------------
create or replace function public.auto_cancel_unpaid()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer; ids text;
begin
  perform set_config('app.cancel_by', 'sistem', true);
  with c as (
    update public.orders set status = 'batal'
     where status = 'baru' and pay_status = 'cek' and proof_path = '' and source = 'web'
       and public.order_deadline(created_at, extra_min) < now()
    returning id
  )
  select count(*), string_agg(id, ', ' order by id) into n, ids from c;
  perform set_config('app.cancel_by', '', true);
  if n > 0 then
    insert into public.activity_log (actor, action, target, detail) values ('sistem', 'batal_otomatis', left(ids, 200), 'belum bayar lebih dari 1 jam');
  end if;
  return n;
end;
$$;
revoke all on function public.auto_cancel_unpaid() from public;
revoke all on function public.auto_cancel_unpaid() from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'lapo-auto-cancel';
    perform cron.schedule('lapo-auto-cancel', '*/5 * * * *', 'select public.auto_cancel_unpaid()');
  else
    raise notice 'pg_cron belum tersedia: batal otomatis belum terjadwal.';
  end if;
exception when others then
  raise notice 'Jadwal batal otomatis belum terpasang: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 6g. Notifikasi WhatsApp ke pembeli (antrean, pemicu, pengingat, pengiriman)
--     Pengiriman memakai ekstensi pg_net ke penyedia WhatsApp (Fonnte atau webhook sendiri).
--     Kunci penyedia disimpan di tabel app_secrets yang tidak bisa dibaca dari browser.
-- ---------------------------------------------------------------------
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create table if not exists public.notify_queue (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  hp         text not null,
  nama       text not null default '',
  kind       text not null,
  ref        text not null,
  message    text not null,
  status     text not null default 'antri' check (status in ('antri', 'dikirim', 'gagal', 'lewati')),
  sent_at    timestamptz,
  error      text not null default '',
  unique (kind, ref)
);
alter table public.notify_queue enable row level security;
drop policy if exists notify_admin on public.notify_queue;
create policy notify_admin on public.notify_queue for select to authenticated using (public.is_admin());
revoke all on public.notify_queue from anon;

create or replace function public.shop_settings() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select data from public.settings where id = 'shop'), '{}'::jsonb);
$$;
create or replace function public.rp_text(n numeric) returns text language sql immutable as $$
  select 'Rp ' || regexp_replace(round(n)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g');
$$;
create or replace function public.site_url() returns text language sql stable security definer set search_path = public as $$
  select regexp_replace(coalesce(nullif(public.shop_settings() ->> 'siteUrl', ''), 'https://lapo-doli.vercel.app'), '/+$', '');
$$;
create or replace function public.pay_minutes() returns integer language sql stable security definer set search_path = public as $$
  select (extract(epoch from public.pay_window()) / 60)::integer;
$$;

-- Nama pembeli di teks WhatsApp: hanya huruf, angka, spasi, apostrof, strip (tanpa titik supaya tidak jadi tautan otomatis); maksimal 30 karakter (tanpa tautan atau baris baru)
create or replace function public.safe_name(t text) returns text language sql immutable as $$
  select coalesce(nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''), '[\r\n\t]+', ' ', 'g'), '[^[:alnum:] ''-]', '', 'g'), '\s+', ' ', 'g')), 30), ''), 'pembeli');
$$;

create or replace function public.enqueue_notify(p_kind text, p_hp text, p_nama text, p_ref text, p_msg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s jsonb := public.shop_settings();
begin
  if coalesce(s ->> 'notifyOn', 'false') <> 'true' then return; end if;
  if coalesce(s -> 'notifyKinds' ->> p_kind, 'true') = 'false' then return; end if;
  -- batas harian: satu nomor maksimal 6 pesan otomatis per 24 jam, supaya fitur ini tidak bisa dipakai membanjiri nomor orang lain
  if p_kind <> 'uji' and (select count(*) from public.notify_queue q where q.hp = public.norm_hp(p_hp) and q.kind <> 'uji' and q.created_at > now() - interval '24 hours') >= 6 then return; end if;
  insert into public.notify_queue (hp, nama, kind, ref, message) values (public.norm_hp(p_hp), left(coalesce(p_nama, ''), 80), p_kind, p_ref, p_msg)
  on conflict (kind, ref) do nothing;
end;
$$;

create or replace function public.send_notifications(p_max integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; prov text; tok text; url text; n integer := 0; has_net boolean := to_regproc('net.http_post') is not null;
begin
  update public.notify_queue set status = 'lewati', error = 'kedaluwarsa' where status = 'antri' and created_at < now() - interval '30 minutes';
  select value into prov from public.app_secrets where key = 'wa_provider';
  select value into tok from public.app_secrets where key = 'wa_token';
  select value into url from public.app_secrets where key = 'wa_url';
  if prov is null or (prov = 'fonnte' and tok is null) or (prov = 'webhook' and url is null) then return 0; end if;
  for r in select * from public.notify_queue where status = 'antri' order by id limit p_max for update skip locked loop
    if not has_net then
      update public.notify_queue set status = 'gagal', error = 'pg_net belum aktif' where id = r.id; continue;
    end if;
    begin
      if prov = 'fonnte' then
        perform net.http_post(url := 'https://api.fonnte.com/send', body := jsonb_build_object('target', r.hp, 'message', r.message),
                              headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', tok));
      else
        perform net.http_post(url := url, body := jsonb_build_object('target', r.hp, 'message', r.message, 'kind', r.kind, 'ref', r.ref),
                              headers := jsonb_build_object('Content-Type', 'application/json') || case when tok is not null then jsonb_build_object('Authorization', 'Bearer ' || tok) else '{}'::jsonb end);
      end if;
      update public.notify_queue set status = 'dikirim', sent_at = now() where id = r.id; n := n + 1;
    exception when others then
      update public.notify_queue set status = 'gagal', error = left(sqlerrm, 200) where id = r.id;
    end;
  end loop;
  return n;
end;
$$;
revoke all on function public.send_notifications(integer) from public;
revoke all on function public.send_notifications(integer) from anon, authenticated;

create or replace function public.trg_order_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if NEW.source <> 'web' then return NEW; end if;
  s := public.shop_settings();
  perform public.enqueue_notify('dicatat', NEW.hp, NEW.nama, NEW.gid,
    'Halo kak ' || public.safe_name(NEW.nama) || ', pesananmu ' || NEW.id || case when NEW.group_count > 1 then ' (gabungan beberapa tanggal)' else '' end ||
    ' sudah dicatat. Transfer ' || public.rp_text(NEW.group_total + NEW.kode) || ' ke ' || coalesce(s ->> 'bankName', '') || ' ' || coalesce(s ->> 'bankNumber', '') || ' ' || coalesce(s ->> 'bankHolder', '') ||
    ' dalam ' || public.pay_minutes() || ' menit, lalu unggah bukti di ' || public.site_url() || '/?cek=' || NEW.id || '. Terima kasih!');
  begin perform public.send_notifications(5); exception when others then null; end;
  return NEW;
end;
$$;
create or replace function public.trg_order_update() returns trigger language plpgsql security definer set search_path = public as $$
declare link text;
begin
  if NEW.source <> 'web' then return NEW; end if;
  link := public.site_url() || '/?cek=' || NEW.id;
  if NEW.pay_status = 'lunas' and OLD.pay_status <> 'lunas' then
    perform public.enqueue_notify('lunas', NEW.hp, NEW.nama, NEW.gid || ':lunas',
      'Halo kak ' || public.safe_name(NEW.nama) || ', pembayaran pesananmu ' || NEW.id || ' sudah kami terima. ' || case when NEW.fulfil = 'ambil' then 'Pesanan siap diambil' else 'Pesanan diantar' end ||
      ' ' || to_char(NEW.po_date, 'DD-MM-YYYY') || ', jam ' || NEW.hours || '. Terima kasih!');
  elsif NEW.pay_status = 'ditolak' and OLD.pay_status <> 'ditolak' then
    perform public.enqueue_notify('ditolak', NEW.hp, NEW.nama, NEW.gid || ':ditolak',
      'Halo kak ' || public.safe_name(NEW.nama) || ', pembayaran pesananmu ' || NEW.id || ' belum cocok. Unggah bukti transfer yang jelas di ' || link || ' atau hubungi admin.');
  end if;
  if NEW.status = 'diantar' and OLD.status <> 'diantar' and NEW.pay_status = 'lunas' then
    perform public.enqueue_notify('diantar', NEW.hp, NEW.nama, NEW.id || ':diantar',
      'Halo kak ' || public.safe_name(NEW.nama) || ', pesananmu ' || NEW.id || case when NEW.fulfil = 'ambil' then ' sudah siap diambil.' else ' sedang diantar. Mohon ditunggu ya.' end);
  end if;
  if NEW.status = 'batal' and OLD.status <> 'batal' and coalesce(current_setting('app.cancel_by', true), '') = 'sistem' then
    perform public.enqueue_notify('batal_otomatis', NEW.hp, NEW.nama, NEW.gid || ':batal',
      'Halo kak ' || public.safe_name(NEW.nama) || ', pesananmu ' || NEW.id || ' dibatalkan otomatis karena belum dibayar dalam ' || public.pay_minutes() || ' menit. Sudah transfer? Buka ' || link || ' lalu ketuk Saya sudah transfer.');
  end if;
  begin perform public.send_notifications(5); exception when others then null; end;
  return NEW;
end;
$$;
drop trigger if exists orders_notify_insert on public.orders;
create trigger orders_notify_insert after insert on public.orders for each row execute function public.trg_order_insert();
drop trigger if exists orders_notify_update on public.orders;
create trigger orders_notify_update after update on public.orders for each row execute function public.trg_order_update();

-- Pengingat: pesanan web yang belum dibayar dan tinggal 15 menit sebelum batas
create or replace function public.enqueue_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; n integer := 0;
begin
  for r in
    select distinct on (o.gid) o.* from public.orders o
     where o.source = 'web' and o.status = 'baru' and o.pay_status = 'cek' and o.proof_path = ''
       and public.order_deadline(o.created_at, o.extra_min) > now()
       and public.order_deadline(o.created_at, o.extra_min) - now() <= interval '15 minutes'
     order by o.gid, o.id
  loop
    perform public.enqueue_notify('pengingat', r.hp, r.nama, r.gid,
      'Halo kak ' || public.safe_name(r.nama) || ', pesananmu ' || r.id || ' belum dibayar. Sisa waktu sekitar ' ||
      greatest(1, ceil(extract(epoch from (public.order_deadline(r.created_at, r.extra_min) - now())) / 60))::integer || ' menit. Transfer ' ||
      public.rp_text(r.group_total + coalesce((select sum(kode) from public.orders where gid = r.gid), 0)) || ' lalu unggah bukti di ' || public.site_url() || '/?cek=' || r.id ||
      '. Kamu bisa menambah waktu 30 menit sekali di halaman itu.');
    n := n + 1;
  end loop;
  begin perform public.send_notifications(10); exception when others then null; end;
  return n;
end;
$$;
revoke all on function public.enqueue_reminders() from public;
revoke all on function public.enqueue_reminders() from anon, authenticated;

-- Admin: simpan kunci penyedia (hanya tulis), cek status, kirim pesan uji
create or replace function public.set_secret(p_key text, p_value text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('wa_provider', 'wa_token', 'wa_url') then raise exception 'bad_key'; end if;
  if coalesce(p_value, '') = '' then delete from public.app_secrets where key = p_key;
  else insert into public.app_secrets (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value; end if;
end;
$$;
create or replace function public.secret_status() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('provider', (select value from public.app_secrets where key = 'wa_provider'),
                            'hasToken', exists (select 1 from public.app_secrets where key = 'wa_token'),
                            'hasUrl', exists (select 1 from public.app_secrets where key = 'wa_url'),
                            'hasNet', to_regproc('net.http_post') is not null);
end;
$$;
create or replace function public.notify_test(p_hp text) returns text language plpgsql security definer set search_path = public as $$
declare rid bigint; st text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.notify_queue (hp, nama, kind, ref, message)
  values (public.norm_hp(p_hp), 'Admin', 'uji', 'uji-' || clock_timestamp()::text, 'Pesan uji dari Lapo Doli. Kalau pesan ini sampai, notifikasi WhatsApp sudah terhubung.') returning id into rid;
  perform public.send_notifications(5);
  select status || case when error <> '' then ': ' || error else '' end into st from public.notify_queue where id = rid;
  return st;
end;
$$;
revoke all on function public.set_secret(text, text) from public;
revoke all on function public.secret_status() from public;
revoke all on function public.notify_test(text) from public;
grant execute on function public.set_secret(text, text) to authenticated;
grant execute on function public.secret_status() to authenticated;
grant execute on function public.notify_test(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'lapo-notify';
    perform cron.schedule('lapo-notify', '*/5 * * * *', 'select public.enqueue_reminders(), public.send_notifications()');
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'Jadwal notifikasi atau pg_net belum terpasang: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 6h. Kunci akses fungsi: fungsi internal tidak boleh dipanggil dari browser (anon atau pengguna biasa).
--     Yang tetap terbuka hanya fungsi untuk pembeli (pesan, cek status, bukti, batal, klaim, perpanjang),
--     is_admin, po_remaining, dan schema_version. Fungsi admin hanya untuk pengguna login (dan tetap memeriksa is_admin).
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'enqueue_notify', 'safe_name', 'shop_settings', 'site_url', 'pay_minutes', 'rp_text', 'pay_window', 'order_deadline',
       'trg_order_insert', 'trg_order_update', 'touch_updated_at', 'fmt_seq',
       'send_notifications', 'enqueue_reminders', 'auto_cancel_unpaid'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array['set_secret', 'secret_status', 'notify_test', 'admin_edit_items'])
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6i. Kelola admin dari aplikasi
--     Daftar admin diubah lewat fungsi di bawah (hanya admin yang sudah login). Pendaftaran akun login dijaga
--     trigger: hanya email yang ada di tabel admins yang boleh membuat akun, jadi admin baru cukup ditambahkan
--     di aplikasi lalu masuk lewat link email. Syarat di Supabase: Authentication, Sign In / Providers, Email,
--     "Allow new users to sign up" aktif (trigger yang menolak email selain admin).
-- ---------------------------------------------------------------------
create or replace function public.admin_list()
returns table (email text, joined boolean, last_sign_in timestamptz, is_me boolean)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select lower(a.email), (u.id is not null and u.email_confirmed_at is not null), u.last_sign_in_at,
           lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      from public.admins a
      left join auth.users u on lower(u.email) = lower(a.email)
     order by lower(a.email);
end;
$$;

create or replace function public.admin_add(p_email text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 120 then raise exception 'invalid_email'; end if;
  if (select count(*) from public.admins) >= 20 then raise exception 'too_many_admins'; end if;
  insert into public.admins (email) values (e) on conflict do nothing;
  insert into public.activity_log (actor, action, target, detail)
    values (coalesce(auth.jwt() ->> 'email', ''), 'tambah_admin', e, '');
end;
$$;

create or replace function public.admin_remove(p_email text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if e = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'cannot_remove_self'; end if;
  if (select count(*) from public.admins) <= 1 then raise exception 'last_admin'; end if;
  delete from public.admins where lower(email) = e;
  insert into public.activity_log (actor, action, target, detail)
    values (coalesce(auth.jwt() ->> 'email', ''), 'hapus_admin', e, '');
end;
$$;
revoke all on function public.admin_list() from public, anon;
revoke all on function public.admin_add(text) from public, anon;
revoke all on function public.admin_remove(text) from public, anon;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_add(text) to authenticated;
grant execute on function public.admin_remove(text) to authenticated;

-- Hanya email admin yang boleh membuat akun login
create or replace function public.guard_admin_signup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(new.email, ''))) then
    raise exception 'Pendaftaran hanya untuk admin terdaftar';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_admin_signup() from public, anon, authenticated;
do $$
begin
  drop trigger if exists guard_admin_signup on auth.users;
  create trigger guard_admin_signup before insert on auth.users for each row execute function public.guard_admin_signup();
exception when others then
  raise notice 'Trigger pendaftaran admin belum terpasang (butuh hak atas schema auth): %', sqlerrm;
end $$;

-- Versi skema: admin memeriksa ini supaya tahu kalau database belum diperbarui
create or replace function public.schema_version()
returns integer language sql immutable as $$ select 21 $$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;

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

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('proofs', 'proofs', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
      on conflict (id) do update set public = false, file_size_limit = 4194304,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
    execute 'drop policy if exists proofs_insert on storage.objects';
    execute $p$create policy proofs_insert on storage.objects for insert to anon, authenticated
               with check (bucket_id = 'proofs' and name ~ '^[A-Z0-9]{8}/[A-Za-z0-9_.-]{6,80}$')$p$;
    execute 'drop policy if exists proofs_admin_read on storage.objects';
    execute $p$create policy proofs_admin_read on storage.objects for select to authenticated
               using (bucket_id = 'proofs' and public.is_admin())$p$;
    execute 'drop policy if exists proofs_admin_delete on storage.objects';
    execute $p$create policy proofs_admin_delete on storage.objects for delete to authenticated
               using (bucket_id = 'proofs' and public.is_admin())$p$;
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
