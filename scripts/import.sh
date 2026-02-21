#!/bin/bash
# scripts/import.sh — Obie Jukebox Playlist Import Tool
#
# Consolidates: import-all-playlists.sh, import-single-playlist.sh,
#               import-to-production.sh, retry-failed-playlists.sh,
#               populate-playlist.sh
#
# Usage:
#   ./scripts/import.sh all              — Import all predefined playlists
#   ./scripts/import.sh single <YT_ID> [name]  — Import one YouTube playlist
#   ./scripts/import.sh retry            — Re-scrape predefined playlists already in DB
#
# Required env vars (or set in .env):
#   SUPABASE_URL          — Supabase API URL (default: http://localhost:54321)
#   PLAYER_ID             — Target player UUID (default: 00000000-0000-0000-0000-000000000001)
#
# Optional:
#   SERVICE_ROLE_KEY      — If not set, will be fetched from `supabase status`
#   REQUEST_DELAY         — Seconds between API calls (default: 3)

set -e

# ─── Configuration ───────────────────────────────────────────────────────────

SUPABASE_URL="${SUPABASE_URL:-http://localhost:54321}"
PLAYER_ID="${PLAYER_ID:-00000000-0000-0000-0000-000000000001}"
REQUEST_DELAY="${REQUEST_DELAY:-3}"

# Predefined playlists (edit to match your library)
declare -a PREDEFINED_PLAYLISTS=(
  "PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu|DJAMMMS Default Playlist"
  "PLN9QqCogPsXIoSObV0F39OZ_MlRZ9tRT9|Obie Nights"
  "PLN9QqCogPsXJCgeL_iEgYnW6Rl_8nIUUH|Obie Playlist"
  "PLN9QqCogPsXIkPh6xm7cxSN9yTVaEoj0j|Obie Jo"
  "PLN9QqCogPsXLAtgvLQ0tvpLv820R7PQsM|Karaoke"
  "PLN9QqCogPsXLsv5D5ZswnOSnRIbGU80IS|Poly"
  "PLN9QqCogPsXIqfwdfe4hf3qWM1mFweAXP|Obie Johno"
)

# ─── Helpers ─────────────────────────────────────────────────────────────────

usage() {
  echo "Usage:"
  echo "  $0 all"
  echo "  $0 single <YOUTUBE_PLAYLIST_ID> [\"Playlist Name\"]"
  echo "  $0 retry"
  exit 1
}

get_service_role_key() {
  if [ -n "$SERVICE_ROLE_KEY" ]; then
    echo "$SERVICE_ROLE_KEY"
    return
  fi
  local key
  key=$(supabase status | grep "Secret key" | awk '{print $NF}')
  if [ -z "$key" ]; then
    echo "❌ Could not get Supabase service role key. Set SERVICE_ROLE_KEY or run: supabase start" >&2
    exit 1
  fi
  echo "$key"
}

check_supabase() {
  if ! curl -s "${SUPABASE_URL}/health" > /dev/null 2>&1; then
    echo "❌ Supabase not reachable at ${SUPABASE_URL}"
    echo "   Run: supabase start"
    exit 1
  fi
}

create_playlist() {
  local name="$1"
  local key="$2"
  curl -s -X POST "${SUPABASE_URL}/functions/v1/playlist-manager" \
    -H "Content-Type: application/json" \
    -H "apikey: ${key}" \
    -d "{\"action\":\"create\",\"player_id\":\"${PLAYER_ID}\",\"name\":\"${name}\"}"
}

scrape_playlist() {
  local db_id="$1"
  local yt_url="$2"
  local key="$3"
  curl -s -X POST "${SUPABASE_URL}/functions/v1/playlist-manager" \
    -H "Content-Type: application/json" \
    -H "apikey: ${key}" \
    -d "{\"action\":\"scrape\",\"playlist_id\":\"${db_id}\",\"url\":\"${yt_url}\"}"
}

extract_id() {
  echo "$1" | grep -o '"playlist":{[^}]*"id":"[^"]*"' | grep -o '"id":"[^"]*"' | cut -d '"' -f4
}

extract_count() {
  echo "$1" | grep -o '"count":[0-9]*' | cut -d ':' -f2
}

import_single_playlist() {
  local yt_id="$1"
  local name="$2"
  local key="$3"

  echo "📝 Creating playlist: \"${name}\"..."
  local create_resp
  create_resp=$(create_playlist "$name" "$key")

  if echo "$create_resp" | grep -q '"error"'; then
    local err
    err=$(echo "$create_resp" | grep -o '"error":"[^"]*"' | cut -d '"' -f4)
    echo "❌ Failed to create playlist: ${err}"
    return 1
  fi

  local db_id
  db_id=$(extract_id "$create_resp")

  if [ -z "$db_id" ]; then
    echo "❌ No playlist ID in response: ${create_resp}"
    return 1
  fi

  echo "✅ Created: ${db_id}"
  echo "⏳ Waiting ${REQUEST_DELAY}s before scraping YouTube..."
  sleep "${REQUEST_DELAY}"

  local yt_url="https://www.youtube.com/playlist?list=${yt_id}"
  echo "🔍 Scraping: ${yt_url}"
  local scrape_resp
  scrape_resp=$(scrape_playlist "$db_id" "$yt_url" "$key")

  if echo "$scrape_resp" | grep -q '"error"'; then
    local err
    err=$(echo "$scrape_resp" | grep -o '"error":"[^"]*"' | cut -d '"' -f4)
    echo "❌ Scrape failed: ${err}"
    return 1
  fi

  local count
  count=$(extract_count "$scrape_resp")
  if [ -z "$count" ] || [ "$count" = "0" ]; then
    echo "⚠️  No videos found"
    return 1
  fi

  echo "✅ Imported ${count} videos"
  return 0
}

# ─── Subcommands ─────────────────────────────────────────────────────────────

cmd_all() {
  echo "🎵 Importing ${#PREDEFINED_PLAYLISTS[@]} predefined playlists..."
  check_supabase
  local KEY
  KEY=$(get_service_role_key)

  local ok=0 fail=0 total_videos=0

  for entry in "${PREDEFINED_PLAYLISTS[@]}"; do
    IFS='|' read -r yt_id name <<< "$entry"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📂 ${name} (${yt_id})"
    if import_single_playlist "$yt_id" "$name" "$KEY"; then
      ok=$((ok + 1))
    else
      fail=$((fail + 1))
    fi
    # Delay between playlists (not after the last one)
    local remaining=$(( ${#PREDEFINED_PLAYLISTS[@]} - ok - fail ))
    if [ "$remaining" -gt 0 ]; then
      echo "⏳ Waiting ${REQUEST_DELAY}s before next playlist..."
      sleep "${REQUEST_DELAY}"
    fi
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Summary: ${ok} succeeded, ${fail} failed"
  [ "$ok" -gt 0 ] && echo "🎉 Done!" || exit 1
}

cmd_single() {
  local yt_id="$1"
  local name="${2:-Imported ${yt_id:0:12}}"

  if [ -z "$yt_id" ]; then
    echo "Usage: $0 single <YOUTUBE_PLAYLIST_ID> [\"Playlist Name\"]"
    exit 1
  fi

  echo "🎵 Importing: \"${name}\" (${yt_id})"
  check_supabase
  local KEY
  KEY=$(get_service_role_key)

  import_single_playlist "$yt_id" "$name" "$KEY" || exit 1
  echo ""
  echo "View in Admin: ${SUPABASE_URL/54321/5173}"
}

cmd_retry() {
  echo "🔄 Retrying predefined playlists already in DB..."
  check_supabase
  local KEY
  KEY=$(get_service_role_key)

  local ok=0 fail=0

  for entry in "${PREDEFINED_PLAYLISTS[@]}"; do
    IFS='|' read -r yt_id name <<< "$entry"

    # Look up DB playlist by name
    local lookup_resp
    lookup_resp=$(curl -s "${SUPABASE_URL}/rest/v1/playlists?name=eq.${name// /%20}&player_id=eq.${PLAYER_ID}&select=id,name" \
      -H "apikey: ${KEY}" \
      -H "Authorization: Bearer ${KEY}")

    local db_id
    db_id=$(echo "$lookup_resp" | grep -o '"id":"[^"]*"' | head -1 | cut -d '"' -f4)

    if [ -z "$db_id" ]; then
      echo "⚠️  \"${name}\" not found in DB — run 'all' first"
      fail=$((fail + 1))
      continue
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔄 Retrying: ${name} (DB: ${db_id})"

    local yt_url="https://www.youtube.com/playlist?list=${yt_id}"
    local scrape_resp
    scrape_resp=$(scrape_playlist "$db_id" "$yt_url" "$KEY")

    if echo "$scrape_resp" | grep -q '"error"'; then
      local err
      err=$(echo "$scrape_resp" | grep -o '"error":"[^"]*"' | cut -d '"' -f4)
      echo "❌ Scrape failed: ${err}"
      fail=$((fail + 1))
    else
      local count
      count=$(extract_count "$scrape_resp")
      echo "✅ Imported ${count:-0} videos"
      ok=$((ok + 1))
    fi

    local remaining=$(( ${#PREDEFINED_PLAYLISTS[@]} - ok - fail ))
    if [ "$remaining" -gt 0 ]; then
      echo "⏳ Waiting ${REQUEST_DELAY}s..."
      sleep "${REQUEST_DELAY}"
    fi
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Summary: ${ok} succeeded, ${fail} failed"
  [ "$ok" -gt 0 ] && echo "🎉 Done!" || exit 1
}

# ─── Entry point ─────────────────────────────────────────────────────────────

case "${1:-}" in
  all)    cmd_all ;;
  single) cmd_single "${2:-}" "${3:-}" ;;
  retry)  cmd_retry ;;
  *)      usage ;;
esac
