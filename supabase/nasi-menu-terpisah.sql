-- Jalankan sekali di Supabase SQL Editor: membuat menu "Nasi putih" dan menghapus tambahan Nasi dan Sop dari semua lauk, dan mematikan catatan untuk Nasi putih.
-- Aman dijalankan ulang. Menu Nasi yang sudah ada tidak ditimpa.
insert into public.products (id, name, description, price, emoji, available, sort, options, addons, image)
select 'nasi', 'Nasi putih', 'Nasi putih hangat, pas untuk teman lauk.', 5000, '🍚', true, coalesce(max(sort), 0) + 1, '[]'::jsonb, '[]'::jsonb, ''
from public.products
on conflict (id) do nothing;

update public.products
set addons = coalesce((select jsonb_agg(a) from jsonb_array_elements(addons) a where a ->> 'id' not in ('nasi', 'sop')), '[]'::jsonb)
where addons @> '[{"id":"nasi"}]'::jsonb or addons @> '[{"id":"sop"}]'::jsonb;

-- catatan pembeli tidak perlu untuk Nasi putih (jalankan setelah schema.sql v22)
alter table public.products add column if not exists allow_note boolean not null default true;
update public.products set allow_note = false where id = 'nasi';
