// src/rrhh/offline/rhPendingSecure.js
// PASO 6 - Guardado protegido de marcaciones pendientes de RRHH.
//
// Esta fase NO consulta SAP, NO envia peticiones y NO cambia la UI.
// El payload original (incluido GPS) se almacena mediante expo-secure-store,
// cifrado por el almacen seguro nativo del dispositivo (Keystore/Keychain).
// SQLite RRHH guarda la referencia enc:v1:ss:<clave> y metadatos de la marca.
// NO comparte almacenamiento, outbox, sapQueue ni syncEngine con mantenimiento.
//
// IMPORTANTES:
// - El usuario y la nomina deben venir de AuthContext + EmployeeSet validado.
// - No llamar desde la pantalla hasta integrar las reglas offline (paso siguiente).
// - Un registro local NO equivale a un registro aceptado por SAP.
// - No se garantiza recuperacion si se desinstala la aplicacion.

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { claveUsuarioRH } from "./rhOfflineDb";
import {
  guardarMarcacionPendienteRH,
  listarMarcacionesPendientesRH,
  leerMarcacionProtegidaRH,
} from "./rhPendingDb";

const PREFIJO_REFERENCIA = "enc:v1:ss:";
const PREFIJO_CLAVE = "rh.pending.";
const TIPOS = new Set(["P10", "P15", "P25", "P20"]);
const SESIONES = new Set(["PR", "HO", "VN"]);
const guardadosEnCurso = new Set();

const s = valor => String(valor ?? "").trim();
const correo = valor => s(valor).toLowerCase();
const nomina = valor => s(valor).padStart(8, "0");

function fechaValida(valor) {
  const v = s(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() + 1 === m &&
    fecha.getUTCDate() === d;
}

function coordValida(valor, maximo) {
  const texto = s(valor);
  // El servicio rhAttendance utiliza signo negativo al FINAL (ej. 99.12345678-).
  if (!/^\d{1,3}(?:\.\d{1,8})?-?$/.test(texto)) return false;
  const negativo = texto.endsWith("-");
  const numero = Number(negativo ? `-${texto.slice(0, -1)}` : texto);
  return Number.isFinite(numero) && Math.abs(numero) <= maximo;
}

function validarSolicitud({ personalNumber, email, fechaJornada, payload }) {
  // Valida identidad, fechas y campos creados por prepararMarcacionRH.
  const clave = claveUsuarioRH(personalNumber, email);
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw Error("RRHH offline: solicitud de marcacion invalida.");
  }
  if (nomina(payload.PersonalNumber) !== nomina(personalNumber) ||
      correo(payload.Email) !== correo(email)) {
    throw Error("RRHH offline: la solicitud no corresponde al empleado autenticado.");
  }
  const tipo = s(payload.RegisterType).toUpperCase();
  if (!TIPOS.has(tipo)) throw Error("RRHH offline: tipo de marcacion invalido.");
  if (!fechaValida(fechaJornada) || !fechaValida(payload.EnterDate) ||
      !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s(payload.EnterHour))) {
    throw Error("RRHH offline: fecha u hora original invalida.");
  }
  // Permitir cambio de fecha para turnos nocturnos, no jornadas arbitrarias.
  const diferencia = Math.round(
    (Date.parse(`${payload.EnterDate}T12:00:00Z`) -
      Date.parse(`${fechaJornada}T12:00:00Z`)) / 86400000
  );
  if (diferencia < 0 || diferencia > 1) {
    throw Error("RRHH offline: fecha de marcacion no coincide con la jornada.");
  }
  if (payload.Chanel !== "App" || !SESIONES.has(s(payload.TypeSession)) ||
      !s(payload.FullName) || !s(payload.Device)) {
    throw Error("RRHH offline: datos obligatorios del comprobante incompletos.");
  }
  if (!coordValida(payload.Latitude, 90) || !coordValida(payload.Longitude, 180)) {
    throw Error("RRHH offline: coordenadas GPS invalidas.");
  }
  if (!fechaValida(payload.DateFrom) || !fechaValida(payload.DateTo)) {
    throw Error("RRHH offline: fechas de modalidad invalidas.");
  }
  return { clave, tipo };
}

function claveDesdeReferencia(referencia) {
  if (typeof referencia !== "string" ||
      !/^enc:v1:ss:rh\.pending\.[a-f0-9]{32}$/.test(referencia)) {
    throw Error("RRHH offline: referencia de almacen seguro invalida.");
  }
  return referencia.slice(PREFIJO_REFERENCIA.length);
}

async function asegurarAlmacenSeguro() {
  if (!(await SecureStore.isAvailableAsync())) {
    throw Error("RRHH offline: el almacenamiento seguro no esta disponible en este equipo.");
  }
}

/**
 * Guarda una solicitud REAL ya preparada y validada por las reglas de RRHH.
 * No genera hora nueva, no captura GPS ni hace POST: recibe el payload original.
 *
 * El integrador debe obtener personalNumber/email del usuario logueado y
 * fechaJornada de obtenerTurnoDelDia. No aceptar estos campos desde formulario.
 */
export async function guardarSolicitudRHProtegida({
  personalNumber, email, fechaJornada, payload,
}) {
  const { clave, tipo } = validarSolicitud({ personalNumber, email, fechaJornada, payload });
  const id = `${clave}|${fechaJornada}|${tipo}`;
  if (guardadosEnCurso.has(id)) {
    throw Error("RRHH offline: ya se esta guardando esta marcacion.");
  }
  guardadosEnCurso.add(id);
  try {
    // No sobrescribir el payload original de un registro ya existente.
    const registros = await listarMarcacionesPendientesRH({ personalNumber, email });
    const anterior = registros.find(r => r.id === id);
    if (anterior) return { ...anterior, yaExistia: true };

    await asegurarAlmacenSeguro();
    const json = JSON.stringify(payload);
    // Los payloads de AttendanceRecordSet son pequenos. Fallar antes de
    // guardar si algun cambio en el servicio envia contenido excesivo.
    if (json.length > 1800) {
      throw Error("RRHH offline: comprobante demasiado grande para el almacen seguro.");
    }
    // Cada intento recibe clave propia. Un INSERT OR IGNORE no sobreescribe
    // jamas los datos cifrados de un registro anterior.
    const claveSecreta = `${PREFIJO_CLAVE}${Crypto.randomUUID().replace(/-/g, "")}`;
    const referencia = `${PREFIJO_REFERENCIA}${claveSecreta}`;

    await SecureStore.setItemAsync(claveSecreta, json);
    // Comprobar lectura ANTES de considerar guardada la marcacion.
    const verificacion = await SecureStore.getItemAsync(claveSecreta);
    if (verificacion !== json) {
      await SecureStore.deleteItemAsync(claveSecreta).catch(() => {});
      throw Error("RRHH offline: no se pudo verificar el guardado seguro.");
    }

    // Despues de este punto, ante fallo SQLite NO eliminamos el secreto:
    // el INSERT podria haberse completado aunque la respuesta se interrumpa.
    let resultado;
    try {
      resultado = await guardarMarcacionPendienteRH({
        personalNumber, email, fechaJornada,
        fechaMarcacion: payload.EnterDate,
        horaMarcacion: payload.EnterHour,
        registerType: tipo,
        payloadProtegido: referencia,
      });
    } catch (_) {
      throw Error("RRHH offline: no se pudo CONFIRMAR el guardado. Revisa pendientes antes de intentar otra vez.");
    }

    if (resultado.yaExistia) {
      // Otra operacion ya habia creado la marca. Se conserva la anterior.
      await SecureStore.deleteItemAsync(claveSecreta).catch(() => {});
    }
    return resultado;
  } finally {
    guardadosEnCurso.delete(id);
  }
}

/**
 * Lectura reservada para la futura conciliacion con SAP.
 * Los metadatos se cotejan para detectar referencias cruzadas/corruptas.
 * Nunca registrar el resultado completo en console.log.
 */
export async function leerSolicitudRHProtegida({ personalNumber, email, id }) {
  const fila = await leerMarcacionProtegidaRH({ personalNumber, email, id });
  if (!fila) return null;
  await asegurarAlmacenSeguro();
  const clave = claveDesdeReferencia(fila.payloadProtegido);
  const json = await SecureStore.getItemAsync(clave);
  if (!json) {
    throw Error("RRHH offline: comprobante protegido no disponible. Requiere revision de RH.");
  }
  let payload;
  try { payload = JSON.parse(json); }
  catch (_) { throw Error("RRHH offline: comprobante protegido dañado."); }
  const valido = validarSolicitud({
    personalNumber, email, fechaJornada: fila.fechaJornada, payload,
  });
  if (valido.tipo !== fila.tipo || payload.EnterDate !== fila.fechaMarcacion ||
      payload.EnterHour !== fila.horaMarcacion) {
    throw Error("RRHH offline: los datos del comprobante no coinciden con el registro local.");
  }
  const { payloadProtegido, ...metadatos } = fila;
  return { ...metadatos, payload };
}

// Para pantallas se usa listarMarcacionesPendientesRH (sin GPS).
// NO existe envio automatico en este modulo.