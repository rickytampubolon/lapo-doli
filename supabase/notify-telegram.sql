-- =====================================================================
-- OPSIONAL: kabari admin lewat Telegram setiap ada pesanan baru dari website.
--
-- Belum diuji di project Supabase asli. Jalankan di SQL Editor, lalu cek dengan
-- satu pesanan percobaan. Kalau gagal, pesanan tetap masuk (kegagalan notifikasi
-- sengaja diabaikan supaya tidak pernah menghalangi pembeli).
--
-- Siapkan dulu:
--   1. Di Telegram, chat @BotFather, buat bot, salin token-nya.
--   2. Kirim satu pesan ke bot itu, lalu buka
--      https://api.telegram.org/bot<TOKEN>/getUpdates dan salin angka "chat":{"id":...}.
--   3. Simpan keduanya di Vault (JANGAN ditulis di file ini atau di GitHub):
--        select vault.create_secret('<TOKEN>',   'telegram_bot_token');
--        select vault.create_secret('<CHAT_ID>', 'telegram_chat_id');
--      Jalankan dua baris di atas sendiri di SQL Editor, lalu hapus dari riwayat query.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok text; chat text; msg text; ringkas text;
begin
  select decrypted_secret into tok  from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into chat from vault.decrypted_secrets where name = 'telegram_chat_id';
  if tok is null or chat is null then return new; end if;

  select string_agg((i.value ->> 'qty') || 'x ' || (i.value ->> 'name') ||
                    case when coalesce(i.value ->> 'option', '') <> '' then ' (' || (i.value ->> 'option') || ')' else '' end, ', ')
    into ringkas
  from jsonb_array_elements(new.items) i
  where not coalesce((i.value ->> 'addon')::boolean, false);

  msg := 'Pesanan baru ' || new.id || E'\n' ||
         new.nama || ' (' || new.hp || E')\n' ||
         case when new.fulfil = 'ambil' then 'Ambil sendiri' else 'Antar ' || new.area end || ', PO ' || to_char(new.po_date, 'DD-MM-YYYY') || E'\n' ||
         coalesce(ringkas, '') || E'\n' ||
         'Total Rp ' || new.total ||
         case when new.kode > 0 then ' (kode unik ' || new.kode || ')' else '' end;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('chat_id', chat, 'text', msg)
  );
  return new;
exception when others then
  return new;   -- jangan pernah menggagalkan pesanan karena notifikasi
end;
$$;

revoke all on function public.notify_new_order() from public;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify after insert on public.orders
  for each row when (new.source = 'web')
  execute function public.notify_new_order();
