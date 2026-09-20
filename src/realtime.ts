import { WebSocket } from "ws";
import { GenerationConfigError } from "./errors.js";
import type { ConnectRealtimeOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://router.neta.art";

/**
 * Opens a raw WebSocket to neta-router's /v1/realtime for `model` (OpenAI
 * Realtime API compatible; the upstream provider is resolved server-side
 * from the model's channel, same as every other adapter in this SDK). This
 * is a byte-level connection: no realtime-protocol event parsing or
 * validation happens here, matching neta-router's own no-content-inspection
 * scope for this route -- speak the OpenAI Realtime event protocol directly
 * over the returned socket.
 *
 * Uses `ws` (not the WHATWG WebSocket global) because Authorization needs to
 * be a real handshake header, which the browser-shaped WebSocket API doesn't
 * allow; this SDK targets Node like the rest of its adapters.
 */
export function connectRealtime(model: string, options: ConnectRealtimeOptions = {}): WebSocket {
  const apiKey = options.apiKey;
  if (!apiKey) throw new GenerationConfigError("apiKey is required");
  if (!model) throw new GenerationConfigError("model is required");

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const wsUrl = new URL(`${baseUrl}/v1/realtime`);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("model", model);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    wsUrl.searchParams.set(key, value);
  }

  return new WebSocket(wsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });
}
