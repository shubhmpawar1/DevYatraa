import pg from "pg";
import "dotenv/config";

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates (avoids timezone shifts).
pg.types.setTypeParser(1082, (v: string) => v);

// node-postgres (pg) suits this long-running Express server. On Neon, DATABASE_URL is the
// pooled (-pooler) string; the app uses no session-level SQL, so PgBouncer pooling is safe.
// Neon strings use sslmode=require, which pg treats as verify-full (and warns about); say so explicitly.
const url = (process.env.DATABASE_URL ?? "postgres://localhost:5432/jobready").replace("sslmode=require", "sslmode=verify-full");

export const pool = new pg.Pool({ connectionString: url });

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await q<T>(text, params);
  return rows[0];
}
