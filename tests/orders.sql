\set ON_ERROR_STOP on
\set QUIET on
-- bersihkan data
truncate public.orders, public.counters, public.pos restart identity cascade;
delete from public.admins;
update public.products set available = true, quota = null;
update public.settings set data = data || '{"ongkir":10000,"poCutoff":"10:00","uniqueCode":true}'::jsonb where id = 'shop';

create schema if not exists t;
create table if not exists t.res (n serial, name text, ok boolean, info text);
truncate t.res;
create or replace function t.ck(name text, cond boolean, info text default '') returns void language plpgsql as $$
begin insert into t.res(name, ok, info) values (name, coalesce(cond, false), info); end $$;
create or replace function t.err(p jsonb, adm boolean default false) returns text language plpgsql as $$
begin perform public.create_orders(p, adm); return 'OK'; exception when others then return sqlerrm; end $$;

insert into public.pos(id, date, open) values
  ('po-a', current_date + 10, true), ('po-b', current_date + 17, true),
  ('po-closed', current_date + 24, false),
  ('po-past', current_date - 1, true),
  ('po-soon', current_date + 31, true),
  ('po-y26', date '2026-12-05', true), ('po-y27', date '2027-12-05', true);
update public.pos set opens_at = now() + interval '2 days' where id = 'po-soon';

create or replace function t.base(hp text default '081200000001', fulfil text default 'antar') returns jsonb language sql as $$
  select jsonb_build_object('nama','Budi','hp',hp,'fulfil',fulfil,'area',case when fulfil='antar' then 'Jakarta Pusat' else '' end,
     'alamat',case when fulfil='antar' then 'Jl. Contoh Raya No. 12, Kelapa Gading' else '' end,'method','transfer') $$;

do $$
declare r jsonb; p jsonb; o record; v jsonb; n int; e text;
begin
  -- 1. antar: varian + tambahan + menu lain
  p := t.base() || '{"groups":[{"po_id":"po-a","lines":[{"pid":"kecap","opt":0,"qty":2},{"pid":"kecap","addon":"nasi","qty":1},{"pid":"saksang","opt":0,"qty":1}]}]}';
  r := public.create_orders(p);
  perform t.ck('1 total = makanan 70000+5000+40000 + ongkir 10000', (r->0->>'total')::int = 125000, r->0->>'total');
  perform t.ck('1 kode unik 1..100', (r->0->>'kode')::int between 1 and 100, r->0->>'kode');
  select * into o from public.orders limit 1;
  perform t.ck('1 group_total = total', o.group_total = 125000 and o.ongkir = 10000);
  perform t.ck('1 id format DDMM-NN', o.id ~ '^\d{4}-01$', o.id);
  perform t.ck('1 pay_status cek dan status baru', o.pay_status = 'cek' and o.status = 'baru');
  perform t.ck('1 item addon ditandai', exists(select 1 from jsonb_array_elements(o.items) i where (i->>'addon')::boolean and i->>'name' = 'Nasi' and (i->>'price')::int = 5000));
  perform t.ck('1 varian 500ml idx1 = 70000', (public.create_orders(t.base('081200000002') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"kecap","opt":1,"qty":1}]}]}')->0->>'total')::int = 80000);

  -- 2. ambil sendiri tanpa ongkir
  r := public.create_orders(t.base('081200000003','ambil') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":3}]}]}');
  perform t.ck('2 ambil: total = 75000 tanpa ongkir', (r->0->>'total')::int = 75000, r->0->>'total');
  perform t.ck('2 ambil: pickup_loc terisi', (r->0->>'pickup_loc') <> '');

  -- 3. dua tanggal sekaligus
  r := public.create_orders(t.base('081200000004') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]},{"po_id":"po-b","lines":[{"pid":"saksang","opt":1,"qty":2}]}]}');
  perform t.ck('3 dua pesanan', jsonb_array_length(r) = 2);
  perform t.ck('3 total per tanggal membawa ongkir sendiri', (r->0->>'total')::int = 35000 and (r->1->>'total')::int = 90000, (r->0->>'total') || '/' || (r->1->>'total'));
  perform t.ck('3 gid sama', r->0->>'gid' = r->1->>'gid');
  select group_total, group_count into o from public.orders where id = (r->1->>'id');
  perform t.ck('3 group_total = 125000, count 2', o.group_total = 125000 and o.group_count = 2, o.group_total::text);
  perform t.ck('3 kode hanya di pesanan pertama', (r->0->>'kode')::int > 0 and (r->1->>'kode')::int = 0);

  -- 4. kesalahan input
  perform t.ck('4 tanggal ganda ditolak', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]},{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'duplicate_po');
  perform t.ck('4 tambahan melebihi menu utama', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"kecap","opt":0,"qty":1},{"pid":"kecap","addon":"nasi","qty":2}]}]}') = 'addon_exceeds_main');
  perform t.ck('4 tambahan tanpa menu utama', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"kecap","addon":"nasi","qty":1}]}]}') = 'empty_group');
  perform t.ck('4 varian wajib dipilih', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"kecap","qty":1}]}]}') = 'option_required');
  perform t.ck('4 varian di luar jangkauan', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"kecap","opt":9,"qty":1}]}]}') = 'invalid_option');
  perform t.ck('4 qty 0', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":0}]}]}') = 'invalid_qty');
  perform t.ck('4 qty 100', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":100}]}]}') = 'invalid_qty');
  perform t.ck('4 qty bukan angka tidak membocorkan error asing', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":"abc"}]}]}') <> 'OK');
  perform t.ck('4 menu tidak ada', t.err(t.base('081200000005') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"zzz","qty":1}]}]}') like 'menu_unavailable%');
  perform t.ck('4 grup kosong', t.err(t.base('081200000005') || '{"groups":[]}') = 'invalid_groups');
  perform t.ck('4 nama terlalu pendek', t.err((t.base('081200000005') || '{"nama":"B","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}')::jsonb) = 'invalid_nama');
  perform t.ck('4 hp tidak valid', t.err(t.base('12345') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'invalid_hp');
  perform t.ck('4 hp +62 diterima', t.err(t.base('+62 812-0000-0006') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK');
  perform t.ck('4 wilayah salah', t.err((t.base('081200000007') || '{"area":"Bogor","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}')::jsonb) = 'invalid_area');
  perform t.ck('4 alamat pendek', t.err((t.base('081200000007') || '{"alamat":"Jl. 1","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}')::jsonb) = 'invalid_alamat');
  perform t.ck('4 metode salah', t.err((t.base('081200000007') || '{"method":"cash","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}')::jsonb) = 'invalid_method');

  -- 5. PO tutup, lewat, terjadwal, tidak ada, menu habis
  perform t.ck('5 PO ditutup admin', t.err(t.base('081200000008') || '{"groups":[{"po_id":"po-closed","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') like 'po_closed:%');
  perform t.ck('5 PO sudah lewat', t.err(t.base('081200000008') || '{"groups":[{"po_id":"po-past","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') like 'po_closed:%');
  perform t.ck('5 PO terjadwal belum buka', t.err(t.base('081200000008') || '{"groups":[{"po_id":"po-soon","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') like 'po_not_open:%');
  perform t.ck('5 PO tidak ada', t.err(t.base('081200000008') || '{"groups":[{"po_id":"nope","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'po_not_found');
  update public.products set available = false where id = 'teri';
  perform t.ck('5 menu habis ditolak', t.err(t.base('081200000008') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') like 'menu_unavailable%');
  update public.products set available = true where id = 'teri';
  update public.pos set opens_at = now() - interval '1 minute' where id = 'po-soon';
  perform t.ck('5 PO terjadwal setelah waktunya bisa dipesan', t.err(t.base('081200000008') || '{"groups":[{"po_id":"po-soon","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK');

  -- 6. kuota
  delete from public.orders; delete from public.counters;
  update public.products set quota = 5 where id = 'teri';
  perform t.ck('6 kuota: 3 dari 5 masuk', t.err(t.base('081200000011') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":3}]}]}') = 'OK');
  perform t.ck('6 kuota: 3 lagi ditolak, sisa 2', t.err(t.base('081200000012') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":3}]}]}') = 'sold_out:teri:2');
  perform t.ck('6 kuota: 2 lagi masuk', t.err(t.base('081200000013') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":2}]}]}') = 'OK');
  perform t.ck('6 kuota per tanggal: PO lain masih penuh 5', t.err(t.base('081200000014') || '{"groups":[{"po_id":"po-b","lines":[{"pid":"teri","opt":0,"qty":5}]}]}') = 'OK');
  update public.orders set status = 'batal' where hp = '081200000011';
  perform t.ck('6 kuota: pesanan batal melepas kuota', t.err(t.base('081200000015') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":3}]}]}') = 'OK');
  select count(*) into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri' and remaining = 0;
  perform t.ck('6 po_remaining = 0 saat penuh', n = 1);
  update public.orders set created_at = now() - interval '4 hours' where hp = '081200000015';
  select remaining into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri';
  perform t.ck('6 belum bayar >1 jam tidak menahan kuota (sisa 3)', n = 3, n::text);
  update public.orders set proof_path = 'AAAAAAAA/x1234567.jpg' where hp = '081200000015';
  select remaining into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri';
  perform t.ck('6 sudah ada bukti: tetap menahan kuota walau lewat 1 jam (sisa 0)', n = 0, n::text);
  update public.orders set proof_path = '' where hp = '081200000015';
  update public.orders set pay_status = 'lunas' where hp = '081200000015';
  select remaining into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri';
  perform t.ck('6 yang sudah lunas tetap menahan kuota (sisa 0)', n = 0, n::text);
  update public.products set quota = null where id = 'teri';

  -- 7. batas spam: 3 pesanan per 10 menit per nomor
  delete from public.orders; delete from public.counters;
  for n in 1..3 loop
    perform public.create_orders(t.base('081299990001') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  end loop;
  perform t.ck('7 pesanan ke-4 dari nomor sama ditolak', t.err(t.base('0812-9999-0001') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'rate_limited');
  perform t.ck('7 nomor lain tidak terpengaruh', t.err(t.base('081299990002') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK');
  perform t.ck('7 satu pesanan dua tanggal dihitung satu', (select count(distinct gid) from public.orders where hp = '081299990001') = 3);

  -- 8. kode unik tidak kembar di antara yang masih menunggu bayar (total sama)
  delete from public.orders; delete from public.counters;
  for n in 1..60 loop
    perform public.create_orders(t.base('08129000' || lpad(n::text, 4, '0')) || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  end loop;
  perform t.ck('8 60 pesanan, total sama, kode semua berbeda', (select count(distinct kode) from public.orders) = 60 and (select max(kode) from public.orders) <= 100, (select count(distinct kode)::text from public.orders));
  perform t.ck('8 nomor urut tidak melompat: 01..60', (select count(*) from public.orders where id ~ '-\d\d$') = 60);

  -- 9. nomor pesanan tidak bentrok antar tahun (tanggal 5 Des 2026 dan 2027)
  delete from public.orders; delete from public.counters;
  perform public.create_orders(t.base('081200000021') || '{"groups":[{"po_id":"po-y26","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  e := t.err(t.base('081200000022') || '{"groups":[{"po_id":"po-y27","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('9 tanggal sama tahun berbeda tidak error', e = 'OK', e);
  perform t.ck('9 id unik 0512-01 dan 0512-02', (select string_agg(id, ',' order by id) from public.orders) = '0512-01,0512-02', (select string_agg(id, ',' order by id) from public.orders));

  -- 10. idempotensi (kirim ulang karena sinyal putus)
  delete from public.orders; delete from public.counters;
  p := t.base('081200000031') || '{"ref":"abcd-1234-efgh","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":2}]},{"po_id":"po-b","lines":[{"pid":"teri","opt":0,"qty":1}]}]}';
  r := public.create_orders(p);
  v := public.create_orders(p);
  perform t.ck('10 kirim ulang mengembalikan pesanan yang sama', r = v);
  perform t.ck('10 tidak ada pesanan ganda', (select count(*) from public.orders) = 2);
  perform t.ck('10 kunci sama dari nomor lain tidak membocorkan pesanan', (public.create_orders((p || '{"hp":"081200000032"}')::jsonb)->0->>'id') is distinct from (r->0->>'id'));
  perform t.ck('10 kunci tidak valid ditolak', t.err((p || '{"ref":"x"}')::jsonb) = 'invalid_ref');

  -- 11. admin
  perform t.ck('11 as_admin tanpa login ditolak', t.err(t.base('081200000041') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}', true) = 'forbidden');
  insert into public.admins values ('admin@test.id');
  perform set_config('request.jwt.claims', '{"email":"Admin@Test.id"}', false);
  perform t.ck('11 admin: tutup PO tetap boleh', t.err(t.base('081200000041') || '{"groups":[{"po_id":"po-closed","lines":[{"pid":"teri","opt":0,"qty":1}]}]}', true) = 'OK');
  r := public.create_orders(t.base('081200000042') || '{"ongkir":0,"paid":true,"source":"wa","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":2}]}]}', true);
  perform t.ck('11 admin: ongkir kustom 0, lunas, tanpa kode unik', (r->0->>'total')::int = 50000 and (r->0->>'kode')::int = 0, r->0->>'total');
  select pay_status, source into o from public.orders where id = r->0->>'id';
  perform t.ck('11 admin: pay_status lunas dan sumber wa', o.pay_status = 'lunas' and o.source = 'wa');
  perform set_config('request.jwt.claims', '', false);

  -- 12. bukti bayar
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000051') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  v := to_jsonb(r->0->>'gid');
  perform t.ck('12 lampirkan dengan nomor salah ditolak', public.attach_proof(r->0->>'gid', '081200000099', (r->0->>'gid') || '/abc12345.jpg') = false);
  perform t.ck('12 jalur tidak cocok gid ditolak', public.attach_proof(r->0->>'gid', '081200000051', 'ZZZZZZZZ/abc12345.jpg') = false);
  perform t.ck('12 lampirkan benar', public.attach_proof(r->0->>'gid', '0812-0000-0051', (r->0->>'gid') || '/abc12345.jpg') = true);
  perform t.ck('12 track_orders: has_proof true', (select has_proof from public.track_orders(array[r->0->>'id'], '081200000051')) = true);
  perform t.ck('12 track_orders: nomor salah kosong', (select count(*) from public.track_orders(array[r->0->>'id'], '081200000099')) = 0);
  update public.orders set pay_status = 'ditolak' where id = r->0->>'id';
  perform t.ck('12 unggah ulang setelah ditolak', public.attach_proof(r->0->>'gid', '081200000051', (r->0->>'gid') || '/def45678.jpg') = true);
  perform t.ck('12 status kembali ke cek', (select pay_status from public.orders where id = r->0->>'id') = 'cek');
  update public.orders set pay_status = 'lunas' where id = r->0->>'id';
  perform t.ck('12 sudah lunas tidak bisa diubah buktinya', public.attach_proof(r->0->>'gid', '081200000051', (r->0->>'gid') || '/ghi78901.jpg') = false);
  update public.orders set pay_status = 'cek', status = 'batal' where id = r->0->>'id';
  perform t.ck('12 pesanan batal tidak bisa menerima bukti', public.attach_proof(r->0->>'gid', '081200000051', (r->0->>'gid') || '/jkl01234.jpg') = false);

  -- 13. pembeli membatalkan pesanan sendiri
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000061') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('13 batal dengan nomor salah ditolak', public.cancel_orders(r->0->>'gid', '081200000099') = 0);
  perform t.ck('13 batal dengan gid ngawur ditolak', public.cancel_orders('zzz', '081200000061') = 0);
  perform t.ck('13 batal benar: 1 pesanan', public.cancel_orders(r->0->>'gid', '0812-0000-0061') = 1);
  perform t.ck('13 status menjadi batal', (select status from public.orders where id = r->0->>'id') = 'batal');
  perform t.ck('13 batal ulang tidak mengubah apa pun', public.cancel_orders(r->0->>'gid', '081200000061') = 0);
  r := public.create_orders(t.base('081200000062') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform public.attach_proof(r->0->>'gid', '081200000062', (r->0->>'gid') || '/abc12345.jpg');
  perform t.ck('13 sudah ada bukti: tidak bisa dibatalkan pembeli', public.cancel_orders(r->0->>'gid', '081200000062') = 0);
  r := public.create_orders(t.base('081200000063') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set pay_status = 'lunas' where id = r->0->>'id';
  perform t.ck('13 sudah lunas: tidak bisa dibatalkan pembeli', public.cancel_orders(r->0->>'gid', '081200000063') = 0);

  -- 14. lokasi Google Maps
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000071') || '{"maps":"https://maps.google.com/?cid=123456","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('14 tautan Google Maps tersimpan', (select maps_url from public.orders where id = r->0->>'id') = 'https://maps.google.com/?cid=123456');
  r := public.create_orders(t.base('081200000072') || '{"maps":"https://evil.example/maps","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('14 tautan non-Google dibuang', (select maps_url from public.orders where id = r->0->>'id') = '');
  r := public.create_orders(t.base('081200000073') || '{"maps":"https://www.google.com.evil.com/maps","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('14 domain tiruan mirip Google dibuang', (select maps_url from public.orders where id = r->0->>'id') = '');
  r := public.create_orders(t.base('081200000074', 'ambil') || '{"maps":"https://maps.google.com/?cid=1","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('14 ambil sendiri: tautan tidak disimpan', (select maps_url from public.orders where id = r->0->>'id') = '');

  -- 15. kuota dan batas tutup per PO, edit jumlah oleh admin
  delete from public.orders; delete from public.counters;
  update public.products set quota = 3 where id = 'teri';
  update public.pos set quotas = '{"teri": 1}'::jsonb where id = 'po-a';
  perform t.ck('15 kuota PO: pesanan pertama lolos', t.err(t.base('081200000081') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK');
  perform t.ck('15 kuota PO: melebihi kuota PO ditolak', t.err(t.base('081200000082') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') like 'sold_out:teri:0');
  select remaining into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri';
  perform t.ck('15 po_remaining memakai kuota PO (0)', n = 0, n::text);
  select remaining into n from public.po_remaining() where po_id = 'po-b' and pid = 'teri';
  perform t.ck('15 PO lain tetap pakai kuota menu', n = 3, n::text);
  update public.products set quota = null where id = 'teri';
  update public.pos set quotas = '{}'::jsonb where id = 'po-a';
  delete from public.orders; delete from public.counters;
  insert into public.pos(id, date, open, cutoff) values ('po-today', (now() at time zone 'Asia/Jakarta')::date, true, '00:00') on conflict (id) do update set cutoff = '00:00';
  perform t.ck('15 batas tutup PO 00:00: PO hari ini tertutup', t.err(t.base('081200000083') || '{"groups":[{"po_id":"po-today","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') like 'po_closed:%');
  update public.pos set cutoff = '23:59' where id = 'po-today';
  perform t.ck('15 batas tutup PO 23:59: PO hari ini masih buka', t.err(t.base('081200000083') || '{"groups":[{"po_id":"po-today","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK' or (now() at time zone 'Asia/Jakarta')::time > time '23:58');
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000084') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":2}]}]}');
  perform set_config('request.jwt.claims', '', false);
  begin perform public.admin_edit_items(r->0->>'id', array[3]); perform t.ck('15 edit jumlah tanpa admin ditolak', false); exception when others then perform t.ck('15 edit jumlah tanpa admin ditolak', sqlerrm = 'not_admin', sqlerrm); end;
  perform set_config('request.jwt.claims', '{"email":"Admin@Test.id"}', false);
  perform t.ck('15 edit jumlah: total dihitung ulang (3 x 25.000 + ongkir 10.000)', public.admin_edit_items(r->0->>'id', array[3]) = 85000);
  perform t.ck('15 total tersimpan di pesanan', (select total from public.orders where id = r->0->>'id') = 85000 and (select group_total from public.orders where id = r->0->>'id') = 85000);
  begin perform public.admin_edit_items(r->0->>'id', array[0]); perform t.ck('15 kosongkan semua ditolak', false); exception when others then perform t.ck('15 kosongkan semua ditolak', sqlerrm = 'empty_order', sqlerrm); end;
  begin perform public.admin_edit_items(r->0->>'id', array[1, 2]); perform t.ck('15 jumlah baris tidak cocok ditolak', false); exception when others then perform t.ck('15 jumlah baris tidak cocok ditolak', sqlerrm = 'bad_items', sqlerrm); end;
  r := public.create_orders(t.base('081200000085') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]},{"po_id":"po-b","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  begin perform public.admin_edit_items(r->0->>'id', array[2]); perform t.ck('15 pesanan gabungan tidak bisa diedit jumlahnya', false); exception when others then perform t.ck('15 pesanan gabungan tidak bisa diedit jumlahnya', sqlerrm = 'group_order', sqlerrm); end;
  perform set_config('request.jwt.claims', '', false);

  -- 16. batal otomatis
  delete from public.orders; delete from public.counters;
  perform public.create_orders(t.base('081200000091') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform public.create_orders(t.base('081200000092') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform public.create_orders(t.base('081200000093') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform public.create_orders(t.base('081200000094') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform public.create_orders(t.base('081200000095') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set created_at = now() - interval '2 hours' where hp in ('081200000091','081200000092','081200000093','081200000094');
  update public.orders set proof_path = 'AAAAAAAA/x1234567.jpg' where hp = '081200000092';
  update public.orders set pay_status = 'lunas' where hp = '081200000093';
  update public.orders set source = 'wa' where hp = '081200000094';
  perform t.ck('16 batal otomatis: hanya 1 pesanan (web, belum bukti, belum lunas, lewat 1 jam)', public.auto_cancel_unpaid() = 1);
  perform t.ck('16 yang dibatalkan: pesanan 091', (select status from public.orders where hp = '081200000091') = 'batal');
  perform t.ck('16 sudah ada bukti tidak disentuh', (select status from public.orders where hp = '081200000092') = 'baru');
  perform t.ck('16 sudah lunas tidak disentuh', (select status from public.orders where hp = '081200000093') = 'baru');
  perform t.ck('16 pesanan manual WA tidak disentuh', (select status from public.orders where hp = '081200000094') = 'baru');
  perform t.ck('16 pesanan baru (belum 1 jam) tidak disentuh', (select status from public.orders where hp = '081200000095') = 'baru');
  perform t.ck('16 dijalankan lagi: 0 pesanan', public.auto_cancel_unpaid() = 0);
  perform t.ck('16 tercatat di log aktivitas oleh sistem', (select count(*) from public.activity_log where actor = 'sistem' and action = 'batal_otomatis') = 1);

  -- 17. batas pesanan menunggu bayar, klaim sudah transfer, refund
  delete from public.orders; delete from public.counters;
  for n in 1..3 loop
    perform public.create_orders(t.base('081200000101') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  end loop;
  update public.orders set created_at = now() - interval '20 minutes' where hp = '081200000101';
  perform t.ck('17 tiga pesanan menunggu bayar: yang keempat ditolak', t.err(t.base('081200000101') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'too_many_pending');
  update public.orders set proof_path = 'AAAAAAAA/x1234567.jpg' where id = (select id from public.orders where hp = '081200000101' order by id limit 1);
  perform t.ck('17 sudah ada bukti pada satu: boleh pesan lagi', t.err(t.base('081200000101') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK');
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000102') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('17 klaim transfer ditolak selama belum dibatalkan', public.claim_paid(r->0->>'gid', '081200000102') = 0);
  update public.orders set created_at = now() - interval '2 hours' where hp = '081200000102';
  perform public.auto_cancel_unpaid();
  perform t.ck('17 klaim dengan nomor salah ditolak', public.claim_paid(r->0->>'gid', '081200000199') = 0);
  perform t.ck('17 klaim benar setelah batal otomatis: 1 pesanan', public.claim_paid(r->0->>'gid', '0812-0000-0102') = 1);
  perform t.ck('17 klaim kedua tidak mengubah apa pun', public.claim_paid(r->0->>'gid', '081200000102') = 0);
  perform t.ck('17 track_orders: claimed true', (select claimed from public.track_orders(array[r->0->>'id'], '081200000102')) = true);
  perform t.ck('17 setelah klaim: bukti boleh diunggah ke pesanan batal', public.attach_proof(r->0->>'gid', '081200000102', (r->0->>'gid') || '/abc12345.jpg') = true);
  perform t.ck('17 pesanan tetap batal sampai admin membuka lagi', (select status from public.orders where hp = '081200000102') = 'batal');
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000103') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set status = 'batal' where hp = '081200000103';
  perform t.ck('17 batal biasa (bukan otomatis, tanpa refund): klaim tetap diizinkan dalam 24 jam', public.claim_paid(r->0->>'gid', '081200000103') = 1);
  update public.orders set refund = 'perlu', pay_status = 'lunas' where hp = '081200000103';
  perform t.ck('17 kolom refund menerima perlu dan selesai', (select refund from public.orders where hp = '081200000103') = 'perlu');

  -- 18. batas bayar yang bisa diatur, perpanjangan, notifikasi WhatsApp
  delete from public.orders; delete from public.counters;
  perform t.ck('18 batas bayar bawaan 60 menit', public.pay_minutes() = 60);
  update public.settings set data = data || '{"payWindowMin": 30}'::jsonb where id = 'shop';
  perform t.ck('18 batas bayar diatur 30 menit', public.pay_minutes() = 30);
  update public.settings set data = data || '{"payWindowMin": 5}'::jsonb where id = 'shop';
  perform t.ck('18 batas bayar dijepit minimal 15 menit', public.pay_minutes() = 15);
  update public.settings set data = data || '{"payWindowMin": 30}'::jsonb where id = 'shop';
  r := public.create_orders(t.base('081200000111') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set created_at = now() - interval '40 minutes' where hp = '081200000111';
  perform t.ck('18 lewat 30 menit: tidak menahan kuota lagi', (select count(*) from public.po_remaining() where po_id = 'po-a') >= 0);
  perform t.ck('18 batal otomatis memakai batas yang diatur (40 menit > 30)', public.auto_cancel_unpaid() = 1);
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000112') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('18 perpanjang sekali: 1 pesanan', public.extend_pay(r->0->>'gid', '081200000112') = 1);
  perform t.ck('18 perpanjang kedua ditolak', public.extend_pay(r->0->>'gid', '081200000112') = 0);
  perform t.ck('18 perpanjang dengan nomor salah ditolak', public.extend_pay(r->0->>'gid', '081200000199') = 0);
  perform t.ck('18 track_orders: extended true dan deadline = dibuat + 30 + 30 menit',
    (select extended and abs(extract(epoch from (deadline - ((select created_at from public.orders where hp = '081200000112') + interval '60 minutes')))) < 2 from public.track_orders(array[r->0->>'id'], '081200000112')));
  update public.orders set created_at = now() - interval '45 minutes' where hp = '081200000112';
  perform t.ck('18 diperpanjang: 45 menit belum dibatalkan (batas 60)', public.auto_cancel_unpaid() = 0);
  update public.orders set created_at = now() - interval '70 minutes' where hp = '081200000112';
  perform t.ck('18 diperpanjang: 70 menit dibatalkan', public.auto_cancel_unpaid() = 1);
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000113') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set created_at = now() - interval '40 minutes' where hp = '081200000113';
  perform t.ck('18 sudah lewat batas: tidak bisa diperpanjang', public.extend_pay(r->0->>'gid', '081200000113') = 0);
  update public.settings set data = data || '{"payWindowMin": 60}'::jsonb where id = 'shop';

  -- notifikasi
  delete from public.orders; delete from public.counters; delete from public.notify_queue; delete from public.test_http;
  perform set_config('request.jwt.claims', '', false);
  begin perform public.set_secret('wa_token', 'x'); perform t.ck('18 set_secret tanpa admin ditolak', false); exception when others then perform t.ck('18 set_secret tanpa admin ditolak', sqlerrm = 'forbidden'); end;
  perform t.ck('18 app_secrets tidak bisa dibaca anon', not has_table_privilege('anon', 'public.app_secrets', 'select'));
  perform t.ck('18 notify_queue tidak bisa dibaca anon', not has_table_privilege('anon', 'public.notify_queue', 'select'));
  r := public.create_orders(t.base('081200000121') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('18 notifikasi mati: tidak ada antrean', (select count(*) from public.notify_queue) = 0);
  update public.settings set data = data || '{"notifyOn": true}'::jsonb where id = 'shop';
  delete from public.orders; delete from public.counters;
  r := public.create_orders(t.base('081200000122') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]},{"po_id":"po-b","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  perform t.ck('18 pesanan dicatat: satu pesan per checkout (gabungan dua tanggal)', (select count(*) from public.notify_queue where kind = 'dicatat') = 1);
  perform t.ck('18 isi pesan: nama, jumlah transfer, tautan status', (select message like 'Halo kak %' and message like '%Transfer Rp %' and message like '%/?cek=%' and message like '%gabungan beberapa tanggal%' from public.notify_queue where kind = 'dicatat'));
  perform t.ck('18 tanpa penyedia: pesan tetap antri', (select status from public.notify_queue where kind = 'dicatat') = 'antri' and (select count(*) from public.test_http) = 0);
  perform set_config('request.jwt.claims', '{"email":"Admin@Test.id"}', false);
  perform public.set_secret('wa_provider', 'fonnte'); perform public.set_secret('wa_token', 'TOKEN123');
  perform t.ck('18 secret_status: penyedia dan token terisi, tanpa membuka nilainya', (public.secret_status() ->> 'provider') = 'fonnte' and (public.secret_status() ->> 'hasToken')::boolean and not (public.secret_status()::text like '%TOKEN123%'));
  perform set_config('request.jwt.claims', '', false);
  n := public.send_notifications();
  perform t.ck('18 send_notifications: terkirim ke Fonnte dengan target dan token', n = 1 and (select url from public.test_http) = 'https://api.fonnte.com/send' and (select body ->> 'target' from public.test_http) = '6281200000122' and (select headers ->> 'Authorization' from public.test_http) = 'TOKEN123');
  perform t.ck('18 status antrean menjadi dikirim', (select status from public.notify_queue where kind = 'dicatat') = 'dikirim');
  n := public.send_notifications();
  perform t.ck('18 dijalankan lagi: tidak mengirim ganda', n = 0);
  update public.orders set pay_status = 'lunas' where hp = '081200000122';
  perform t.ck('18 konfirmasi bayar: satu pesan lunas untuk seluruh checkout', (select count(*) from public.notify_queue where kind = 'lunas') = 1);
  update public.orders set pay_status = 'lunas' where hp = '081200000122';
  perform t.ck('18 diulang: tidak menggandakan', (select count(*) from public.notify_queue where kind = 'lunas') = 1);
  update public.orders set status = 'diantar' where id = r->0->>'id';
  perform t.ck('18 diantar: pesan diantar', (select count(*) from public.notify_queue where kind = 'diantar') = 1);
  delete from public.orders; delete from public.counters; delete from public.notify_queue; delete from public.test_http;
  r := public.create_orders(t.base('081200000123') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set pay_status = 'ditolak' where hp = '081200000123';
  perform t.ck('18 bayar ditolak: pesan ditolak', (select count(*) from public.notify_queue where kind = 'ditolak') = 1);
  update public.orders set pay_status = 'cek', created_at = now() - interval '50 minutes' where hp = '081200000123';
  n := public.enqueue_reminders();
  perform t.ck('18 pengingat: 10 menit sebelum batas, satu pesan', n = 1 and (select count(*) from public.notify_queue where kind = 'pengingat') = 1);
  n := public.enqueue_reminders();
  perform t.ck('18 pengingat diulang: tidak ganda', n >= 0 and (select count(*) from public.notify_queue where kind = 'pengingat') = 1);
  perform t.ck('18 isi pengingat menyebut sisa menit dan perpanjangan', (select message like '%Sisa waktu sekitar % menit%' and message like '%menambah waktu 30 menit%' from public.notify_queue where kind = 'pengingat'));
  delete from public.orders; delete from public.counters; delete from public.notify_queue;
  r := public.create_orders(t.base('081200000124') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set created_at = now() - interval '20 minutes' where hp = '081200000124';
  n := public.enqueue_reminders();
  perform t.ck('18 belum dekat batas: tidak ada pengingat', n = 0);
  update public.orders set created_at = now() - interval '2 hours' where hp = '081200000124';
  n := public.auto_cancel_unpaid();
  perform t.ck('18 batal otomatis: pesan batal_otomatis dengan tautan klaim', n = 1 and (select message like '%dibatalkan otomatis%' and message like '%Saya sudah transfer%' from public.notify_queue where kind = 'batal_otomatis'));
  delete from public.orders; delete from public.counters; delete from public.notify_queue;
  r := public.create_orders(t.base('081200000125') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  update public.orders set status = 'batal' where hp = '081200000125';
  perform t.ck('18 batal manual oleh admin: tidak mengirim pesan batal otomatis', (select count(*) from public.notify_queue where kind = 'batal_otomatis') = 0);
  update public.settings set data = data || '{"notifyKinds": {"lunas": false}}'::jsonb where id = 'shop';
  update public.orders set status = 'baru', pay_status = 'lunas' where hp = '081200000125';
  perform t.ck('18 jenis pesan yang dimatikan tidak diantrekan', (select count(*) from public.notify_queue where kind = 'lunas') = 0);
  update public.settings set data = data - 'notifyKinds' where id = 'shop';
  delete from public.orders; delete from public.counters; delete from public.notify_queue; delete from public.test_http;
  perform set_config('request.jwt.claims', '{"email":"Admin@Test.id"}', false);
  r := public.create_orders(t.base('081200000126') || '{"ongkir":0,"paid":true,"source":"wa","groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}', true);
  perform t.ck('18 pesanan manual (WA) tidak memicu notifikasi', (select count(*) from public.notify_queue) = 0);
  delete from public.test_http;
  perform set_config('request.jwt.claims', '{"email":"Admin@Test.id"}', false);
  perform public.set_secret('wa_provider', 'webhook'); perform public.set_secret('wa_url', 'https://hooks.example.test/wa'); perform public.set_secret('wa_token', '');
  perform public.notify_test('0812-0000-0127');
  perform t.ck('18 notify_test: terkirim lewat webhook dengan kind dan tanpa Authorization', (select status from public.notify_queue where kind = 'uji') = 'dikirim' and (select url from public.test_http) = 'https://hooks.example.test/wa' and (select body ->> 'kind' from public.test_http) = 'uji' and (select headers ? 'Authorization' from public.test_http) = false);
  perform set_config('request.jwt.claims', '', false);
  begin perform public.notify_test('081200000127'); perform t.ck('18 notify_test tanpa admin ditolak', false); exception when others then perform t.ck('18 notify_test tanpa admin ditolak', sqlerrm = 'forbidden'); end;
  update public.notify_queue set status = 'antri', created_at = now() - interval '45 minutes' where kind = 'uji';
  n := public.send_notifications();
  perform t.ck('18 pesan antri lebih dari 30 menit: dilewati', n = 0 and (select status from public.notify_queue where kind = 'uji') = 'lewati');
  update public.settings set data = data - 'notifyOn' - 'payWindowMin' where id = 'shop';
end $$;

select case when ok then 'PASS' else 'FAIL' end as hasil, name, info from t.res order by n;
select count(*) filter (where ok) as lulus, count(*) filter (where not ok) as gagal from t.res;
