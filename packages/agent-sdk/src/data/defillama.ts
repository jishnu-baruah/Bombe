/**
 * data/defillama.ts — DefiLlama Yields API client + windowing math. (BOMBE-V2-PRD WS1)
 *
 * The /chart/{poolId} endpoint is free and needs no key. It returns a daily
 * timeseries; for liquid-staking pools (mETH) each point carries `pricePerShare`,
 * from which a realized yield over any window is derivable. We annualize over a
 * window so the value is like-for-like with the on-chain rate leg (Q4).
 *
 * The HTTP client is injectable so tests run against a stub, never the network.
 * No Date.now / Math.random here; the timeseries carries its own timestamps.
 */

import { z } from "zod";

const DEFAULT_BASE_URL = "https://yields.llama.fi";

/** One point in a DefiLlama pool chart. Fields beyond these are ignored. */
export const DefiLlamaChartPointSchema = z.object({
  timestamp: z.string(),
  apy: z.number().nullable().optional(),
  apyBase: z.number().nullable().optional(),
  apyMean30d: z.number().nullable().optional(),
  pricePerShare: z.number().nullable().optional(),
  tvlUsd: z.number().nullable().optional(),
});
export type DefiLlamaChartPoint = z.infer<typeof DefiLlamaChartPointSchema>;

const ChartResponseSchema = z.object({
  status: z.string(),
  data: z.array(DefiLlamaChartPointSchema),
});

/** A fetch-like function, injectable so tests never hit the network. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface DefiLlamaClient {
  fetchChart(poolId: string): Promise<DefiLlamaChartPoint[]>;
}

export class DefiLlamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefiLlamaError";
  }
}

/** HTTP client over the public DefiLlama Yields API. Availability-layer retries only. */
export class HttpDefiLlamaClient implements DefiLlamaClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    // Cast the global fetch to the minimal shape we use. No `any`.
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async fetchChart(poolId: string): Promise<DefiLlamaChartPoint[]> {
    const url = `${this.baseUrl}/chart/${poolId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, { signal: controller.signal });
    } catch (err) {
      throw new DefiLlamaError(
        `DefiLlama fetch failed for ${poolId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new DefiLlamaError(`DefiLlama returned HTTP ${res.status} for ${poolId}`);
    }
    const parsed = ChartResponseSchema.parse(await res.json());
    return parsed.data;
  }
}

/**
 * The result of deriving a windowed, annualized yield from a pricePerShare series.
 *   valueBps   — annualized yield over `windowDays`, in basis points
 *   windowDays — the ACTUAL window used (clamped to the data available)
 */
export interface WindowedYield {
  valueBps: number;
  windowDays: number;
}

/**
 * windowedAnnualizedYieldBps — annualized yield over a window from pricePerShare.
 *
 * Sorts ascending, takes the latest point and the point ~windowDays earlier
 * (clamped to the oldest available), and annualizes the realized return:
 *   annualized = (ppsNow / ppsPast - 1) * (365 / actualWindowDays)
 *
 * Throws when there are too few pricePerShare points (caller treats the leg as
 * unavailable and abstains or falls back, never silently zero).
 */
export function windowedAnnualizedYieldBps(
  points: readonly DefiLlamaChartPoint[],
  requestedWindowDays: number,
): WindowedYield {
  if (requestedWindowDays <= 0) {
    throw new DefiLlamaError("requestedWindowDays must be > 0");
  }
  const withPps = points
    .filter(
      (p): p is DefiLlamaChartPoint & { pricePerShare: number } =>
        typeof p.pricePerShare === "number" && p.pricePerShare > 0,
    )
    .map((p) => ({ t: Date.parse(p.timestamp), pps: p.pricePerShare }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  if (withPps.length < 2) {
    throw new DefiLlamaError("insufficient pricePerShare history (need >= 2 points)");
  }

  const last = withPps[withPps.length - 1] as { t: number; pps: number };
  const MS_PER_DAY = 86_400_000;
  const targetPastT = last.t - requestedWindowDays * MS_PER_DAY;

  // Earliest point at or after targetPastT, else the oldest point we have.
  let past = withPps[0] as { t: number; pps: number };
  for (const p of withPps) {
    if (p.t <= targetPastT) {
      past = p;
    } else {
      break;
    }
  }

  const actualWindowDays = Math.max(1, Math.round((last.t - past.t) / MS_PER_DAY));
  const periodReturn = last.pps / past.pps - 1;
  const annualized = periodReturn * (365 / actualWindowDays);
  return { valueBps: annualized * 10_000, windowDays: actualWindowDays };
}
