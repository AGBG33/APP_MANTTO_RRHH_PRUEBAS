// src/services/rhAttendance.js
// Servicio de marcaciones RRHH a SAP QAS a través de backend BTP.
// El correo es OPCIONAL en la app; se envía Email: "" cuando no existe.
// La API/ABAP debe permitir Email vacío: si lo exige, ajustar el contrato en SAP.
// La búsqueda manual de nómina NO autoriza al usuario para producción.
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import api from "./api";

const ATTENDANCE_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/AttendanceRecordSet";
export const RH_REGISTER_TYPES = Object.freeze({
  entrada: "P10", comida_inicio: "P15", comida_fin: "P25", salida: "P20",
});
const pad2 = v => String(v).padStart(2, "0");

function fechaHoraLocal(instante) {
  return {
    fecha: `${instante.getFullYear()}-${pad2(instante.getMonth() + 1)}-${pad2(instante.getDate())}`,
    hora: `${pad2(instante.getHours())}:${pad2(instante.getMinutes())}:${pad2(instante.getSeconds())}`,
  };
}

// Notación decimal SAP confirmada en pruebas de Postman (signo al final).
function coordenadaSap(numero) {
  const n = Number(numero);
  if (!Number.isFinite(n)) throw Error("El GPS devolvió coordenadas inválidas.");
  const abs = Math.abs(n).toFixed(8);
  return n < 0 ? `${abs}-` : abs;
}

async function obtenerCoordenadasParaMarcacion() {
  if (!(await Location.hasServicesEnabledAsync())) {
    throw Error("Activa la ubicación (GPS) para registrar asistencia.");
  }
  let permisos = await Location.getForegroundPermissionsAsync();
  if (permisos.status !== "granted") permisos = await Location.requestForegroundPermissionsAsync();
  if (permisos.status !== "granted") {
    throw Error("Permite la ubicación mientras utilizas la app.");
  }
  let timer;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(
        "El GPS tardó demasiado. Inténtalo en un lugar con mejor señal.")), 25000); }),
    ]);
    const latitud = position?.coords?.latitude;
    const longitud = position?.coords?.longitude;
    const accuracyMeters = position?.coords?.accuracy;
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud) ||
      Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
      throw Error("No se obtuvo una ubicación GPS válida.");
    }
    if (Number.isFinite(accuracyMeters) && accuracyMeters > 250) {
      throw Error(`La precisión GPS es de ${Math.round(accuracyMeters)} m. Intenta mejorar la señal.`);
    }
    return { latitud, longitud, accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null };
  } finally { if (timer) clearTimeout(timer); }
}

// Identifica el dispositivo para QAS; NO es un mecanismo de autenticación.
export async function obtenerIdentificadorDispositivoRH() {
  let id = "";
  if (Platform.OS === "android") {
    const androidId = String(Application.getAndroidId() ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{1,16}$/.test(androidId)) {
      throw Error("No se pudo obtener un Android ID válido.");
    }
    id = `A${androidId}`;
  } else if (Platform.OS === "ios") {
    const idfv = await Application.getIosIdForVendorAsync();
    if (!idfv) throw Error("No se pudo obtener el identificador del iPhone.");
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `ios-idfv:${idfv}`);
    id = `I${hash.slice(0, 18)}`;
  } else {
    throw Error("El registro está disponible en Android e iOS.");
  }
  if (!id || id.length > 20) throw Error("Identificador de dispositivo inválido para SAP.");
  return id;
}

export async function prepararMarcacionRH({ personalNumber, fullName, email, type }) {
  const numero = String(personalNumber ?? "").trim();
  const nombre = String(fullName ?? "").trim();
  const correo = String(email ?? "").trim();
  if (!/^\d{1,8}$/.test(numero)) throw Error("Número de nómina inválido.");
  if (!nombre) throw Error("Primero consulta un empleado con nombre en SAP.");
  // CORREO OPCIONAL: solo validar formato si alguien proporcionó uno.
  if (correo && (correo.length > 241 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
    throw Error("El correo opcional no tiene un formato válido.");
  }
  const registerType = RH_REGISTER_TYPES[type];
  if (!registerType) throw Error("Tipo de marcación no soportado.");

  const gps = await obtenerCoordenadasParaMarcacion();
  const instante = new Date();
  const { fecha, hora } = fechaHoraLocal(instante);
  const dispositivo = await obtenerIdentificadorDispositivoRH();
  if (__DEV__) console.log("[RH DEVICE QAS]", { platform: Platform.OS, caracteres: dispositivo.length });
  const payload = {
    PersonalNumber: numero,
    RegisterType: registerType,
    FullName: nombre,
    Email: correo, // Vacío cuando SAP no proporciona correo y no se añadió opcionalmente.
    EnterDate: fecha,
    EnterHour: hora,
    Chanel: "SAP", // Se conserva el valor probado en Postman.
    Device: dispositivo,
    Latitude: coordenadaSap(gps.latitud),
    Longitude: coordenadaSap(gps.longitud),
    GeoStatus: "", IsLate: "", Id_log: "", StatusReq: "", Message: "",
  };
  return { payload, gpsAccuracyMeters: gps.accuracyMeters };
}

// No hacer reintentos automáticos: un timeout puede producir duplicados si SAP grabó antes.
export async function enviarMarcacionRH(payload) {
  const response = await api.post(ATTENDANCE_SET, payload, {
    headers: { "Content-Type": "application/json", Accept: "application/json" }, timeout: 45000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw Error(`SAP devolvió HTTP ${response.status} al registrar asistencia.`);
  }
  const body = response?.data?.d ?? response?.data ?? {};
  const estado = String(body?.StatusReq ?? "").trim();
  const mensaje = String(body?.Message ?? "").trim();
  if (response?.data?.error || /^(E|ERROR|FAIL|FAILED|REJECTED|RECHAZADO)$/i.test(estado)) {
    throw Error(mensaje || "SAP rechazó la marcación.");
  }
  return { httpStatus: response.status, statusReq: estado, message: mensaje };
}