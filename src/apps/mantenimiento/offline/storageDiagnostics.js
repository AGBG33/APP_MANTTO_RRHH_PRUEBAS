import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDb } from "./db";

const MB = 1024 * 1024;

function approxBytes(value) {
  if (value === null || value === undefined) return 0;

  const text = String(value);

  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).length;
    }
  } catch {}

  return text.length * 2;
}

function formatMB(bytes) {
  return `${(Number(bytes || 0) / MB).toFixed(2)} MB`;
}

function classifyKey(key) {
  const k = String(key || "");

  if (k === "sapQueue:v3" || k.startsWith("sapQueue:")) {
    return "sapQueue";
  }

  if (k.startsWith("ordenesTecnico:detail:")) {
    return "detallesOrdenes";
  }

  if (k.startsWith("ordenesTecnico:list:")) {
    return "listasOrdenes";
  }

  if (k.startsWith("ordenesTecnico:meta:")) {
    return "metaOrdenes";
  }

  if (
    k === "token" ||
    k === "token_expires_at" ||
    k === "user" ||
    k === "local_session_until" ||
    k === "sso_code_verifier" ||
    k === "sso_started_at"
  ) {
    return "auth";
  }

  if (k.startsWith("activeEquipment:")) {
    return "activeEquipment";
  }

  return "otros";
}

async function diagnoseAsyncStorage() {
  const keys = await AsyncStorage.getAllKeys();

  const groups = {};
  const largest = [];
  let totalReadableBytes = 0;
  let readErrors = 0;

  /*
   * Leemos una clave por vez.
   *
   * Esto es intencional:
   * NO usamos multiGet de cientos de valores porque justamente
   * estamos investigando un almacenamiento que puede estar muy grande.
   */
  for (const key of keys) {
    try {
      const value = await AsyncStorage.getItem(key);

      const bytes =
        approxBytes(key) +
        approxBytes(value);

      totalReadableBytes += bytes;

      const group = classifyKey(key);

      if (!groups[group]) {
        groups[group] = {
          keys: 0,
          bytes: 0,
        };
      }

      groups[group].keys += 1;
      groups[group].bytes += bytes;

      largest.push({
        key,
        bytes,
      });
    } catch (error) {
      readErrors += 1;

      console.log(
        "[STORAGE][DIAG] No se pudo leer key:",
        key,
        error?.message || error
      );
    }
  }

  largest.sort(
    (a, b) => b.bytes - a.bytes
  );

  const groupsFormatted = {};

  Object.entries(groups).forEach(
    ([name, info]) => {
      groupsFormatted[name] = {
        keys: info.keys,
        bytes: info.bytes,
        mb: formatMB(info.bytes),
      };
    }
  );

  const topKeys = largest
    .slice(0, 15)
    .map((item) => ({
      key: item.key,
      bytes: item.bytes,
      mb: formatMB(item.bytes),
    }));

  return {
    totalKeys: keys.length,
    totalReadableBytes,
    totalReadableMB:
      formatMB(totalReadableBytes),
    readErrors,
    groups: groupsFormatted,
    topKeys,
  };
}

async function getSqliteStats() {
  const db = getDb();

  if (
    !db ||
    typeof db.getFirstAsync !== "function"
  ) {
    return {
      available: false,
      reason: "getFirstAsync no disponible",
    };
  }

  const result = {
    available: true,
  };

  try {
    const auth = await db.getFirstAsync(`
      SELECT
        COUNT(*) AS count,
        COALESCE(
          SUM(
            LENGTH(CAST(key AS BLOB)) +
            LENGTH(CAST(value AS BLOB))
          ),
          0
        ) AS bytes
      FROM auth_kv;
    `);

    result.auth_kv = {
      count: Number(auth?.count || 0),
      bytes: Number(auth?.bytes || 0),
      mb: formatMB(auth?.bytes || 0),
    };
  } catch (error) {
    result.auth_kv = {
      error: error?.message || String(error),
    };
  }

  try {
    const outbox = await db.getFirstAsync(`
      SELECT
        COUNT(*) AS count,

        COALESCE(
          SUM(
            LENGTH(CAST(id AS BLOB)) +
            LENGTH(CAST(type AS BLOB)) +
            LENGTH(CAST(request AS BLOB)) +
            COALESCE(
              LENGTH(CAST(dedupe_key AS BLOB)),
              0
            ) +
            LENGTH(CAST(status AS BLOB)) +
            COALESCE(
              LENGTH(CAST(last_error AS BLOB)),
              0
            )
          ),
          0
        ) AS bytes,

        SUM(
          CASE
            WHEN status = 'pending'
            THEN 1 ELSE 0
          END
        ) AS pending,

        SUM(
          CASE
            WHEN status = 'error'
            THEN 1 ELSE 0
          END
        ) AS error,

        SUM(
          CASE
            WHEN status = 'sending'
            THEN 1 ELSE 0
          END
        ) AS sending,

        SUM(
          CASE
            WHEN status = 'sent'
            THEN 1 ELSE 0
          END
        ) AS sent

      FROM outbox;
    `);

    result.outbox = {
      count: Number(outbox?.count || 0),
      bytes: Number(outbox?.bytes || 0),
      mb: formatMB(outbox?.bytes || 0),

      pending: Number(outbox?.pending || 0),
      error: Number(outbox?.error || 0),
      sending: Number(outbox?.sending || 0),
      sent: Number(outbox?.sent || 0),
    };
  } catch (error) {
    result.outbox = {
      error: error?.message || String(error),
    };
  }

  try {
    const cache = await db.getFirstAsync(`
      SELECT
        COUNT(*) AS count,

        COALESCE(
          SUM(
            LENGTH(CAST(key AS BLOB)) +
            LENGTH(CAST(value AS BLOB))
          ),
          0
        ) AS bytes

      FROM kv_cache;
    `);

    result.kv_cache = {
      count: Number(cache?.count || 0),
      bytes: Number(cache?.bytes || 0),
      mb: formatMB(cache?.bytes || 0),
    };
  } catch (error) {
    result.kv_cache = {
      error: error?.message || String(error),
    };
  }

  return result;
}

export async function logStorageDiagnostics() {
  console.log(
    "=========================================="
  );

  console.log(
    "[STORAGE][DIAG] INICIANDO DIAGNÓSTICO"
  );

  console.log(
    "=========================================="
  );

  try {
    const asyncStorage =
      await diagnoseAsyncStorage();

    console.log(
      "[STORAGE][ASYNC][RESUMEN]",
      JSON.stringify(
        {
          totalKeys:
            asyncStorage.totalKeys,

          totalReadableMB:
            asyncStorage.totalReadableMB,

          readErrors:
            asyncStorage.readErrors,

          groups:
            asyncStorage.groups,
        },
        null,
        2
      )
    );

    console.log(
      "[STORAGE][ASYNC][TOP KEYS]",
      JSON.stringify(
        asyncStorage.topKeys,
        null,
        2
      )
    );
  } catch (error) {
    console.log(
      "[STORAGE][ASYNC][ERROR]",
      error?.message || error
    );
  }

  try {
    const sqlite =
      await getSqliteStats();

    console.log(
      "[STORAGE][SQLITE]",
      JSON.stringify(
        sqlite,
        null,
        2
      )
    );
  } catch (error) {
    console.log(
      "[STORAGE][SQLITE][ERROR]",
      error?.message || error
    );
  }

  console.log(
    "=========================================="
  );

  console.log(
    "[STORAGE][DIAG] FINALIZADO"
  );

  console.log(
    "=========================================="
  );
}