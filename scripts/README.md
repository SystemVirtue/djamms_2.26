# Scripts

Helper scripts for development and playlist management.

---

## `scripts/setup.sh`

Interactive first-time setup for local development.

**What it does:**
- Checks prerequisites (Node.js, npm, Docker)
- Runs `npm install`
- Creates `.env` files for each app with local Supabase defaults
- Optionally starts local Supabase

**Usage:**
```bash
./scripts/setup.sh
```

**Required env vars:** None — generates them for you.

---

## `scripts/import.sh`

Playlist import tool. Replaces the former `import-all-playlists.sh`, `import-single-playlist.sh`, `retry-failed-playlists.sh`, and `populate-playlist.sh`.

**Subcommands:**

### `all` — Import all predefined playlists

```bash
./scripts/import.sh all
```

Imports every playlist defined in the `PREDEFINED_PLAYLISTS` array at the top of the script. Adds a configurable delay between each to avoid YouTube API rate limits.

### `single` — Import one playlist

```bash
./scripts/import.sh single <YOUTUBE_PLAYLIST_ID> ["Playlist Name"]
```

**Example:**
```bash
./scripts/import.sh single PLN9QqCogPsXJCgeL_iEgYnW6Rl_8nIUUH "Obie Playlist"
```

If no name is given, defaults to `Imported <first 12 chars of ID>`.

### `retry` — Re-scrape playlists already in the database

```bash
./scripts/import.sh retry
```

Useful when a previous import partially failed (e.g., YouTube API quota exceeded mid-run). Looks up each predefined playlist by name in the DB and re-runs the scrape step only — does not create duplicate playlist records.

### `url` — Import by YouTube URL

```bash
./scripts/import.sh url <YOUTUBE_URL> ["Playlist Name"]
```

**Example:**
```bash
./scripts/import.sh url "https://www.youtube.com/playlist?list=PLxxx" "My Playlist"
```

Imports a single playlist or video by full URL. Useful for one-off imports outside the predefined list.

**Required env vars:**

| Variable | Default | Description |
|---|---|---|
| `SUPABASE_URL` | `http://localhost:54321` | Supabase API URL |
| `PLAYER_ID` | `00000000-0000-0000-0000-000000000001` | Target player UUID |
| `SERVICE_ROLE_KEY` | Auto-fetched from `supabase status` | Supabase service role key |
| `REQUEST_DELAY` | `3` | Seconds between YouTube API calls |

**Notes:**
- Requires Supabase to be running locally (`npm run supabase:start`) or set `SUPABASE_URL` to point to your cloud instance
- YouTube API quota resets daily at midnight Pacific Time
- For production imports, set `SUPABASE_URL` and `SERVICE_ROLE_KEY` explicitly:
  ```bash
  SUPABASE_URL=https://xxx.supabase.co \
  SERVICE_ROLE_KEY=eyJ... \
  ./scripts/import.sh all
  ```

---

## YouTube API Keys

The import scripts call the `youtube-scraper` edge function, which reads API keys from **Supabase secrets** — not from local `.env` files.

Set your keys before running any import:

```bash
supabase secrets set YOUTUBE_API_KEY=AIza...

# Optional rotation keys (used if primary quota is exceeded)
supabase secrets set YOUTUBE_API_KEY_2=AIza...
supabase secrets set YOUTUBE_API_KEY_3=AIza...
```

YouTube API quota resets daily at midnight Pacific Time. If you hit quota limits mid-import, wait until reset and use `./scripts/import.sh retry`.
