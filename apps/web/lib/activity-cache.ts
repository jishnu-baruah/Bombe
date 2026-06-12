/**
 * activity-cache.ts, the cache layer around the protocol-activity feed.
 *
 * Graceful by design:
 *   - If Upstash Redis is configured (UPSTASH_REDIS_REST_URL + _TOKEN), the
 *     computed feed is cached there with a short TTL, shared across every
 *     serverless instance. This reuses the repo's existing fetch-based Redis
 *     client (lib/cache.ts), so no extra dependency is added.
 *   - If Redis is not configured, this is a thin pass-through and the page
 *     relies on Next.js `export const revalidate` (ISR) for caching. The feed
 *     still works with zero config.
 */

import type { ActivityFeed } from "./activity";
import { buildActivityFeed } from "./activity";
import { cacheGetJson, cacheSetJson } from "./cache";

/** Short TTL: the feed is "recent activity", a few seconds of staleness is fine. */
export const ACTIVITY_TTL_SECONDS = 30;

function cacheKey(limit: number): string {
  return `v1:explorer:activity:${limit}`;
}

/**
 * Return the recent activity feed, served from Redis when available (TTL
 * ACTIVITY_TTL_SECONDS) and otherwise computed fresh. The in-memory fallback in
 * lib/cache.ts means this is still a per-instance cache even without Redis.
 */
export async function getActivityFeed(limit = 40): Promise<ActivityFeed> {
  const key = cacheKey(limit);
  const cached = await cacheGetJson<ActivityFeed>(key);
  if (cached) return cached;

  const feed = await buildActivityFeed(limit);
  // Only cache feeds that actually returned rows; never pin a transient empty.
  if (feed.claims.length > 0) {
    await cacheSetJson(key, feed, ACTIVITY_TTL_SECONDS);
  }
  return feed;
}
