-- Tiruan minimal lingkungan Supabase untuk menjalankan supabase/schema.sql di Postgres biasa.
create role anon nologin; create role authenticated nologin;
create schema auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
