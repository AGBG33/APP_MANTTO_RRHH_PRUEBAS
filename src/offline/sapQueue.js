import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";

const QUEUE_KEY = "sapQueue:v3";
const STATUS_ACK_KEY = "sapQueue:statusAck:v1";
const MAX_TRIES = 8;

const SYNC_STATE_PENDING = "pending";
const SYNC_STATE_BLOCKED = "blocked";

const QUEUE_FILES_DIR =
  `${FileSystem.documentDirectory || ""}sap_queue_files/`;

const LOCAL_FILE_MARKER = "__sapQueueLocalFileV1";

export const STATUS_ACK_GRACE_MS = 2 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeStr(value) {
  return String(value ?? "").trim();
}

function normalizeSyncState(value) {
  return safeStr(value).toLowerCase() === SYNC_STATE_BLOCKED
    ? SYNC_STATE_BLOCKED
    : SYNC_STATE_PENDING;
}

function normalizePayloadKey(key) {
  return String(key || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isBase64PayloadKey(key) {
  const normalized = normalizePayloadKey(key);

  return (
    normalized === "base64" ||
    normalized.endsWith("base64")
  );
}

function sanitizeFilePart(value, fallback = "sap") {
  const clean = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");

  return clean || fallback;
}

function extensionFromMimeType(mimeType) {
  const value = safeStr(mimeType).toLowerCase();

  const map = {
    "application/pdf": "pdf",
    pdf: "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    jpeg: "jpg",
    jpg: "jpg",
    "image/png": "png",
    png: "png",
    "image/webp": "webp",
    webp: "webp",
  };

  return map[value] || "";
}

function inferFileExtension(container) {
  const fileName = safeStr(
    container?.FileName ??
      container?.filename ??
      container?.fileName ??
      "",
  );

  const match = fileName.match(/\.([a-zA-Z0-9]{1,8})$/);

  if (match?.[1]) {
    return sanitizeFilePart(
      match[1].toLowerCase(),
      "bin",
    );
  }

  const mimeType =
    container?.MimeType ??
    container?.mimeType ??
    container?.Mimetype ??
    "";

  return extensionFromMimeType(mimeType) || "bin";
}

function splitBase64DataUrl(value) {
  const source = String(value || "");

  if (
    source.startsWith("data:") &&
    source.includes(";base64,")
  ) {
    const separator = source.indexOf(",");

    if (separator >= 0) {
      return {
        base64: source.slice(separator + 1),
        prefix: source.slice(0, separator + 1),
      };
    }
  }

  return {
    base64: source,
    prefix: "",
  };
}

function isLocalFileMarker(value) {
  return !!(
    value &&
    typeof value === "object" &&
    value?.[LOCAL_FILE_MARKER] === true &&
    safeStr(value?.uri)
  );
}

async function ensureQueueFilesDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error(
      "[SAP QUEUE] FileSystem.documentDirectory no está disponible.",
    );
  }

  const info = await FileSystem.getInfoAsync(
    QUEUE_FILES_DIR,
  );

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(
      QUEUE_FILES_DIR,
      {
        intermediates: true,
      },
    );
  }
}

function makeQueueFileUri({
  orderId,
  extension = "bin",
} = {}) {
  const orderPart = sanitizeFilePart(
    orderId,
    "sin_orden",
  );

  const uniquePart = `${nowMs()}_${Math.random()
    .toString(16)
    .slice(2)}`;

  const ext = sanitizeFilePart(
    extension,
    "bin",
  );

  return `${QUEUE_FILES_DIR}${orderPart}_${uniquePart}.${ext}`;
}

async function externalizeBase64Payload(
  value,
  {
    orderId = "",
    createdUris = [],
    depth = 0,
  } = {},
) {
  if (depth > 12) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const result = [];

    for (const item of value) {
      result.push(
        await externalizeBase64Payload(
          item,
          {
            orderId,
            createdUris,
            depth: depth + 1,
          },
        ),
      );
    }

    return result;
  }

  if (typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [key, child] of Object.entries(value)) {
    if (
      isBase64PayloadKey(key) &&
      typeof child === "string" &&
      child.length > 0
    ) {
      await ensureQueueFilesDirectory();

      const {
        base64,
        prefix,
      } = splitBase64DataUrl(child);

      const extension =
        inferFileExtension(value);

      const fileUri =
        makeQueueFileUri({
          orderId,
          extension,
        });

      await FileSystem.writeAsStringAsync(
        fileUri,
        base64,
        {
          encoding:
            FileSystem.EncodingType.Base64,
        },
      );

      createdUris.push(fileUri);

      result[key] = {
        [LOCAL_FILE_MARKER]: true,
        uri: fileUri,
        dataUrlPrefix: prefix || "",
        createdAt: nowMs(),
      };

      continue;
    }

    result[key] =
      await externalizeBase64Payload(
        child,
        {
          orderId,
          createdUris,
          depth: depth + 1,
        },
      );
  }

  return result;
}

async function hydratePayloadFromLocalFiles(
  value,
  depth = 0,
) {
  if (depth > 12) {
    return value;
  }

  if (isLocalFileMarker(value)) {
    const uri = safeStr(value?.uri);

    const info =
      await FileSystem.getInfoAsync(uri);

    if (!info.exists) {
      const error = new Error(
        `[SAP QUEUE] Falta archivo local requerido por la cola: ${uri}`,
      );

      error.code =
        "SAP_QUEUE_LOCAL_FILE_MISSING";

      throw error;
    }

    const base64 =
      await FileSystem.readAsStringAsync(
        uri,
        {
          encoding:
            FileSystem.EncodingType.Base64,
        },
      );

    const prefix =
      safeStr(value?.dataUrlPrefix);

    return prefix
      ? `${prefix}${base64}`
      : base64;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const result = [];

    for (const item of value) {
      result.push(
        await hydratePayloadFromLocalFiles(
          item,
          depth + 1,
        ),
      );
    }

    return result;
  }

  if (typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [key, child] of Object.entries(value)) {
    result[key] =
      await hydratePayloadFromLocalFiles(
        child,
        depth + 1,
      );
  }

  return result;
}

function collectLocalFileUris(
  value,
  target = new Set(),
  depth = 0,
) {
  if (
    depth > 12 ||
    value === null ||
    value === undefined
  ) {
    return target;
  }

  if (isLocalFileMarker(value)) {
    const uri = safeStr(value?.uri);

    if (uri) {
      target.add(uri);
    }

    return target;
  }

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectLocalFileUris(
        item,
        target,
        depth + 1,
      ),
    );

    return target;
  }

  if (typeof value !== "object") {
    return target;
  }

  Object.values(value).forEach((child) =>
    collectLocalFileUris(
      child,
      target,
      depth + 1,
    ),
  );

  return target;
}

function collectQueueLocalFileUris(
  queue = [],
) {
  const result = new Set();

  (Array.isArray(queue) ? queue : [])
    .forEach((item) => {
      collectLocalFileUris(
        item?.payload,
        result,
      );
    });

  return result;
}

async function deleteQueueLocalFiles(
  uris,
) {
  const uniqueUris =
    Array.from(
      new Set(
        Array.isArray(uris)
          ? uris
          : Array.from(uris || []),
      ),
    );

  for (const uri of uniqueUris) {
    const cleanUri = safeStr(uri);

    if (
      !cleanUri ||
      !cleanUri.startsWith(QUEUE_FILES_DIR)
    ) {
      continue;
    }

    try {
      const info =
        await FileSystem.getInfoAsync(
          cleanUri,
        );

      if (info.exists) {
        await FileSystem.deleteAsync(
          cleanUri,
          {
            idempotent: true,
          },
        );
      }
    } catch (error) {
      console.warn(
        "[SAP QUEUE] No se pudo borrar archivo local ya liberable:",
        {
          uri: cleanUri,
          error:
            error?.message ||
            String(error),
        },
      );
    }
  }
}

function fileUrisNoLongerReferenced(
  candidateUris,
  queueThatRemains,
) {
  const referenced =
    collectQueueLocalFileUris(
      queueThatRemains,
    );

  return Array.from(
    candidateUris || [],
  ).filter(
    (uri) =>
      !referenced.has(uri),
  );
}

/**
 * La cola SAP es información crítica.
 *
 * Si no se puede leer, NO debemos fingir que está vacía.
 * Devolver [] ante un error permitiría que una escritura posterior
 * reemplazara una cola existente y se perdieran pendientes.
 */
async function loadQueue() {
  let raw;

  try {
    raw = await AsyncStorage.getItem(QUEUE_KEY);
  } catch (error) {
    console.error("[SAP QUEUE] No se pudo leer la cola:", {
      error: error?.message || String(error),
    });

    throw error;
  }

  if (!raw) return [];

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const parseError = new Error(
      `[SAP QUEUE] La cola local existe pero su JSON no se pudo interpretar: ${
        error?.message || String(error)
      }`,
    );

    console.error(parseError.message);
    throw parseError;
  }

  if (!Array.isArray(parsed)) {
    const typeError = new Error(
      "[SAP QUEUE] La cola local tiene un formato inválido; no se sobrescribirá.",
    );

    console.error(typeError.message);
    throw typeError;
  }

  return parsed;
}

/**
 * Guardar la cola es una operación crítica.
 * Los errores ya NO se ocultan.
 */
async function saveQueue(items) {
  if (!Array.isArray(items)) {
    throw new Error("[SAP QUEUE] saveQueue esperaba un arreglo.");
  }

  const raw = JSON.stringify(items);

  try {
    await AsyncStorage.setItem(QUEUE_KEY, raw);
    return true;
  } catch (error) {
    console.error("[SAP QUEUE] No se pudo guardar la cola:", {
      items: items.length,
      error: error?.message || String(error),
    });

    throw error;
  }
}

/**
 * Los ACK de estatus son auxiliares y temporales.
 * Un fallo aquí no debe convertir un envío SAP exitoso
 * en un supuesto fallo de la cola.
 */
async function loadStatusAcks() {
  try {
    const raw = await AsyncStorage.getItem(STATUS_ACK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("[SAP QUEUE] No se pudieron leer status ACKs:", {
      error: error?.message || String(error),
    });

    return {};
  }
}

async function saveStatusAcks(acks) {
  try {
    await AsyncStorage.setItem(
      STATUS_ACK_KEY,
      JSON.stringify(acks || {}),
    );

    return true;
  } catch (error) {
    console.warn("[SAP QUEUE] No se pudieron guardar status ACKs:", {
      error: error?.message || String(error),
    });

    return false;
  }
}

function normalizeMethod(method) {
  const value = String(method || "POST").toUpperCase();
  return ["POST", "PATCH", "PUT"].includes(value) ? value : "POST";
}

function normalizeType(type) {
  const value = String(type || "GENERIC").toUpperCase();

  const allowed = [
    "STATUS",
    "CONFIRMATIONS",
    "SIGNATURE",
    "PDF",
    "GENERIC",
    "PENDIENTE_FIRMA_0300",
    "PENDIENTE_FIRMA_BULK_0300",
  ];

  return allowed.includes(value) ? value : "GENERIC";
}

function addOrderId(target, value) {
  const clean = safeStr(value);
  if (clean) target.add(clean);
}

function collectOrderIdsFromValue(value, target, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectOrderIdsFromValue(item, target, depth + 1),
    );
    return;
  }

  if (typeof value !== "object") return;

  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = String(key)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();

    if (normalizedKey === "orderid") {
      addOrderId(target, child);
      return;
    }

    collectOrderIdsFromValue(child, target, depth + 1);
  });
}

export function getQueueItemOrderIds(item) {
  const result = new Set();
  const type = normalizeType(item?.type);
  const dedupeKey = safeStr(item?.dedupeKey || item?.key);

  if (type === "STATUS" || type.includes("PENDIENTE_FIRMA")) {
    addOrderId(result, item?.orderId);
  }

  if (dedupeKey.startsWith("STATUS:")) {
    addOrderId(result, dedupeKey.slice("STATUS:".length));
  }

  collectOrderIdsFromValue(item?.payload, result);
  return Array.from(result);
}

function isStatusQueueItem(item) {
  const type = normalizeType(item?.type);
  const dedupeKey = safeStr(item?.dedupeKey || item?.key);

  return (
    type === "STATUS" ||
    type.includes("PENDIENTE_FIRMA") ||
    dedupeKey.startsWith("STATUS:")
  );
}

async function registerSuccessfulStatusItem(item) {
  if (!isStatusQueueItem(item)) return false;

  const orderIds = getQueueItemOrderIds(item);
  if (!orderIds.length) return false;

  const acks = await loadStatusAcks();
  const sentAt = nowMs();

  orderIds.forEach((orderId) => {
    acks[orderId] = sentAt;
  });

  return await saveStatusAcks(acks);
}

export async function getSapQueueStatusState() {
  const [queue, storedAcks] = await Promise.all([
    loadQueue(),
    loadStatusAcks(),
  ]);

  const pendingOrderIds = new Set();

  queue.forEach((item) => {
    if (!isStatusQueueItem(item)) return;

    getQueueItemOrderIds(item).forEach((orderId) =>
      pendingOrderIds.add(orderId),
    );
  });

  const cutoff = nowMs() - STATUS_ACK_GRACE_MS;
  const recentAcks = {};
  let changed = false;

  Object.entries(storedAcks || {}).forEach(([orderId, sentAt]) => {
    const timestamp = Number(sentAt || 0);

    if (timestamp >= cutoff) {
      recentAcks[orderId] = timestamp;
    } else {
      changed = true;
    }
  });

  if (changed) {
    await saveStatusAcks(recentAcks);
  }

  return { pendingOrderIds, recentAcks };
}

export async function clearSapStatusAck(orderId) {
  const cleanOrderId = safeStr(orderId);
  if (!cleanOrderId) return false;

  const acks = await loadStatusAcks();

  if (!acks[cleanOrderId]) return true;

  delete acks[cleanOrderId];
  await saveStatusAcks(acks);

  return true;
}

function validateQueueItem(item) {
  if (!item || typeof item !== "object") {
    return {
      ok: false,
      reason: "Elemento de cola inválido: no es un objeto.",
    };
  }

  const type = normalizeType(item.type);

  if (type === "PENDIENTE_FIRMA_0300") {
    const endpoint = safeStr(item.endpoint);
    const payload = item?.payload || {};

    const hasBulkShape =
      !!endpoint &&
      !!payload?.WorkOrderHeader &&
      Array.isArray(payload?.WorkOrderUserStatusSet) &&
      Array.isArray(payload?.Attachments);

    const hasLegacyShape =
      !!safeStr(payload?.attachmentEndpoint) &&
      !!payload?.attachmentPayload &&
      !!safeStr(payload?.statusEndpoint) &&
      !!payload?.statusPayload;

    if (hasBulkShape || hasLegacyShape) {
      return { ok: true, type };
    }

    return {
      ok: false,
      reason: `Queue item PENDIENTE_FIRMA_0300 inválido para orden ${
        safeStr(item?.orderId) || "sin OrderId"
      }`,
    };
  }

  if (!safeStr(item.endpoint)) {
    return {
      ok: false,
      reason: "Queue item sin endpoint.",
    };
  }

  return { ok: true, type };
}

function makeBlockedQueueItem(item, reason, { tries } = {}) {
  const source =
    item && typeof item === "object"
      ? item
      : {
          id: uid(),
          type: "GENERIC",
          payload: item,
          createdAt: nowMs(),
        };

  const normalizedTries = Number.isFinite(Number(tries))
    ? Number(tries)
    : Number(source?.tries || 0);

  return {
    ...source,
    id: safeStr(source?.id) || uid(),
    type: normalizeType(source?.type),
    method: normalizeMethod(source?.method),
    syncState: SYNC_STATE_BLOCKED,
    tries: Math.max(0, normalizedTries),
    updatedAt: nowMs(),
    lastError: safeStr(reason) || "Elemento bloqueado.",
  };
}


async function logSapQueueDiagnostics(label) {
  try {
    const diag = await getSapQueueDiagnostics();

    console.log(label, {
      count: diag?.count ?? 0,
      approxBytes: diag?.approxBytes ?? 0,
      blocked: diag?.blocked ?? 0,
      withInlineBase64: diag?.withInlineBase64 ?? 0,
      localFiles: diag?.localFiles ?? 0,
      localFileBytes: diag?.localFileBytes ?? 0,
      items: Array.isArray(diag?.items)
        ? diag.items.map((item) => ({
            id: item?.id ?? null,
            type: item?.type ?? null,
            orderId: item?.orderId ?? null,
            tries: item?.tries ?? 0,
            syncState: item?.syncState ?? null,
            approxBytes: item?.approxBytes ?? 0,
            containsInlineBase64:
              !!item?.containsInlineBase64,
            localFiles: item?.localFiles ?? 0,
            localFileBytes: item?.localFileBytes ?? 0,
          }))
        : [],
    });
  } catch (error) {
    console.warn(
      "[SAP QUEUE][DIAG] No se pudo obtener diagnóstico:",
      {
        label,
        error:
          error?.message ||
          String(error),
      },
    );
  }
}

export async function upsertSapQueueItem({
  type,
  orderId,
  endpoint,
  method = "POST",
  payload,
  dedupeKey,
  key,
}) {
  const orderIdNorm = safeStr(orderId);
  const finalKey =
    safeStr(dedupeKey) ||
    safeStr(key) ||
    undefined;

  const queue = await loadQueue();
  const createdUris = [];

  try {
    const storedPayload =
      await externalizeBase64Payload(
        payload,
        {
          orderId: orderIdNorm,
          createdUris,
        },
      );

    const item = {
      id: uid(),
      dedupeKey: finalKey,
      key: finalKey,
      type: normalizeType(type),
      orderId: orderIdNorm,
      endpoint: safeStr(endpoint),
      method: normalizeMethod(method),
      payload: storedPayload,
      createdAt: nowMs(),
      updatedAt: nowMs(),
      tries: 0,
      syncState: SYNC_STATE_PENDING,
      lastError: null,
    };

    if (item.dedupeKey) {
      const index = queue.findIndex(
        (queued) =>
          queued &&
          safeStr(queued.orderId) === item.orderId &&
          safeStr(
            queued.dedupeKey ||
              queued.key,
          ) === item.dedupeKey,
      );

      if (index >= 0) {
        const previous = queue[index];

        const oldUris =
          collectLocalFileUris(
            previous?.payload,
          );

        queue[index] = {
          ...previous,
          ...item,
          id: previous.id,
          createdAt: previous.createdAt,
          tries: 0,
          syncState: SYNC_STATE_PENDING,
          lastError: null,
        };

        try {
          await saveQueue(queue);
        } catch (error) {
          await deleteQueueLocalFiles(
            createdUris,
          );
          throw error;
        }

        const releasableOldUris =
          fileUrisNoLongerReferenced(
            oldUris,
            queue,
          );

        await deleteQueueLocalFiles(
          releasableOldUris,
        );

        await logSapQueueDiagnostics(
          "[SAP QUEUE][DESPUES DE ENCOLAR]",
        );

        return queue[index];
      }
    }

    queue.push(item);

    try {
      await saveQueue(queue);
    } catch (error) {
      await deleteQueueLocalFiles(
        createdUris,
      );
      throw error;
    }

    await logSapQueueDiagnostics(
      "[SAP QUEUE][DESPUES DE ENCOLAR]",
    );

    return item;
  } catch (error) {
    await deleteQueueLocalFiles(
      createdUris,
    );
    throw error;
  }
}

export async function removeSapQueueItemsByKey({
  orderId,
  dedupeKey,
}) {
  const orderIdNorm = safeStr(orderId);
  const key = safeStr(dedupeKey);

  if (!orderIdNorm || !key) {
    return {
      ok: false,
      removed: 0,
    };
  }

  const queue = await loadQueue();

  const removedItems = queue.filter(
    (item) =>
      safeStr(item?.orderId) === orderIdNorm &&
      safeStr(
        item?.dedupeKey ||
          item?.key,
      ) === key,
  );

  const next = queue.filter(
    (item) =>
      !(
        safeStr(item?.orderId) === orderIdNorm &&
        safeStr(
          item?.dedupeKey ||
            item?.key,
        ) === key
      ),
  );

  await saveQueue(next);

  const candidateUris = new Set();

  removedItems.forEach((item) =>
    collectLocalFileUris(
      item?.payload,
      candidateUris,
    ),
  );

  await deleteQueueLocalFiles(
    fileUrisNoLongerReferenced(
      candidateUris,
      next,
    ),
  );

  return {
    ok: true,
    removed:
      queue.length -
      next.length,
  };
}

/**
 * Reactiva explícitamente un item bloqueado.
 * No se ejecuta automáticamente.
 */
export async function retrySapQueueItemById(itemId) {
  const cleanId = safeStr(itemId);

  if (!cleanId) {
    return { ok: false, reason: "missing_id" };
  }

  const queue = await loadQueue();

  const index = queue.findIndex(
    (item) => safeStr(item?.id) === cleanId,
  );

  if (index < 0) {
    return { ok: false, reason: "not_found" };
  }

  queue[index] = {
    ...queue[index],
    tries: 0,
    syncState: SYNC_STATE_PENDING,
    lastError: null,
    updatedAt: nowMs(),
  };

  await saveQueue(queue);

  return {
    ok: true,
    item: queue[index],
  };
}

export async function processSapQueue({
  ensureValidToken,
  apiInstance,
} = {}) {
  const net = await NetInfo.fetch();

  const online = !!(
    net?.isConnected &&
    net?.isInternetReachable !== false
  );

  if (!online) {
    return {
      ok: false,
      reason: "offline",
    };
  }

  if (!apiInstance) {
    return {
      ok: false,
      reason: "missing_apiInstance",
    };
  }

  const queue = await loadQueue();

  await logSapQueueDiagnostics(
    "[SAP QUEUE][ANTES DE PROCESAR]",
  );

  if (!queue.length) {
    return {
      ok: true,
      processed: 0,
      remaining: 0,
      blocked: 0,
      skippedMaxTries: 0,
      discardedMaxTries: 0,
      releasedLocalFiles: 0,
    };
  }

  try {
    await ensureValidToken?.();
  } catch (error) {
    console.warn(
      "[SAP QUEUE] No se procesa la cola porque falló la autenticación:",
      {
        error:
          error?.message ||
          String(error),
        remaining:
          queue.length,
      },
    );

    return {
      ok: false,
      reason: "auth_error",
      processed: 0,
      remaining: queue.length,
      blocked: queue.filter(
        (item) =>
          normalizeSyncState(
            item?.syncState,
          ) ===
          SYNC_STATE_BLOCKED,
      ).length,
      skippedMaxTries: 0,
      discardedMaxTries: 0,
      releasedLocalFiles: 0,
      error:
        error?.message ||
        String(error),
    };
  }

  const keep = [];
  const successfulLocalFileUris =
    new Set();

  let processed = 0;
  let blocked = 0;
  let skippedMaxTries = 0;
  let blockedMaxTries = 0;
  let blockedInvalid = 0;
  let retryableFailures = 0;

  for (const rawItem of queue) {
    if (
      !rawItem ||
      typeof rawItem !== "object"
    ) {
      keep.push(
        makeBlockedQueueItem(
          rawItem,
          "Elemento de cola inválido: no es un objeto.",
        ),
      );

      blocked++;
      blockedInvalid++;
      continue;
    }

    const item = rawItem;
    const tries =
      Number(item?.tries || 0);

    const syncState =
      normalizeSyncState(
        item?.syncState,
      );

    if (
      syncState ===
      SYNC_STATE_BLOCKED
    ) {
      keep.push({
        ...item,
        syncState:
          SYNC_STATE_BLOCKED,
      });

      blocked++;

      if (tries >= MAX_TRIES) {
        skippedMaxTries++;
      }

      continue;
    }

    if (tries >= MAX_TRIES) {
      keep.push(
        makeBlockedQueueItem(
          item,
          item?.lastError ||
            `Máximo de ${MAX_TRIES} intentos alcanzado.`,
          {
            tries,
          },
        ),
      );

      blocked++;
      skippedMaxTries++;
      blockedMaxTries++;
      continue;
    }

    const validation =
      validateQueueItem(item);

    if (!validation.ok) {
      keep.push(
        makeBlockedQueueItem(
          item,
          validation.reason,
          {
            tries,
          },
        ),
      );

      blocked++;
      blockedInvalid++;

      console.warn(
        "[SAP QUEUE] Elemento inválido conservado como bloqueado:",
        {
          id: item?.id,
          type: item?.type,
          orderId:
            item?.orderId,
          reason:
            validation.reason,
        },
      );

      continue;
    }

    try {
      /*
       * Items nuevos:
       * marcador local -> Base64 sólo en memoria.
       *
       * Items viejos:
       * Base64 inline -> se conserva y se envía como antes.
       */
      const sendPayload =
        await hydratePayloadFromLocalFiles(
          item?.payload,
        );

      const itemType =
        normalizeType(item.type);

      if (
        itemType ===
        "PENDIENTE_FIRMA_0300"
      ) {
        const endpoint =
          safeStr(item.endpoint);

        if (
          endpoint &&
          sendPayload?.WorkOrderHeader &&
          Array.isArray(
            sendPayload?.WorkOrderUserStatusSet,
          ) &&
          Array.isArray(
            sendPayload?.Attachments,
          )
        ) {
          await apiInstance.post(
            endpoint,
            sendPayload,
          );
        } else {
          const attachmentEndpoint =
            safeStr(
              sendPayload
                ?.attachmentEndpoint,
            );

          const statusEndpoint =
            safeStr(
              sendPayload
                ?.statusEndpoint,
            );

          const attachmentPayload =
            sendPayload
              ?.attachmentPayload;

          const statusPayload =
            sendPayload
              ?.statusPayload;

          if (
            !attachmentEndpoint ||
            !attachmentPayload ||
            !statusEndpoint ||
            !statusPayload
          ) {
            throw new Error(
              `Queue item PENDIENTE_FIRMA_0300 inválido para orden ${item.orderId}`,
            );
          }

          await apiInstance.post(
            attachmentEndpoint,
            attachmentPayload,
          );

          await apiInstance.post(
            statusEndpoint,
            statusPayload,
          );
        }
      } else {
        const method =
          normalizeMethod(
            item.method,
          ).toLowerCase();

        const endpoint =
          safeStr(item.endpoint);

        if (!endpoint) {
          throw new Error(
            "Queue item sin endpoint",
          );
        }

        if (method === "post") {
          await apiInstance.post(
            endpoint,
            sendPayload,
          );
        } else if (
          method === "patch"
        ) {
          await apiInstance.patch(
            endpoint,
            sendPayload,
          );
        } else if (
          method === "put"
        ) {
          await apiInstance.put(
            endpoint,
            sendPayload,
          );
        } else {
          throw new Error(
            "Método no soportado",
          );
        }
      }

      await registerSuccessfulStatusItem(
        item,
      );

      collectLocalFileUris(
        item?.payload,
        successfulLocalFileUris,
      );

      processed++;
    } catch (error) {
      const localFileMissing =
        safeStr(error?.code) ===
        "SAP_QUEUE_LOCAL_FILE_MISSING";

      if (localFileMissing) {
        keep.push(
          makeBlockedQueueItem(
            item,
            error?.message ||
              "Falta archivo local requerido.",
            {
              tries,
            },
          ),
        );

        blocked++;
        blockedInvalid++;

        console.warn(
          "[SAP QUEUE] Item bloqueado porque falta su archivo local; NO se elimina:",
          {
            id: item?.id,
            type: item?.type,
            orderId:
              item?.orderId,
            error:
              error?.message ||
              String(error),
          },
        );

        continue;
      }

      const nextTries =
        tries + 1;

      const reachedMax =
        nextTries >= MAX_TRIES;

      const nextItem = {
        ...item,
        tries: Math.min(
          nextTries,
          MAX_TRIES,
        ),
        syncState:
          reachedMax
            ? SYNC_STATE_BLOCKED
            : SYNC_STATE_PENDING,
        updatedAt:
          nowMs(),
        lastError:
          error?.message ||
          "error",
      };

      keep.push(nextItem);

      if (reachedMax) {
        blocked++;
        blockedMaxTries++;

        console.warn(
          "[SAP QUEUE] Elemento bloqueado por máximo de intentos; NO se elimina:",
          {
            id: item?.id,
            type: item?.type,
            orderId:
              item?.orderId,
            tries:
              nextTries,
            lastError:
              error?.message ||
              "error",
          },
        );
      } else {
        retryableFailures++;
      }
    }
  }

  /*
   * Primero persistimos la cola sin los items exitosos.
   * Si falla, NO se borra ningún archivo local.
   */
  try {
    await saveQueue(keep);
  } catch (error) {
    console.error(
      "[SAP QUEUE] Los requests terminaron pero no se pudo persistir el nuevo estado de la cola:",
      {
        processed,
        originalItems:
          queue.length,
        intendedRemaining:
          keep.length,
        error:
          error?.message ||
          String(error),
      },
    );

    return {
      ok: false,
      reason:
        "queue_persist_failed",
      processed,
      remaining:
        queue.length,
      intendedRemaining:
        keep.length,
      blocked,
      skippedMaxTries,
      blockedMaxTries,
      blockedInvalid,
      retryableFailures,
      discardedMaxTries: 0,
      releasedLocalFiles: 0,
      error:
        error?.message ||
        String(error),
    };
  }

  /*
   * Sólo después de confirmar saveQueue(keep) liberamos los archivos
   * de los items enviados y ya no referenciados.
   */
  const releasableUris =
    fileUrisNoLongerReferenced(
      successfulLocalFileUris,
      keep,
    );

  await deleteQueueLocalFiles(
    releasableUris,
  );

  await logSapQueueDiagnostics(
    "[SAP QUEUE][DESPUES DE PROCESAR]",
  );

  return {
    ok: true,
    processed,
    remaining:
      keep.length,
    blocked,
    skippedMaxTries,
    blockedMaxTries,
    blockedInvalid,
    retryableFailures,
    discardedMaxTries: 0,
    releasedLocalFiles:
      releasableUris.length,
  };
}

export async function getSapQueue() {
  return loadQueue();
}

/**
 * Diagnóstico seguro de la cola:
 * no devuelve el payload ni el Base64.
 */
function estimateJsonBytes(value) {
  let raw = "";

  try {
    raw = JSON.stringify(value ?? null);
  } catch {
    return 0;
  }

  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(raw).length;
    }
  } catch {}

  return raw.length * 2;
}

function containsBase64Field(value, depth = 0) {
  if (
    depth > 8 ||
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      containsBase64Field(item, depth + 1),
    );
  }

  if (typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = String(key)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();

    if (
      normalizedKey === "base64" &&
      typeof child === "string" &&
      child.length > 0
    ) {
      return true;
    }

    return containsBase64Field(child, depth + 1);
  });
}

export async function getSapQueueDiagnostics() {
  const queue =
    await loadQueue();

  const items = [];

  let totalLocalFileBytes = 0;
  let totalLocalFiles = 0;

  for (const item of queue) {
    const localUris =
      Array.from(
        collectLocalFileUris(
          item?.payload,
        ),
      );

    let localFileBytes = 0;

    for (const uri of localUris) {
      try {
        const info =
          await FileSystem.getInfoAsync(
            uri,
          );

        if (info.exists) {
          localFileBytes +=
            Number(info?.size || 0);
        }
      } catch {}
    }

    totalLocalFiles +=
      localUris.length;

    totalLocalFileBytes +=
      localFileBytes;

    items.push({
      id:
        safeStr(item?.id) ||
        null,
      type:
        normalizeType(
          item?.type,
        ),
      orderId:
        safeStr(
          item?.orderId,
        ) || null,
      tries:
        Number(
          item?.tries || 0,
        ),
      syncState:
        normalizeSyncState(
          item?.syncState,
        ),
      approxBytes:
        estimateJsonBytes(item),
      containsInlineBase64:
        containsBase64Field(
          item?.payload,
        ),
      localFiles:
        localUris.length,
      localFileBytes,
    });
  }

  return {
    key:
      QUEUE_KEY,
    count:
      queue.length,
    approxBytes:
      estimateJsonBytes(queue),
    blocked:
      items.filter(
        (item) =>
          item.syncState ===
          SYNC_STATE_BLOCKED,
      ).length,
    withInlineBase64:
      items.filter(
        (item) =>
          item.containsInlineBase64,
      ).length,
    localFiles:
      totalLocalFiles,
    localFileBytes:
      totalLocalFileBytes,
    items,
  };
}

/**
 * Migración OPCIONAL de pendientes legacy que todavía tienen Base64 inline.
 *
 * NO se ejecuta automáticamente. Los items viejos siguen siendo compatibles
 * y pueden enviarse sin migración.
 */
export async function migrateLegacySapQueueBase64ToFiles() {
  const queue =
    await loadQueue();

  if (!queue.length) {
    return {
      ok: true,
      migratedItems: 0,
      createdFiles: 0,
    };
  }

  const next = [];
  const createdUris = [];
  let migratedItems = 0;

  try {
    for (const item of queue) {
      const hasInlineBase64 =
        containsBase64Field(
          item?.payload,
        );

      if (!hasInlineBase64) {
        next.push(item);
        continue;
      }

      const storedPayload =
        await externalizeBase64Payload(
          item?.payload,
          {
            orderId:
              safeStr(
                item?.orderId,
              ),
            createdUris,
          },
        );

      next.push({
        ...item,
        payload:
          storedPayload,
        updatedAt:
          nowMs(),
      });

      migratedItems++;
    }

    if (!migratedItems) {
      return {
        ok: true,
        migratedItems: 0,
        createdFiles: 0,
      };
    }

    await saveQueue(next);

    return {
      ok: true,
      migratedItems,
      createdFiles:
        createdUris.length,
    };
  } catch (error) {
    await deleteQueueLocalFiles(
      createdUris,
    );

    throw error;
  }
}

/**
 * Se conserva por compatibilidad.
 * No debe usarse como limpieza automática de SQLITE_FULL.
 */
export async function clearSapQueue() {
  const queue =
    await loadQueue();

  const candidateUris =
    collectQueueLocalFileUris(
      queue,
    );

  /*
   * Primero vaciamos la cola persistida.
   */
  await saveQueue([]);

  /*
   * Sólo después liberamos los archivos de esa cola.
   */
  await deleteQueueLocalFiles(
    candidateUris,
  );

  return {
    ok: true,
    removed:
      queue.length,
    releasedLocalFiles:
      candidateUris.size,
  };
}