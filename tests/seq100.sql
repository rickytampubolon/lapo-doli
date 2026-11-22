\set ON_ERROR_STOP on
\set QUIET on
set statement_timeout = 60000;
do $$
declare n int; ids text[]; r jsonb; ok boolean;
begin
  -- PO baru, 105 pesanan, nomor HP berbeda
  insert into public.pos(id,date,open) values ('po-big', current_date + 45, true) on conflict do nothing;
  for n in 1..105 loop
    perform public.create_orders(jsonb_build_object('nama','Budi','hp','08133'||lpad(n::text,7,'0'),'fulfil','ambil','area','','alamat','','method','transfer',
      'groups', jsonb_build_array(jsonb_build_object('po_id','po-big','lines', jsonb_build_array(jsonb_build_object('pid','es-teh','qty',1))))));
  end loop;
  select array_agg(id order by id) into ids from public.orders where po_id = 'po-big';
  raise notice '105 pesanan: % unik, terkecil %, terbesar %', (select count(distinct x) from unnest(ids) x), ids[1], ids[array_length(ids,1)];
  if (select count(distinct x) from unnest(ids) x) <> 105 then raise exception 'ID tidak unik'; end if;
  if not exists (select 1 from public.orders where id like '%-100') or not exists (select 1 from public.orders where id like '%-105') then raise exception 'nomor 100 dan 105 tidak ada'; end if;
end $$;
