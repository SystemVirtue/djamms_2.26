# Deployment Guide

Production deployment for the Music Video Media Management Platform. Platform-agnostic — works on any static hosting provider (Vercel, Netlify, Cloudflare Pages, etc.).

---

## Overview

The system has two parts to deploy:
1. **Supabase** — database, edge functions, realtime (hosted on Supabase Cloud)
2. **Frontend apps** — three Vite/React SPAs (hosted anywhere)

---

## Step 1: Supabase Cloud Setup

### 1.1 Create Project

1. Go to [database.new](https://database.new)
2. Create a new project, choose a region close to your users
3. Note your:
   - **Project URL**: `https://<ref>.supabase.co`
   - **Anon key**: Settings → API → Project API keys → `anon public`
   - **Service role key**: Settings → API → `service_role` (keep secret)
   - **Project ref**: the identifier in your project URL

### 1.2 Run Migrations

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>

# Push all migrations
supabase db push
```

Alternatively, copy the contents of `supabase/migrations/0001_initial_schema.sql` and subsequent migration files into the Supabase SQL Editor and run them in order.

### 1.3 Deploy Edge Functions

```bash
# Deploy all functions at once
npm run supabase:deploy

# Or individually
supabase functions deploy queue-manager
supabase functions deploy player-control
supabase functions deploy kiosk-handler
supabase functions deploy playlist-manager
supabase functions deploy youtube-scraper
```

### 1.4 Set Secrets

```bash
# YouTube API key (required for search and playlist import)
supabase secrets set YOUTUBE_API_KEY=AIza...your-key-here

# Verify
supabase secrets list
```

### 1.5 Enable Realtime

In the Supabase dashboard → Database → Replication → enable replication for:
- `queue`
- `player_status`
- `player_settings`
- `kiosk_sessions`
- `system_logs`

### 1.6 Configure Auth

In Authentication → URL Configuration:
- **Site URL**: your Admin app's production URL
- **Redirect URLs**: add `https://your-admin-domain.com/**`

Create your admin user:
- Authentication → Users → Invite user (or use the sign-up form once admin is deployed)

---

## Step 2: Frontend Deployment

The three apps are independent Vite SPAs. Deploy each to any static host.

### Environment Variables

Each app needs these env vars set in your hosting platform:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `VITE_PLAYER_ID` | `00000000-0000-0000-0000-000000000001` (default player) |

### Build Commands

| App | Build command | Output directory |
|---|---|---|
| Admin | `cd web/admin && npm run build` | `web/admin/dist` |
| Player | `cd web/player && npm run build` | `web/player/dist` |
| Kiosk | `cd web/kiosk && npm run build` | `web/kiosk/dist` |

### Deploy to Vercel (example)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy admin
cd web/admin
vercel --prod

# Deploy player
cd web/player
vercel --prod

# Deploy kiosk
cd web/kiosk
vercel --prod
```

Set environment variables in the Vercel dashboard for each project.

### Deploy to Netlify (example)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy admin
cd web/admin && npm run build
netlify deploy --prod --dir=dist
```

Set environment variables in Netlify → Site settings → Environment variables.

### Deploy to Cloudflare Pages (example)

In the Cloudflare Pages dashboard:
- Connect your GitHub repo
- Set build command: `cd web/admin && npm run build`
- Set output directory: `web/admin/dist`
- Add environment variables

---

## Step 3: First Run

1. Open your deployed Admin URL
2. Sign in with the account created in Step 1.6
3. Go to **Playlists → Import Playlist** and import your first YouTube playlist
4. Open the Player URL in a dedicated browser/device
5. In Admin → click **▶ Load Queue** on your imported playlist
6. Playback should begin automatically

---

## Infrastructure Notes

### Player must remain open

The Player window is the active playback engine. It must stay open (typically on a dedicated TV/display device) for the queue to progress. If it closes, music stops until it's re-opened.

### Multiple locations

To run multiple independent jukebox instances, each needs its own `VITE_PLAYER_ID` pointing to a different player record in the database. The database schema already supports multiple players.

### Supabase free tier limits

The system is designed to stay within Supabase's free tier:
- Realtime messages: queue updates are infrequent, well under limits
- Edge function invocations: heartbeat is 3s intervals × 1 player ≈ 28k/day (free limit: 500k/month)
- Database size: media_item metadata is ~1KB/video; 10k videos ≈ 10MB

---

## Monitoring

- **System Logs**: Admin → Logs panel shows all edge function events in real-time
- **Player Status**: Admin → Queue → Now Playing shows live playback state
- **Supabase Dashboard**: Logs → Edge Function logs for detailed debugging
