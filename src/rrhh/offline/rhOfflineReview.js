// src/rrhh/offline/rhOfflineReview.js
// Conciliacion y reenvio MANUAL de la solicitud ORIGINAL guardada.
// No toma una nueva hora, no vuelve a pedir GPS ni cambia el payload.
// No comparte tablas ni colas con mantenimiento.
import NetInfo from "@react-native-community/netinfo";
import { consultarHistorialRH } from "../../services/rhHistory";
import { obtenerEmpleadoRH } from "../../services/rhEmployees";
import { leerSolicitudRHProtegida } from "./rhPendingSecure";
import {
  listarMarcacionesPendientesRH,
  cambiarEstadoMarcacionRH,
  cambiarEstadoJustificacionRH,
} from "./rhPendingDb";

const CAMPOS = Object.freeze({ P10: "p10Time", P15: "p15Time", P25: "p25Time", P20: "p20Time" });
const ESTADOS_REVISABLES = new Set(["incierto", "revision", "rechazado"]);
const str = x => String(x ?? "").trim();
const num = x => str(x).padStart(8, "0");
const emailNormal = x => str(x).toLowerCase();
const hora = x => {
  const t = str(x);
  return /^\d{2}:\d{2}:\d{2}$/.test(t) && t !== "00:00:00" ? t : "";
};

async function validarSesion({ personalNumber, email, ensureValidToken }) {
  const red = await NetInfo.fetch();
  if (!red.isConnected || red.isInternetReachable === false) {
    throw Error("Necesitas internet para verificar esta marcacion en SAP.");
  }
  if (typeof ensureValidToken !== "function" || !(await ensureValidToken())) {
    throw Error("Tu sesion necesita validarse nuevamente antes de consultar SAP.");
  }
  const empleado = await obtenerEmpleadoRH(email);
  if (!empleado || empleado.numeroConfirmadoEnSAP !== true ||
      num(empleado.personalNumber) !== num(personalNumber) ||
      emailNormal(empleado.email) !== emailNormal(email)) {
    throw Error("El empleado autenticado no coincide con el registro guardado. No se reenviara.");
  }
  return empleado;
}

async function obtenerFila({ personalNumber, email, id }) {
  const filas = await listarMarcacionesPendientesRH({ personalNumber, email });
  const fila = filas.find(f => f.id === id);
  if (!fila) throw Error("No existe el comprobante local para esta cuenta.");
  return fila;
}

async function cotejarMovimiento({ personalNumber, email, fila, scheduleDetail }) {
  // Verificar que el registro inmutable todavia tiene payload original.
  const guardado = await leerSolicitudRHProtegida({ personalNumber, email, id: fila.id });
  const payload = guardado?.payload;
  if (!payload || num(payload.PersonalNumber) !== num(personalNumber) ||
      emailNormal(payload.Email) !== emailNormal(email) ||
      payload.RegisterType !== fila.tipo ||
      payload.EnterDate !== fila.fechaMarcacion || payload.EnterHour !== fila.horaMarcacion) {
    throw Error("El comprobante no coincide con la marcacion original. Requiere soporte de RH.");
  }
  const respuesta = await consultarHistorialRH({
    personalNumber, desde: fila.fechaJornada, hasta: fila.fechaJornada,
    scheduleDetail,
  });
  const jornada = respuesta.jornadas.find(j => j.date === fila.fechaJornada);
  const campo = CAMPOS[fila.tipo];
  if (!campo) throw Error("Tipo de marcacion no reconocido.");
  const horaSAP = hora(jornada?.[campo]);
  if (!horaSAP) return { resultado: "ausente", fila };
  if (horaSAP === fila.horaMarcacion) return { resultado: "encontrado", fila };
  return { resultado: "conflicto", fila, horaSAP };
}

/**
 * Consulta SAP antes de que el usuario decida si desea repetir la MISMA peticion.
 * Ausencia en HistorySet NO prueba que SAP no haya procesado un POST reciente.
 */
export async function verificarMarcacionGuardadaRH({
  personalNumber, email, id, ensureValidToken,
}) {
  const empleado = await validarSesion({ personalNumber, email, ensureValidToken });
  const fila = await obtenerFila({ personalNumber, email, id });
  if (fila.estado === "enviando") {
    return { resultado: "enviando", fila };
  }
  const comprobacion = await cotejarMovimiento({
    personalNumber, email, fila, scheduleDetail: empleado.scheduleDetail,
  });
  if (comprobacion.resultado === "encontrado" && fila.estado !== "confirmado") {
    await cambiarEstadoMarcacionRH({
      personalNumber, email, id, nuevoEstado: "confirmado",
    });
    return { resultado: "encontrado", fila: { ...fila, estado: "confirmado" } };
  }
  if (comprobacion.resultado === "conflicto" &&
      fila.estado !== "revision" && fila.estado !== "confirmado") {
    await cambiarEstadoMarcacionRH({
      personalNumber, email, id, nuevoEstado: "revision",
      error: `SAP tiene ${fila.tipo} a las ${comprobacion.horaSAP}; la marca local es ${fila.horaMarcacion}.`,
    });
  }
  return comprobacion;
}

/**
 * SOLO tras confirmar explicitamente el riesgo de que HistorySet tarde en reflejar
 * un POST anterior. Revalida de nuevo SAP y NO crea un comprobante nuevo.
 * Cambia a pendiente para que el sincronizador normal reutilice el payload original.
 */
export async function autorizarReenvioMarcacionGuardadaRH({
  personalNumber, email, id, ensureValidToken, autorizacionExplicita = false,
}) {
  if (autorizacionExplicita !== true) throw Error("Falta autorizar el reenvio del comprobante original.");
  const verificacion = await verificarMarcacionGuardadaRH({
    personalNumber, email, id, ensureValidToken,
  });
  if (verificacion.resultado === "encontrado") return { estado: "confirmado", reenvio: false };
  if (verificacion.resultado !== "ausente") {
    throw Error("SAP no permite confirmar la ausencia de este registro. Requiere revision con RH.");
  }
  const fila = await obtenerFila({ personalNumber, email, id });
  if (!ESTADOS_REVISABLES.has(fila.estado)) {
    throw Error("Esta marcacion no necesita un reenvio manual. Revisa su estado actualizado.");
  }
  await cambiarEstadoMarcacionRH({
    personalNumber, email, id, nuevoEstado: "pendiente",
    error: "Reenvio manual autorizado tras consultar SAP; se conserva el comprobante original.",
  });
  return { estado: "pendiente", reenvio: true };
}

/**
 * JustificationLogSet no cuenta aqui con una consulta de confirmacion confiable.
 * Exige confirmacion EXTERNA con RH de que la justificacion no fue recibida.
 * Nunca reenvia la marcacion confirmada, solo su justificante protegido.
 */
export async function autorizarReenvioJustificacionGuardadaRH({
  personalNumber, email, id, ensureValidToken, confirmadaAusenciaConRH = false,
}) {
  if (confirmadaAusenciaConRH !== true) {
    throw Error("Confirma con RH que la justificacion no existe antes de intentar reenviarla.");
  }
  await validarSesion({ personalNumber, email, ensureValidToken });
  const fila = await obtenerFila({ personalNumber, email, id });
  if (fila.estado !== "confirmado" || !ESTADOS_REVISABLES.has(fila.justificacionEstado)) {
    throw Error("Primero debe estar confirmada la marcacion; la justificacion debe requerir revision.");
  }
  const guardado = await leerSolicitudRHProtegida({ personalNumber, email, id });
  if (!guardado?.justificacion || guardado.justificacion.RegisterType !== fila.tipo ||
      guardado.justificacion.RegisterHourLate !== fila.horaMarcacion) {
    throw Error("No esta disponible la justificacion ORIGINAL guardada.");
  }
  await cambiarEstadoJustificacionRH({
    personalNumber, email, id, nuevoEstado: "pendiente",
    error: "Reenvio de justificacion original autorizado tras verificacion externa RH.",
  });
  return { estado: "pendiente", reenvio: true };
}