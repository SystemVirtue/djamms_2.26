-- =============================================================================
-- Set search_path on all RPCs that were missing it
-- =============================================================================
-- This migration runs last (timestamp: 2026-01-01) to ensure search_path is
-- set correctly on all functions, including those re-created by earlier
-- timestamp migrations that didn't include SET search_path clauses.
-- =============================================================================

ALTER FUNCTION public.queue_add(UUID, UUID, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.queue_remove(UUID) SET search_path = public;
ALTER FUNCTION public.queue_skip(UUID) SET search_path = public;
ALTER FUNCTION public.queue_clear(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.queue_next(UUID) SET search_path = public;
ALTER FUNCTION public.player_heartbeat(UUID) SET search_path = public;
ALTER FUNCTION public.log_event(UUID, TEXT, TEXT, JSONB) SET search_path = public;
ALTER FUNCTION public.kiosk_increment_credit(UUID, INT) SET search_path = public;
ALTER FUNCTION public.kiosk_decrement_credit(UUID, INT) SET search_path = public;
ALTER FUNCTION public.cleanup_expired_queue() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.create_player_for_user(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_my_player_id() SET search_path = public;
ALTER FUNCTION public.load_playlist(UUID, UUID, INT) SET search_path = public;
ALTER FUNCTION public.queue_reorder(UUID, UUID[], TEXT) SET search_path = public;
ALTER FUNCTION public.queue_reorder_wrapper(UUID, UUID[], TEXT) SET search_path = public;
