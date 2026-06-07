#!/usr/bin/env node
// scripts/update-progress.mjs — Bombe progress dashboard generator
// Node ESM, no external dependencies.
// Usage: node scripts/update-progress.mjs
// Or:    pnpm progress
//
// Parses the klink-style TODO.md: active tasks are full "### T-NNN, ..." blocks
// with a "- Status:" line; completed tasks are one-liners in "## Done (archive)"
// of the form "- T-NNN done YYYY-MM-DD, title". Both shapes are counted.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Parse TODO.md (active blocks + archive one-liners)
// ---------------------------------------------------------------------------
function parseTodo() {
  const content = readFileSync(join(ROOT, "TODO.md"), "utf8");
  const lines = content.split("\n");

  // Active task block header: "### T-608, ..." or "### T-J05, ..."
  const activeHeaderRe = /^### (T-(?:\d{3}|J\d{2}))[,\s]/;
  const statusRe = /^- Status:\s*(.+)/;
  // Archive one-liner: "- T-001 done 2026-06-05, title" (also tolerates other statuses)
  const archiveRe = /^[-*]\s+(T-(?:\d{3}|J\d{2}))\s+(done|pending|blocked|review|in-progress)\b/i;

  const tasks = [];
  const seen = new Set();
  let currentTask = null;

  for (const line of lines) {
    const header = line.match(activeHeaderRe);
    if (header) {
      currentTask = { id: header[1], status: "pending" };
      if (!seen.has(header[1])) {
        tasks.push(currentTask);
        seen.add(header[1]);
      }
      continue;
    }

    if (currentTask) {
      const statusMatch = line.match(statusRe);
      if (statusMatch) {
        currentTask.status = statusMatch[1].trim();
        currentTask = null;
        continue;
      }
    }

    const archive = line.match(archiveRe);
    if (archive && !seen.has(archive[1])) {
      tasks.push({ id: archive[1], status: archive[2].toLowerCase() });
      seen.add(archive[1]);
    }
  }

  return tasks;
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

// Bucket a task id into its T-Nxx area for the per-range breakdown.
const AREA_LABELS = {
  "T-0xx": "T-0xx, ops / workflow / CI",
  "T-1xx": "T-1xx, contracts",
  "T-2xx": "T-2xx, shared + agent-sdk",
  "T-3xx": "T-3xx, reference agents",
  "T-4xx": "T-4xx, runner + indexer + gateway + DB",
  "T-5xx": "T-5xx, Plugboard",
  "T-6xx": "T-6xx, web app",
  "T-7xx": "T-7xx, testing",
  "T-8xx": "T-8xx, live seams + ship",
  "T-9xx": "T-9xx, stretch",
  "T-Jxx": "T-Jxx, submission gates",
};
const AREA_ORDER = Object.keys(AREA_LABELS);

function areaOf(id) {
  if (id.startsWith("T-J")) return "T-Jxx";
  const m = id.match(/^T-(\d)/);
  return m ? `T-${m[1]}xx` : "T-0xx";
}

// ---------------------------------------------------------------------------
// Parse OPERATOR_TODO.md ("## OP-N, title   [open|done]")
// ---------------------------------------------------------------------------
function parseOperatorTodo() {
  const content = readFileSync(join(ROOT, "OPERATOR_TODO.md"), "utf8");
  const lines = content.split("\n");

  // Tolerate comma or dash after the id; the file uses "## OP-5, title   [open]".
  const opRe = /^## (OP-\d+)[,\s].*?\[(open|done)\]/;

  const open = new Map();
  const resolved = new Map();

  for (const line of lines) {
    const m = line.match(opRe);
    if (m) {
      // Last occurrence wins (the file has a couple of duplicated entries).
      if (m[2] === "open") open.set(m[1], true);
      else resolved.set(m[1], true);
    }
  }
  // An id marked done anywhere is resolved, not open.
  for (const id of resolved.keys()) open.delete(id);

  return { open: [...open.keys()], resolved: [...resolved.keys()] };
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

  if (process.argv.includes("--no-tests") || process.env.PROGRESS_NO_TESTS) {
    return { forgeCount, vitestCount };
  }

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
function buildDashboard(tasks, opTodo, testCounts, generatedDate) {
  const counts = { done: 0, "in-progress": 0, blocked: 0, review: 0, pending: 0 };
  for (const t of tasks) {
    const s = normalizeStatus(t.status);
    counts[s] = (counts[s] || 0) + 1;
  }
  const total = tasks.length;
  const donePct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const lines = [];
  lines.push(`_Generated: ${generatedDate}_`);
  lines.push("");

  lines.push("### Overall");
  lines.push("");
  lines.push("| Done | In-Progress | Blocked | Pending | Total | % Done |");
  lines.push("|------|-------------|---------|---------|-------|--------|");
  lines.push(
    `| ${counts.done} | ${counts["in-progress"] + (counts.review || 0)} | ${counts.blocked} | ${counts.pending} | ${total} | ${donePct}% |`,
  );
  lines.push("");

  lines.push("### Per-Range Breakdown");
  lines.push("");
  lines.push("| Area | Done | Total |");
  lines.push("|------|------|-------|");
  const byArea = new Map();
  for (const t of tasks) {
    const a = areaOf(t.id);
    const rec = byArea.get(a) || { done: 0, total: 0 };
    rec.total += 1;
    if (normalizeStatus(t.status) === "done") rec.done += 1;
    byArea.set(a, rec);
  }
  for (const area of AREA_ORDER) {
    const rec = byArea.get(area);
    if (!rec) continue;
    lines.push(`| ${AREA_LABELS[area]} | ${rec.done} | ${rec.total} |`);
  }
  lines.push("");

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

  lines.push("### Operator Items");
  lines.push("");
  lines.push(
    `${opTodo.open.length} open, ${opTodo.resolved.length} resolved (tracked in OPERATOR_TODO.md).`,
  );

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
const tasks = parseTodo();
const opTodo = parseOperatorTodo();
const testCounts = getTestCounts();
const generatedDate = new Date().toISOString().slice(0, 10);
const dashboard = buildDashboard(tasks, opTodo, testCounts, generatedDate);

updateReadme(dashboard);

console.log("<!-- PROGRESS:START -->");
console.log(dashboard);
console.log("<!-- PROGRESS:END -->");
console.log("");
console.log("README.md updated.");
