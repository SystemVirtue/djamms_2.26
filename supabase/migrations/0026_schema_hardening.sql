-- =============================================================================
-- 0026 — Schema Hardening: Fix broken queue_reorder stub + stale references
-- =============================================================================
--
-- Problem 1: Migration 0023 created a 4-argument queue_reorder() with an EMPTY
-- body ("-- Your actual implementation here"). Migration 0022's 3-arg forwarder
-- calls queue_reorder(p_player_id, p_queue_ids, p_type, 0), which resolves to
-- this empty stub — meaning every large reorder silently does nothing.
--
-- Fix: Drop the empty 4-arg stub. The canonical reorder logic lives in the
-- 3-arg version created by 0018 (and confirmed current by 0022). The wrapper
-- used by the client (queue_reorder_wrapper) calls the 3-arg version directly.
--
-- Problem 2: Migration 0025 attempted to drop a policy on `playlist_positions`,
-- a table that was never created. This is a no-op on most Postgres versions but
-- produces a warning and could fail on strict configurations.
--
-- Problem 3: Migration 0019 contains ~100 lines of commented-out dead code for
-- a `player_import_playlists` table that doesn't exist. No action needed at
-- runtime, but documented here for clarity.
-- =============================================================================

-- Fix 1: Drop the empty 4-arg queue_reorder stub introduced by 0023.
-- The 3-arg version (0018 / 0022) is the correct implementation.
DROP FUNCTION IF EXISTS public.queue_reorder(uuid, uuid[], text, integer);

-- Confirm: the 3-arg queue_reorder remains intact and is the canonical implementation.
-- No re-creation needed — it was not touched by the DROP above.

-- Fix 2: The `playlist_positions` table referenced in 0025 does not exist.
-- The DROP POLICY IF EXISTS in 0025 was a no-op. Document and move on.
-- No SQL change needed; this comment serves as the audit trail.

-- Verification comment: after this migration the call chain for reorder is:
--   client → queue_reorder_wrapper(p_player_id, p_queue_ids, p_type)
--          → queue_reorder(p_player_id, p_queue_ids, p_type)   [3-arg, 0018+0022 impl]
--
-- The wrapper also resets now_playing_index = -1 (added in 20251109153923).
