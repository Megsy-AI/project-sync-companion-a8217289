-- Allow public read on profiles for attack feed
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO public USING (true);

-- Allow anon to update characters
CREATE POLICY "Anyone can update character hp" ON public.characters FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Allow anon to insert attacks  
DROP POLICY IF EXISTS "Authenticated users can attack" ON public.attacks;
CREATE POLICY "Anyone can attack" ON public.attacks FOR INSERT TO public WITH CHECK (true);

-- Allow anon to insert mining sessions
DROP POLICY IF EXISTS "Users can start mining" ON public.mining_sessions;
CREATE POLICY "Anyone can start mining" ON public.mining_sessions FOR INSERT TO public WITH CHECK (true);

-- Allow anon to view mining sessions
DROP POLICY IF EXISTS "Users can view own mining" ON public.mining_sessions;
CREATE POLICY "Anyone can view mining" ON public.mining_sessions FOR SELECT TO public USING (true);

-- Allow anon to insert profiles
DROP POLICY IF EXISTS "Authenticated can insert own profile" ON public.profiles;
CREATE POLICY "Anyone can insert profile" ON public.profiles FOR INSERT TO public WITH CHECK (true);

-- Allow anon to update profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Anyone can update profile" ON public.profiles FOR UPDATE TO public USING (true);

-- Allow anon to insert user_tasks
DROP POLICY IF EXISTS "Users can complete tasks" ON public.user_tasks;
CREATE POLICY "Anyone can complete tasks" ON public.user_tasks FOR INSERT TO public WITH CHECK (true);

-- Allow anon to view user_tasks
DROP POLICY IF EXISTS "Users can view own tasks" ON public.user_tasks;
CREATE POLICY "Anyone can view tasks" ON public.user_tasks FOR SELECT TO public USING (true);

-- Allow anon to insert transactions
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Anyone can insert transactions" ON public.transactions FOR INSERT TO public WITH CHECK (true);

-- Allow anon to view transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Anyone can view transactions" ON public.transactions FOR SELECT TO public USING (true);

-- Allow anon to insert user_servers
DROP POLICY IF EXISTS "Users can purchase servers" ON public.user_servers;
CREATE POLICY "Anyone can purchase servers" ON public.user_servers FOR INSERT TO public WITH CHECK (true);

-- Allow anon to view user_servers
DROP POLICY IF EXISTS "Users can view own servers" ON public.user_servers;
CREATE POLICY "Anyone can view servers" ON public.user_servers FOR SELECT TO public USING (true);

-- Allow update on mining_sessions
CREATE POLICY "Anyone can update mining" ON public.mining_sessions FOR UPDATE TO public USING (true);