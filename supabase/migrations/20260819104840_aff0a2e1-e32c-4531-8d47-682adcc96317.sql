CREATE OR REPLACE FUNCTION public.credit_ton_deposit_with_intent(_telegram_id bigint, _intent_id uuid, _wallet_address text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_amount numeric; v_tx uuid; v_hash text; v_balance numeric;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_profile'); END IF;
  BEGIN
    v_amount := public.consume_ton_intent(_intent_id, _telegram_id, 'deposit');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  SELECT tx_hash INTO v_hash FROM public.ton_payment_intents WHERE id = _intent_id;
  UPDATE public.profiles SET ton_balance = COALESCE(ton_balance, 0) + v_amount
  WHERE id = v_profile RETURNING ton_balance INTO v_balance;
  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address, tx_hash)
  VALUES (v_profile, 'deposit', v_amount, 'ton', 'completed', _wallet_address, v_hash)
  RETURNING id INTO v_tx;
  RETURN jsonb_build_object('success', true, 'amount', v_amount, 'transactionId', v_tx, 'tonBalance', v_balance);
END; $$;

CREATE OR REPLACE FUNCTION public.verify_wallet_with_intent(_telegram_id bigint, _intent_id uuid, _wallet_address text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_amount numeric; v_hash text;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_profile'); END IF;
  BEGIN
    v_amount := public.consume_ton_intent(_intent_id, _telegram_id, 'wallet_verification');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  SELECT tx_hash INTO v_hash FROM public.ton_payment_intents WHERE id = _intent_id;
  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address, tx_hash)
  VALUES (v_profile, 'wallet_verification', v_amount, 'ton', 'completed', _wallet_address, v_hash);
  RETURN jsonb_build_object('success', true, 'verified', true);
END; $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal_for_telegram(_telegram_id bigint, _amount numeric, _currency text, _wallet_address text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_balance numeric; v_verified boolean; v_pending int; v_id uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_profile'); END IF;
  IF _currency NOT IN ('ton','usdt') THEN RETURN jsonb_build_object('success', false, 'error', 'bad_currency'); END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_amount');
  END IF;
  IF _wallet_address IS NULL OR length(_wallet_address) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_wallet');
  END IF;

  v_verified := public.game_is_wallet_verified(_telegram_id);
  IF NOT v_verified THEN RETURN jsonb_build_object('success', false, 'error', 'wallet_not_verified'); END IF;

  SELECT CASE WHEN _currency = 'ton' THEN COALESCE(ton_balance, 0) ELSE COALESCE(usdt_balance, 0) END
  INTO v_balance FROM public.profiles WHERE id = v_profile FOR UPDATE;
  IF v_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', v_balance);
  END IF;

  SELECT count(*) INTO v_pending FROM public.transactions
  WHERE user_id = v_profile AND type = 'withdrawal' AND currency = _currency AND status = 'pending';
  IF v_pending > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'pending_request_exists'); END IF;

  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address)
  VALUES (v_profile, 'withdrawal', _amount, _currency, 'pending', _wallet_address)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END; $$;

REVOKE ALL ON FUNCTION public.credit_ton_deposit_with_intent(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_wallet_with_intent(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_withdrawal_for_telegram(bigint, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_ton_deposit_with_intent(bigint, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_wallet_with_intent(bigint, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_for_telegram(bigint, numeric, text, text) TO anon, authenticated, service_role;