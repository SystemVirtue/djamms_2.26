# Music Video Media Management Platform — Claude Code Project Memory

> This file is loaded automatically at the start of every Claude Code session.
> Keep it accurate. When you discover something non-obvious during a session,
> add it here before closing.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Supabase (Postgres + Realtime + Edge Functions + Auth) |
| Edge Functions | Deno (TypeScript) |
| External API | YouTube Data API v3 (key rotation via Supabase secrets) |
| Dev orchestration | npm workspaces + concurrently |

---

## Architecture

**Guiding principle: server-first.** All state and business logic lives in Supabase. The three frontend apps are thin React clients — they render DB state and send commands. No queue logic, no credit calculations, no playlist ordering runs in the browser.

```
User Action
    │
    ▼
Frontend (React / Vite)
    │  calls edge function or subscribes to Realtime
    ▼
Edge Function (Deno) ── uses service role key ──► Postgres RPC
    │
    ▼
DB state change ──► Supabase Realtime ──► All connected clients update
```

**Three apps, one shared layer:**

```
web/
  admin/    ← authenticated owner console (port 5173)
  player/   ← fullscreen YouTube player window (port 5174)
  kiosk/    ← public touch-screen song request UI (port 5175)
  shared/   ← supabase-client.ts, config.ts, types.ts
```

**Every env var flows through `web/shared/config.ts`.** No component reads `import.meta.env` directly.

**Every edge function response uses the standard ApiResponse envelope:**
```typescript
{ success: true,  data: T }
{ success: false, error: string, code?: string }
```
Client helpers in `supabase-client.ts` unwrap the envelope transparently.

---

## Apps & Ports

| App | Port | Auth | Description |
|---|---|---|---|
| Admin | :5173 | Supabase Auth (email/password or OTP) | Owner console — queue, playlists, settings, logs |
| Player | :5174 | None (reads VITE_PLAYER_ID) | Fullscreen YouTube IFrame player |
| Kiosk | :5175 | None (anonymous) | Public search + coin-op song requests |

Local Supabase: API on `:54321`, DB on `:54322`, Studio on `:54323`

---

## Dev Commands

```bash
# First-time setup (installs deps, creates .env files, starts Supabase)
./scripts/setup.sh

# Run all three apps simultaneously
npm run dev

# Run individual apps
npm run dev:admin     # :5173
npm run dev:player    # :5174
npm run dev:kiosk     # :5175

# Supabase local
npm run supabase:start
npm run supabase:stop
npm run supabase:reset   # re-runs all migrations + seed data

# Deploy edge functions to production
npm run supabase:deploy

# Import YouTube playlists
./scripts/import.sh all                        # all predefined playlists
./scripts/import.sh single <PLAYLIST_ID> [name]
./scripts/import.sh retry                      # retry failed imports
./scripts/import.sh url <URL>                  # import by URL
```

---

## Key Files

| File | Why it matters |
|---|---|
| `web/shared/config.ts` | **Single source for all env vars and timing constants.** Read this before touching any env-dependent code. |
| `web/shared/supabase-client.ts` | All DB subscriptions, API call helpers, type definitions. The central nervous system. |
| `web/shared/types.ts` | Shared TypeScript interfaces: `BrandingConfig`, `SearchResult`, `SearchInterfaceProps` |
| `supabase/migrations/0001_initial_schema.sql` | Full schema definition: tables, indexes, RLS, seed data |
| `supabase/migrations/0025_multi_user_player_ownership.sql` | Multi-tenancy: `owner_id` on players, per-owner RLS, signup trigger |
| `supabase/migrations/0027_restore_missing_rpcs.sql` | **Critical:** `kiosk_request_enqueue`, `get_default_playlist`, `initialize_player_playlist` |
| `supabase/functions/_shared/response.ts` | Standard ApiResponse helpers: `ok()`, `clientError()`, `serverError()`, `preflight()` |
| `supabase/functions/queue-manager/index.ts` | Queue add/remove/reorder/next/skip/clear |
| `supabase/functions/kiosk-handler/index.ts` | Session init, search proxy, credit update, song request |
| `docs/ARCHITECTURE.md` | Full system design with data flow diagrams |

---

## Environment Variables

Each app has a `.env.example`. Copy to `.env` and fill in:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_PLAYER_ID=00000000-0000-0000-0000-000000000001  # optional, falls back to default
```

YouTube API keys are **Supabase secrets**, never in source:
```bash
supabase secrets set YOUTUBE_API_KEY=AIza...
supabase secrets set YOUTUBE_API_KEY_2=AIza...   # optional rotation keys
```

---

## Refactor Status

| Phase | Status | Description |
|---|---|---|
| **Phase 0** | ✅ Complete | Full codebase audit — `docs/audit/` |
| **Phase 1** | ✅ Complete | Root cleanup: dead code removed, docs consolidated, README rewritten |
| **Phase 2** | ✅ Complete | Multi-tenancy: `VITE_PLAYER_ID`, `web/shared/config.ts`, `BrandingConfig` type |
| **Phase 3** | ✅ Complete | Edge functions: standard ApiResponse envelope, API keys moved to secrets |
| **Phase 4** | ✅ Complete | Schema: broken reorder stub fixed, missing RPCs restored, search_path hardened |
| **Phase 5** | ✅ Complete | DX: CLAUDE.md, `.env.example` files, scripts/README.md |

---

## Known Issues & Fragile Areas

### queue_reorder is complex
The reorder function has 5+ migration layers to resolve Postgres function overload ambiguity. The current canonical call path is:

```
client → callQueueManager({ action: 'reorder' })
       → queue-manager edge function
       → queue_reorder_wrapper(player_id, queue_ids, type)   [0019 + 20251109153923]
       → queue_reorder(player_id, queue_ids, type)           [0018 / 0022 implementation]
```

For >50 items the client bypasses the edge function and calls `queue_reorder_wrapper` RPC directly (see `callQueueManager` in `supabase-client.ts`). **Do not add new `queue_reorder` overloads.**

### Priority player mechanism
Only one Player window at a time controls queue advancement. On startup, the Player calls `register_session` to claim priority or register as a slave. The `priority_player_id` column on the `players` table tracks this. The Admin can reset it via "Reset Priority" in settings.

The Player app stores `obie_priority_player_id` in `localStorage` to restore priority after a page refresh.

### YouTube IFrame autoplay
YouTube blocks `autoplay` in browsers. The Player uses a deferred `playVideo()` call after a 500ms delay (`YOUTUBE_PLAY_DELAY_MS` in `config.ts`) as a workaround. This is intentionally fragile — it's a YouTube API limitation, not a bug.

### Kiosk search goes direct to youtube-scraper
The kiosk `performSearch()` calls `youtube-scraper` directly (not via `kiosk-handler`) to avoid double-proxying. This is intentional.

### playlists_with_counts view
The `getPlaylists()` helper queries this view (created in migration `0019`) which includes `item_count`. If the view is missing on a fresh local setup, it falls back to the raw `playlists` table. The view is not in the Realtime publication — subscribe to `playlists` for live updates.

### Branding from settings
The Player idle screen, logo, and Admin sidebar name come from `player_settings.branding` (a JSONB column). The default branding set at player creation is `{ name: "<username>'s Jukebox", logo: "", theme: "dark" }` — set by `create_player_for_user()` in migration `0025`.

---

## Do Not Touch

| What | Why |
|---|---|
| `queue_reorder` function overloads | Resolved through careful migration layering. Adding new overloads will break PostgREST resolution. Use `queue_reorder_wrapper` instead. |
| `migrations_backup/` directory | Historical record of migrations that were superseded. Do not delete — they explain why certain choices were made. Do not add new files here. |
| `kiosk_sessions` INSERT RLS | Intentionally missing. Session creation goes through the service-role edge function only. Adding an anon INSERT policy would be a security regression. |
| `media_items` has no `player_id` | Intentional deduplication — the same YouTube video is one row, shared across all players. `source_id` is the unique key. |
| `YOUTUBE_PLAY_DELAY_MS = 500` in `config.ts` | Tuned by trial and error against YouTube's IFrame API timing. Reducing it causes autoplay failures on slow connections. |
| `QUEUE_REFETCH_DEBOUNCE_MS = 800` | Increased from 300ms after observing position update races in the DB. Reducing it causes flickering queue order on slow connections. |

---

## Adding a New Player Instance

1. Sign up a new user via Supabase Auth — the `on_auth_user_created` trigger automatically creates their player, status, and settings rows.
2. Get their `player_id`: `SELECT id FROM players WHERE owner_id = '<user-uuid>';`
3. Set `VITE_PLAYER_ID` in each app's `.env` to that UUID.
4. Set branding via the Admin console → Settings → Branding.
5. Import playlists: `./scripts/import.sh all`

---

## Documentation Map

```
docs/
  ARCHITECTURE.md   ← System design, data flows, key decisions
  DEVELOPMENT.md    ← Local dev setup, YouTube API setup
  DEPLOYMENT.md     ← Production deployment (platform-agnostic)
  CHANGELOG.md      ← Version history
  audit/
    CODEBASE_AUDIT.md       ← File-by-file categorization (Phase 0)
    BEHAVIOUR_INVENTORY.md  ← 21 user-facing behaviours (regression checklist)
    DEPENDENCY_MAP.md       ← Import graph, RPC call map
    HARDCODED_VALUES.md     ← Inventory of values that were hardcoded
scripts/
  README.md   ← All scripts documented
```
