# Architecture

System design, data flows, and key architectural decisions for the Music Video Media Management Platform.

---

## Guiding Principle: Server-First

All state and business logic lives in Supabase. The three frontend apps are thin clients — they render database state and send commands. No queue logic, no credit calculations, no playlist ordering happens in the browser.

```
User Action
    │
    ▼
Frontend (React)
    │  HTTP POST
    ▼
Edge Function (Deno)
    │  SQL RPC (advisory lock)
    ▼
PostgreSQL Database
    │  pg_notify
    ▼
Supabase Realtime (WebSocket)
    │
    ▼  (broadcast to all subscribers)
  Admin  │  Player  │  Kiosk
```

---

## Apps & Their Roles

### Admin (`web/admin/` — port 5173)
- Authenticated via Supabase Auth (email + password)
- Full read/write access to queue, playlists, settings
- Drag-drop queue reordering, playlist import, system log viewer
- Real-time view of playback state (now playing, progress)

### Player (`web/player/` — port 5174)
- No authentication — runs publicly on a display device
- Renders YouTube videos via IFrame Player API
- Subscribes to `player_status` and `player_settings`
- Only the **priority player** sends status updates; slave players observe only
- Sends heartbeat every ~3s to keep the player marked "online"

### Kiosk (`web/kiosk/` — port 5175)
- No authentication — public touchscreen interface
- Session-based credit tracking (`kiosk_sessions` table)
- Search via YouTube Data API, song requests via priority queue
- Subscribes to settings changes (freeplay, coin price, branding)

---

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `players` | One row per jukebox instance. Holds `status`, `priority_player_id`, `active_playlist_id` |
| `player_status` | Live playback state: `state`, `progress`, `current_media_id`, `now_playing_index` |
| `player_settings` | Configuration: `freeplay`, `volume`, `shuffle`, `loop`, `branding` JSONB, coin settings |
| `playlists` | Playlist library. `is_active` marks the loaded playlist |
| `playlist_items` | Ordered items in each playlist (`position`, `media_item_id`) |
| `media_items` | Deduplicated video metadata. Keyed on YouTube `source_id`. Shared across playlists. |
| `queue` | Active playback queue. Has `type` (normal/priority) and `position`. Played items get `played_at` timestamp. |
| `kiosk_sessions` | One session per kiosk browser. Tracks `credits`. |
| `system_logs` | Event log with `severity` (debug/info/warn/error) and `payload` JSONB. |

### Key Design Decisions

**Media deduplication**: `media_items` uses a unique constraint on `(source_type, source_id)`. The same YouTube video can appear in multiple playlists and the queue, but its metadata is stored once.

**Queue as a journal**: Queue items are never deleted when played — they get a `played_at` timestamp. This preserves history. Unplayed items are filtered by `played_at IS NULL`.

**Priority queue**: Both normal and priority items share the `queue` table. Priority items are always ordered before normal items (`ORDER BY type DESC, position ASC`). This is enforced in queries, not by separate tables.

**Realtime as the bus**: Every state change flows through the database → Realtime → all clients. There is no direct frontend-to-frontend communication.

---

## Edge Functions

All edge functions use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS (they perform validated operations as a trusted server). They enforce their own authorization logic.

| Function | Responsibilities |
|---|---|
| `queue-manager` | `add`, `remove`, `reorder`, `next`, `skip`, `clear` queue operations. Uses RPC calls for atomicity. |
| `player-control` | `heartbeat`, `register_session`, `update`, `ended`, `skip`, `reset_priority`. Manages playback state and priority player assignment. |
| `kiosk-handler` | `init` (create session), `search` (proxy to youtube-scraper), `credit` (coin acceptor), `request` (deduct credits + enqueue). |
| `playlist-manager` | `create`, `update`, `delete`, `add_item`, `remove_item`, `reorder`, `scrape`, `set_active`, `clear_queue`, `import_queue`. |
| `youtube-scraper` | YouTube Data API v3 wrapper. Handles search queries and playlist scraping with API key rotation. |

---

## Key Data Flows

### Song Request (Kiosk)

```
1. Kiosk: callKioskHandler({ action: 'request', url, session_id })
2. kiosk-handler: verify credits (or freeplay) → deduct if needed
3. kiosk-handler: call youtube-scraper to upsert media_item
4. kiosk-handler: call queue_add RPC with type='priority'
5. queue_add: insert into queue with next available priority position
6. Realtime: broadcast queue INSERT to all subscribers
7. Admin: queue display updates
8. Player: picks up new queue item on next queue_next call
```

### End of Video → Next Song

```
1. Player: YouTube onStateChange(ENDED)
2. Player: callPlayerControl({ action: 'ended', state: 'idle', progress: 1 })
3. player-control: call queue_next RPC
4. queue_next: mark current item played_at=now(), advance now_playing_index
5. queue_next: return next item's media data
6. player-control: update player_status (current_media_id, state='loading')
7. Player: receives result.next_item → setCurrentMedia() immediately (fast path)
8. Realtime: player_status UPDATE broadcasts to admin and kiosk
```

### Admin Skip

```
1. Admin: callPlayerControl({ action: 'skip', state: 'idle' })
2. player-control: update player_status.state = 'idle'
3. Realtime: player_status UPDATE fires
4. Player: subscribeToPlayerStatus callback sees idle (was playing/paused)
5. Player: fadeOut() → callPlayerControl({ action: 'ended' }) → load next
```

---

## Priority Player System

Since multiple browser windows can open the Player URL (e.g., TV + laptop mirror), only one should control queue progression. This avoids double-advancing the queue.

- On load, each Player calls `register_session` with a generated `session_id`
- `players.priority_player_id` tracks which session is authoritative
- First to register (or the one that previously had priority) becomes priority
- Priority is stored in `localStorage` (`obie_priority_player_id`) so it survives page refresh
- Slave players render video but skip all `callPlayerControl` and `callQueueManager` calls
- Admin can reset priority via Settings → Kiosk → Reset Priority Player

---

## Row Level Security

All tables have RLS enabled. Key policies:

- **Authenticated users** (admin): full access to all tables for their player
- **Anonymous** (kiosk/player): read-only access to `queue`, `player_status`, `player_settings`, `media_items`, `playlist_items`
- **kiosk_sessions**: anon can read/update their own session (by session_id)
- Edge functions use service role key → bypass RLS entirely

---

## Shared Code Layer (`web/shared/`)

All three apps share:
- `supabase-client.ts` — Supabase client instance, all type definitions, Realtime subscription helpers, API call wrappers, auth helpers
- `types.ts` — `SearchResult` and `SearchInterfaceProps` interfaces
- `keyboard.ts` — `KEYBOARD_ROWS` and `SPECIAL_KEYS` constants for the on-screen keyboard

The `@shared` import alias is configured in each app's `vite.config.ts`.

---

## Hardcoded Values (Known Technical Debt)

See `docs/audit/HARDCODED_VALUES.md` for full inventory. Key items being addressed in the refactor:

| Value | Current State | Target |
|---|---|---|
| `PLAYER_ID` UUID | Hardcoded in all 3 App.tsx files | `VITE_PLAYER_ID` env var via `web/shared/config.ts` |
| YouTube API keys | 9 keys hardcoded in youtube-scraper | Supabase secrets |
| Branding strings | "Obie Jukebox" in player idle screen | Read from `player_settings.branding.name` |
| Logo asset path | Hardcoded `/Obie_neon_no_BG.png` | Read from `player_settings.branding.logo` |

---

## Karaoke Mode

Optional overlay feature:
1. Admin enables `player_settings.karaoke_mode = true`
2. Realtime propagates to Player
3. Player fetches synced lyrics from `lrclib.net` API (free, no key required)
4. `requestAnimationFrame` loop syncs line display to `YouTubePlayer.getCurrentTime()`
5. Disabled: RAF loop cancelled, overlay hidden

Lyrics are best-effort — not all songs have available data. Failure is silent.

---

## Coin Acceptor Hardware

The kiosk supports physical coin acceptors via the Web Serial API (Chrome/Edge only):

1. Admin enables `kiosk_coin_acceptor_enabled = true` in settings
2. Kiosk calls `navigator.serial.requestPort()` to select USB-serial device
3. Device sends data on coin insertion; kiosk calls `kiosk-handler` credit action
4. A connection health check runs on a `setInterval`

This is optional — software credits via the Admin credits panel work without hardware.
