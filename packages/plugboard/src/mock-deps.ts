/**
 * mock-deps.ts — Mock implementations of ReplayDeps for unit tests. (T-501, T-502)
 *
 * `MockGatewayClient` — returns deterministic fixture-backed observations.
 * `MockRevertingWalletSeam` — simulates sendFinalizeTx; throws ContractRevertError
 *   when `expectedRevert` matches the configured revert name.
 *
 * These are the ONLY wallet/gateway implementations used in unit tests (no anvil).
 * The contract revert itself is already covered by T-104 Foundry tests.
 *
 * No `any`. TypeScript strict.
 */

import { hashCanonical } from "@bombe/shared";
import { ContractRevertError } from "./types.js";
import type { GatewayClient, RevertingWalletSeam } from "./types.js";

// ---------------------------------------------------------------------------
// MockGatewayClient
// ---------------------------------------------------------------------------

/**
 * MockGatewayClient — returns deterministic observations for known tool names.
 *
 * Unknown tools return an empty observation `{}`.
 * Recorded calls are accessible via `.calls` for test assertions.
 */
export class MockGatewayClient implements GatewayClient {
  private readonly _calls: Array<{ name: string; input: Record<string, unknown> }> = [];

  async callTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this._calls.push({ name, input });
    // Return deterministic fixture observations keyed by tool name.
    return MOCK_OBSERVATIONS[name] ?? {};
  }

  get calls(): ReadonlyArray<{ name: string; input: Record<string, unknown> }> {
    return this._calls;
  }

  clear(): void {
    this._calls.length = 0;
  }
}

/** Deterministic fixture observations for each known tool. */
const MOCK_OBSERVATIONS: Record<string, Record<string, unknown>> = {
  fetch_meth_yield: {
    value: 34,
    stale: false,
    source: "fixture:oracles/meth.json",
    fetchedAt: 1748736000,
    confidence: 9500,
  },
  fetch_chainlink_price: {
    value: 34,
    stale: false,
    source: "fixture:oracles/chainlink-meth.json",
    fetchedAt: 1748736000,
    confidence: 9000,
  },
  fetch_usdy_yield: {
    value: 50,
    stale: false,
    source: "fixture:oracles/usdy.json",
    fetchedAt: 1748736000,
    confidence: 9000,
  },
  read_document: {
    docRef: "pc-pool-1-servicer",
    cashflowTotal: 50000,
    currency: "USD",
    source: "fixture:documents/v1/pc-pool-1-servicer.json",
    fetchedAt: 1748736000,
  },
  compute_expected: {
    withinTolerance: false,
    delta: 5000,
    toleranceBps: 2,
  },
  cross_check_history: {
    priorCount: 0,
    priorAttestations: [],
    source: "fixture:history",
  },
  query_chain_state: {
    result: true,
    source: "fixture:chain",
  },
};

// ---------------------------------------------------------------------------
// MockRevertingWalletSeam
// ---------------------------------------------------------------------------

/**
 * MockRevertingWalletSeam — simulates a wallet for plugboard replay tests.
 *
 * When `sendFinalizeTx` is called with an `expectedRevert` that matches the
 * configured `revertOn` name, it throws `ContractRevertError(revertOn)`.
 *
 * Successful calls return a deterministic txHash based on the decision.
 */
export class MockRevertingWalletSeam implements RevertingWalletSeam {
  private readonly _addr: string;
  /**
   * When set, calls with a matching `expectedRevert` will throw
   * ContractRevertError(revertOn). Subsequent calls succeed normally.
   */
  private readonly revertOn: string | undefined;

  /**
   * @param revertOn — if provided, a `sendFinalizeTx` call with this
   *   `expectedRevert` will throw `ContractRevertError(revertOn)`.
   */
  constructor(
    opts: { address?: string; revertOn?: string } = {},
  ) {
    this._addr = opts.address ?? "0xplugboard0000000000000000000000000000001";
    this.revertOn = opts.revertOn;
  }

  address(): string {
    return this._addr;
  }

  async sendFinalizeTx(
    decision: "VALID" | "REJECTED" | "ABSTAIN",
    confidenceBps: number,
    rationaleSummary: string,
    expectedRevert?: string,
  ): Promise<{ txHash: `0x${string}` }> {
    if (expectedRevert !== undefined && expectedRevert === this.revertOn) {
      throw new ContractRevertError(expectedRevert);
    }
    const txHash = hashCanonical({ decision, confidenceBps, rationaleSummary });
    return { txHash };
  }
}
