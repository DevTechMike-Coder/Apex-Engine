import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Single pooled connection, reused across route handlers and the WS server.
// Next.js dev mode hot-reloads modules, so stash the pool on `globalThis` to
// avoid leaking a new pool (and exhausting Postgres max_connections) on
// every reload — same pattern as the standard Prisma-in-dev workaround.
declare global {
  // eslint-disable-next-line no-var
  var __apexPgPool: Pool | undefined;
}

const pool =
  globalThis.__apexPgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__apexPgPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
