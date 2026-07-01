-- Ejecutar en Supabase SQL Editor si la app muestra:
-- Could not find the table 'public.loan_app_state' in the schema cache

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.loan_app_state to authenticated;
grant select, insert on public.audit_log to authenticated;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'loan_app_state', 'audit_log')
order by table_name;

select id, updated_at
from public.loan_app_state;

select
  'Si esta consulta devuelve las 3 tablas, espera 60 segundos y vuelve a probar el login.' as siguiente_paso;
