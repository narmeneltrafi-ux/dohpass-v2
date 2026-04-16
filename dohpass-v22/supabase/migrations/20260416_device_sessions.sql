-- Single-device session enforcement table
-- Run this in Supabase SQL Editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS device_sessions (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device_info   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own session
CREATE POLICY "Users can read own session"
  ON device_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own session
CREATE POLICY "Users can insert own session"
  ON device_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own session
CREATE POLICY "Users can update own session"
  ON device_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own session (on logout)
CREATE POLICY "Users can delete own session"
  ON device_sessions FOR DELETE
  USING (auth.uid() = user_id);
