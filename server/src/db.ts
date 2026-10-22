import mysql from "mysql2/promise";
import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";
import { randomUUID } from "crypto";
import env from "./utils/envalid";

/** Connection settings, shared by the server and the setup script. */
export const dbConfig = {
  host: env.TIDB_HOST,
  port: env.TIDB_PORT,
  user: env.TIDB_USER,
  password: env.TIDB_PASSWORD,
  // TiDB Cloud only accepts secure (TLS) connections.
  ssl: env.TIDB_SSL
    ? { minVersion: "TLSv1.2" as const, rejectUnauthorized: true }
    : undefined,
  charset: "UTF8MB4_UNICODE_CI", // needed for Urdu and emoji
  timezone: "Z", // every date is stored and read as UTC
  // Safety: a request value that is an object can never turn into extra SQL.
  stringifyObjects: true,
};

export const pool: Pool = mysql.createPool({
  ...dbConfig,
  database: env.TIDB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

/** Anything that can run a query: the pool, or one connection of a transaction. */
export type Db = { query: (sql: string, values?: any) => Promise<any> };
const defaultDb = pool as unknown as Db;

/** SELECT: returns the rows. Values go in `params`, never inside the SQL text. */
export async function query<T = any>(
  sql: string,
  params: unknown[] = [],
  db: Db = defaultDb
): Promise<T[]> {
  const [rows] = await db.query(sql, params);
  return rows as T[];
}

/** SELECT that returns only the first row (or undefined). */
export async function queryOne<T = any>(
  sql: string,
  params: unknown[] = [],
  db: Db = defaultDb
): Promise<T | undefined> {
  const rows = await query<T>(sql, params, db);
  return rows[0];
}

/** INSERT / UPDATE / DELETE: returns { affectedRows, ... }. */
export async function exec(
  sql: string,
  params: unknown[] = [],
  db: Db = defaultDb
): Promise<ResultSetHeader> {
  const [result] = await db.query(sql, params);
  return result as ResultSetHeader;
}

/** Runs several statements all-or-nothing. */
export async function transaction<T>(work: (conn: Db) => Promise<T>): Promise<T> {
  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn as unknown as Db);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // the original error is the important one
    }
    throw err;
  } finally {
    conn.release();
  }
}

export const newId = (): string => randomUUID();
