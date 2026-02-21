-- =============================================================================
-- 0027 — Restore Missing RPCs into Migration History
-- =============================================================================
-- These three functions exist on the production database (originating from
-- migrations_backup/0016 and migrations_backup/0003) but were never committed
-- to the active migrations/ directory. This migration makes the migration
-- history the authoritative source of truth for the full DB state.
--
-- Functions restored:
--   1. kiosk_request_enqueue  — atomic credit debit + priority queue add
--   2. get_default_playlist   — resolve a player's active/fallback playlist
--   3. initialize_player_playlist — load the default playlist at startup
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. kiosk_request_enqueue
--    Atomically debits kiosk session credits and enqueues a priority song.
--    Respects freeplay mode (skips credit deduction when enabled).
--    Raises exceptions on insufficient credits or session not found.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiosk_request_enqueue(
  p_session_id   UUID,
  p_media_item_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_player_id    UUID;
  v_credits      INT;
  v_coin_per_song INT := 1;
  v_freeplay     BOOLEAN := false;
  v_queue_id     UUID;
BEGIN
  -- Lock the session row to prevent concurrent credit deductions
  SELECT player_id, credits
  INTO   v_player_id, v_credits
  FROM   kiosk_sessions
  WHERE  session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Load player settings
  SELECT freeplay, coin_per_song
  INTO   v_freeplay, v_coin_per_song
  FROM   player_settings
  WHERE  player_id = v_player_id;

  v_freeplay      := COALESCE(v_freeplay, false);
  v_coin_per_song := COALESCE(v_coin_per_song, 1);

  -- Deduct credits only when not freeplay
  IF NOT v_freeplay THEN
    IF v_credits < v_coin_per_song THEN
      RAISE EXCEPTION 'Insufficient credits (have: %, need: %)', v_credits, v_coin_per_song;
    END IF;
    UPDATE kiosk_sessions
    SET    credits = credits - v_coin_per_song
    WHERE  session_id = p_session_id;
  END IF;

  -- Enqueue as priority (queue_add handles advisory lock + size limits)
  v_queue_id := queue_add(v_player_id, p_media_item_id, 'priority', p_session_id::text);

  PERFORM log_event(v_player_id, 'kiosk_request_enqueue', 'info', jsonb_build_object(
    'session_id',    p_session_id,
    'media_item_id', p_media_item_id,
    'queue_id',      v_queue_id,
    'freeplay',      v_freeplay
  ));

  RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. get_default_playlist
--    Returns the playlist to use for initial playback:
--      1. Player's currently active playlist (if set and still exists)
--      2. Any playlist that has items, most recently created first
--    The legacy fallback by name ('Obie Playlist') has been removed — 
--    branding names must not appear in database logic.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_default_playlist(
  p_player_id UUID
)
RETURNS TABLE(playlist_id UUID, playlist_name TEXT) AS $$
DECLARE
  v_playlist_id   UUID;
  v_playlist_name TEXT;
BEGIN
  -- 1. Check player's active_playlist_id
  SELECT active_playlist_id INTO v_playlist_id
  FROM   players
  WHERE  id = p_player_id;

  IF v_playlist_id IS NOT NULL THEN
    SELECT id, name INTO v_playlist_id, v_playlist_name
    FROM   playlists
    WHERE  id = v_playlist_id;

    IF FOUND THEN
      RETURN QUERY SELECT v_playlist_id, v_playlist_name;
      RETURN;
    END IF;
  END IF;

  -- 2. Fall back to any playlist for this player that has items
  SELECT p.id, p.name INTO v_playlist_id, v_playlist_name
  FROM   playlists p
  WHERE  p.player_id = p_player_id
    AND  EXISTS (SELECT 1 FROM playlist_items pi WHERE pi.playlist_id = p.id)
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_playlist_id, v_playlist_name;
  ELSE
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT WHERE FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. initialize_player_playlist
--    Called by the Player app on startup to load the default playlist
--    into the queue, resuming from the last known now_playing_index.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_player_playlist(
  p_player_id UUID
)
RETURNS TABLE(success BOOLEAN, playlist_id UUID, playlist_name TEXT, loaded_count INT) AS $$
DECLARE
  v_playlist      RECORD;
  v_current_index INT := 0;
  v_loaded_count  INT := 0;
BEGIN
  -- Resume from player's last known index
  SELECT COALESCE(now_playing_index, 0) INTO v_current_index
  FROM   player_status
  WHERE  player_id = p_player_id;

  -- Resolve default playlist
  SELECT * INTO v_playlist FROM get_default_playlist(p_player_id);

  IF v_playlist.playlist_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0;
    RETURN;
  END IF;

  -- Load it
  SELECT lp.loaded_count INTO v_loaded_count
  FROM load_playlist(p_player_id, v_playlist.playlist_id, v_current_index) lp;

  RETURN QUERY SELECT TRUE, v_playlist.playlist_id, v_playlist.playlist_name, v_loaded_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
