/**
 * Shared response utilities for all Edge Functions.
 *
 * Every function should return:
 *   { success: true,  data: T }
 *   { success: false, error: string, code?: string }
 */

import { corsHeaders } from './cors.ts';

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

/** 200 success response */
export function ok<T>(data: T): Response {
  const body: ApiResponse<T> = { success: true, data };
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}

/** 4xx client error response */
export function clientError(error: string, code?: string, status = 400): Response {
  const body: ApiResponse<never> = { success: false, error, ...(code ? { code } : {}) };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 500 server error response */
export function serverError(error: unknown, code?: string): Response {
  const message =
    error instanceof Error ? error.message : String(error);
  const body: ApiResponse<never> = { success: false, error: message, ...(code ? { code } : {}) };
  return new Response(JSON.stringify(body), { status: 500, headers: JSON_HEADERS });
}

/** CORS preflight response */
export function preflight(): Response {
  return new Response('ok', { headers: corsHeaders });
}
