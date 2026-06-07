#!/usr/bin/env node
/**
 * scripts/deploy-testnet.mjs, the Mantle Sepolia deploy wrapper (T-804).
 *
 * Validates the live env and fails fast with a named error on any missing var,
 * then runs the Foundry deploy script. Defaults to a DRY-RUN simulation; it
 * refuses to broadcast unless both --broadcast and CONFIRM_REDEPLOY=1 are set,
 * because the deployed addresses are the product and the v2 lock forbids
 * redeploys before 2026-06-15.
 *
 * Usage:
 *   pnpm deploy:testnet                       dry-run simulation (safe)
 *   CONFIRM_REDEPLOY=1 pnpm deploy:testnet --broadcast   actually deploy (new addresses)
 */

import { execSync } from "node:child_process";

const broadcast = process.argv.includes("--broadcast");

// 1. Fail-fast env validation with named errors.
const required = ["RPC_URL"];
if (broadcast) required.push("DEPLOYER_KEY");
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[deploy:testnet] missing required env: ${missing.join(", ")}`);
  console.error(
    "Set them in .env.local (RPC_URL = Mantle Sepolia JSON-RPC; DEPLOYER_KEY for --broadcast).",
  );
  process.exit(1);
}

const chainId = process.env.CHAIN_ID ?? "5003";
if (chainId !== "5003") {
  console.error(
    `[deploy:testnet] CHAIN_ID is ${chainId}, expected 5003 (Mantle Sepolia). Aborting.`,
  );
  process.exit(1);
}

// 2. Redeploy guard (the deployed addresses + their attestation history are the product).
if (broadcast && process.env.CONFIRM_REDEPLOY !== "1") {
  console.error("[deploy:testnet] refusing to broadcast.");
  console.error("The deployed addresses are the product and the v2 lock forbids redeploys before");
  console.error(
    "2026-06-15. To deploy NEW addresses on purpose, set CONFIRM_REDEPLOY=1 explicitly.",
  );
  process.exit(1);
}

// 3. Run the Foundry deploy script.
const args = [
  "script",
  "script/Deploy.s.sol",
  "--root",
  "contracts",
  "--rpc-url",
  process.env.RPC_URL,
];
if (broadcast) {
  args.push("--broadcast", "--private-key", process.env.DEPLOYER_KEY);
}

console.log(
  `[deploy:testnet] ${broadcast ? "BROADCASTING (new addresses)" : "dry-run simulation"} on chain ${chainId}…`,
);
try {
  execSync(`forge ${args.join(" ")}`, { stdio: "inherit" });
} catch {
  console.error("[deploy:testnet] forge script failed (is forge installed and on PATH?).");
  process.exit(1);
}
