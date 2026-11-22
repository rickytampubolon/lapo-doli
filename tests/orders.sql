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
  perform t.ck('1 kode unik 1..499', (r->0->>'kode')::int between 1 and 499, r->0->>'kode');
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
  perform t.ck('6 belum bayar >3 jam tidak menahan kuota (sisa 3)', n = 3, n::text);
  update public.orders set proof_path = 'AAAAAAAA/x1234567.jpg' where hp = '081200000015';
  select remaining into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri';
  perform t.ck('6 sudah ada bukti: tetap menahan kuota walau lewat 3 jam (sisa 0)', n = 0, n::text);
  update public.orders set proof_path = '' where hp = '081200000015';
  update public.orders set pay_status = 'lunas' where hp = '081200000015';
  select remaining into n from public.po_remaining() where po_id = 'po-a' and pid = 'teri';
  perform t.ck('6 yang sudah lunas tetap menahan kuota (sisa 0)', n = 0, n::text);
  update public.products set quota = null where id = 'teri';

  -- 7. batas spam: 5 pesanan per 10 menit per nomor
  delete from public.orders; delete from public.counters;
  for n in 1..5 loop
    perform public.create_orders(t.base('081299990001') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  end loop;
  perform t.ck('7 pesanan ke-6 dari nomor sama ditolak', t.err(t.base('0812-9999-0001') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'rate_limited');
  perform t.ck('7 nomor lain tidak terpengaruh', t.err(t.base('081299990002') || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}') = 'OK');
  perform t.ck('7 satu pesanan dua tanggal dihitung satu', (select count(distinct gid) from public.orders where hp = '081299990001') = 5);

  -- 8. kode unik tidak kembar di antara yang masih menunggu bayar (total sama)
  delete from public.orders; delete from public.counters;
  for n in 1..60 loop
    perform public.create_orders(t.base('08129000' || lpad(n::text, 4, '0')) || '{"groups":[{"po_id":"po-a","lines":[{"pid":"teri","opt":0,"qty":1}]}]}');
  end loop;
  perform t.ck('8 60 pesanan, total sama, kode semua berbeda', (select count(distinct kode) from public.orders) = 60 and (select max(kode) from public.orders) <= 499, (select count(distinct kode)::text from public.orders));
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
end $$;

select case when ok then 'PASS' else 'FAIL' end as hasil, name, info from t.res order by n;
select count(*) filter (where ok) as lulus, count(*) filter (where not ok) as gagal from t.res;
