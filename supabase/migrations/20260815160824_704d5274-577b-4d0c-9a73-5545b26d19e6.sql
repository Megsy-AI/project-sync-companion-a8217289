CREATE OR REPLACE FUNCTION public.ai_get_subscription(_profile_id uuid)
RETURNS public.ai_subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.ai_subscriptions WHERE profile_id = _profile_id;
$$;

GRANT EXECUTE ON FUNCTION public.ai_get_subscription(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_activate_plan(uuid, text, numeric) TO anon, authenticated;