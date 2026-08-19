REVOKE ALL ON FUNCTION public.game_settle_bet_for_telegram(bigint, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.game_place_bet_for_telegram(bigint, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.game_credit_referral(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_welcome_prize(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_settle_bet_for_telegram(bigint, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.game_place_bet_for_telegram(bigint, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.game_credit_referral(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_welcome_prize(bigint) TO service_role;