-- Security lockdown (panel review 2026-07, item #4).
--
-- 1. answer_remap_proposals was public with RLS disabled (advisor ERROR
--    rls_disabled_in_public). Internal answer-key remap staging table, written
--    by service-role tooling and read via the SECURITY DEFINER view
--    v_proposals_review (owned by postgres → bypasses RLS). Enable RLS with no
--    policy: service_role and the table owner still reach it; anon/authenticated
--    PostgREST access is denied. No legitimate client reads it directly.
ALTER TABLE public.answer_remap_proposals ENABLE ROW LEVEL SECURITY;

-- 2. Admin/audit SECURITY DEFINER RPCs were anon-executable (advisor WARN
--    anon_security_definer_function_executable). The live access path was an
--    EXECUTE grant to PUBLIC (default for new functions); revoke from PUBLIC.
--    Explicit role grants remain:
--      get_audit_candidates   -> postgres, service_role (no client caller in repo)
--      get_blueprint_coverage -> authenticated (god-mode Blueprint agent,
--                                BlueprintGapAgent.jsx), service_role
REVOKE EXECUTE ON FUNCTION public.get_audit_candidates(p_bank text, p_limit integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_blueprint_coverage(p_track text) FROM PUBLIC, anon;
