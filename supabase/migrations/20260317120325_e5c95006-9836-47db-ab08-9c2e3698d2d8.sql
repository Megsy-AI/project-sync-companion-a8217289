-- Drop the foreign key constraint on profiles.user_id -> auth.users
-- This app uses Telegram authentication, not Supabase Auth, so this FK is invalid
ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_fkey;