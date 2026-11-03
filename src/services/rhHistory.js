// src/services/rhHistory.js
// GET de AttendanceHistorySet en SAP QAS. No modifica registros ni utiliza AsyncStorage.
// OData recibe DateFrom/DateTo como AAAAMMDD y devuelve jornadas por WorkDate.
// La propiedad "registros" se conserva para no afectar los reintentos de asistencia.js.
import api from "./api";

const HISTORY_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/AttendanceHistorySet";
const RH_QAS_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";
const MAX_PAGES = 80;
const pad2 = value => String(value).padStart(2, "0");
const str = value => String(value ?? "").trim();

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
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999) return false;
  const d = new Date(year, month - 1, day, 12);
  return !Number.isNaN(d.getTime()) && fechaLocalRH(d) === value;
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
  const text = str(value);
  if (/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)) return text.length === 5 ? `${text}:00` : text;
  if (/^\d{6}$/.test(text)) return horaDesdeSAP(`${text.slice(0, 2)}:${text.slice(2, 4)}:${text.slice(4, 6)}`);
  const duration = /^PT(\d+)H(\d+)M(?:(\d+)S)?$/i.exec(text);
  if (duration) return horaDesdeSAP(`${pad2(duration[1])}:${pad2(duration[2])}:${pad2(duration[3] || 0)}`);
  return "";
}

const numeroCanonico = numero => str(numero).replace(/^0+/, "") || "0";
const esHoraRegistrada = hora => !!hora && hora !== "00:00:00";

// Una fila por empleado y jornada. WorkDate es la fecha real de agrupación:
// DateFrom y DateTo dentro de la respuesta pueden corresponder a un viaje.
export function mapearHistorialRH(item, indice = 0) {
  const date = fechaDesdeSAP(item?.WorkDate) || fechaDesdeSAP(item?.EnterDate);
  const personalNumber = str(item?.PersonalNumber);
  const p10Time = horaDesdeSAP(item?.P10Time);
  const p15Time = horaDesdeSAP(item?.P15Time);
  const p25Time = horaDesdeSAP(item?.P25Time);
  const p20Time = horaDesdeSAP(item?.P20Time);
  return {
    id: `${personalNumber}-${date}-${indice}`,
    personalNumber,
    date,
    dayStatus: str(item?.DayStatus),
    p10Time,
    p15Time,
    p25Time,
    p20Time,
  };
}

// Conserva la interfaz anterior usada por asistencia.js para verificar si
// SAP ya recibió un P10/P15/P25/P20 antes de reintentar un POST.
function eventosDeJornada(jornada) {
  const eventos = [
    ["P10", "entrada", "Entrada", "log-in-outline", jornada.p10Time],
    ["P15", "comida_inicio", "Inicio de comida", "restaurant-outline", jornada.p15Time],
    ["P25", "comida_fin", "Regreso de comida", "play-outline", jornada.p25Time],
    ["P20", "salida", "Salida", "log-out-outline", jornada.p20Time],
  ];
  return eventos.filter(([, , , , hora]) => esHoraRegistrada(hora))
    .map(([registerType, type, title, icon, time]) => ({
      id: "", // AttendanceHistorySet consolidado no incluye Id_log por movimiento.
      personalNumber: jornada.personalNumber,
      date: jornada.date,
      time,
      registerType,
      type,
      title,
      icon,
      statusReq: "", // No inventar un estado de respuesta SAP.
      message: "",
    }));
}

function extraerRespuesta(data) {
  const body = data?.d ?? data;
  if (Array.isArray(body?.results)) return { resultados: body.results, siguiente: body.__next || null };
  if (Array.isArray(data?.value)) return { resultados: data.value, siguiente: data["@odata.nextLink"] || null };
  if (Array.isArray(body)) return { resultados: body, siguiente: null };
  throw Error("SAP devolvió un formato inesperado en AttendanceHistorySet.");
}

function paramsSiguiente(url) {
  // SAP puede responder con una URL interna. Solo se extrae la paginación:
  // jamás se realizan solicitudes al host interno devuelto por __next.
  const query = str(url).split("?")[1];
  if (!query) return null;
  const params = {};
  for (const part of query.split("&")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = decodeURIComponent(part.slice(0, index).replace(/\+/g, " "));
    if (!["$skiptoken", "$skip", "$top"].includes(key)) continue;
    params[key] = decodeURIComponent(part.slice(index + 1).replace(/\+/g, " "));
  }
  return Object.keys(params).length ? params : null;
}

async function consultaFiltrada(filter, signal) {
  let params = { $filter: filter, $format: "json" };
  const todas = [];
  const vistas = new Set();
  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const response = await api.get(HISTORY_SET, {
      baseURL: RH_QAS_BASE,
      params,
      timeout: 45000,
      signal,
    });
    const { resultados, siguiente } = extraerRespuesta(response.data);
    todas.push(...resultados);
    if (!siguiente) return todas;
    const siguientesParams = paramsSiguiente(siguiente);
    if (!siguientesParams) throw Error("SAP devolvió una página de historial que no pudimos interpretar.");
    const firma = JSON.stringify(siguientesParams);
    if (vistas.has(firma)) throw Error("SAP repitió una página del historial.");
    vistas.add(firma);
    params = { $filter: filter, $format: "json", ...siguientesParams };
  }
  throw Error("El historial excedió el límite de páginas. Consulta un período menor.");
}

function diasInclusivos(desde, hasta) {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

/**
 * Consulta por día, mes o año con filtros reconocidos por GET_FILTERS en ABAP:
 * DateFrom eq 'AAAAMMDD' and DateTo eq 'AAAAMMDD' and PersonalNumber eq 'NOMINA'.
 * La consulta por mes/año solo amplía las fechas; no hace un GET por cada día.
 *
 * Devuelve:
 *  jornadas: un elemento por fecha, con DayStatus y las cuatro horas.
 *  registros: eventos individuales derivados de cada jornada (compatibilidad).
 */
export async function consultarHistorialRH({ personalNumber, desde, hasta, signal }) {
  const numero = str(personalNumber);
  if (!/^\d{1,8}$/.test(numero)) throw Error("Número de nómina no válido.");
  if (!fechaSAPValida(desde) || !fechaSAPValida(hasta) || desde > hasta) {
    throw Error("Selecciona fechas válidas; la fecha inicial no puede ser posterior a la final.");
  }
  const dias = diasInclusivos(desde, hasta);
  if (dias > 366) throw Error("Solo puedes consultar un período de hasta un año.");

  const dateFrom = desde.replace(/-/g, "");
  const dateTo = hasta.replace(/-/g, "");
  const filter = `DateFrom eq '${dateFrom}' and DateTo eq '${dateTo}' and PersonalNumber eq '${numero}'`;
  const filas = await consultaFiltrada(filter, signal);
  const jornadas = [];
  const fechasAgregadas = new Set();
  for (const item of filas) {
    if (numeroCanonico(item?.PersonalNumber) !== numeroCanonico(numero)) continue;
    const jornada = mapearHistorialRH(item);
    if (!jornada.date || jornada.date < desde || jornada.date > hasta) continue;
    if (fechasAgregadas.has(jornada.date)) continue;
    fechasAgregadas.add(jornada.date);
    jornadas.push(jornada);
  }
  jornadas.sort((a, b) => b.date.localeCompare(a.date));
  const registros = jornadas.flatMap(eventosDeJornada);
  return {
    jornadas,
    registros,
    metodo: dias === 1 ? "dia" : "rango",
    consultados: filas.length,
    dias,
  };
}