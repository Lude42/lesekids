// === file: server/db/sqlite.js ==============================================
// Small helper to create and configure a shared sqlite3 connection
import sqlite3 from "sqlite3";
export function getDB(dbPath) {
  sqlite3.verbose();
  console.log("SQLite DB:", dbPath);
  const db = new sqlite3.Database(dbPath);
  db.configure("busyTimeout", 3000);
  return db;
}