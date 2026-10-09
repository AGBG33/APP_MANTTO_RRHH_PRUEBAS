// src/services/operacionesSupervisor.js
import api from "./api";
import { cacheGet, cacheSet } from "../offline/db";
import { cacheKeys } from "../offline/keys";
import { isOnline } from "../offline/net";

/** Encabezado/Detalle de orden (SAP) */
export async function fetchOrdenDetalleSupervisor(orderid) {
  const oidRaw = String(orderid || "").trim();
  const oid = encodeURIComponent(oidRaw);
  const key = cacheKeys.ordenDetalle(oidRaw);

  // 1) cache first
  const cached = await cacheGet(key);
  const cachedObj = cached?.value ?? null;

  // 2) offline -> cache
  const online = await isOnline();
  if (!online) return cachedObj;

  // 3) online -> fetch + cache
  try {
    const res = await api.get(`/api/ordenes/sap/${oid}`);
    const obj = res?.data ?? null;
    await cacheSet(key, obj);
    return obj;
  } catch (e) {
    return cachedObj;
  }
}

/** Operaciones (SAP) */
export async function fetchOperacionesSupervisor(orderid) {
  const oidRaw = String(orderid || "").trim();
  const oid = encodeURIComponent(oidRaw);
  const key = cacheKeys.operaciones(oidRaw);

  const cached = await cacheGet(key);
  const cachedArr = Array.isArray(cached?.value) ? cached.value : [];

  const online = await isOnline();
  if (!online) return cachedArr;

  try {
    const res = await api.get(`/api/operaciones/sap/${oid}`);
    const arr = Array.isArray(res?.data) ? res.data : [];
    await cacheSet(key, arr);
    return arr;
  } catch (e) {
    return cachedArr;
  }
}

/** Componentes por operación (SAP) */
export async function fetchComponentesPorOperacion(orderid, activity) {
  const oidRaw = String(orderid || "").trim();
  const a = String(activity || "").padStart(4, "0");
  const key = cacheKeys.componentes(oidRaw, a);

  const cached = await cacheGet(key);
  const cachedArr = Array.isArray(cached?.value) ? cached.value : [];

  const online = await isOnline();
  if (!online) return cachedArr;

  try {
    const res = await api.get(
      `/api/operaciones/ordenes/${encodeURIComponent(oidRaw)}/operaciones/${encodeURIComponent(a)}/componentes`
    );
    const arr = Array.isArray(res?.data) ? res.data : [];
    await cacheSet(key, arr);
    return arr;
  } catch (e) {
    return cachedArr;
  }
}
