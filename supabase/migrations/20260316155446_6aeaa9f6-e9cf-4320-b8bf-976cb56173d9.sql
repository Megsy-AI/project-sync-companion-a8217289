
-- Fix overly permissive INSERT policies
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service can insert transactions" ON public.transactions;

-- Profiles: only service role (edge functions) can insert via RPC, restrict to authenticated
CREATE POLICY "Authenticated can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Transactions: only authenticated users can create their own
CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
