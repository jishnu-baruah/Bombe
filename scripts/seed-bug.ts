/**
 * scripts/seed-bug.ts, the autonomous fix-loop detection drill (T-704).
 *
 * Injects two deliberate defects, one inverted contract-test assertion
 * (category: contract_logic) and one tool type error (category: typescript_type),
 * runs the relevant checks, and asserts that BOTH are detected. Then it removes
 * the injected files (the "fix"), leaving the tree clean.
 *
 * This proves the loop catches the two failure categories it routes on
 * (PRD §15.3). It is a manual drill, never part of the CI gate (it injects bugs).
 *
 * Usage: pnpm seed-bug
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSC_BIN = join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

const SOL_FILE = join(ROOT, "contracts", "test", "SeedBugDrill.t.sol");
const TS_FILE = join(ROOT, "scripts", ".seedbug-drill.ts");

const SOL_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

// Injected by scripts/seed-bug.ts. Deliberately fails so the drill can confirm
// the harness detects a contract_logic failure. Removed when the drill finishes.
contract SeedBugDrillTest is Test {
    function test_SeedBug_InvertedAssertion() public pure {
        assertEq(uint256(1), uint256(2), "seed-bug drill: inverted assertion");
    }
}
`;

const TS_SOURCE = `// Injected by scripts/seed-bug.ts. Deliberate type error (typescript_type).
export const seedBugValue: number = "this is not a number";
`;

function run(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function cleanup() {
  for (const f of [SOL_FILE, TS_FILE]) {
    if (existsSync(f)) rmSync(f);
  }
}

function main() {
  console.log("[seed-bug] injecting two deliberate defects…");
  writeFileSync(SOL_FILE, SOL_SOURCE);
  writeFileSync(TS_FILE, TS_SOURCE);

  const detected: string[] = [];
  const missed: string[] = [];

  try {
    // 1. contract_logic: the inverted assertion must make forge fail.
    console.log("[seed-bug] running the injected contract test (expect failure)…");
    const forge = run("forge test --root contracts --match-contract SeedBugDrillTest");
    if (!forge.ok && /SeedBug|FAIL|assertion|revert/i.test(forge.output)) {
      detected.push("contract_logic (inverted assertion)");
    } else {
      missed.push("contract_logic");
    }

    // 2. typescript_type: the bad assignment must make tsc fail.
    console.log("[seed-bug] type-checking the injected tool file (expect failure)…");
    const tsc = run(`"${TSC_BIN}" --noEmit --strict --skipLibCheck "${TS_FILE}"`);
    if (!tsc.ok && /TS2322|not assignable|error TS/i.test(tsc.output)) {
      detected.push("typescript_type (bad assignment)");
    } else {
      missed.push("typescript_type");
    }
  } finally {
    cleanup();
    console.log("[seed-bug] removed the injected files (the fix); tree is clean.");
  }

  console.log("");
  for (const d of detected) console.log(`  DETECTED  ${d}`);
  for (const m of missed) console.log(`  MISSED    ${m}`);
  console.log("");

  if (missed.length === 0) {
    console.log("[seed-bug] PASS, both injected defects were detected by the harness.");
    process.exit(0);
  }
  console.error(`[seed-bug] FAIL, ${missed.length} defect(s) went undetected.`);
  process.exit(1);
}

main();
