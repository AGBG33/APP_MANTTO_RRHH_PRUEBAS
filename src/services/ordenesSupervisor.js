// src/services/ordenesSupervisor.js
import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheGet, cacheSet } from "../offline/db";
import { cacheKeys } from "../offline/keys";
import { isOnline } from "../offline/net";

/* ======================
   Helpers: SAP /Date(…)/ -> ms
   ====================== */
function sapDateToMs(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const s = String(value);
  const m = s.match(/\/Date\((\-?\d+)(?:[+-]\d{4})?\)\//);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }

  // Los milisegundos OData ya representan el instante; el offset es metadata.
  return Number(m[1]);
}

/* ======================
   Normaliza OData/Array a Array
   ====================== */
function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  const odata = payload?.d?.results;
  if (Array.isArray(odata)) return odata;
  const results = payload?.results;
  if (Array.isArray(results)) return results;
  return [];
}

/* ======================
   Lee userKey estable desde AsyncStorage("user")
   ====================== */
async function getUserKeyFromStorage() {
  try {
    // Tú guardas esto en AuthContext
    const userStr = await AsyncStorage.getItem("user");
    const u = userStr ? JSON.parse(userStr) : null;

    // Usa el campo más estable que tengas.
    // Si tu user trae email/correo -> perfecto.
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

/* ======================
   Mapea objeto SAP -> UI
   - si ya viene normalizado, también lo respeta
   ====================== */
function mapOrdenToUi(o) {
  // Caso A: ya viene normalizado (backend)
  if (o && (o.orderid || o.Orderid)) {
    const orderid = o.orderid ?? o.Orderid ?? "";
    const equipment = o.equipment ?? o.Equipment ?? "";
    const nombre_orden = o.nombre_orden ?? o.ShortText ?? o.shortText ?? "";

    const startMs =
      typeof o.startdate === "number"
        ? o.startdate
        : sapDateToMs(o.startdate ?? o.StartDate);

    const finishMs =
      typeof o.finishdate === "number"
        ? o.finishdate
        : sapDateToMs(o.finishdate ?? o.FinishDate);

    const userstatus = o.userstatus ?? o.Userstatus ?? "";
    //se declaran los campos que se agregaron al json
    const id_mecanico = o.id_mecanico ?? o.IdMecanico ?? "";
    const nombre_mecanico = o.nombre_mecanico ?? o.NombreMec ?? "";
    const nombre_cliente = o.nombre_cliente ?? o.NombreCliente ?? "";

    return {
      ...o,
      orderid: String(orderid),
      equipment: String(equipment),
      nombre_orden: String(nombre_orden || ""),
      startdate: startMs,
      finishdate: finishMs,
      userstatus: String(userstatus || ""),

      // Se agregaron estos campos al json
      id_mecanico: String(id_mecanico || ""),
      nombre_mecanico: String(nombre_mecanico || ""),
      nombre_cliente: String(nombre_cliente || ""),
    };
  }

  // Caso B: SAP crudo (OData)
  return {
    orderid: String(o?.Orderid ?? ""),
    equipment: String(o?.Equipment ?? ""),
    nombre_orden: String(o?.ShortText ?? ""),
    startdate: sapDateToMs(o?.StartDate),
    finishdate: sapDateToMs(o?.FinishDate),
    userstatus: String(o?.Userstatus ?? ""),
    // Se agregaron estos campos al json
    id_mecanico: String(o?.IdMecanico ?? ""),
    nombre_mecanico: String(o?.NombreMec ?? ""),
    nombre_cliente: String(o?.NombreCliente ?? ""),
    _raw: o,
  };
}

/* ======================
   Export
   ====================== */
export async function fetchOrdenesSupervisor(startDate, endDate, mode = "range") {
  // ✅ userKey real (no depende de "correo" inexistente)
  const userKey = await getUserKeyFromStorage();

  const key = cacheKeys.ordenesSupervisor({
    userKey,
    start: startDate,
    end: endDate,
    mode,
  });

  // 1) cache primero (rápido / offline)
  const cached = await cacheGet(key);
  const cachedArray = Array.isArray(cached?.value) ? cached.value : null;

  // 2) si no hay red -> cache
  const online = await isOnline();
  if (!online) {
    console.log("[ORDENES SUP OFFLINE] usando cache:", key, "len:", cachedArray?.length || 0);
    return cachedArray || [];
  }

  // 3) hay red: fetch + cache
  try {
    const url = "/api/ordenes/sap/list";

    // ⚠️ tu backend pide "user". Antes tú mandabas "correo".
    // Aquí mandamos userKey (email/correo/oid). Ajusta si tu API exige otra cosa.
    const params = { start: startDate, end: endDate, mode, user: userKey };

    console.log("[ORDENES SUP URL]", `${api.defaults?.baseURL || ""}${url}`, params);

    const res = await api.get(url, { params });

    // soporta array u OData
    const rawArr = extractArray(res?.data);

    // normaliza SIEMPRE
    const mapped = rawArr.map(mapOrdenToUi).filter((x) => x?.orderid);

    // cachea lo normalizado
    await cacheSet(key, mapped);

    console.log("[ORDENES SUP OK] len:", mapped.length, "ej:", mapped[0]?.orderid || "—");
    return mapped;
  } catch (e) {
    console.log("[ORDENES SUP ERROR] fallback cache:", e?.message || e);
    return cachedArray || [];
  }
}
