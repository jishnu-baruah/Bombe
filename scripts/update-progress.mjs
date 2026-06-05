#!/usr/bin/env node
// scripts/update-progress.mjs — Bombe progress dashboard generator
// Node ESM, no external dependencies.
// Usage: node scripts/update-progress.mjs
// Or:    pnpm progress

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Parse TODO.md
// ---------------------------------------------------------------------------
function parseTodo() {
  const content = readFileSync(join(ROOT, "TODO.md"), "utf8");
  const lines = content.split("\n");

  // Range section headers: "## T-Nxx — ..."
  const rangeHeaderRe = /^## (T-\dxx) — (.+)/;
  // Task blocks: "### T-NNN — title" where NNN is exactly 3 digits
  // IMPORTANT: ignore the template placeholder "### T-XXX — <task title>"
  const taskHeaderRe = /^### T-(\d{3}) /;
  const statusRe = /^- Status:\s*(.+)/;

  const ranges = [];
  let currentRange = null;
  let currentTask = null;

  for (const line of lines) {
    const rangeMatch = line.match(rangeHeaderRe);
    if (rangeMatch) {
      currentRange = { id: rangeMatch[1], label: rangeMatch[2].trim(), tasks: [] };
      ranges.push(currentRange);
      currentTask = null;
      continue;
    }

    const taskMatch = line.match(taskHeaderRe);
    if (taskMatch && currentRange) {
      currentTask = { id: `T-${taskMatch[1]}`, status: "pending", raw: line.trim() };
      currentRange.tasks.push(currentTask);
      continue;
    }

    if (currentTask) {
      const statusMatch = line.match(statusRe);
      if (statusMatch) {
        currentTask.status = statusMatch[1].trim();
      }
    }
  }

  return ranges;
}

function normalizeStatus(raw) {
  if (!raw) return "pending";
  const s = raw.toLowerCase();
  if (s.startsWith("done")) return "done";
  if (s.startsWith("in-progress")) return "in-progress";
  if (s.startsWith("blocked")) return "blocked";
  if (s.startsWith("review")) return "review";
  return "pending";
}

// ---------------------------------------------------------------------------
// Parse OPERATOR_TODO.md
// ---------------------------------------------------------------------------
function parseOperatorTodo() {
  const content = readFileSync(join(ROOT, "OPERATOR_TODO.md"), "utf8");
  const lines = content.split("\n");

  // "## OP-N — title   [open]" or "[done]"
  const opRe = /^## (OP-\d+) — (.+?)\s+\[(open|done)\]/;

  const open = [];
  const resolved = [];

  for (const line of lines) {
    const m = line.match(opRe);
    if (m) {
      const entry = { id: m[1], title: m[2].trim(), state: m[3] };
      if (m[3] === "open") {
        open.push(entry);
      } else {
        resolved.push(entry);
      }
    }
  }

  return { open, resolved };
}

// ---------------------------------------------------------------------------
// Strip ANSI escape codes
// ---------------------------------------------------------------------------
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping ANSI escape sequences from CLI output
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s) {
  return s.replace(ANSI_RE, "");
}

// ---------------------------------------------------------------------------
// Test counts — run forge test + vitest, fall back to static note
// ---------------------------------------------------------------------------
function getTestCounts() {
  let forgeCount = null;
  let vitestCount = null;

  // Forge: parse "Suite result: ok. N passed" lines to avoid double-counting summary table
  try {
    const out = execSync("forge test --root contracts --summary 2>&1", {
      cwd: ROOT,
      timeout: 120000,
      encoding: "utf8",
    });
    let total = 0;
    const suiteResultRe = /Suite result: ok\. (\d+) passed/g;
    let m = suiteResultRe.exec(out);
    while (m !== null) {
      total += Number.parseInt(m[1], 10);
      m = suiteResultRe.exec(out);
    }
    if (total > 0) forgeCount = total;
  } catch (_) {
    // ignore
  }

  // Vitest — use local binary directly (works cross-platform without pnpm in PATH)
  try {
    const vitestBin =
      process.platform === "win32"
        ? join(ROOT, "node_modules", ".bin", "vitest.cmd")
        : join(ROOT, "node_modules", ".bin", "vitest");
    let out = "";
    try {
      out = execSync(`"${vitestBin}" run`, {
        cwd: ROOT,
        timeout: 120000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      });
    } catch (e) {
      // execSync throws on non-zero exit; capture output anyway
      const err = e;
      out = (err.stdout || "") + (err.stderr || "");
    }
    const clean = stripAnsi(out);
    const m = clean.match(/Tests\s+(\d+) passed/);
    if (m) vitestCount = Number.parseInt(m[1], 10);
  } catch (_) {
    // ignore
  }

  return { forgeCount, vitestCount };
}

// ---------------------------------------------------------------------------
// Build dashboard
// ---------------------------------------------------------------------------
function buildDashboard(ranges, opTodo, testCounts, generatedDate) {
  const allTasks = ranges.flatMap((r) => r.tasks);
  const counts = { done: 0, "in-progress": 0, blocked: 0, review: 0, pending: 0 };
  for (const t of allTasks) {
    const s = normalizeStatus(t.status);
    counts[s] = (counts[s] || 0) + 1;
  }
  const total = allTasks.length;
  const donePct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const lines = [];
  lines.push(`_Generated: ${generatedDate}_`);
  lines.push("");

  // Overall summary
  lines.push("### Overall");
  lines.push("");
  lines.push("| Done | In-Progress | Blocked | Pending | Total | % Done |");
  lines.push("|------|-------------|---------|---------|-------|--------|");
  lines.push(
    `| ${counts.done} | ${counts["in-progress"] + (counts.review || 0)} | ${counts.blocked} | ${counts.pending} | ${total} | ${donePct}% |`,
  );
  lines.push("");

  // Per-range breakdown
  lines.push("### Per-Range Breakdown");
  lines.push("");
  lines.push("| Range | Area | Done | Total |");
  lines.push("|-------|------|------|-------|");
  for (const range of ranges) {
    const rangeDone = range.tasks.filter((t) => normalizeStatus(t.status) === "done").length;
    const rangeTotal = range.tasks.length;
    lines.push(`| ${range.id} | ${range.label} | ${rangeDone} | ${rangeTotal} |`);
  }
  lines.push("");

  // Test counts
  lines.push("### Test Counts");
  lines.push("");
  const forgeLine =
    testCounts.forgeCount !== null
      ? `${testCounts.forgeCount} forge tests`
      : "forge tests: run `pnpm run ci` for live count";
  const vitestLine =
    testCounts.vitestCount !== null
      ? `${testCounts.vitestCount} vitest tests`
      : "vitest tests: run `pnpm run ci` for live count";
  lines.push(`- ${forgeLine}`);
  lines.push(`- ${vitestLine}`);
  lines.push("");

  // OPERATOR_TODO summary
  lines.push("### Operator TODO");
  lines.push("");
  if (opTodo.open.length === 0) {
    lines.push("No open operator items.");
  } else {
    lines.push("**Open:**");
    for (const op of opTodo.open) {
      lines.push(`- **${op.id}**: ${op.title}`);
    }
  }
  lines.push(`_Resolved: ${opTodo.resolved.length}_`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Rewrite README.md between markers
// ---------------------------------------------------------------------------
function updateReadme(dashboard) {
  const readmePath = join(ROOT, "README.md");
  let content = readFileSync(readmePath, "utf8");

  const startMarker = "<!-- PROGRESS:START -->";
  const endMarker = "<!-- PROGRESS:END -->";

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      "README.md is missing <!-- PROGRESS:START --> or <!-- PROGRESS:END --> markers",
    );
  }

  const before = content.slice(0, startIdx + startMarker.length);
  const after = content.slice(endIdx);

  content = `${before}\n${dashboard}\n${after}`;
  writeFileSync(readmePath, content, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const ranges = parseTodo();
const opTodo = parseOperatorTodo();
const testCounts = getTestCounts();
const generatedDate = new Date().toISOString().slice(0, 10);
const dashboard = buildDashboard(ranges, opTodo, testCounts, generatedDate);

updateReadme(dashboard);

// Print the dashboard to stdout
console.log("<!-- PROGRESS:START -->");
console.log(dashboard);
console.log("<!-- PROGRESS:END -->");
console.log("");
console.log("README.md updated.");
