insert into public.user_roles (user_id, role)
select id, 'admin'::app_role from auth.users where email = 'sofiademello33@gmail.com'
on conflict (user_id, role) do nothing;