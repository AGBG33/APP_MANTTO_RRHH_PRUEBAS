// src/services/rhHistory.js
// Consulta de historial RRHH desde SAP QAS, usando el cliente autenticado de la app.
// NO usa AsyncStorage. NO envía registros; solo GET a AttendanceHistorySet.
import api from "./api";

const HISTORY_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/AttendanceHistorySet";
const MAX_DAYS_FALLBACK = 31;
const MAX_PAGES = 15;
const pad2 = value => String(value).padStart(2, "0");

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
  const d = new Date(year, month - 1, day, 12);
  return fechaLocalRH(d) === value;
}

function numDiasInclusivos(desde, hasta) {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

function diasEntre(desde, hasta) {
  const dias = numDiasInclusivos(desde, hasta);
  const [year, month, day] = desde.split("-").map(Number);
  const out = [];
  for (let i = 0; i < dias; i++) {
    const date = new Date(Date.UTC(year, month - 1, day + i));
    out.push(`${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`);
  }
  return out;
}

function fechaDesdeSAP(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (value?.value) return fechaDesdeSAP(value.value);
    return "";
  }
  const txt = String(value).trim();
  if (fechaSAPValida(txt)) return txt;
  if (/^\d{8}$/.test(txt)) return fechaDesdeSAP(`${txt.slice(0,4)}-${txt.slice(4,6)}-${txt.slice(6,8)}`);
  if (/^\d{4}-\d{2}-\d{2}T/.test(txt)) return fechaDesdeSAP(txt.slice(0,10));
  const ticks = txt.match(/^\/Date\((-?\d+)/);
  if (ticks) {
    const date = new Date(Number(ticks[1]));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return "";
}

function horaDesdeSAP(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (Number.isFinite(value.ms)) {
      const ms = value.ms % 86400000;
      return `${pad2(Math.floor(ms / 3600000))}:${pad2(Math.floor(ms / 60000) % 60)}:${pad2(Math.floor(ms / 1000) % 60)}`;
    }
    return "";
  }
  const txt = String(value).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(txt)) return txt.length === 5 ? `${txt}:00` : txt;
  if (/^\d{6}$/.test(txt)) return `${txt.slice(0,2)}:${txt.slice(2,4)}:${txt.slice(4,6)}`;
  const duration = txt.match(/^PT(\d+)H(\d+)M(?:(\d+)S)?$/i);
  if (duration) return `${pad2(duration[1])}:${pad2(duration[2])}:${pad2(duration[3] || 0)}`;
  return txt;
}

const str = value => String(value ?? "").trim();
const field = (raw, ...names) => {
  for (const name of names) {
    if (raw?.[name] !== undefined && raw?.[name] !== null && raw[name] !== "") return str(raw[name]);
  }
  return "";
};

const TIPOS = {
  P10: { tipo: "entrada", etiqueta: "Entrada", icono: "log-in-outline" },
  P15: { tipo: "comida_inicio", etiqueta: "Inicio de comida", icono: "restaurant-outline" },
  P25: { tipo: "comida_fin", etiqueta: "Regreso de comida", icono: "play-outline" },
  P20: { tipo: "salida", etiqueta: "Salida", icono: "log-out-outline" },
};

export function mapearHistorialRH(item, indice = 0) {
  const registerType = field(item, "RegisterType", "RegistrationType", "Type").toUpperCase();
  const tipo = TIPOS[registerType] || { tipo: "otro", etiqueta: registerType ? `Registro ${registerType}` : "Movimiento", icono: "time-outline" };
  const date = fechaDesdeSAP(field(item, "EnterDate", "RegisterDate", "ReferenceDate", "Date"));
  const time = horaDesdeSAP(item?.EnterHour ?? item?.RegisterHour ?? item?.Hour ?? item?.Time);
  return {
    id: field(item, "Id_log", "IdLog", "ID", "Id") || `${date}-${time}-${registerType}-${indice}`,
    personalNumber: field(item, "PersonalNumber", "Pernr", "PERNR"),
    fullName: field(item, "FullName", "EmployeeName"),
    date, time, registerType,
    type: tipo.tipo, title: tipo.etiqueta, icon: tipo.icono,
    email: field(item, "Email"),
    channel: field(item, "Chanel", "Channel"),
    device: field(item, "Device"),
    status: field(item, "Status", "DescriptionStatus"),
    schedule: field(item, "Schedule", "Hourly"),
    zone: field(item, "Zone"),
    centerOffice: field(item, "CenterOffice"),
    isLate: field(item, "IsLate"),
    geoStatus: field(item, "GeoStatus"),
    statusReq: field(item, "StatusReq"),
    message: field(item, "Message"),
  };
}

// SAP OData v2 puede devolver d.results y d.__next (paginación).
function extraerRespuesta(data) {
  const body = data?.d ?? data;
  if (Array.isArray(body?.results)) return { resultados: body.results, siguiente: body.__next || null };
  if (Array.isArray(data?.value)) return { resultados: data.value, siguiente: data["@odata.nextLink"] || null };
  if (Array.isArray(body)) return { resultados: body, siguiente: null };
  throw Error("SAP devolvió un formato inesperado. Se esperaba d.results.");
}

function paramsSiguiente(url) {
  // Reutiliza solo los parámetros de página; nunca solicita otra URL/host.
  const query = String(url ?? "").split("?")[1];
  if (!query) return null;
  const allowed = new Set(["$skiptoken", "$skip", "$top"]);
  const out = {};
  for (const part of query.split("&")) {
    const pos = part.indexOf("=");
    if (pos < 0) continue;
    const key = decodeURIComponent(part.slice(0, pos).replace(/\+/g, " "));
    if (!allowed.has(key)) continue;
    out[key] = decodeURIComponent(part.slice(pos + 1).replace(/\+/g, " "));
  }
  return Object.keys(out).length ? out : null;
}

async function consultaFiltrada(filter, signal) {
  let params = { $filter: filter, $format: "json" };
  const todos = [];
  const paginas = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const respuesta = await api.get(HISTORY_SET, { params, timeout: 45000, signal });
    const { resultados, siguiente } = extraerRespuesta(respuesta.data);
    todos.push(...resultados);
    if (!siguiente) return todos;
    const sig = paramsSiguiente(siguiente);
    if (!sig) throw Error("SAP devolvió una continuación de página que no se pudo interpretar.");
    const firma = JSON.stringify(sig);
    if (paginas.has(firma)) throw Error("SAP repitió una página del historial.");
    paginas.add(firma);
    params = { $filter: filter, $format: "json", ...sig };
  }
  throw Error("El historial tiene demasiadas páginas; reduce el rango de fechas.");
}

async function consultaPorDia(personalNumber, desde, hasta, signal) {
  const fechas = diasEntre(desde, hasta);
  const todos = [];
  // Solicitudes controladas (3 simultáneas) para no saturar SAP QAS.
  for (let i = 0; i < fechas.length; i += 3) {
    const grupo = fechas.slice(i, i + 3);
    const lotes = await Promise.all(grupo.map(fecha => consultaFiltrada(
      `PersonalNumber eq '${personalNumber}' and EnterDate eq '${fecha}'`, signal
    )));
    for (const resultados of lotes) todos.push(...resultados);
  }
  return todos;
}

/**
 * Consulta real de AttendanceHistorySet. Para un día usa EQ, como el ejemplo probado.
 * Para un rango intenta GE/LE estándar OData y, si SAP lo rechaza o devuelve vacío,
 * utiliza un EQ por día (solo si el rango no supera 31 días).
 *
 * NO se incluye caché local. Si el servidor responde 200 sin filas, retorna [].
 */
export async function consultarHistorialRH({ personalNumber, desde, hasta, signal }) {
  const numero = str(personalNumber);
  if (!/^\d{1,8}$/.test(numero)) throw Error("Número de nómina no válido.");
  if (!fechaSAPValida(desde) || !fechaSAPValida(hasta) || desde > hasta) {
    throw Error("Selecciona un rango de fechas válido: Desde debe ser anterior o igual a Hasta.");
  }
  const dias = numDiasInclusivos(desde, hasta);
  if (dias > 90) throw Error("El rango máximo por consulta es de 90 días. Selecciona un período menor.");

  let filas = [];
  let metodo = "dia";
  if (dias === 1) {
    filas = await consultaFiltrada(`PersonalNumber eq '${numero}' and EnterDate eq '${desde}'`, signal);
  } else {
    const filter = `PersonalNumber eq '${numero}' and EnterDate ge '${desde}' and EnterDate le '${hasta}'`;
    try {
      filas = await consultaFiltrada(filter, signal);
      metodo = "rango";
    } catch (e) {
      if (signal?.aborted) throw e;
      // Solo probar alternativa cuando SAP rechaza operadores de rango.
      const status = e?.response?.status;
      if (![400, 405, 422, 501].includes(status) || dias > MAX_DAYS_FALLBACK) throw e;
      filas = await consultaPorDia(numero, desde, hasta, signal);
      metodo = "dias_individuales";
    }
    if (filas.length === 0 && dias <= MAX_DAYS_FALLBACK && metodo === "rango") {
      // Algunos servicios ABAP devuelven 200 [] cuando ignoran GE/LE.
      filas = await consultaPorDia(numero, desde, hasta, signal);
      metodo = "dias_individuales";
    }
  }

  // Protección frente a filtros ignorados por ABAP: no mezclar otros empleados ni fechas.
  const limpio = filas.map(mapearHistorialRH).filter(r => {
    if (r.personalNumber && r.personalNumber.replace(/^0+/, "") !== numero.replace(/^0+/, "")) return false;
    if (r.date && (r.date < desde || r.date > hasta)) return false;
    return true;
  });
  limpio.sort((a,b) => `${b.date}|${b.time}|${b.id}`.localeCompare(`${a.date}|${a.time}|${a.id}`));
  return { registros: limpio, metodo, consultados: filas.length, dias };
}