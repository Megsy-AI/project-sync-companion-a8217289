CREATE TABLE public.user_nfts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL DEFAULT 'Custom NFT',
  image_url TEXT NOT NULL,
  storage_path TEXT,
  rarity TEXT NOT NULL DEFAULT 'custom',
  price_ton NUMERIC NOT NULL DEFAULT 1,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_nfts TO anon;
GRANT SELECT ON public.user_nfts TO authenticated;
GRANT ALL ON public.user_nfts TO service_role;

ALTER TABLE public.user_nfts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view generated NFTs"
ON public.user_nfts FOR SELECT
USING (true);

CREATE INDEX idx_user_nfts_telegram ON public.user_nfts(telegram_id);