-- Ejecuta este archivo despues de ejecutar supabase-schema.sql.
-- Usuario administrador inicial detectado:
-- gian.paredes.2023@gmail.com

insert into public.profiles (id, email, name, role, active)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data->>'name', split_part(users.email, '@', 1)),
  'admin',
  true
from auth.users
where users.email = 'gian.paredes.2023@gmail.com'
on conflict (id) do update
set
  role = 'admin',
  active = true,
  updated_at = now();
