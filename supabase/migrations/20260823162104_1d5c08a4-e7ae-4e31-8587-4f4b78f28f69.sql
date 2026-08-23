DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    org_id IS NULL
    OR org_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);