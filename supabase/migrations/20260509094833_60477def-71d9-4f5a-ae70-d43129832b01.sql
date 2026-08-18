
ALTER TABLE public.profiles ALTER COLUMN usdt_balance SET DEFAULT 0;

UPDATE public.profiles
SET ton_balance = COALESCE(ton_balance, 0) + 10000,
    usdt_balance = GREATEST(COALESCE(usdt_balance, 0) - 10000, 0);
