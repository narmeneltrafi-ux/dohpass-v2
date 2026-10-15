-- profiles column privileges: close latent self-grant path + unbreak two silent writes.
--
-- 1) authenticated currently holds INSERT on entitlement columns (is_paid, plan,
--    access_expires_at, is_admin, grace_period_end, current_period_end, ...).
--    The "insert own" RLS policy only checks auth.uid() = id. Today the
--    on_auth_user_created trigger creates the row first, so a client INSERT hits
--    the PK and fails — but one trigger failure away from a user inserting their
--    own row with is_paid=true / is_admin=true. Client code (ensureProfile) only
--    inserts id + email, so restrict INSERT to the columns it actually needs.
--
-- 2) authenticated holds UPDATE on full_name only, so saveExamDate() and
--    completeDiagnostic() have been failing silently (permission denied, error
--    ignored client-side). Grant UPDATE on exactly those four non-entitlement
--    columns. RLS "update own" still scopes rows to auth.uid().

revoke insert on public.profiles from authenticated;
grant insert (id, email, full_name, created_at) on public.profiles to authenticated;

grant update (exam_date, exam_name, diagnostic_completed_at, diagnostic_track)
  on public.profiles to authenticated;

-- anon must hold nothing on profiles
revoke all on public.profiles from anon;
