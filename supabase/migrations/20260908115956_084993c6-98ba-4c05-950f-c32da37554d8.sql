CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id
      AND lower(u.email) IN ('sofiademello33@gmail.com','sofiademelloifc@gmail.com')
  )
$$;

CREATE OR REPLACE FUNCTION public.grant_admin_for_owner_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if new.email_confirmed_at is not null
     and lower(new.email) in ('sofiademello33@gmail.com','sofiademelloifc@gmail.com') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

-- Owners get admin; non-owners lose admin
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth.users u
WHERE lower(u.email) IN ('sofiademello33@gmail.com','sofiademelloifc@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles r
WHERE r.role = 'admin' AND NOT public.is_owner(r.user_id);

-- Evolution/AI configuration restricted to owners
DROP POLICY IF EXISTS "Admins can read ai settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Admins can insert ai settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Admins can update ai settings" ON public.ai_settings;
CREATE POLICY "Owners can read ai settings" ON public.ai_settings FOR SELECT TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "Owners can insert ai settings" ON public.ai_settings FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "Owners can update ai settings" ON public.ai_settings FOR UPDATE TO authenticated USING (public.is_owner(auth.uid())) WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins manage repo settings" ON public.evolution_repo_settings;
CREATE POLICY "Owners manage repo settings" ON public.evolution_repo_settings FOR ALL TO authenticated USING (public.is_owner(auth.uid())) WITH CHECK (public.is_owner(auth.uid()));