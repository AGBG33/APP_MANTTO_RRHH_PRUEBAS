// src/rrhh/offline/rhOfflineCapture.js
// PASO 7A - Motor conservador de captura de marcaciones SIN INTERNET.
//
// No cambia pantallas ni envía a SAP. Se conectará a asistencia.js en el paso 7B.
// Usa exclusivamente rrhh_offline.db + SecureStore de los pasos 1, 5 y 6.
// NO importa ni ejecuta sapQueue, outbox, syncEngine ni OfflineProvider.
//
// Primera fase: Presencial, sin retardo ni salida anticipada. Los otros casos
// necesitan reglas/justificaciones adicionales que implementaremos después.
// Todo registro aquí creado es PENDIENTE, nunca confirmado por SAP.

import NetInfo from "@react-native-community/netinfo";
import {
  claveUsuarioRH,
  leerPerfilRHCache,
  leerHistorialRHCache,
} from "./rhOfflineDb";
import { listarMarcacionesPendientesRH } from "./rhPendingDb";
import { guardarSolicitudRHProtegida } from "./rhPendingSecure";
import { prepararMarcacionRH } from "../../services/rhAttendance";
import {
  TIPOS_RH,
  obtenerTurnoDelDia,
  clasificarEmpleadoRH,
  evaluarMarcacionRH,
  registrosDeJornadaRH,
} from "../../services/rhPolicies";
import {
  mesLaboralRH,
  resumirReglasRH,
  movimientosDesdeHistoryRH,
  esHomeOfficeEmpleadoRH,
  esViajeRH,
} from "../../services/rhBusinessRules";

// Se prioriza seguridad sobre disponibilidad: el perfil y el historial deben
// haberse actualizado durante las ultimas 24 h. Esto NO garantiza que SAP no
// haya cambiado desde otra terminal; la conciliacion futura sigue siendo vital.
const MAX_ANTIGUEDAD_MS = 24 * 60 * 60 * 1000;
const TIPOS_PERMITIDOS = new Set(Object.keys(TIPOS_RH));
const CODIGO_A_TIPO = Object.fromEntries(
  Object.entries(TIPOS_RH).map(([tipo, codigo]) => [codigo, tipo])
);
const ESTADOS_POR_REVISAR = new Set([
  "enviando", "incierto", "revision", "rechazado",
]);
const s = valor => String(valor ?? "").trim();
const nomina = valor => s(valor).padStart(8, "0");
const correo = valor => s(valor).toLowerCase();

function comprobarVigencia(guardadoEn, descripcion, ahoraMs) {
  const fecha = Number(guardadoEn);
  if (!Number.isFinite(fecha) || fecha <= 0 || fecha > ahoraMs ||
      ahoraMs - fecha > MAX_ANTIGUEDAD_MS) {
    throw Error(`RRHH offline: ${descripcion} no esta actualizado en las ultimas 24 horas. Conectate y consulta SAP antes de registrar sin internet.`);
  }
}

// No usar el modo offline como atajo cuando el telefono SI tiene internet.
async function comprobarSinInternet() {
  const estado = await NetInfo.fetch();
  const desconectado = estado.isConnected === false ||
    estado.isInternetReachable === false;
  if (!desconectado) {
    throw Error("RRHH offline: este modo es exclusivo para cuando no hay internet. Usa el registro normal con SAP.");
  }
}

function recibosDeEstaPersona(registrosLocales, personalNumber, email) {
  if (!Array.isArray(registrosLocales)) {
    throw Error("RRHH offline: no se pudieron comprobar tus comprobantes locales.");
  }
  return registrosLocales.filter(r => r && r.demo !== true &&
    nomina(r.personalNumber) === nomina(personalNumber) &&
    (!r.email || correo(r.email) === correo(email)));
}

function registroDesdePendiente(row, personalNumber) {
  const tipo = CODIGO_A_TIPO[row.tipo];
  if (!tipo) throw Error("RRHH offline: existe un tipo de marcacion pendiente desconocido.");
  return {
    id: row.id,
    personalNumber,
    date: row.fechaMarcacion,
    time: row.horaMarcacion.slice(0, 5),
    registerHour: row.horaMarcacion,
    type: tipo,
    registerType: row.tipo,
    modality: "Presencial",
    typeSession: "PR",
    // Solo para validar la SECUENCIA local. No significa confirmado por SAP.
    sapState: "accepted",
    source: "RH_OFFLINE_PENDIENTE",
  };
}

/**
 * Comprueba si hoy se puede CAPTURAR una marcacion offline. No guarda ni envia.
 *
 * El caller debe obtener empleado, email y numero de la sesion autenticada,
 * nunca de campos editables. registrosLocales son los comprobantes que ya usa
 * asistencia.js. Repetimos la comprobacion al guardar.
 */
export async function validarCapturaOfflineRH({
  empleado, personalNumber, email, tipo, modalidad = "Presencial",
  registrosLocales = [],
}) {
  await comprobarSinInternet();
  const ahora = new Date();
  const ahoraMs = ahora.getTime();
  // Exige coincidencia estructural; claveUsuarioRH tambien valida los formatos.
  claveUsuarioRH(personalNumber, email);
  if (!empleado || nomina(empleado.personalNumber) !== nomina(personalNumber) ||
      correo(empleado.email) !== correo(email)) {
    throw Error("RRHH offline: el perfil no corresponde a la sesion autenticada.");
  }
  if (!TIPOS_PERMITIDOS.has(tipo)) {
    throw Error("RRHH offline: tipo de registro no permitido.");
  }
  if (modalidad !== "Presencial") {
    throw Error("RRHH offline: por ahora solo se permite capturar marcaciones presenciales. Home Office y viajes requieren validaciones adicionales.");
  }

  // No basta con el perfil que esta en pantalla: comprobar en la base que
  // SAP lo confirmo previamente para ESTA nomina y ESTE correo.
  const copia = await leerPerfilRHCache({ personalNumber, email });
  if (!copia || copia.perfil?.numeroConfirmadoEnSAP !== true) {
    throw Error("RRHH offline: primero debes validar tu perfil con SAP teniendo internet.");
  }
  comprobarVigencia(copia.guardadoEn, "tu perfil", ahoraMs);
  const perfil = copia.perfil;
  if (s(perfil.scheduleDetail) !== s(empleado.scheduleDetail) ||
      s(perfil.groupPerson) !== s(empleado.groupPerson) ||
      s(perfil.authorisedRegister) !== s(empleado.authorisedRegister) ||
      s(perfil.relationJob) !== s(empleado.relationJob)) {
    throw Error("RRHH offline: el perfil en pantalla no coincide con los datos guardados de SAP.");
  }
  const politica = clasificarEmpleadoRH(perfil);
  if (!politica.habilitado) throw Error(politica.razon);
  if (esViajeRH(perfil) || esHomeOfficeEmpleadoRH(perfil)) {
    throw Error("RRHH offline: tu modalidad actual en SAP requiere una validacion en linea.");
  }

  const turno = obtenerTurnoDelDia(perfil.scheduleDetail, ahora);
  if (!turno?.valido) {
    throw Error(turno?.razon || "RRHH offline: no hay horario valido para esta jornada.");
  }
  const fechaJornada = turno.fechaJornada;
  const mes = mesLaboralRH(fechaJornada);
  const historial = await leerHistorialRHCache({
    personalNumber, email, desde: mes.desde, hasta: mes.hasta,
  });
  if (!historial) {
    throw Error("RRHH offline: falta la copia del mes actual. Con internet, abre Historial y consulta el mes antes de probar offline.");
  }
  comprobarVigencia(historial.guardadoEn, "el historial mensual", ahoraMs);

  const resumen = resumirReglasRH({
    jornadasMes: historial.jornadas,
    jornadasSemana: historial.jornadas,
    fechaJornada,
  });
  if (resumen.inasistenciaSAP || resumen.homeOfficeHoy) {
    throw Error("RRHH offline: SAP ya registro un estado especial para esta jornada. Revisa en linea.");
  }

  const comprobantes = recibosDeEstaPersona(registrosLocales, personalNumber, email);
  const pendientes = await listarMarcacionesPendientesRH({ personalNumber, email });
  const deHoy = pendientes.filter(p => p.fechaJornada === fechaJornada);
  if (deHoy.some(p => ESTADOS_POR_REVISAR.has(p.estado))) {
    throw Error("RRHH offline: existe un registro que necesita revision. No se admiten nuevas marcaciones hasta verificarlo con SAP.");
  }
  // Conservamos la secuencia: un P10 pendiente permite despues P15/P20,
  // pero SIGUE apareciendo como PENDIENTE en SQLite y en la UI futura.
  const localesOffline = deHoy.map(p => registroDesdePendiente(p, personalNumber));
  const remotos = resumen.jornadaSAP
    ? movimientosDesdeHistoryRH(resumen.jornadaSAP, turno) : [];
  // Un conflicto entre cache SAP y cola offline requiere conciliacion.
  if (localesOffline.some(r => remotos.some(sap => sap.type === r.type))) {
    throw Error("RRHH offline: existe una marcacion local que tambien aparece en la copia SAP. Requiere conciliacion.");
  }

  const registros = [...comprobantes, ...remotos, ...localesOffline];
  const resultado = evaluarMarcacionRH({
    empleado: perfil, tipo, registros, ahora, modalidad,
  });
  if (!resultado.permitido) throw Error(resultado.mensaje);
  // Retardo/cuarto retardo y salida anticipada pueden requerir JustificationLogSet,
  // que todavia no cuenta con su propia cola protegida.
  if (resultado.retardo || resultado.salidaAnticipada) {
    throw Error("RRHH offline: los retardos y las salidas anticipadas requieren una justificacion; por seguridad, esta primera version no los captura sin internet.");
  }
  if (tipo === "entrada" && resumen.retardosPrevios >= 3 &&
      ahoraMs > turno.inicioMs + 10 * 60 * 1000) {
    throw Error("RRHH offline: posible cuarto retardo. Contacta a RH o conectate para validar SAP.");
  }
  return { perfil, turno, fechaJornada, registros, evaluacion: resultado };
}

/**
 * Prepara GPS y fecha/hora usando el servicio de asistencia EXISTENTE,
 * guarda el payload cifrado en SecureStore y una referencia en SQLite RRHH.
 * No hace POST. No inicia reintentos. No modifica AsyncStorage de mantenimiento.
 */
export async function capturarMarcacionOfflineRH({
  empleado, personalNumber, email, tipo, modalidad = "Presencial",
  registrosLocales = [],
}) {
  const validacion = await validarCapturaOfflineRH({
    empleado, personalNumber, email, tipo, modalidad, registrosLocales,
  });
  const { payload, gpsAccuracyMeters } = await prepararMarcacionRH({
    empleado: validacion.perfil,
    personalNumber,
    email,
    type: tipo,
    modalidad,
    registros: validacion.registros,
  });
  // El GPS es asincrono; si volvio internet o cambio el turno durante la
  // captura, no guardar con reglas anteriores. Nunca convertir a POST online.
  await comprobarSinInternet();
  const turnoActual = obtenerTurnoDelDia(validacion.perfil.scheduleDetail, new Date());
  if (!turnoActual?.valido || turnoActual.fechaJornada !== validacion.fechaJornada) {
    throw Error("RRHH offline: la jornada cambio durante la captura. Revisa nuevamente tu horario.");
  }
  const guardada = await guardarSolicitudRHProtegida({
    personalNumber,
    email,
    fechaJornada: validacion.fechaJornada,
    payload,
  });
  return {
    ...guardada,
    gpsAccuracyMeters,
    aviso: guardada.yaExistia
      ? "Ya existia una marcacion guardada localmente. Revisa pendientes."
      : "Marcacion guardada en el telefono. Pendiente de conciliacion y envio a SAP.",
  };
}