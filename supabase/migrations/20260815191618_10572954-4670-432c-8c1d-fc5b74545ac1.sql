UPDATE public.servers
SET mining_boost = ROUND(mining_boost * 1.15, 2),
    ton_mining_rate = ROUND(ton_mining_rate * 1.15, 4),
    usdt_mining_rate = ROUND(usdt_mining_rate * 1.15, 4);