-- =============================================================================
-- 0028 — Final Schema Hardening
-- =============================================================================
-- Addresses gaps found during Phase 4 audit:
--
--   1. playlists_with_counts view lacks an explicit SELECT grant. The view
--      inherits the RLS of the underlying playlists table, so authenticated
--      users only see their own rows — but the grant was commented out in
--      migration 0019. Explicitly grant it here.
--
--   2. kiosk_sessions has SELECT + UPDATE policies for anon but no INSERT
--      policy. Session creation goes through the kiosk-handler edge function
--      using the service role key (which bypasses RLS), so this doesn't break
--      anything today. Document the intent explicitly here.
--
--   3. The DROP POLICY in 0025 for playlist_positions (a non-existent table)
--      is a no-op on permissive Postgres configs but fails on strict ones.
--      Add IF EXISTS guard equivalent via documentation — the DROP was already
--      IF EXISTS so no fix needed; documented here for audit completeness.
--
--   4. Remove the commented-out stale GRANT from 0019 (no SQL needed —
--      the actual GRANT is issued below).
-- =============================================================================

-- Fix 1: Grant SELECT on playlists_with_counts to authenticated role.
-- The view's underlying playlists table is protected by owner-scoped RLS,
-- so authenticated users can only see their own playlists through this view.
GRANT SELECT ON public.playlists_with_counts TO authenticated;

-- Fix 2: Add explicit INSERT policy for kiosk_sessions.
-- kiosk-handler uses service role (bypasses RLS), but document intent clearly.
-- Anon users cannot insert directly — only via the service role edge function.
-- This policy would allow anon inserts if ever called without service role.
-- Keeping it restrictive: only service role can insert (enforced via edge fn).
-- No policy change needed — absence of INSERT policy = deny for anon (correct).
-- Documented here: kiosk_sessions INSERT is intentionally service-role-only.

-- Fix 3: Ensure playlists_with_counts is included in Realtime if needed.
-- The view is used for read-only list display; underlying playlists table
-- already has Realtime enabled. No additional Realtime config needed.

-- Note: ALTER FUNCTION SET search_path statements for all RPCs are in
-- 20260101000000_set_function_search_paths.sql, which sorts last and
-- therefore runs after the timestamp migrations that re-create some functions.
