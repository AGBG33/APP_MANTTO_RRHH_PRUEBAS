// src/services/rhAttendance.js
// POST AttendanceRecordSet. Mantiene el canal App y envía TypeSession PR / HO / VN.
// Reglas de horario y modalidad se verifican antes en rhPolicies.
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Application from "expo-application";
import api from "./api";
import { codigoModalidadRH, TIPOS_RH, evaluarMarcacionRH } from "./rhPolicies";

const ENDPOINT = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/AttendanceRecordSet";
const RH_QAS_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";
export const RH_REGISTER_TYPES = TIPOS_RH;
const pad2 = x => String(x).padStart(2, "0");
const coord = n => {
  const number = Number(n);
  if (!Number.isFinite(number)) throw Error("Coordenada GPS no válida.");
  const abs = Math.abs(number).toFixed(8);
  return number < 0 ? `${abs}-` : abs;
};
async function gpsParaAsistencia() {
  if (!(await Location.hasServicesEnabledAsync())) throw Error("Activa el GPS para registrar asistencia.");
  let p = await Location.getForegroundPermissionsAsync();
  if (p.status !== "granted") p = await Location.requestForegroundPermissionsAsync();
  if (p.status !== "granted") throw Error("Autoriza ubicación mientras utilizas la app.");
  let timer;
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error("El GPS no respondió en 25 segundos.")), 25000); }),
    ]);
    const { latitude, longitude, accuracy } = pos?.coords || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw Error("GPS sin coordenadas válidas.");
    }
    if (Number.isFinite(accuracy) && accuracy > 250) throw Error(`Precisión de ubicación insuficiente: ${Math.round(accuracy)} m.`);
    return { latitude, longitude, accuracyMeters: accuracy };
  } finally { if (timer) clearTimeout(timer); }
}
export async function obtenerIdentificadorDispositivoRH() {
  if (Platform.OS === "android") {
    const a = String(Application.getAndroidId() ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{1,16}$/.test(a)) throw Error("No se pudo leer Android ID.");
    return `A${a}`;
  }
  if (Platform.OS === "ios") {
    const value = (await Application.getIosIdForVendorAsync()) || "";
    const hex = value.replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) throw Error("No se obtuvo IDFV del iPhone.");
    // Identificador estable, sin agregar nuevas dependencias a Expo.
    return `I${hex.slice(0, 19)}`;
  }
  throw Error("Marcaciones disponibles en Android/iOS.");
}

export async function prepararMarcacionRH({ empleado, personalNumber, email, type, modalidad = "Presencial", registros = [] }) {
  const numero = String(personalNumber ?? "").trim();
  const correo = String(email ?? "").trim();
  if (!/^\d{1,8}$/.test(numero)) throw Error("Número de nómina inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 241) {
    throw Error("Durante las pruebas debes ingresar un correo válido del empleado.");
  }
  if (!String(empleado?.fullName || "").trim()) throw Error("No se encontró el nombre del empleado en SAP.");
  if (empleado?.email && correo.toLowerCase() !== empleado.email.trim().toLowerCase()) {
    throw Error("El correo ingresado no coincide con EmployeeSet.");
  }
  const instante = new Date();
  const evaluacion = evaluarMarcacionRH({ empleado, tipo: type, registros, ahora: instante, modalidad });
  if (!evaluacion.permitido) throw Error(evaluacion.mensaje);
  const gps = await gpsParaAsistencia();
  const device = await obtenerIdentificadorDispositivoRH();
  const pad = pad2;
  const EnterDate = `${instante.getFullYear()}-${pad(instante.getMonth() + 1)}-${pad(instante.getDate())}`;
  const EnterHour = `${pad(instante.getHours())}:${pad(instante.getMinutes())}:${pad(instante.getSeconds())}`;
  const payload = {
    PersonalNumber: numero,
    RegisterType: TIPOS_RH[type],
    FullName: empleado.fullName,
    Email: correo,
    EnterDate, EnterHour,
    Chanel: "App",                 // Antes decía SAP. Mantener el nombre OData 'Chanel'.
    Device: device,
    TypeSession: codigoModalidadRH(modalidad),
    Latitude: coord(gps.latitude),
    Longitude: coord(gps.longitude),
    GeoStatus: "", IsLate: "", Id_log: "", StatusReq: "", Message: "",
  };
  return { payload, gpsAccuracyMeters: gps.accuracyMeters, evaluacion };
}

export async function enviarMarcacionRH(payload) {
  // Sin reintentos automáticos para no generar duplicados tras un timeout.
  const response = await api.post(ENDPOINT, payload, {
    baseURL: RH_QAS_BASE, // Evita un POST accidental a PROD por extra.API_BASE_URL_PROD.
    headers: { "Content-Type": "application/json", Accept: "application/json" }, timeout: 45000,
  });
  if (response.status < 200 || response.status >= 300) throw Error(`SAP devolvió HTTP ${response.status}.`);
  const body = response?.data?.d ?? response?.data ?? {};
  const estado = String(body?.StatusReq ?? "").trim().toUpperCase();
  const mensaje = String(body?.Message ?? "").trim();
  const idLog = String(body?.Id_log ?? body?.IdLog ?? "").trim();
  // Solo confirmar éxito con estado de negocio OK, no únicamente con HTTP 2xx.
  if (response?.data?.error || estado !== "OK") {
    const e = Error(mensaje || `SAP no confirmó el registro (StatusReq: ${estado || "vacío"}).`);
    e.sapRejected = !!estado && estado !== "OK";
    e.sapStatus = estado;
    e.sapMessage = mensaje;
    e.httpStatus = response.status;
    e.sapIdLog = idLog;
    throw e;
  }
  return { httpStatus: response.status, statusReq: estado, message: mensaje,
    idLog };
}