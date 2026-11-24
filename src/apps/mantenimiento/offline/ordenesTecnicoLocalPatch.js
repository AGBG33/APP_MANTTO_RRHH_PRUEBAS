// src/offline/ordenesTecnicoLocalPatch.js
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  loadOrdenesTecnicoList,
  saveOrdenesTecnicoList,
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
} from "./ordenesTecnicoCache";
import { clearSapStatusAck, getSapQueueStatusState } from "./sapQueue";

const PATCH_KEY = (userEmail) =>
  `ordenesTecnico:statusPatch:${String(userEmail || "unknown").trim().toLowerCase()}`;
const TBMKY_STATUS_KEY = (orderId) =>
  `tbmky_status_${String(orderId || "").trim()}`;

export const STATUS_LABELS = {
  "0100": "PENDIENTE",
  "0200": "EN PROCESO",
  "0300": "FINALIZADA",
  "0400": "PENDIENTE DE FIRMA",
  "0500": "FINALIZADA C/PENDIENTES",
  "0600": "Carta No Mantto",
};

export function normalizeStatusCode(code) {
  if (code === null || code === undefined) return "";
  const value = String(code).trim();
  if (!value) return "";
  const number = parseInt(value, 10);
  return Number.isNaN(number) ? value : String(number).padStart(4, "0");
}

export function resolveStatusLabel(code) {
  const normalized = normalizeStatusCode(code);
  return STATUS_LABELS[normalized] || normalized || "Sin empezar";
}

function getOrderId(item) {
  return String(item?.Orderid ?? item?.OrderId ?? item?.orderid ?? "").trim();
}

function extractStatusCodes(value) {
  const text = String(value ?? "").trim();
  if (!text) return [];

  const matches = text.match(/\b\d{1,4}\b/g) || [];
  return matches.map(normalizeStatusCode).filter(Boolean);
}

function getEffectiveStatusCode(item) {
  const explicitCode = normalizeStatusCode(item?.estatus_code);
  if (explicitCode) return explicitCode;

  const rawStatus =
    item?.userstatus ||
    item?.Userstatus ||
    item?.UserStatus ||
    item?.UserStText ||
    "";

  const codes = extractStatusCodes(rawStatus);
  return codes[codes.length - 1] || "";
}

export function getPreviousStatusForTransition(nextStatus, currentStatus = "") {
  const next = normalizeStatusCode(nextStatus);
  const current = normalizeStatusCode(currentStatus);
  if (next === "0100") return "";
  if (next === "0200") return "0100";
  if (next === "0400") return "0200";
  if (next === "0300") return current === "0400" ? "0400" : "0200";
  if (next === "0600") return current || "0100";
  return current;
}

export function buildStatusTransitionSet({
  nextStatus,
  currentStatus = "",
  language = "ES",
}) {
  const next = normalizeStatusCode(nextStatus);
  const previous = getPreviousStatusForTransition(next, currentStatus);
  if (!next) return [];
  const rows = [{ UserStText: next, Langu: language, Inactive: "" }];
  if (previous && previous !== next) {
    rows.push({ UserStText: previous, Langu: language, Inactive: "X" });
  }
  return rows;
}

export async function getLocalStatusPatch(userEmail) {
  try {
    const raw = await AsyncStorage.getItem(PATCH_KEY(userEmail));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveLocalStatusPatchMap(userEmail, patchMap) {
  await AsyncStorage.setItem(PATCH_KEY(userEmail), JSON.stringify(patchMap || {}));
}

export async function setLocalStatusPatch(userEmail, orderId, estatusCode, options = {}) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    const code = normalizeStatusCode(estatusCode);
    if (!cleanOrderId || !code) return null;
    const patchMap = await getLocalStatusPatch(userEmail);
    const previousPatch = patchMap[cleanOrderId] || {};
    patchMap[cleanOrderId] = {
      ...previousPatch,
      estatus_code: code,
      estatus_label: resolveStatusLabel(code),
      previous_status: normalizeStatusCode(
        options.previousStatus ?? previousPatch.previous_status ?? "",
      ),
      pendingSync: options.pendingSync === undefined ? true : !!options.pendingSync,
      source: String(options.source || previousPatch.source || "local"),
      updatedAt: Date.now(),
    };
    if (options.pendingSync === false) patchMap[cleanOrderId].sentAt = Date.now();
    await saveLocalStatusPatchMap(userEmail, patchMap);
    if (["0200", "0300", "0400", "0600"].includes(code)) {
      await AsyncStorage.removeItem(TBMKY_STATUS_KEY(cleanOrderId));
    }
    return patchMap[cleanOrderId];
  } catch (error) {
    console.log("[STATUS PATCH] No se pudo guardar:", error?.message || error);
    return null;
  }
}

export async function removeLocalStatusPatch(userEmail, orderId) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    if (!cleanOrderId) return false;
    const patchMap = await getLocalStatusPatch(userEmail);
    if (patchMap[cleanOrderId]) {
      delete patchMap[cleanOrderId];
      await saveLocalStatusPatchMap(userEmail, patchMap);
    }
    await clearSapStatusAck(cleanOrderId);
    return true;
  } catch {
    return false;
  }
}

export async function markLocalStatusPatchSent(userEmail, orderId) {
  try {
    const cleanOrderId = String(orderId || "").trim();
    const patchMap = await getLocalStatusPatch(userEmail);
    const currentPatch = patchMap[cleanOrderId];
    if (!currentPatch) return null;
    patchMap[cleanOrderId] = {
      ...currentPatch,
      pendingSync: false,
      sentAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveLocalStatusPatchMap(userEmail, patchMap);
    return patchMap[cleanOrderId];
  } catch {
    return null;
  }
}

function buildStatusFields(item, code) {
  const normalized = normalizeStatusCode(code);
  return {
    ...(item || {}),
    estatus_code: normalized,
    userstatus: normalized,
    Userstatus: normalized,
    UserStatus: normalized,
    UserStText: normalized,
    estatus_label: resolveStatusLabel(normalized),
    isPendingSignature: normalized === "0400",
    isFinal: ["0300", "0600"].includes(normalized),
    checkin_done: ["0100", "0200", "0300", "0400", "0600"].includes(normalized),
  };
}

export function applyStatusPatchToOrdenes(ordenes = [], patchMap = {}) {
  const list = Array.isArray(ordenes) ? ordenes : [];
  return list.map((item) => {
    const code = normalizeStatusCode(patchMap?.[getOrderId(item)]?.estatus_code);
    return code ? buildStatusFields(item, code) : item;
  });
}

export async function reconcileStatusPatchesWithSap(userEmail, sapOrders = []) {
  const list = Array.isArray(sapOrders) ? sapOrders : [];
  const [patchMap, queueState] = await Promise.all([
    getLocalStatusPatch(userEmail),
    getSapQueueStatusState(),
  ]);
  const pendingOrderIds =
    queueState?.pendingOrderIds instanceof Set
      ? queueState.pendingOrderIds
      : new Set(queueState?.pendingOrderIds || []);
  let patchMapChanged = false;
  const acksToClear = new Set();
  const detailsToUpdate = [];

  const data = list.map((item) => {
    const orderId = getOrderId(item);
    if (!orderId) return item;
    const sapCode = getEffectiveStatusCode(item);
    const patchCode = normalizeStatusCode(patchMap?.[orderId]?.estatus_code);

    if (patchCode && pendingOrderIds.has(orderId)) {
      detailsToUpdate.push({ orderId, code: patchCode });
      return buildStatusFields(item, patchCode);
    }
    if (patchCode) {
      delete patchMap[orderId];
      patchMapChanged = true;
      acksToClear.add(orderId);
    }
    if (sapCode) detailsToUpdate.push({ orderId, code: sapCode });
    return sapCode ? buildStatusFields(item, sapCode) : item;
  });

  if (patchMapChanged) await saveLocalStatusPatchMap(userEmail, patchMap);
  await Promise.all(
    Array.from(acksToClear).map((orderId) => clearSapStatusAck(orderId)),
  );
  await Promise.all(
    detailsToUpdate.map(({ orderId, code }) =>
      patchCacheOrdenTecnicoDetail(orderId, code),
    ),
  );
  return data;
}

export async function patchCacheOrdenesTecnicoList(userEmail, orderId, newStatusCode) {
  try {
    const cached = await loadOrdenesTecnicoList(userEmail);
    if (!Array.isArray(cached?.data)) return false;
    const cleanOrderId = String(orderId || "").trim();
    const code = normalizeStatusCode(newStatusCode);
    const newData = cached.data.map((item) =>
      getOrderId(item) === cleanOrderId ? buildStatusFields(item, code) : item,
    );
    await saveOrdenesTecnicoList(userEmail, newData, cached?.window || null);
    return true;
  } catch (error) {
    console.log("[STATUS PATCH] Error actualizando lista:", error?.message || error);
    return false;
  }
}

export async function patchCacheOrdenTecnicoDetail(orderId, newStatusCode) {
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);
    if (!cached?.data) return false;
    return (
      (await saveOrdenTecnicoDetail(
        orderId,
        buildStatusFields(cached.data, newStatusCode),
      )) === true
    );
  } catch (error) {
    console.log("[STATUS PATCH] Error actualizando detalle:", error?.message || error);
    return false;
  }
}

export async function applyLocalStatusTransition({
  userEmail,
  orderId,
  nextStatus,
  currentStatus = "",
  source = "local",
  pendingSync = true,
}) {
  const code = normalizeStatusCode(nextStatus);
  const previousStatus = getPreviousStatusForTransition(code, currentStatus);
  if (!userEmail || !orderId || !code) {
    return { ok: false, reason: "missing_data" };
  }
  const patch = await setLocalStatusPatch(userEmail, orderId, code, {
    previousStatus,
    pendingSync,
    source,
  });
  const listUpdated = await patchCacheOrdenesTecnicoList(userEmail, orderId, code);
  const detailUpdated = await patchCacheOrdenTecnicoDetail(orderId, code);
  return {
    ok: !!patch,
    orderId: String(orderId),
    previousStatus,
    nextStatus: code,
    listUpdated,
    detailUpdated,
    patch,
  };
}