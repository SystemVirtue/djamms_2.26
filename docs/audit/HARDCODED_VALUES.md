# Hardcoded Values Inventory — obie-v5

Generated during Phase 0.4. Every value that is hardcoded but should be configurable is listed here, with the target resolution for each.

---

## Critical: Player UUID

The single most important hardcoded value. Appears in 10+ files.

| Value | `00000000-0000-0000-0000-000000000001` |
|---|---|
| **Purpose** | Identifies the default (only) player instance |
| **Found in** | `web/admin/src/App.tsx:53`, `web/player/src/App.tsx:17`, `web/kiosk/src/App.tsx:25` |
| **Also in** | `import-all-playlists.sh`, `import-single-playlist.sh`, `check-queue.js`, `check_rls.sql`, `debug_kiosk.sql` |
| **Also in** | `supabase/migrations/0001_initial_schema.sql` (seed data — this is intentional for local dev setup) |
| **Also in** | `supabase/migrations/0025_multi_user_player_ownership.sql` (migration logic — acceptable) |
| **Target resolution** | Add `VITE_PLAYER_ID` env var. Create `web/shared/config.ts` that exports `PLAYER_ID = import.meta.env.VITE_PLAYER_ID`. All three apps import from there. Shell scripts should accept `$PLAYER_ID` env var with fallback default. |

---

## Branding Strings

### `"Obie Jukebox"` — Hardcoded in component code

| Location | Context |
|---|---|
| `web/player/src/App.tsx:888` | Idle state display: `<div className="text-6xl font-bold text-white mb-4">Obie Jukebox</div>` |
| `web/admin/src/App.tsx:960` | Branding settings placeholder text: `ph: 'Obie Jukebox'` |

**Target resolution:** The player idle screen should read the jukebox name from `player_settings.branding.name` (already stored in DB). The admin placeholder is acceptable as-is (it's hint text, not displayed content). Phase 2.4.

### `"Obie Admin"` — Hardcoded in login form

| Location | Context |
|---|---|
| `web/admin/src/App.tsx:254` | Login form heading: `<h1>Obie Admin</h1>` |

**Target resolution:** Accept as-is initially; admin branding is less critical. Could be derived from `branding.name` in Phase 2.4.

### `"Obie"` — In sidebar header

| Location | Context |
|---|---|
| `web/admin/src/App.tsx` (Sidebar) | `<div>Obie</div>` short name in sidebar |

**Target resolution:** Same as above — Phase 2.4.

---

## localStorage Keys

These are prefixed with `obie_` which is a hardcoded branding assumption.

| Key | Used By | Purpose |
|---|---|---|
| `obie_accent` | `web/admin/src/App.tsx` | Admin console accent colour preference |
| `obie_fontsize` | `web/admin/src/App.tsx` | Admin console font size preference |
| `obie_priority_player_id` | `web/player/src/App.tsx` | Stores player ID for priority restoration |

**Target resolution:** These are admin-console-local preferences and the priority player mechanism. The `obie_` prefix is cosmetic but acceptable for now. If truly multi-tenant (different brands per instance), these should be namespaced by player_id. Flag for Phase 2.4.

---

## Predefined Playlist IDs

Hardcoded in two places: admin UI and shell script.

### In `web/admin/src/App.tsx`
```javascript
const PREDEFINED_PLAYLISTS = [
  { ytId: 'PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu', name: 'DJAMMMS Default Playlist' },
  { ytId: 'PLN9QqCogPsXIoSObV0F39OZ_MlRZ9tRT9', name: 'Obie Nights' },
  { ytId: 'PLN9QqCogPsXJCgeL_iEgYnW6Rl_8nIUUH', name: 'Obie Playlist' },
  { ytId: 'PLN9QqCogPsXIkPh6xm7cxSN9yTVaEoj0j', name: 'Obie Jo' },
  { ytId: 'PLN9QqCogPsXLAtgvLQ0tvpLv820R7PQsM', name: 'Karaoke' },
  { ytId: 'PLN9QqCogPsXLsv5D5ZswnOSnRIbGU80IS', name: 'Poly' },
  { ytId: 'PLN9QqCogPsXIqfwdfe4hf3qWM1mFweAXP', name: 'Obie Johno' },
];
```

### In `import-all-playlists.sh`
Same list duplicated in bash array.

**Target resolution:** This is customer-specific content (Obie's playlist library). It makes sense to keep this in a config file (`scripts/playlists.conf` or `web/shared/config.ts`) rather than in application component code. For Phase 1 (script consolidation) and Phase 2.2 (shared config). Long term: make these admin-configurable via DB.

---

## API Keys — YouTube Data API v3

Nine API keys are hardcoded in the youtube-scraper edge function. **This is a security concern.**

| Location | `supabase/functions/youtube-scraper/index.ts` lines 5-37 |
|---|---|
| Keys | 9 keys named Key 1–Key 9 |
| Fallback | First checks `Deno.env.get('YOUTUBE_API_KEY')` before using hardcoded rotation |

**Target resolution:** Move all keys to Supabase Edge Function secrets (`supabase secrets set YOUTUBE_API_KEY_1=...`). The rotation logic can remain but should read from env vars `YOUTUBE_API_KEY_1` through `YOUTUBE_API_KEY_9`. This is a Phase 3 concern (edge function cleanup) and also a security issue to fix sooner.

---

## Timing & Interval Values

| Value | Location | Purpose |
|---|---|---|
| `800ms` | `web/shared/supabase-client.ts:265` | Queue subscription debounce delay |
| `3000ms` | `web/admin/src/App.tsx:1093` | Delay between playlist imports in batch |
| `3000ms` | `web/admin/src/App.tsx:1471` | Skip failsafe timeout |
| `2000ms` | `web/player/src/App.tsx` (fade functions) | Fade in/out duration |
| `500ms` | `web/player/src/App.tsx:551,762` | `playVideo()` call delay after `loadVideoById` |
| `5000ms` | `web/player/src/App.tsx:233,553` | `recentlyLoadedRef` auto-play window |
| `setInterval` 30s check | `web/kiosk/src/App.tsx:336` | Coin acceptor connection health check |
| `REQUEST_DELAY=3` | Shell scripts | Seconds between YouTube API calls |

**Target resolution:** Most of these are intentional tuning values that emerged from real-world testing. Document them clearly. The fade duration (2s) and queue debounce (800ms) are candidates for `web/shared/config.ts`. The import delay (3s) belongs in the consolidated import script.

---

## Deployment URLs

| Value | Location |
|---|---|
| `http://localhost:5173/5174/5175` | Shell scripts, documentation |
| `https://xxxxx.supabase.co` | DEPLOYMENT.md, setup guides |
| Render.com service names | `render.yaml`, `RENDER_DEPLOYMENT.md` |

**Target resolution:** Localhost ports are correct dev defaults and should remain in docs. Production URL is a template placeholder (correct). `render.yaml` and `RENDER_DEPLOYMENT.md` are Render-specific and should be replaced with platform-agnostic deployment docs (Phase 1.3).

---

## Logo Asset Path

| Value | `web/player/public/Obie_neon_no_BG.png` |
|---|---|
| **Referenced in** | `web/player/src/App.tsx` as `src="/Obie_neon_no_BG.png"` |
| **Purpose** | Logo overlay displayed during playback |

**Target resolution:** Logo path should come from `player_settings.branding.logo`. The player app currently ignores the branding logo setting. Phase 2.4.

---

## Default Playlist UUID

| Value | `00000000-0000-0000-0000-000000000002` |
|---|---|
| **Found in** | `populate-playlist.sh:13`, `supabase/migrations/0001_initial_schema.sql:599` (seed data) |
| **Purpose** | Default "Main Playlist" seeded with the schema |

**Target resolution:** This is seed data for local development — acceptable in migration. The shell script is being consolidated in Phase 1.2.

---

## Summary Table

| Category | Count | Priority |
|---|---|---|
| Player UUID in application code | 3 files | 🔴 High — Phase 2.1 |
| Branding strings in component code | 3 locations | 🟡 Medium — Phase 2.4 |
| YouTube API keys in source code | 9 keys | 🔴 High — Phase 3 |
| Predefined playlist IDs in UI code | 1 block | 🟡 Medium — Phase 2.2 |
| localStorage keys with brand prefix | 3 keys | 🟢 Low — Phase 2.4 |
| Timing values | 8 locations | 🟢 Low — document, optionally extract |
| Deployment URLs | Various docs | 🟢 Low — Phase 1.3 |
| Logo asset path | 1 | 🟡 Medium — Phase 2.4 |
