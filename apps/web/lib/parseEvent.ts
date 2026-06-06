import { SseEventSchema } from "@bombe/shared";
import type { SseEvent } from "@bombe/shared";

export type ParseResult = { ok: true; event: SseEvent } | { ok: false; error: string };

/**
 * Pure function: parse a raw SSE data string into a typed SseEvent.
 * Extracted from useEventStream so it can be unit-tested without a real EventSource.
 * Routes by the `kind` discriminator in SseEventSchema (PRD §6.5).
 */
export function parseEvent(data: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return { ok: false, error: `JSON parse failed: ${data.slice(0, 100)}` };
  }

  const result = SseEventSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${result.error.message}`,
    };
  }
  return { ok: true, event: result.data };
}
