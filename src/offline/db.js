// src/offline/db.js
import * as SQLite from "expo-sqlite";

const DB_NAME = "mitsuapp_offline.db";
let _db = null;

export function getDb() {
  if (!_db) {
    // ✅ SDK 54+ (nuevo API)
    if (typeof SQLite.openDatabaseSync === "function") {
      _db = SQLite.openDatabaseSync(DB_NAME);
    } else if (typeof SQLite.openDatabase === "function") {
      // fallback si tu expo-sqlite aún trae openDatabase (algunas versiones)
      _db = SQLite.openDatabase(DB_NAME);
    } else {
      throw new Error(
        "expo-sqlite: no existe openDatabaseSync/openDatabase. Revisa instalación de expo-sqlite."
      );
    }
  }
  return _db;
}

async function execAsync(sql) {
  const db = getDb();
  if (typeof db.execAsync === "function") {
    return db.execAsync(sql);
  }
  // fallback legacy-style si existiera (raro), pero por si acaso:
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        [],
        () => resolve(true),
        (_, err) => {
          reject(err);
          return true;
        }
      );
    });
  });
}

async function runAsync(sql, params = []) {
  const db = getDb();
  if (typeof db.runAsync === "function") {
    return db.runAsync(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, err) => {
          reject(err);
          return true;
        }
      );
    });
  });
}

async function getFirstAsync(sql, params = []) {
  const db = getDb();
  if (typeof db.getFirstAsync === "function") {
    return db.getFirstAsync(sql, params);
  }
  const res = await getAllAsync(sql, params);
  return Array.isArray(res) && res.length ? res[0] : null;
}

async function getAllAsync(sql, params = []) {
  const db = getDb();
  if (typeof db.getAllAsync === "function") {
    return db.getAllAsync(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => {
          const rows = [];
          for (let i = 0; i < result.rows.length; i++) rows.push(result.rows.item(i));
          resolve(rows);
        },
        (_, err) => {
          reject(err);
          return true;
        }
      );
    });
  });
}

/* =========================
   Init DB (tablas)
   ========================= */
export async function initDb() {
  // ✅ Cache KV (JSON)
  await execAsync(`
    CREATE TABLE IF NOT EXISTS kv_cache (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // ✅ Outbox (pendientes)
  await execAsync(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      request TEXT NOT NULL,
      dedupe_key TEXT,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_error TEXT
    );
  `);

  // ✅ Tokens / auth (KV simple)
  await execAsync(`
    CREATE TABLE IF NOT EXISTS auth_kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

/* =========================
   KV Cache helpers
   ========================= */
export async function cacheSet(key, jsonValue) {
  const value = JSON.stringify(jsonValue ?? null);
  const now = Date.now();

  await runAsync(
    `INSERT INTO kv_cache (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;`,
    [key, value, now]
  );

  return true;
}

export async function cacheGet(key) {
  const row = await getFirstAsync(
    `SELECT value, updated_at FROM kv_cache WHERE key=?;`,
    [key]
  );

  if (!row) return null;

  try {
    return { value: JSON.parse(row.value), updatedAt: row.updated_at };
  } catch {
    return { value: null, updatedAt: row.updated_at };
  }
}

export async function cacheDelete(key) {
  await runAsync(`DELETE FROM kv_cache WHERE key=?;`, [key]);
}

/* =========================
   Auth KV helpers
   ========================= */
export async function authSet(key, value) {
  await runAsync(
    `INSERT INTO auth_kv (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    [key, String(value ?? "")]
  );
}

export async function authGet(key) {
  const row = await getFirstAsync(`SELECT value FROM auth_kv WHERE key=?;`, [key]);
  return row ? row.value : null;
}

export async function authDel(keys = []) {
  for (const k of keys) {
    await runAsync(`DELETE FROM auth_kv WHERE key=?;`, [k]);
  }
}

/* =========================
   Outbox helpers
   ========================= */
export async function outboxAdd(job) {
  const now = Date.now();

  // dedupe: si existe dedupe_key pendiente/sending, no insertes otro
  if (job?.dedupeKey) {
    const row = await getFirstAsync(
      `SELECT id FROM outbox WHERE dedupe_key=? AND status IN ('pending','sending') LIMIT 1;`,
      [job.dedupeKey]
    );
    if (row?.id) return null;
  }

  await runAsync(
    `INSERT INTO outbox (id, type, request, dedupe_key, status, attempts, created_at, last_error)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL);`,
    [
      job.id,
      job.type,
      JSON.stringify(job.request),
      job.dedupeKey || null,
      now,
    ]
  );

  return job.id;
}

export async function outboxList(limit = 20) {
  const rows = await getAllAsync(
    `SELECT * FROM outbox
     WHERE status IN ('pending','error')
     ORDER BY created_at ASC
     LIMIT ?;`,
    [limit]
  );

  return (rows || []).map((r) => ({
    ...r,
    request: safeParse(r.request),
  }));
}

export async function outboxMarkSending(id) {
  await runAsync(`UPDATE outbox SET status='sending' WHERE id=?;`, [id]);
}

export async function outboxMarkSent(id) {
  await runAsync(`UPDATE outbox SET status='sent', last_error=NULL WHERE id=?;`, [id]);
}

export async function outboxMarkError(id, errText) {
  await runAsync(
    `UPDATE outbox
     SET status='error',
         attempts = attempts + 1,
         last_error = ?
     WHERE id=?;`,
    [String(errText || "error"), id]
  );
}

export async function outboxDeleteSent(olderThanMs = 7 * 24 * 3600 * 1000) {
  const cutoff = Date.now() - olderThanMs;
  await runAsync(`DELETE FROM outbox WHERE status='sent' AND created_at < ?;`, [cutoff]);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
// ✅ Parche/migración: corregir URLs guardadas en outbox
export async function outboxReplaceRequestUrl(oldUrl, newUrl) {
  const rows = await getAllAsync(
    `SELECT id, request FROM outbox
     WHERE status IN ('pending','error','sending');`,
    []
  );

  let changed = 0;

  for (const r of rows || []) {
    const req = safeParse(r.request);
    if (!req?.url) continue;

    if (String(req.url).trim() === String(oldUrl).trim()) {
      req.url = newUrl;

      await runAsync(`UPDATE outbox SET request=? WHERE id=?;`, [
        JSON.stringify(req),
        r.id,
      ]);

      changed += 1;
    }
  }

  return { ok: true, changed };
}
