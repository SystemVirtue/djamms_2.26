// Kiosk Handler Edge Function
// Handles kiosk operations: session init, YouTube search (proxied), credit management,
// and song request enqueue.
//
// All responses use the standard ApiResponse envelope:
//   { success: true, data: T }
//   { success: false, error: string, code?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, clientError, serverError, preflight } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const body = await req.json();
    const { action } = body;
    console.log('[kiosk-handler] action:', action);

    // ── Session Init ───────────────────────────────────────────────────────
    if (action === 'init') {
      // Accept an explicit player_id, or fall back to the first player in the DB.
      // Using the explicit player_id makes this multi-tenant safe when VITE_PLAYER_ID
      // is set in the kiosk app's .env.
      const requestedPlayerId = body.player_id as string | undefined;

      let playerId: string;
      if (requestedPlayerId) {
        playerId = requestedPlayerId;
      } else {
        const { data: player, error: playerError } = await supabase
          .from('players')
          .select('id')
          .limit(1)
          .single();
        if (playerError || !player) {
          console.error('[kiosk-handler] No player found:', playerError);
          return serverError('No player configured', 'NO_PLAYER');
        }
        playerId = player.id;
      }

      const { data: session, error: sessionError } = await supabase
        .from('kiosk_sessions')
        .insert({ player_id: playerId, credits: 0 })
        .select()
        .single();

      if (sessionError || !session) {
        console.error('[kiosk-handler] Failed to create session:', sessionError);
        return serverError('Failed to create session', 'SESSION_CREATE_FAILED');
      }

      console.log('[kiosk-handler] Created session:', session.session_id);
      return ok({ session });
    }

    // ── Search (proxied to youtube-scraper) ────────────────────────────────
    if (action === 'search') {
      const query = body.query || '';
      try {
        const scraperResp = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/youtube-scraper`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ query, type: 'search' }),
          }
        );
        const payload = await scraperResp.json();
        // Pass through the scraper's ApiResponse envelope directly
        return new Response(JSON.stringify(payload), {
          status: scraperResp.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (err) {
        console.error('[kiosk-handler] Search error:', err);
        return serverError(err, 'SEARCH_FAILED');
      }
    }

    // ── Song Request ───────────────────────────────────────────────────────
    if (action === 'request') {
      const { session_id, url, player_id, media_item_id } = body;
      if (!session_id || (!url && !media_item_id)) {
        return clientError('session_id and either url or media_item_id are required');
      }

      let mediaItemId = media_item_id as string | undefined;

      // If URL provided, scrape it to get/create the media item
      if (url && !mediaItemId) {
        try {
          console.log('[kiosk-handler] Scraping URL for request:', url);
          const scraperResp = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/youtube-scraper`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              },
              body: JSON.stringify({ url, type: 'auto' }),
            }
          );

          if (!scraperResp.ok) {
            console.error('[kiosk-handler] Scraper failed:', await scraperResp.text());
            return clientError('Failed to scrape video URL', 'SCRAPE_FAILED');
          }

          const scraperData = await scraperResp.json();
          // Handle new ApiResponse envelope
          const videos = scraperData?.data?.videos ?? scraperData?.videos;

          if (!videos || videos.length === 0) {
            return clientError('No videos found at the provided URL', 'NO_VIDEOS');
          }

          const video = videos[0];
          const videoIdMatch = video.url.match(/[?&]v=([^#&?]*)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : video.url.split('/').pop();
          const sourceId = `youtube:${videoId}`;

          // Upsert media item
          const { data: existing } = await supabase
            .from('media_items')
            .select('id')
            .eq('source_id', sourceId)
            .single();

          if (existing) {
            mediaItemId = existing.id;
          } else {
            const { data: newItem, error: insertError } = await supabase
              .from('media_items')
              .insert({
                source_id: sourceId,
                source_type: 'youtube',
                title: video.title,
                artist: video.artist,
                url: video.url,
                duration: video.duration,
                thumbnail: video.thumbnail,
              })
              .select('id')
              .single();

            if (insertError || !newItem) {
              console.error('[kiosk-handler] Failed to create media item:', insertError);
              return serverError('Failed to create media item', 'MEDIA_ITEM_FAILED');
            }
            mediaItemId = newItem.id;
          }
        } catch (scrapeError) {
          console.error('[kiosk-handler] Scraping error:', scrapeError);
          return serverError(scrapeError, 'SCRAPE_ERROR');
        }
      }

      if (!mediaItemId) {
        return clientError('No media item ID available', 'NO_MEDIA_ITEM');
      }

      // Atomic debit-and-enqueue via DB RPC
      const { data: queueId, error: rpcError } = await supabase.rpc('kiosk_request_enqueue', {
        p_session_id: session_id,
        p_media_item_id: mediaItemId,
      });

      if (rpcError) {
        console.error('[kiosk-handler] kiosk_request_enqueue error:', rpcError);
        return clientError(rpcError.message || String(rpcError), 'ENQUEUE_FAILED');
      }

      // Log the successful request
      const { data: mediaItem } = await supabase
        .from('media_items')
        .select('title, artist')
        .eq('id', mediaItemId)
        .single();

      await supabase.from('system_logs').insert({
        player_id,
        event: 'kiosk_request',
        severity: 'info',
        payload: {
          session_id,
          media_item_id: mediaItemId,
          queue_id: queueId,
          title: mediaItem?.title || 'Unknown',
          artist: mediaItem?.artist || 'Unknown',
        },
      });

      return ok({ queue_id: queueId });
    }

    // ── Credit Update ──────────────────────────────────────────────────────
    if (action === 'credit') {
      const { session_id, amount } = body;
      if (!session_id || typeof amount !== 'number') {
        return clientError('session_id and numeric amount are required for credit action');
      }

      const { data: existing, error: fetchErr } = await supabase
        .from('kiosk_sessions')
        .select('credits')
        .eq('session_id', session_id)
        .single();

      if (fetchErr || !existing) {
        return clientError('Session not found', 'SESSION_NOT_FOUND', 404);
      }

      const newCredits = (existing.credits || 0) + amount;
      const { data: updated, error: updErr } = await supabase
        .from('kiosk_sessions')
        .update({ credits: newCredits })
        .eq('session_id', session_id)
        .select()
        .single();

      if (updErr) {
        console.error('[kiosk-handler] Failed to update credits:', updErr);
        return serverError(updErr, 'CREDIT_UPDATE_FAILED');
      }

      return ok({ credits: updated.credits });
    }

    return clientError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');

  } catch (error) {
    console.error('[kiosk-handler] Error:', error);
    return serverError(error);
  }
});
