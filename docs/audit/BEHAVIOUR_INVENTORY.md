# Behaviour Inventory — obie-v5

Generated during Phase 0.2. This is the regression checklist for every refactor step. After any change touching runtime code, walk through the relevant behaviours and confirm they still work.

---

## Behaviour: Player Initialization

- **Actor:** System (Player app on load)
- **Trigger:** Player app boots (`useEffect` on mount, `hasInitialized` guard)
- **Flow:**
  1. Player calls `initializePlayerPlaylist(PLAYER_ID)` → RPC `initialize_player_playlist`
  2. RPC checks if queue is empty; if so, finds the active playlist and bulk-inserts its items into `queue`
  3. Player calls `callPlayerControl({ action: 'register_session', session_id, stored_player_id? })` → `player-control` edge function
  4. Edge function checks `players.priority_player_id`; if absent or matches stored ID, this player becomes priority
  5. Player stores `is_priority` status in `isSlavePlayer` state
  6. Priority player sends all status updates; slave players observe only
- **Edge cases:**
  - Player has no playlists → `initializePlayerPlaylist` returns null, no queue items loaded, idle state shows
  - Two players open simultaneously → first to register becomes priority; second becomes slave
  - Player previously had priority (stored in localStorage) → restored as priority player on re-open
- **Files involved:**
  - `web/player/src/App.tsx`
  - `web/shared/supabase-client.ts` (`initializePlayerPlaylist`, `callPlayerControl`)
  - `supabase/functions/player-control/index.ts` (action: `register_session`)
  - `supabase/migrations/0001_initial_schema.sql` (RPC: `initialize_player_playlist`)
  - `supabase/migrations/20251110120000_add_priority_player_id.sql`

---

## Behaviour: Video Playback (Normal)

- **Actor:** System (Player app)
- **Trigger:** `currentMedia` state is set to a media item with a valid YouTube URL
- **Flow:**
  1. `useEffect` on `currentMedia` extracts YouTube video ID from URL
  2. If YT IFrame API is loaded and player exists: calls `playerRef.current.loadVideoById(youtubeId)` then explicit `playVideo()` after 500ms
  3. If first video: creates new `window.YT.Player` with `autoplay: 0` and registers event handlers
  4. `onPlayerStateChange` fires: state 1 (PLAYING) → `reportStatus('playing')` → `callPlayerControl({ action: 'update', state: 'playing', progress })`
  5. `player_status` table updated → all subscribers (admin, kiosk) receive update via Realtime
- **Edge cases:**
  - YouTube API not loaded yet → effect re-runs when `ytApiReady` becomes true
  - Video embedding disabled (errors 101/150/100) → auto-skip and remove from queue/playlists
  - Same `currentMedia.id` passed again → effect bails early, no duplicate load
- **Files involved:**
  - `web/player/src/App.tsx`
  - `web/shared/supabase-client.ts` (`callPlayerControl`, `subscribeToPlayerStatus`)
  - `supabase/functions/player-control/index.ts`
  - `supabase/migrations/0001_initial_schema.sql` (table: `player_status`, `queue`)

---

## Behaviour: Video End → Queue Progression

- **Actor:** System (Player app)
- **Trigger:** YouTube `onPlayerStateChange` fires with state `0` (ENDED)
- **Flow:**
  1. `reportEndedAndNext(false)` called
  2. Calls `callPlayerControl({ action: 'ended', state: 'idle', progress: 1 })`
  3. Edge function calls `queue_next` RPC: marks current queue item as `played_at = now()`, advances `now_playing_index`, returns next item's media data
  4. Player receives `result.next_item` and sets `currentMedia` directly (fast path, no roundtrip wait)
  5. If no next item: `currentMedia = null`, player shows idle state
  6. `player_status` table updated → Realtime pushes to admin and kiosk
- **Edge cases:**
  - Queue empty → idle state displayed; loop setting triggers `initializePlayerPlaylist` to reload
  - Network error during `ended` call → player may hang on idle; no auto-retry
- **Files involved:**
  - `web/player/src/App.tsx`
  - `web/shared/supabase-client.ts` (`callPlayerControl`)
  - `supabase/functions/player-control/index.ts` (action: `ended`, calls `queue_next` RPC)
  - `supabase/migrations/0001_initial_schema.sql` (RPC: `queue_next`)

---

## Behaviour: Skip (Admin-Initiated)

- **Actor:** Admin
- **Trigger:** Admin clicks ⏭ skip button in admin console
- **Flow:**
  1. Admin calls `callPlayerControl({ action: 'skip', state: 'idle' })`
  2. `player_status` updated to `idle` in DB → Realtime fires on Player
  3. Player's `subscribeToPlayerStatus` callback sees `idle` when previous state was `playing/paused`
  4. Player calls `reportEndedAndNext(true)` (with fade)
  5. `fadeOut()` runs (2s), then `ended` action called → queue advances
  6. New video loaded, `fadeIn()` triggered when playback starts
- **Edge cases:**
  - Skip during fade → isSkipping flag prevents double-skip; 3s failsafe timeout resets flag
  - Slave player receives the `idle` status update but does not call `reportEndedAndNext`
- **Files involved:**
  - `web/admin/src/App.tsx` (`handleSkip`)
  - `web/shared/supabase-client.ts` (`callPlayerControl`, `subscribeToPlayerStatus`)
  - `web/player/src/App.tsx` (status subscription, `reportEndedAndNext`)
  - `supabase/functions/player-control/index.ts`

---

## Behaviour: Play/Pause Toggle (Admin-Initiated)

- **Actor:** Admin
- **Trigger:** Admin clicks ⏸/▶ button in admin console
- **Flow:**
  1. Admin calls `callPlayerControl({ action: 'update', state: 'paused'|'playing' })`
  2. `player_status.state` updated → Realtime fires on Player
  3. Player's `subscribeToPlayerStatus` callback: `paused` → `fadeOut()` then `pauseVideo()`; `playing` → `playVideo()` then `fadeIn()`
  4. Status reported back to server
- **Edge cases:**
  - Multiple rapid clicks may queue multiple fade operations; `clearInterval` on `fadeIntervalRef` prevents overlap
- **Files involved:**
  - `web/admin/src/App.tsx` (`handlePlayPause`)
  - `web/shared/supabase-client.ts` (`callPlayerControl`, `subscribeToPlayerStatus`)
  - `web/player/src/App.tsx`
  - `supabase/functions/player-control/index.ts`

---

## Behaviour: Kiosk Session Initialization

- **Actor:** Kiosk app
- **Trigger:** Kiosk app mounts, `initSession` runs
- **Flow:**
  1. Kiosk calls `callKioskHandler({ action: 'init', player_id: PLAYER_ID })`
  2. Edge function queries `players` table, gets first player
  3. Creates `kiosk_sessions` row with `credits: 0`
  4. Returns session object; kiosk stores in state
  5. `subscribeToKioskSession` subscribes to Realtime on `session_id`
  6. Additional `subscribeToTable('kiosk_sessions', { player_id })` watches for any session updates (for total credit sync)
- **Edge cases:**
  - No player exists in DB → 500 error, session null, kiosk non-functional
  - Multiple kiosk tabs → each gets its own session_id; credits are shown as aggregate total
- **Files involved:**
  - `web/kiosk/src/App.tsx`
  - `web/shared/supabase-client.ts` (`callKioskHandler`, `subscribeToKioskSession`, `getTotalCredits`)
  - `supabase/functions/kiosk-handler/index.ts` (action: `init`)

---

## Behaviour: Kiosk Song Search

- **Actor:** Kiosk user
- **Trigger:** User types query and presses SEARCH on the on-screen keyboard
- **Flow:**
  1. `performSearch(query)` called; fetches `${VITE_SUPABASE_URL}/functions/v1/youtube-scraper` with `{ query, type: 'search' }`
  2. `youtube-scraper` calls YouTube Data API v3 with rotating API keys; returns video metadata array
  3. Results set in state; search results panel shown; keyboard hidden
  4. User selects a video → confirmation dialog shown
- **Edge cases:**
  - All API keys quota-exceeded → error displayed, empty results
  - Network timeout → error displayed
  - `search_enabled: false` in player_settings → search UI hidden (enforced in kiosk UI)
- **Files involved:**
  - `web/kiosk/src/App.tsx` (`performSearch`)
  - `web/kiosk/src/components/SearchInterface.tsx`
  - `web/kiosk/src/components/SearchKeyboard.tsx`
  - `web/kiosk/src/components/VideoResultCard.tsx`
  - `supabase/functions/youtube-scraper/index.ts`
  - `web/shared/types.ts` (`SearchResult`)

---

## Behaviour: Kiosk Song Request (Paid)

- **Actor:** Kiosk user
- **Trigger:** User confirms song selection when `freeplay = false` and `credits >= coin_per_song`
- **Flow:**
  1. `callKioskHandler({ action: 'request', session_id, url: selectedResult.url, player_id })` called
  2. Edge function verifies credits; deducts `coin_per_song` from session
  3. Calls `youtube-scraper` to scrape/upsert media item
  4. Calls `queue_add` RPC with `type: 'priority'`
  5. `queue` table updated → Realtime fires → admin and player receive updated queue
  6. `kiosk_sessions.credits` decremented → Realtime fires → kiosk updates credit display
- **Edge cases:**
  - Insufficient credits → UI shows warning; request blocked
  - Video already in DB → scrape upserts without duplication
  - Queue at `priority_queue_limit` → request rejected by edge function
- **Files involved:**
  - `web/kiosk/src/App.tsx` (`handleConfirmAdd`)
  - `web/shared/supabase-client.ts` (`callKioskHandler`)
  - `supabase/functions/kiosk-handler/index.ts` (action: `request`)
  - `supabase/functions/youtube-scraper/index.ts`
  - `supabase/migrations/0001_initial_schema.sql` (RPC: `queue_add`)

---

## Behaviour: Kiosk Song Request (Freeplay)

- **Actor:** Kiosk user
- **Trigger:** User confirms song selection when `freeplay = true`
- **Flow:** Same as paid request, except credit check skipped. Request type is `priority`.
- **Files involved:** Same as paid request path.

---

## Behaviour: Credit Management (Admin)

- **Actor:** Admin
- **Trigger:** Admin clicks +1, +3 Credit or Clear Credits in Kiosk Settings
- **Flow:**
  1. `updateAllCredits(PLAYER_ID, 'add', amount)` or `updateAllCredits(PLAYER_ID, 'clear')`
  2. Direct Supabase update on `kiosk_sessions` — no edge function
  3. `add`: finds most-recently-active session, increments credits
  4. `clear`: sets credits to 0 for all sessions belonging to player
  5. Realtime on `kiosk_sessions` fires → kiosk updates credit display
- **Files involved:**
  - `web/admin/src/App.tsx` (`handleAddCredits`, `handleClearCredits`)
  - `web/shared/supabase-client.ts` (`updateAllCredits`, `getTotalCredits`)

---

## Behaviour: Queue Reorder (Admin Drag-and-Drop)

- **Actor:** Admin
- **Trigger:** Admin drags a queue item to a new position in "Up Next" panel
- **Flow:**
  1. `onDragEnd` called with `active.id` and `over.id`
  2. Optimistic update: `arrayMove` applied to local `queue` state
  3. `callQueueManager({ action: 'reorder', queue_ids: reorderedIds, type: 'normal' })`
  4. If `queue_ids.length > 50`: calls `queue_reorder_wrapper` RPC directly (bypass edge function)
  5. Otherwise: calls `queue-manager` edge function → calls `queue_reorder` RPC
  6. DB positions updated → Realtime fires → all subscribers (player, kiosk) receive new order
- **Edge cases:**
  - Duplicate key `23505` error → retry with fresh queue fetch (up to 5 attempts with exponential backoff)
  - Reorder of priority items not supported via DnD (filtered out of sortable list)
- **Files involved:**
  - `web/admin/src/App.tsx` (`handleReorder`)
  - `web/shared/supabase-client.ts` (`callQueueManager`, `subscribeToQueue`)
  - `supabase/functions/queue-manager/index.ts`
  - `supabase/migrations/0019_create_queue_reorder_wrapper_and_playlists_counts.sql`

---

## Behaviour: Queue Shuffle (Admin)

- **Actor:** Admin
- **Trigger:** Admin clicks 🔀 Shuffle in "Up Next" panel
- **Flow:**
  1. Gets all normal queue items excluding currently playing
  2. Shuffles array randomly, calls `callQueueManager({ action: 'reorder', queue_ids: shuffledIds })`
  3. Same retry logic as reorder (up to 5 attempts)
- **Files involved:**
  - `web/admin/src/App.tsx` (`handleShuffle`)
  - `web/shared/supabase-client.ts` (`callQueueManager`)
  - `supabase/functions/queue-manager/index.ts`

---

## Behaviour: Playlist Import (Admin)

- **Actor:** Admin
- **Trigger:** Admin enters YouTube playlist ID in "Import Playlist" panel and clicks Import
- **Flow:**
  1. `callPlaylistManager({ action: 'create', player_id, name })` → creates `playlists` row, returns `playlist.id`
  2. `callPlaylistManager({ action: 'scrape', playlist_id, url })` → calls `playlist-manager` edge function
  3. Edge function calls `youtube-scraper` to fetch all video metadata
  4. For each video: upserts `media_items`, inserts `playlist_items`
  5. Returns `{ count }` of imported items
  6. Admin refreshes playlists list
- **Edge cases:**
  - YouTube quota exceeded → scrape returns error; playlist record created but empty
  - Retry via "Functions & Scripts" → `retry-failed-playlists` script re-scrapes existing playlist records
- **Files involved:**
  - `web/admin/src/App.tsx` (`PlaylistsPanel.handleImport`, `ScriptsPanel`)
  - `web/shared/supabase-client.ts` (`callPlaylistManager`)
  - `supabase/functions/playlist-manager/index.ts`
  - `supabase/functions/youtube-scraper/index.ts`

---

## Behaviour: Load Playlist into Queue (Admin)

- **Actor:** Admin
- **Trigger:** Admin clicks "▶ Load Queue" on a playlist
- **Flow:**
  1. `callPlaylistManager({ action: 'set_active', player_id, playlist_id, current_index: -1 })`
  2. `callPlaylistManager({ action: 'clear_queue', player_id })` → deletes all unplayed queue items
  3. `callPlaylistManager({ action: 'import_queue', player_id, playlist_id })` → bulk-inserts playlist items into `queue`
  4. Queue populated → player picks up from Realtime subscription
- **Files involved:**
  - `web/admin/src/App.tsx` (`handleLoad`)
  - `web/shared/supabase-client.ts` (`callPlaylistManager`)
  - `supabase/functions/playlist-manager/index.ts`

---

## Behaviour: Player Settings Changes (Real-time)

- **Actor:** Admin (Settings panel)
- **Trigger:** Admin saves settings (Shuffle, Loop, Volume, Freeplay, Search Enabled, Branding, etc.)
- **Flow:**
  1. Admin directly updates `player_settings` table via Supabase client (no edge function)
  2. `player_settings` row updated → Realtime fires on all subscribers
  3. Player app's `subscribeToPlayerSettings` callback updates local `settings` state
  4. Kiosk app's `subscribeToPlayerSettings` callback updates kiosk UI (freeplay, search_enabled, branding, etc.)
- **Files involved:**
  - `web/admin/src/App.tsx` (`SettingsPanel.saveFields`, `handleToggle`)
  - `web/shared/supabase-client.ts` (`subscribeToPlayerSettings`)
  - `web/player/src/App.tsx`
  - `web/kiosk/src/App.tsx`

---

## Behaviour: Karaoke Mode

- **Actor:** Admin toggle + Player app
- **Trigger:** Admin enables `karaoke_mode` in Playback Settings
- **Flow:**
  1. `player_settings.karaoke_mode = true` → Realtime → player receives setting update
  2. Player `useEffect` on `settings.karaoke_mode` creates lyrics overlay DOM element
  3. Fetches lyrics from `lrclib.net` API using video title/artist
  4. `requestAnimationFrame` loop syncs lyric display to YouTube player's `getCurrentTime()`
  5. When `karaoke_mode` disabled: stops RAF loop, hides overlay
- **Edge cases:**
  - No lyrics found → overlay stays hidden; no error shown
  - Unsynced lyrics (plain text) → entire lyrics block shown statically
- **Files involved:**
  - `web/player/src/App.tsx`
  - `web/admin/src/App.tsx` (toggle in settings)
  - `web/shared/supabase-client.ts` (`subscribeToPlayerSettings`)

---

## Behaviour: Coin Acceptor Hardware Integration

- **Actor:** Kiosk app
- **Trigger:** `kiosk_coin_acceptor_enabled = true` in player settings
- **Flow:**
  1. Kiosk calls `connectToCoinAcceptor()` → tries Web Serial API to open a serial port
  2. Reads serial data; each coin insertion triggers `callKioskHandler({ action: 'credit', amount: 1 })`
  3. Credits added to kiosk session → Realtime fires → credit display updates
  4. `connectionCheckIntervalRef` (setInterval) periodically checks connection health
- **Edge cases:**
  - Browser doesn't support Web Serial API → silent failure, hardware not connected
  - Device disconnected mid-session → connection check detects, updates status
- **Files involved:**
  - `web/kiosk/src/App.tsx` (`connectToCoinAcceptor`, `disconnectCoinAcceptor`)
  - `web/shared/supabase-client.ts` (`callKioskHandler`, `subscribeToPlayerSettings`)
  - `supabase/functions/kiosk-handler/index.ts` (action: `credit`)

---

## Behaviour: Admin Authentication

- **Actor:** Admin
- **Trigger:** Admin loads the admin console; no active session
- **Flow:**
  1. `getCurrentUser()` called on mount → returns null if not signed in
  2. Login form shown
  3. Admin enters email/password → `signIn(email, password)` → Supabase Auth
  4. On success: `user` state set → subscriptions start → admin console rendered
  5. `subscribeToAuth` keeps session in sync across tabs
- **Edge cases:**
  - Invalid credentials → error displayed in form
  - Session expired → auth state change fires, user set to null, login form shown again
- **Files involved:**
  - `web/admin/src/App.tsx` (`LoginForm`, `App`)
  - `web/shared/supabase-client.ts` (`signIn`, `getCurrentUser`, `subscribeToAuth`)

---

## Behaviour: Shuffle on Load (Player)

- **Actor:** System (Player app)
- **Trigger:** `settings.shuffle = true` and player has initialized
- **Flow:**
  1. `shuffleOnLoad` effect runs when `settings.shuffle` or `isSlavePlayer` changes
  2. Only runs for priority player
  3. Fetches all normal unplayed queue items
  4. Shuffles IDs, calls `callQueueManager({ action: 'reorder' })`
- **Files involved:**
  - `web/player/src/App.tsx`
  - `web/shared/supabase-client.ts` (`callQueueManager`)

---

## Behaviour: System Logs (Admin)

- **Actor:** System / Admin (read)
- **Trigger:** Any edge function logs an event to `system_logs`; Admin views Logs panel
- **Flow:**
  1. Admin loads Logs panel → fetches last 200 entries ordered by timestamp desc
  2. Supabase Realtime channel on `system_logs INSERT` events appends new logs in real-time
  3. Admin can filter by severity (info/warn/error) and search by event name or payload content
- **Files involved:**
  - `web/admin/src/App.tsx` (`LogsPanel`)
  - `supabase/migrations/0001_initial_schema.sql` (table: `system_logs`)
  - Edge functions (all write to `system_logs`)

---

## Behaviour: Now Playing Display (Kiosk)

- **Actor:** System
- **Trigger:** `player_status` changes (new song starts)
- **Flow:**
  1. Kiosk subscribes to `player_status` → receives `current_media_id` and joined `current_media`
  2. Kiosk displays "Now Playing" info (title, artist, thumbnail) on idle screen
  3. Queue marquee shows upcoming songs from `subscribeToQueue`
- **Files involved:**
  - `web/kiosk/src/App.tsx`
  - `web/shared/supabase-client.ts` (`subscribeToPlayerStatus`, `subscribeToQueue`)
