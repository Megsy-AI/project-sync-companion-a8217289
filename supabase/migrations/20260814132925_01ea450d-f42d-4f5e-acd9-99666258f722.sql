ALTER TABLE public.profiles ALTER COLUMN reward_balance SET DEFAULT 7777;
ALTER TABLE public.profiles ALTER COLUMN reward_expires_at SET DEFAULT (now() + interval '7 days');

UPDATE public.profiles
SET reward_balance = 7777,
    reward_expires_at = now() + interval '7 days';