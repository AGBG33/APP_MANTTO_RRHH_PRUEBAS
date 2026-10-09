import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Platform, Alert, Pressable, Modal, ScrollView
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { router } from "expo-router";
import { useAuth } from "../../../src/context/AuthContext";
import { useOrdenesTecnico } from "../../../src/context/OrdenesTecnicoContext";
import { Ionicons } from "@expo/vector-icons";
import Signature from "react-native-signature-canvas";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import {
  buildOfflineWindow, loadOrdenTecnicoDetail, loadOrdenesTecnicoList,
} from "../../../src/offline/ordenesTecnicoCache";
import {
  getLocalStatusPatch, setLocalStatusPatch, applyStatusPatchToOrdenes,
} from "../../../src/offline/ordenesTecnicoLocalPatch";
import { upsertSapQueueItem, processSapQueue } from "../../../src/offline/sapQueue";
import { buildMantenimientoHtml } from "../../../src/services/templates/buildMantenimientoHtml";
import { addPageNumbersToPdfBase64 } from "../../../src/services/pdf/addPageNumbersToPdf";
import {
  fetchEquipmentType,
  getEquipmentTypeFromOrder,
  normalizeEquipmentType,
} from "../../../src/services/equipmentType";

import {
  buildWorkOrderBulkId,
  getDeviceModelForBulkId,
} from "../../../src/utils/workOrderBulkId";

const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  borderMuted: "#CFD8E3",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  accentSoft: "#E3F2FD",
  neutralBtn: "#ECEFF5",
  warn: "#2D9CDB",
  danger: "#EB5757",
  ok: "#2FBF71",
  successDark: "#0B8457",
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const safeStr = (v) => (v == null ? "" : String(v));
const safeTrim = (v) => String(v ?? "").trim();
const PENDING_SIGN_KEY = (orderId) => `pendingSign:${orderId}`;
const TBMKY_JSON_KEY = (orderId) =>
  `tbmky_json_${String(orderId || "").trim()}`;
const DEFAULT_RECOVERY_ELAPSED_MS = 2.5 * 60 * 60 * 1000;
const PENDING_PDFS_DIR = `${FileSystem.documentDirectory}pdfs_no_enviados/`;
const PENDING_PDFS_INDEX_KEY = "pendingFailedSignaturePdfs:index";
const SENT_PDFS_DIR = `${FileSystem.documentDirectory}pdfs_enviados/`;
const SENT_PDFS_INDEX_KEY = "sentSignaturePdfs:index";
const CLIENTE_LOOKUP_CONCURRENCY = 3;
const CLIENTE_NAME_MEMORY_CACHE = new Map();
const CLIENTE_NAME_REMOTE_IN_FLIGHT = new Map();
const CLIENTE_NAME_REMOTE_WAITERS = [];
let clienteNameRemoteActive = 0;

const atStartOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const atEndOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfYear = (y) => new Date(y, 0, 1, 0, 0, 0, 0);
const endOfYear = (y) => new Date(y, 11, 31, 23, 59, 59, 999);

const parseSapDate = (value) => {
  if (!value) return null;
  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const getUtcYmd = (d) => {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const formatLocalYmd = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const isWithin = (date, start, end) => {
  if (!date) return false;
  const dStr = getUtcYmd(date);
  const sStr = start ? getUtcYmd(start) : null;
  const eStr = end ? getUtcYmd(end) : null;
  if (sStr && dStr < sStr) return false;
  if (eStr && dStr > eStr) return false;
  return true;
};

const formatDateDMY = (value) => {
  const d = parseSapDate(value);
  if (!d) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

function capitalizeFirst(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getOrderId(item) {
  return String(item?.Orderid || item?.OrderId || "").trim();
}

function mergeOrdersKeepingCache(cached = [], remote = []) {
  const map = new Map();

  for (const item of Array.isArray(cached) ? cached : []) {
    const key = getOrderId(item);
    if (key) map.set(key, item);
  }

  for (const item of Array.isArray(remote) ? remote : []) {
    const key = getOrderId(item);
    if (key) map.set(key, item);
  }

  return Array.from(map.values());
}

function cleanClienteName(value) {
  const name = safeTrim(value);
  const normalized = normalizeGroupText(name);

  if (
    !name ||
    normalized === "CLIENTE NO DISPONIBLE" ||
    normalized === "SIN CLIENTE" ||
    normalized === "NO DISPONIBLE" ||
    normalized === "N/A" ||
    normalized === "NA" ||
    normalized === "-" ||
    normalized === "—"
  ) {
    return "";
  }

  return name;
}

function getClienteNameFromAddressNode(node) {
  if (!node || typeof node !== "object") return "";

  const name1 = cleanClienteName(
    node?.Name1 ||
    node?.NAME1 ||
    node?.name1
  );
  const name2 = cleanClienteName(
    node?.Name2 ||
    node?.NAME2 ||
    node?.name2
  );

  return [name1, name2].filter(Boolean).join(" ").trim();
}

function getAddressNodes(source) {
  if (!source || typeof source !== "object") return [];

  const candidates = [
    source?.ToAddresses,
    source?.toAddresses,
    source?.Addresses,
    source?.addresses,
    source?.direcciones,
    source?.data?.ToAddresses,
    source?.data?.toAddresses,
    source?.data?.Addresses,
    source?.data?.addresses,
    source?.data?.direcciones,
  ];

  const nodes = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      nodes.push(...candidate);
      continue;
    }

    if (Array.isArray(candidate?.results) && candidate.results.length > 0) {
      nodes.push(...candidate.results);
      continue;
    }

    if (Array.isArray(candidate?.d?.results) && candidate.d.results.length > 0) {
      nodes.push(...candidate.d.results);
      continue;
    }

    if (candidate && typeof candidate === "object") {
      nodes.push(candidate);
    }
  }

  return nodes;
}

function extractClienteNameFromSource(source) {
  if (!source || typeof source !== "object") return "";

  const directAddressName = getClienteNameFromAddressNode(source);
  if (directAddressName) return directAddressName;

  const directCandidates = [
    source?.cliente,
    source?.Cliente,
    source?.partner_name,
    source?.PartnerName,
    source?.customer_name,
    source?.CustomerName,
    source?.clienteNombre,
    source?.ClienteNombre,
    source?.data?.cliente,
    source?.data?.Cliente,
    source?.data?.partner_name,
    source?.data?.PartnerName,
    source?.data?.customer_name,
    source?.data?.CustomerName,
    source?.data?.clienteNombre,
    source?.data?.ClienteNombre,
  ];

  for (const candidate of directCandidates) {
    const name = cleanClienteName(candidate);
    if (name) return name;
  }

  const addressNodes = getAddressNodes(source);
  for (const node of addressNodes) {
    const name = getClienteNameFromAddressNode(node);
    if (name) return name;
  }

  return "";
}

function getClienteName(item) {
  return extractClienteNameFromSource(item) || "Cliente no disponible";
}

function mergeClienteNamesIntoCurrentOrders(current = [], enriched = []) {
  const nameByOrderId = new Map();

  for (const item of Array.isArray(enriched) ? enriched : []) {
    const orderId = getOrderId(item);
    const clienteName = extractClienteNameFromSource(item);
    if (orderId && clienteName) nameByOrderId.set(orderId, clienteName);
  }

  return (Array.isArray(current) ? current : []).map((item) => {
    const clienteName = nameByOrderId.get(getOrderId(item));
    if (!clienteName) return item;

    return {
      ...item,
      Name1: clienteName,
      cliente: clienteName,
    };
  });
}

async function runClienteRemoteWithLimit(task) {
  if (clienteNameRemoteActive >= CLIENTE_LOOKUP_CONCURRENCY) {
    await new Promise((resolve) => {
      CLIENTE_NAME_REMOTE_WAITERS.push(resolve);
    });
  } else {
    clienteNameRemoteActive += 1;
  }

  try {
    return await task();
  } finally {
    const releaseNext = CLIENTE_NAME_REMOTE_WAITERS.shift();
    if (releaseNext) {
      releaseNext();
    } else {
      clienteNameRemoteActive = Math.max(0, clienteNameRemoteActive - 1);
    }
  }
}

function getEquipoNumber(item) {
  return safeTrim(
    item?.equipment ||
    item?.Equipment ||
    item?.EQUIPMENT ||
    "—"
  );
}

function getTipoOrden(item) {
  return safeTrim(item?.order_type || item?.OrderType || "Mantenimiento");
}

function formatLongDate(value) {
  const d = parseSapDate(value);
  if (!d) return "Fecha no disponible";

  const safeDate = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate()
  ));

  return capitalizeFirst(
    safeDate.toLocaleDateString("es-MX", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );
}

function getMonthKey(item) {
  const d = parseSapDate(item?.start_date) || parseSapDate(item?.finish_date);
  if (!d) return "sin-fecha";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthTitle(item) {
  const d = parseSapDate(item?.start_date) || parseSapDate(item?.finish_date);
  if (!d) return "SIN FECHA";

  const monthName = MONTHS[d.getUTCMonth()] || "";
  return `${monthName.toUpperCase()} ${d.getUTCFullYear()}`;
}

function normalizeGroupText(value) {
  return safeTrim(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function buildGroupedRows(orders = []) {
  const sorted = [...(orders || [])].sort((a, b) => {
    const da = parseSapDate(a?.start_date)?.getTime() || 0;
    const db = parseSapDate(b?.start_date)?.getTime() || 0;

    if (da !== db) return da - db;

    const ca = normalizeGroupText(getClienteName(a));
    const cb = normalizeGroupText(getClienteName(b));

    if (ca !== cb) return ca.localeCompare(cb);

    return getEquipoNumber(a).localeCompare(getEquipoNumber(b));
  });

  const clientCountMap = sorted.reduce((acc, item) => {
    const monthKey = getMonthKey(item);
    const clientKey = normalizeGroupText(getClienteName(item)) || "CLIENTE NO DISPONIBLE";
    const key = `${monthKey}::${clientKey}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const output = [];
  let currentMonth = "";
  let currentClient = "";
  const clientHeaderOccurrenceMap = {};

  for (const item of sorted) {
    const orderId = getOrderId(item);
    const monthKey = getMonthKey(item);
    const monthTitle = getMonthTitle(item);
    const clientName = getClienteName(item);
    const clientKey = normalizeGroupText(clientName) || "CLIENTE NO DISPONIBLE";
    const fullClientKey = `${monthKey}::${clientKey}`;

    if (monthKey !== currentMonth) {
      output.push({
        type: "monthHeader",
        key: `month-${monthKey}`,
        title: monthTitle,
      });

      currentMonth = monthKey;
      currentClient = "";
    }

    if (fullClientKey !== currentClient) {
      const count = clientCountMap[fullClientKey] || 0;
      const occurrence = (clientHeaderOccurrenceMap[fullClientKey] || 0) + 1;
      clientHeaderOccurrenceMap[fullClientKey] = occurrence;

      output.push({
        type: "clientHeader",
        key: `client-${fullClientKey}-${occurrence}`,
        title: clientName || "Cliente no disponible",
        count,
      });

      currentClient = fullClientKey;
    }

    output.push({
      type: "order",
      key: `order-${orderId || Math.random()}`,
      item,
    });
  }

  return output;
}

function normalizeCode(code) {
  if (code === null || code === undefined) return "";
  const s = String(code).trim();
  if (!s) return "";
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? s : String(n).padStart(4, "0");
}

function extractCodes(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  const matches = s.match(/\d{1,4}/g) || [];
  return Array.from(new Set(matches.map(normalizeCode).filter((x) => /^\d{4}$/.test(x))));
}

function isPending0400(item) {
  const rawStatusText = [
    item?.userstatus, item?.Userstatus, item?.estatus_label,
    item?.status_text, item?.user_status, item?.system_status,
  ].filter(Boolean).join(" | ").toLowerCase();
  const codes = new Set([
    ...extractCodes(item?.userstatus), ...extractCodes(item?.Userstatus),
    ...extractCodes(item?.estatus_code), ...extractCodes(item?.estatusCode),
    ...extractCodes(item?.status_code),
  ]);
  return codes.has("0400") || rawStatusText.includes("pendiente de firma") || rawStatusText.includes("pendiente firma");
}

const matchesQuery = (item, q) => {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const fields = [
    item?.Orderid,
    item?.OrderId,
    item?.order_type,
    item?.equipment,
    item?.Equipment,
    item?.Name1,
    item?.NAME1,
    item?.name1,
    item?.partner_name,
    item?.partner_address,
    item?.cliente,
    item?.direccion,
    item?.userstatus,
    item?.estatus_label,
    item?.estatus_code,
  ].filter(Boolean).join(" ").toLowerCase();
  return fields.includes(needle);
};

function CheckBox({ checked, disabled, onPress }) {
  return (
    <Pressable onPress={disabled ? null : onPress} style={[styles.cbBox, checked && styles.cbBoxChecked, disabled && { opacity: 0.5 }]} hitSlop={10}>
      {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
    </Pressable>
  );
}

async function loadPendingSign(orderId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function savePendingSign(orderId, value) {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const payload = { ...(value || {}), orderId: id, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(PENDING_SIGN_KEY(id), JSON.stringify(payload));
  return payload;
}

function parseSapTimeToParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;
  return { hours: Number(match[1] || 0), minutes: Number(match[2] || 0), seconds: Number(match[3] || 0) };
}

function isValidSapClock(value) {
  const t = parseSapTimeToParts(value);
  return !!t && (t.hours > 0 || t.minutes > 0 || t.seconds > 0);
}

function sapDateAndTimeToMs(dateValue, timeValue) {
  const date = parseSapDate(dateValue);
  const time = parseSapTimeToParts(timeValue);
  if (!date || !time) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), time.hours, time.minutes, time.seconds, 0);
}

function getRecoveredTimeFromSapHeader(header) {
  const startCandidates = [
    { date: header?.ActualStartDate, time: header?.ActualStartTime },
    { date: header?.ProductionStartDate, time: header?.ProductionStartTime },
    { date: header?.StartDate, time: header?.ActualStartTime },
    { date: header?.StartDate, time: header?.ProductionStartTime },
  ];
  const finishCandidates = [
    { date: header?.ActualFinishDate, time: header?.ActualFinishTime },
    { date: header?.ProductionFinishDate, time: header?.ProductionFinishTime },
    { date: header?.FinishDate, time: header?.ActualFinishTime },
    { date: header?.FinishDate, time: header?.ProductionFinishTime },
  ];
  let startMs = null; let finishMs = null;
  for (const item of startCandidates) {
    if (!isValidSapClock(item.time)) continue;
    const ms = sapDateAndTimeToMs(item.date, item.time);
    if (ms) { startMs = ms; break; }
  }
  for (const item of finishCandidates) {
    if (!isValidSapClock(item.time)) continue;
    const ms = sapDateAndTimeToMs(item.date, item.time);
    if (ms) { finishMs = ms; break; }
  }
  if (startMs && finishMs && finishMs < startMs) finishMs += 24 * 60 * 60 * 1000;
  const elapsedMs = startMs && finishMs ? Math.max(0, finishMs - startMs) : 0;
  return { startMs, finishMs, elapsedMs };
}

function isFinishedSapOperation(op) {
  const status = String(op?.FieldUserStatus || "").trim().toUpperCase();
  return status === "FINA" || status.includes("FINA");
}

function buildCheckedMapFromOperations(ops = [], { allowAllIfNoFinished = false } = {}) {
  const list = Array.isArray(ops) ? ops : [];
  let sourceOps = list.filter(isFinishedSapOperation);
  if (!sourceOps.length && allowAllIfNoFinished) sourceOps = list;
  const checkedMap = {};
  for (const op of sourceOps) {
    const activity = String(op?.Activity || op?.activity || op?.Vornr || "").trim();
    if (!activity) continue;
    checkedMap[activity] = true;
  }
  return checkedMap;
}

function checkedCountFromMap(checkedMap) {
  return Object.keys(checkedMap || {}).filter((k) => !!checkedMap[k]).length;
}

function pendingNeedsRecovery(pending) {
  if (!pending) return true;
  if (!checkedCountFromMap(pending?.checkedMap)) return true;
  if (!pending?.orderStartedAtMs || !pending?.orderFinishedAtMs) return true;
  const elapsedMs = pending?.orderElapsedMs ?? Math.max(0, pending.orderFinishedAtMs - pending.orderStartedAtMs);
  return !elapsedMs || elapsedMs <= 0;
}

async function fetchSapHeaderForRecovery({ apiClient, token, orderId }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await apiClient.get(`/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')`, {
    headers, params: { $format: "json", "sap-client": "400", "sap-language": "ES" },
  });
  return res?.data?.d || res?.data || {};
}

async function fetchSapOperationsForRecovery({ apiClient, token, orderId }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await apiClient.get(`/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToOperations`, {
    headers, params: { $format: "json", "sap-client": "400", "sap-language": "ES" },
  });
  const data = res?.data?.d?.results || res?.data?.results || res?.data?.operaciones || res?.data || [];
  return normalizeOpsForPdf(Array.isArray(data) ? data : []);
}

async function rebuildPendingSignFromSap({ apiClient, token, orderId, previousPending }) {
  const header = await fetchSapHeaderForRecovery({ apiClient, token, orderId });
  const operacionesSap = await fetchSapOperationsForRecovery({ apiClient, token, orderId });
  const finishedOps = operacionesSap.filter(isFinishedSapOperation);
  const checkedMap = buildCheckedMapFromOperations(operacionesSap, { allowAllIfNoFinished: true });
  if (!checkedCountFromMap(checkedMap)) throw new Error("No se pudieron reconstruir operaciones desde SAP.");
  let { startMs, finishMs, elapsedMs } = getRecoveredTimeFromSapHeader(header);
  let usedDefaultTime = false;
  if (!startMs || !finishMs || !elapsedMs) {
    const baseDate = parseSapDate(header?.ActualStartDate) || parseSapDate(header?.StartDate) || parseSapDate(header?.ProductionStartDate) || new Date();
    startMs = baseDate.getTime();
    finishMs = startMs + DEFAULT_RECOVERY_ELAPSED_MS;
    elapsedMs = DEFAULT_RECOVERY_ELAPSED_MS;
    usedDefaultTime = true;
  }
  return savePendingSign(orderId, {
    ...(previousPending || {}), checkedMap,
    consumibles: Array.isArray(previousPending?.consumibles) ? previousPending.consumibles : [],
    notaTecnico: String(previousPending?.notaTecnico || "").trim(),
    orderStartedAtMs: startMs, orderFinishedAtMs: finishMs, orderElapsedMs: elapsedMs,
    __recoveredFromSap: true, __recoveredAt: new Date().toISOString(),
    __recoveredUsedAllOperations: !finishedOps.length, __recoveredUsedDefaultTime: usedDefaultTime,
  });
}

async function getPendingSignForOrder({ apiClient, token, orderId }) {
  const pending = await loadPendingSign(orderId);
  if (!pendingNeedsRecovery(pending)) return pending;
  return rebuildPendingSignFromSap({ apiClient, token, orderId, previousPending: pending });
}

async function loadPending0400FromOffline(userEmail, sourceData = null) {
  try {
    let data;
    if (Array.isArray(sourceData)) {
      data = sourceData;
    } else {
      const cached = await loadOrdenesTecnicoList(userEmail);
      data = Array.isArray(cached?.data) ? cached.data : [];
    }
    const patchMap = await getLocalStatusPatch(userEmail);
    data = applyStatusPatchToOrdenes(data, patchMap);
    return data.filter((it) => {
      const orderId = String(it?.Orderid || it?.OrderId || "").trim();
      const localCode = normalizeCode(patchMap?.[orderId]?.code || patchMap?.[orderId]?.estatus_code || patchMap?.[orderId]?.status_code || patchMap?.[orderId]);
      if (localCode === "0300") return false;
      return isPending0400(it);
    });
  } catch { return []; }
}

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
      "[PENDIENTE_FIRMA] No se pudo leer el tipo guardado por TBMK:",
      error?.message || error,
    );
    return null;
  }
}

async function resolveEquipmentTypeForPdf({ orderId, pending, ordenFull }) {
  const id = String(orderId || "").trim();

  const pendingType = normalizeEquipmentType(
    pending?.tipo_equipo ||
      pending?.EquipmentType ||
      pending?.equipoSeleccionado,
  );
  const orderType = getEquipmentTypeFromOrder(ordenFull);
  const tbmkyType = id ? await loadTbmkyEquipmentType(id) : null;

  let resolvedType = pendingType || orderType || tbmkyType;

  if (!resolvedType) {
    const equipmentNumber = String(
      ordenFull?.Equipment ||
        ordenFull?.equipment ||
        ordenFull?.EQUIPMENT ||
        "",
    ).trim();

    if (equipmentNumber) {
      const sapResult = await fetchEquipmentType(equipmentNumber);
      resolvedType = normalizeEquipmentType(sapResult?.type);
    }
  }

  if (!resolvedType) {
    throw new Error(
      `No se pudo identificar el tipo de equipo de la orden ${id}. ` +
        "Abre el TBMK de la orden y selecciona Elevador o Escalera.",
    );
  }

  if (id && pendingType !== resolvedType) {
    await savePendingSign(id, {
      ...(pending || {}),
      tipo_equipo: resolvedType,
      EquipmentType: resolvedType,
    });
  }

  return resolvedType;
}

function detectCoberturaFromShortText(shortText) {
  const s = String(shortText || "").toUpperCase();
  if (s.includes("COBERTURA BASICA") || s.includes("COBERTURA BÁSICA")) return "BASICA";
  if (s.includes("COBERTURA MEDIA")) return "MEDIA";
  if (s.includes("COBERTURA SEMI")) return "SEMI";
  return "SIN COBERTURA";
}

function normalizeOpsForPdf(ops = []) {
  if (!Array.isArray(ops)) return [];
  return ops.map((op) => {
    const Activity = op.Activity || op.activity || op.Vornr || "";
    const Description = op.Description || op.description || op.Ltxa1 || "";
    const StandardTextKey = op.StandardTextKey || op.standardTextKey || "";
    return { ...op, activity: String(Activity), description: String(Description), Activity: String(Activity), Description: String(Description), StandardTextKey: String(StandardTextKey), standardTextKey: String(StandardTextKey) };
  });
}

function mapDireccionLikeBackend(addr) {
  if (!addr) return { cliente: "", direccion: "" };
  const cliente = [addr.Name1 ?? "", addr.Name2 ?? ""].filter(Boolean).join(" ").trim();
  const direccion = [
    `${addr.Street ?? addr.StreetName ?? ""} ${addr.HouseNum1 ?? ""}`.trim(),
    addr.StrSuppl3 ?? "", addr.Location ?? "", addr.City1 ?? "", addr.Region ?? "", addr.PostCode1 ?? "", addr.Country ?? "",
  ].filter((x) => x && String(x).trim().length > 0).join(", ");
  return { cliente, direccion };
}

function pickFirstAddress(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results[0];
}

async function resolveClienteNameForOrder({
  item,
  apiClient,
  token,
  allowRemote,
}) {
  const orderId = getOrderId(item);
  const currentName = extractClienteNameFromSource(item);

  if (currentName) {
    if (orderId) CLIENTE_NAME_MEMORY_CACHE.set(orderId, currentName);
    return currentName;
  }

  if (!orderId) return "";

  const memoryName = cleanClienteName(
    CLIENTE_NAME_MEMORY_CACHE.get(orderId)
  );
  if (memoryName) return memoryName;

  try {
    const cachedDetail = await loadOrdenTecnicoDetail(orderId);
    const localName = extractClienteNameFromSource(
      cachedDetail?.data || cachedDetail
    );

    if (localName) {
      CLIENTE_NAME_MEMORY_CACHE.set(orderId, localName);
      return localName;
    }
  } catch (error) {
    console.log("[PENDIENTE_FIRMA][Cliente local error]", {
      orderId,
      error: error?.message || error,
    });
  }

  if (!allowRemote || !apiClient) return "";

  let remotePromise = CLIENTE_NAME_REMOTE_IN_FLIGHT.get(orderId);

  if (!remotePromise) {
    remotePromise = runClienteRemoteWithLimit(() =>
      fetchClienteNameFromToAddresses({
        apiClient,
        token,
        orderId,
      })
    ).finally(() => {
      CLIENTE_NAME_REMOTE_IN_FLIGHT.delete(orderId);
    });

    CLIENTE_NAME_REMOTE_IN_FLIGHT.set(orderId, remotePromise);
  }

  const remoteName = cleanClienteName(await remotePromise);
  if (remoteName) CLIENTE_NAME_MEMORY_CACHE.set(orderId, remoteName);
  return remoteName;
}

async function enrichOrdersWithToAddressesCliente({
  orders,
  apiClient,
  token,
  allowRemote = false,
  concurrency = CLIENTE_LOOKUP_CONCURRENCY,
}) {
  const list = Array.isArray(orders) ? orders : [];
  if (list.length === 0) return [];

  const enriched = [...list];
  let nextIndex = 0;
  const workerCount = Math.min(
    list.length,
    Math.max(1, Number(concurrency) || CLIENTE_LOOKUP_CONCURRENCY)
  );

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= list.length) return;

      const item = list[index];
      const clienteName = await resolveClienteNameForOrder({
        item,
        apiClient,
        token,
        allowRemote,
      });

      enriched[index] = clienteName
        ? {
            ...item,
            Name1: clienteName,
            cliente: clienteName,
          }
        : item;
    }
  };

  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return enriched;
}

async function fetchClienteNameFromToAddresses({ apiClient, token, orderId }) {
  try {
    const id = String(orderId || "").trim();
    if (!id) return "";

    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    const res = await apiClient.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${id}')/ToAddresses`,
      {
        headers,
        params: {
          $format: "json",
          "sap-client": "400",
          "sap-language": "ES",
        },
      }
    );

    const results =
      res?.data?.d?.results ||
      res?.data?.results ||
      [];

    for (const node of Array.isArray(results) ? results : []) {
      const clienteName = getClienteNameFromAddressNode(node);
      if (clienteName) return clienteName;
    }

    return "";
  } catch (error) {
    console.log("[PENDIENTE_FIRMA][ToAddresses cliente error]", {
      orderId,
      error: error?.response?.data || error?.message || error,
    });

    return "";
  }
}

async function fetchOrdenFullForPdf({ apiClient, token, orderId }) {
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);
    if (cached?.data?.Orderid || cached?.data?.OrderId) {
      const ops = normalizeOpsForPdf(cached?.data?.operaciones || []);
      const shortTextCached = cached?.data?.ShortText || cached?.data?.shorttext || cached?.data?.Shorttext || cached?.data?.shortText || "";
      const coberturaCached = cached?.data?.cobertura_tipo || cached?.data?.coberturaTipo || detectCoberturaFromShortText(shortTextCached);
      return { ...cached.data, ShortText: shortTextCached, cobertura_tipo: coberturaCached || "SIN COBERTURA", operaciones: ops };
    }
  } catch {}
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const resOrden = await apiClient.get(`/api/ordenes/sap/${orderId}`, { headers }).catch(() => ({ data: {} }));
  const baseOrden = resOrden?.data || {};
  let shortTextHeader = "";
  try {
    const resHeader = await apiClient.get(`/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')`, { headers });
    shortTextHeader = resHeader?.data?.d?.ShortText || resHeader?.data?.d?.shorttext || "";
  } catch {}
  const shortTextForCoverage = shortTextHeader || baseOrden?.ShortText || baseOrden?.shorttext || baseOrden?.Shorttext || baseOrden?.shortText || "";
  const coberturaDetectada = detectCoberturaFromShortText(shortTextForCoverage);
  let ops = [];
  try {
    const resOps = await apiClient.get(`/api/operaciones/sap/${orderId}`, { headers });
    ops = Array.isArray(resOps?.data?.d?.results || resOps?.data?.results || resOps?.data?.operaciones || resOps?.data) ? (resOps?.data?.d?.results || resOps?.data?.results || resOps?.data?.operaciones || resOps?.data) : [];
  } catch {
    ops = Array.isArray(baseOrden?.operaciones) ? baseOrden.operaciones : [];
  }
  ops = normalizeOpsForPdf(ops);
  let direccionSap = ""; let clienteSap = "";
  try {
    const resAddr = await apiClient.get(`/api/ordenes/sap/${orderId}/addresses`, { headers });
    const results = resAddr?.data?.results || resAddr?.data?.d?.results || [];
    const mapped = mapDireccionLikeBackend(pickFirstAddress(results));
    direccionSap = mapped.direccion || ""; clienteSap = mapped.cliente || "";
  } catch {}
  return {
    ...baseOrden, ShortText: shortTextForCoverage || baseOrden?.ShortText || "",
    cobertura_tipo: coberturaDetectada || baseOrden?.cobertura_tipo || baseOrden?.coberturaTipo || "SIN COBERTURA",
    cliente: clienteSap || baseOrden?.cliente || baseOrden?.partner_name || `${baseOrden?.Name1 ?? ""} ${baseOrden?.Name2 ?? ""}`.trim(),
    direccion: direccionSap || baseOrden?.direccion || baseOrden?.address || baseOrden?.partner_address || "",
    operaciones: ops,
  };
}

function maskBase64Deep(value) {
  if (Array.isArray(value)) return value.map(maskBase64Deep);
  if (value && typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) {
      next[key] = key === "Base64" ? `<<base64 omitted: ${String(value[key] || "").length} chars>>` : maskBase64Deep(value[key]);
    }
    return next;
  }
  return value;
}

function logSapPayload(label, payload, { stripBase64 = false } = {}) {
  try { console.log(label); if (payload) { console.log(JSON.stringify(stripBase64 ? maskBase64Deep(payload) : payload, null, 2)); } } catch {}
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase()); }

function getSapErrorDetail(error, fallback = "No se pudo enviar a SAP.") {
  const data = error?.response?.data;
  const raw = data?.error?.message?.value || data?.message?.value || data?.detail || data?.error_description || data?.message || (typeof data?.error === "string" ? data.error : "") || error?.message || fallback;
  const status = error?.response?.status;
  return [status ? `HTTP ${status}${error?.response?.statusText ? ` ${error?.response?.statusText}` : ""}` : "", String(raw || fallback)].filter(Boolean).join(" - ");
}

function sanitizeFileName(value) { return String(value || "").replace(/[^\w.-]/g, "_").replace(/_+/g, "_"); }

function buildShortPdfFileName({ tipo, orderId }) {
  const cleanOrderId = sanitizeFileName(String(orderId || "").trim());
  const prefix = String(tipo || "").toLowerCase() === "escalera" ? "mantenimiento_esca" : "mantenimiento_elev";
  return `${prefix}_${cleanOrderId}.pdf`;
}

async function ensureDir(dir) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function readJsonIndex(key) { try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch { return []; } }
async function writeJsonIndex(key, items) { await AsyncStorage.setItem(key, JSON.stringify(items || [])); }
async function readFailedPdfsIndex() { return readJsonIndex(PENDING_PDFS_INDEX_KEY); }
async function writeFailedPdfsIndex(items) { return writeJsonIndex(PENDING_PDFS_INDEX_KEY, items); }
async function readSentPdfsIndex() { return readJsonIndex(SENT_PDFS_INDEX_KEY); }
async function writeSentPdfsIndex(items) { return writeJsonIndex(SENT_PDFS_INDEX_KEY, items); }

async function savePdfCopy({ targetDir, indexKey, orderId, tempUri, fileName, clienteEmail, clienteNombre, clienteCargo, comentarioCliente, reason = "" }) {
  await ensureDir(targetDir);
  const finalFileName = `${sanitizeFileName(orderId)}_${Date.now()}_${sanitizeFileName(fileName || `MANT_${orderId}.pdf`)}`;
  const finalUri = `${targetDir}${finalFileName}`;
  await FileSystem.copyAsync({ from: tempUri, to: finalUri });
  const prev = await readJsonIndex(indexKey);
  const item = { id: `${orderId}_${Date.now()}`, orderId: String(orderId), fileName: finalFileName, uri: finalUri, clienteEmail: String(clienteEmail || ""), clienteNombre: String(clienteNombre || ""), clienteCargo: String(clienteCargo || ""), comentarioCliente: String(comentarioCliente || ""), reason: String(reason || ""), createdAt: new Date().toISOString() };
  await writeJsonIndex(indexKey, [item, ...prev]);
  return item;
}

async function saveFailedSignaturePdf(args) { return savePdfCopy({ ...args, targetDir: PENDING_PDFS_DIR, indexKey: PENDING_PDFS_INDEX_KEY, reason: args?.reason || "No se pudo enviar a SAP" }); }
async function saveSentSignaturePdf(args) { return savePdfCopy({ ...args, targetDir: SENT_PDFS_DIR, indexKey: SENT_PDFS_INDEX_KEY }); }

async function deletePdfItem(item, indexKey) {
  try {
    if (!item?.uri) return;
    const prev = await readJsonIndex(indexKey);
    await writeJsonIndex(indexKey, prev.filter((x) => x.uri !== item.uri));
    await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
  } catch {}
}

function isTodayIso(value) {
  if (!value) return false;
  const d = new Date(value); const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

async function cleanupOldPdfItems(indexKey) {
  const items = await readJsonIndex(indexKey);
  const keep = [];
  for (const item of items) {
    if (isTodayIso(item?.createdAt)) keep.push(item);
    else if (item?.uri) await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
  }
  await writeJsonIndex(indexKey, keep);
  return keep;
}

async function sharePdfItem(item) {
  try {
    if (!item?.uri) { Alert.alert("PDF no disponible", "No se encontró la ruta del archivo."); return; }
    const info = await FileSystem.getInfoAsync(item.uri);
    if (!info.exists) { Alert.alert("PDF no encontrado", "El archivo ya no existe en el dispositivo."); return; }
    if (!(await Sharing.isAvailableAsync())) { Alert.alert("Compartir no disponible", "Este dispositivo no permite compartir archivos desde la app."); return; }
    await Sharing.shareAsync(item.uri, { mimeType: "application/pdf", dialogTitle: `Compartir PDF orden ${item.orderId}`, UTI: "com.adobe.pdf" });
  } catch (e) { Alert.alert("Error al compartir", e?.message || "No se pudo compartir el PDF."); }
}

async function generateMaintenancePdfFile({ html }) {
  const result = await Print.printToFileAsync({ html: String(html || ""), base64: true });
  if (!result?.base64) throw new Error("El PDF se generó vacío. Intenta generar nuevamente la orden.");
  const pdfBase64Final = await addPageNumbersToPdfBase64(result.base64);
  if (!pdfBase64Final) throw new Error("No se pudo corregir el PDF final.");
  await FileSystem.writeAsStringAsync(result.uri, pdfBase64Final, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: result.uri, base64: pdfBase64Final };
}

export default function PendienteFirmaIndex() {
  const { user, ensureValidToken, token } = useAuth();
  const {
    ordenes: ordenesCompartidas,
    loadingInitial: loading,
    refreshing: refreshingCentral,
    loadLocal,
    refresh,
  } = useOrdenesTecnico();
  const userEmail = safeStr(user?.correo || user?.email || user?.upn || user?.username).trim();
  const [isOnline, setIsOnline] = useState(true);
  const [allOrdenes, setAllOrdenes] = useState([]);
  const [historicalOrdenes, setHistoricalOrdenes] = useState([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [dateMode, setDateMode] = useState("all");
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState({});
  const [validatingOrders, setValidatingOrders] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationResults, setValidationResults] = useState([]);
  const [validatedOrderIds, setValidatedOrderIds] = useState([]);
  
  const [showPreviewModal, setShowPreviewModal] = useState(false); 
  const [showFirmaModal, setShowFirmaModal] = useState(false);
  const [showTempPreviewsModal, setShowTempPreviewsModal] = useState(false); 
  const [tempPreviews, setTempPreviews] = useState([]); 

  const [firmaDataUrl, setFirmaDataUrl] = useState(null);
  const [firmaForOrderIds, setFirmaForOrderIds] = useState([]);
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCargo, setClienteCargo] = useState("");
  const [comentarioCliente, setComentarioCliente] = useState("");
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, current: "" });
  const [sendResults, setSendResults] = useState([]);
  const [showSendSummaryModal, setShowSendSummaryModal] = useState(false);
  const [lastSendSummary, setLastSendSummary] = useState([]);
  const [showFailedPdfsModal, setShowFailedPdfsModal] = useState(false);
  const [failedPdfs, setFailedPdfs] = useState([]);
  const [showSentPdfsModal, setShowSentPdfsModal] = useState(false);
  const [sentPdfs, setSentPdfs] = useState([]);
  const signatureRef = useRef(null);
  const queueProcessingRef = useRef(false);
  const refreshing = refreshingCentral || loadingHistorical;

  const selectedIds = useMemo(() => Object.keys(selectedMap).filter((k) => !!selectedMap[k]), [selectedMap]);
  const selectedCount = selectedIds.length;
  const selectedAllReady = selectedCount > 0 && validatedOrderIds.length === selectedCount && selectedIds.every((id) => validatedOrderIds.includes(String(id)));
  const canSend = selectedCount > 0 && firmaDataUrl && isValidEmail(clienteEmail) && clienteNombre.trim() && clienteCargo.trim() && !sending;

  const { start, end } = useMemo(() => {
    if (dateMode === "day") return { start: atStartOfDay(dayRef), end: atStartOfDay(dayRef) };
    if (dateMode === "weekRange") return { start: weekStart ? atStartOfDay(weekStart) : atStartOfDay(new Date()), end: weekEnd ? atEndOfDay(weekEnd) : atEndOfDay(new Date()) };
    if (dateMode === "month") { const ref = new Date(monthYear.year, monthYear.month, 1); return { start: startOfMonth(ref), end: endOfMonth(ref) }; }
    if (dateMode === "year") return { start: startOfYear(yearOnly), end: endOfYear(yearOnly) };
    const s = new Date(); s.setDate(s.getDate() - 365); return { start: atStartOfDay(s), end: atEndOfDay(new Date()) };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const selectedRangeIsCached = useMemo(() => {
    const offlineWindow = buildOfflineWindow(new Date());
    const selectedStart = formatLocalYmd(start);
    const selectedEnd = formatLocalYmd(end);

    return (
      selectedStart >= offlineWindow.startStr &&
      selectedEnd <= offlineWindow.endStr
    );
  }, [start, end]);

  const selectedRangeKey = useMemo(
    () => `${formatLocalYmd(start)}:${formatLocalYmd(end)}`,
    [start, end],
  );

  const applySharedPending0400 = useCallback(async (data = []) => {
    if (!userEmail) {
      setAllOrdenes([]);
      return [];
    }

    const only0400 = await loadPending0400FromOffline(userEmail, data);
    setAllOrdenes(only0400);
    setSelectedMap((prev) => {
      const valid = new Set(only0400.map((x) => getOrderId(x)));
      const next = {};
      for (const k of Object.keys(prev)) {
        if (valid.has(k) && prev[k]) next[k] = true;
      }
      return next;
    });

    void enrichOrdersWithToAddressesCliente({
      orders: only0400,
      apiClient: api,
      token,
      allowRemote: isOnline,
      concurrency: CLIENTE_LOOKUP_CONCURRENCY,
    })
      .then((enriched0400) => {
        setAllOrdenes((current) =>
          mergeClienteNamesIntoCurrentOrders(current, enriched0400)
        );
      })
      .catch((error) => {
        console.log("[PENDIENTE_FIRMA][Cliente enriquecimiento local error]", {
          error: error?.message || error,
        });
      });

    return only0400;
  }, [isOnline, token, userEmail]);

  // Relee la caché central sin consultar SAP.
  const reloadPending0400Local = useCallback(async () => {
    try {
      const cached = await loadLocal();
      const data = Array.isArray(cached?.data) ? cached.data : [];
      return await applySharedPending0400(data);
    } catch (e) {
      console.warn("Error leyendo pendientes 0400 locales:", e?.message || e);
      return [];
    }
  }, [applySharedPending0400, loadLocal]);

  // Consulta temporal para rangos fuera de la ventana offline.
  // Estas órdenes viven sólo en memoria: no se guardan ni se precargan.
  const fetchHistoricalPending0400 = useCallback(async () => {
    if (selectedRangeIsCached) {
      setHistoricalOrdenes([]);
      return { ok: true, source: "cache_window", data: [] };
    }

    try {
      setLoadingHistorical(true);

      const net = await NetInfo.fetch();
      const online = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );
      setIsOnline(online);

      if (!online) {
        setHistoricalOrdenes([]);
        return { ok: false, reason: "offline", data: [] };
      }

      const okToken = await ensureValidToken();
      if (!okToken) {
        return { ok: false, reason: "invalid_token", data: [] };
      }

      const params = new URLSearchParams({
        start: formatLocalYmd(start),
        end: formatLocalYmd(end),
        mode: "range",
      });

      console.log("[PENDIENTE_FIRMA][HISTORICO] Consulta temporal:", {
        start: formatLocalYmd(start),
        end: formatLocalYmd(end),
      });

      const res = await api.get(`/api/ordenes/sap/list?${params.toString()}`);
      const remote = Array.isArray(res?.data) ? res.data : [];
      const only0400 = await loadPending0400FromOffline(userEmail, remote);

      setHistoricalOrdenes(only0400);

      void enrichOrdersWithToAddressesCliente({
        orders: only0400,
        apiClient: api,
        token,
        allowRemote: true,
        concurrency: CLIENTE_LOOKUP_CONCURRENCY,
      })
        .then((enriched0400) => {
          setHistoricalOrdenes((current) =>
            mergeClienteNamesIntoCurrentOrders(current, enriched0400)
          );
        })
        .catch((error) => {
          console.log("[PENDIENTE_FIRMA][Cliente enriquecimiento histórico error]", {
            error: error?.message || error,
          });
        });

      return {
        ok: true,
        source: "remote_temporary",
        data: only0400,
      };
    } catch (error) {
      console.log(
        "[PENDIENTE_FIRMA][HISTORICO] Error:",
        error?.response?.data || error?.message || error,
      );
      setHistoricalOrdenes([]);
      return { ok: false, reason: "request_error", error, data: [] };
    } finally {
      setLoadingHistorical(false);
    }
  }, [
    ensureValidToken,
    selectedRangeIsCached,
    selectedRangeKey,
    start,
    end,
    token,
    userEmail,
  ]);

  // Solo la recarga manual fuerza la actualización central desde SAP.
  const refreshOrdenes0400 = useCallback(async () => {
    if (!selectedRangeIsCached) {
      return fetchHistoricalPending0400();
    }

    try {
      const result = await refresh();
      const data = Array.isArray(result?.cached?.data)
        ? result.cached.data
        : [];
      await applySharedPending0400(data);
      return result;
    } catch (e) {
      console.warn("Error actualizando pendientes 0400:", e?.message || e);
      await reloadPending0400Local();
      return { ok: false, error: e };
    }
  }, [
    applySharedPending0400,
    fetchHistoricalPending0400,
    refresh,
    reloadPending0400Local,
    selectedRangeIsCached,
  ]);

  const processPendingQueue = useCallback(async () => {
    if (queueProcessingRef.current) return;
    try {
      queueProcessingRef.current = true;
      const net = await NetInfo.fetch();
      const online = !!(net?.isConnected && net?.isInternetReachable !== false);
      setIsOnline(online);
      if (!online || !(await ensureValidToken())) return;
      await processSapQueue({ ensureValidToken, apiInstance: api });
      await reloadPending0400Local();
    } catch (e) { console.warn("Error procesando cola SAP:", e); }
    finally { queueProcessingRef.current = false; }
  }, [ensureValidToken, reloadPending0400Local]);

  const loadFailedPdfs = useCallback(async () => {
    const items = await cleanupOldPdfItems(PENDING_PDFS_INDEX_KEY);
    const validItems = [];
    for (const item of items) {
      try { const info = await FileSystem.getInfoAsync(item.uri); if (info.exists && isTodayIso(item.createdAt)) validItems.push(item); } catch {}
    }
    if (validItems.length !== items.length) await writeFailedPdfsIndex(validItems);
    setFailedPdfs(validItems);
  }, []);

  const loadSentPdfs = useCallback(async () => {
    const items = await cleanupOldPdfItems(SENT_PDFS_INDEX_KEY);
    const validItems = [];
    for (const item of items) {
      try { const info = await FileSystem.getInfoAsync(item.uri); if (info.exists && isTodayIso(item.createdAt)) validItems.push(item); } catch {}
    }
    if (validItems.length !== items.length) await writeSentPdfsIndex(validItems);
    setSentPdfs(validItems);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!(state?.isConnected && state?.isInternetReachable !== false);
      setIsOnline(online);
      if (online) processPendingQueue();
    });
    NetInfo.fetch().then((state) => {
      const online = !!(state?.isConnected && state?.isInternetReachable !== false);
      setIsOnline(online);
      if (online) processPendingQueue();
    });
    return () => unsubscribe();
  }, [processPendingQueue]);

  useEffect(() => {
    applySharedPending0400(ordenesCompartidas);
  }, [applySharedPending0400, ordenesCompartidas]);

  useEffect(() => {
    if (selectedRangeIsCached) {
      setHistoricalOrdenes([]);
      return;
    }

    fetchHistoricalPending0400();
  }, [
    fetchHistoricalPending0400,
    selectedRangeIsCached,
    selectedRangeKey,
  ]);

  useEffect(() => { loadFailedPdfs(); loadSentPdfs(); }, [loadFailedPdfs, loadSentPdfs]);
  useFocusEffect(useCallback(() => {
    reloadPending0400Local();
    loadFailedPdfs();
    loadSentPdfs();
  }, [reloadPending0400Local, loadFailedPdfs, loadSentPdfs]));

  useEffect(() => {
    const source = mergeOrdersKeepingCache(
      allOrdenes,
      historicalOrdenes,
    );

    setRows(source.filter((item) => {
      if (!matchesQuery(item, query)) return false;
      const sd = parseSapDate(item?.start_date);
      return sd ? isWithin(sd, start, end) : false;
    }));
  }, [allOrdenes, historicalOrdenes, query, start, end]);

  useEffect(() => {
    setValidatedOrderIds((prev) => prev.filter((id) => selectedIds.includes(String(id))));
    setValidationResults((prev) => prev.filter((r) => selectedIds.includes(String(r.orderId))));
  }, [selectedIds.join("|")]);

  const groupedRows = useMemo(() => {
    return buildGroupedRows(rows);
  }, [rows]);

  const activeRangeText = useMemo(() => {
    if (dateMode === "all") return "Últimos 365 días";
    if (dateMode === "day") return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === "weekRange") return `Semana: ${weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—"} → ${weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—"}`;
    if (dateMode === "month") return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    if (dateMode === "year") return `Año: ${yearOnly}`;
    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const openDetalle = (orderId) => { const id = String(orderId || "").trim(); if (id) router.push(`/tecnico/ordenes/${id}`); };
  const toggleSelect = (orderId) => { const id = String(orderId || "").trim(); if (id) setSelectedMap((prev) => ({ ...prev, [id]: !prev[id] })); };
  const clearSelection = () => { setSelectedMap({}); setValidatedOrderIds([]); setValidationResults([]); };
  const resetFirmaFields = () => { setFirmaDataUrl(null); setFirmaForOrderIds([]); setClienteEmail(""); setClienteNombre(""); setClienteCargo(""); setComentarioCliente(""); };
  const clearFilters = () => { setQuery(""); setDateMode("all"); setDayRef(new Date()); setWeekStart(null); setWeekEnd(null); setMonthYear({ month: now.getMonth(), year: now.getFullYear() }); setYearOnly(now.getFullYear()); };

  const validateSelectedOrdersBeforeSign = async () => {
    if (!selectedIds.length) { Alert.alert("Selecciona órdenes", "Selecciona al menos una orden para validar."); return; }
    try {
      setValidatingOrders(true); setValidationResults([]); setValidatedOrderIds([]);
      const results = [];
      for (const orderIdRaw of selectedIds) {
        const orderId = String(orderIdRaw || "").trim();
        try {
          const pending = await getPendingSignForOrder({ apiClient: api, token, orderId });
          const checkedCount = checkedCountFromMap(pending?.checkedMap);
          if (!checkedCount) throw new Error("No tiene operaciones marcadas.");
          if (!pending?.orderStartedAtMs || !pending?.orderFinishedAtMs) throw new Error("Falta hora de inicio/fin guardada.");
          const elapsedMs = pending?.orderElapsedMs ?? Math.max(0, pending.orderFinishedAtMs - pending.orderStartedAtMs);
          if (!elapsedMs || elapsedMs <= 0) throw new Error("Tiempo total inválido.");
          const ordenFull = await fetchOrdenFullForPdf({ apiClient: api, token, orderId });
          if (!(Array.isArray(ordenFull?.operaciones) ? ordenFull.operaciones : []).length) throw new Error("Sin operaciones de SAP.");
          const tipo = await resolveEquipmentTypeForPdf({
            orderId,
            pending,
            ordenFull,
          });
          results.push({ orderId, ok: true, msg: "Orden lista para firma.", tipo, cobertura: String(ordenFull?.cobertura_tipo || ordenFull?.coberturaTipo || detectCoberturaFromShortText(ordenFull?.ShortText || "") || "SIN COBERTURA").trim(), operaciones: checkedCount, consumibles: Array.isArray(pending?.consumibles) ? pending.consumibles.length : 0 });
        } catch (err) {
          results.push({ orderId, ok: false, msg: getSapErrorDetail(err, "No se pudo validar.") });
        }
      }
      setValidationResults(results);
      setValidatedOrderIds(results.filter((r) => r.ok).map((r) => String(r.orderId)));
      setShowValidationModal(true);
    } catch (err) { Alert.alert("Error validando", err?.message || "Error general al validar."); } finally { setValidatingOrders(false); }
  };

  const continueToSignatureAfterValidation = () => {
    if (validationResults.filter((r) => !r.ok).length > 0) { Alert.alert("Revisar errores", "Desmarca órdenes con error."); return; }
    const okIds = validationResults.filter((r) => r.ok).map((r) => String(r.orderId));
    if (!okIds.length) { Alert.alert("Sin órdenes", "No hay órdenes válidas."); return; }
    resetFirmaFields(); setFirmaForOrderIds(okIds); 
    
    // Se usa un retraso ligero para que el modal se cierre antes de abrir el otro
    setShowValidationModal(false); 
    setTimeout(() => {
        setShowPreviewModal(true);
    }, 150);
  };

  const onSignatureOK = (sig) => { 
      setFirmaDataUrl(sig); 
      setShowFirmaModal(false); 
      Alert.alert("Firma capturada", `Lista para ${firmaForOrderIds.length} orden(es).`); 
  };
  
  const onSignatureEmpty = () => { Alert.alert("Firma vacía", "El cliente no firmó."); };

  const previewSelectedPdfs = async () => {
    const email = String(clienteEmail || "").trim();
    const nombre = String(clienteNombre || "").trim();
    const cargo = String(clienteCargo || "").trim();
    const comentario = String(comentarioCliente || "").trim();

    if (!selectedIds.length) return;
    if (!selectedAllReady) { Alert.alert("Valida primero", "Primero valida las órdenes."); return; }
    if (!email || !isValidEmail(email) || !nombre || !cargo || !comentario || !firmaDataUrl) {
      Alert.alert("Faltan datos", "Llena correo, nombre, cargo, comentario y captura la firma para generar la vista previa.");
      return;
    }

    try {
      setPreviewing(true);
      const generatedPreviews = []; 

      for (const orderIdRaw of selectedIds) {
        const orderId = String(orderIdRaw || "").trim();
        const pending = await getPendingSignForOrder({ apiClient: api, token, orderId });
        const ordenFull = await fetchOrdenFullForPdf({ apiClient: api, token, orderId });
        const tipo = await resolveEquipmentTypeForPdf({
          orderId,
          pending,
          ordenFull,
        });
        const tecnicoNombreFinal = String(user?.nombre || user?.name || user?.fullName || user?.displayName || user?.username || "").trim();

        const html = await buildMantenimientoHtml({
          tipo, orden: ordenFull,
          operaciones: Array.isArray(ordenFull?.operaciones) ? ordenFull.operaciones : [],
          checkedMap: pending.checkedMap, signatureData: firmaDataUrl,
          clienteEmail: email, clienteNombre: nombre, clienteCargo: cargo, avisoCliente: comentario,
          notaTecnico: String(pending?.notaTecnico || "").trim(), tecnicoNombre: tecnicoNombreFinal,
          coberturaTipo: String(ordenFull?.cobertura_tipo || ordenFull?.coberturaTipo || detectCoberturaFromShortText(ordenFull?.ShortText || "") || "SIN COBERTURA").trim(),
          consumibles: Array.isArray(pending?.consumibles) ? pending.consumibles : [],
          startMs: pending?.orderStartedAtMs, finishMs: pending?.orderFinishedAtMs,
          elapsedMs: pending?.orderElapsedMs ?? Math.max(0, pending?.orderFinishedAtMs - pending?.orderStartedAtMs),
        });

        const pdfResult = await generateMaintenancePdfFile({ html });

        generatedPreviews.push({
          id: `preview_${orderId}_${Date.now()}`,
          orderId,
          fileName: `VISTA_PREVIA_${buildShortPdfFileName({ tipo, orderId })}`,
          uri: pdfResult.uri,
          clienteNombre: nombre,
        });
      }

      setTempPreviews(generatedPreviews);
      setShowTempPreviewsModal(true); 
    } catch (err) {
      Alert.alert("Error de Vista Previa", getSapErrorDetail(err, "No se pudo generar la vista previa."));
    } finally {
      setPreviewing(false);
    }
  };

  const sendSelectedOrders = async () => {
    const email = String(clienteEmail || "").trim();
    const nombre = String(clienteNombre || "").trim();
    const cargo = String(clienteCargo || "").trim();
    const comentario = String(comentarioCliente || "").trim();

    if (!selectedIds.length) return;
    if (!selectedAllReady) { Alert.alert("Valida primero", "Valida antes de enviar."); return; }
    if (!email || !isValidEmail(email)) { setShowPreviewModal(true); Alert.alert("Error", "Correo inválido."); return; }
    if (!nombre) { setShowPreviewModal(true); Alert.alert("Error", "Falta nombre."); return; }
    if (!cargo) { setShowPreviewModal(true); Alert.alert("Error", "Falta cargo."); return; }
    if (!comentario) { setShowPreviewModal(true); Alert.alert("Error", "Falta comentario."); return; }
    if (!firmaDataUrl) { setShowFirmaModal(true); Alert.alert("Error", "Falta firma."); return; }

    const net = await NetInfo.fetch();
    const online = !!(net?.isConnected && net?.isInternetReachable !== false);
    if (online && !(await ensureValidToken())) return;

    Alert.alert(
      "Confirmar envío",
      online ? `Se enviará a SAP (${selectedIds.length} orden/es).\n\n¿Continuar?` : `No hay internet. Se guardará localmente (${selectedIds.length} orden/es) y se enviará luego.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, enviar", style: "default",
          onPress: async () => {
            setSending(true); setSendResults([]);
            setSendProgress({ done: 0, total: selectedIds.length, current: "Iniciando..." });
            const results = []; const toWorkOrders = []; const tempPdfsByOrder = {};
            
            try {
              for (let i = 0; i < selectedIds.length; i++) {
                const orderId = String(selectedIds[i] || "").trim();
                setSendProgress((p) => ({ ...p, current: `PDF #${orderId}` }));
                await new Promise((r) => setTimeout(r, 10));
                
                try {
                  const pending = await getPendingSignForOrder({ apiClient: api, token, orderId });
                  const ordenFull = await fetchOrdenFullForPdf({ apiClient: api, token, orderId });
                  const tipo = await resolveEquipmentTypeForPdf({
                    orderId,
                    pending,
                    ordenFull,
                  });
                  const tecnicoNombreFinal = String(user?.nombre || user?.name || user?.fullName || user?.displayName || user?.username || "").trim();

                  const html = await buildMantenimientoHtml({
                    tipo, orden: ordenFull, operaciones: Array.isArray(ordenFull?.operaciones) ? ordenFull.operaciones : [],
                    checkedMap: pending.checkedMap, signatureData: firmaDataUrl,
                    clienteEmail: email, clienteNombre: nombre, clienteCargo: cargo, avisoCliente: comentario,
                    notaTecnico: String(pending?.notaTecnico || "").trim(), tecnicoNombre: tecnicoNombreFinal,
                    coberturaTipo: String(ordenFull?.cobertura_tipo || ordenFull?.coberturaTipo || "SIN COBERTURA").trim(),
                    consumibles: Array.isArray(pending?.consumibles) ? pending.consumibles : [],
                    startMs: pending?.orderStartedAtMs, finishMs: pending?.orderFinishedAtMs,
                    elapsedMs: pending?.orderElapsedMs ?? Math.max(0, pending?.orderFinishedAtMs - pending?.orderStartedAtMs),
                  });

                  const pdfResult = await generateMaintenancePdfFile({ html });
                  const fileName = buildShortPdfFileName({ tipo, orderId });

                  tempPdfsByOrder[orderId] = { orderId, tempUri: pdfResult.uri, fileName, clienteEmail: email, clienteNombre: nombre, clienteCargo: cargo, comentarioCliente: comentario };
                  if (!pdfResult.base64) throw new Error("El PDF se generó vacío.");

                  toWorkOrders.push({
                    OrderId: orderId, WorkOrderHeader: { Orderid: orderId, Email: email },
                    WorkOrderUserStatusSet: [{ UserStText: "0300", Langu: "ES", Inactive: "" }, { UserStText: "0400", Langu: "ES", Inactive: "X" }],
                    Attachments: [{ DocId: orderId, FileName: fileName, MimeType: "application/pdf", Base64: pdfResult.base64 }],
                  });
                  setSendProgress((p) => ({ ...p, done: p.done + 1, current: `PDF listo #${orderId}` }));
                } catch (err) {
                  results.push({ orderId, ok: false, msg: getSapErrorDetail(err, "Fallo armando orden."), fileName: "", uri: "" });
                  setSendProgress((p) => ({ ...p, done: p.done + 1 }));
                }
              }

              if (!toWorkOrders.length) {
                setSendResults(results);
                setLastSendSummary(results);
                setShowSendSummaryModal(true);
                return;
              }

              const firstOrderId = String(
                toWorkOrders?.[0]?.OrderId || selectedIds?.[0] || "SIN_ORDEN"
              ).trim();

              const bulkPayload = {
                BulkId: buildWorkOrderBulkId({
                  firstOrderId,
                }),
                WorkOrderSet: toWorkOrders,
              };

              const workOrderBulkEndpoint =
                "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

              console.log("[PENDIENTE_FIRMA][BULK_ID]", {
                BulkId: bulkPayload.BulkId,
                firstOrderId,
                deviceModel: getDeviceModelForBulkId(),
                totalOrders: toWorkOrders.length,
              });

              logSapPayload(
                "[PENDIENTE_FIRMA][BULK_PAYLOAD_FINAL]",
                bulkPayload,
                { stripBase64: true }
              );

              if (!online) {
                await upsertSapQueueItem({ type: "PENDIENTE_FIRMA_BULK_0300", orderId: bulkPayload.BulkId, endpoint: workOrderBulkEndpoint, method: "POST", dedupeKey: `PENDIENTE_FIRMA_BULK_0300:${bulkPayload.BulkId}`, payload: bulkPayload });
                for (const item of toWorkOrders) {
                  const orderId = String(item?.OrderId || "").trim();
                  await setLocalStatusPatch(userEmail, orderId, "0300");
                  const tempPdf = tempPdfsByOrder[orderId];
                  let offlinePdfItem = null;
                  if (tempPdf?.tempUri) { offlinePdfItem = await saveSentSignaturePdf(tempPdf); await FileSystem.deleteAsync(tempPdf.tempUri, { idempotent: true }).catch(() => {}); }
                  results.push({ orderId, ok: true, msg: "Guardado offline.", fileName: offlinePdfItem?.fileName || tempPdf?.fileName || "", uri: offlinePdfItem?.uri || "" });
                }
                await loadSentPdfs();
              } else {
                try {
                  await api.post(workOrderBulkEndpoint, bulkPayload, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
                  for (const item of toWorkOrders) {
                    const orderId = String(item?.OrderId || "").trim();
                    const tempPdf = tempPdfsByOrder[orderId];
                    let sentPdfItem = null;
                    if (tempPdf?.tempUri) { sentPdfItem = await saveSentSignaturePdf(tempPdf); await FileSystem.deleteAsync(tempPdf.tempUri, { idempotent: true }).catch(() => {}); }
                    results.push({ orderId, ok: true, msg: "Enviado a SAP.", fileName: sentPdfItem?.fileName || tempPdf?.fileName || "", uri: sentPdfItem?.uri || "" });
                  }
                  await loadSentPdfs();
                } catch (sendErr) {
                  const msg = getSapErrorDetail(sendErr, "No se pudo enviar el paquete a SAP.");
                  for (const item of toWorkOrders) {
                    const orderId = String(item?.OrderId || "").trim();
                    const tempPdf = tempPdfsByOrder[orderId];
                    let failedPdfItem = null;
                    if (tempPdf?.tempUri) { failedPdfItem = await saveFailedSignaturePdf({ ...tempPdf, reason: msg }); await FileSystem.deleteAsync(tempPdf.tempUri, { idempotent: true }).catch(() => {}); }
                    results.push({ orderId, ok: false, msg: `Error: ${msg}.`, fileName: failedPdfItem?.fileName || tempPdf?.fileName || "", uri: failedPdfItem?.uri || "" });
                  }
                  await loadFailedPdfs();
                }
              }

              setSendResults([...results]);
              const okSet = new Set(results.filter((r) => r.ok).map((r) => String(r.orderId)));
              if (okSet.size) {
                setAllOrdenes((prev) => (prev || []).filter((it) => !okSet.has(String(it?.Orderid || it?.OrderId || ""))));
                setSelectedMap((prev) => { const next = { ...prev }; for (const id of okSet) delete next[id]; return next; });
              }
              setLastSendSummary([...results]);
              setShowSendSummaryModal(true);
              if (results.filter((r) => !r.ok).length === 0) { setSelectMode(false); clearSelection(); resetFirmaFields(); }
            } catch (globalErr) { Alert.alert("Error Global", "Ocurrió un fallo general."); }
            finally { setSending(false); setSendProgress((p) => ({ ...p, current: "" })); }
          },
        },
      ]
    );
  };

  const YearPickerContent = ({ selectedYear, onSelect, from = 2020, to = now.getFullYear() + 2 }) => {
    const years = []; for (let y = to; y >= from; y--) years.push(y);
    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((y) => (
          <TouchableOpacity key={y} style={[styles.yearItem, selectedYear === y && styles.yearItemActive]} onPress={() => onSelect(y)}>
            <Text style={[styles.yearItemText, selectedYear === y && styles.yearItemTextActive]}>{y}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderOrderItem = ({ item }) => {
    const orderId = getOrderId(item);
    const equipo = getEquipoNumber(item);
    const cliente = getClienteName(item);
    const tipoOrden = getTipoOrden(item);
    const fechaLarga = formatLongDate(item?.start_date);
    const checked = !!selectedMap[orderId];
    const isValidated = validatedOrderIds.includes(orderId);

    return (
      <Pressable
        style={[
          styles.cleanOrderCard,
          checked && styles.cleanOrderCardSelected,
          isValidated && styles.cleanOrderCardValidated,
        ]}
        onPress={() => {
          if (selectMode) {
            toggleSelect(orderId);
          } else {
            openDetalle(orderId);
          }
        }}
      >
        <View style={styles.cleanOrderTop}>
          <View style={styles.cleanOrderLeft}>
            {selectMode ? (
              <CheckBox checked={checked} onPress={() => toggleSelect(orderId)} />
            ) : (
              <View style={styles.cleanStatusDot} />
            )}
          </View>

          <View style={styles.cleanOrderContent}>
            <View style={styles.cleanEquipmentRow}>
              <Text style={styles.cleanEquipmentText} numberOfLines={1}>
                {equipo}
              </Text>

              {isValidated ? (
                <Ionicons name="shield-checkmark" size={15} color={FIORI.ok} />
              ) : null}
            </View>

            <View style={styles.cleanMetaRow}>
              <Ionicons name="document-text-outline" size={12} color={FIORI.textMuted} />
              <Text style={styles.cleanMetaText} numberOfLines={1}>
                Orden #{orderId} · {tipoOrden}
              </Text>
            </View>

            <View style={styles.cleanMetaRow}>
              <Ionicons name="calendar-outline" size={12} color={FIORI.accent} />
              <Text style={styles.cleanDateText} numberOfLines={1}>
                {fechaLarga}
              </Text>
            </View>

            <View style={styles.cleanMetaRow}>
              <Ionicons name="business-outline" size={12} color={FIORI.textMuted} />
              <Text style={styles.cleanClientText} numberOfLines={1}>
                {cliente}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderGroupedItem = ({ item }) => {
    if (item.type === "monthHeader") {
      return (
        <View style={styles.monthGroupHeader}>
          <Text style={styles.monthGroupTitle}>{item.title}</Text>
        </View>
      );
    }

    if (item.type === "clientHeader") {
      return (
        <View style={styles.clientGroupHeader}>
          <View style={styles.clientIconBox}>
            <Ionicons name="business" size={14} color={FIORI.accent} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.clientGroupTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.clientGroupSub}>
              {item.count} {item.count === 1 ? "orden pendiente" : "órdenes pendientes"}
            </Text>
          </View>
        </View>
      );
    }

    return renderOrderItem({ item: item.item });
  };

  return (
    <View style={styles.container}>
      <Header title="Pendiente de firma" />
      <View style={styles.topPanel}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={FIORI.textMuted} />
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Buscar orden, equipo…" placeholderTextColor={FIORI.textMuted} returnKeyType="search" />
          </View>
          <TouchableOpacity style={[styles.selectBtn, selectMode ? styles.selectBtnCancel : styles.selectBtnActive]} onPress={() => { if (selectMode) { setSelectMode(false); clearSelection(); resetFirmaFields(); } else setSelectMode(true); }}>
            <Ionicons name={selectMode ? "close" : "checkbox-outline"} size={18} color="#fff" />
            <Text style={styles.selectBtnText}>{selectMode ? "Cancelar" : "Seleccionar"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.historyRow}>
            <TouchableOpacity style={styles.historyBtn} onPress={async () => { await loadSentPdfs(); setShowSentPdfsModal(true); }}>
              <Ionicons name="checkmark-done-outline" size={14} color={FIORI.ok} />
              <Text style={styles.historyBtnText}>PDFs Enviados</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyBtn} onPress={async () => { await loadFailedPdfs(); setShowFailedPdfsModal(true); }}>
              <Ionicons name="alert-circle-outline" size={14} color={FIORI.warn} />
              <Text style={styles.historyBtnText}>PDFs Pendientes</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.filterModeRow}>
          {[["all", "Todas"], ["day", "Día"], ["weekRange", "Semana"], ["month", "Mes"], ["year", "Año"]].map(([mode, label]) => (
            <TouchableOpacity
              key={mode}
              style={[styles.filterModeButton, dateMode === mode && styles.filterModeButtonActive]}
              onPress={() => {
                setDateMode(mode);
                if (mode === "day") setShowDayPicker(true);
                if (mode === "weekRange") setShowWeekStartPicker(true);
                if (mode === "month") setShowMonthModal(true);
                if (mode === "year") setShowYearModal(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterModeText, dateMode === mode && styles.filterModeTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filterActionsRow}>
          <TouchableOpacity style={styles.clearFilterButton} onPress={clearFilters} activeOpacity={0.85}>
            <Ionicons name="close-circle-outline" size={16} color={FIORI.ink} />
            <Text style={styles.clearFilterButtonText}>Limpiar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.reloadFilterButton} onPress={refreshOrdenes0400} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.reloadFilterButtonText}>Recargar</Text>
          </TouchableOpacity>
        </View>
        {showDayPicker && <DateTimePicker value={dayRef ?? new Date()} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} onChange={(e, date) => { if (Platform.OS === "android") { setShowDayPicker(false); if (e.type !== "set") return; } if (date) setDayRef(date); if (Platform.OS === "ios") setShowDayPicker(true); }} />}
        {showWeekStartPicker && <DateTimePicker value={weekStart ?? new Date()} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} onChange={(e, date) => { if (Platform.OS === "android") { setShowWeekStartPicker(false); if (e.type !== "set") return; } if (date) { setWeekStart(date); if (Platform.OS !== "ios") setShowWeekEndPicker(true); } if (Platform.OS === "ios") setShowWeekStartPicker(true); }} />}
        {showWeekEndPicker && <DateTimePicker value={weekEnd ?? weekStart ?? new Date()} mode="date" minimumDate={weekStart ?? undefined} display={Platform.OS === "ios" ? "inline" : "default"} onChange={(e, date) => { if (Platform.OS === "android") { setShowWeekEndPicker(false); if (e.type !== "set") return; } if (date) setWeekEnd(date); if (Platform.OS === "ios") setShowWeekEndPicker(true); }} />}
      </View>

      {loading && allOrdenes.length === 0 ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={FIORI.accent} /><Text style={styles.loadingText}>Cargando órdenes…</Text></View>
      ) : (
        <FlatList
          data={groupedRows}
          keyExtractor={(item) => item.key}
          renderItem={renderGroupedItem}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: selectMode ? 210 : 90 }}
          refreshing={refreshing}
          onRefresh={refreshOrdenes0400}
          ListEmptyComponent={<View style={styles.emptyBox}><Ionicons name="document-text-outline" size={32} color={FIORI.textMuted} /><Text style={styles.emptyTitle}>Sin órdenes pendientes</Text><Text style={styles.emptySub}>No hay órdenes pendientes con los filtros actuales.</Text></View>}
        />
      )}

      {selectMode && (
        <View style={styles.wizardBar}>
          <View style={styles.wizardHeaderCompact}>
            <View style={styles.wizardHeaderTextBox}>
              <Text style={styles.wizardTitle}>Finalizar órdenes pendientes</Text>
              <Text style={styles.wizardSub}>Órdenes seleccionadas: {selectedCount}</Text>
              <Text style={styles.wizardTinyInfo}>{isOnline ? "Online" : "Offline"} · {activeRangeText}</Text>
            </View>
          </View>
          <View style={styles.wizardStepsRow}>
            <TouchableOpacity style={[styles.stepButton, selectedCount ? styles.stepButtonActive : styles.stepButtonDisabled]} onPress={validateSelectedOrdersBeforeSign} disabled={!selectedCount || validatingOrders || sending}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
              <Text style={styles.stepButtonText}>{validatingOrders ? "Validando" : "1 Validar"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.stepButton, selectedAllReady ? styles.stepButtonActive : styles.stepButtonDisabled]} onPress={() => { if (!selectedAllReady) { Alert.alert("Valida primero", "Primero valida."); } else { setShowPreviewModal(true); } }} disabled={!selectedCount || sending}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.stepButtonText}>2 Datos y Firma</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.stepButton, canSend ? styles.stepButtonSuccess : styles.stepButtonDisabled]} onPress={sendSelectedOrders} disabled={!canSend}>
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={styles.stepButtonText}>{sending ? "Enviando" : "3 Enviar"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.wizardStatusBox}>
            <Text style={styles.wizardStatusText}>
              {selectedAllReady
                ? firmaDataUrl ? "Todo listo. Ya puedes enviar las órdenes a SAP." : "Paso 1 listo. Presiona 'Datos y Firma' para capturar info."
                : "Selecciona órdenes y presiona Validar para empezar."}
            </Text>
          </View>
        </View>
      )}

      {/* MODAL: MESES */}
      <Modal visible={showMonthModal} transparent animationType="fade" onRequestClose={() => setShowMonthModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMonthYear((s) => ({ ...s, year: s.year - 1 }))}><Text style={styles.modalHeaderBtn}>{"‹"}</Text></TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>{monthYear.year}</Text>
              <TouchableOpacity onPress={() => setMonthYear((s) => ({ ...s, year: s.year + 1 }))}><Text style={styles.modalHeaderBtn}>{"›"}</Text></TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => (
                <TouchableOpacity key={m} style={[styles.monthCell, idx === monthYear.month && dateMode === "month" && styles.monthCellActive]} onPress={() => { setMonthYear({ month: idx, year: monthYear.year }); setShowMonthModal(false); }}>
                  <Text style={[styles.monthCellText, idx === monthYear.month && dateMode === "month" && styles.monthCellTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => setShowMonthModal(false)}><Text style={styles.modalPrimaryBtnText}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: AÑOS */}
      <Modal visible={showYearModal} transparent animationType="fade" onRequestClose={() => setShowYearModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { marginBottom: 10 }]}>Selecciona un año</Text>
            <YearPickerContent selectedYear={yearOnly} onSelect={(y) => { setYearOnly(y); setShowYearModal(false); }} from={now.getFullYear() - 10} to={now.getFullYear() + 2} />
            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => setShowYearModal(false)}><Text style={styles.modalPrimaryBtnText}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: VALIDACIÓN */}
      <Modal visible={showValidationModal} transparent animationType="slide" onRequestClose={() => setShowValidationModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>Validación de órdenes</Text>
            <Text style={styles.modalSub}>Listas: {validationResults.filter((r) => r.ok).length} · Con error: {validationResults.filter((r) => !r.ok).length}</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {validationResults.map((item) => (
                <View key={`${item.orderId}-${item.ok ? "ok" : "error"}`} style={styles.resultCard}>
                  <View style={styles.resultHeader}><Text style={styles.resultTitle}>Orden #{item.orderId}</Text><View style={[styles.resultBadge, item.ok ? styles.resultBadgeOk : styles.resultBadgeError]}><Text style={[styles.resultBadgeText, { color: item.ok ? FIORI.ok : FIORI.danger }]}>{item.ok ? "LISTA" : "REVISAR"}</Text></View></View>
                  <Text style={styles.previewOrderText}>{item.msg}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowValidationModal(false)}><Text style={styles.modalSecondaryBtnText}>Cerrar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalActionBtn, validationResults.some((r) => !r.ok) && { backgroundColor: "#9AA5B1" }]} disabled={validationResults.some((r) => !r.ok)} onPress={continueToSignatureAfterValidation}>
                <Ionicons name="arrow-forward-outline" size={18} color="#fff" style={{ marginRight: 6 }} /><Text style={styles.modalActionBtnText}>Continuar a Datos</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: DATOS DEL CLIENTE */}
      <Modal visible={showPreviewModal} transparent animationType="slide" onRequestClose={() => setShowPreviewModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "92%" }]}>
            <Text style={styles.modalTitle}>Datos y Firma del Cliente</Text>
            <Text style={styles.modalSub}>Estos datos aparecerán en los PDFs de las órdenes validadas.</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 560 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Información del cliente</Text>
                <View style={styles.inputGroup}><Text style={styles.inputLabel}>Correo</Text><TextInput value={clienteEmail} onChangeText={setClienteEmail} placeholder="correo@ejemplo.com" placeholderTextColor={FIORI.textMuted} autoCapitalize="none" keyboardType="email-address" style={[styles.formInput, !!clienteEmail && !isValidEmail(clienteEmail) && styles.inputError]} /></View>
                <View style={styles.inputGroup}><Text style={styles.inputLabel}>Nombre</Text><TextInput value={clienteNombre} onChangeText={setClienteNombre} placeholder="Nombre y apellidos" placeholderTextColor={FIORI.textMuted} autoCapitalize="words" style={styles.formInput} /></View>
                <View style={styles.inputGroup}><Text style={styles.inputLabel}>Cargo</Text><TextInput value={clienteCargo} onChangeText={setClienteCargo} placeholder="Ej. Administrador" placeholderTextColor={FIORI.textMuted} autoCapitalize="words" style={styles.formInput} /></View>
                <View style={styles.inputGroup}><Text style={styles.inputLabel}>Comentarios (opcional)</Text><TextInput value={comentarioCliente} onChangeText={setComentarioCliente} placeholder="Comentario..." placeholderTextColor={FIORI.textMuted} multiline style={[styles.formInput, styles.textAreaInput]} /></View>
              </View>
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Firma</Text>
                <View style={styles.signatureStatusBox}>
                  <Ionicons name={firmaDataUrl ? "checkmark-circle" : "create-outline"} size={22} color={firmaDataUrl ? FIORI.ok : FIORI.warn} />
                  <View style={{ flex: 1 }}><Text style={styles.signatureStatusTitle}>{firmaDataUrl ? "Firma capturada" : "Firma pendiente"}</Text></View>
                  <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => { 
                      setShowPreviewModal(false); 
                      setTimeout(() => setShowFirmaModal(true), 150); 
                  }}>
                    <Text style={styles.miniPrimaryBtnText}>{firmaDataUrl ? "Volver a Firmar" : "Firmar"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
            
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowPreviewModal(false)}><Text style={styles.modalSecondaryBtnText}>Cerrar</Text></TouchableOpacity>
              
              <TouchableOpacity style={[styles.modalSecondaryBtn, !canSend && { opacity: 0.5 }]} disabled={!canSend || previewing} onPress={previewSelectedPdfs}>
                <Ionicons name="eye-outline" size={18} color={FIORI.ink} style={{ marginRight: 6 }} />
                <Text style={styles.modalSecondaryBtnText}>{previewing ? "Generando..." : "Ver Vista Previa"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalActionBtn, !canSend && { backgroundColor: "#9AA5B1" }]} disabled={!canSend} onPress={() => { setShowPreviewModal(false); setTimeout(() => sendSelectedOrders(), 150); }}>
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.modalActionBtnText}>Enviar a SAP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: VISUALIZAR VISTAS PREVIAS */}
      <Modal visible={showTempPreviewsModal} transparent animationType="slide" onRequestClose={() => setShowTempPreviewsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>Vista Previa (Borradores)</Text>
            <Text style={styles.modalSub}>Revisa cómo se verán los PDFs. Estos archivos no se han enviado ni guardado en el historial.</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {tempPreviews.map((item) => (
                <View key={item.id} style={styles.resultCard}>
                  <View style={styles.resultHeader}><Text style={styles.resultTitle}>Orden #{item.orderId}</Text></View>
                  <Text style={styles.previewOrderText}>Cliente: {item.clienteNombre}</Text>
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}>
                      <Ionicons name="document-text-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
                      <Text style={styles.miniPrimaryBtnText}>Ver / Compartir Archivo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowTempPreviewsModal(false)}><Text style={styles.modalActionBtnText}>Regresar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: FIRMA */}
      <Modal visible={showFirmaModal} transparent animationType="slide" onRequestClose={() => setShowFirmaModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
             <Text style={styles.modalTitle}>Firma del cliente</Text>
             <Text style={styles.modalSub}>Órdenes a firmar: <Text style={{ fontWeight: "900" }}>{firmaForOrderIds.length || selectedIds.length}</Text></Text>
             <View style={styles.signatureWrap}>
                <Signature ref={signatureRef} onOK={onSignatureOK} onEmpty={onSignatureEmpty} autoClear={false} descriptionText="Firma dentro del recuadro" webStyle={`.m-signature-pad { box-shadow: none; border: none; } .m-signature-pad--body { border: 1px solid #DDE6F2; border-radius: 12px; } .m-signature-pad--footer { display: none; margin: 0px; } body,html { width: 100%; height: 100%; }`} />
             </View>
             <View style={styles.modalActionsRow}>
                <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => signatureRef.current?.clearSignature?.()}><Ionicons name="trash-outline" size={18} color={FIORI.ink} style={{ marginRight: 6 }} /><Text style={styles.modalSecondaryBtnText}>Limpiar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => { setShowFirmaModal(false); setTimeout(() => setShowPreviewModal(true), 150); }}><Text style={styles.modalSecondaryBtnText}>Volver</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalActionBtn} onPress={() => signatureRef.current?.readSignature?.()}><Ionicons name="checkmark-done-outline" size={18} color="#fff" style={{ marginRight: 6 }} /><Text style={styles.modalActionBtnText}>Guardar firma</Text></TouchableOpacity>
             </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: PDFs ENVIADOS */}
      <Modal visible={showSentPdfsModal} transparent animationType="slide" onRequestClose={() => setShowSentPdfsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>PDFs enviados / generados</Text>
            <Text style={styles.modalSub}>Solo se muestran PDFs enviados o generados hoy.</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {sentPdfs.length === 0 ? (
                <View style={styles.emptyMiniBox}><Ionicons name="document-outline" size={30} color={FIORI.textMuted} /><Text style={styles.emptyMiniTitle}>No hay PDFs enviados de hoy.</Text></View>
              ) : (
                sentPdfs.map((item) => (
                  <View key={item.id} style={styles.resultCard}>
                    <View style={styles.resultHeader}><Text style={styles.resultTitle}>Orden #{item.orderId}</Text><View style={[styles.resultBadge, styles.resultBadgeOk]}><Text style={[styles.resultBadgeText, { color: FIORI.ok }]}>DISPONIBLE</Text></View></View>
                    <Text style={styles.previewOrderText}>Archivo: {item.fileName}</Text>
                    <Text style={styles.previewOrderText}>Cliente: {item.clienteNombre || "—"}</Text>
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}><Ionicons name="share-social-outline" size={16} color="#fff" style={{ marginRight: 5 }} /><Text style={styles.miniPrimaryBtnText}>Compartir</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.miniDangerBtn} onPress={() => { Alert.alert("Eliminar PDF", `¿Eliminar el PDF de la orden ${item.orderId}?`, [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: async () => { await deletePdfItem(item, SENT_PDFS_INDEX_KEY); await loadSentPdfs(); } }]); }}><Ionicons name="trash-outline" size={16} color={FIORI.danger} style={{ marginRight: 5 }} /><Text style={styles.miniDangerBtnText}>Eliminar</Text></TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowSentPdfsModal(false)}><Text style={styles.modalActionBtnText}>Cerrar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: PDFs PENDIENTES */}
      <Modal visible={showFailedPdfsModal} transparent animationType="slide" onRequestClose={() => setShowFailedPdfsModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>PDFs pendientes / no enviados</Text>
            <Text style={styles.modalSub}>Solo se muestran PDFs pendientes generados hoy.</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {failedPdfs.length === 0 ? (
                <View style={styles.emptyMiniBox}><Ionicons name="checkmark-circle-outline" size={30} color={FIORI.ok} /><Text style={styles.emptyMiniTitle}>No hay PDFs pendientes de hoy.</Text></View>
              ) : (
                failedPdfs.map((item) => (
                  <View key={item.id} style={styles.resultCard}>
                    <View style={styles.resultHeader}><Text style={styles.resultTitle}>Orden #{item.orderId}</Text><View style={[styles.resultBadge, styles.resultBadgeError]}><Text style={[styles.resultBadgeText, { color: FIORI.danger }]}>PENDIENTE</Text></View></View>
                    <Text style={styles.previewOrderText}>Archivo: {item.fileName}</Text>
                    <Text style={styles.previewOrderText}>Cliente: {item.clienteNombre || "—"}</Text>
                    <Text style={styles.previewOrderText}>Motivo: {item.reason || "No se pudo enviar a SAP"}</Text>
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}><Ionicons name="share-social-outline" size={16} color="#fff" style={{ marginRight: 5 }} /><Text style={styles.miniPrimaryBtnText}>Compartir</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.miniDangerBtn} onPress={() => { Alert.alert("Eliminar PDF", `¿Eliminar el PDF de la orden ${item.orderId}?`, [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: async () => { await deletePdfItem(item, PENDING_PDFS_INDEX_KEY); await loadFailedPdfs(); } }]); }}><Ionicons name="trash-outline" size={16} color={FIORI.danger} style={{ marginRight: 5 }} /><Text style={styles.miniDangerBtnText}>Eliminar</Text></TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowFailedPdfsModal(false)}><Text style={styles.modalActionBtnText}>Cerrar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: RESUMEN DE ENVÍO */}
      <Modal visible={showSendSummaryModal} transparent animationType="slide" onRequestClose={() => setShowSendSummaryModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>{lastSendSummary.some((r) => !r.ok) ? "Envío con detalles" : "Envío completado"}</Text>
            <Text style={styles.modalSub}>Correctas: {lastSendSummary.filter((r) => r.ok).length} · Con error: {lastSendSummary.filter((r) => !r.ok).length}</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 460 }}>
              {lastSendSummary.map((item) => (
                <View key={`${item.orderId}-${item.ok ? "ok" : "fail"}`} style={styles.resultCard}>
                  <View style={styles.resultHeader}><Text style={styles.resultTitle}>Orden #{item.orderId}</Text><View style={[styles.resultBadge, item.ok ? styles.resultBadgeOk : styles.resultBadgeError]}><Text style={[styles.resultBadgeText, { color: item.ok ? FIORI.ok : FIORI.danger }]}>{item.ok ? "ENVIADA" : "NO ENVIADA"}</Text></View></View>
                  <Text style={styles.previewOrderText}>{item.msg}</Text>
                  {!!item.fileName && <Text style={styles.previewOrderText}>PDF: {item.fileName}</Text>}
                  {!!item.uri && <TouchableOpacity style={styles.miniPrimaryBtn} onPress={() => sharePdfItem(item)}><Ionicons name="share-social-outline" size={16} color="#fff" style={{ marginRight: 5 }} /><Text style={styles.miniPrimaryBtnText}>Compartir PDF</Text></TouchableOpacity>}
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalActionBtn} onPress={() => setShowSendSummaryModal(false)}><Text style={styles.modalActionBtnText}>Cerrar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ESTADO ENVIANDO (SPINNER) */}
      <Modal visible={sending} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.blockBackdrop}>
          <View style={styles.blockCard}>
            <ActivityIndicator size="large" color={FIORI.accent} />
            <Text style={styles.blockTitle}>Enviando a SAP… ({sendProgress.done}/{sendProgress.total})</Text>
            <Text style={styles.blockSub}>Actual: <Text style={{ fontWeight: "900" }}>{sendProgress.current || "—"}</Text></Text>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  topPanel: { backgroundColor: FIORI.cardBg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: FIORI.border },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchBox: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: FIORI.cardSubtle, borderWidth: 1, borderColor: FIORI.border, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: FIORI.ink, paddingVertical: Platform.OS === "ios" ? 10 : 7 },
  selectBtn: { minHeight: 44, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  selectBtnActive: { backgroundColor: FIORI.accent },
  selectBtnCancel: { backgroundColor: FIORI.danger },
  selectBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  historyRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingBottom: 4 },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: FIORI.cardSubtle, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: FIORI.border },
  historyBtnText: { fontSize: 12, fontWeight: '800', color: FIORI.ink },
  filterModeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    padding: 4,
    borderRadius: 14,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  filterModeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterModeButtonActive: { backgroundColor: FIORI.accent },
  filterModeText: { color: FIORI.textMuted, fontWeight: "800", fontSize: 11 },
  filterModeTextActive: { color: "#FFFFFF" },
  filterActionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  clearFilterButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
    backgroundColor: FIORI.neutralBtn,
  },
  clearFilterButtonText: { color: FIORI.ink, fontWeight: "800", fontSize: 12 },
  reloadFilterButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: FIORI.accent,
  },
  reloadFilterButtonText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  loadingWrap: { paddingTop: 28, alignItems: "center" },
  loadingText: { marginTop: 10, color: FIORI.textMuted, fontWeight: "700" },
  emptyBox: { marginTop: 28, alignItems: "center", padding: 20 },
  emptyTitle: { marginTop: 8, color: FIORI.ink, fontSize: 16, fontWeight: "900" },
  emptySub: { marginTop: 4, color: FIORI.textMuted, textAlign: "center", fontSize: 13 },
  cbBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: FIORI.warn, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  cbBoxChecked: { backgroundColor: FIORI.warn },
  wizardBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: FIORI.cardBg, borderTopWidth: 1, borderTopColor: FIORI.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 24 : 14 },
  wizardHeaderCompact: { marginBottom: 8 },
  wizardHeaderTextBox: { width: "100%" },
  wizardTitle: { color: FIORI.ink, fontSize: 15, fontWeight: "900" },
  wizardSub: { color: FIORI.textMuted, fontSize: 12, marginTop: 2, fontWeight: "700" },
  wizardTinyInfo: { color: FIORI.textMuted, fontSize: 11, marginTop: 2, fontWeight: "700" },
  wizardStepsRow: { flexDirection: "row", gap: 8 },
  stepButton: { flex: 1, minHeight: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  stepButtonActive: { backgroundColor: FIORI.accent },
  stepButtonSuccess: { backgroundColor: FIORI.successDark },
  stepButtonDisabled: { backgroundColor: "#9AA5B1" },
  stepButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  wizardStatusBox: { marginTop: 9, backgroundColor: FIORI.cardSubtle, borderWidth: 1, borderColor: FIORI.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  wizardStatusText: { color: FIORI.textMuted, fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: FIORI.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: FIORI.border },
  modalCardLarge: { width: "100%", maxWidth: 560, backgroundColor: FIORI.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: FIORI.border },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalHeaderTitle: { fontSize: 18, fontWeight: "900", color: FIORI.ink },
  modalHeaderBtn: { fontSize: 24, fontWeight: "900", color: FIORI.accent, paddingHorizontal: 12 },
  modalTitle: { color: FIORI.ink, fontSize: 18, fontWeight: "900" },
  modalSub: { marginTop: 6, color: FIORI.textMuted, fontSize: 13, fontWeight: "700" },
  modalActionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 14 },
  modalActionBtn: { backgroundColor: FIORI.accent, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  modalActionBtnText: { color: "#fff", fontWeight: "900" },
  modalSecondaryBtn: { backgroundColor: FIORI.cardSubtle, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: FIORI.border, flexDirection: "row", alignItems: "center" },
  modalSecondaryBtnText: { color: FIORI.ink, fontWeight: "900" },
  modalPrimaryBtn: { marginTop: 12, alignSelf: "flex-end", backgroundColor: FIORI.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  modalPrimaryBtnText: { color: "#fff", fontWeight: "900" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  monthCell: { width: "31.5%", backgroundColor: FIORI.cardSubtle, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 8, borderWidth: 1, borderColor: FIORI.border },
  monthCellActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  monthCellText: { color: FIORI.ink, fontWeight: "700" },
  monthCellTextActive: { color: "#fff" },
  yearItem: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, marginBottom: 6, backgroundColor: FIORI.cardSubtle, borderWidth: 1, borderColor: FIORI.border },
  yearItemActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  yearItemText: { fontSize: 16, color: FIORI.ink, fontWeight: "700" },
  yearItemTextActive: { color: "#fff" },
  resultCard: { backgroundColor: FIORI.cardSubtle, borderWidth: 1, borderColor: FIORI.border, borderRadius: 14, padding: 12, marginBottom: 10 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  resultTitle: { color: FIORI.ink, fontSize: 15, fontWeight: "900", flex: 1 },
  resultBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  resultBadgeOk: { backgroundColor: "#EAF8F0", borderColor: "#BDE8D0" },
  resultBadgeError: { backgroundColor: "#FFF0F0", borderColor: "#F5C2C2" },
  resultBadgeText: { fontSize: 11, fontWeight: "900" },
  previewOrderText: { color: FIORI.textMuted, fontSize: 13, marginTop: 4, fontWeight: "700" },
  formSection: { backgroundColor: FIORI.cardSubtle, borderWidth: 1, borderColor: FIORI.border, borderRadius: 14, padding: 12, marginBottom: 12 },
  formSectionTitle: { color: FIORI.ink, fontSize: 14, fontWeight: "900", marginBottom: 10 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { color: FIORI.textMuted, fontSize: 12, fontWeight: "900", marginBottom: 6 },
  formInput: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: FIORI.border, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 11 : 8, fontSize: 14, color: FIORI.ink },
  inputError: { borderColor: FIORI.danger },
  textAreaInput: { minHeight: 92, textAlignVertical: "top", paddingTop: 10 },
  signatureStatusBox: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: FIORI.border, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  signatureStatusTitle: { color: FIORI.ink, fontSize: 14, fontWeight: "900" },
  signatureWrap: { height: 300, marginTop: 14, borderRadius: 14, overflow: "hidden", backgroundColor: "#fff", borderWidth: 1, borderColor: FIORI.border },
  cardActionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 10 },
  miniPrimaryBtn: { marginTop: 10, alignSelf: "flex-start", backgroundColor: FIORI.accent, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center" },
  miniPrimaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  miniDangerBtn: { marginTop: 10, alignSelf: "flex-start", backgroundColor: "#FFF0F0", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#F5C2C2" },
  miniDangerBtnText: { color: FIORI.danger, fontWeight: "900", fontSize: 12 },
  emptyMiniBox: { alignItems: "center", paddingVertical: 28 },
  emptyMiniTitle: { marginTop: 8, color: FIORI.textMuted, fontSize: 14, fontWeight: "800", textAlign: "center" },
  blockBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 20 },
  blockCard: { width: "92%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 16, padding: 18, alignItems: "center" },
  blockTitle: { marginTop: 12, color: FIORI.ink, fontWeight: "900" },
  blockSub: { marginTop: 6, color: FIORI.textMuted, textAlign: "center", fontSize: 12 },
  cleanOrderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  cleanOrderCardSelected: {
    backgroundColor: "#F8FBFF",
    borderColor: FIORI.accent,
  },
  cleanOrderCardValidated: {
    borderColor: "#BDE8D0",
  },
  cleanOrderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cleanOrderLeft: {
    width: 22,
    alignItems: "center",
    paddingTop: 5,
  },
  cleanStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: FIORI.warn,
  },
  cleanOrderContent: {
    flex: 1,
  },
  cleanEquipmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 3,
  },
  cleanEquipmentText: {
    flex: 1,
    color: FIORI.ink,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  cleanMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  cleanMetaText: {
    flex: 1,
    color: FIORI.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  cleanDateText: {
    flex: 1,
    color: FIORI.ink,
    fontSize: 11.5,
    fontWeight: "800",
  },
  cleanClientText: {
    flex: 1,
    color: "#7A869A",
    fontSize: 10.5,
    fontWeight: "700",
  },
  monthGroupHeader: {
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  monthGroupTitle: {
    color: FIORI.ink,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  clientGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EEF6FF",
    borderWidth: 1,
    borderColor: "#D8E9FA",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 7,
    marginTop: 2,
  },
  clientIconBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D8E9FA",
  },
  clientGroupTitle: {
    color: FIORI.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  clientGroupSub: {
    color: FIORI.textMuted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
});