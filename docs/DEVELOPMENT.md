# Development Guide

Local development setup and daily workflow for the Music Video Media Management Platform.

---

## Prerequisites

- **Node.js 18+** and npm
- **Docker** (required for local Supabase)
- **Supabase CLI** — `npm install -g supabase`
- **Git**

---

## First-Time Setup

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd obie-v5
npm install

# 2. Run the interactive setup script
./scripts/setup.sh

# This will:
#   - Check prerequisites
#   - Create .env files for each app with local Supabase defaults
#   - Optionally start local Supabase (requires Docker)
```

### Manual Environment Setup

If you prefer to configure manually, create `.env` in each app directory:

**`web/admin/.env`**
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<your-local-anon-key>
VITE_PLAYER_ID=00000000-0000-0000-0000-000000000001
```

**`web/player/.env`**
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<your-local-anon-key>
VITE_PLAYER_ID=00000000-0000-0000-0000-000000000001
```

**`web/kiosk/.env`**
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<your-local-anon-key>
VITE_PLAYER_ID=00000000-0000-0000-0000-000000000001
```

> The local Supabase anon key is always the same for local dev:
> `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Daily Workflow

```bash
# Terminal 1 — Start local Supabase
npm run supabase:start

# Terminal 2 — Start all frontend apps (hot-reload)
npm run dev

# Apps run at:
#   Admin:  http://localhost:5173
#   Player: http://localhost:5174
#   Kiosk:  http://localhost:5175

# Terminal 3 (optional) — Watch Edge Function logs
supabase functions logs --local
```

---

## NPM Scripts Reference

| Command | What it does |
|---|---|
| `npm run dev` | Start all three apps concurrently |
| `npm run dev:admin` | Start admin only |
| `npm run dev:player` | Start player only |
| `npm run dev:kiosk` | Start kiosk only |
| `npm run build` | Production build for all apps |
| `npm run supabase:start` | Start local Supabase (Docker) |
| `npm run supabase:stop` | Stop local Supabase |
| `npm run supabase:reset` | Reset local DB to clean migration state |
| `npm run supabase:deploy` | Deploy all Edge Functions to cloud |

---

## Playlist Import Scripts

After starting Supabase locally:

```bash
# Import all predefined playlists (with 3s delay between each)
./scripts/import.sh all

# Import a specific YouTube playlist
./scripts/import.sh single PLN9QqCogPsXJCgeL_iEgYnW6Rl_8nIUUH "My Playlist"

# Re-scrape playlists that previously failed
./scripts/import.sh retry
```

See `scripts/README.md` for full documentation.

---

## YouTube API Key Setup

The YouTube scraper uses the YouTube Data API v3. For production, set your API key as a Supabase secret so it is never hardcoded in source:

```bash
# Set via Supabase CLI (recommended)
supabase secrets set YOUTUBE_API_KEY=AIza...your-key-here

# Or for local dev, add to supabase/.env.local:
echo "YOUTUBE_API_KEY=AIza...your-key-here" >> supabase/.env.local
supabase stop && supabase start
```

**Get a key:** [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
1. Create a project
2. Enable "YouTube Data API v3"
3. Create an API Key
4. Restrict to "YouTube Data API v3" (recommended)

The function falls back to a built-in rotation of keys if `YOUTUBE_API_KEY` is not set, but these are shared quota and will exhaust quickly under heavy use.

---

## Database

### Schema

All tables, RPCs, RLS policies, and seed data live in:
- `supabase/migrations/0001_initial_schema.sql` — foundational schema
- `supabase/migrations/0017_*.sql` through `20251110_*.sql` — incremental migrations

### Reset local DB

```bash
npm run supabase:reset
# This re-runs all migrations from scratch
```

### Key RPCs

| RPC | Purpose |
|---|---|
| `queue_add` | Add item to queue with position management |
| `queue_remove` | Remove item and compact positions |
| `queue_next` | Advance to next item (marks current as played) |
| `queue_reorder_wrapper` | Atomically reorder queue items |
| `player_heartbeat` | Update player online status |
| `initialize_player_playlist` | Load active playlist into queue on startup |

### Supabase Studio (local)

Access the local database UI at: **http://localhost:54323**

---

## Architecture Overview

See `docs/ARCHITECTURE.md` for the full design breakdown. Brief summary:

```
User Action → Frontend → Edge Function → SQL RPC → Database → Realtime → All Clients
```

All state lives in Supabase. The three frontend apps are thin clients that render DB state and send commands. No business logic runs in the browser.

---

## Troubleshooting

### Player shows "Nothing playing" on load
- Ensure at least one playlist has been imported
- Check Admin → Playlists → confirm a playlist is marked Active
- Check Admin → Functions & Scripts → run "Import All Playlists" if empty

### Kiosk search returns no results
- YouTube API quota may be exceeded; wait for daily reset (midnight Pacific)
- Check the Supabase Edge Function logs: `supabase functions logs --local`
- Set a dedicated `YOUTUBE_API_KEY` secret

### Queue reorder fails with 23505 (duplicate key)
- This is a known race condition; the client retries automatically up to 5 times
- If it persists, reset the queue via Admin → Playlists → Load Queue

### Supabase Realtime not working
- Confirm Docker is running
- Confirm `supabase start` completed without errors
- Check Studio at http://localhost:54323 → Table Editor to verify tables exist

### "Player is offline" error in Admin
- Open http://localhost:5174 in a browser tab; the Player must be running to respond
- The player sends a heartbeat every 3 seconds when active

---

## Player Auto-Play & Priority System

When multiple browser tabs open the Player URL:
- The first to register becomes the **priority player** — it sends status updates and controls queue progression
- Additional tabs become **slave players** — they mirror the priority player's video but do not interact with the queue
- Priority status is stored in `localStorage` and restored on reload
- Admin can reset priority via Settings → Kiosk → Reset Priority Player

**Important:** The Player window must remain open for the jukebox to function. Closing it stops queue progression.

---

## Karaoke Mode

Enable in Admin → Settings → Playback → Karaoke Mode.

When enabled, the Player fetches synced lyrics from [lrclib.net](https://lrclib.net) and overlays them on the video. This is best-effort — not all songs have available lyrics.
