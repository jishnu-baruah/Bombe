/**
 * config.ts — THE ONLY MODULE THAT READS process.env IN packages/agent-sdk.
 *
 * PRD §7: Mode is fixed at boot; no runtime switching.
 * PRD §15.4 guardrail: reading process.env.*KEY* outside this module is forbidden.
 * All env access must live here. All other modules call getConfig() / getMode() / getTestMode().
 */

export type Mode = "mock" | "live";
export type TestMode = "mock" | "stub";

/** Thrown when a required live-only env var is missing at boot. (PRD §7 fail-fast) */
export class MissingEnvVarError extends Error {
  constructor(public readonly varName: string) {
    super(
      `Missing required env var "${varName}" — required in live mode. Set it before booting in MODE=live. (PRD §7)`,
    );
    this.name = "MissingEnvVarError";
  }
}

/**
 * getMode — reads MODE env var, defaults to "mock".
 * Valid values: "mock" | "live". Anything else is coerced to "mock".
 */
export function getMode(): Mode {
  const raw = process.env.MODE;
  if (raw === "live") return "live";
  return "mock";
}

/**
 * getTestMode — reads TEST_MODE env var, defaults to "mock".
 * Valid values: "mock" | "stub". Anything else is coerced to "mock".
 */
export function getTestMode(): TestMode {
  const raw = process.env.TEST_MODE;
  if (raw === "stub") return "stub";
  return "mock";
}

/**
 * requireLiveVar — reads a required live-only env var.
 * In live mode: throws MissingEnvVarError if missing (fail-fast at boot, PRD §7).
 * In mock mode: returns undefined without throwing (live vars not required).
 */
function requireLiveVar(name: string, mode: Mode): string | undefined {
  if (mode !== "live") return undefined;
  const val = process.env[name];
  if (val === undefined || val === "") {
    throw new MissingEnvVarError(name);
  }
  return val;
}

/** Typed configuration object returned by getConfig(). */
export interface Config {
  mode: Mode;
  testMode: TestMode;
  /** Max total estimated cost per agent run in USD before ABSTAIN(COST_CAPPED). Default: 0.05 */
  maxCostUsdPerRun: number;
  /** Fallback model identifier. Default: "meta/llama-3.3-70b" (PRD §6.3.1) */
  fallbackModel: string;
  // --- live-only vars (undefined in mock mode; present and validated in live mode) ---
  /** Mantle Sepolia RPC endpoint [live only] */
  rpcUrl: string | undefined;
  /** Chain ID [live only, default 5003] */
  chainId: number;
  /** Deployer private key [live only] */
  deployerKey: string | undefined;
  /** AI gateway API key [live only] */
  aiGatewayKey: string | undefined;
  /** AI gateway base URL (default "https://ollama.com/v1") */
  aiGatewayBaseUrl: string | undefined;
  /** Comma-separated model names served by the gateway (first is primary) */
  aiGatewayModels: string | undefined;
  /** Blob storage read-write token [live only] */
  blobRwToken: string | undefined;
  /** Pinned Hermes runtime tag [live only] */
  hermesRuntimeTag: string | undefined;
  /** Operator key (default "dev-operator" in mock) */
  operatorKey: string;
  /** Tool gateway key (default "dev-gateway" in mock) */
  toolGatewayKey: string;
}

/**
 * getConfig — assembles and returns the full typed config object.
 * Live-only vars are validated eagerly: if MODE=live and any required live var is
 * missing, this function throws MissingEnvVarError immediately (fail-fast, PRD §7).
 */
export function getConfig(): Config {
  const mode = getMode();
  const testMode = getTestMode();

  const maxCostRaw = process.env.MAX_COST_USD_PER_RUN;
  const maxCostUsdPerRun =
    maxCostRaw !== undefined && maxCostRaw !== "" ? Number.parseFloat(maxCostRaw) : 0.05;

  const fallbackModel = process.env.FALLBACK_MODEL || "meta/llama-3.3-70b";

  const chainIdRaw = process.env.CHAIN_ID;
  const chainId =
    chainIdRaw !== undefined && chainIdRaw !== "" ? Number.parseInt(chainIdRaw, 10) : 5003;

  const operatorKey = process.env.OPERATOR_KEY || "dev-operator";
  const toolGatewayKey = process.env.TOOL_GATEWAY_KEY || "dev-gateway";

  // Live-only vars: validated eagerly in live mode, optional (undefined) in mock.
  const rpcUrl = requireLiveVar("RPC_URL", mode);
  const deployerKey = requireLiveVar("DEPLOYER_KEY", mode);
  const aiGatewayKey = requireLiveVar("AI_GATEWAY_KEY", mode);
  const blobRwToken = requireLiveVar("BLOB_RW_TOKEN", mode);
  // HERMES_RUNTIME_TAG is live-only but not strictly required for SDK agents;
  // it gates Plugboard only. Read lazily/optionally.
  const hermesRuntimeTag =
    mode === "live" ? (process.env.HERMES_RUNTIME_TAG ?? undefined) : undefined;

  // AI gateway URL + model list — optional in both modes (default to Ollama Cloud).
  const aiGatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL ?? undefined;
  const aiGatewayModels = process.env.AI_GATEWAY_MODELS ?? undefined;

  return {
    mode,
    testMode,
    maxCostUsdPerRun,
    fallbackModel,
    rpcUrl,
    chainId,
    deployerKey,
    aiGatewayKey,
    aiGatewayBaseUrl,
    aiGatewayModels,
    blobRwToken,
    hermesRuntimeTag,
    operatorKey,
    toolGatewayKey,
  };
}
