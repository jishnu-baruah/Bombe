/**
 * compute-skill-hash.ts — Helper to compute the epoch-0 skill hash.
 * Run via: pnpm --filter @bombe/plugboard exec node --import tsx/esm src/compute-skill-hash.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { skillHash } from "./skill.js";

const skillPath = resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../agents/plugboard/bombe-attestor.skill.md",
);

const content = readFileSync(skillPath, "utf-8");
const hash = skillHash(content);
console.log("Epoch-0 skill hash:", hash);
