// Player Control Edge Function
// Handles player heartbeat, session registration, status updates, and queue progression.
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
    const { player_id, state, progress, action = 'update', session_id, stored_player_id } = body;

    if (!player_id) {
      return clientError('player_id is required');
    }

    // ── Heartbeat ──────────────────────────────────────────────────────────
    if (action === 'heartbeat') {
      const { error } = await supabase.rpc('player_heartbeat', { p_player_id: player_id });
      if (error) throw error;
      return ok({ heartbeat: true });
    }

    // ── Session Registration (priority player mechanism) ───────────────────
    if (action === 'register_session') {
      if (!session_id) {
        return clientError('session_id is required for register_session');
      }

      // If this player was previously the priority player, restore that status
      if (stored_player_id === player_id) {
        const { error } = await supabase
          .from('players')
          .update({ priority_player_id: player_id })
          .eq('id', player_id);
        if (error) throw error;
        console.log(`[player-control] Priority restored for player ${player_id} (session: ${session_id})`);
        return ok({ is_priority: true, restored: true });
      }

      // Check whether a priority player is already set
      const { data: playerRow } = await supabase
        .from('players')
        .select('priority_player_id')
        .eq('id', player_id)
        .single();

      if (!playerRow?.priority_player_id) {
        // No priority player yet — check if anyone is currently playing
        const { data: playing } = await supabase
          .from('player_status')
          .select('id')
          .eq('state', 'playing');

        if (!playing || playing.length === 0) {
          // No active playback — claim priority
          const { error } = await supabase
            .from('players')
            .update({ priority_player_id: player_id })
            .eq('id', player_id);
          if (error) throw error;
          console.log(`[player-control] Player ${player_id} claimed priority (no active playback, session: ${session_id})`);
          return ok({ is_priority: true });
        }

        console.log(`[player-control] Player ${player_id} registered as slave (active playback exists, session: ${session_id})`);
        return ok({ is_priority: false });
      }

      console.log(`[player-control] Player ${player_id} registered as slave (priority already set, session: ${session_id})`);
      return ok({ is_priority: false });
    }

    // ── Reset Priority ─────────────────────────────────────────────────────
    if (action === 'reset_priority') {
      const { error } = await supabase
        .from('players')
        .update({ priority_player_id: null })
        .eq('id', player_id);
      if (error) throw error;
      console.log(`[player-control] Priority reset for player ${player_id}`);
      return ok({ reset: true });
    }

    // ── Status Update (update / ended / skip) ──────────────────────────────
    if (action === 'update' || action === 'ended' || action === 'skip') {
      const updateData: Record<string, unknown> = {
        last_updated: new Date().toISOString(),
      };
      if (state !== undefined) updateData.state = state;
      if (progress !== undefined) updateData.progress = Math.min(1, Math.max(0, progress));

      const { error: updateError } = await supabase
        .from('player_status')
        .update(updateData)
        .eq('player_id', player_id);
      if (updateError) throw updateError;

      // Skip from Admin: update state only — Player handles fade and queue_next
      if (action === 'skip' && state === 'idle') {
        const { data: playerRow } = await supabase
          .from('players')
          .select('priority_player_id')
          .eq('id', player_id)
          .single();

        if (playerRow?.priority_player_id !== player_id) {
          console.log(`[player-control] Ignoring skip from non-priority player ${player_id}`);
          return ok({ skip_ignored: true, reason: 'not_priority_player' });
        }
        return ok({ skip_pending: true });
      }

      // Song ended naturally: advance the queue
      if (action === 'ended' || state === 'idle') {
        const { data: playerRow } = await supabase
          .from('players')
          .select('priority_player_id')
          .eq('id', player_id)
          .single();

        if (playerRow?.priority_player_id !== player_id) {
          console.log(`[player-control] Ignoring ${action} from non-priority player ${player_id}`);
          return ok({ ignored: true, reason: 'not_priority_player' });
        }

        console.log(`[player-control] Song ended — calling queue_next for player ${player_id}`);
        const { data: nextItem, error: nextError } = await supabase.rpc('queue_next', {
          p_player_id: player_id,
        });
        if (nextError) {
          console.error('[player-control] queue_next failed:', nextError);
        }
        return ok({ next_item: nextItem?.[0] || null, action });
      }

      return ok({ updated: true });
    }

    return clientError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');

  } catch (error) {
    console.error('[player-control] Error:', error);
    return serverError(error);
  }
});
