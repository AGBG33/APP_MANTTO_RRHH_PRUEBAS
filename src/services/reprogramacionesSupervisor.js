// src/services/reprogramacionesSupervisor.js
import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheGet, cacheSet } from "../offline/db";
import { isOnline } from "../offline/net";

/* ======================
   Keys de cache (locales)
   ====================== */
const reprogKeys = {
  // lista mensual (o por día) de la vista
  orders: ({ userKey, year, month, dayYmd }) =>
    `reprog:orders:${userKey}:${year}-${String(month).padStart(2, "0")}:${
      dayYmd || "MONTH"
    }`,

  // mapa de estatus por orden (pendiente/sent/error) para pintar en UI
  statusMap: ({ userKey }) => `reprog:statusMap:${userKey}`,

  // cola offline (outbox) simple basada en cache
  outbox: ({ userKey }) => `reprog:outbox:${userKey}`,

  // cache de técnicos por supervisor
  technicians: ({ supervisorEmail }) =>
    `reprog:technicians:${String(supervisorEmail || "").trim().toLowerCase()}`,
};

/* ======================
   Helpers
   ====================== */
const pad2 = (n) => String(n).padStart(2, "0");

// Local: para fechas construidas por la app
const toYMD = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// UTC: para timestamps que vienen de SAP OData /Date(...)/
const toYMD_UTC_FROM_MS = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
};

function safeStr(v) {
  return v == null ? "" : String(v);
}

// /Date(1768435200000)/ -> YYYY-MM-DD usando UTC
function odataDateToYMD(value) {
  const s = safeStr(value);
  const match = s.match(/\/Date\((\-?\d+)\)\//);
  if (!match) return "";
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return "";
  return toYMD_UTC_FROM_MS(ms);
}

function ymdToSAP(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${y}${m}${d}`;
}

// Comparación segura sin broncas de zona horaria / DST
function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Regla: NO mostrar si Userstatus tiene SOLO códigos 0001..0011
 */
function shouldHideByUserstatus(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return false;

  const codes = s.match(/\b\d{4}\b/g) || [];
  if (codes.length === 0) return false;

  const allInRange = codes.every((c) => {
    const n = Number(c);
    return n >= 1 && n <= 11;
  });

  return allInRange;
}

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { startYmd: toYMD(start), endYmd: toYMD(end) };
}

function buildODataDayFilter({ ymd, email }) {
  return `StartDate ge datetime'${ymd}T00:00:00' and FinishDate le datetime'${ymd}T23:59:59' and Userstatus eq '${email}'`;
}

function buildODataRangeFilter({ startYmd, endYmd, email }) {
  return `StartDate ge datetime'${startYmd}T00:00:00' and FinishDate le datetime'${endYmd}T23:59:59' and Userstatus eq '${email}'`;
}

async function getUserKeyFromStorage() {
  try {
    const userStr = await AsyncStorage.getItem("user");
    const u = userStr ? JSON.parse(userStr) : null;
    return (
      u?.correo ||
      u?.email ||
      u?.upn ||
      u?.username ||
      u?.userPrincipalName ||
      u?.oid ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/** Lee el token actual (para online). Para offline NO lo guardamos, se toma al sync */
async function getToken() {
  return (await AsyncStorage.getItem("token")) || "";
}

function extractResults(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

/* ======================
   Mensajes SAP
   ====================== */

function dedupeSapMessages(messages = []) {
  const seen = new Set();
  const unique = [];

  for (const m of messages) {
    const type = safeStr(m?.type).trim().toUpperCase();
    const message = safeStr(m?.message).trim();

    if (!message) continue;

    const key = `${type}:${message.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push({
      ...m,
      type,
      message,
    });
  }

  return unique;
}

function extractSapMessages(data) {
  const ret =
    data?.d?.ReturnSet?.results ||
    data?.d?.Return?.results ||
    data?.ReturnSet?.results ||
    data?.Return?.results ||
    data?.response?.d?.ReturnSet?.results ||
    data?.raw?.d?.ReturnSet?.results ||
    [];

  if (!Array.isArray(ret)) return [];

  const messages = ret.map((r) => ({
    type: safeStr(r?.Type || r?.type).trim().toUpperCase(),
    message: safeStr(r?.Message || r?.message).trim(),
    id: safeStr(r?.Id || r?.id),
    number: safeStr(r?.Number || r?.number),
    code: safeStr(r?.Code || r?.code),
    messageV1: safeStr(r?.MessageV1 || r?.messageV1),
    messageV2: safeStr(r?.MessageV2 || r?.messageV2),
    messageV3: safeStr(r?.MessageV3 || r?.messageV3),
    messageV4: safeStr(r?.MessageV4 || r?.messageV4),
  }));

  return dedupeSapMessages(messages);
}

function getSapIssueMessages(messages = []) {
  return dedupeSapMessages(messages).filter((m) => {
    const type = safeStr(m?.type).toUpperCase();

    /*
      E = Error
      A = Abort / proceso abortado
      X = Error fuerte / excepción técnica

      W = Warning/Aviso de SAP, no debe bloquear.
      I = Información, no debe bloquear.
      S = Éxito, no debe bloquear.
    */
    return ["E", "A", "X"].includes(type);
  });
}

function buildSapIssueMessage(messages = []) {
  const issues = getSapIssueMessages(messages);

  if (!issues.length) return "";

  return issues.map((m) => m.message).filter(Boolean).join(" | ");
}

/* ======================
   Estado local por orden
   ====================== */
async function readStatusMap(userKey) {
  const key = reprogKeys.statusMap({ userKey });
  const cached = await cacheGet(key);
  const obj =
    cached?.value && typeof cached.value === "object" ? cached.value : {};
  return obj;
}

async function writeStatusMap(userKey, mapObj) {
  const key = reprogKeys.statusMap({ userKey });
  await cacheSet(key, mapObj);
}

function setOrderStatus(mapObj, orderId, patch) {
  const cleanOrderId = safeStr(orderId);
  const prev = mapObj[cleanOrderId] || {};
  mapObj[cleanOrderId] = { ...prev, ...patch };
  return mapObj;
}

/* ======================
   Outbox simple (en cache)
   ====================== */
async function outboxRead(userKey) {
  const key = reprogKeys.outbox({ userKey });
  const cached = await cacheGet(key);
  const arr = Array.isArray(cached?.value) ? cached.value : [];
  return arr;
}

async function outboxWrite(userKey, arr) {
  const key = reprogKeys.outbox({ userKey });
  await cacheSet(key, Array.isArray(arr) ? arr : []);
}

function makeId() {
  return `ob_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Enqueue item (cache-outbox) */
async function outboxEnqueue(userKey, item) {
  const arr = await outboxRead(userKey);
  arr.push(item);
  await outboxWrite(userKey, arr);
  return item.id;
}

/* ======================
   API: Fetch órdenes (con cache)
   ====================== */
export async function fetchReprogramacionesOrders({
  year,
  month,
  dayYmd,
  supervisorEmail,
}) {
  const userKey = await getUserKeyFromStorage();
  const cacheKey = reprogKeys.orders({ userKey, year, month, dayYmd });

  // 1) cache primero
  const cached = await cacheGet(cacheKey);
  const cachedArr = Array.isArray(cached?.value) ? cached.value : null;

  // 2) offline -> cache
  const online = await isOnline();
  if (!online) {
    return { ok: true, from: "cache", orders: cachedArr || [] };
  }

  // 3) online -> fetch
  try {
    const { startYmd, endYmd } = getMonthRange(year, month);

    const filter = dayYmd
      ? buildODataDayFilter({ ymd: dayYmd, email: supervisorEmail })
      : buildODataRangeFilter({ startYmd, endYmd, email: supervisorEmail });

    const token = await getToken();

    const res = await api.get(
      "/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { $filter: filter, $format: "json" },
      }
    );

    const results = Array.isArray(res.data?.d?.results)
      ? res.data.d.results
      : [];

    const mapped = results
      .map((x) => {
        const id = safeStr(
          x.Orderid ||
            x.OrderId ||
            x.OrderID ||
            x.NotifNo ||
            x.Notification ||
            x.id
        );

        const startFromWorkOrder = odataDateToYMD(x.StartDate);
        const finishFromWorkOrder = odataDateToYMD(x.FinishDate);

        const notifDate = safeStr(x.NotifDate).includes("/Date(")
          ? odataDateToYMD(x.NotifDate)
          : safeStr(x.NotifDate || "");

        const finalStart = startFromWorkOrder || notifDate;
        const finalFinish = finishFromWorkOrder || notifDate || finalStart;

        const userstatusCodes = safeStr(x.Userstatus || x.UserStatus || "");

        return {
          id,
          equipo: safeStr(x.Equipment || x.Equipo || ""),
          shortText: safeStr(x.ShortText || x.Description || x.Descripcion || ""),
          startDate: finalStart,
          finishDate: finalFinish,
          userstatusCodes,
        };
      })
      .filter((o) => o.id)
      .filter((o) => !shouldHideByUserstatus(o.userstatusCodes));

    // 4) aplica estatus local (pendiente/error/sent) a cada orden
    const statusMap = await readStatusMap(userKey);
    const withStatus = mapped.map((o) => ({
      ...o,
      _sync: statusMap[o.id] || null,
    }));

    await cacheSet(cacheKey, withStatus);

    return {
      ok: true,
      from: "network",
      orders: withStatus,
    };
  } catch (e) {
    return {
      ok: false,
      from: "cache",
      orders: cachedArr || [],
      error: e?.message || String(e),
    };
  }
}

/* ======================
   API: Reprogramar (1 o varias)
   ====================== */
export async function rescheduleWorkorders({ supervisorEmail, items }) {
  const userKey = await getUserKeyFromStorage();
  const online = await isOnline();

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, reason: "no_items", error: "No hay órdenes para reprogramar." };
  }

  for (const it of items) {
    if (!it?.orderId || !it?.startYmd || !it?.endYmd) {
      return {
        ok: false,
        reason: "missing_fields",
        error: "Faltan datos para reprogramar.",
      };
    }

    if (ymdToDate(it.endYmd) < ymdToDate(it.startYmd)) {
      return {
        ok: false,
        reason: "invalid_range",
        error: "La fecha fin no puede ser menor a la fecha inicio.",
      };
    }
  }

  const payload = {
    WorkOrderHeader: { Supervisor: supervisorEmail },
    WorkOrderItemsSet: items.map((it) => ({
      OrderId: safeStr(it.orderId),
      OrderItem: "",
      FechaIni: ymdToSAP(it.startYmd),
      FechaFin: ymdToSAP(it.endYmd),
    })),
    ReturnSet: [],
  };

  const endpoint = "/api/odata/ZCS_RESCHEDULE_WORKORDER_SRV/WorkOrderHeaderSet";

  if (online) {
    try {
      const token = await getToken();

      const res = await api.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const messages = extractSapMessages(res?.data);
      const sapIssueMessage = buildSapIssueMessage(messages);

      if (sapIssueMessage) {
        let mapObj = await readStatusMap(userKey);

        for (const it of items) {
          mapObj = setOrderStatus(mapObj, it.orderId, {
            state: "error",
            startYmd: it.startYmd,
            endYmd: it.endYmd,
            updatedAt: Date.now(),
            lastError: sapIssueMessage,
          });
        }

        await writeStatusMap(userKey, mapObj);

        return {
          ok: false,
          mode: "online",
          error: sapIssueMessage,
          sapMessages: messages,
          response: res?.data || null,
        };
      }

      let mapObj = await readStatusMap(userKey);

      for (const it of items) {
        mapObj = setOrderStatus(mapObj, it.orderId, {
          state: "sent",
          startYmd: it.startYmd,
          endYmd: it.endYmd,
          updatedAt: Date.now(),
          lastError: "",
        });
      }

      await writeStatusMap(userKey, mapObj);

      return {
        ok: true,
        mode: "online",
        response: res?.data || null,
        sapMessages: messages,
      };
    } catch (e) {
      const errMsg =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.message ||
        e?.message ||
        String(e);

      let mapObj = await readStatusMap(userKey);

      for (const it of items) {
        mapObj = setOrderStatus(mapObj, it.orderId, {
          state: "error",
          startYmd: it.startYmd,
          endYmd: it.endYmd,
          updatedAt: Date.now(),
          lastError: errMsg,
        });
      }

      await writeStatusMap(userKey, mapObj);

      return {
        ok: false,
        mode: "online",
        error: errMsg,
      };
    }
  }

  const outboxItem = {
    id: makeId(),
    type: "RESCHEDULE_WORKORDER",
    method: "POST",
    url: endpoint,
    body: payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "queued",
  };

  const outboxId = await outboxEnqueue(userKey, outboxItem);

  let mapObj = await readStatusMap(userKey);

  for (const it of items) {
    mapObj = setOrderStatus(mapObj, it.orderId, {
      state: "pending",
      startYmd: it.startYmd,
      endYmd: it.endYmd,
      updatedAt: Date.now(),
      outboxId,
      lastError: "",
    });
  }

  await writeStatusMap(userKey, mapObj);

  return {
    ok: true,
    mode: "offline",
    queued: true,
    outboxId,
    payload,
  };
}

/* ======================
   API: Traer técnicos del supervisor
   ====================== */
export async function fetchSupervisorEmployees({ supervisorEmail }) {
  const email = safeStr(supervisorEmail).trim();
  const cacheKey = reprogKeys.technicians({ supervisorEmail: email });

  if (!email) {
    return {
      ok: false,
      employees: [],
      reason: "missing_supervisor_email",
    };
  }

  const cached = await cacheGet(cacheKey);
  const cachedArr = Array.isArray(cached?.value) ? cached.value : [];

  const online = await isOnline();
  if (!online) {
    return {
      ok: true,
      from: "cache",
      employees: cachedArr,
    };
  }

  try {
    const token = await getToken();
    const filter = `Email eq '${email}'`;

    const res = await api.get(
      "/api/odata/ZSD_CATALOGOS_SRV/EmployeSupervisorSet",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        params: {
          $filter: filter,
          $format: "json",
        },
      }
    );

    const rows = extractResults(res?.data);

    const employees = rows
      .map((row) => ({
        Email: safeStr(row?.Email).trim(),
        ID: safeStr(row?.ID).trim(),
        Nombre: safeStr(row?.Nombre).trim(),
      }))
      .filter((x) => x.Email || x.ID || x.Nombre);

    await cacheSet(cacheKey, employees);

    return {
      ok: true,
      from: "network",
      employees,
      raw: res?.data || null,
    };
  } catch (e) {
    return {
      ok: false,
      from: "cache",
      employees: cachedArr,
      error: e?.message || String(e),
    };
  }
}

/* ======================
   API: Reasignar técnico a una orden
   ====================== */
export async function reassignWorkorderTechnician({
  supervisorEmail,
  orderId,
  mecanicoId,
}) {
  const userKey = await getUserKeyFromStorage();
  const online = await isOnline();

  const supervisor = safeStr(supervisorEmail).trim();
  const order = safeStr(orderId).trim();
  const mecanico = safeStr(mecanicoId).trim();

  if (!supervisor || !order || !mecanico) {
    return {
      ok: false,
      reason: "missing_fields",
      message: "Faltan datos para reasignar técnico",
      error: "Faltan datos para reasignar técnico",
    };
  }

  const payload = {
    WorkOrderHeader: {
      Supervisor: supervisor,
    },
    WorkOrderItemsSet: [
      {
        OrderId: order,
        OrderItem: "",
        FechaIni: "",
        FechaFin: "",
        Mecanico: mecanico,
      },
    ],
    ReturnSet: [],
  };

  const endpoint = "/api/odata/ZCS_RESCHEDULE_WORKORDER_SRV/WorkOrderHeaderSet";

  if (online) {
    try {
      const token = await getToken();

      const res = await api.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const messages = extractSapMessages(res?.data);
      const sapIssueMessage = buildSapIssueMessage(messages);

      if (sapIssueMessage) {
        let mapObj = await readStatusMap(userKey);

        mapObj = setOrderStatus(mapObj, order, {
          state: "error",
          updatedAt: Date.now(),
          lastError: sapIssueMessage,
          mecanicoId: mecanico,
        });

        await writeStatusMap(userKey, mapObj);

        return {
          ok: false,
          mode: "online",
          error: sapIssueMessage,
          sapMessages: messages,
          response: res?.data || null,
        };
      }

      let mapObj = await readStatusMap(userKey);

      mapObj = setOrderStatus(mapObj, order, {
        state: "sent",
        updatedAt: Date.now(),
        lastError: "",
        mecanicoId: mecanico,
      });

      await writeStatusMap(userKey, mapObj);

      return {
        ok: true,
        mode: "online",
        response: res?.data || null,
        sapMessages: messages,
      };
    } catch (e) {
      const errMsg =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.message ||
        e?.message ||
        "assign_failed";

      let mapObj = await readStatusMap(userKey);

      mapObj = setOrderStatus(mapObj, order, {
        state: "error",
        updatedAt: Date.now(),
        lastError: errMsg,
        mecanicoId: mecanico,
      });

      await writeStatusMap(userKey, mapObj);

      return {
        ok: false,
        mode: "online",
        error: errMsg,
      };
    }
  }

  const outboxItem = {
    id: makeId(),
    type: "REASSIGN_TECHNICIAN",
    method: "POST",
    url: endpoint,
    body: payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "queued",
  };

  const outboxId = await outboxEnqueue(userKey, outboxItem);

  let mapObj = await readStatusMap(userKey);

  mapObj = setOrderStatus(mapObj, order, {
    state: "pending",
    updatedAt: Date.now(),
    outboxId,
    lastError: "",
    mecanicoId: mecanico,
  });

  await writeStatusMap(userKey, mapObj);

  return {
    ok: true,
    mode: "offline",
    queued: true,
    outboxId,
    payload,
  };
}

/* ======================
   Sync manual de la outbox "cache"
   ====================== */
export async function syncReprogramacionesOutboxCache() {
  const userKey = await getUserKeyFromStorage();
  const online = await isOnline();

  if (!online) {
    return {
      ok: false,
      reason: "offline",
    };
  }

  const token = await getToken();

  if (!token) {
    return {
      ok: false,
      reason: "no_token",
    };
  }

  const queue = await outboxRead(userKey);

  if (queue.length === 0) {
    return {
      ok: true,
      processed: 0,
      remaining: 0,
    };
  }

  const remaining = [];
  let processed = 0;
  let failed = 0;

  let statusMap = await readStatusMap(userKey);

  for (const item of queue) {
    if (item?.status !== "queued") {
      continue;
    }

    const itemsSet = item?.body?.WorkOrderItemsSet || [];

    try {
      processed++;

      const res = await api.request({
        url: item.url,
        method: item.method,
        data: item.body,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const messages = extractSapMessages(res?.data);
      const sapIssueMessage = buildSapIssueMessage(messages);

      if (sapIssueMessage) {
        failed++;

        item.attempts = (item.attempts || 0) + 1;
        item.status = "error";
        item.lastError = sapIssueMessage;
        item.updatedAt = Date.now();

        for (const it of itemsSet) {
          const orderId = safeStr(it?.OrderId);
          if (!orderId) continue;

          statusMap = setOrderStatus(statusMap, orderId, {
            state: "error",
            updatedAt: Date.now(),
            lastError: sapIssueMessage,
          });
        }

        /*
          Importante:
          No lo dejamos eternamente como queued porque SAP ya respondió.
          El supervisor debe corregir el dato y volver a intentar.
        */
        continue;
      }

      for (const it of itemsSet) {
        const orderId = safeStr(it?.OrderId);
        if (!orderId) continue;

        statusMap = setOrderStatus(statusMap, orderId, {
          state: "sent",
          updatedAt: Date.now(),
          lastError: "",
        });
      }
    } catch (e) {
      failed++;

      item.attempts = (item.attempts || 0) + 1;
      item.updatedAt = Date.now();

      const errMsg =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.message ||
        e?.message ||
        "sync_failed";

      for (const it of itemsSet) {
        const orderId = safeStr(it?.OrderId);
        if (!orderId) continue;

        statusMap = setOrderStatus(statusMap, orderId, {
          state: "error",
          updatedAt: Date.now(),
          lastError: errMsg,
        });
      }

      /*
        Aquí sí se conserva en cola porque pudo ser red, token, timeout,
        caída temporal del backend o SAP.
      */
      remaining.push(item);
    }
  }

  await writeStatusMap(userKey, statusMap);
  await outboxWrite(userKey, remaining);

  return {
    ok: true,
    processed,
    failed,
    remaining: remaining.length,
  };
}