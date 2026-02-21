# DJAMMS 🎵
### DJ Automated Media Management System — v2.26

A real-time, server-first jukebox/media management platform built on **Supabase**.
All business logic runs on the server. The three browser-based frontends are thin,
stateless clients that render live database state and dispatch commands.

```
User Action → Frontend → Edge Function → SQL RPC → PostgreSQL → Realtime → All Clients
```

---

## Apps at a Glance

| App | Dev Port | Purpose |
|-----|----------|---------|
| **Admin** | :5173 | Queue management, playlists, settings, system logs |
| **Player** | :5174 | YouTube IFrame playback engine (must remain open) |
| **Kiosk** | :5175 | Public touchscreen song-request terminal |

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| **Node.js** | 18 LTS | https://nodejs.org |
| **npm** | 9+ | bundled with Node |
| **Supabase CLI** | 1.145+ | `npm i -g supabase` |
| **Docker Desktop** | latest | https://docker.com _(local dev only)_ |
| **Git** | 2.x | https://git-scm.com |

For cloud-only deployments (no local Supabase), Docker is not required.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/SystemVirtue/djamms_2.26.git
cd djamms_2.26

# 2. Install all workspace dependencies
npm install

# 3. Configure environment (see section below)
cp web/admin/.env.example  web/admin/.env
cp web/player/.env.example web/player/.env
cp web/kiosk/.env.example  web/kiosk/.env
# → Edit each .env with your Supabase URL, anon key, and player UUID.

# 4. Apply database migrations
supabase db push --project-ref YOUR_PROJECT_REF
# or locally:  supabase start && supabase db reset

# 5. Deploy Edge Functions
supabase functions deploy --project-ref YOUR_PROJECT_REF

# 6. Set Supabase secrets (YouTube API key etc.)
supabase secrets set YOUTUBE_API_KEY=AIzaSy... --project-ref YOUR_PROJECT_REF

# 7. Start all three frontends
npm run dev
```

Open your browser:
- Admin  → http://localhost:5173
- Player → http://localhost:5174 *(keep this tab open!)*
- Kiosk  → http://localhost:5175

---

## Environment Variables

### Frontend apps — `web/admin/.env`, `web/player/.env`, `web/kiosk/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL.<br>Cloud: `https://<ref>.supabase.co`<br>Local: `http://localhost:54321` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public/anonymous Supabase key (safe to expose in browser). Found in Supabase Dashboard → Settings → API. |
| `VITE_PLAYER_ID` | ✅ | UUID of the `players` row this instance manages. Default single-instance UUID: `00000000-0000-0000-0000-000000000001` |

> **All three apps must share the same `VITE_PLAYER_ID`** for a single jukebox deployment.
> For multi-jukebox setups, each physical jukebox gets its own UUID.

### Supabase Edge Function secrets (set via CLI, not .env)

```bash
supabase secrets set KEY=value --project-ref YOUR_PROJECT_REF
```

| Secret | Required | Description |
|--------|----------|-------------|
| `YOUTUBE_API_KEY` | ✅ | YouTube Data API v3 key. Obtain at [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials. Enable **YouTube Data API v3**. |
| `YOUTUBE_API_KEY_2` … `YOUTUBE_API_KEY_9` | Optional | Additional keys for automatic rotation when daily quota (10,000 units) is exhausted. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Service-role key for admin-level Edge Function operations. **Never expose in browser.** |

---

## Obtaining API Keys

### Supabase (URL + Anon Key)
1. Create a free project at https://app.supabase.com
2. **Settings → API** — copy **Project URL** and **anon public** key.
3. Paste into each `web/*/​.env`.

### YouTube Data API v3
1. Go to https://console.cloud.google.com
2. Create or select a project.
3. **APIs & Services → Enable APIs → YouTube Data API v3** → Enable.
4. **APIs & Services → Credentials → Create Credentials → API Key**.
5. (Recommended) Restrict the key to YouTube Data API v3 only.
6. Set via CLI: `supabase secrets set YOUTUBE_API_KEY=AIzaSy...`

> Free quota: **10,000 units/day** per key. Each search costs ~100 units.
> Add `YOUTUBE_API_KEY_2` etc. to rotate automatically under load.

---

## Database Setup

Migrations live in `supabase/migrations/`. They are applied in filename order.

```bash
# Cloud
supabase db push --project-ref YOUR_PROJECT_REF

# Local (Docker required)
supabase start          # starts local Supabase stack
supabase db reset       # applies all migrations fresh
```

After migrations, seed the default player row (if not auto-created):
```sql
INSERT INTO players (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Main Jukebox')
ON CONFLICT DO NOTHING;
```

---

## Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `queue-manager` | Admin / Kiosk | Add, remove, reorder queue items |
| `player-control` | Player | Heartbeat, playback state updates |
| `playlist-manager` | Admin | Playlist CRUD, bulk import |
| `kiosk-handler` | Kiosk | Credit management, song requests |
| `youtube-scraper` | Admin | Fetch video/playlist metadata from YouTube |

Deploy all:
```bash
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

Deploy a single function:
```bash
supabase functions deploy queue-manager --project-ref YOUR_PROJECT_REF
```

---

## Project Structure

```
djamms_2.26/
├── supabase/
│   ├── config.toml                 # Supabase project config
│   ├── functions/                  # Edge Functions (Deno/TypeScript)
│   │   ├── _shared/                # Shared CORS + response helpers
│   │   ├── queue-manager/
│   │   ├── player-control/
│   │   ├── playlist-manager/
│   │   ├── kiosk-handler/
│   │   └── youtube-scraper/
│   └── migrations/                 # Ordered SQL migrations
├── web/
│   ├── shared/                     # Shared TypeScript types + Supabase client
│   ├── admin/                      # Admin React app (Vite)
│   ├── player/                     # Player React app (Vite)
│   └── kiosk/                      # Kiosk React app (Vite)
├── scripts/
│   ├── setup.sh                    # First-time setup helper
│   └── import.sh                   # Playlist import utility
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   ├── CHANGELOG.md
│   └── audit/
└── package.json                    # npm workspace root
```

---

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all three apps concurrently |
| `npm run dev:admin` | Admin only (port 5173) |
| `npm run dev:player` | Player only (port 5174) |
| `npm run dev:kiosk` | Kiosk only (port 5175) |
| `npm run build` | Production build for all apps |
| `npm run supabase:start` | Start local Supabase (Docker) |
| `npm run supabase:stop` | Stop local Supabase |
| `npm run supabase:reset` | Drop and re-apply all migrations |
| `npm run supabase:deploy` | Deploy all Edge Functions |

---

## Multi-Instance / Multi-Jukebox

Each physical jukebox is a row in the `players` table with a unique UUID.
Set `VITE_PLAYER_ID` in the respective `web/*/​.env` files to that UUID.

```sql
-- Add a second jukebox
INSERT INTO players (id, name) VALUES (gen_random_uuid(), 'Bar Jukebox');
-- Copy the generated UUID into VITE_PLAYER_ID for that jukebox's three apps.
```

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data-flow diagram,
schema reference, and key design decisions (media deduplication, queue-as-journal,
priority queue, Realtime as message bus).

---

## Development

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for local workflow, Supabase Studio
access, debugging tips, and VS Code recommended extensions.

---

## Deployment (Production)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for deploying frontends to Vercel /
Netlify / Cloudflare Pages, and Edge Functions to Supabase Cloud.

---

## License

See [LICENSE](LICENSE).
