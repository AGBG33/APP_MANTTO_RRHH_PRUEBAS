// SERVICIO DE REGISTRO DE ASISTENCIA - SAP QAS
// POST real de asistencia hacia SAP Gateway OData a traves del backend BTP QAS.
// SOLO PRUEBAS: el numero y correo son editables y SAP no verifica PersonalNumber en EmployeeSet.
// El backend DEBE validar que el usuario autenticado pueda registrar al empleado
// antes de habilitar el flujo en produccion.

import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import api from "./api";

const ATTENDANCE_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/AttendanceRecordSet";

export const RH_REGISTER_TYPES = Object.freeze({
  entrada: "P10",
  comida_inicio: "P15",
  comida_fin: "P25",
  salida: "P20",
});

const pad2 = (v) => String(v).padStart(2, "0");

// Date.getFullYear/getHours son LOCALES. No usar toISOString para EnterDate.
function fechaHoraLocal(instante) {
  return {
    fecha: `${instante.getFullYear()}-${pad2(instante.getMonth() + 1)}-${pad2(instante.getDate())}`,
    hora: `${pad2(instante.getHours())}:${pad2(instante.getMinutes())}:${pad2(instante.getSeconds())}`,
  };
}

// SAP QAS recibio correctamente 99.21548730- en la prueba de Postman.
// Esta representacion con signo final es intencional hasta confirmar el contrato ABAP.
function coordenadaSap(numero) {
  const n = Number(numero);
  if (!Number.isFinite(n)) throw new Error("El GPS devolvio coordenadas invalidas.");
  const abs = Math.abs(n).toFixed(8);
  return n < 0 ? `${abs}-` : abs;
}

async function obtenerCoordenadasParaMarcacion() {
  const habilitado = await Location.hasServicesEnabledAsync();
  if (!habilitado) {
    throw new Error("Activa la ubicacion (GPS) del telefono para registrar asistencia.");
  }

  let permisos = await Location.getForegroundPermissionsAsync();
  if (permisos.status !== "granted") {
    permisos = await Location.requestForegroundPermissionsAsync();
  }
  if (permisos.status !== "granted") {
    throw new Error("Debes permitir la ubicacion mientras usas la app para registrar asistencia.");
  }

  // No se reutiliza la ultima posicion del modulo de mantenimiento.
  // Un timeout NO envia la marcacion, aunque el proveedor GPS responda despues.
  let timer;
  try {
    const posicion = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("El GPS tardo demasiado. Acercate a una ventana y vuelve a intentar.")), 25000);
      }),
    ]);
    const latitud = posicion?.coords?.latitude;
    const longitud = posicion?.coords?.longitude;
    const accuracyMeters = posicion?.coords?.accuracy;
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud) ||
        Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
      throw new Error("No se obtuvo una ubicacion GPS valida.");
    }
    // No inventar ubicacion y advertir cuando la medicion sea muy imprecisa.
    if (Number.isFinite(accuracyMeters) && accuracyMeters > 250) {
      throw new Error(`La precision GPS es de ${Math.round(accuracyMeters)} m. Intentalo en un lugar con mejor senal.`);
    }
    return { latitud, longitud, accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Identificador de dispositivo para pruebas en SAP QAS.
 * - Android: ANDROID_ID (hexadecimal) con prefijo A.
 * - iOS: IDFV derivado con SHA-256, acortado para el campo Device (max. 20).
 *
 * Esto IDENTIFICA un dispositivo de prueba, pero NO autentica el telefono.
 * En produccion, el backend debera verificar usuario y dispositivo autorizado.
 */
export async function obtenerIdentificadorDispositivoRH() {
  let idParaSAP = "";

  if (Platform.OS === "android") {
    const androidId = String(Application.getAndroidId() ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{1,16}$/.test(androidId)) {
      throw new Error("No fue posible obtener un Android ID valido para el registro.");
    }
    idParaSAP = `A${androidId}`;
  } else if (Platform.OS === "ios") {
    const idfv = await Application.getIosIdForVendorAsync();
    if (!idfv) {
      throw new Error("El iPhone no devolvio su identificador. Desbloquea el equipo e intenta de nuevo.");
    }
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `ios-idfv:${idfv}`
    );
    idParaSAP = `I${hash.slice(0, 18)}`;
  } else {
    throw new Error("La identificacion del dispositivo solo esta disponible en Android e iOS.");
  }

  if (idParaSAP.length > 20 || !idParaSAP) {
    throw new Error("El identificador del dispositivo supera la longitud admitida en SAP.");
  }
  return idParaSAP;
}

/**
 * CAPTURA (sin enviar): completa un JSON para AttendanceRecordSet.
 * Llamar una sola vez despues de pulsar Confirmar.
 */
export async function prepararMarcacionRH({
  personalNumber,
  fullName,
  email,
  type,
}) {
  const numero = String(personalNumber ?? "").trim();
  const nombre = String(fullName ?? "").trim();
  const correo = String(email ?? "").trim();
  if (!/^\d{1,8}$/.test(numero)) throw new Error("Numero de nomina invalido para registrar asistencia.");
  if (!nombre) throw new Error("Primero consulta un empleado con nombre en SAP.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 241) {
    throw new Error("Revisa el correo de prueba en la pantalla de RR. HH.");
  }
  const registerType = RH_REGISTER_TYPES[type];
  if (!registerType) throw new Error("Tipo de marcacion no soportado en AttendanceRecordSet.");

  const gps = await obtenerCoordenadasParaMarcacion();
  const instante = new Date();
  const { fecha, hora } = fechaHoraLocal(instante);
  const idDispositivo = await obtenerIdentificadorDispositivoRH();
  // Diagnostico QAS: verificar el valor en Expo y compararlo con SE16N.
  if (__DEV__) {
    console.log("[RH DEVICE QAS]", {
      plataforma: Platform.OS,
      device: idDispositivo,
      caracteres: idDispositivo.length,
    });
  }

  const payload = {
    PersonalNumber: numero,             // Lo ingresado, p. ej. 1111111 (NO 01111111).
    RegisterType: registerType,
    FullName: nombre,
    Email: correo,
    EnterDate: fecha,
    EnterHour: hora,
    Chanel: "SAP",                      // Valor comprobado en Postman, cambiar solo si ABAP admite APP.
    Device: idDispositivo,
    Latitude: coordenadaSap(gps.latitud),
    Longitude: coordenadaSap(gps.longitud),
    GeoStatus: "",
    IsLate: "",
    Id_log: "",
    StatusReq: "",
    Message: "",
  };
  return { payload, gpsAccuracyMeters: gps.accuracyMeters };
}

/** POST sin reintentos propios. api.js maneja el token de sesion.
 * Un timeout/error de red puede ocurrir DESPUES de que SAP grabo el evento:
 * la pantalla tratara el resultado como INCIERTO y bloqueara reenvios automaticos.
 */
export async function enviarMarcacionRH(payload) {
  const response = await api.post(ATTENDANCE_SET, payload, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    timeout: 45000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`SAP devolvio HTTP ${response.status} al registrar asistencia.`);
  }
  const contenido = response?.data?.d ?? response?.data ?? {};
  const estado = String(contenido?.StatusReq ?? "").trim();
  const mensaje = String(contenido?.Message ?? "").trim();
  if (response?.data?.error || /^(E|ERROR|FAIL|FAILED|REJECTED|RECHAZADO)$/i.test(estado)) {
    throw new Error(mensaje || "SAP reporto un error en la marcacion.");
  }

  // Un 2xx confirma la respuesta de la API; no demuestra por si solo que la
  // fila quedo persistida en ZHCM_REGISTROS. Verificar primero en SE16N.
  return { httpStatus: response.status, statusReq: estado, message: mensaje };
}