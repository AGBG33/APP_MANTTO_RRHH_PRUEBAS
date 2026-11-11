// src/services/rhHistory.js
// AttendanceHistorySet: conserva filas por WorkDate en SAP, pero consolida
// P10/P20/P15/P25 en la jornada de inicio cuando el horario cruza medianoche.
// No modifica registros ni hace POST. La opción scheduleDetail es compatible
// con todos los llamadores anteriores: en horario diurno no cambia nada.
import api from "./api";
import { obtenerTurnoDelDia } from "./rhPolicies";
import { consolidarJornadasNocturnasRH, esHorarioNocturnoRH,
  movimientosDesdeHistoryRH } from "./rhBusinessRules";

const HISTORY_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/AttendanceHistorySet";
const RH_QAS_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";
const MAX_PAGES = 80;
const pad2 = value => String(value).padStart(2, "0");
const str = value => String(value ?? "").trim();
const numeroCanonico = numero => str(numero).replace(/^0+/, "") || "0";
const esHoraRegistrada = hora => !!hora && hora !== "00:00:00";

export function fechaLocalRH(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
export function cambiarDiasRH(date, dias) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() + dias);
  return d;
}
export function fechaSAPValida(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1900 || y > 9999) return false;
  const fecha = new Date(y, m - 1, d, 12);
  return !Number.isNaN(fecha.getTime()) && fechaLocalRH(fecha) === value;
}
function fechaDesdeSAP(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") return value?.value ? fechaDesdeSAP(value.value) : "";
  const t = str(value);
  if (fechaSAPValida(t)) return t;
  if (/^\d{8}$/.test(t)) return fechaDesdeSAP(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`);
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return fechaDesdeSAP(t.slice(0, 10));
  const ticks = /^\/Date\((-?\d+)/.exec(t);
  if (ticks) {
    const d = new Date(Number(ticks[1]));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return "";
}
function horaDesdeSAP(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (!Number.isFinite(value?.ms)) return "";
    const ms = ((value.ms % 86400000) + 86400000) % 86400000;
    return `${pad2(Math.floor(ms / 3600000))}:${pad2(Math.floor(ms / 60000) % 60)}:${pad2(Math.floor(ms / 1000) % 60)}`;
  }
  const t = str(value);
  if (/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(t)) return t.length === 5 ? `${t}:00` : t;
  if (/^\d{6}$/.test(t)) return horaDesdeSAP(`${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`);
  const dur = /^PT(\d+)H(\d+)M(?:(\d+)S)?$/i.exec(t);
  if (dur) return horaDesdeSAP(`${pad2(dur[1])}:${pad2(dur[2])}:${pad2(dur[3] || 0)}`);
  return "";
}
export function mapearHistorialRH(item, indice = 0) {
  const date = fechaDesdeSAP(item?.WorkDate) || fechaDesdeSAP(item?.EnterDate);
  const personalNumber = str(item?.PersonalNumber);
  return {
    id: `${personalNumber}-${date}-${indice}`, personalNumber, date,
    dayStatus: str(item?.DayStatus),
    p10Time: horaDesdeSAP(item?.P10Time),
    p15Time: horaDesdeSAP(item?.P15Time),
    p25Time: horaDesdeSAP(item?.P25Time),
    p20Time: horaDesdeSAP(item?.P20Time),
  };
}

function eventosDeJornada(jornada, scheduleDetail = "") {
  const base = [
    ["P10", "entrada", "Entrada", "log-in-outline", jornada.p10Time],
    ["P15", "comida_inicio", "Inicio de comida", "restaurant-outline", jornada.p15Time],
    ["P25", "comida_fin", "Regreso de comida", "play-outline", jornada.p25Time],
    ["P20", "salida", "Salida", "log-out-outline", jornada.p20Time],
  ];
  // Fecha REAL del movimiento, no WorkDate de la jornada.
  const [year, month, day] = String(jornada.date || "").split("-").map(Number);
  const mediodia = new Date(year, month - 1, day, 12);
  const turno = esHorarioNocturnoRH(scheduleDetail)
    ? obtenerTurnoDelDia(scheduleDetail, mediodia) : null;
  const reales = (turno?.valido && turno.fechaJornada === jornada.date)
    ? movimientosDesdeHistoryRH(jornada, turno) : [];
  return base.filter(([, , , , hora]) => esHoraRegistrada(hora))
    .map(([registerType, type, title, icon, time]) => {
      const real = reales.find(r => r.registerType === registerType);
      return {
        id: "", personalNumber: jornada.personalNumber,
        date: real?.date || jornada.date, time, registerType,
        type, title, icon, statusReq: "", message: "",
      };
    });
}
function extraerRespuesta(data) {
  const body = data?.d ?? data;
  if (Array.isArray(body?.results)) return { resultados: body.results, siguiente: body.__next || null };
  if (Array.isArray(data?.value)) return { resultados: data.value, siguiente: data["@odata.nextLink"] || null };
  if (Array.isArray(body)) return { resultados: body, siguiente: null };
  throw Error("SAP devolvió un formato inesperado en AttendanceHistorySet.");
}
function paramsSiguiente(url) {
  // Nunca llamar al host interno de __next: extraer solo parámetros de página.
  const query = str(url).split("?")[1];
  if (!query) return null;
  const result = {};
  for (const part of query.split("&")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = decodeURIComponent(part.slice(0, idx).replace(/\+/g, " "));
    if (!["$skiptoken", "$skip", "$top"].includes(key)) continue;
    result[key] = decodeURIComponent(part.slice(idx + 1).replace(/\+/g, " "));
  }
  return Object.keys(result).length ? result : null;
}
async function consultaFiltrada(filter, signal) {
  let params = { $filter: filter, $format: "json" };
  const todas = [];
  const vistas = new Set();
  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const response = await api.get(HISTORY_SET, {
      baseURL: RH_QAS_BASE, params, timeout: 45000, signal,
    });
    const { resultados, siguiente } = extraerRespuesta(response.data);
    todas.push(...resultados);
    if (!siguiente) return todas;
    const otros = paramsSiguiente(siguiente);
    if (!otros) throw Error("SAP devolvió una página de historial que no pudimos interpretar.");
    const firma = JSON.stringify(otros);
    if (vistas.has(firma)) throw Error("SAP repitió una página del historial.");
    vistas.add(firma);
    params = { $filter: filter, $format: "json", ...otros };
  }
  throw Error("El historial excedió el límite de páginas. Consulta un período menor.");
}
function diasInclusivos(desde, hasta) {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2,m2-1,d2)-Date.UTC(y1,m1-1,d1))/86400000)+1;
}
function siguienteDiaISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return fechaLocalRH(cambiarDiasRH(new Date(y, m - 1, d, 12), 1));
}
/**
 * Consulta por período. Cuando scheduleDetail es NOCTURNO extiende DateTo
 * un día y consolida P10/P20 bajo el día en que empezó la jornada.
 * Mantiene el shape habitual { jornadas, registros, metodo, consultados, dias }.
 * La consolidación NUNCA se aplica si no tenemos horario confirmado de SAP.
 */
export async function consultarHistorialRH({ personalNumber, desde, hasta, signal, scheduleDetail = "" }) {
  const numero = str(personalNumber);
  if (!/^\d{1,8}$/.test(numero)) throw Error("Número de nómina no válido.");
  if (!fechaSAPValida(desde) || !fechaSAPValida(hasta) || desde > hasta) {
    throw Error("Selecciona fechas válidas; la fecha inicial no puede ser posterior a la final.");
  }
  const dias = diasInclusivos(desde, hasta);
  if (dias > 366) throw Error("Solo puedes consultar un período de hasta un año.");
  const nocturno = esHorarioNocturnoRH(scheduleDetail);
  const hastaSAP = nocturno ? siguienteDiaISO(hasta) : hasta;
  const filter = `DateFrom eq '${desde.replace(/-/g, "")}' and DateTo eq '${hastaSAP.replace(/-/g, "")}' and PersonalNumber eq '${numero}'`;
  const filas = await consultaFiltrada(filter, signal);
  const originales = filas
    .filter(item => numeroCanonico(item?.PersonalNumber) === numeroCanonico(numero))
    .map(mapearHistorialRH).filter(fila => fila.date);
  const consolidadas = nocturno
    ? consolidarJornadasNocturnasRH(originales, scheduleDetail)
    : originales;
  const jornadas = [];
  const fechas = new Set();
  for (const j of consolidadas) {
    if (j.date < desde || j.date > hasta || fechas.has(j.date)) continue;
    fechas.add(j.date);
    jornadas.push(j);
  }
  jornadas.sort((a, b) => b.date.localeCompare(a.date));
  return {
    jornadas, registros: jornadas.flatMap(j => eventosDeJornada(j, scheduleDetail)),
    metodo: dias === 1 ? "dia" : "rango", consultados: filas.length, dias,
  };
}