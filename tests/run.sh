#!/bin/sh
# Menjalankan tes logika pesanan di Postgres lokal.
# Pakai: PGHOST=... PGPORT=... PGUSER=postgres sh tests/run.sh
set -e
DB=lapo_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -v ON_ERROR_STOP=1 -f tests/setup.sql
psql -q -d $DB -v ON_ERROR_STOP=1 -f supabase/schema.sql 2>&1 | grep -v NOTICE || true
psql -q -d $DB -f tests/orders.sql | grep -v "PASS\|^$\|NOTICE"
psql -q -d $DB -v ON_ERROR_STOP=1 -c "insert into public.products(id,name,description,price,emoji,available,sort,options,addons,image) values ('es-teh','Es Teh','',8000,'x',true,9,'[]','[]','') on conflict do nothing" -f tests/seq100.sql
