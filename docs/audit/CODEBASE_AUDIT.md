# Codebase Audit — obie-v5

Generated during Phase 0.1 of the refactor.

---

## Root-Level Files

| File | Category | Notes |
|---|---|---|
| `README.md` | `CORE` | Primary entry point doc — keep at root |
| `CHANGELOG.md` | `STALE_DOC` | Move to `docs/` |
| `DEPLOYMENT.md` | `STALE_DOC` | Render-specific; consolidate into `docs/DEPLOYMENT.md` |
| `DEVELOPMENT.md` | `STALE_DOC` | Consolidate into `docs/DEVELOPMENT.md` |
| `RENDER_DEPLOYMENT.md` | `STALE_DOC` | Render-specific duplicate of DEPLOYMENT.md |
| `YOUTUBE_SETUP.md` | `STALE_DOC` | Content should live in `docs/DEVELOPMENT.md` |
| `PLAYER_AUTOPLAY.md` | `STALE_DOC` | One-off debug doc; relevant content in ARCHITECTURE |
| `QUICK_REFERENCE.md` | `STALE_DOC` | Superseded by a proper docs structure |
| `IMPORT_RESULTS.md` | `STALE_DOC` | Log of a one-time import run; delete |
| `PROJECT_SUMMARY.md` | `STALE_DOC` | Outdated; content goes to ARCHITECTURE |
| `setup_and_user_guide.md` | `STALE_DOC` | Duplicated inside `web/admin/` and `web/admin_original_copy/`; consolidate |
| `LICENSE` | `CORE` | Keep at root |
| `render.yaml` | `HARDCODED` | Render-specific deployment config |
| `package.json` | `CORE` | Root monorepo workspace config |
| `package-lock.json` | `CORE` | Lockfile |
| `check_rls.sql` | `DEBUG` | Read-only diagnostic queries + one hardcoded player UUID check. No unique schema logic. Safe to delete after Phase 1 verification. |
| `debug_kiosk.sql` | `DEBUG` | Diagnostic queries only — same content as check_rls.sql. Safe to delete. |
| `enable_rls.sql` | `MIGRATION` | `ALTER TABLE kiosk_sessions ENABLE ROW LEVEL SECURITY` and two policies. **Must verify** these are present in main migration before deleting. |
| `initialize-production.sql` | `DEBUG` | File is **empty**. Safe to delete. |
| `check-queue.js` | `DEBUG` | Ad-hoc CLI queue inspector. Hardcodes player UUID. Not part of application. Safe to delete. |
| `import-log.txt` | `DEBUG` | Output log from a past import run. Delete. |
| `import-all-playlists.sh` | `REDUNDANT_SCRIPT` | Hardcodes playlist IDs and player UUID. Overlaps with `import-single-playlist.sh`. Consolidate into `scripts/import.sh`. |
| `import-single-playlist.sh` | `REDUNDANT_SCRIPT` | Hardcodes player UUID. Consolidate into `scripts/import.sh`. |
| `import-to-production.sh` | `REDUNDANT_SCRIPT` | File is **empty**. Delete. |
| `retry-failed-playlists.sh` | `REDUNDANT_SCRIPT` | Hardcodes DB playlist UUIDs from a specific import run. Consolidate retry logic into `scripts/import.sh`. |
| `populate-playlist.sh` | `REDUNDANT_SCRIPT` | Hardcodes playlist UUID `...000000000002`. Superseded by admin UI import. Consolidate. |
| `setup.sh` | `CORE` | Dev bootstrapping. Move to `scripts/setup.sh` and reference from README. |
| `REFERENCE-ObieAdminConsole.html` | `DEAD_CODE` | Legacy single-file HTML admin console. Not imported anywhere. Reference artifact only. |
| `REFERENCE-ObieAdminConsole.jsx` | `DEAD_CODE` | Legacy JSX admin. Not imported anywhere. Reference artifact only. |
| `REFERENCE_AdminSettingsTab.jsx` | `DEAD_CODE` | Legacy settings tab. Not imported anywhere. Reference artifact only. |
| `REFERENCE_setup_and_user_guide.md` | `STALE_DOC` | Duplicate of setup_and_user_guide.md. Delete. |

---

## `.github/` / `.vscode/` / `.windsurf/`

| File | Category | Notes |
|---|---|---|
| `.github/copilot-instructions.md` | `STALE_DOC` | Copilot-specific agent instructions. Superseded by CLAUDE.md. |
| `.windsurf/workflows/custom-agent-instructions.md` | `STALE_DOC` | Windsurf-specific. Superseded by CLAUDE.md. |
| `.vscode/extensions.json` | `CORE` | Editor recommendations — keep. |
| `.gitignore` | `CORE` | Keep. |

---

## `supabase/`

| File | Category | Notes |
|---|---|---|
| `supabase/config.toml` | `CORE` | Supabase CLI configuration |
| `supabase/functions/_shared/cors.ts` | `CORE` | Shared CORS headers for edge functions |
| `supabase/functions/queue-manager/index.ts` | `CORE` | Queue management edge function |
| `supabase/functions/queue-manager/user_fn_syccqoextpxifmumvxqw_e6fa4b56-0243-44c5-88bb-15d457d2547c_5/_shared/cors.ts` | `DEAD_CODE` | Orphaned CORS copy inside a strangely-named subfolder. Not imported anywhere. Delete. |
| `supabase/functions/player-control/index.ts` | `CORE` | Player status + heartbeat edge function |
| `supabase/functions/player-control/functions/_shared/cors.ts` | `DEAD_CODE` | Duplicate CORS file nested incorrectly under `player-control/functions/`. Not imported by the function. Delete. |
| `supabase/functions/kiosk-handler/index.ts` | `CORE` | Kiosk session, search, credit, request handler |
| `supabase/functions/kiosk-handler/functions/_shared/cors.ts` | `DEAD_CODE` | Duplicate CORS file, same issue as above. Delete. |
| `supabase/functions/playlist-manager/index.ts` | `CORE` | Playlist CRUD + YouTube scrape |
| `supabase/functions/playlist-manager/functions/_shared/cors.ts` | `DEAD_CODE` | Duplicate CORS file. Delete. |
| `supabase/functions/youtube-scraper/index.ts` | `CORE` | YouTube Data API search + playlist scrape. **Contains 9 hardcoded API keys**. |
| `supabase/functions/youtube-scraper/functions/_shared/cors.ts` | `DEAD_CODE` | Duplicate CORS file. Delete. |
| `supabase/migrations/0001_initial_schema.sql` | `CORE` | Primary schema — players, playlists, queue, player_status, player_settings, kiosk_sessions, system_logs, RPCs |
| `supabase/migrations/0017_add_karaoke_mode.sql` | `CORE` | Adds `karaoke_mode` to player_settings |
| `supabase/migrations/0018_fix_queue_reorder_full_update.sql` | `CORE` | Bug fix migration |
| `supabase/migrations/0019_create_queue_reorder_wrapper_and_playlists_counts.sql` | `CORE` | Adds `queue_reorder_wrapper` RPC and `playlists_with_counts` view |
| `supabase/migrations/0020_set_search_path_on_functions.sql` | `CORE` | Security fix for function search paths |
| `supabase/migrations/0021_add_queue_reorder_3arg_forwarder.sql` | `CORE` | Compatibility shim |
| `supabase/migrations/0022_cleanup_queue_reorder_duplicates.sql` | `CORE` | Cleanup migration |
| `supabase/migrations/0023_fix_queue_reorder_no_default_on_4arg.sql` | `CORE` | Bug fix migration |
| `supabase/migrations/0025_multi_user_player_ownership.sql` | `CORE` | Adds `owner_id` to players table for multi-tenancy |
| `supabase/migrations/20251109153923_update_queue_reorder_wrapper.sql` | `CORE` | Queue reorder fix |
| `supabase/migrations/20251109233222_fix_playlist_loading_priority.sql` | `CORE` | Playlist priority fix |
| `supabase/migrations/20251109234949_add_kiosk_coin_acceptor_settings.sql` | `CORE` | Coin acceptor settings columns |
| `supabase/migrations/20251110120000_add_priority_player_id.sql` | `CORE` | Adds `priority_player_id` to players |
| `supabase/migrations/20251110130000_add_kiosk_virtual_coin_button_setting.sql` | `CORE` | Adds `kiosk_show_virtual_coin_button` column |
| `supabase/migrations_backup/` (16 files) | `MIGRATION` | Superseded by the consolidated `0001_initial_schema.sql`. Safe to archive or delete after verification. |

---

## `web/shared/`

| File | Category | Notes |
|---|---|---|
| `web/shared/supabase-client.ts` | `CORE` | Canonical shared client: types, realtime helpers, API wrappers, auth helpers |
| `web/shared/types.ts` | `CORE` | `SearchResult` and `SearchInterfaceProps` interfaces used by kiosk |
| `web/shared/keyboard.ts` | `CORE` | `KEYBOARD_ROWS` and `SPECIAL_KEYS` constants used by kiosk SearchKeyboard component |
| `web/shared/vite-env.d.ts` | `CORE` | TypeScript env declarations |

---

## `web/admin/`

| File | Category | Notes |
|---|---|---|
| `web/admin/src/App.tsx` | `CORE` | Main admin console — **1500+ line monolith**. Contains hardcoded `PLAYER_ID` and `PREDEFINED_PLAYLISTS`. |
| `web/admin/src/App-OLD.tsx` | `DEAD_CODE` | Old admin UI (541 lines). Not imported anywhere. Delete. |
| `web/admin/src/App-Claude.tsx` | `DEAD_CODE` | Empty file (0 lines). Delete. |
| `web/admin/src/main.tsx` | `CORE` | React entry point |
| `web/admin/src/index.css` | `CORE` | Admin CSS variables and global styles |
| `web/admin/src/lib/supabaseClient.ts` | `DEAD_CODE` | **Near-identical duplicate** of `web/shared/supabase-client.ts`. The admin `App.tsx` imports from `@shared/supabase-client`, not from this file. This file is not imported anywhere. Delete. |
| `web/admin/src/lib/api.ts` | `DEAD_CODE` | Wrapper functions that are **not imported anywhere** in the app (App.tsx uses shared client directly). Delete. |
| `web/admin/src/hooks/useAdminPrefs.ts` | `DEAD_CODE` | Preferences hook not imported by current App.tsx (prefs logic is inlined in App.tsx). Delete. |
| `web/admin/ObieAdminConsole.html` | `DEAD_CODE` | Legacy single-file HTML admin. Not part of the Vite build. |
| `web/admin/ObieAdminConsole.jsx` | `DEAD_CODE` | Legacy JSX admin. Not part of the Vite build. |
| `web/admin/AdminSettingsTab.jsx` | `DEAD_CODE` | Legacy settings component. Not imported anywhere. |
| `web/admin/index.html` | `CORE` | Vite HTML entry |
| `web/admin/setup_and_user_guide.md` | `STALE_DOC` | Duplicate of root `setup_and_user_guide.md` |
| `web/admin/package.json` | `CORE` | Admin app dependencies |
| `web/admin/vite.config.ts` | `CORE` | Vite config with `@shared` alias |
| `web/admin/tsconfig.json` | `CORE` | TypeScript config |
| `web/admin/tsconfig.node.json` | `CORE` | TypeScript config for node tooling |
| `web/admin/tailwind.config.js` | `CORE` | Tailwind config |
| `web/admin/postcss.config.js` | `CORE` | PostCSS config |

---

## `web/admin_original_copy/`

| All files | `DEAD_CODE` | Entire directory is a verbatim copy of `web/admin/` with minor cosmetic diffs (whitespace, one extra import). Not referenced anywhere. **Delete the entire directory.** |

---

## `web/player/`

| File | Category | Notes |
|---|---|---|
| `web/player/src/App.tsx` | `CORE` | YouTube IFrame player, status/settings subscriptions, queue progression, karaoke mode, fade logic. Hardcodes `PLAYER_ID`. |
| `web/player/src/main.tsx` | `CORE` | React entry point |
| `web/player/src/index.css` | `CORE` | Player CSS |
| `web/player/public/Obie_neon_no_BG.png` | `HARDCODED` | Brand asset — hardcoded path referenced in App.tsx. Should come from branding config. |
| `web/player/index.html` | `CORE` | Vite HTML entry |
| `web/player/package.json` | `CORE` | Player app dependencies |
| `web/player/vite.config.ts` | `CORE` | Vite config with `@shared` alias |
| `web/player/tsconfig.json` | `CORE` | TypeScript config |
| `web/player/tsconfig.node.json` | `CORE` | TypeScript config for node tooling |
| `web/player/tailwind.config.js` | `CORE` | Tailwind config |
| `web/player/postcss.config.js` | `CORE` | PostCSS config |

---

## `web/kiosk/`

| File | Category | Notes |
|---|---|---|
| `web/kiosk/src/App.tsx` | `CORE` | Main kiosk UI. Hardcodes `PLAYER_ID`. Reads `VITE_SUPABASE_URL/ANON_KEY` directly in component (should go through shared config). |
| `web/kiosk/src/main.tsx` | `CORE` | React entry point |
| `web/kiosk/src/index.css` | `CORE` | Kiosk CSS |
| `web/kiosk/src/components/SearchInterface.tsx` | `CORE` | Search modal component |
| `web/kiosk/src/components/SearchKeyboard.tsx` | `CORE` | On-screen QWERTY keyboard |
| `web/kiosk/src/components/VideoResultCard.tsx` | `CORE` | Search result display card |
| `web/kiosk/src/components/BackgroundPlaylist.tsx` | `CORE` | Idle-screen background video playlist |
| `web/kiosk/src/components/Button.tsx` | `CORE` | Kiosk button primitive |
| `web/kiosk/src/components/Dialog.tsx` | `CORE` | Confirmation dialog |
| `web/kiosk/src/components/Input.tsx` | `CORE` | Input primitive |
| `web/kiosk/src/components/BackToSearchButton.tsx` | `CORE` | Navigation button |
| `web/kiosk/public/assets/background/` | `CORE` | Background video/image assets (Obie brand) |
| `web/kiosk/public/assets/background/README.md` | `STALE_DOC` | Brief note about assets — minor, keep or fold into docs |
| `web/kiosk/index.html` | `CORE` | Vite HTML entry |
| `web/kiosk/package.json` | `CORE` | Kiosk app dependencies |
| `web/kiosk/vite.config.ts` | `CORE` | Vite config |
| `web/kiosk/tsconfig.json` | `CORE` | TypeScript config |
| `web/kiosk/tsconfig.node.json` | `CORE` | TypeScript config for node tooling |
| `web/kiosk/tailwind.config.js` | `CORE` | Tailwind config |
| `web/kiosk/postcss.config.js` | `CORE` | PostCSS config |

---

## Summary Counts

| Category | Count |
|---|---|
| `CORE` | 58 |
| `DEAD_CODE` | 22 (including entire `web/admin_original_copy/`) |
| `STALE_DOC` | 16 |
| `MIGRATION` | 16 (migrations_backup) |
| `DEBUG` | 5 |
| `REDUNDANT_SCRIPT` | 5 |
| `HARDCODED` | 5 (files that exist only because of hardcoded assumptions) |
