-- Tiruan minimal lingkungan Supabase untuk menjalankan supabase/schema.sql di Postgres biasa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Tiruan pg_net: mencatat permintaan HTTP supaya pengiriman notifikasi bisa diuji tanpa jaringan.
create schema if not exists net;
create table if not exists public.test_http (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$ begin insert into public.test_http (url, body, headers) values (url, body, headers); return 1; end $$;
