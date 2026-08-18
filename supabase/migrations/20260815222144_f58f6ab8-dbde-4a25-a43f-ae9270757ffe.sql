CREATE TABLE public.ton_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  action text NOT NULL,
  amount_nano bigint NOT NULL,
  wallet_address text,
  memo text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'created',
  boc text,
  tx_hash text UNIQUE,
  failure_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ton_payment_intents_action_valid CHECK (action IN ('deposit','wallet_verification','server_purchase','battle_purchase','ai_pro','nft_purchase')),
  CONSTRAINT ton_payment_intents_amount_positive CHECK (amount_nano > 0),
  CONSTRAINT ton_payment_intents_status_valid CHECK (status IN ('created','submitted','confirmed','failed','expired'))
);

GRANT ALL ON public.ton_payment_intents TO service_role;

ALTER TABLE public.ton_payment_intents ENABLE ROW LEVEL SECURITY;

CREATE INDEX ton_payment_intents_lookup_idx ON public.ton_payment_intents (telegram_id, status, created_at DESC);
CREATE INDEX ton_payment_intents_pending_idx ON public.ton_payment_intents (status, expires_at) WHERE status IN ('created','submitted');

CREATE OR REPLACE FUNCTION public.set_ton_payment_intent_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ton_payment_intent_updated_at
BEFORE UPDATE ON public.ton_payment_intents
FOR EACH ROW EXECUTE FUNCTION public.set_ton_payment_intent_updated_at();

CREATE OR REPLACE FUNCTION public.game_create_transaction(
  _telegram_id bigint,
  _type text,
  _amount numeric,
  _currency text,
  _wallet_address text,
  _tx_hash text DEFAULT NULL,
  _status text DEFAULT 'pending'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_profile uuid; v_id uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_profile'); END IF;
  IF _type NOT IN ('deposit','withdrawal','wallet_verification') THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_type');
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_amount');
  END IF;
  IF _currency NOT IN ('ton','usdt','siri') THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_currency');
  END IF;
  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address, tx_hash)
  VALUES (v_profile, _type, _amount, _currency, 'pending', _wallet_address, _tx_hash)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;