-- Read-only diagnostics for the existing Supabase schema.
-- This file does not create tables, policies, buckets, or functions.

-- Confirm expected tables and the media columns the frontend must support.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('media_items', 'admin_users')
order by table_name, ordinal_position;

-- Inspect the existing RLS state and policy definitions. Do not drop or recreate them here.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (schemaname = 'public' and tablename in ('media_items', 'admin_users'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_admin';

-- Verify the existing public media bucket without modifying it.
select id, name, public, file_size_limit
from storage.buckets
where id = 'media';
