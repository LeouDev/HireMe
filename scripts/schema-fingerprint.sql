-- Fingerprint of the public schema (function bodies, RLS policies, columns, grants) used to confirm
-- that a remote database matches the migrations tested locally.
select
  (select md5(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(p.prosrc), '|'
     order by p.proname, pg_get_function_identity_arguments(p.oid)))
     from pg_proc p where p.pronamespace = 'public'::regnamespace) as functions,
  (select md5(string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|'
     order by schemaname, tablename, policyname))
     from pg_policies where schemaname = 'public' or (schemaname = 'storage' and policyname not like 'supabase%')) as policies,
  (select md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, '') || ':' || is_nullable, '|'
     order by table_name, column_name))
     from information_schema.columns where table_schema = 'public') as columns,
  (select md5(string_agg(table_name || ':' || grantee || ':' || privilege_type, '|' order by table_name, grantee, privilege_type))
     from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')) as table_grants,
  (select md5(string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')::text || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text, '|'
     order by p.proname, pg_get_function_identity_arguments(p.oid)))
     from pg_proc p where p.pronamespace = 'public'::regnamespace) as function_grants;
