/**
 * Shared configuration for all three frontend apps.
 *
 * All environment-variable access is centralised here. Components and helpers
 * import from this file — they never call import.meta.env directly.
 */

// =============================================================================
// SUPABASE CONNECTION
// =============================================================================

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[config] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Copy .env.example to .env and fill in your Supabase credentials.'
  );
}

// =============================================================================
// PLAYER INSTANCE
// =============================================================================

/**
 * The UUID of the player instance this app is managing / displaying.
 *
 * Set via VITE_PLAYER_ID in each app's .env file.
 * Falls back to the legacy default UUID for backwards compatibility with
 * single-instance deployments that haven't yet set this env var.
 */
export const PLAYER_ID: string =
  import.meta.env.VITE_PLAYER_ID || '00000000-0000-0000-0000-000000000001';

if (!import.meta.env.VITE_PLAYER_ID) {
  console.warn(
    '[config] VITE_PLAYER_ID is not set. Using legacy default player UUID. ' +
    'Set VITE_PLAYER_ID in your .env file for multi-tenant deployments.'
  );
}

// =============================================================================
// FEATURE FLAGS
// (Runtime values come from player_settings in the DB; these are dev-time defaults)
// =============================================================================

/**
 * Whether the kiosk search feature is shown.
 * Runtime value is sourced from player_settings.search_enabled via Realtime.
 */
export const DEFAULT_SEARCH_ENABLED = true;

/**
 * Whether the kiosk runs in freeplay mode (no coins required).
 * Runtime value is sourced from player_settings.freeplay via Realtime.
 */
export const DEFAULT_FREEPLAY = false;

// =============================================================================
// TIMING CONSTANTS
// These are intentional — document here rather than scattering magic numbers.
// =============================================================================

/** Debounce delay (ms) before re-fetching queue after a Realtime change event. */
export const QUEUE_REFETCH_DEBOUNCE_MS = 800;

/** Fade duration (ms) for video crossfade on skip / song-end. */
export const FADE_DURATION_MS = 2000;

/** Delay (ms) after loading a video before calling playVideo() to work around
 *  YouTube iframe buffering race condition. */
export const YOUTUBE_PLAY_DELAY_MS = 500;

/** Time (ms) since last heartbeat before a player is considered offline. */
export const PLAYER_OFFLINE_THRESHOLD_MS = 10_000;

/** Interval (ms) between import requests when bulk-importing playlists. */
export const IMPORT_REQUEST_DELAY_MS = 3_000;

/** Failsafe timer (ms) on skip: if the player doesn't report the new video
 *  within this window, force a queue advancement. */
export const SKIP_FAILSAFE_MS = 3_000;

/** Autoplay window (ms): after loading, expect playback to start within this
 *  time before showing an error. */
export const AUTOPLAY_WINDOW_MS = 5_000;

/** How often (ms) to check coin acceptor connection status. */
export const COIN_ACCEPTOR_CHECK_INTERVAL_MS = 30_000;
