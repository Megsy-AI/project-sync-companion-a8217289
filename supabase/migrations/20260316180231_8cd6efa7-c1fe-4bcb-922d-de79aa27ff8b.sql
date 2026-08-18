CREATE POLICY "No direct access to telegram_admins"
ON public.telegram_admins
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct access to battle_inventory"
ON public.battle_inventory
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct access to referral_rewards"
ON public.referral_rewards
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct access to telegram_notifications"
ON public.telegram_notifications
FOR ALL
USING (false)
WITH CHECK (false);