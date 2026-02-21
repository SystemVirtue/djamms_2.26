// Playlist Manager Edge Function
// Handles playlist CRUD, media scraping from YouTube, and queue loading.
//
// All responses use the standard ApiResponse envelope:
//   { success: true, data: T }
//   { success: false, error: string, code?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, clientError, serverError, preflight } from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Helper: sync queue to playlist order when the playlist is active
// ---------------------------------------------------------------------------

async function syncQueueIfActive(supabase: any, player_id: string, playlist_id: string) {
  const { data: player } = await supabase
    .from('players')
    .select('active_playlist_id')
    .eq('id', player_id)
    .maybeSingle();

  if (!player || player.active_playlist_id !== playlist_id) return;

  const { data: items } = await supabase
    .from('playlist_items')
    .select('media_item_id')
    .eq('playlist_id', playlist_id)
    .order('position', { ascending: true });

  if (!items || items.length === 0) return;

  const { data: queueItems } = await supabase
    .from('queue')
    .select('id,media_item_id')
    .eq('player_id', player_id)
    .eq('type', 'normal')
    .is('played_at', null);

  if (!queueItems) return;

  const queueIdOrder = items
    .map((pl: any) => queueItems.find((q: any) => q.media_item_id === pl.media_item_id))
    .filter(Boolean)
    .map((q: any) => q.id);

  if (queueIdOrder.length === 0) return;

  await supabase.rpc('queue_reorder_wrapper', {
    p_player_id: player_id,
    p_queue_ids: queueIdOrder,
    p_type: 'normal',
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const body = await req.json();
    const { action, player_id, playlist_id, name, description, media_item_id, item_ids, url, current_index } = body;

    // ── Create Playlist ──────────────────────────────────────────────────
    if (action === 'create') {
      if (!player_id || !name) {
        return clientError('player_id and name are required');
      }
      const { data: playlist, error } = await supabase
        .from('playlists')
        .insert({ player_id, name, description: description || null })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!playlist) return serverError('Playlist creation failed');
      return ok({ playlist });
    }

    // ── Update Playlist ──────────────────────────────────────────────────
    if (action === 'update') {
      if (!playlist_id) return clientError('playlist_id is required');
      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      const { data: playlist, error } = await supabase
        .from('playlists')
        .update(updateData)
        .eq('id', playlist_id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!playlist) return serverError('Playlist update failed');
      return ok({ playlist });
    }

    // ── Delete Playlist ──────────────────────────────────────────────────
    if (action === 'delete') {
      if (!playlist_id) return clientError('playlist_id is required');
      const { error } = await supabase.from('playlists').delete().eq('id', playlist_id);
      if (error) throw error;
      return ok({ deleted: true });
    }

    // ── Add Item to Playlist ─────────────────────────────────────────────
    if (action === 'add_item') {
      if (!playlist_id || !media_item_id) {
        return clientError('playlist_id and media_item_id are required');
      }
      const { data: maxPos } = await supabase
        .from('playlist_items')
        .select('position')
        .eq('playlist_id', playlist_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPosition = (maxPos?.position ?? -1) + 1;
      const { data: item, error } = await supabase
        .from('playlist_items')
        .insert({ playlist_id, media_item_id, position: nextPosition })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!item) return serverError('Failed to add item to playlist');
      if (player_id) await syncQueueIfActive(supabase, player_id, playlist_id);
      return ok({ item });
    }

    // ── Remove Item from Playlist ────────────────────────────────────────
    if (action === 'remove_item') {
      if (!playlist_id || !media_item_id) {
        return clientError('playlist_id and media_item_id are required');
      }
      const { error } = await supabase
        .from('playlist_items')
        .delete()
        .eq('playlist_id', playlist_id)
        .eq('media_item_id', media_item_id);
      if (error) throw error;
      // Re-compact positions
      const { data: remaining } = await supabase
        .from('playlist_items')
        .select('id')
        .eq('playlist_id', playlist_id)
        .order('position', { ascending: true });
      if (remaining && remaining.length > 0) {
        for (let i = 0; i < remaining.length; i++) {
          await supabase.from('playlist_items').update({ position: i }).eq('id', remaining[i].id);
        }
      }
      if (player_id) await syncQueueIfActive(supabase, player_id, playlist_id);
      return ok({ removed: true });
    }

    // ── Reorder Playlist Items ───────────────────────────────────────────
    if (action === 'reorder') {
      if (!playlist_id || !item_ids || !Array.isArray(item_ids)) {
        return clientError('playlist_id and item_ids array are required');
      }
      for (let i = 0; i < item_ids.length; i++) {
        await supabase
          .from('playlist_items')
          .update({ position: i })
          .eq('id', item_ids[i])
          .eq('playlist_id', playlist_id);
      }
      if (player_id) await syncQueueIfActive(supabase, player_id, playlist_id);
      return ok({ reordered: true });
    }

    // ── Scrape YouTube URL into media_items (and optionally playlist) ─────
    if (action === 'scrape') {
      if (!url) return clientError('url is required for scraping');

      const scrapeResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/youtube-scraper`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ url }),
        }
      );

      if (!scrapeResponse.ok) {
        const errorData = await scrapeResponse.json();
        throw new Error(errorData?.error || errorData?.data?.error || 'YouTube scraper failed');
      }

      const scrapeData = await scrapeResponse.json();
      // Handle ApiResponse envelope
      const videos = scrapeData?.data?.videos ?? scrapeData?.videos;

      if (!videos || videos.length === 0) {
        return clientError('No videos found at the provided URL', 'NO_VIDEOS', 404);
      }

      // Upsert media items (deduplicated by source_id)
      const mediaItems: any[] = [];
      for (const video of videos) {
        const mediaData = {
          source_id: video.id,
          source_type: 'youtube',
          title: video.title,
          artist: video.artist,
          url: video.url,
          duration: video.duration,
          thumbnail: video.thumbnail,
          metadata: {},
        };
        const { data: existing } = await supabase
          .from('media_items')
          .select('id')
          .eq('source_id', video.id)
          .eq('source_type', 'youtube')
          .maybeSingle();
        if (existing) {
          const { data: updated } = await supabase
            .from('media_items')
            .update(mediaData)
            .eq('id', existing.id)
            .select()
            .maybeSingle();
          if (updated) mediaItems.push(updated);
        } else {
          const { data: inserted } = await supabase
            .from('media_items')
            .insert(mediaData)
            .select()
            .maybeSingle();
          if (inserted) mediaItems.push(inserted);
        }
      }

      // Add scraped items to playlist if requested
      if (playlist_id) {
        const { data: maxPos } = await supabase
          .from('playlist_items')
          .select('position')
          .eq('playlist_id', playlist_id)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle();
        let position = (maxPos?.position || 0) + 1;
        const playlistItems = mediaItems.map((media) => ({
          playlist_id,
          media_item_id: media.id,
          position: position++,
        }));
        await supabase.from('playlist_items').insert(playlistItems);
        if (player_id) await syncQueueIfActive(supabase, player_id, playlist_id);
      }

      return ok({ media_items: mediaItems, count: mediaItems.length, playlist_id: playlist_id || null });
    }

    // ── Set Active Playlist ──────────────────────────────────────────────
    if (action === 'set_active') {
      if (!player_id || !playlist_id) {
        return clientError('player_id and playlist_id are required');
      }
      const { error: unsetError } = await supabase
        .from('playlists')
        .update({ is_active: false })
        .eq('player_id', player_id);
      if (unsetError) throw unsetError;

      const { error: setError } = await supabase
        .from('playlists')
        .update({ is_active: true })
        .eq('id', playlist_id);
      if (setError) throw setError;

      const { error: playerError } = await supabase
        .from('players')
        .update({ active_playlist_id: playlist_id })
        .eq('id', player_id);
      if (playerError) throw playerError;

      if (current_index !== undefined) {
        const { error: statusError } = await supabase
          .from('player_status')
          .update({ now_playing_index: current_index })
          .eq('player_id', player_id);
        if (statusError) throw statusError;
      }

      await syncQueueIfActive(supabase, player_id, playlist_id);
      return ok({ active: true });
    }

    // ── Clear Queue ──────────────────────────────────────────────────────
    if (action === 'clear_queue') {
      if (!player_id) return clientError('player_id is required');
      const { error } = await supabase.rpc('queue_clear', { p_player_id: player_id });
      if (error) throw error;
      return ok({ cleared: true });
    }

    // ── Import Playlist into Queue ───────────────────────────────────────
    if (action === 'import_queue') {
      if (!player_id || !playlist_id) {
        return clientError('player_id and playlist_id are required');
      }
      const { data: currentStatus } = await supabase
        .from('player_status')
        .select('state')
        .eq('player_id', player_id)
        .maybeSingle();

      const { data: loaded, error: importError } = await supabase.rpc('load_playlist', {
        p_player_id: player_id,
        p_playlist_id: playlist_id,
        p_start_index: 0,
      });
      if (importError) throw importError;

      const updateData: Record<string, unknown> = { now_playing_index: -1 };
      if (!currentStatus || (currentStatus.state !== 'playing' && currentStatus.state !== 'paused')) {
        updateData.current_media_id = null;
        updateData.state = 'idle';
        updateData.progress = 0;
      }
      const { error: indexError } = await supabase
        .from('player_status')
        .update(updateData)
        .eq('player_id', player_id);
      if (indexError) throw indexError;

      return ok({ loaded_count: loaded?.[0]?.loaded_count || 0 });
    }

    return clientError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');

  } catch (error) {
    console.error('[playlist-manager] Error:', error);
    return serverError(error);
  }
});
