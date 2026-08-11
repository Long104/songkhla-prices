import { neon } from "@neondatabase/serverless";
import { drizzle as neonDrizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { Pool } from "pg";
import { drizzle as nodeDrizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

/**
 * Lazily creates the Drizzle client.
 *
 * Driver switch:
 *  - DATABASE_URL pointing at localhost/127.0.0.1 (Docker Postgres) → node-postgres (pg)
 *  - any other DATABASE_URL (Neon serverless HTTP) → @neondatabase/serverless
 *
 * Returns null when DATABASE_URL is missing so the app still builds and
 * renders (with empty states) in environments without a live database.
 */
export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    const pool = new Pool({ connectionString: url });
    return nodeDrizzle({ client: pool, schema });
  }
  const sql = neon(url);
  return neonDrizzle({ client: sql, schema });
}