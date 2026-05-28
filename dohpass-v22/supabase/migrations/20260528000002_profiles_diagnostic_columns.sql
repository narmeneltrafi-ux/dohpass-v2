ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS diagnostic_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS diagnostic_track        text
    CHECK (diagnostic_track IN ('specialist', 'gp'));
