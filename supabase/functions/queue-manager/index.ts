// Queue Manager Edge Function
// Handles all queue operations: add, remove, reorder, next, skip, clear.
//
// Actions that require the player to be online (add, next) are gated on
// player.status === 'online'. All other actions work regardless of status.
//
// All responses use the standard ApiResponse envelope:
//   { success: true, data: T }
//   { success: false, error: string, code?: string }

import { createClient } from 'npm:@supabase/supabase-js@2';
import { ok, clientError, serverError, preflight } from '../_shared/response.ts';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;

// Actions that require the player to be online
const REQUIRES_ONLINE = new Set(['add', 'next']);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const body = await req.json();
    const {
      player_id,
      action,
      media_item_id,
      queue_id,
      queue_ids,
      type = 'normal',
      requested_by = 'admin',
    } = body;

    if (!player_id) {
      return clientError('player_id is required');
    }

    // Verify player exists
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('status')
      .eq('id', player_id)
      .single();

    if (playerError || !player) {
      return clientError('Player not found', 'NOT_FOUND', 404);
    }

    // Gate playback-triggering actions on player being online
    if (REQUIRES_ONLINE.has(action) && player.status !== 'online') {
      return clientError('Player is offline', 'PLAYER_OFFLINE');
    }

    switch (action) {
      case 'add': {
        if (!media_item_id) {
          return clientError('media_item_id is required for add action');
        }
        const { data: queueId, error: addError } = await supabase.rpc('queue_add', {
          p_player_id: player_id,
          p_media_item_id: media_item_id,
          p_type: type,
          p_requested_by: requested_by,
        });
        if (addError) throw addError;
        return ok({ queue_id: queueId });
      }

      case 'remove': {
        if (!queue_id) {
          return clientError('queue_id is required for remove action');
        }
        const { error: removeError } = await supabase.rpc('queue_remove', {
          p_queue_id: queue_id,
        });
        if (removeError) throw removeError;
        return ok({ removed: true });
      }

      case 'reorder': {
        if (!queue_ids || !Array.isArray(queue_ids)) {
          return clientError('queue_ids array is required for reorder action');
        }
        // Retry with exponential backoff on duplicate-key conflicts
        let attempt = 0;
        let lastError: unknown = null;
        while (attempt < MAX_RETRIES) {
          attempt++;
          const { error: reorderError } = await supabase.rpc('queue_reorder', {
            p_player_id: player_id,
            p_queue_ids: queue_ids,
            p_type: type,
          });
          if (!reorderError) { lastError = null; break; }
          lastError = reorderError;
          const isConflict =
            (reorderError as { status?: number })?.status === 409 ||
            /duplicate key|unique constraint/i.test((reorderError as Error)?.message ?? '');
          if (!isConflict) break;
          const backoff = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), 2000);
          await sleep(backoff + Math.floor(Math.random() * 100));
        }
        if (lastError) throw lastError;
        return ok({ reordered: true });
      }

      case 'next': {
        const { data: nextItem, error: nextError } = await supabase.rpc('queue_next', {
          p_player_id: player_id,
        });
        if (nextError) throw nextError;
        return ok({ next_item: Array.isArray(nextItem) ? nextItem[0] : nextItem ?? null });
      }

      case 'skip': {
        const { error: skipError } = await supabase.rpc('queue_skip', {
          p_player_id: player_id,
        });
        if (skipError) throw skipError;
        return ok({ skipped: true });
      }

      case 'clear': {
        const { error: clearError } = await supabase.rpc('queue_clear', {
          p_player_id: player_id,
          p_type: type === 'normal' || type === 'priority' ? type : null,
        });
        if (clearError) throw clearError;
        return ok({ cleared: true });
      }

      default:
        return clientError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    }

  } catch (error) {
    console.error('[queue-manager] Error:', error);
    return serverError(error);
  }
});
