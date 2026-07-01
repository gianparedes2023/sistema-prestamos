-- Ejecutar en Supabase SQL Editor si la app muestra:
-- Could not find the table 'public.loan_app_state' in the schema cache

notify pgrst, 'reload schema';

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'loan_app_state', 'audit_log')
order by table_name;

select id, updated_at
from public.loan_app_state;
