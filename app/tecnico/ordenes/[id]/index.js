import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  FlatList,
  AppState,
  Modal,
  TextInput,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { WebView } from "react-native-webview";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { useOrdenesTecnico } from "../../../../src/context/OrdenesTecnicoContext";
import { addPageNumbersToPdfBase64 } from "../../../../src/services/pdf/addPageNumbersToPdf";
import { useLocalSearchParams, router } from "expo-router";

import {
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
  isCacheFresh,
  ORDENES_CACHE_TTL_MS,
} from "../../../../src/offline/ordenesTecnicoCache";

import {
  processSapQueue,
  upsertSapQueueItem,
} from "../../../../src/offline/sapQueue";
import {
  setLocalStatusPatch,
  patchCacheOrdenesTecnicoList,
  patchCacheOrdenTecnicoDetail,
} from "../../../../src/offline/ordenesTecnicoLocalPatch";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";

// ✅ HTML/PDF mantenimiento (plantillas + operaciones)
import { buildMantenimientoHtml } from "../../../../src/services/templates/buildMantenimientoHtml";
import {
  fetchEquipmentType,
  getEquipmentTypeFromOrder,
  normalizeEquipmentType,
} from "../../../../src/services/equipmentType";

// ✅ Secciones (segmentación)
import EncabezadoDetalleOrden from "./secciones/EncabezadoDetalleOrden";
import ModalesDetalleOrden from "./secciones/ModalesDetalleOrden";
import { ListaOperacionesAgrupadas } from "./secciones/ListaOperacionesDetalle";
import PieDetalleOrden from "./secciones/PieDetalleOrden";
import ConsumiblesFinalizacion from "./secciones/ConsumiblesFinalizacion";

import {
  buildWorkOrderBulkId,
  getDeviceModelForBulkId,
} from "../../../../src/utils/workOrderBulkId";

/* ====================== Paleta SAP Fiori (Horizon) ====================== */
const FIORI = {
  pageBg: "#F7F7F7",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F7FA",
  border: "#DDE6F2",
  borderSoft: "#E8EEF7",
  text: "#0B1F3B",
  textMuted: "#63718B",
  brand: "#0A6ED1",
  brandSoft: "#E3F2FD",
  ok: "#2FBF71",
  warn: "#F5A623",
  err: "#E74C3C",
  pause: "#26a5e0ff",
};

/* ====================== Orden iniciada (contador) ====================== */
const ORDER_START_KEY = (orderId) => `orderStart:${orderId}`;
const ORDER_FINISH_KEY = (orderId) => `orderFinish:${orderId}`;
const ORDER_ELAPSED_KEY = (orderId) => `orderElapsed:${orderId}`;
const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;
const OPSTATE_KEY = (orderId) => `opState:${orderId}`;
const TBMKY_JSON_KEY = (orderId) =>
  `tbmky_json_${String(orderId || "").trim()}`;

/* ====================== Utils tiempo ====================== */
function msToHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fmtDateTimeLocal(ms) {
  if (!Number.isFinite(ms)) return "—";

  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

async function loadOrderStart(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_START_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function saveOrderStart(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_START_KEY(orderId), String(ms));
  } catch {}
}
async function clearOrderStart(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_START_KEY(orderId));
  } catch {}
}

async function loadOrderFinish(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_FINISH_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function saveOrderFinish(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_FINISH_KEY(orderId), String(ms));
  } catch {}
}
async function clearOrderFinish(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_FINISH_KEY(orderId));
  } catch {}
}

async function loadOrderElapsed(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_ELAPSED_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function saveOrderElapsed(orderId, ms) {
  try {
    await AsyncStorage.setItem(ORDER_ELAPSED_KEY(orderId), String(ms));
  } catch {}
}
async function clearOrderElapsed(orderId) {
  try {
    await AsyncStorage.removeItem(ORDER_ELAPSED_KEY(orderId));
  } catch {}
}

const DEFAULT_RECOVERY_ELAPSED_MS = 2 * 60 * 60 * 1000 + 30 * 60 * 1000;
function timerNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function resolveOrderTimeSnapshot(orderId, orderData = null) {
  const now = Date.now();

  try {
    // 1) La fuente más confiable para 0400: el snapshot guardado al abrir firma.
    const pending = await loadPendingSign(orderId);
    const pendingStart = timerNumber(pending?.orderStartedAtMs);
    const pendingFinish = timerNumber(pending?.orderFinishedAtMs);
    const pendingElapsed = timerNumber(pending?.orderElapsedMs);

    if (Number.isFinite(pendingStart)) {
      const finishMs = Number.isFinite(pendingFinish)
        ? pendingFinish
        : Number.isFinite(pendingElapsed)
          ? pendingStart + pendingElapsed
          : now;

      const elapsedMs = Number.isFinite(pendingElapsed)
        ? pendingElapsed
        : Math.max(0, finishMs - pendingStart);

      return {
        startMs: pendingStart,
        finishMs,
        elapsedMs,
        source: "pendingSign",
      };
    }

    // 2) Respaldo persistente local.
    const storedStart = await loadOrderStart(orderId);
    const storedFinish = await loadOrderFinish(orderId);
    const storedElapsed = await loadOrderElapsed(orderId);

    if (Number.isFinite(storedStart)) {
      const finishMs = Number.isFinite(storedFinish)
        ? storedFinish
        : Number.isFinite(storedElapsed)
          ? storedStart + storedElapsed
          : now;

      const elapsedMs = Number.isFinite(storedElapsed)
        ? storedElapsed
        : Math.max(0, finishMs - storedStart);

      return {
        startMs: storedStart,
        finishMs,
        elapsedMs,
        source: "storage",
      };
    }

    // 3) Si SAP/caché ya trae un snapshot explícito de la app, úsalo.
    // No usamos fechas básicas/planificadas de SAP como si fueran cronómetro real.
    const sapStart = timerNumber(
      orderData?.orderStartedAtMs ??
        orderData?.OrderStartedAtMs ??
        orderData?.timerStartMs ??
        orderData?.TimerStartMs,
    );
    const sapFinish = timerNumber(
      orderData?.orderFinishedAtMs ??
        orderData?.OrderFinishedAtMs ??
        orderData?.timerFinishMs ??
        orderData?.TimerFinishMs,
    );
    const sapElapsed = timerNumber(
      orderData?.orderElapsedMs ??
        orderData?.OrderElapsedMs ??
        orderData?.timerElapsedMs ??
        orderData?.TimerElapsedMs,
    );

    if (Number.isFinite(sapStart)) {
      const finishMs = Number.isFinite(sapFinish)
        ? sapFinish
        : Number.isFinite(sapElapsed)
          ? sapStart + sapElapsed
          : now;

      const elapsedMs = Number.isFinite(sapElapsed)
        ? sapElapsed
        : Math.max(0, finishMs - sapStart);

      return {
        startMs: sapStart,
        finishMs,
        elapsedMs,
        source: "sap",
      };
    }
  } catch (error) {
    console.warn(
      "[TIMER] No se pudo recuperar snapshot de tiempo:",
      error?.message || error,
    );
  }

  // 4) Último recurso acordado: 2 h 30 min, terminando "ahora".
  // Así nunca se genera una fecha futura.
  return {
    startMs: now - DEFAULT_RECOVERY_ELAPSED_MS,
    finishMs: now,
    elapsedMs: DEFAULT_RECOVERY_ELAPSED_MS,
    source: "fallback",
  };
}

async function loadPendingSign(orderId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function savePendingSign(orderId, payload) {
  try {
    await AsyncStorage.setItem(
      PENDING_SIGN_KEY(orderId),
      JSON.stringify(payload),
    );
    return true;
  } catch (error) {
    // El respaldo local ayuda a reconstruir la firma/PDF, pero nunca debe
    // detener el trabajo del técnico.
    console.warn(
      "[PENDING SIGN] No se pudo guardar respaldo local:",
      error?.message || error,
    );
    return false;
  }
}
async function clearPendingSign(orderId) {
  try {
    await AsyncStorage.removeItem(PENDING_SIGN_KEY(orderId));
  } catch {}
}

async function loadOpState(orderId) {
  try {
    const raw = await AsyncStorage.getItem(OPSTATE_KEY(orderId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function saveOpState(orderId, state) {
  try {
    await AsyncStorage.setItem(
      OPSTATE_KEY(orderId),
      JSON.stringify(state || {}),
    );
  } catch {}
}

/* ====================== Helpers generales ====================== */
function parseSapDate(val) {
  if (!val) return null;

  if (typeof val === "string" && val.startsWith("/Date(")) {
    const ms = parseInt(val.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }

  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDMY(val) {
  const d = parseSapDate(val);
  if (!d) return "—";

  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function normalizeOperationActivity(valueOrOp) {
  const raw =
    valueOrOp && typeof valueOrOp === "object"
      ? valueOrOp?.activity ??
        valueOrOp?.Activity ??
        valueOrOp?.Vornr ??
        ""
      : valueOrOp;

  const value = String(raw ?? "").trim();
  if (!value) return "";

  // SAP puede devolver 10, 010 o 0010. Usamos 4 posiciones
  // para mantener una referencia estable.
  return /^\d+$/.test(value) ? value.padStart(4, "0") : value;
}

function getOperationStatus(op) {
  return String(
    op?.estatus ??
      op?.Estatus ??
      op?.Status ??
      op?.status ??
      op?.SystemStatus ??
      op?.systemStatus ??
      "",
  )
    .trim()
    .toUpperCase();
}

function isOperationFinished(op) {
  const status = getOperationStatus(op);

  // SAP devuelve FINA para una operación finalizada.
  // Se mantienen variantes locales por compatibilidad con caché anterior.
  return ["FINA", "FIN", "FINALIZADA", "FINALIZADO"].includes(status);
}

const opKey = (orderId, op) =>
  `${String(orderId || "").trim()}-${normalizeOperationActivity(op)}`;

function getOperationMatchKeys(orderId, op) {
  const oid = String(orderId || "").trim();
  const id = String(op?.id || "").trim();
  const activityRaw = String(
    op?.activity ?? op?.Activity ?? op?.Vornr ?? "",
  ).trim();
  const activity = normalizeOperationActivity(op);

  return Array.from(
    new Set(
      [
        id,
        activityRaw,
        activity,
        oid && activityRaw ? `${oid}-${activityRaw}` : "",
        oid && activity ? `${oid}-${activity}` : "",
      ].filter(Boolean),
    ),
  );
}

function operationMatchesCheckedMap(orderId, op, map = {}) {
  return getOperationMatchKeys(orderId, op).some((key) => !!map?.[key]);
}

function uniqueOperationsByActivity(ops = []) {
  const byActivity = new Map();

  for (const op of Array.isArray(ops) ? ops : []) {
    const activity = normalizeOperationActivity(op);
    if (!activity) continue;
    if (!byActivity.has(activity)) byActivity.set(activity, op);
  }

  return Array.from(byActivity.values());
}

function buildSelectedOperationsSnapshot(ops = []) {
  return uniqueOperationsByActivity(ops).map((op) => {
    const activity = normalizeOperationActivity(op);
    const subactivity = String(
      op?.subactivity ?? op?.SubActivity ?? "",
    ).trim();
    const description = String(
      op?.description ?? op?.Description ?? op?.Ltxa1 ?? "",
    ).trim();
    const usr02 = String(op?.Usr02 ?? op?.usr02 ?? "").trim();
    const standardTextKey = String(
      op?.StandardTextKey ?? op?.standardTextKey ?? "",
    ).trim();

    // Respaldo pequeño: únicamente lo necesario para reconstruir el PDF.
    return {
      activity,
      Activity: activity,
      subactivity,
      SubActivity: subactivity,
      description,
      Description: description,
      Usr02: usr02,
      usr02,
      StandardTextKey: standardTextKey,
      standardTextKey,
      estatus: isOperationFinished(op) ? "FINA" : String(op?.estatus || ""),
    };
  });
}

function buildCheckedMapForOperations(orderId, ops = []) {
  const next = {};

  for (const op of uniqueOperationsByActivity(ops)) {
    const id = String(op?.id || "").trim() || opKey(orderId, op);
    if (id) next[id] = true;
  }

  return next;
}

function mergeCurrentOpsWithSnapshot(orderId, currentOps = [], snapshot = []) {
  const current = Array.isArray(currentOps) ? currentOps : [];
  const backup = Array.isArray(snapshot) ? snapshot : [];

  if (!backup.length) return current;

  const knownActivities = new Set(
    current.map((op) => normalizeOperationActivity(op)).filter(Boolean),
  );

  const missing = backup
    .filter((op) => {
      const activity = normalizeOperationActivity(op);
      return activity && !knownActivities.has(activity);
    })
    .map((op) => ({
      ...op,
      id: String(op?.id || "").trim() || opKey(orderId, op),
    }));

  return [...current, ...missing];
}

function resolveOperationSelection({
  orderId,
  opsAll = [],
  checkedMap = {},
  pending = null,
  allowFinishedFallback = false,
}) {
  const currentOps = Array.isArray(opsAll) ? opsAll : [];

  const pendingActivities = new Set(
    (Array.isArray(pending?.selectedActivities)
      ? pending.selectedActivities
      : []
    )
      .map((value) => normalizeOperationActivity(value))
      .filter(Boolean),
  );

  const pendingCheckedMap =
    pending?.checkedMap && typeof pending.checkedMap === "object"
      ? pending.checkedMap
      : {};

  // 1) Selección actualmente visible.
  let selectedOps = currentOps.filter((op) =>
    operationMatchesCheckedMap(orderId, op, checkedMap),
  );

  // 2) Activities guardadas al crear 0400.
  if (!selectedOps.length && pendingActivities.size) {
    selectedOps = currentOps.filter((op) =>
      pendingActivities.has(normalizeOperationActivity(op)),
    );
  }

  // 3) checkedMap anterior reconciliado contra los IDs actuales.
  if (!selectedOps.length && Object.keys(pendingCheckedMap).length) {
    selectedOps = currentOps.filter((op) =>
      operationMatchesCheckedMap(orderId, op, pendingCheckedMap),
    );
  }

  // 4) En 0400 SAP puede devolverlas directamente como FINA.
  if (!selectedOps.length && allowFinishedFallback) {
    selectedOps = currentOps.filter(isOperationFinished);
  }

  // 5) Último respaldo: snapshot mínimo.
  const snapshot = Array.isArray(pending?.selectedOperationsSnapshot)
    ? pending.selectedOperationsSnapshot
    : [];

  if (!selectedOps.length && snapshot.length) {
    selectedOps = snapshot.map((op) => ({
      ...op,
      id: String(op?.id || "").trim() || opKey(orderId, op),
    }));
  }

  selectedOps = uniqueOperationsByActivity(selectedOps);

  const opsForPdf = mergeCurrentOpsWithSnapshot(
    orderId,
    currentOps,
    snapshot,
  );

  const resolvedCheckedMap = selectedOps.length
    ? buildCheckedMapForOperations(orderId, selectedOps)
    : {};

  return {
    selectedOps,
    selectedIds: Object.keys(resolvedCheckedMap),
    checkedMap: resolvedCheckedMap,
    opsForPdf,
  };
}

/* ====== SAP helpers para fechas/horas y prorrateo ====== */
function msToMinutesRounded(ms) {
  const min = Math.round(ms / 60000);
  return Math.max(1, min);
}
function sapDateFromMs(ms) {
  const d = new Date(ms);
  const midnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  return `/Date(${midnight})/`;
}
function sapTimePTFromMs(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return `PT${h}H${m}M${s}S`;
}
function prorateMinutes(totalMin, n) {
  const base = Math.floor(totalMin / n);
  const rem = totalMin % n;
  const arr = Array(n).fill(base);
  for (let i = 0; i < rem; i++) arr[i] += 1;
  return arr;
}
function buildSequentialWindows(startMs, mins) {
  let cursor = startMs;
  return mins.map((m) => {
    const end = cursor + m * 60000;
    const win = { start: cursor, end };
    cursor = end;
    return win;
  });
}

/* ====== Bulk helpers: misma estructura que Pendientes de firma ====== */
function buildSingleWorkOrderBulkPayload({
  orderId,
  workOrderPayload,
}) {
  return {
    BulkId: buildWorkOrderBulkId({
      firstOrderId: orderId,
    }),
    WorkOrderSet: [workOrderPayload],
  };
}


/* ====================== Consumibles -> ConfirmationMaterialSet ====================== */
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeConsumiblesToMaterialSet(consumiblesRows, plantFallback) {
  const rows = Array.isArray(consumiblesRows) ? consumiblesRows : [];
  const out = [];

  for (const r of rows) {
    const Material = String(
      r?.Material ?? r?.material ?? r?.codigo ?? r?.Codigo ?? r?.matnr ?? "",
    ).trim();

    const CantidadRaw =
      r?.Cantidad ?? r?.cantidad ?? r?.qty ?? r?.Qty ?? r?.quantity ?? "0";

    const Unidad = String(
      r?.Unidad ?? r?.unidad ?? r?.uom ?? r?.Uom ?? "",
    ).trim();

    const Centro = String(plantFallback || "TLP1").trim();

    const qtyNum = toNum(CantidadRaw);
    const qtyOk =
      qtyNum != null
        ? qtyNum > 0
        : String(CantidadRaw || "").trim() !== "" &&
          String(CantidadRaw) !== "0";

    if (!Material) continue;
    if (!qtyOk) continue;
    if (!Unidad) continue;
    if (!Centro) continue;

    out.push({
      Material,
      Cantidad: String(CantidadRaw),
      Unidad,
      Centro,
    });
  }

  return out;
}

/* ====================== Payload confirmaciones desde ops seleccionadas ====================== */
function buildConfirmationPayloadFromSelectedOps({
  orderId,
  opsAll,
  selectedIds,
  startMs,
  finishMs,
  consumiblesRows,
  plantFallback,
  user, // 👈 CAMBIA 'userEmail' POR 'user' PARA TENER EL OBJETO COMPLETO
}) {
  const selectedOpsRaw = (selectedIds || [])
    .map((idKey) =>
      (opsAll || []).find((op) => String(op.id) === String(idKey)),
    )
    .filter(Boolean);

  const uniqByOp = (ops) => {
    const map = new Map();
    for (const op of ops) {
      const act = String(op.activity || op.Activity || "").trim();
      const key = `${act}`;
      if (!map.has(key)) map.set(key, op);
    }
    return Array.from(map.values());
  };

  const selectedOps = uniqByOp(selectedOpsRaw);
  if (!selectedOps.length) return null;

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(finishMs) ||
    finishMs <= startMs
  )
    return null;

  const totalMs = Math.max(0, finishMs - startMs);
  const totalMin = msToMinutesRounded(totalMs);
  const minsArr = prorateMinutes(totalMin, selectedOps.length);
  const windows = buildSequentialWindows(startMs, minsArr);

  const ConfirmationMaterialSet = normalizeConsumiblesToMaterialSet(
    consumiblesRows,
    plantFallback,
  );

  return {
    Order: "S1",
    // Ahora 'user' ya existe porque lo pasamos como parámetro
    Mail: String(user?.correo || user?.email || "").trim(),
    ConfirmationOrderSet: selectedOps.map((op, idx) => {
      const actRaw = String(op.activity || op.Activity || "").trim();
      const Operation = actRaw.padStart(4, "0");
      const w = windows[idx];

      const row = {
        ConfNo: "",
        Orderid: orderId,
        Operation,
        PostgDate: sapDateFromMs(finishMs),
        ActWork: String(minsArr[idx]),
        UnWork: "min",
        ExecStartDate: sapDateFromMs(w.start),
        ExecFinDate: sapDateFromMs(w.end),
        ExecStartTime: sapTimePTFromMs(w.start),
        ExecFinTime: sapTimePTFromMs(w.end),
        FinConf: "X",
      };
      return row;
    }),
    ConfirmationMaterialSet,
    Return: [],
  };
}

/* ====================== Dirección ====================== */
function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };

  const Name1 = addr.Name1 ?? "";
  const Name2 = addr.Name2 ?? "";
  const Street = addr.Street ?? addr.StreetName ?? "";
  const HouseNum1 = addr.HouseNum1 ?? "";
  const StrSuppl3 = addr.StrSuppl3 ?? "";
  const Location = addr.Location ?? "";
  const City1 = addr.City1 ?? "";
  const Region = addr.Region ?? "";
  const PostCode1 = addr.PostCode1 ?? "";
  const Country = addr.Country ?? "";

  const cliente = [Name1, Name2].filter(Boolean).join(" ").trim();
  const direccion = [
    `${Street} ${HouseNum1}`.trim(),
    StrSuppl3,
    Location,
    City1,
    Region,
    PostCode1,
    Country,
  ]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");

  return { cliente, direccion };
}
function pickFirstAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results[0];
}

function mergeOpsWithLocalState(orderId, ops, state) {
  return (ops || []).map((o) => {
    const id = o.id || opKey(orderId, o);
    const st = state?.[id] || {};

    const sapEstatus = String(o?.estatus || "pendiente").toLowerCase();
    const estatusFinal = isOperationFinished(o)
      ? "finalizada"
      : st.estatus || sapEstatus || "pendiente";

    return {
      ...o,
      id,
      estatus: estatusFinal,
      worked_ms: st.worked_ms ?? o.worked_ms ?? 0,
      last_resume_at: st.last_resume_at ?? o.last_resume_at ?? null,
      Strttimcon: st.started_at ?? o.Strttimcon ?? null,
      Fintimcons: st.finished_at ?? o.Fintimcons ?? null,
      paused_at: st.paused_at ?? o.paused_at ?? null,
      pause_motivo: st.pause_motivo ?? o.pause_motivo ?? null,
    };
  });
}

function formatValueForRow(value) {
  if (value == null) return "—";

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return String(value);

  if (t === "object") {
    const {
      calle,
      street,
      colonia,
      neighborhood,
      municipio,
      city,
      estado,
      region,
      estado_provincia,
      cp,
      postalCode,
      zip,
      pais,
      country,
      full,
      direccion,
    } = value;

    const posibleFull =
      full || direccion || value.fullAddress || value.addressString;
    if (posibleFull && typeof posibleFull === "string") return posibleFull;

    const partes = [
      calle || street,
      colonia || neighborhood,
      municipio || city,
      estado || region || estado_provincia,
      cp || postalCode || zip,
      pais || country,
    ]
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);

    if (partes.length) return partes.join(", ");

    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }

  try {
    return String(value);
  } catch {
    return "—";
  }
}

function normalizeOpsFromBackend(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";

    return {
      ...op,
      activity: String(Activity || ""),
      description: String(Description || ""),
      Activity: String(Activity || ""),
      Description: String(Description || ""),
      StandardTextKey: String(StandardTextKey || ""),
      standardTextKey: String(StandardTextKey || ""),
    };
  });
}

const safeStr = (v) => String(v ?? "").trim();

async function loadTbmkyEquipmentType(orderId) {
  try {
    const raw = await AsyncStorage.getItem(TBMKY_JSON_KEY(orderId));
    const saved = raw ? JSON.parse(raw) : null;

    return normalizeEquipmentType(
      saved?.tipo_equipo ||
        saved?.equipoSeleccionado ||
        saved?.equipoId ||
        saved?.equipoLabel,
    );
  } catch (error) {
    console.log(
      "[DETALLE] No se pudo leer el tipo guardado por TBMK:",
      error?.message || error,
    );
    return null;
  }
}

function detectCoberturaFromShortText(shortText) {
  const s = String(shortText || "").toUpperCase();

  if (s.includes("COBERTURA BASICA")) return "BASICA";
  if (s.includes("COBERTURA MEDIA")) return "MEDIA";
  if (s.includes("COBERTURA SEMI")) return "SEMI";

  return "SIN COBERTURA";
}

/* ====================== Estatus ====================== */
function normalizeCode(code) {
  if (code === null || code === undefined) return "";
  const s = String(code).trim();
  if (!s) return "";
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;
  return String(n).padStart(4, "0");
}

function extractCodes(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const matches = s.match(/\d{1,4}/g) || [];
  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));
  return Array.from(new Set(codes));
}

function pickCurrentStatusCode(orden) {
  const apiCode = normalizeCode(orden?.estatus_code ?? "");

  // estatus_code ya contiene el estatus efectivo reconciliado por el index.
  // Si existe, debe usarse directamente, incluso cuando represente un regreso
  // válido de 0200 a 0100 realizado directamente en SAP.
  if (apiCode) return apiCode;

  const codes = extractCodes(
    orden?.userstatus ??
      orden?.Userstatus ??
      orden?.UserStatus ??
      orden?.UserStText ??
      "",
  );

  const all = Array.from(new Set(codes || []));

  // Prioridad de los únicos estatus válidos actuales.
  if (all.includes("0600")) return "0600";
  if (all.includes("0400")) return "0400";
  if (all.includes("0300")) return "0300";
  if (all.includes("0200")) return "0200";
  if (all.includes("0100")) return "0100";

  return codes[0] || "";
}

function buildStatus0300Payload({ orderId, email, currentCode }) {
  const remove = currentCode === "0400" ? "0400" : "0200";
  return {
    OrderId: orderId,
    WorkOrderHeader: {
      Orderid: orderId,
      Email: email,
    },
    WorkOrderUserStatusSet: [
      { UserStText: "0300", Langu: "ES", Inactive: "" },
      { UserStText: remove, Langu: "ES", Inactive: "X" },
    ],
    Return: [],
  };
}

/* ====================== Logs ====================== */
function maskBase64Deep(value) {
  if (Array.isArray(value)) return value.map(maskBase64Deep);

  if (value && typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) {
      next[key] =
        key === "Base64"
          ? `<<base64 omitted: ${String(value[key] || "").length} chars>>`
          : maskBase64Deep(value[key]);
    }
    return next;
  }

  return value;
}

function logSapPayload(label, payload, { stripBase64 = false } = {}) {
  try {
    if (!payload) {
      console.log(label, payload);
      return;
    }

    console.log(label);
    console.log(
      JSON.stringify(stripBase64 ? maskBase64Deep(payload) : payload, null, 2),
    );
  } catch {
    console.log(label, payload);
  }
}

/* ====================== Email / Red ====================== */
function isValidEmail(email) {
  const s = String(email || "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function resolveStatusLabelFromCode(code, fallbackLabel = "") {
  const c = normalizeCode(code);

  if (!c) return "Sin empezar";
  if (c === "0100") return "PENDIENTE";
  if (c === "0200") return "EN PROCESO";
  if (c === "0300") return "FINALIZADA";
  if (c === "0400") return "PENDIENTE DE FIRMA";
  if (c === "0600") return "Carta No Mantto";

  return String(fallbackLabel || c || "—").trim();
}

function isNetworkLikeError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  const hasResponse = !!error?.response;

  if (!hasResponse) {
    if (
      msg.includes("network error") ||
      msg.includes("timeout") ||
      msg.includes("socket") ||
      msg.includes("aborted") ||
      msg.includes("load failed") ||
      msg.includes("failed to fetch") ||
      code === "ECONNABORTED" ||
      code === "ERR_NETWORK" ||
      code === "ETIMEDOUT"
    ) {
      return true;
    }
  }

  return false;
}

function getSapErrorMessage(error, fallback = "Ocurrió un error con SAP.") {
  const data = error?.response?.data;
  return (
    data?.error?.message?.value ||
    data?.message?.value ||
    data?.detail ||
    (typeof data?.error === "string" ? data.error : null) ||
    error?.message ||
    fallback
  );
}

function makeCheckinQueueKey(userEmail) {
  const safe =
    String(userEmail || "anon")
      .toLowerCase()
      .trim() || "anon";
  return `checkin_queue_v1_${safe}`;
}

async function hasOfflineQueuedCheckin(userEmail, orderId) {
  try {
    const key = makeCheckinQueueKey(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return false;

    return arr.some(
      (x) => String(x?.orderId || "").trim() === String(orderId || "").trim(),
    );
  } catch {
    return false;
  }
}

const BG_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos

function isTimeoutError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    msg.includes("timeout") ||
    msg.includes("tiempo de espera") ||
    msg.includes("exceeded")
  );
}

async function postWithBackgroundFallback({
  apiInstance,
  endpoint,
  payload,
  timeoutMs = BG_TIMEOUT_MS,
  enqueueFn,
  queueItem,
}) {
  try {
    const response = await apiInstance.post(endpoint, payload, {
      timeout: timeoutMs,
    });

    return {
      ok: true,
      queued: false,
      response,
    };
  } catch (error) {
    const networkLike = isNetworkLikeError(error);
    const timeoutLike = isTimeoutError(error);

    if (networkLike || timeoutLike) {
      await enqueueFn(queueItem);

      return {
        ok: true,
        queued: true,
        response: null,
        error,
      };
    }

    throw error;
  }
}

function hasValidConsumibles(consumiblesRows) {
  const rows = Array.isArray(consumiblesRows) ? consumiblesRows : [];

  return rows.some((r) => {
    const material = String(
      r?.Material ?? r?.material ?? r?.codigo ?? r?.Codigo ?? r?.matnr ?? "",
    ).trim();

    const cantidadRaw =
      r?.Cantidad ?? r?.cantidad ?? r?.qty ?? r?.Qty ?? r?.quantity ?? "";

    const unidad = String(
      r?.Unidad ?? r?.unidad ?? r?.uom ?? r?.Uom ?? "",
    ).trim();

    const cantidadNum = Number(cantidadRaw);
    const cantidadValida = Number.isFinite(cantidadNum) && cantidadNum > 0;

    return !!material && cantidadValida && !!unidad;
  });
}

function normalizeDetailForView(detail, fallbackOrderId = "") {
  if (!detail || typeof detail !== "object") return detail;

  const operations =
    detail?.operaciones ||
    detail?.Operations ||
    detail?.ToOperations?.results ||
    [];

  return {
    ...detail,
    Orderid:
      detail?.Orderid ||
      detail?.OrderId ||
      detail?.OrderID ||
      detail?.orderid ||
      fallbackOrderId,
    equipment:
      detail?.equipment ||
      detail?.Equipment ||
      detail?.EQUIPMENT ||
      "",
    start_date:
      detail?.start_date ||
      detail?.StartDate ||
      detail?.startDate ||
      detail?.BasicStartDate ||
      detail?.BasicStart ||
      "",
    finish_date:
      detail?.finish_date ||
      detail?.FinishDate ||
      detail?.finishDate ||
      detail?.BasicFinDate ||
      detail?.BasicFinish ||
      "",
    order_type:
      detail?.order_type ||
      detail?.OrderType ||
      detail?.Ordertype ||
      "",
    operaciones: Array.isArray(operations) ? operations : [],
  };
}

function isCachedDetailUsable(detail, fallbackOrderId = "") {
  if (!detail || typeof detail !== "object") return false;

  const orderId = String(
    detail?.Orderid ||
      detail?.OrderId ||
      detail?.OrderID ||
      detail?.orderid ||
      fallbackOrderId ||
      "",
  ).trim();

  if (!orderId) return false;

  const operations =
    detail?.operaciones ||
    detail?.Operations ||
    detail?.ToOperations?.results;

  const operationsWereFetched =
    detail?._prefetch_status?.operaciones === true;

  const headerWasFetched =
    detail?._prefetch_status?.header === true;

  const equipment = String(
    detail?.equipment ||
      detail?.Equipment ||
      detail?.EQUIPMENT ||
      "",
  ).trim();

  const startDate =
    detail?.start_date ||
    detail?.StartDate ||
    detail?.startDate ||
    detail?.BasicStartDate ||
    detail?.BasicStart ||
    null;

  const shortText = String(
    detail?.ShortText ||
      detail?.short_text ||
      detail?.shortText ||
      "",
  ).trim();

  const hasHeaderInformation =
    !!equipment ||
    !!startDate ||
    !!shortText;

  return (
    Array.isArray(operations) &&
    operationsWereFetched &&
    headerWasFetched &&
    hasHeaderInformation
  );
}

function getOrderIdValue(item) {
  return String(
    item?.Orderid ?? item?.OrderId ?? item?.orderid ?? "",
  ).trim();
}

function normalizeOrderIdForCompare(value) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";

  // SAP puede devolver el mismo número de orden con o sin ceros iniciales.
  // No usamos Number para evitar pérdida de precisión en identificadores largos.
  const withoutLeadingZeros = clean.replace(/^0+(?=\d)/, "");
  return withoutLeadingZeros || "0";
}

function hasOwnStatusField(order, fieldName) {
  return Object.prototype.hasOwnProperty.call(order || {}, fieldName);
}

function getEffectiveSharedStatusCode(sharedOrder) {
  if (!sharedOrder) return "";

  /*
   * estatus_code viene del index después de reconciliar SAP, caché,
   * parche local y cola.
   *
   * Es importante revisar si la propiedad existe, no si tiene contenido:
   * estatus_code: "" es un valor válido y significa "Sin empezar".
   */
  if (hasOwnStatusField(sharedOrder, "estatus_code")) {
    return normalizeCode(sharedOrder.estatus_code);
  }

  return normalizeCode(
    sharedOrder?.userstatus ??
      sharedOrder?.Userstatus ??
      sharedOrder?.UserStatus ??
      sharedOrder?.UserStText ??
      "",
  );
}

function mergeStatusFromSharedOrder(detail, sharedOrder) {
  if (!detail || !sharedOrder) return detail;

  const sharedCode = getEffectiveSharedStatusCode(sharedOrder);
  const isSinEmpezar = sharedCode === "";

  return {
    ...detail,

    // Se limpian también todos los campos alternativos de estatus.
    estatus_code: sharedCode,
    userstatus: sharedCode,
    Userstatus: sharedCode,
    UserStatus: sharedCode,
    UserStText: sharedCode,

    estatus_label: isSinEmpezar
      ? "Sin empezar"
      : sharedOrder?.estatus_label ||
        resolveStatusLabelFromCode(sharedCode),

    isPendingSignature: sharedCode === "0400",

    isFinal: ["0300", "0500", "0600"].includes(sharedCode),

    checkin_done: [
      "0100",
      "0200",
      "0300",
      "0301",
      "0400",
      "0500",
      "0600",
    ].includes(sharedCode),
  };
}

/* ====================== Componente ====================== */
export default function DetalleOrden() {
  const { id } = useLocalSearchParams();
  const { user, ensureValidToken } = useAuth();
  const { ordenes: ordenesCompartidas = [] } = useOrdenesTecnico();

  const sharedOrder = (Array.isArray(ordenesCompartidas)
    ? ordenesCompartidas
    : []
  ).find(
    (item) =>
      normalizeOrderIdForCompare(getOrderIdValue(item)) ===
      normalizeOrderIdForCompare(id),
  );

  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const signatureRef = useRef(null);
  const wasOnlineRef = useRef(false);

  const [finalizeMode, setFinalizeMode] = useState(false);
  const [checkedMap, setCheckedMap] = useState({});

  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCargo, setClienteCargo] = useState("");
  const [avisoCliente, setAvisoCliente] = useState("");

  const [notaTecnico, setNotaTecnico] = useState("");
  const [consumibles, setConsumibles] = useState([]);

  const [startingOrder, setStartingOrder] = useState(false);
  const [orderStartedAtMs, setOrderStartedAtMs] = useState(null);
  const [orderFinishedAtMs, setOrderFinishedAtMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [orderElapsedMs, setOrderElapsedMs] = useState(null);

  const [showMantPreview, setShowMantPreview] = useState(false);
  const [mantHtmlPreview, setMantHtmlPreview] = useState(null);
  const [mantPdfUri, setMantPdfUri] = useState(null);
  const [pendingFinalize, setPendingFinalize] = useState(null);

  const [showCompModal, setShowCompModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [compList, setCompList] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);

  const [showAllMaterialsModal, setShowAllMaterialsModal] = useState(false);

  const [finishingOrder, setFinishingOrder] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [savingPending0400, setSavingPending0400] = useState(false);
  const [hasPendingOfflineCheckin, setHasPendingOfflineCheckin] =
    useState(false);

  const userEmail = String(
    user?.correo ||
      user?.email ||
      user?.username ||
      user?.preferred_username ||
      "unknown",
  ).trim();

  const baseStatusCode = pickCurrentStatusCode(orden);

  const isAdvancedStatus = ["0400", "0300", "0600"].includes(baseStatusCode);

  // ✅ Solo mostrar 0100 por check-in pendiente si la orden NO avanzó.
  // Si ya está 0400, 0300 o 0600, respetamos ese estatus.
  const statusCode =
    hasPendingOfflineCheckin && !isAdvancedStatus && baseStatusCode !== "0200"
      ? "0100"
      : baseStatusCode;
  const statusLabel =
    hasPendingOfflineCheckin && !isAdvancedStatus && statusCode !== "0200"
      ? "CHECK-IN PENDIENTE (OFFLINE)"
      : resolveStatusLabelFromCode(
          statusCode,
          String(
            orden?.estatus_label || orden?.estatus || orden?.status || "",
          ).trim(),
        );

  const statusTipo = String(orden?.estatus_tipo || "").toUpperCase();

  // Nueva regla:
  // Carta No Mantto solo debe identificarse por 0600.
  // Dejamos statusTipo como apoyo temporal por si viene de cache viejo.
  const isNoMant = statusCode === "0600" || statusTipo === "NO_MANTENIMIENTO";

  const isOrderSinEmpezar = !statusCode;
  const isOrderPendiente0100 = statusCode === "0100";

  const isOrderFinishedReal =
    statusCode === "0300" || statusCode === "0600" || !!orden?.isFinal;
  const isPending0400 =
    statusCode === "0400" || String(statusCode).includes("0400");

  const estatusTxt = String(
    orden?.estatus_label || orden?.estatus || orden?.status || "",
  )
    .trim()
    .toUpperCase();

  const isOrderEnProceso =
    estatusTxt === "EN_PROCESO" ||
    estatusTxt === "EN PROCESO" ||
    statusCode === "0200";

  const coberturaTipo = String(orden?.cobertura_tipo || "")
    .trim()
    .toUpperCase();

  const checkinDone =
    statusCode === "0200" ||
    (!hasPendingOfflineCheckin &&
      (!!orden?.checkin_done || !!orden?.checkin || !!orden?.checked_in));

  const canStartTimer =
    isOrderEnProceso && !isNoMant && !isOrderFinishedReal && !!checkinDone;
  const showRunningTimer = isOrderEnProceso && !!orderStartedAtMs;
  const showFrozenTimer = isPending0400 && orderElapsedMs != null;

  const safeSaveDetailIfWindow = async (orderId, detailObj) => {
    if (!detailObj) return;
    const ok = shouldCacheDetailByOrder(detailObj, new Date());
    if (!ok) return;
    await saveOrdenTecnicoDetail(orderId, detailObj);
  };

  const resolveEquipmentTypeForCurrentOrder = async (pendingData = null) => {
    const orderId = String(orden?.Orderid || id || "").trim();

    const pendingType = normalizeEquipmentType(
      pendingData?.tipo_equipo ||
        pendingData?.EquipmentType ||
        pendingData?.equipoSeleccionado,
    );
    const orderType = getEquipmentTypeFromOrder(orden);
    const tbmkyType = orderId
      ? await loadTbmkyEquipmentType(orderId)
      : null;

    let resolvedType = pendingType || orderType || tbmkyType;

    if (!resolvedType) {
      const equipmentNumber = String(
        orden?.Equipment || orden?.equipment || orden?.EQUIPMENT || "",
      ).trim();

      if (equipmentNumber) {
        const sapResult = await fetchEquipmentType(equipmentNumber);
        resolvedType = normalizeEquipmentType(sapResult?.type);
      }
    }

    if (!resolvedType || !orderId) {
      return resolvedType || null;
    }

    const nextOrder = {
      ...(orden || {}),
      tipo_equipo: resolvedType,
      EquipmentType: resolvedType,
    };

    setOrden((prev) => ({
      ...(prev || {}),
      tipo_equipo: resolvedType,
      EquipmentType: resolvedType,
    }));

    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      await safeSaveDetailIfWindow(orderId, {
        ...(cached?.data || nextOrder),
        tipo_equipo: resolvedType,
        EquipmentType: resolvedType,
      });
    } catch (error) {
      console.log(
        "[DETALLE] No se pudo guardar localmente el tipo de equipo:",
        error?.message || error,
      );
    }

    return resolvedType;
  };

  const applyLocalOrderStatus = async (orderId, code) => {
    const statusCodeStr = normalizeCode(code);
    const statusLabelStr = resolveStatusLabelFromCode(statusCodeStr);

    const localPatch = {
      estatus_code: statusCodeStr,
      userstatus: statusCodeStr,
      UserStatus: statusCodeStr,
      UserStText: statusCodeStr,
      estatus_label: statusLabelStr,

      // ✅ Extra para que la pantalla identifique bien 0400
      isPendingSignature: statusCodeStr === "0400",
      isFinal: statusCodeStr === "0300" || statusCodeStr === "0600",
    };

    setOrden((prev) => ({
      ...(prev || {}),
      ...localPatch,
    }));

    try {
      await setLocalStatusPatch(userEmail, orderId, statusCodeStr);
      await patchCacheOrdenesTecnicoList(userEmail, orderId, statusCodeStr);
      await patchCacheOrdenTecnicoDetail(orderId, statusCodeStr);

      // ✅ Guardar también el detalle completo con el estatus nuevo
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};

      await safeSaveDetailIfWindow(orderId, {
        ...(base || {}),
        ...localPatch,
      });

      // ✅ Si ya avanzó a 0400/0300/0600, quitamos marca vieja de TBM/check-in
      if (["0400", "0300", "0600"].includes(statusCodeStr)) {
        await AsyncStorage.removeItem(`tbmky_status_${String(orderId).trim()}`);
      }

      console.log("[DETALLE][STATUS][LOCAL]", {
        orderId,
        statusCodeStr,
        statusLabelStr,
      });
    } catch (e) {
      console.log("[DETALLE] applyLocalOrderStatus error:", e?.message || e);
    }
  };

  const updateLocalOpsAsFinalizadas = async (orderId, selectedOpIds) => {
    const current = await loadOpState(orderId);
    const next = { ...(current || {}) };

    for (const opId of selectedOpIds) {
      next[opId] = {
        ...(next[opId] || {}),
        estatus: "finalizada",
        finished_at: next[opId]?.finished_at ?? Date.now(),
      };
    }

    await saveOpState(orderId, next);

    setOrden((prev) => {
      const ops = Array.isArray(prev?.operaciones) ? prev.operaciones : [];
      const ops2 = ops.map((o) => {
        const oid = String(o?.id ?? "");
        if (selectedOpIds.includes(oid)) return { ...o, estatus: "finalizada" };
        return o;
      });
      return { ...(prev || {}), operaciones: ops2 };
    });

    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};
      const ops = Array.isArray(base?.operaciones) ? base.operaciones : [];
      const ops2 = ops.map((o) => {
        const oid = String(o?.id ?? "");
        if (selectedOpIds.includes(oid)) return { ...o, estatus: "finalizada" };
        return o;
      });
      await safeSaveDetailIfWindow(orderId, {
        ...(base || {}),
        operaciones: ops2,
      });
    } catch {}
  };

  const updateLocalOrderAsFinalizada0300 = async (orderId, finishMs) => {
    await saveOrderFinish(orderId, finishMs);
    setOrderFinishedAtMs(finishMs);

    try {
      const startMs = await loadOrderStart(orderId);
      if (startMs) {
        const elapsedFinal = Math.max(0, finishMs - startMs);
        await saveOrderElapsed(orderId, elapsedFinal);
        setOrderElapsedMs(elapsedFinal);
      }
    } catch {}

    setOrden((prev) => ({
      ...(prev || {}),
      estatus_code: "0300",
      userstatus: "0300",
      UserStatus: "0300",
      UserStText: "0300",
      estatus_label: "FINALIZADA",
      isFinal: true,
    }));

    try {
      const cached = await loadOrdenTecnicoDetail(orderId);
      const base = cached?.data || orden || {};

      await safeSaveDetailIfWindow(orderId, {
        ...(base || {}),
        estatus_code: "0300",
        userstatus: "0300",
        UserStatus: "0300",
        UserStText: "0300",
        estatus_label: "FINALIZADA",
        isFinal: true,
      });

      await setLocalStatusPatch(userEmail, orderId, "0300");
      await patchCacheOrdenesTecnicoList(userEmail, orderId, "0300");
      await patchCacheOrdenTecnicoDetail(orderId, "0300");
      await AsyncStorage.removeItem(`tbmky_status_${String(orderId).trim()}`);
    } catch (e) {
      console.log("[FINALIZAR][0300][LOCAL] error:", e?.message || e);
    }
  };

  const enqueueSap = async ({
    type,
    orderId,
    endpoint,
    payload,
    dedupeKey,
    method,
  }) => {
    if (typeof upsertSapQueueItem !== "function") {
      throw new Error(
        "upsertSapQueueItem no existe en src/offline/sapQueue.js. Asegúrate de exportarla.",
      );
    }

    await upsertSapQueueItem({
      type,
      orderId,
      endpoint,
      payload,
      method: method || "POST",
      dedupeKey,
      key: dedupeKey,
    });
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const orderIdGuess = String(id || "").trim();
      if (!orderIdGuess) return;

      const savedStart = await loadOrderStart(orderIdGuess);
      const savedFinish = await loadOrderFinish(orderIdGuess);
      const savedElapsed = await loadOrderElapsed(orderIdGuess);

      if (mounted) {
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
        if (savedFinish) setOrderFinishedAtMs(savedFinish);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNowTick(Date.now());
    });
    return () => sub.remove();
  }, []);


  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;

      try {
        const net = await NetInfo.fetch();
        const online = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );
        if (!online) return;

        console.log("📲 App activa, intentando procesar cola SAP...");
        await processSapQueue({
          ensureValidToken,
          apiInstance: api,
        });
      } catch (e) {
        console.warn(
          "Error procesando cola al volver a la app:",
          e?.message || e,
        );
      }
    });

    return () => sub.remove();
  }, [ensureValidToken]);


  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (state) => {
      const online = !!(
        state?.isConnected && state?.isInternetReachable !== false
      );

      if (online && !wasOnlineRef.current) {
        wasOnlineRef.current = true;
        try {
          console.log("📡 Conexión restaurada, procesando cola SAP…");
          await processSapQueue({
            ensureValidToken,
            apiInstance: api,
          });
        } catch (e) {
          console.warn("Error procesando cola SAP:", e?.message || e);
        }
      }

      if (!online) wasOnlineRef.current = false;
    });

    return () => unsub();
  }, [ensureValidToken]);

  useEffect(() => {
    if (!showRunningTimer) return;
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") setNowTick(Date.now()); });
    return () => { clearInterval(t); subscription.remove(); };
  }, [showRunningTimer, orderStartedAtMs]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const orderId = String(orden?.Orderid || id || "").trim();
      if (!orderId) {
        if (mounted) setHasPendingOfflineCheckin(false);
        return;
      }

      const pending = await hasOfflineQueuedCheckin(
        user?.correo || user?.email || user?.username || null,
        orderId,
      );

      if (mounted) setHasPendingOfflineCheckin(pending);
    })();

    return () => {
      mounted = false;
    };
  }, [orden?.Orderid, id, user?.correo, user?.email, user?.username]);

  const obtenerOrden = async () => {
    const orderIdParam = String(id || "").trim();

    try {
      setLoading(true);

      const cached = await loadOrdenTecnicoDetail(orderIdParam);
      const cachedDataNormalized = normalizeDetailForView(
        cached?.data,
        orderIdParam,
      );

      const cachedDataReconciled = mergeStatusFromSharedOrder(
        cachedDataNormalized,
        sharedOrder,
      );
      const hasUsableCachedDetail = isCachedDetailUsable(
        cachedDataReconciled,
        orderIdParam,
      );

      if (cachedDataReconciled) {
        setOrden(cachedDataReconciled);

        if (
          normalizeCode(cached?.data?.estatus_code ?? cached?.data?.userstatus) !==
          normalizeCode(
            cachedDataReconciled?.estatus_code ??
              cachedDataReconciled?.userstatus,
          )
        ) {
          await safeSaveDetailIfWindow(orderIdParam, cachedDataReconciled);
        }
        // El detalle guardado ya se puede pintar. No bloqueamos la pantalla
        // mientras se decide si hace falta actualizarlo desde SAP.
        setLoading(false);

        const cachedOrderId = String(
          cachedDataReconciled?.Orderid || orderIdParam,
        ).trim();

        const savedStartCached = await loadOrderStart(cachedOrderId);
        if (savedStartCached) {
          setOrderStartedAtMs(savedStartCached);
          setNowTick(Date.now());
        }

        const savedFinishCached = await loadOrderFinish(cachedOrderId);
        if (savedFinishCached) setOrderFinishedAtMs(savedFinishCached);

        const savedElapsedCached = await loadOrderElapsed(cachedOrderId);
        if (savedElapsedCached != null) setOrderElapsedMs(savedElapsedCached);

        const pendingCached = await loadPendingSign(cachedOrderId);
        if (pendingCached) {
          const restoredSelection = resolveOperationSelection({
            orderId: cachedOrderId,
            opsAll: Array.isArray(cachedDataReconciled?.operaciones)
              ? cachedDataReconciled.operaciones
              : [],
            checkedMap: pendingCached?.checkedMap || {},
            pending: pendingCached,
            allowFinishedFallback:
              normalizeCode(
                cachedDataReconciled?.estatus_code ??
                  cachedDataReconciled?.userstatus ??
                  "",
              ) === "0400",
          });

          if (restoredSelection.selectedOps.length) {
            setCheckedMap(restoredSelection.checkedMap);
          } else if (pendingCached?.checkedMap) {
            setCheckedMap(pendingCached.checkedMap || {});
          }
        }
        if (Array.isArray(pendingCached?.consumibles))
          setConsumibles(pendingCached.consumibles);
        if (typeof pendingCached?.notaTecnico === "string")
          setNotaTecnico(pendingCached.notaTecnico || "");
        if (typeof pendingCached?.clienteNombre === "string")
          setClienteNombre(pendingCached.clienteNombre || "");
        if (typeof pendingCached?.clienteCargo === "string")
          setClienteCargo(pendingCached.clienteCargo || "");
        if (typeof pendingCached?.avisoCliente === "string")
          setAvisoCliente(pendingCached.avisoCliente || "");

        if (Number.isFinite(pendingCached?.orderStartedAtMs)) {
          setOrderStartedAtMs(pendingCached.orderStartedAtMs);
        }
        if (Number.isFinite(pendingCached?.orderFinishedAtMs)) {
          setOrderFinishedAtMs(pendingCached.orderFinishedAtMs);
        }
        if (Number.isFinite(pendingCached?.orderElapsedMs)) {
          setOrderElapsedMs(pendingCached.orderElapsedMs);
        }

        const emailCached = String(cachedDataReconciled?.cliente_email || "").trim();
        if (emailCached && isValidEmail(emailCached))
          setClienteEmail(emailCached);

        const cn = String(cachedDataReconciled?.cliente_nombre || "").trim();
        const cc = String(cachedDataReconciled?.cliente_cargo || "").trim();
        const av = String(cachedDataReconciled?.aviso_cliente || "").trim();
        if (cn) setClienteNombre(cn);
        if (cc) setClienteCargo(cc);
        if (av) setAvisoCliente(av);
      }

      // El caché se muestra primero para que la pantalla abra rápido.
      // Si sigue vigente se usa como resultado final; si venció, SAP se
      // consulta en segundo plano sin volver a bloquear la vista.
      const net = await NetInfo.fetch();
      const isOnline = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      if (!isOnline) {
        if (!cached?.data) {
          Alert.alert(
            "Sin conexión",
            "No hay internet y no hay detalle guardado aún para esta orden.",
          );
        }
        return;
      }

      if (
        hasUsableCachedDetail &&
        isCacheFresh(cached?.updatedAt, ORDENES_CACHE_TTL_MS)
      ) {
        console.log("[DETALLE ORDEN] Usando detalle vigente de caché:", {
          orderId: orderIdParam,
          cachedUpdatedAt: cached?.updatedAt || null,
        });
        return;
      }

      console.log("[DETALLE ORDEN] Validando detalle actual en SAP:", {
        orderId: orderIdParam,
        hasCachedDetail: !!cached?.data,
        cachedUpdatedAt: cached?.updatedAt || null,
      });

      const resOrden = await api.get(`/api/ordenes/sap/${orderIdParam}`);
      const baseOrden = resOrden.data || {};

      let shortTextHeader = "";
      try {
        const resHeader = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')`,
        );

        shortTextHeader =
          resHeader?.data?.d?.ShortText ||
          resHeader?.data?.d?.shorttext ||
          resHeader?.data?.d?.ShortText ||
          resHeader?.data?.d?.shorttext ||
          "";
      } catch (e) {
        console.warn(
          "[COBERTURA] No se pudo cargar WorkOrderHeaderSet:",
          e?.response?.data || e?.message || e,
        );
      }

      const shortTextForCoverage =
        shortTextHeader ||
        baseOrden?.ShortText ||
        baseOrden?.shorttext ||
        baseOrden?.Shorttext ||
        baseOrden?.shortText ||
        "";

      const coberturaDetectada =
        detectCoberturaFromShortText(shortTextForCoverage);

      let direccionSap = "";
      let clienteSap = "";
      try {
        const resAddr = await api.get(
          `/api/ordenes/sap/${orderIdParam}/addresses`,
        );
        const results =
          resAddr?.data?.results || resAddr?.data?.d?.results || [];
        const chosen = pickFirstAddress(results);
        const mapped = mapDireccionLikeBackend(chosen);
        direccionSap = mapped.direccion || "";
        clienteSap = mapped.cliente || "";
      } catch (e) {
        console.warn(
          "[ADDR] no se pudo cargar /addresses:",
          e?.response?.data || e?.message || e,
        );
      }

      let ops = [];
      try {
        const resOps = await api.get(
          `/api/operaciones/sap/${String(orderIdParam)}`,
        );
        const rawOps =
          resOps?.data?.d?.results ||
          resOps?.data?.results ||
          resOps?.data?.operaciones ||
          resOps?.data ||
          [];

        ops = normalizeOpsFromBackend(rawOps);
      } catch (e) {
        console.warn(
          "No se pudieron cargar operaciones:",
          e?.response?.data || e,
        );
        ops = normalizeOpsFromBackend(
          baseOrden?.operaciones || cached?.data?.operaciones || [],
        );
      }

      const orderIdReal = String(
        baseOrden?.Orderid || baseOrden?.OrderId || orderIdParam,
      ).trim();
      const opsWithId = ops.map((o) => ({
        ...o,
        id: o.id || opKey(orderIdReal, o),
      }));

      const localState = await loadOpState(orderIdReal);
      const opsMerged = mergeOpsWithLocalState(
        orderIdReal,
        opsWithId,
        localState,
      );

      let emailFromPartners = "";
      try {
        const resPartners = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderIdParam}')/ToPartners`,
        );

        const results =
          resPartners?.data?.d?.results ||
          resPartners?.data?.results ||
          resPartners?.data?.d?.ToPartners?.results ||
          [];

        const re = (results || []).find(
          (p) => String(p?.PartnRoleOld || "").trim() === "RE",
        );
        emailFromPartners = String(re?.Mail1 || re?.Mail2 || "").trim();
      } catch (e) {
        console.warn(
          "[MAIL] no se pudo cargar ToPartners:",
          e?.response?.data || e?.message || e,
        );
      }

      const dataFromSap = {
        ...(cached?.data || {}),
        ...baseOrden,
        ShortText:
          shortTextForCoverage ||
          baseOrden?.ShortText ||
          cached?.data?.ShortText ||
          "",
        cobertura_tipo:
          coberturaDetectada ||
          baseOrden?.cobertura_tipo ||
          cached?.data?.cobertura_tipo ||
          null,
        direccion:
          direccionSap ||
          baseOrden?.direccion ||
          baseOrden?.address ||
          baseOrden?.partner_address ||
          cached?.data?.direccion ||
          "",
        cliente:
          clienteSap ||
          baseOrden?.cliente ||
          `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim() ||
          cached?.data?.cliente ||
          "",
        cliente_email:
          emailFromPartners ||
          baseOrden?.cliente_email ||
          cached?.data?.cliente_email ||
          "",
        operaciones: opsMerged,
        cliente_nombre: String(clienteNombre || "").trim(),
        cliente_cargo: String(clienteCargo || "").trim(),
        aviso_cliente: String(avisoCliente || "").trim(),
      };

      // El listado central ya contiene el estatus efectivo reconciliado:
      // SAP cuando no hay pendientes, o el parche local cuando se trabaja
      // offline. El detalle conserva todos sus datos, pero usa ese mismo
      // estatus para que ambas pantallas nunca se contradigan.
      const data = mergeStatusFromSharedOrder(dataFromSap, sharedOrder);

      setOrden(data);

      const emailResolved = String(emailFromPartners || "").trim();
      if (
        emailResolved &&
        isValidEmail(emailResolved) &&
        !String(clienteEmail || "").trim()
      ) {
        setClienteEmail(emailResolved);
      }

      await safeSaveDetailIfWindow(orderIdReal, data);

      if (orderIdParam && orderIdParam !== orderIdReal) {
        const oldStart = await loadOrderStart(orderIdParam);
        const realStart = await loadOrderStart(orderIdReal);
        if (oldStart && !realStart) {
          await saveOrderStart(orderIdReal, oldStart);
          await clearOrderStart(orderIdParam);
          setOrderStartedAtMs(oldStart);
          setNowTick(Date.now());
        }

        const oldFinish = await loadOrderFinish(orderIdParam);
        const realFinish = await loadOrderFinish(orderIdReal);
        if (oldFinish && !realFinish) {
          await saveOrderFinish(orderIdReal, oldFinish);
          await clearOrderFinish(orderIdParam);
          setOrderFinishedAtMs(oldFinish);
        }

        const oldElapsed = await loadOrderElapsed(orderIdParam);
        const realElapsed = await loadOrderElapsed(orderIdReal);
        if (oldElapsed != null && realElapsed == null) {
          await saveOrderElapsed(orderIdReal, oldElapsed);
          await clearOrderElapsed(orderIdParam);
          setOrderElapsedMs(oldElapsed);
        }

        const oldPending = await loadPendingSign(orderIdParam);
        const realPending = await loadPendingSign(orderIdReal);
        if (oldPending && !realPending) {
          await savePendingSign(orderIdReal, oldPending);
          await clearPendingSign(orderIdParam);
        }
      }

      try {
        const sc = String(data?.estatus_code || data?.userstatus || "").trim();
        const isPending0400Local2 = sc.includes("0400");
        const pending = await loadPendingSign(orderIdReal);

        if (pending) {
          const restoredSelection = resolveOperationSelection({
            orderId: orderIdReal,
            opsAll: Array.isArray(data?.operaciones) ? data.operaciones : [],
            checkedMap: pending?.checkedMap || {},
            pending,
            allowFinishedFallback: isPending0400Local2,
          });

          if (restoredSelection.selectedOps.length) {
            setCheckedMap(restoredSelection.checkedMap);
          } else if (pending?.checkedMap) {
            setCheckedMap(pending.checkedMap || {});
          }

          if (Array.isArray(pending?.consumibles))
            setConsumibles(pending.consumibles);
          if (typeof pending?.notaTecnico === "string")
            setNotaTecnico(pending.notaTecnico || "");
          if (typeof pending?.clienteNombre === "string")
            setClienteNombre(pending.clienteNombre || "");
          if (typeof pending?.clienteCargo === "string")
            setClienteCargo(pending.clienteCargo || "");
          if (typeof pending?.avisoCliente === "string")
            setAvisoCliente(pending.avisoCliente || "");

          if (Number.isFinite(pending?.orderStartedAtMs)) {
            setOrderStartedAtMs(pending.orderStartedAtMs);
          }
          if (Number.isFinite(pending?.orderFinishedAtMs)) {
            setOrderFinishedAtMs(pending.orderFinishedAtMs);
          }
          if (Number.isFinite(pending?.orderElapsedMs)) {
            setOrderElapsedMs(pending.orderElapsedMs);
          }

          if (isPending0400Local2) setFinalizeMode(true);
        }
      } catch {}

      const estatusTxtLocal = String(
        data?.estatus_label || data?.estatus || data?.status || "",
      )
        .trim()
        .toUpperCase();
      const statusCodeLocal = String(
        data?.estatus_code || data?.userstatus || "",
      ).trim();

      const isEnProcesoLocal =
        estatusTxtLocal === "EN_PROCESO" ||
        estatusTxtLocal === "EN PROCESO" ||
        statusCodeLocal === "0200";

      const isPending0400Local =
        statusCodeLocal === "0400" || String(statusCodeLocal).includes("0400");
      const isFinalLocal =
        ["0300", "0500"].includes(statusCodeLocal) || !!data?.isFinal;

      if (isEnProcesoLocal) {
        const savedStart = await loadOrderStart(orderIdReal);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }
      } else if (isPending0400Local) {
        const timing = await resolveOrderTimeSnapshot(orderIdReal, data);
        await saveOrderStart(orderIdReal, timing.startMs);
        await saveOrderFinish(orderIdReal, timing.finishMs);
        await saveOrderElapsed(orderIdReal, timing.elapsedMs);
        setOrderStartedAtMs(timing.startMs);
        setOrderFinishedAtMs(timing.finishMs);
        setOrderElapsedMs(timing.elapsedMs);
      } else if (isFinalLocal || ["0100", "0600"].includes(statusCodeLocal)) {
        setOrderStartedAtMs(null);
        await clearOrderStart(orderIdReal);
      }

      if (isFinalLocal) {
        const savedFinish = await loadOrderFinish(orderIdReal);
        if (savedFinish) setOrderFinishedAtMs(savedFinish);

        const savedElapsed = await loadOrderElapsed(orderIdReal);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);
      }
    } catch (error) {
      console.error(
        "Error al obtener orden (SAP):",
        error?.response?.data || error,
      );

      const orderIdParam2 = String(id || "").trim();
      const cached2 = await loadOrdenTecnicoDetail(orderIdParam2);

      if (cached2?.data) {
        setOrden(cached2.data);

        const cachedOrderId = String(
          cached2?.data?.Orderid || orderIdParam2,
        ).trim();
        const savedStart = await loadOrderStart(cachedOrderId);
        if (savedStart) {
          setOrderStartedAtMs(savedStart);
          setNowTick(Date.now());
        }

        const savedFinish = await loadOrderFinish(cachedOrderId);
        if (savedFinish) setOrderFinishedAtMs(savedFinish);

        const savedElapsed = await loadOrderElapsed(cachedOrderId);
        if (savedElapsed != null) setOrderElapsedMs(savedElapsed);

        const pending = await loadPendingSign(cachedOrderId);
        if (pending) {
          const restoredSelection = resolveOperationSelection({
            orderId: cachedOrderId,
            opsAll: Array.isArray(cached2?.data?.operaciones)
              ? cached2.data.operaciones
              : [],
            checkedMap: pending?.checkedMap || {},
            pending,
            allowFinishedFallback:
              normalizeCode(
                cached2?.data?.estatus_code ??
                  cached2?.data?.userstatus ??
                  "",
              ) === "0400",
          });

          if (restoredSelection.selectedOps.length) {
            setCheckedMap(restoredSelection.checkedMap);
          } else if (pending?.checkedMap) {
            setCheckedMap(pending.checkedMap || {});
          }
        }
        if (Array.isArray(pending?.consumibles))
          setConsumibles(pending.consumibles);
        if (typeof pending?.notaTecnico === "string")
          setNotaTecnico(pending.notaTecnico || "");
        if (typeof pending?.clienteNombre === "string")
          setClienteNombre(pending.clienteNombre || "");
        if (typeof pending?.clienteCargo === "string")
          setClienteCargo(pending.clienteCargo || "");
        if (typeof pending?.avisoCliente === "string")
          setAvisoCliente(pending.avisoCliente || "");

        if (Number.isFinite(pending?.orderStartedAtMs)) {
          setOrderStartedAtMs(pending.orderStartedAtMs);
        }
        if (Number.isFinite(pending?.orderFinishedAtMs)) {
          setOrderFinishedAtMs(pending.orderFinishedAtMs);
        }
        if (Number.isFinite(pending?.orderElapsedMs)) {
          setOrderElapsedMs(pending.orderElapsedMs);
        }

        const emailCached = String(cached2?.data?.cliente_email || "").trim();
        if (emailCached && isValidEmail(emailCached))
          setClienteEmail(emailCached);
      } else {
        Alert.alert("Error", "No se pudo cargar la orden desde SAP");
      }
    } finally {
      setLoading(false);
    }
  };
  const COMPONENTS_KEY = (orderId, activity) =>
    `orderComponents:${orderId}:${activity}`;

  async function saveOfflineComponents(orderId, activity, data) {
    try {
      await AsyncStorage.setItem(
        COMPONENTS_KEY(orderId, activity),
        JSON.stringify(Array.isArray(data) ? data : []),
      );
    } catch {}
  }

  async function loadOfflineComponents(orderId, activity) {
    try {
      const raw = await AsyncStorage.getItem(COMPONENTS_KEY(orderId, activity));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  const openComponentsModal = async (op) => {
    try {
      setSelectedOp(op);
      setCompList([]);
      setShowCompModal(true);
      setLoadingComponents(true);

      const Orderid = String(orden?.Orderid || id || "").trim();
      const Activity = String(op?.activity || op?.Activity || "").trim();

      if (!Orderid || !Activity) {
        Alert.alert("Materiales", "No se encontró la operación.");
        return;
      }

      const net = await NetInfo.fetch();
      const isOnline = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      if (isOnline) {
        const res = await api.get(
          `/api/operaciones/ordenes/${Orderid}/operaciones/${Activity}/componentes`,
        );

        const data = Array.isArray(res.data) ? res.data : [];
        setCompList(data);

        await saveOfflineComponents(Orderid, Activity, data);
        return;
      }

      const offlineData = await loadOfflineComponents(Orderid, Activity);

      if (offlineData.length > 0) {
        setCompList(offlineData);
        return;
      }

      Alert.alert(
        "Materiales",
        "No hay conexión y esta operación no tiene materiales guardados offline.",
      );
    } catch (error) {
      console.error(
        "Error al obtener componentes:",
        error?.response?.data || error,
      );

      const Orderid = String(orden?.Orderid || id || "").trim();
      const Activity = String(op?.activity || op?.Activity || "").trim();

      const offlineData = await loadOfflineComponents(Orderid, Activity);

      if (offlineData.length > 0) {
        setCompList(offlineData);
        Alert.alert(
          "Materiales",
          "Se mostraron los materiales guardados offline.",
        );
      } else {
        Alert.alert(
          "Materiales",
          "No se pudieron obtener los materiales de esta operación.",
        );
      }
    } finally {
      setLoadingComponents(false);
    }
  };

  const closeComponentsModal = () => {
    setShowCompModal(false);
    setSelectedOp(null);
    setCompList([]);
  };


  const irATbmkyDesdeDetalle = () => {
    const orderId = String(orden?.Orderid || id || "").trim();

    if (!orderId) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    router.push(`/tecnico/ordenes/${orderId}/formulario-riesgos`);
  };

  const irACartaNoMantenimientoDesdeDetalle = () => {
    const orderId = String(orden?.Orderid || id || "").trim();

    if (!orderId) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    router.push({
      pathname: "/tecnico/ordenes/[orderid]/carta-no-mantenimiento",
      params: { orderid: orderId },
    });
  };

  const iniciarOrden = async () => {
    if (!orden?.Orderid) return;

    const estatusTxtNow = String(
      orden?.estatus_label || orden?.estatus || orden?.status || "",
    )
      .trim()
      .toUpperCase();

    const puedeIniciarPorEstatus =
      estatusTxtNow === "EN_PROCESO" ||
      estatusTxtNow === "EN PROCESO" ||
      statusCode === "0200";

    if (!puedeIniciarPorEstatus) {
      Alert.alert(
        "No disponible",
        'El cronómetro solo se puede iniciar cuando la orden está en "EN_PROCESO" (o código 0200).',
      );
      return;
    }

    if (!checkinDone) {
      Alert.alert(
        "Check-in requerido",
        "Primero debes hacer Check-in para iniciar el cronómetro.",
      );
      return;
    }

    if (isNoMant || isOrderFinishedReal) {
      Alert.alert(
        "No disponible",
        "La orden no permite iniciar cronómetro en este estado.",
      );
      return;
    }

    if (orderStartedAtMs) return;

    const orderId = String(orden.Orderid).trim();

    Alert.alert("Iniciar orden", "¿Deseas iniciar el cronómetro de la orden?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sí, iniciar",
        onPress: async () => {
          try {
            setStartingOrder(true);

            await clearOrderFinish(orderId);
            setOrderFinishedAtMs(null);

            await clearOrderElapsed(orderId);
            setOrderElapsedMs(null);

            const startMs = Date.now();
            await saveOrderStart(orderId, startMs);
            setOrderStartedAtMs(startMs);
            setNowTick(Date.now());

            Alert.alert("Listo", "Cronómetro iniciado.");
          } catch (e) {
            console.error("Error al iniciar cronómetro:", e);
            Alert.alert("Error", "No se pudo iniciar el cronómetro.");
          } finally {
            setStartingOrder(false);
          }
        },
      },
    ]);
  };

  const handleFinalizarOrden = (e) => {
    e?.stopPropagation?.();

    const orderid = String(orden?.Orderid ?? id ?? "").trim();
    if (!orderid) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    setFinalizeMode(true);
  };

  const guardarPendienteDeFirma = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const opsAll = Array.isArray(orden?.operaciones) ? orden.operaciones : [];
    const selection = resolveOperationSelection({
      orderId,
      opsAll,
      checkedMap,
      allowFinishedFallback: false,
    });

    const selectedIds = selection.selectedIds;
    const selectedOps = selection.selectedOps;
    const checkedMapToSave = selection.checkedMap;

    if (!selectedOps.length) {
      Alert.alert(
        "Sin selección",
        "Marca al menos una operación realizada antes de guardar.",
      );
      return;
    }

    if (!orderStartedAtMs) {
      Alert.alert(
        "Sin cronómetro",
        "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear y mandar operaciones.",
      );
      return;
    }

    const consumiblesValidos = hasValidConsumibles(consumibles);
    if (!consumiblesValidos) {
      Alert.alert(
        "Consumibles obligatorios",
        "Debes agregar al menos un consumible válido antes de guardar pendiente de firma.",
      );
      return;
    }

    try {
      setSavingPending0400(true);

      const tipoEquipo = await resolveEquipmentTypeForCurrentOrder();
      if (!tipoEquipo) {
        Alert.alert(
          "Tipo de equipo pendiente",
          "No se pudo identificar el tipo de equipo. Abre el TBM/KY y selecciona Elevador o Escalera antes de continuar.",
        );
        return;
      }

      const finishMs = Date.now();
      const elapsedMs = Math.max(0, finishMs - orderStartedAtMs);

      await saveOrderElapsed(orderId, elapsedMs);
      setOrderElapsedMs(elapsedMs);

      await saveOrderFinish(orderId, finishMs);
      setOrderFinishedAtMs(finishMs);

      const payload0400 = {
        OrderId: orderId,
        WorkOrderHeader: { Orderid: orderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0400", Langu: "ES", Inactive: "" },
          { UserStText: "0200", Langu: "ES", Inactive: "X" },
        ],
        Return: [],
      };

      // ✅ Cambio de estatus 0200 -> 0400 usando WorkOrderBulkSet
      const workOrderBulkEndpoint0400 =
        "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

      const payload0400Bulk = buildSingleWorkOrderBulkPayload({
        orderId,
        workOrderPayload: payload0400,
      });

      const plantFallback = String(
        orden?.Plant || orden?.plant || orden?.centro || "",
      ).trim();

      const confirmationPayload0400 = buildConfirmationPayloadFromSelectedOps({
        orderId,
        opsAll,
        selectedIds,
        startMs: orderStartedAtMs,
        finishMs,
        consumiblesRows: consumibles,
        plantFallback,
        user: user, // 👈 CAMBIO: Pasamos el objeto 'user' completo
      });

      if (!confirmationPayload0400) {
        Alert.alert(
          "Error",
          "No se pudo armar el payload de confirmaciones de operaciones.",
        );
        return;
      }

      const selectedActivities = selectedOps
        .map((op) => normalizeOperationActivity(op))
        .filter(Boolean);

      const pendingPayload = {
        checkedMap: checkedMapToSave,
        selectedActivities,
        selectedOperationsSnapshot: buildSelectedOperationsSnapshot(selectedOps),
        savedAt: Date.now(),
        confirmationsSent: false,
        confirmationsFinishMs: finishMs,
        consumibles: Array.isArray(consumibles) ? consumibles : [],
        notaTecnico: String(notaTecnico || "").trim(),
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        avisoCliente: String(avisoCliente || "").trim(),

        cobertura_tipo: coberturaTipo || orden?.cobertura_tipo || "SIN COBERTURA",
        ShortText: orden?.ShortText || "",
        tipo_equipo: tipoEquipo,
        EquipmentType: tipoEquipo,

        orderStartedAtMs: Number.isFinite(orderStartedAtMs)
          ? orderStartedAtMs
          : null,
        orderFinishedAtMs: finishMs,
        orderElapsedMs: elapsedMs,
      };

      await savePendingSign(orderId, pendingPayload);

      const net = await NetInfo.fetch();
      const isOnline = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      if (!isOnline) {
        await enqueueSap({
          type: "CONFIRMATIONS",
          orderId,
          endpoint:
            "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
          payload: confirmationPayload0400,
          dedupeKey: `CONFIRMATIONS:${orderId}:0400`,
        });

        await enqueueSap({
          type: "STATUS",
          orderId,
          endpoint: workOrderBulkEndpoint0400,
          payload: payload0400Bulk,
          dedupeKey: `STATUS:${orderId}:0400`,
        });

        await savePendingSign(orderId, {
          ...pendingPayload,
          confirmationsSent: true,
        });

        await applyLocalOrderStatus(orderId, "0400");

        Alert.alert(
          "Guardado offline",
          "La orden quedó en pendiente de firma. Las operaciones/consumibles y el estatus 0400 se enviarán cuando vuelva el internet.",
        );

        setFinalizeMode(false);
        router.replace("/tecnico/ordenes");
        return;
      }
      //////////////////////////////////////

      ///////////////////////////////////////////////////////////////

      let confirmationsOk = false;
      let statusOk = false;
      let confirmationsResult = { ok: false, queued: false };
      let statusResult = { ok: false, queued: false };

      try {
        confirmationsResult = await postWithBackgroundFallback({
          apiInstance: api,
          endpoint:
            "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
          payload: confirmationPayload0400,
          timeoutMs: BG_TIMEOUT_MS,
          enqueueFn: enqueueSap,
          queueItem: {
            type: "CONFIRMATIONS",
            orderId,
            endpoint:
              "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
            payload: confirmationPayload0400,
            dedupeKey: `CONFIRMATIONS:${orderId}:0400`,
          },
        });

        confirmationsOk = true;
      } catch (err) {
        console.warn("[0400][CONFIRMATIONS ERROR]", err?.response?.data || err);

        Alert.alert(
          "Error SAP",
          getSapErrorMessage(err, "SAP rechazó el envío de confirmaciones."),
        );
        return;
      }

      try {
        statusResult = await postWithBackgroundFallback({
          apiInstance: api,
          endpoint: workOrderBulkEndpoint0400,
          payload: payload0400Bulk,
          timeoutMs: BG_TIMEOUT_MS,
          enqueueFn: enqueueSap,
          queueItem: {
            type: "STATUS",
            orderId,
            endpoint: workOrderBulkEndpoint0400,
            payload: payload0400Bulk,
            dedupeKey: `STATUS:${orderId}:0400`,
          },
        });

        statusOk = true;
      } catch (err) {
        console.warn("[0400][STATUS ERROR]", err?.response?.data || err);

        await savePendingSign(orderId, {
          ...pendingPayload,
          confirmationsSent: true,
        });

        Alert.alert(
          "Error SAP",
          getSapErrorMessage(
            err,
            "Las operaciones sí se enviaron, pero SAP rechazó el cambio a estatus 0400.",
          ),
        );
        return;
      }

      /////////////////////////////////////////////////////////////////////////


      if (confirmationsOk && statusOk) {
        await savePendingSign(orderId, {
          ...pendingPayload,
          confirmationsSent: true,
        });

        await applyLocalOrderStatus(orderId, "0400");

        const algoEnCola = confirmationsResult?.queued || statusResult?.queued;

        Alert.alert(
          algoEnCola ? "Guardado y en sincronización" : "Listo",
          algoEnCola
            ? "La orden quedó en pendiente de firma. Lo que no alcanzó a enviarse en 2 minutos se mandará en segundo plano."
            : "Se guardó pendiente de firma y se enviaron operaciones, consumibles y estatus.",
        );

        setFinalizeMode(false);
        router.replace("/tecnico/ordenes");
      }

      /////////////////////////////////////////////////////////////////////////////////////////////////////////////
    } catch (e) {
      console.error(
        "Error guardando pendiente de firma:",
        e?.response?.data || e,
      );
      Alert.alert(
        "Error",
        "No se pudo completar el guardado como pendiente de firma.",
      );
    } finally {
      setSavingPending0400(false);
    }
  };

  function hacerPreviewConColumnasManuales(html = "") {
    return String(html || "")
      .replaceAll(
        'class="ubicGrid"',
        'class="ubicGrid previewManualGrid"'
      )
      .replace(
        "</head>",
        `
        <style>
          @media screen {
            html, body {
              width: 816px !important;
              min-width: 816px !important;
            }

            .pagina {
              width: 796px !important;
              min-width: 796px !important;
            }

            .previewManualGrid {
              display: grid !important;
              grid-template-columns: 1fr 1fr !important;
              column-gap: 10px !important;
            }

            .previewManualGrid .opItem {
              width: 100% !important;
              display: table !important;
            }

            .previewManualGrid .opItem:nth-child(odd) {
              grid-column: 1;
            }

            .previewManualGrid .opItem:nth-child(even) {
              grid-column: 2;
            }
          }
        </style>
        </head>`
      );
  }

  const generarVistaPreviaPdfAntesFirma = async () => {
    try {
      const orderId = String(orden?.Orderid || id || "").trim();

      if (!orderId) {
        Alert.alert("Error", "No se encontró el número de orden.");
        return;
      }

      const pendingDraft = await loadPendingSign(orderId);
      const opsCurrent = Array.isArray(orden?.operaciones)
        ? orden.operaciones
        : [];

      const selection = resolveOperationSelection({
        orderId,
        opsAll: opsCurrent,
        checkedMap,
        pending: pendingDraft,
        allowFinishedFallback: isPending0400,
      });

      if (!selection.selectedOps.length && !isPending0400) {
        Alert.alert(
          "Sin selección",
          "Marca al menos una operación realizada antes de visualizar el PDF.",
        );
        return;
      }

      const checkedMapForPdf = selection.checkedMap;
      const opsForPdf = selection.opsForPdf;

      if (selection.selectedOps.length) {
        setCheckedMap(checkedMapForPdf);
      }

      const timing = isPending0400 ? await resolveOrderTimeSnapshot(orderId, orden) : null;
      const draftStartMs = timing?.startMs ?? orderStartedAtMs;
      const draftFinishMs = timing?.finishMs ?? Date.now();
      const draftElapsedMs = timing?.elapsedMs ?? (draftStartMs ? Math.max(0, draftFinishMs - draftStartMs) : null);

      setShowSignModal(false);
      setMantHtmlPreview(null);
      setMantPdfUri(null);
      setShowMantPreview(true);

      const tipo = await resolveEquipmentTypeForCurrentOrder();
      if (!tipo) {
        setShowMantPreview(false);
        Alert.alert(
          "Tipo de equipo pendiente",
          "No se pudo identificar el tipo de equipo. Abre el TBM/KY y selecciona Elevador o Escalera antes de generar el PDF.",
        );
        return;
      }
      const html = await buildMantenimientoHtml({
        tipo,
        orden,
        operaciones: opsForPdf,
        checkedMap: checkedMapForPdf,
        signatureData,
        clienteEmail: String(clienteEmail || "").trim(),
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        tecnicoNombre: String(
          user?.nombre ||
            user?.name ||
            user?.fullName ||
            user?.displayName ||
            user?.username ||
            "",
        ).trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),
        coberturaTipo: coberturaTipo || orden?.cobertura_tipo || "SIN COBERTURA",
        consumibles,
        startMs: draftStartMs,
        finishMs: draftFinishMs,
        elapsedMs: draftElapsedMs,
      });

      const htmlPreview = hacerPreviewConColumnasManuales(html);
      setMantHtmlPreview(htmlPreview);

      const result = await Print.printToFileAsync({
        html: String(html || ""),
        base64: true,
      });

      const pdfBase64ConPaginas = await addPageNumbersToPdfBase64(result.base64);

      await FileSystem.writeAsStringAsync(result.uri, pdfBase64ConPaginas, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setMantPdfUri(result.uri);
    } catch (error) {
      console.log("[PDF PREVIEW] Error:", error);
      setShowMantPreview(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    }
  };
  const abrirFirmaCliente = async () => {
    const orderId = String(orden?.Orderid || id || "").trim();
    if (!orderId) return;

    const pendingAnterior = await loadPendingSign(orderId);
    const opsCurrent = Array.isArray(orden?.operaciones)
      ? orden.operaciones
      : [];

    const selection = resolveOperationSelection({
      orderId,
      opsAll: opsCurrent,
      checkedMap,
      pending: pendingAnterior,
      allowFinishedFallback: isPending0400,
    });

    if (!selection.selectedOps.length && !isPending0400) {
      Alert.alert(
        "Sin selección",
        "Marca al menos una operación realizada antes de solicitar firma.",
      );
      return;
    }

    if (selection.selectedOps.length) {
      setCheckedMap(selection.checkedMap);
    }

    const timing = isPending0400 ? await resolveOrderTimeSnapshot(orderId, orden) : null;
    const draftStartMs = timing?.startMs ?? orderStartedAtMs;
    const draftFinishMs = timing?.finishMs ?? Date.now();
    const draftElapsedMs = timing?.elapsedMs ?? (draftStartMs ? Math.max(0, draftFinishMs - draftStartMs) : null);
    if (draftElapsedMs != null) {
      await saveOrderElapsed(orderId, draftElapsedMs);
      setOrderElapsedMs(draftElapsedMs);
    }

    const tipoEquipo = await resolveEquipmentTypeForCurrentOrder();
    if (!tipoEquipo) {
      Alert.alert(
        "Tipo de equipo pendiente",
        "No se pudo identificar el tipo de equipo. Abre el TBM/KY y selecciona Elevador o Escalera antes de solicitar la firma.",
      );
      return;
    }

    const selectedActivities = selection.selectedOps
      .map((op) => normalizeOperationActivity(op))
      .filter(Boolean);

    await savePendingSign(orderId, {
      ...(pendingAnterior || {}),
      checkedMap: selection.selectedOps.length
        ? selection.checkedMap
        : pendingAnterior?.checkedMap || checkedMap || {},
      selectedActivities: selectedActivities.length
        ? selectedActivities
        : pendingAnterior?.selectedActivities || [],
      selectedOperationsSnapshot: selection.selectedOps.length
        ? buildSelectedOperationsSnapshot(selection.selectedOps)
        : pendingAnterior?.selectedOperationsSnapshot || [],
      savedAt: Date.now(),
      consumibles: Array.isArray(consumibles) ? consumibles : [],
      notaTecnico: String(notaTecnico || "").trim(),
      clienteNombre: String(clienteNombre || "").trim(),
      clienteCargo: String(clienteCargo || "").trim(),
      avisoCliente: String(avisoCliente || "").trim(),

      cobertura_tipo: coberturaTipo || orden?.cobertura_tipo || "SIN COBERTURA",
      ShortText: orden?.ShortText || "",
      tipo_equipo: tipoEquipo,
      EquipmentType: tipoEquipo,

      orderStartedAtMs: Number.isFinite(draftStartMs)
        ? draftStartMs
        : pendingAnterior?.orderStartedAtMs ?? null,
      orderFinishedAtMs: draftFinishMs,
      orderElapsedMs: draftElapsedMs,
    });

    setShowSignModal(true);
  };

  const confirmarFinalizarConFirma = async () => {
    if (!orden?.Orderid) return;

    const orderId = String(orden.Orderid).trim();

    const email = String(clienteEmail || "").trim();
    if (email && !isValidEmail(email)) {
      Alert.alert(
        "Correo inválido",
        "Si capturas un correo, debe ser válido (ej: nombre@dominio.com).",
      );
      return;
    }

    if (!String(clienteNombre || "").trim()) {
      Alert.alert(
        "Falta nombre",
        "Escribe el nombre del cliente (obligatorio).",
      );
      return;
    }
    if (!String(clienteCargo || "").trim()) {
      Alert.alert("Falta cargo", "Escribe el cargo del cliente (obligatorio).");
      return;
    }

    if (!signatureData) {
      Alert.alert(
        "Falta firma",
        'Pida al cliente que firme y toque "Listo" dentro del recuadro.',
      );
      return;
    }

    const consumiblesValidos = hasValidConsumibles(consumibles);
    if (!consumiblesValidos) {
      Alert.alert(
        "Consumibles obligatorios",
        "Debes agregar al menos un consumible válido antes de finalizar la orden.",
      );
      return;
    }

    try {
      setSavingSignature(true);

      const pendingDraft = await loadPendingSign(orderId);
      const isPending0400Now =
        pickCurrentStatusCode(orden) === "0400" || isPending0400;

      const opsCurrent = Array.isArray(orden?.operaciones)
        ? orden.operaciones
        : [];

      const selection = resolveOperationSelection({
        orderId,
        opsAll: opsCurrent,
        checkedMap,
        pending: pendingDraft,
        allowFinishedFallback: isPending0400Now,
      });

      if (!selection.selectedOps.length && !isPending0400Now) {
        Alert.alert(
          "Sin selección",
          "Marca al menos una operación realizada antes de finalizar.",
        );
        return;
      }

      const selectedOps = selection.selectedOps;
      const selectedIds = selection.selectedIds;
      const checkedMapForPdf = selection.checkedMap;
      const opsForPdf = selection.opsForPdf;

      if (selectedOps.length) {
        setCheckedMap(checkedMapForPdf);
      }

      const timing = await resolveOrderTimeSnapshot(orderId, orden);
      const effectiveStartMs = timing.startMs;
      const effectiveFinishMs = timing.finishMs;
      const effectiveElapsedMs = timing.elapsedMs;

      if (!effectiveStartMs) {
        Alert.alert(
          "Sin cronómetro",
          "No se detectó el inicio del cronómetro. Inicia la orden para poder prorratear tiempos.",
        );
        return;
      }

      const finishMs = effectiveFinishMs;
      const elapsedNow =
        effectiveElapsedMs ?? Math.max(0, finishMs - effectiveStartMs);

      await saveOrderElapsed(orderId, elapsedNow);
      setOrderElapsedMs(elapsedNow);
      await saveOrderFinish(orderId, finishMs);
      setOrderFinishedAtMs(finishMs);

      const totalMs = elapsedNow;
      const totalMin = msToMinutesRounded(totalMs);

      const currentCode = pickCurrentStatusCode(orden);
      const statusPayload0300 = buildStatus0300Payload({
        orderId,
        email,
        currentCode,
      });

      let confirmationPayload = null;

      // Si ya está 0400, las operaciones se confirmaron al crear el
      // Pendiente de firma. Aquí solo corresponde PDF + 0300.
      if (!isPending0400Now) {
        const n = selectedOps.length;
        const minsArr = prorateMinutes(totalMin, n);
        const windows = buildSequentialWindows(effectiveStartMs, minsArr);

        const plantFallback = String(
          orden?.Plant || orden?.plant || orden?.centro || "",
        ).trim();
        const ConfirmationMaterialSet = normalizeConsumiblesToMaterialSet(
          consumibles,
          plantFallback,
        );

        confirmationPayload = {
          Order: "S1",
          Mail: String(userEmail || "").trim(),
          ConfirmationOrderSet: selectedOps.map((op, idx) => {
            const Operation = normalizeOperationActivity(op);
            const w = windows[idx];

            return {
              ConfNo: "",
              Orderid: orderId,
              Operation,
              PostgDate: sapDateFromMs(finishMs),
              ActWork: String(minsArr[idx]),
              UnWork: "min",
              ExecStartDate: sapDateFromMs(w.start),
              ExecFinDate: sapDateFromMs(w.end),
              ExecStartTime: sapTimePTFromMs(w.start),
              ExecFinTime: sapTimePTFromMs(w.end),
              FinConf: "X",
            };
          }),
          ConfirmationMaterialSet,
          Return: [],
        };
      }

      const tipo = await resolveEquipmentTypeForCurrentOrder(pendingDraft);
      if (!tipo) {
        Alert.alert(
          "Tipo de equipo pendiente",
          "No se pudo identificar el tipo de equipo. Abre el TBM/KY y selecciona Elevador o Escalera antes de finalizar.",
        );
        return;
      }

      const html = await buildMantenimientoHtml({
        tipo,
        orden,
        operaciones: opsForPdf,
        checkedMap: checkedMapForPdf,
        signatureData,
        clienteEmail: email,
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        tecnicoNombre: String(
          user?.nombre ||
            user?.name ||
            user?.fullName ||
            user?.displayName ||
            user?.username ||
            "",
        ).trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),
        coberturaTipo: coberturaTipo || orden?.cobertura_tipo || "SIN COBERTURA",
        consumibles,
        startMs: effectiveStartMs,
        finishMs,
        elapsedMs: elapsedNow,
      });

      const htmlPreview = hacerPreviewConColumnasManuales(html);
      setMantHtmlPreview(htmlPreview);

      let pdfBase64 = "";
      let pdfUri = null;

      try {
        const result = await Print.printToFileAsync({
        html: String(html || ""),
        base64: true,
      });

      const pdfBase64ConPaginas = await addPageNumbersToPdfBase64(result.base64);

      await FileSystem.writeAsStringAsync(result.uri, pdfBase64ConPaginas, {
        encoding: FileSystem.EncodingType.Base64,
      });

      pdfUri = result.uri;
      pdfBase64 = pdfBase64ConPaginas;
      setMantPdfUri(result.uri);
      } catch (e) {
        console.warn("No se pudo generar PDF (base64):", e?.message || e);
        setMantPdfUri(null);
      }

      const fileName =
        tipo === "escalera"
          ? "mantenimiento_escaleras.pdf"
          : "mantenimiento_elevadores.pdf";

      const change0300WithPdfPayload = {
        ...statusPayload0300,
        Attachments: [
          {
            DocId: orderId,
            FileName: fileName,
            MimeType: "pdf",
            Base64: pdfBase64 || "",
          },
        ],
      };

      setPendingFinalize({
        orderId,
        finishMs,
        selectedIds,
        change0300WithPdfPayload,
        confirmationPayload,
        confirmationsAlreadyHandled:
          isPending0400Now || !!pendingDraft?.confirmationsSent,
        clienteNombre: String(clienteNombre || "").trim(),
        clienteCargo: String(clienteCargo || "").trim(),
        avisoCliente: String(avisoCliente || "").trim(),
        notaTecnico: String(notaTecnico || "").trim(),
      });

      setShowSignModal(false);
      setShowMantPreview(true);
    } catch (e) {
      console.error(
        "Error preparando finalización (preview):",
        e?.response?.data || e,
      );
      Alert.alert("Error", "No se pudo generar la vista previa del reporte.");
    } finally {
      setSavingSignature(false);
    }
  };

  const abrirPdfMantenimiento = async () => {
    if (!mantPdfUri) {
      Alert.alert(
        "Sin PDF",
        "No se pudo generar el PDF en este dispositivo (puedes continuar).",
      );
      return;
    }
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite abrir/compartir archivos. Puedes continuar igualmente.",
        );
        return;
      }
      await Sharing.shareAsync(mantPdfUri, {
        mimeType: "application/pdf",
        dialogTitle: "Abrir / compartir PDF de mantenimiento",
      });
    } catch (e) {
      console.warn("No se pudo abrir/compartir PDF:", e?.message || e);
      Alert.alert("Error", "No se pudo abrir el PDF.");
    }
  };

  const continuarFinalizacionDespuesPreview = async () => {
    if (!pendingFinalize?.orderId) {
      setShowMantPreview(false);
      return;
    }

    const {
      orderId,
      finishMs,
      selectedIds,
      change0300WithPdfPayload,
      confirmationPayload,
      confirmationsAlreadyHandled,
    } = pendingFinalize;

    const workOrderBulkEndpoint =
      "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

    const change0300BulkPayload = buildSingleWorkOrderBulkPayload({
      orderId,
      workOrderPayload: change0300WithPdfPayload,
    });

    console.log("[DETALLE_ORDEN][BULK_ID]", {
      BulkId: change0300BulkPayload.BulkId,
      orderId,
      deviceModel: getDeviceModelForBulkId(),
      totalOrders: change0300BulkPayload?.WorkOrderSet?.length || 0,
    });

    try {
      setFinishingOrder(true);

      const net = await NetInfo.fetch();
      const isOnline = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );

      let alreadySentConfirmations =
        !!confirmationsAlreadyHandled || statusCode === "0400";

      try {
        const pending = await loadPendingSign(orderId);
        alreadySentConfirmations =
          alreadySentConfirmations || !!pending?.confirmationsSent;
      } catch {}

      logSapPayload(
        "=== SAP PAYLOAD BULK (CHANGE 0300 + PDF) ===",
        change0300BulkPayload,
        {
          stripBase64: true,
        },
      );
      logSapPayload(
        "=== SAP PAYLOAD (CONFIRMATIONS + CONSUMIBLES) ===",
        confirmationPayload,
      );
      console.log("CONFIRMATIONS alreadySent:", alreadySentConfirmations);

      if (!change0300WithPdfPayload?.Attachments?.[0]?.Base64) {
        Alert.alert(
          "No se pudo generar el PDF",
          "No se pudo generar el PDF en este dispositivo. Intenta de nuevo o revisa permisos/almacenamiento.",
        );
        return;
      }

      if (!isOnline) {
        await updateLocalOpsAsFinalizadas(orderId, selectedIds);
        await updateLocalOrderAsFinalizada0300(orderId, finishMs);

        await enqueueSap({
          type: "PENDIENTE_FIRMA_BULK_0300",
          orderId: change0300BulkPayload.BulkId,
          endpoint: workOrderBulkEndpoint,
          payload: change0300BulkPayload,
          dedupeKey: `PENDIENTE_FIRMA_BULK_0300:${change0300BulkPayload.BulkId}`,
        });

        if (!alreadySentConfirmations && confirmationPayload) {
          await enqueueSap({
            type: "CONFIRMATIONS",
            orderId,
            endpoint:
              "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
            payload: confirmationPayload,
            dedupeKey: `CONFIRMATIONS:${orderId}:0300`,
          });
        } else {
          console.log(
            "Saltando enqueue confirmaciones (ya fueron enviadas en 0400)",
          );
        }

        await clearOrderStart(orderId);
        setOrderStartedAtMs(null);

        await clearPendingSign(orderId);
        setCheckedMap({});
        setConsumibles([]);
        setNotaTecnico("");
        setFinalizeMode(false);

        setShowMantPreview(false);
        setPendingFinalize(null);

        Alert.alert(
          "Finalizado (offline)",
          alreadySentConfirmations
            ? "Se encoló (Estatus 0300+PDF). Confirmaciones+consumibles ya se habían enviado en 0400."
            : "Se encoló: (Estatus 0300+PDF) + confirmaciones+consumibles.",
        );

        router.replace("/tecnico/ordenes");
        return;
      }

      /////////////////////////////////////////

      let statusResult = { ok: false, queued: false };
      let confirmationsResult = { ok: true, queued: false };

      try {
        statusResult = await postWithBackgroundFallback({
          apiInstance: api,
          endpoint: workOrderBulkEndpoint,
          payload: change0300BulkPayload,
          timeoutMs: BG_TIMEOUT_MS,
          enqueueFn: enqueueSap,
          queueItem: {
            type: "PENDIENTE_FIRMA_BULK_0300",
            orderId: change0300BulkPayload.BulkId,
            endpoint: workOrderBulkEndpoint,
            payload: change0300BulkPayload,
            dedupeKey: `PENDIENTE_FIRMA_BULK_0300:${change0300BulkPayload.BulkId}`,
          },
        });

        if (!alreadySentConfirmations && confirmationPayload) {
          confirmationsResult = await postWithBackgroundFallback({
            apiInstance: api,
            endpoint:
              "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
            payload: confirmationPayload,
            timeoutMs: BG_TIMEOUT_MS,
            enqueueFn: enqueueSap,
            queueItem: {
              type: "CONFIRMATIONS",
              orderId,
              endpoint:
                "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
              payload: confirmationPayload,
              dedupeKey: `CONFIRMATIONS:${orderId}:0300`,
            },
          });
        } else {
          console.log(
            "Saltando POST confirmaciones (ya fueron enviadas en 0400)",
          );
        }
      } catch (err) {
        throw err;
      }

      ////////////////////////////////////////////////////////////////////////

      await updateLocalOpsAsFinalizadas(orderId, selectedIds);
      await updateLocalOrderAsFinalizada0300(orderId, finishMs);

      await clearOrderStart(orderId);
      setOrderStartedAtMs(null);

      await clearPendingSign(orderId);
      setCheckedMap({});
      setConsumibles([]);
      setNotaTecnico("");
      setFinalizeMode(false);

      setShowMantPreview(false);
      setPendingFinalize(null);

      /////////////////////////////


      const algoEnCola = statusResult?.queued || confirmationsResult?.queued;

      Alert.alert(
        algoEnCola ? "Finalizado y en sincronización" : "Orden finalizada",
        algoEnCola
          ? alreadySentConfirmations
            ? "La orden quedó finalizada localmente. El estatus 0300 + PDF se enviará en segundo plano cuando termine o haya mejor conexión."
            : "La orden quedó finalizada localmente. El estatus 0300 + PDF y las confirmaciones se enviarán en segundo plano."
          : alreadySentConfirmations
            ? "Se envió: (Orden FINALIZADA + PDF). Confirmaciones+consumibles ya se habían enviado al guardar como Pendiente de firma."
            : "Se envió: (Orden FINALIZADA + PDF) y confirmaciones+consumibles.",
      );
      router.replace("/tecnico/ordenes");

      ////////////////////////////////////////////////////////////////////////
    } catch (error) {
      console.error(
        "Error al finalizar (SAP):",
        error?.response?.data || error,
      );

      const msg = getSapErrorMessage(error, "No se pudo finalizar.");
      Alert.alert("Error", String(msg));
    } finally {
      setFinishingOrder(false);
    }
  };

  useEffect(() => {
    obtenerOrden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sharedCode = getEffectiveSharedStatusCode(sharedOrder);

    if (!sharedCode) return;

    setOrden((current) => {
      if (!current) return current;

      const currentCode = normalizeCode(
        current?.estatus_code ?? current?.userstatus ?? "",
      );

      if (currentCode === sharedCode) return current;
      return mergeStatusFromSharedOrder(current, sharedOrder);
    });

    // También se guarda el mismo estatus en el caché del detalle. Así, si
    // después se pierde la conexión, el index y el detalle siguen mostrando
    // exactamente el último estatus efectivo conocido.
    (async () => {
      const orderId = String(id || "").trim();
      if (!orderId) return;

      const cached = await loadOrdenTecnicoDetail(orderId);
      if (!cached?.data) return;

      const cachedCode = normalizeCode(
        cached?.data?.estatus_code ?? cached?.data?.userstatus ?? "",
      );
      if (cachedCode === sharedCode) return;

      await safeSaveDetailIfWindow(
        orderId,
        mergeStatusFromSharedOrder(cached.data, sharedOrder),
      );
    })().catch((error) => {
      console.log(
        "[DETALLE] No se pudo sincronizar el estatus del index:",
        error?.message || error,
      );
    });
  }, [
    id,
    sharedOrder?.estatus_code,
    sharedOrder?.userstatus,
    sharedOrder?.Userstatus,
    sharedOrder?.UserStatus,
    sharedOrder?.UserStText,
  ]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />

        {canStartTimer && !orderStartedAtMs ? (
          <View style={styles.topActionBar}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
              onPress={iniciarOrden}
              disabled={startingOrder}
            >
              <Ionicons name="play-circle-outline" size={18} color="#fff" />
              <Text style={styles.startOrderBtnText}>
                {startingOrder ? "Iniciando..." : "Iniciar orden"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : showRunningTimer ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={16} color={FIORI.text} />
              <Text style={styles.timerText}>
                {msToHMS(nowTick - orderStartedAtMs)}
              </Text>
            </View>
          </View>
        ) : showFrozenTimer ? (
          <View style={styles.topActionBar}>
            <View style={styles.timerPill}>
              <Ionicons
                name="pause-circle-outline"
                size={16}
                color={FIORI.text}
              />
              <Text style={styles.timerText}>{msToHMS(orderElapsedMs)}</Text>
            </View>
          </View>
        ) : null}

        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={FIORI.brand} />
          <Text
            style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}
          >
            Cargando orden…
          </Text>
        </View>
      </View>
    );
  }

  if (!orden) {
    return (
      <View style={styles.container}>
        <Header title={`Orden ${id || ""}`} />
        <Text style={styles.error}>No se pudo cargar la orden.</Text>
      </View>
    );
  }

  const estatusColor = isNoMant
    ? FIORI.textMuted
    : isOrderFinishedReal
      ? FIORI.ok
      : !statusCode
        ? FIORI.err
        : statusCode === "0100"
          ? FIORI.err
          : statusCode === "0200"
            ? FIORI.warn
            : statusCode === "0400"
              ? FIORI.warn
              : FIORI.ok;

  const direccionValor =
    orden.direccion || orden.address || orden.partner_address || null;
  const allMaterials = Array.isArray(orden.componentes)
    ? orden.componentes
    : [];
  const hasSelectedOps =
    isPending0400 || Object.keys(checkedMap || {}).length > 0;

  const ordenParaVista = {
    ...(orden || {}),
    cliente_email: String(orden?.cliente_email || "").trim() || "(sin correo)",
  };

  return (
    <View style={styles.container}>
      <Header title={`Orden ${orden?.Orderid || id || ""}`} />

      {canStartTimer && !orderStartedAtMs ? (
        <View style={styles.topActionBar}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.startOrderBtn, startingOrder && { opacity: 0.7 }]}
            onPress={iniciarOrden}
            disabled={startingOrder}
          >
            <Ionicons name="play-circle-outline" size={18} color="#fff" />
            <Text style={styles.startOrderBtnText}>
              {startingOrder ? "Iniciando..." : "Iniciar orden"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : showRunningTimer ? (
        <View style={styles.topActionBar}>
          <View style={styles.timerPill}>
            <Ionicons name="time-outline" size={16} color={FIORI.text} />
            <Text style={styles.timerText}>
              {msToHMS(nowTick - orderStartedAtMs)}
            </Text>
          </View>
        </View>
      ) : showFrozenTimer ? (
        <View style={styles.topActionBar}>
          <View style={styles.timerPill}>
            <Ionicons
              name="pause-circle-outline"
              size={16}
              color={FIORI.text}
            />
            <Text style={styles.timerText}>{msToHMS(orderElapsedMs)}</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        style={{ flex: 1 }}
        data={[{ _k: "single" }]}
        keyExtractor={(x) => x._k}
        contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
        ListHeaderComponent={
          <EncabezadoDetalleOrden
            orden={ordenParaVista}
            id={id}
            styles={styles}
            FIORI={FIORI}
            estatusColor={estatusColor}
            isNoMant={isNoMant}
            checkinDone={checkinDone}
            isOrderFinished={isOrderFinishedReal}
            direccionValor={direccionValor}
            allMaterialsLen={allMaterials.length}
            fmtDMY={fmtDMY}
            formatValueForRow={formatValueForRow}
            onVerMaterialesOrden={() => setShowAllMaterialsModal(true)}
            orderStartedAtMs={orderStartedAtMs}
            orderFinishedAtMs={orderFinishedAtMs}
            orderElapsedMs={orderElapsedMs}
            fmtDateTimeLocal={fmtDateTimeLocal}
            msToHMS={msToHMS}
            statusCode={statusCode}
            statusLabel={statusLabel}
            onOpenTbmky={irATbmkyDesdeDetalle}
            onOpenNoMantto={irACartaNoMantenimientoDesdeDetalle}
          />
        }
        renderItem={() => {
          const ops = Array.isArray(orden?.operaciones)
            ? orden.operaciones
            : [];
          return (
            <>
              <ListaOperacionesAgrupadas
                operaciones={ops}
                styles={styles}
                FIORI={FIORI}
                onOpenComponentsView={openComponentsModal}
                finalizeMode={finalizeMode}
                onRequestCancelFinalize={() => setFinalizeMode(false)}
                checkedMap={checkedMap}
                setCheckedMap={setCheckedMap}
                orderId={String(orden?.Orderid || id || "").trim()}
              />

              {finalizeMode ? (
                <View style={[styles.panel, { marginTop: 12 }]}>
                  <Text style={styles.panelTitle}>
                    Descripción general de las actividades
                  </Text>
                  <Text
                    style={{
                      color: FIORI.textMuted,
                      fontWeight: "700",
                      marginBottom: 8,
                    }}
                  >
                    Se insertará en el PDF.
                  </Text>

                  <TextInput
                    value={notaTecnico}
                    onChangeText={setNotaTecnico}
                    placeholder="Descripción de actividades"
                    placeholderTextColor={FIORI.textMuted}
                    multiline
                    style={{
                      minHeight: 90,
                      borderWidth: 1,
                      borderColor: FIORI.border,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      fontWeight: "700",
                      color: FIORI.text,
                      backgroundColor: FIORI.surfaceAlt,
                    }}
                  />

                  <ConsumiblesFinalizacion
                    plant={String(
                      orden?.Plant || orden?.plant || orden?.centro || "",
                    ).trim()}
                    coberturaTipo={
                      coberturaTipo || orden?.cobertura_tipo || null
                    }
                    FIORI={FIORI}
                    initialRows={consumibles}
                    onChange={(rows) => setConsumibles(rows)}
                  />
                </View>
              ) : null}
            </>
          );
        }}
        ListFooterComponent={
          <PieDetalleOrden
            FIORI={FIORI}
            isNoMant={isNoMant}
            userRolId={user?.rol_id}
            finishingOrder={finishingOrder}
            statusCode={statusCode}
            finalizeMode={finalizeMode}
            onCancelarFinalizacion={() => setFinalizeMode(false)}
            onFinalizarOrden={handleFinalizarOrden}
            onAgregarFirma={abrirFirmaCliente}
            onGuardarPendiente={guardarPendienteDeFirma}
            hasSelectedOps={hasSelectedOps}
          />
        }
      />

      <ModalesDetalleOrden
        styles={styles}
        FIORI={FIORI}
        orden={ordenParaVista}
        allMaterials={allMaterials}
        showAllMaterialsModal={showAllMaterialsModal}
        setShowAllMaterialsModal={setShowAllMaterialsModal}
        showCompModal={showCompModal}
        closeComponentsModal={closeComponentsModal}
        selectedOp={selectedOp}
        loadingComponents={loadingComponents}
        compList={compList}
        showSignModal={showSignModal}
        setShowSignModal={setShowSignModal}
        signatureRef={signatureRef}
        signatureData={signatureData}
        setSignatureData={setSignatureData}
        savingSignature={savingSignature}
        confirmarFinalizarConFirma={confirmarFinalizarConFirma}
        clienteEmail={clienteEmail}
        setClienteEmail={setClienteEmail}
        isValidEmail={isValidEmail}
        clienteNombre={clienteNombre}
        setClienteNombre={setClienteNombre}
        clienteCargo={clienteCargo}
        setClienteCargo={setClienteCargo}
        avisoCliente={avisoCliente}
        setAvisoCliente={setAvisoCliente}
        onPreviewPdfAntesFirma={generarVistaPreviaPdfAntesFirma}
      />
      <Modal
        visible={!!showMantPreview}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          if (finishingOrder) return;
          setShowMantPreview(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 720, height: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Reporte de mantenimiento (vista previa)
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (finishingOrder) return;
                  setShowMantPreview(false);
                }}
                style={[
                  styles.modalCloseBtn,
                  finishingOrder && { opacity: 0.7 },
                ]}
                disabled={!!finishingOrder}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 10 }}>
              {!mantHtmlPreview ? (
                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <ActivityIndicator size="large" color={FIORI.brand} />
                  <Text style={{ marginTop: 10, color: FIORI.textMuted }}>
                    Generando vista previa…
                  </Text>
                </View>
              ) : (
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: mantHtmlPreview }}
                  style={{ flex: 1 }}
                />
              )}
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={abrirPdfMantenimiento}
                disabled={!!finishingOrder}
              >
                <Text style={styles.smallBtnText}>Abrir PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { backgroundColor: "#0B8457" },
                  finishingOrder && { opacity: 0.7 },
                ]}
                onPress={continuarFinalizacionDespuesPreview}
                disabled={!!finishingOrder}
              >
                {finishingOrder ? (
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                    Finalizando…
                  </Text>
                ) : (
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                    Continuar
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={savingPending0400}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.brand} />
            <Text style={styles.blockTitle}>Guardando pendiente de firma…</Text>
            <Text style={styles.blockSub}>
              No cierres la pantalla ni toques botones.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ====================== Estilos ====================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  content: { padding: 16, paddingBottom: 28 },

  headerBox: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    ...elev(0.4),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titulo: { fontSize: 18, fontWeight: "800", color: FIORI.text },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  statusBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  panel: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    marginBottom: 12,
    ...elev(0.4),
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: FIORI.text,
    marginBottom: 8,
  },

  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: FIORI.borderSoft,
  },
  rowLabel: { fontSize: 13, color: FIORI.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 14, color: FIORI.text, fontWeight: "600" },

  btnSeeMaterials: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnSeeMaterialsText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  labelInline: { fontWeight: "700", color: FIORI.text },
  value: { color: FIORI.text, marginBottom: 4 },

  sectionKicker: {
    fontSize: 13,
    color: FIORI.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  grupoCard: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    ...elev(0.4),
  },
  grupoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  grupoTitle: { fontSize: 14, fontWeight: "900", color: FIORI.text },

  operCardSmall: {
    backgroundColor: FIORI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    padding: 10,
  },
  badgeSmall: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeSmallText: { fontSize: 11, fontWeight: "900", color: FIORI.text },
  operTitleSmall: { fontSize: 13, fontWeight: "900", color: FIORI.text },
  operDescSmall: { fontSize: 12, color: FIORI.textMuted, marginTop: 2 },

  error: { marginTop: 40, textAlign: "center", fontSize: 16, color: FIORI.err },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 80,
    backgroundColor: FIORI.warn,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...elev(0.8),
  },
  fabLabel: { color: "#000000ff", fontWeight: "800", fontSize: 13 },

  topActionBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  startOrderBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.brand,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...elev(0.6),
  },
  startOrderBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  timerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.surface,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...elev(0.3),
  },
  timerText: {
    color: FIORI.text,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: FIORI.brand,
  },
  modalTitle: { fontSize: 14, fontWeight: "900", color: "#fff", flex: 1 },
  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  compRow: {
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
    backgroundColor: FIORI.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  compTitle: { fontWeight: "900", color: FIORI.text, marginBottom: 4 },
  compSub: { color: FIORI.textMuted, fontWeight: "700", marginBottom: 6 },
  compMeta: { color: FIORI.textMuted, fontSize: 12 },
  modalFooterRow: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.borderSoft,
  },
  smallBtnText: { fontWeight: "900", color: FIORI.text, fontSize: 13 },

  blockBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  blockCard: {
    width: "92%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  blockTitle: { marginTop: 10, fontWeight: "900", color: FIORI.text },
  blockSub: {
    marginTop: 6,
    color: FIORI.textMuted,
    textAlign: "center",
    fontSize: 12,
  },
});
////////////////////////////////

function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}

//////////////////////////////////////////////////