ALTER TABLE public.profiles ALTER COLUMN reward_balance SET DEFAULT 7777;
ALTER TABLE public.profiles ALTER COLUMN reward_expires_at SET DEFAULT (now() + interval '7 days');