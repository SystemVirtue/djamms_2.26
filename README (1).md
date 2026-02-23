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
| **Player** | :5174 | YouTube IFrame playback engine — **must remain open** |
| **Kiosk** | :5175 | Public touchscreen song-request terminal |

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| **Node.js** | 18 LTS | https://nodejs.org |
| **npm** | 9+ | bundled with Node |
| **Supabase CLI** | 1.145+ | `npm install -g supabase` |
| **Docker Desktop** | latest | https://docker.com *(local dev only)* |
| **Git** | 2.x | https://git-scm.com |

For cloud-only deployments (no local Supabase), Docker is not required.

---

## Quick Start (Cloud Deployment)

```bash
# 1. Clone
git clone https://github.com/SystemVirtue/djamms_2.26.git
cd djamms_2.26

# 2. Install all workspace dependencies
npm install

# 3. Log in to Supabase CLI and link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF
#   YOUR_PROJECT_REF is the identifier in your project URL:
#   https://YOUR_PROJECT_REF.supabase.co

# 4. Apply database migrations
supabase db push
#   If you get a "remote migration not found" error, run the repair command:
#   supabase migration repair --status applied 0001 0017 0018 0019 0020 0021 0022 0023 0025 0026 0027 0028 --project-ref YOUR_PROJECT_REF
#   Then re-run: supabase db push

# 5. Deploy Edge Functions
supabase functions deploy --project-ref YOUR_PROJECT_REF

# 6. Set Supabase secrets
supabase secrets set YOUTUBE_API_KEY=AIzaSy... --project-ref YOUR_PROJECT_REF
# (See "Obtaining API Keys" below for how to get a YouTube API key)

# 7. Create your admin login (Supabase Dashboard)
#   Authentication → Users → Add User
#   Enter email + password. These are the credentials for the Admin app.

# 8. Seed the default player row (run once in Supabase SQL Editor)
#   Database → SQL Editor → New Query:
#   INSERT INTO players (id, name)
#   VALUES ('00000000-0000-0000-0000-000000000001', 'Main Jukebox')
#   ON CONFLICT DO NOTHING;

# 9. Configure environment variables (see section below)
cp web/admin/.env.example  web/admin/.env
cp web/player/.env.example web/player/.env
cp web/kiosk/.env.example  web/kiosk/.env
# → Edit each .env with your Supabase URL, anon key, and player UUID

# 10. Start all three frontends
npm run dev
```

Open your browser:
- Admin  → http://localhost:5173 *(log in with the user created in step 7)*
- Player → http://localhost:5174 *(keep this tab open — this is the playback engine)*
- Kiosk  → http://localhost:5175

---

## Environment Variables

### Frontend apps — `web/admin/.env`, `web/player/.env`, `web/kiosk/.env`

All three apps require the **same three variables**. Copy the `.env.example` in each app
directory and fill in your values.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL.<br>Cloud: `https://<ref>.supabase.co`<br>Local: `http://localhost:54321` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public/anonymous Supabase key (safe to expose in browser).<br>Found in: Supabase Dashboard → Settings → API → *anon public*. |
| `VITE_PLAYER_ID` | ✅ | UUID of the `players` row this instance manages.<br>Default single-instance UUID: `00000000-0000-0000-0000-000000000001`<br>Omit only if using a custom player UUID. |

> **All three apps must share the same `VITE_PLAYER_ID`** for a single jukebox deployment.

Example `.env` for all three apps (cloud):
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_PLAYER_ID=00000000-0000-0000-0000-000000000001
```

Example `.env` for local development:
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
VITE_PLAYER_ID=00000000-0000-0000-0000-000000000001
```
> The anon key shown above is the standard local Supabase development key — it is the same for every local instance and is not secret.

### Supabase Edge Function secrets — set via CLI, not .env files

```bash
supabase secrets set KEY=value --project-ref YOUR_PROJECT_REF
```

| Secret | Required | Description |
|--------|----------|-------------|
| `YOUTUBE_API_KEY` | ✅ | YouTube Data API v3 key. Required for playlist import and video search. |
| `YOUTUBE_API_KEY_2` … `YOUTUBE_API_KEY_9` | Optional | Additional keys for automatic rotation when daily quota (10,000 units/day) is exhausted. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Service-role key for admin-level Edge Function operations. **Never expose in browser.** Found in: Supabase Dashboard → Settings → API → *service_role*. |

---

## Obtaining API Keys

### Supabase (URL + Anon Key)
1. Create a free project at https://app.supabase.com
2. **Settings → API** — copy **Project URL** and **anon public** key
3. Paste into each `web/*/​.env`

### YouTube Data API v3
1. Go to https://console.cloud.google.com
2. Create or select a project
3. **APIs & Services → Enable APIs → YouTube Data API v3** → Enable
4. **APIs & Services → Credentials → Create Credentials → API Key**
5. (Recommended) Restrict the key to YouTube Data API v3 only
6. Set via CLI: `supabase secrets set YOUTUBE_API_KEY=AIzaSy...`

> Free quota: **10,000 units/day** per key. Each playlist import costs ~1–3 units per video.
> Add `YOUTUBE_API_KEY_2` etc. to rotate automatically under load.

---

## Database Setup

Migrations live in `supabase/migrations/`. Applied in filename order via `supabase db push`.

```bash
# Cloud (recommended)
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# Local (Docker required)
supabase start          # starts local Supabase stack on port 54321
supabase db reset       # drops and re-applies all migrations fresh
```

### Migration Repair (existing deployments)

If you have previously applied some migrations manually or via the SQL editor, the CLI
may report a "remote migration not found" mismatch. Fix with:

```bash
# Mark already-applied numbered migrations as applied
supabase migration repair \
  --status applied 0001 0017 0018 0019 0020 0021 0022 0023 0025 0026 0027 0028 \
  --project-ref YOUR_PROJECT_REF

# Then push any remaining migrations
supabase db push --project-ref YOUR_PROJECT_REF
```

### Seeding the player row

After migrations, ensure the default player record exists (required for single-instance deployments):

```sql
INSERT INTO players (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Main Jukebox')
ON CONFLICT DO NOTHING;
```

Run in: Supabase Dashboard → Database → SQL Editor.

### Realtime verification

The migrations add all tables to the `supabase_realtime` publication automatically.
If the queue display is not updating in real time, verify in the Supabase Dashboard:

**Database → Replication → `supabase_realtime` publication**

Confirm these tables are listed: `queue`, `player_status`, `player_settings`, `kiosk_sessions`, `system_logs`.
If any are missing, add them:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE queue;
ALTER PUBLICATION supabase_realtime ADD TABLE player_status;
```

---

## Edge Functions

| Function | Called by | Purpose |
|----------|-----------|---------|
| `queue-manager` | Admin, Kiosk | Add, remove, reorder queue items |
| `player-control` | Player | Heartbeat, playback state, skip/next |
| `playlist-manager` | Admin | Playlist CRUD, queue loading, YouTube import |
| `kiosk-handler` | Kiosk | Credit management, song requests |
| `youtube-scraper` | Admin | Fetch video/playlist metadata from YouTube |

```bash
# Deploy all functions
supabase functions deploy --project-ref YOUR_PROJECT_REF

# Deploy a single function (e.g., after editing)
supabase functions deploy queue-manager --project-ref YOUR_PROJECT_REF
```

---

## Admin Login

The Admin app requires Supabase Auth credentials. Create a user in the Supabase Dashboard:

**Authentication → Users → Add User → Create new user**

Enter an email and password. Use these to log in at http://localhost:5173 (or your deployed admin URL).

> There is no self-signup. Admin users must be created manually in the Supabase Dashboard
> or via the Supabase CLI: `supabase auth admin create-user --email you@example.com --password yourpassword`

---

## Project Structure

```
djamms_2.26/
├── supabase/
│   ├── config.toml                 # Supabase local dev config
│   ├── functions/                  # Edge Functions (Deno/TypeScript)
│   │   ├── _shared/                # Shared CORS + response helpers
│   │   ├── queue-manager/
│   │   ├── player-control/
│   │   ├── playlist-manager/
│   │   ├── kiosk-handler/
│   │   └── youtube-scraper/
│   └── migrations/                 # Ordered SQL migrations (apply via supabase db push)
├── web/
│   ├── shared/                     # Shared TypeScript types + Supabase client + config
│   │   ├── supabase-client.ts      # All DB subscriptions and Edge Function calls
│   │   ├── config.ts               # Centralised env var access + timing constants
│   │   └── types.ts                # Shared type definitions
│   ├── admin/                      # Admin React app (Vite, port 5173)
│   ├── player/                     # Player React app (Vite, port 5174)
│   └── kiosk/                      # Kiosk React app (Vite, port 5175)
├── scripts/
│   ├── setup.sh                    # Interactive first-time setup helper
│   └── import.sh                   # Playlist bulk-import utility
├── docs/
│   ├── ARCHITECTURE.md             # Data flow, schema reference, design decisions
│   ├── DEVELOPMENT.md              # Local dev workflow and debugging tips
│   ├── DEPLOYMENT.md               # Production deployment guide
│   ├── CHANGELOG.md
│   └── audit/                      # Codebase audit documents
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
| `npm run build:admin` | Build admin only |
| `npm run supabase:start` | Start local Supabase stack (Docker required) |
| `npm run supabase:stop` | Stop local Supabase |
| `npm run supabase:reset` | Drop and re-apply all migrations |
| `npm run supabase:deploy` | Deploy all Edge Functions |

---

## How the Queue Works

The queue is the heart of the system. Understanding it helps with debugging.

- Every song in the queue is a row in the `queue` table with a `type` (`normal` or `priority`) and a `position` (integer, 0-indexed).
- Songs are **never deleted** when played — they are marked with `played_at = NOW()`. The frontend subscription filters `.is('played_at', null)` so played songs disappear from the display automatically.
- **Priority requests** (kiosk requests) always play before normal queue items, regardless of position.
- The `queue_next` SQL RPC handles song advancement atomically with a row-level lock.
- The Player app calls `queue_next` via `player-control` Edge Function when a video ends.
- All three frontends subscribe to Realtime changes on the `queue` and `player_status` tables to stay in sync.

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
