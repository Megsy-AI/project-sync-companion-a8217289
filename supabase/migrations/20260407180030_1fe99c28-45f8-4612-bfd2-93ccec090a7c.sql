-- Add locked reward balance column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS reward_balance numeric DEFAULT 0;

-- Give all existing users the $1500 locked reward
UPDATE public.profiles SET reward_balance = 1500 WHERE COALESCE(reward_balance, 0) = 0;