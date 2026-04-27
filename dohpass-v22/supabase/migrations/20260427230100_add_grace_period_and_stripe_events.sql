-- Adds the grace-period column on profiles and the idempotency table
-- the stripe-webhook v25 function relies on. Both are written
-- defensively (IF NOT EXISTS) since the production DB already has
-- these objects — this migration is the missing repo-side record.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grace_period_end timestamptz DEFAULT NULL;

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_events_processed_at_idx ON stripe_events (processed_at);
