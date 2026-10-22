/*
 * Creates the Sukhanak tables in your TiDB Cloud database.
 * Usage:  npm run db:setup     (fill the TIDB_* values in .env first)
 * It is safe to run again - existing tables are left as they are.
 */
import { config } from "dotenv";
config();
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import env from "../utils/envalid";
import { dbConfig } from "../db";

async function main() {
  const dbName = env.TIDB_DATABASE;
  if (!/^[A-Za-z0-9_]+$/.test(dbName))
    throw new Error("TIDB_DATABASE can only use letters, numbers and _");

  const conn = await mysql.createConnection(dbConfig);
  try {
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    } catch (err: any) {
      console.log(
        `Could not create database "${dbName}" (${err.message}). ` +
          "Trying to use it anyway - if it fails, create it in TiDB Cloud or set TIDB_DATABASE=test."
      );
    }
    await conn.query(`USE \`${dbName}\``);

    const file = path.join(__dirname, "..", "..", "schema.sql");
    const statements = fs
      .readFileSync(file, "utf8")
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((text) => text.trim())
      .filter(Boolean);
    for (const statement of statements) await conn.query(statement);

    const [tables] = await conn.query("SHOW TABLES");
    console.log(`Done. ${(tables as any[]).length} tables are ready in "${dbName}".`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Database setup failed:", err.message);
  process.exit(1);
});
