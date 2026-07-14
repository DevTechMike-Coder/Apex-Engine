import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

// Single pooled connection, reused across route handlers and the WS server.
// Next.js dev mode hot-reloads modules, so stash the pool on `globalThis` to
// avoid leaking a new pool (and exhausting Postgres max_connections) on
// every reload — same pattern as the standard Prisma-in-dev workaround.
declare global {
  // eslint-disable-next-line no-var
  var __apexPgPool: Pool | undefined;
}

// Local docker-compose Postgres/TimescaleDB has no SSL listener at all, so
// SSL must stay off there. Managed hosts (Timescale Cloud, Supabase, Neon,
// RDS, ...) require it. Rather than hardcode a host allowlist, infer it from
// the connection string: `sslmode=require` (Timescale Cloud's default
// connection string includes this) or a non-local hostname both imply SSL.
// `PGSSL=true|false` env var overrides the inference if you ever need to
// force one way or the other.
function resolveSsl(connectionString: string | undefined): PoolConfig["ssl"] {
  if (process.env.PGSSL === "false") return false;
  if (process.env.PGSSL === "true") return { rejectUnauthorized: false };
  if (!connectionString) return false;

  const isLocal = /\/\/(localhost|127\.0\.0\.1|::1)[:/]/.test(connectionString);
  const wantsSsl = /sslmode=require/i.test(connectionString) || !isLocal;

  // rejectUnauthorized: false because most managed providers (Timescale
  // Cloud included) sit behind certs that aren't in Node's default trust
  // store without also shipping the CA bundle. Still encrypts the
  // connection — it just skips CA verification.
  return wantsSsl ? { rejectUnauthorized: false } : false;
}

const pool =
  globalThis.__apexPgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: resolveSsl(process.env.DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__apexPgPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };