/**
 * skill.ts — Skill snapshotting and hash utilities. (PRD §6.8, T-503)
 *
 * `skillHash(content)` = keccak256 of the UTF-8 bytes of the skill file text,
 *   computed via hashCanonical on a canonical wrapper to ensure determinism.
 *
 * Mock mode pins epoch-0. Snapshots never evolve in mock — demo determinism.
 *
 * No `any`. TypeScript strict.
 */

import { hashCanonical } from "@bombe/shared";
import type { SkillSnapshot } from "./types.js";

/**
 * skillHash — keccak256 of the UTF-8 text content of a skill file.
 *
 * We wrap the raw string in a canonical object `{ content }` so that
 * hashCanonical (which sorts object keys) produces a stable hash from
 * the file content alone. The wrapper key is fixed, so the hash is
 * purely a function of the string content.
 */
export function skillHash(content: string): `0x${string}` {
  return hashCanonical({ content });
}

/**
 * makeEpochSnapshot — creates an immutable SkillSnapshot from content.
 *
 * @param epoch   0-based epoch index.
 * @param content Full text of the skill file.
 */
export function makeEpochSnapshot(epoch: number, content: string): SkillSnapshot {
  return {
    epoch,
    skillHash: skillHash(content),
    content,
  };
}
