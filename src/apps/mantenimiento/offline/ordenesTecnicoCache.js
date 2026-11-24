import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
// Ventana requerida: 15 días antes y 1 día después
export const OFFLINE_DAYS_BEFORE = 15;
export const OFFLINE_DAYS_AFTER = 1;
// Tiempo durante el cual la información se considera actualizada.
// 60 minutos × 60 segundos × 1000 milisegundos = 1 hora.
export const ORDENES_CACHE_TTL_MS = 60 * 60 * 1000;

const LIST_KEY = (userEmail) => `ordenesTecnico:list:${userEmail || "unknown"}`;
const DETAIL_KEY_PREFIX = "ordenesTecnico:detail:";
const DETAIL_KEY = (orderId) =>
  `${DETAIL_KEY_PREFIX}${String(orderId || "").trim()}`;
const META_KEY = (userEmail) => `ordenesTecnico:meta:${userEmail || "unknown"}`;

const LIST_FILE_DIR =
  `${FileSystem.documentDirectory}ordenesTecnicoLists/`;

function normalizeUserEmail(userEmail) {
  return String(userEmail || "unknown")
    .trim()
    .toLowerCase();
}

function safeUserFileName(userEmail) {
  return encodeURIComponent(
    normalizeUserEmail(userEmail)
  ).replace(/%/g, "_");
}

function LIST_FILE(userEmail) {
  return `${LIST_FILE_DIR}${safeUserFileName(
    userEmail
  )}.json`;
}

async function ensureListDirectory() {
  const info = await FileSystem.getInfoAsync(
    LIST_FILE_DIR
  );

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(
      LIST_FILE_DIR,
      {
        intermediates: true,
      }
    );
  }
}

/*
 * Elimina solamente las COPIAS antiguas de la lista
 * del técnico que estaban guardadas en AsyncStorage.
 *
 * NO toca:
 * - detalles
 * - sapQueue
 * - status patches
 * - formularios
 * - auth
 */
async function removeLegacyOrdenesListStorage(
  userEmail
) {
  try {
    const email =
      normalizeUserEmail(userEmail);

    const keys =
      await AsyncStorage.getAllKeys();

    const toDelete = keys.filter((key) => {
      const lower =
        String(key || "").toLowerCase();

      const isOldList =
        lower ===
        `ordenestecnico:list:${email}`;

      const isOldChunk =
        lower.startsWith(
          "ordenestecnico:listchunk:"
        ) &&
        lower.includes(email);

      return isOldList || isOldChunk;
    });

    if (toDelete.length) {
      await AsyncStorage.multiRemove(
        toDelete
      );

      console.log(
        "[OFFLINE] Lista antigua de AsyncStorage eliminada:",
        {
          userEmail: email,
          keysRemoved: toDelete.length,
        }
      );
    }
  } catch (error) {
    /*
     * Esta limpieza no es crítica.
     * Si falla, no impedimos que funcione la lista nueva.
     */
    console.log(
      "[OFFLINE] No se pudo limpiar lista legacy:",
      error?.message || error
    );
  }
}
/*
 * El bloqueo vive solamente durante la ejecución actual de la app.
 * Si Android informa SQLITE_FULL, los siguientes intentos de guardar
 * detalles terminan inmediatamente para que la precarga no insista
 * cientos de veces sobre un almacenamiento que ya está lleno.
 *
 * Al cerrar y abrir nuevamente la app, el bloqueo vuelve a comenzar
 * desactivado. No se borra información funcional ni se cambia la
 * ventana offline.
 */
let detailWritesBlockedByStorage = false;
let storageFullWasLogged = false;
const listMemoryFallback = new Map();

export function isStorageFullError(error) {
  const errorCode = String(
    error?.code ??
      error?.nativeErrorCode ??
      "",
  ).toLowerCase();

  const message = String(
    error?.message ||
      error ||
      "",
  ).toLowerCase();

  return (
    errorCode === "13" ||
    errorCode.includes("sqlite_full") ||
    message.includes("sqlite_full") ||
    message.includes("database or disk is full") ||
    message.includes("code 13")
  );
}

function blockDetailWritesByStorage(error, source) {
  detailWritesBlockedByStorage = true;

  if (storageFullWasLogged) {
    return;
  }

  storageFullWasLogged = true;

  console.log(
    "[OFFLINE] Almacenamiento lleno. Se detienen los guardados de detalles durante esta ejecución:",
    {
      source,
      error: error?.message || String(error || "SQLITE_FULL"),
    },
  );
}

export function areOrdenTecnicoDetailWritesBlocked() {
  return detailWritesBlockedByStorage;
}

// --- helpers fecha ---
const atStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const ymd = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function parseSapDate(value) {
  if (!value) return null;

  // /Date(1771891200000)/
  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }

  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Comparación UTC-safe
const getUtcYmd = (d) => {
  if (!d) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function buildOfflineWindow(baseDate = new Date()) {
  const base = atStartOfDay(baseDate);
  const start = addDays(base, -OFFLINE_DAYS_BEFORE);
  const end = addDays(base, OFFLINE_DAYS_AFTER);
  return { start, end, startStr: ymd(start), endStr: ymd(end) };
}

/**
 * TRUE si una orden cae dentro de la ventana (usa start_date)
 */
export function isOrderInWindow(order, window) {
  if (!order || !window?.start || !window?.end) return false;

  const d = parseSapDate(order?.start_date);
  if (!d) return false;

  const ds = getUtcYmd(d);
  const s = getUtcYmd(window.start);
  const e = getUtcYmd(window.end);

  if (s && ds < s) return false;
  if (e && ds > e) return false;
  return true;
}

/**
 * Filtra órdenes por ventana
 */
export function filterOrdenesByWindow(ordenes = [], start, end) {
  const s = start ? getUtcYmd(start) : null;
  const e = end ? getUtcYmd(end) : null;

  return (ordenes || []).filter((it) => {
    const d = parseSapDate(it?.start_date);
    if (!d) return false;
    const ds = getUtcYmd(d);
    if (s && ds < s) return false;
    if (e && ds > e) return false;
    return true;
  });
}

/**
 * Guarda lista offline (YA FILTRADA)
 */
export async function saveOrdenesTecnicoList(userEmail, ordenes, window) {
  const payload = {
    updatedAt: Date.now(),
    window: window
      ? {
          start: window.start?.toISOString?.() || null,
          end: window.end?.toISOString?.() || null,
          startStr: window.startStr,
          endStr: window.endStr,
        }
      : null,
    data: Array.isArray(ordenes) ? ordenes : [],
  };

  const listKey = LIST_KEY(userEmail);

  /*
   * Siempre conservamos una copia en memoria durante la ejecución actual.
   * Si por cualquier motivo la escritura física falla, la UI todavía
   * puede seguir trabajando con la lista recién obtenida desde SAP.
   */
  listMemoryFallback.set(listKey, payload);

  try {
    await ensureListDirectory();

    const fileUri = LIST_FILE(userEmail);
    const raw = JSON.stringify(payload);

    /*
     * 1. Guardamos la lista grande como archivo.
     *
     * Ya NO se guarda la lista completa dentro de AsyncStorage para evitar:
     * - Row too big to fit into CursorWindow
     * - crecimiento innecesario de la base de AsyncStorage
     * - SQLITE_FULL por una lista grande
     */
    await FileSystem.writeAsStringAsync(
      fileUri,
      raw,
      {
        encoding: FileSystem.EncodingType.UTF8,
      },
    );

    /*
     * 2. Validamos que el archivo recién escrito realmente pueda leerse
     * y que contenga una estructura válida ANTES de borrar la copia vieja.
     */
    const validationRaw = await FileSystem.readAsStringAsync(
      fileUri,
      {
        encoding: FileSystem.EncodingType.UTF8,
      },
    );

    const validationPayload = validationRaw
      ? JSON.parse(validationRaw)
      : null;

    if (
      !validationPayload ||
      !Array.isArray(validationPayload.data)
    ) {
      throw new Error(
        "La lista offline guardada no pasó la validación.",
      );
    }

    /*
     * 3. Sólo después de tener una copia nueva válida eliminamos
     * las versiones antiguas de la lista guardadas en AsyncStorage.
     *
     * Esto incluye:
     * - ordenesTecnico:list:<usuario>
     * - ordenesTecnico:listChunk:<usuario>:N
     *
     * NO se eliminan detalles, colas, estatus, formularios ni auth.
     */
    await removeLegacyOrdenesListStorage(userEmail);

    /*
     * 4. En AsyncStorage sólo dejamos metadata pequeña.
     */
    await AsyncStorage.setItem(
      META_KEY(userEmail),
      JSON.stringify({
        lastSyncAt: payload.updatedAt,
      }),
    );

    console.log(
      "[OFFLINE] Lista técnico guardada en archivo:",
      {
        userEmail: normalizeUserEmail(userEmail),
        orders: payload.data.length,
        characters: raw.length,
        fileUri,
      },
    );

    return true;
  } catch (error) {
    /*
     * Si el dispositivo realmente se quedó sin espacio,
     * detenemos nuevas escrituras pesadas de detalles durante
     * esta ejecución, pero conservamos la lista en memoria.
     */
    if (isStorageFullError(error)) {
      blockDetailWritesByStorage(
        error,
        "saveOrdenesTecnicoList",
      );

      return false;
    }

    console.log(
      "[OFFLINE] Error guardando lista técnico:",
      error?.message || error,
    );

    /*
     * No lanzamos el error porque la lista recién obtenida
     * sigue disponible mediante listMemoryFallback.
     */
    return false;
  }
}

export async function loadOrdenesTecnicoList(userEmail) {
  const listKey = LIST_KEY(userEmail);
  const memoryPayload = listMemoryFallback.get(listKey) || null;

  /*
   * PRIMERA OPCIÓN:
   * leemos desde el nuevo archivo fuera de AsyncStorage.
   */
  try {
    const fileUri = LIST_FILE(userEmail);
    const info = await FileSystem.getInfoAsync(fileUri);

    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(
        fileUri,
        {
          encoding: FileSystem.EncodingType.UTF8,
        },
      );

      const filePayload = raw
        ? JSON.parse(raw)
        : null;

      if (
        filePayload &&
        Array.isArray(filePayload.data)
      ) {
        /*
         * Si durante esta misma ejecución existe una versión
         * todavía más reciente en memoria, usamos esa.
         */
        if (
          memoryPayload &&
          Number(memoryPayload?.updatedAt || 0) >=
            Number(filePayload?.updatedAt || 0)
        ) {
          return memoryPayload;
        }

        return filePayload;
      }
    }
  } catch (error) {
    console.log(
      "[OFFLINE] No se pudo leer lista desde archivo:",
      {
        userEmail: normalizeUserEmail(userEmail),
        error: error?.message || error,
      },
    );
  }

  /*
   * SEGUNDA OPCIÓN:
   * compatibilidad con instalaciones anteriores.
   *
   * Si todavía existe la lista antigua en AsyncStorage intentamos
   * leerla. Esto permite una transición segura hasta que SAP
   * descargue nuevamente la lista y saveOrdenesTecnicoList()
   * la migre al nuevo archivo.
   */
  try {
    const raw = await AsyncStorage.getItem(listKey);
    const storedPayload = raw
      ? JSON.parse(raw)
      : null;

    if (
      memoryPayload &&
      Number(memoryPayload?.updatedAt || 0) >=
        Number(storedPayload?.updatedAt || 0)
    ) {
      return memoryPayload;
    }

    return storedPayload;
  } catch (error) {
    /*
     * Un "Row too big to fit into CursorWindow" en una lista legacy
     * ya no rompe la aplicación. Simplemente usamos memoria si existe
     * y dejamos que la próxima sincronización online cree el archivo nuevo.
     */
    console.log(
      "[OFFLINE] Lista antigua no legible:",
      {
        userEmail: normalizeUserEmail(userEmail),
        error: error?.message || error,
      },
    );

    return memoryPayload;
  }
}

export async function getOrdenesTecnicoLastSync(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(META_KEY(userEmail));
    const obj = raw ? JSON.parse(raw) : null;
    return obj?.lastSyncAt ?? null;
  } catch {
    return null;
  }
}

/**
 * Indica si una fecha de caché todavía está vigente.
 *
 * updatedAt:
 *   Fecha guardada como milisegundos con Date.now().
 *
 * ttlMs:
 *   Tiempo máximo que puede tener la información.
 *   Por defecto es una hora.
 */
export function isCacheFresh(
  updatedAt,
  ttlMs = ORDENES_CACHE_TTL_MS,
) {
  const timestamp = Number(updatedAt || 0);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }

  const cacheAge = Date.now() - timestamp;

  return cacheAge >= 0 && cacheAge < ttlMs;
}

/**
 * Revisa si la lista de órdenes de un técnico tiene menos de una hora.
 */
export async function isOrdenesTecnicoListFresh(
  userEmail,
  ttlMs = ORDENES_CACHE_TTL_MS,
) {
  const cached = await loadOrdenesTecnicoList(userEmail);

  return isCacheFresh(cached?.updatedAt, ttlMs);
}

/**
 * Revisa si el detalle guardado de una orden tiene menos de una hora.
 */
export async function isOrdenTecnicoDetailFresh(
  orderId,
  ttlMs = ORDENES_CACHE_TTL_MS,
) {
  const cached = await loadOrdenTecnicoDetail(orderId);

  return isCacheFresh(cached?.updatedAt, ttlMs);
}

/* =========================
   ✅ Detalle (con límite)
   ========================= */

function estimateBytes(str) {
  return (str?.length || 0) * 2; // aproximado
}

const MAX_DETAIL_BYTES = 350_000; // ~350KB por detalle (ajustable)

/*
 * Estos límites aplican solamente a la precarga de detalles pesados.
 * La lista del periodo offline se sigue guardando completa.
 */
export const MAX_DETAIL_CACHE_ITEMS = 140;
export const MAX_DETAIL_CACHE_BYTES = 8_000_000;

/**
 * Obtiene el uso aproximado de la caché de detalles sin cargar todos
 * los registros en una sola operación. Los bloques pequeños evitan
 * crear una respuesta demasiado grande en Android.
 */
export async function getOrdenesTecnicoDetailCacheUsage() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const detailKeys = keys.filter((key) =>
      key.startsWith(DETAIL_KEY_PREFIX),
    );

    let estimatedBytes = 0;
    const batchSize = 40;

    for (let index = 0; index < detailKeys.length; index += batchSize) {
      const batch = detailKeys.slice(index, index + batchSize);
      const rows = await AsyncStorage.multiGet(batch);

      rows.forEach(([, raw]) => {
        estimatedBytes += estimateBytes(raw || "");
      });
    }

    return {
      ok: true,
      count: detailKeys.length,
      estimatedBytes,
      orderIds: detailKeys
        .map((key) => key.slice(DETAIL_KEY_PREFIX.length))
        .filter(Boolean),
    };
  } catch (error) {
    if (isStorageFullError(error)) {
      blockDetailWritesByStorage(
        error,
        "getOrdenesTecnicoDetailCacheUsage",
      );
    }

    return {
      ok: false,
      count: 0,
      estimatedBytes: 0,
      orderIds: [],
      error: error?.message || String(error),
    };
  }
}

/**
 * Adelgaza el detalle para que no explote storage
 * Guardamos lo necesario para UI offline.
 */
function sanitizeDetailForCache(detail) {
  if (!detail || typeof detail !== "object") return null;

  const ops = Array.isArray(detail?.operaciones) ? detail.operaciones : [];

  const opsSlim = ops.map((op) => ({
    id: op?.id,
    Usr02: op?.Usr02 ?? op?.usr02,
    Activity: op?.Activity ?? op?.activity ?? op?.Vornr,
    //Cambios agregados por lo del campo de subactivity Miguel Angel 04/06/2026
    //SubActivity: op?.SubActivity ?? op?.subactivity ?? op?.Uvorn,
    Description: op?.Description ?? op?.description ?? op?.Ltxa1,
    StandardTextKey: op?.StandardTextKey ?? op?.standardTextKey,
    estatus: op?.estatus,
    worked_ms: op?.worked_ms,
    last_resume_at: op?.last_resume_at,
    Strttimcon: op?.Strttimcon,
    Fintimcons: op?.Fintimcons,
    paused_at: op?.paused_at,
    pause_motivo: op?.pause_motivo,
  }));

  // ✅ NUEVO: conservar partners mínimos para pantallas offline como TBMK
  const partnersSlim = Array.isArray(detail?.partners)
    ? detail.partners.map((p) => ({
        PartnRole: p?.PartnRole ?? null,
        PartnRoleOld: p?.PartnRoleOld ?? null,
        Partner: p?.Partner ?? null,
        PartnerOld: p?.PartnerOld ?? null,
        Name1: p?.Name1 ?? null,
        Name2: p?.Name2 ?? null,
        Mail1: p?.Mail1 ?? null,
        Mail2: p?.Mail2 ?? null,
      }))
    : [];

  return {
    Orderid: String(detail?.Orderid ?? detail?.OrderId ?? "").trim(),
    order_type: detail?.order_type,
    equipment:
      detail?.equipment ??
      detail?.Equipment ??
      detail?.EQUIPMENT ??
      null,
    Equipment:
      detail?.Equipment ??
      detail?.equipment ??
      detail?.EQUIPMENT ??
      null,
    tipo_equipo:
      detail?.tipo_equipo ?? detail?.equipment_type ?? null,
    tipo_equipo_source:
      detail?.tipo_equipo_source ?? detail?.equipment_type_source ?? null,
    Eqart: detail?.Eqart ?? detail?.eqart ?? null,
    eqart: detail?.eqart ?? detail?.Eqart ?? null,
    plant: detail?.plant ?? detail?.Plant ?? null,
    start_date:
      detail?.start_date ??
      detail?.StartDate ??
      detail?.startDate ??
      detail?.BasicStartDate ??
      detail?.BasicStart ??
      null,
    StartDate:
      detail?.StartDate ??
      detail?.start_date ??
      detail?.startDate ??
      detail?.BasicStartDate ??
      detail?.BasicStart ??
      null,
    finish_date:
      detail?.finish_date ??
      detail?.FinishDate ??
      detail?.finishDate ??
      detail?.BasicFinDate ??
      detail?.BasicFinish ??
      null,
    FinishDate:
      detail?.FinishDate ??
      detail?.finish_date ??
      detail?.finishDate ??
      detail?.BasicFinDate ??
      detail?.BasicFinish ??
      null,
    ShortText: detail?.ShortText ?? detail?.short_text ?? null,
    short_text: detail?.short_text ?? detail?.ShortText ?? null,
    cobertura_tipo: detail?.cobertura_tipo ?? detail?.cobertura ?? null,
    direccion: detail?.direccion,
    cliente: detail?.cliente,
    cliente_email: detail?.cliente_email,
    userstatus: detail?.userstatus,
    estatus_code: detail?.estatus_code,
    estatus_label: detail?.estatus_label,
    estatus_tipo: detail?.estatus_tipo,
    isFinal: detail?.isFinal,
    checkin_done: detail?.checkin_done,
    componentes: Array.isArray(detail?.componentes) ? detail.componentes : [],
    operaciones: opsSlim,

    // ✅ NUEVO
    partners: partnersSlim,
    _prefetch_complete: detail?._prefetch_complete === true,
    _prefetch_status:
      detail?._prefetch_status && typeof detail._prefetch_status === "object"
        ? detail._prefetch_status
        : null,
    _prefetch_updated_at: detail?._prefetch_updated_at ?? null,
  };
}

/**
 * Decide si conviene guardar el detalle en offline:
 * solo si la orden está dentro de los 15 días anteriores
 * o los 1 día posterior a la fecha actual.
 */
export function shouldCacheDetailByOrder(orderLike, baseDate = new Date()) {
  const window = buildOfflineWindow(baseDate);
  return isOrderInWindow(orderLike, window);
}

export async function saveOrdenTecnicoDetail(orderId, data) {
  if (detailWritesBlockedByStorage) {
    return false;
  }

  const slim = sanitizeDetailForCache(data);
  const payload = { updatedAt: Date.now(), data: slim };

  let raw = JSON.stringify(payload);
  let bytes = estimateBytes(raw);

  // si aún es grande, quitamos componentes (suele pesar mucho)
  if (bytes > MAX_DETAIL_BYTES) {
    payload.data = { ...(payload.data || {}), componentes: [] };
    raw = JSON.stringify(payload);
    bytes = estimateBytes(raw);
  }

  if (bytes > MAX_DETAIL_BYTES) {
    console.log(
      "[OFFLINE] Detalle demasiado grande, NO se guarda:",
      orderId,
      "bytes:",
      bytes,
    );
    return false;
  }

  try {
    await AsyncStorage.setItem(DETAIL_KEY(orderId), raw);
    return true;
  } catch (e) {
    if (isStorageFullError(e)) {
      blockDetailWritesByStorage(
        e,
        "saveOrdenTecnicoDetail",
      );

      return false;
    }

    console.log("[OFFLINE] saveOrdenTecnicoDetail ERROR:", e?.message || e);
    return false;
  }
}

export async function loadOrdenTecnicoDetail(orderId) {
  try {
    const raw = await AsyncStorage.getItem(DETAIL_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Limpieza por lista:
 * deja solo detalles de órdenes que aún existan en la lista cacheada.
 */
export async function pruneDetallesNoUsados(orderIdsKeep = []) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const detailKeys = keys.filter((k) =>
      k.startsWith(DETAIL_KEY_PREFIX),
    );
    const keepSet = new Set(
      orderIdsKeep.map((x) => `${DETAIL_KEY_PREFIX}${String(x).trim()}`),
    );
    const toDelete = detailKeys.filter((k) => !keepSet.has(k));
    if (toDelete.length) await AsyncStorage.multiRemove(toDelete);
  } catch {
    // no-op
  }
}

/**
 * Limpieza por ventana:
 * borra detalles de órdenes que NO caen en la ventana actual.
 */
export async function pruneDetallesByWindow(userEmail, window) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    const list = cached?.data || [];
    const keepIds = list
      .map((x) => String(x?.Orderid ?? "").trim())
      .filter(Boolean);

    await pruneDetallesNoUsados(keepIds);
    return { ok: true, keep: keepIds.length };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}