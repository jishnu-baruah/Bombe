/**
 * drizzle.config.ts — Drizzle Kit configuration for @bombe/db.
 *
 * Used by `drizzle-kit generate` to produce migrations from the schema.
 * The migrations are committed under packages/db/migrations/.
 *
 * Dialect: postgresql (pglite speaks the Postgres wire protocol).
 */

import type { Config } from "drizzle-kit";

const config: Config = {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
};

export default config;
