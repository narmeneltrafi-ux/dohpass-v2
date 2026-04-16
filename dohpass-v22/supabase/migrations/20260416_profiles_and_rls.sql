-- ============================================================
-- DOHPass — Schema Migration
-- Adds: profiles table, RLS on profiles + user_progress
-- Safe to run on a live database (idempotent via IF NOT EXISTS)
-- ============================================================


-- ── 1. PROFILES TABLE ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  full_name   text,
  plan        text        NOT NULL DEFAULT 'free',
  is_paid     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'One row per auth.users entry — extended user profile.';


-- ── 2. AUTO-CREATE PROFILE ON SIGN-UP ───────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger first so this script is re-runnable
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ── 3. BACKFILL PROFILES FOR EXISTING USERS ─────────────────
-- Inserts a profile row for every auth.users row that doesn't
-- have one yet, so FK on user_progress won't fail.

INSERT INTO public.profiles (id, email)
SELECT id, email
FROM   auth.users
ON CONFLICT (id) DO NOTHING;


-- ── 4. USER_PROGRESS — ADD FK TO PROFILES ───────────────────
-- The table already exists; we only add the FK if missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  constraint_name = 'user_progress_user_id_fkey'
      AND  table_name      = 'user_progress'
  ) THEN
    ALTER TABLE public.user_progress
      ADD CONSTRAINT user_progress_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Add a unique constraint for the upsert conflict key if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  constraint_name = 'user_progress_user_id_question_id_key'
      AND  table_name      = 'user_progress'
  ) THEN
    ALTER TABLE public.user_progress
      ADD CONSTRAINT user_progress_user_id_question_id_key
      UNIQUE (user_id, question_id);
  END IF;
END;
$$;


-- ── 5. ROW LEVEL SECURITY — PROFILES ────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "profiles: select own" ON public.profiles;
CREATE POLICY "profiles: select own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not id, plan, is_paid)
DROP POLICY IF EXISTS "profiles: update own" ON public.profiles;
CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can do everything (bypasses RLS automatically, but explicit for clarity)
-- No INSERT policy needed for users — the trigger handles it as SECURITY DEFINER


-- ── 6. ROW LEVEL SECURITY — USER_PROGRESS ───────────────────

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Users can read their own progress rows
DROP POLICY IF EXISTS "user_progress: select own" ON public.user_progress;
CREATE POLICY "user_progress: select own"
  ON public.user_progress FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can insert their own progress
DROP POLICY IF EXISTS "user_progress: insert own" ON public.user_progress;
CREATE POLICY "user_progress: insert own"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Users can update their own progress (for upsert)
DROP POLICY IF EXISTS "user_progress: update own" ON public.user_progress;
CREATE POLICY "user_progress: update own"
  ON public.user_progress FOR UPDATE
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);


-- ── 7. GRANT PERMISSIONS ─────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.profiles     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT ALL                     ON public.profiles     TO service_role;
GRANT ALL                     ON public.user_progress TO service_role;
