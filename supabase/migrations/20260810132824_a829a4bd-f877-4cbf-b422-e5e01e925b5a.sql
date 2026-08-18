ALTER TABLE public.profiles ALTER COLUMN reward_expires_at SET DEFAULT (now() + interval '48 hours');

UPDATE public.profiles
SET reward_expires_at = now() + interval '48 hours'
WHERE reward_balance > 0
  AND (reward_expires_at IS NULL OR reward_expires_at > now() + interval '48 hours');

CREATE OR REPLACE FUNCTION public.expire_prize_rewards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.profiles
  SET reward_balance = 0
  WHERE reward_balance > 0
    AND reward_expires_at IS NOT NULL
    AND reward_expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_prize_rewards() TO anon, authenticated, service_role;