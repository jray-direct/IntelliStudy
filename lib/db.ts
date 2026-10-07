import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";

export type DB = BetterSQLite3Database<typeof schema>;

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.INTELLISTUDY_DB ?? path.join(DATA_DIR, "intellistudy.db");

const globalForDb = globalThis as unknown as { __intellistudyDb?: DB };

function createDb(): DB {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  return db;
}

export const db: DB = (globalForDb.__intellistudyDb ??= createDb());
export { schema };
