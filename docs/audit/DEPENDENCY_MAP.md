# Dependency Map — obie-v5

Generated during Phase 0.3.

---

## Import Graph: Frontend Apps → Shared Layer

All three apps resolve `@shared` to `web/shared/` via Vite alias in each app's `vite.config.ts`.

```
web/admin/src/App.tsx
  └── @shared/supabase-client     ← ALL types, subscriptions, API helpers, auth
      (does NOT import from web/admin/src/lib/supabaseClient.ts — that file is dead code)

web/player/src/App.tsx
  └── @shared/supabase-client     ← types, subscriptions, API helpers

web/kiosk/src/App.tsx
  └── @shared/supabase-client     ← types, subscriptions, API helpers
  └── ../../shared/types          ← SearchResult, SearchInterfaceProps (relative path, not alias)
  └── ./components/SearchInterface
  └── ./components/BackgroundPlaylist

web/kiosk/src/components/SearchInterface.tsx
  └── ../../shared/types          ← SearchResult, SearchInterfaceProps
  └── ./SearchKeyboard
  └── ./VideoResultCard
  └── ./BackToSearchButton

web/kiosk/src/components/SearchKeyboard.tsx
  └── ../../shared/keyboard       ← KEYBOARD_ROWS, SPECIAL_KEYS
```

### Shared Files and Their Consumers

| Shared File | Imported By |
|---|---|
| `web/shared/supabase-client.ts` | `web/admin/src/App.tsx`, `web/player/src/App.tsx`, `web/kiosk/src/App.tsx` |
| `web/shared/types.ts` | `web/kiosk/src/App.tsx`, `web/kiosk/src/components/SearchInterface.tsx` |
| `web/shared/keyboard.ts` | `web/kiosk/src/components/SearchKeyboard.tsx` |
| `web/shared/vite-env.d.ts` | TypeScript ambient declaration, not imported directly |

---

## Dead Import Files (Not Used)

| File | Why Dead |
|---|---|
| `web/admin/src/lib/supabaseClient.ts` | Duplicate of `web/shared/supabase-client.ts`. Nothing imports it. |
| `web/admin/src/lib/api.ts` | Wrapper file not imported anywhere in current app. |
| `web/admin/src/hooks/useAdminPrefs.ts` | Prefs logic is inlined in `App.tsx`. Nothing imports this hook. |
| `web/admin/src/App-OLD.tsx` | Not imported. Dead alternative version. |
| `web/admin/src/App-Claude.tsx` | Empty file. |
| `web/admin_original_copy/` | Entire directory, not referenced from any build target. |

---

## Frontend Apps → Supabase Edge Functions

```
web/admin/src/App.tsx
  → queue-manager     (callQueueManager: add, remove, reorder, skip, clear)
  → player-control    (callPlayerControl: update, skip, reset_priority)
  → playlist-manager  (callPlaylistManager: create, delete, set_active, clear_queue, import_queue, scrape)
  → queue_reorder_wrapper RPC (direct, for large reorders)
  → system_logs table (direct read for LogsPanel)
  → player_settings table (direct update for settings)
  → kiosk_sessions table (direct update for credits)
  → playlists_with_counts view (direct read for playlist list)
  → youtube-scraper (via supabase.functions.invoke in ScriptsPanel)

web/player/src/App.tsx
  → player-control    (callPlayerControl: register_session, update, heartbeat, ended, skip)
  → queue-manager     (callQueueManager: remove, reorder)
  → queue table       (direct read for shuffle-on-load)
  → playlist_items table (direct delete for unavailable video cleanup)
  → initialize_player_playlist RPC (direct)

web/kiosk/src/App.tsx
  → kiosk-handler     (callKioskHandler: init, request, credit)
  → youtube-scraper   (direct fetch for search)
  → kiosk_sessions table (subscribeToKioskSession, subscribeToTable, getTotalCredits, updateAllCredits)
  → player_settings table (subscribeToPlayerSettings)
  → player_status table   (subscribeToPlayerStatus)
  → queue table           (subscribeToQueue)
```

---

## Edge Functions → Database

### `queue-manager/index.ts`
| Action | DB Operation |
|---|---|
| `add` | RPC `queue_add(p_player_id, p_media_item_id, p_type, p_requested_by)` |
| `remove` | RPC `queue_remove(p_queue_id)` |
| `reorder` | RPC `queue_reorder_wrapper(p_player_id, p_queue_ids, p_type)` |
| `next` | RPC `queue_next(p_player_id)` |
| `skip` | Updates `player_status.state = 'idle'` directly; triggers player to call `ended` |
| `clear` | Deletes all unplayed queue items for player |
| Validation | Reads `players.status` to check online state for `add`/`next` actions |

### `player-control/index.ts`
| Action | DB Operation |
|---|---|
| `heartbeat` | RPC `player_heartbeat(p_player_id)` |
| `register_session` | Reads `players.priority_player_id`; updates it if claiming priority |
| `update` | Updates `player_status` (state, progress, last_updated) |
| `ended` | Calls `queue_next` RPC; updates `player_status.current_media_id`, `now_playing_index` |
| `skip` | Updates `player_status.state = 'idle'` |
| `reset_priority` | Sets `players.priority_player_id = null` |

### `kiosk-handler/index.ts`
| Action | DB Operation |
|---|---|
| `init` | Reads `players`; inserts `kiosk_sessions` |
| `search` | Proxies to `youtube-scraper` edge function |
| `credit` | Updates `kiosk_sessions.credits` |
| `request` | Reads `kiosk_sessions.credits`; deducts if not freeplay; calls `youtube-scraper`; calls `queue_add` RPC; inserts to `system_logs` |

### `playlist-manager/index.ts`
| Action | DB Operation |
|---|---|
| `create` | Inserts `playlists` |
| `update` | Updates `playlists` |
| `delete` | Deletes `playlists` (cascade to `playlist_items`) |
| `add_item` | Inserts `playlist_items` |
| `remove_item` | Deletes from `playlist_items` |
| `reorder` | Updates `playlist_items.position` |
| `scrape` | Calls `youtube-scraper`; upserts `media_items`; bulk-inserts `playlist_items` |
| `set_active` | Updates `players.active_playlist_id`; resets `now_playing_index` |
| `clear_queue` | Deletes unplayed queue items |
| `import_queue` | Bulk-inserts `playlist_items` into `queue` |
| (helper) `syncQueueIfActive` | Reads playlist order; calls `queue_reorder_wrapper` RPC if playlist is active |

### `youtube-scraper/index.ts`
| Operation | External/DB |
|---|---|
| Search | YouTube Data API v3 `search.list` endpoint |
| Playlist scrape | YouTube Data API v3 `playlistItems.list` + `videos.list` endpoints |
| Output | Returns JSON array of video metadata (no direct DB writes) |

---

## Database Schema → RPC Map

Key RPCs referenced by application code:

| RPC | Called By | Purpose |
|---|---|---|
| `queue_add` | queue-manager, kiosk-handler | Add item to queue with position management |
| `queue_remove` | queue-manager | Remove item, compact positions |
| `queue_next` | player-control | Mark current as played, advance to next |
| `queue_reorder_wrapper` | queue-manager, supabase-client (direct) | Reorder queue items atomically |
| `player_heartbeat` | player-control | Update `players.last_heartbeat` and `status` |
| `initialize_player_playlist` | supabase-client (player) | Load active playlist into queue if empty |
| `load_playlist` | supabase-client (not currently used in UI) | Load specific playlist into queue |
| `get_default_playlist` | supabase-client (not currently used in UI) | Get active playlist for player |
| `get_my_player_id` | supabase-client (auth helpers) | Returns player_id for current auth user |

---

## Duplicated Logic — Flags for Phase 2.3

### 1. `subscribeToPlayerStatus` — Identical in both locations
- `web/shared/supabase-client.ts` (authoritative)
- `web/admin/src/lib/supabaseClient.ts` (dead duplicate — delete in Phase 1)

### 2. `subscribeToQueue` — Near-identical, one difference
- `web/shared/supabase-client.ts`: 800ms debounce before refetch
- `web/admin/src/lib/supabaseClient.ts`: immediate refetch (no debounce)
- **Resolution**: shared version (with debounce) is what admin `App.tsx` actually uses. Dead file has different behaviour — irrelevant since it's dead.

### 3. All interface types (`Player`, `Playlist`, `QueueItem`, etc.)
- `web/shared/supabase-client.ts` (authoritative)
- `web/admin/src/lib/supabaseClient.ts` (dead duplicate)

### 4. `PLAYER_ID` constant `'00000000-0000-0000-0000-000000000001'`
- `web/admin/src/App.tsx` line 53
- `web/player/src/App.tsx` line 17
- `web/kiosk/src/App.tsx` line 25
- **Resolution**: Phase 2.1 — replace with `import.meta.env.VITE_PLAYER_ID` via `web/shared/config.ts`

### 5. `PREDEFINED_PLAYLISTS` array
- `web/admin/src/App.tsx` lines 75-83 (used in ScriptsPanel)
- `import-all-playlists.sh` (hardcoded in bash)
- **Resolution**: Phase 2.2 — move to `web/shared/config.ts` or make admin-configurable

### 6. Direct `.env` parsing in component code
- `web/kiosk/src/App.tsx`: `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` used directly in `performSearch()`
- These are also read from `web/shared/supabase-client.ts`
- **Resolution**: Phase 2.2 — consolidate into `web/shared/config.ts`

### 7. `supabase` client instance accessed directly for settings writes
- Admin `App.tsx` accesses `supabase.from('player_settings').update()` directly rather than via a helper
- **Resolution**: Phase 3 — standardise via edge function or add helper to shared client

---

## Realtime Channel Naming

| Subscription | Channel Name Pattern |
|---|---|
| `subscribeToTable(table, filter)` | `${table}:${column}=eq.${value}` |
| `subscribeToTable(table, null)` | `${table}:*` |
| Admin LogsPanel | `system_logs:realtime` (hardcoded, does not use `subscribeToTable`) |

**Note:** The LogsPanel creates its own Realtime channel directly rather than using `subscribeToTable` or `subscribeToSystemLogs`. This is the only place where the pattern is bypassed.
