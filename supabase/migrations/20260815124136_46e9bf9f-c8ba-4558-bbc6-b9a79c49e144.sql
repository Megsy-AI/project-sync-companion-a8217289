-- 1) Default window becomes 72 hours (48h + 24h extension)
ALTER TABLE public.profiles
  ALTER COLUMN reward_balance SET DEFAULT 10000,
  ALTER COLUMN reward_expires_at SET DEFAULT (now() + interval '72 hours');

-- 2) Backfill / extend for every existing player
UPDATE public.profiles
SET reward_balance = 10000,
    reward_expires_at = now() + interval '72 hours'
WHERE reward_balance IS DISTINCT FROM 10000
   OR reward_expires_at IS NULL
   OR reward_expires_at < now() + interval '71 hours';

-- 3) Guarantee it for every future signup, whatever code path inserts the row
CREATE OR REPLACE FUNCTION public.ensure_monthly_prize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reward_balance IS NULL OR NEW.reward_balance < 10000 THEN
    NEW.reward_balance := 10000;
  END IF;
  IF NEW.reward_expires_at IS NULL OR NEW.reward_expires_at <= now() THEN
    NEW.reward_expires_at := now() + interval '72 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_monthly_prize ON public.profiles;
CREATE TRIGGER trg_ensure_monthly_prize
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_monthly_prize();