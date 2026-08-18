
-- Common tier (2-8 TON) - each server gets unique rates
UPDATE public.servers SET ton_mining_rate = 0.02, usdt_mining_rate = 0.30 WHERE name = 'Dawn Blade';
UPDATE public.servers SET ton_mining_rate = 0.04, usdt_mining_rate = 0.50 WHERE name = 'Nano Core';
UPDATE public.servers SET ton_mining_rate = 0.07, usdt_mining_rate = 0.90 WHERE name = 'Spark Node';
UPDATE public.servers SET ton_mining_rate = 0.10, usdt_mining_rate = 1.20 WHERE name = 'Pulse Unit';

-- Rare tier (10-25 TON) - clear jump from common
UPDATE public.servers SET ton_mining_rate = 0.15, usdt_mining_rate = 2.00 WHERE name = 'Arcane Shield';
UPDATE public.servers SET ton_mining_rate = 0.20, usdt_mining_rate = 2.80 WHERE name = 'Vortex Hub';
UPDATE public.servers SET ton_mining_rate = 0.30, usdt_mining_rate = 4.00 WHERE name = 'Blaze Engine';
UPDATE public.servers SET ton_mining_rate = 0.42, usdt_mining_rate = 5.50 WHERE name = 'Storm Rack';

-- Epic tier (40-85 TON) - significant jump
UPDATE public.servers SET ton_mining_rate = 0.60, usdt_mining_rate = 8.00 WHERE name = 'Titan Frame';
UPDATE public.servers SET ton_mining_rate = 0.80, usdt_mining_rate = 10.00 WHERE name = 'Nature Staff';
UPDATE public.servers SET ton_mining_rate = 1.00, usdt_mining_rate = 12.50 WHERE name = 'Phantom Grid';
UPDATE public.servers SET ton_mining_rate = 1.30, usdt_mining_rate = 16.00 WHERE name = 'Nova Cluster';

-- Legendary tier (120-500 TON) - each one unique and progressively better
UPDATE public.servers SET ton_mining_rate = 1.80, usdt_mining_rate = 22.00 WHERE name = 'Hyper Matrix';
UPDATE public.servers SET ton_mining_rate = 2.50, usdt_mining_rate = 30.00 WHERE name = 'Quantum Forge';
UPDATE public.servers SET ton_mining_rate = 3.50, usdt_mining_rate = 42.00 WHERE name = 'Omega Tower';
UPDATE public.servers SET ton_mining_rate = 5.00, usdt_mining_rate = 58.00 WHERE name = 'Eclipse Vault';
UPDATE public.servers SET ton_mining_rate = 6.50, usdt_mining_rate = 75.00 WHERE name = 'Infinity Core';
UPDATE public.servers SET ton_mining_rate = 7.50, usdt_mining_rate = 85.00 WHERE name = 'Storm Axe';
UPDATE public.servers SET ton_mining_rate = 8.50, usdt_mining_rate = 95.00 WHERE name = 'Genesis Prime';
