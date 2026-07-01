-- Limpia los datos operativos de prueba sin borrar usuarios ni roles.
-- Ejecutar en Supabase SQL Editor.

update public.loan_app_state
set
  data = '{"clients":[],"loans":[],"payments":[],"users":[],"audit":[]}'::jsonb,
  updated_at = now()
where id = 'main';

delete from public.audit_log;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

select id, data, updated_at
from public.loan_app_state
where id = 'main';
