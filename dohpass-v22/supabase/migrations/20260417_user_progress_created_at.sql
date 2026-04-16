-- Add created_at timestamp to user_progress for daily activity tracking.
-- Existing rows will have NULL (before tracking began); new rows auto-timestamp.
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
