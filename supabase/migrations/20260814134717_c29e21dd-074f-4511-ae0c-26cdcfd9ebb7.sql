ALTER TABLE public.profiles ALTER COLUMN reward_balance SET DEFAULT 10000;
ALTER TABLE public.profiles ALTER COLUMN reward_expires_at SET DEFAULT (now() + interval '48 hours');