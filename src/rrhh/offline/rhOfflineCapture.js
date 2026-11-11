// src/rrhh/offline/rhOfflineCapture.js
// PASO 7A - Motor conservador de captura de marcaciones SIN INTERNET.
//
// No cambia pantallas ni envía a SAP. Se conectará a asistencia.js en el paso 7B.
// Usa exclusivamente rrhh_offline.db + SecureStore de los pasos 1, 5 y 6.
// NO importa ni ejecuta sapQueue, outbox, syncEngine ni OfflineProvider.
//
// Captura offline segun las reglas actuales de RRHH, incluidas las
// justificaciones cuando corresponde. Toda captura nueva queda PENDIENTE
// y no se convierte en confirmacion SAP por guardarse localmente.

import NetInfo from "@react-native-community/netinfo";
import {
  claveUsuarioRH,
  leerPerfilRHCache,
  leerHistorialRHCache,
} from "./rhOfflineDb";
import { listarMarcacionesPendientesRH } from "./rhPendingDb";
import { guardarSolicitudRHProtegida, leerSolicitudRHProtegida } from "./rhPendingSecure";
import { prepararMarcacionRH } from "../../services/rhAttendance";
import { prepararJustificacionRH } from "../../services/rhJustifications";
import {
  TIPOS_RH,
  obtenerTurnoDelDia,
  clasificarEmpleadoRH,
  evaluarMarcacionRH,
  registrosDeJornadaRH, modalidadesPermitidasRH,
} from "../../services/rhPolicies";
import {
  mesLaboralRH,
  resumirReglasRH,
  movimientosDesdeHistoryRH,
  esHomeOfficeEmpleadoRH,
  esViajeRH,
} from "../../services/rhBusinessRules";

// El perfil y el historial se usan hasta 15 dias en una sesion local valida.
// Las marcaciones siguen siendo PENDIENTES hasta su conciliacion con SAP;
// cambios de horarios/permisos conocidos por SAP podran requerir revision.
const MAX_ANTIGUEDAD_MS = 15 * 24 * 60 * 60 * 1000;
// Tolerancia limitada a desfases del reloj del emulador en desarrollo.
const MARGEN_RELOJ_ATRAS_MS = __DEV__ ? 72 * 60 * 60 * 1000 : 5 * 60 * 1000;
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
  const diferencia = ahoraMs - fecha;
  if (!Number.isFinite(fecha) || fecha <= 0 ||
      diferencia < -MARGEN_RELOJ_ATRAS_MS || diferencia > MAX_ANTIGUEDAD_MS) {
    throw Error(`RRHH offline: ${descripcion} no tiene una copia vigente. Comprueba la fecha del dispositivo y actualiza el perfil e historial con internet.`);
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
    modality: row.modalidad || "Presencial",
    typeSession: ({ Presencial: "PR", HomeOffice: "HO", "Viaje de negocios": "VN" })[row.modalidad] || "PR",
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
  registrosLocales = [], viajeDesde = "", viajeHasta = "",
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
  if (!["Presencial", "HomeOffice", "Viaje de negocios"].includes(modalidad)) {
    throw Error("RRHH offline: modalidad desconocida.");
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
  if (!modalidadesPermitidasRH(perfil).includes(modalidad)) {
    throw Error("RRHH offline: modalidad incompatible con el grupo del empleado.");
  }
  if (esViajeRH(perfil) && modalidad !== "Viaje de negocios") {
    throw Error("RRHH offline: el perfil guardado corresponde a viaje de negocios.");
  }
  if (esHomeOfficeEmpleadoRH(perfil) && modalidad !== "HomeOffice") {
    throw Error("RRHH offline: el perfil guardado corresponde a Home Office.");
  }
  if (modalidad === "Viaje de negocios" && (!/^\d{4}-\d{2}-\d{2}$/.test(viajeDesde) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(viajeHasta) || viajeDesde > viajeHasta)) {
    throw Error("RRHH offline: selecciona fechas validas del viaje antes de registrar.");
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
  if (resumen.inasistenciaSAP || (resumen.homeOfficeHoy && modalidad !== "HomeOffice")) {
    throw Error("RRHH offline: SAP ya registro un estado incompatible para esta jornada. Revisa en linea.");
  }
  if (modalidad === "HomeOffice" && resumen.homeOfficeUsadoSemana && !resumen.homeOfficeHoy) {
    throw Error("RRHH offline: ya hay Home Office registrado esta semana; consulta SAP antes de iniciar otro.");
  }
  // Si la semana cruza de mes y no tenemos cache del periodo anterior, una
  // nueva jornada HO no puede confirmar cuota semanal de manera confiable.
  if (modalidad === "HomeOffice") {
    const semana = new Date(new Date(`${fechaJornada}T12:00:00`).getTime());
    const lunes = new Date(semana);
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const lunesISO = `${lunes.getFullYear()}-${String(lunes.getMonth()+1).padStart(2,"0")}-${String(lunes.getDate()).padStart(2,"0")}`;
    if (lunesISO < mes.desde) throw Error("RRHH offline: se requiere consultar la semana completa para comprobar Home Office.");
  }

  const comprobantes = recibosDeEstaPersona(registrosLocales, personalNumber, email);
  const pendientes = await listarMarcacionesPendientesRH({ personalNumber, email });
  const deHoy = pendientes.filter(p => p.fechaJornada === fechaJornada);
  if (deHoy.some(p => ESTADOS_POR_REVISAR.has(p.estado))) {
    throw Error("RRHH offline: existe un registro que necesita revision. No se admiten nuevas marcaciones hasta verificarlo con SAP.");
  }
  // Conservamos la secuencia: un P10 pendiente permite despues P15/P20,
  // pero SIGUE apareciendo como PENDIENTE en SQLite y en la UI futura.
  const localesOffline = [];
  for (const p of deHoy) {
    // Recuperar TypeSession protegido para no mezclar PR/HO/VN al continuar la jornada.
    const c = await leerSolicitudRHProtegida({ personalNumber, email, id: p.id });
    if (!c?.payload) throw Error("RRHH offline: falta el comprobante de un movimiento anterior.");
    const m = ({ PR: "Presencial", HO: "HomeOffice", VN: "Viaje de negocios" })[c.payload.TypeSession];
    if (!m) throw Error("RRHH offline: modalidad previa desconocida.");
    localesOffline.push(registroDesdePendiente({ ...p, modalidad: m }, personalNumber));
  }
  const remotos = resumen.jornadaSAP
    ? movimientosDesdeHistoryRH(resumen.jornadaSAP, turno) : [];

  // SAP es la fuente de verdad de la ULTIMA consulta guardada.
  // Una fila de la cola marcada como 'confirmado' que ya se encuentra en esa
  // copia no es un duplicado: es el mismo movimiento que enviamos previamente.
  // Solo la copia SAP participa en la secuencia (sin duplicar el mismo paso).
  const localesParaValidar = [];
  for (const local of localesOffline) {
    const fila = deHoy.find(p => p.id === local.id);
    const remotoMismoTipo = remotos.find(sap => sap.type === local.type);
    if (remotoMismoTipo) {
      const mismaHora = remotoMismoTipo.date === local.date &&
        remotoMismoTipo.registerHour === local.registerHour;
      if (fila?.estado === "confirmado" && mismaHora) {
        continue; // Confirmado en SQLite Y en SAP: usar solamente el de SAP.
      }
      // Una fila no confirmada o una hora distinta requiere conciliacion real.
      throw Error("RRHH offline: hay una marcacion local sin conciliar con SAP para " +
        local.type + ". Verifica el comprobante cuando recuperes internet.");
    }
    // Si una consulta mas nueva de SAP no contiene una marcacion que la cola
    // consideraba confirmada, no declararla recibida ni repetirla offline.
    // Puede haberse eliminado en QAS o aun no reflejarse en el historial.
    if (fila?.estado === "confirmado" &&
        Number(historial.guardadoEn) > Number(fila.actualizadoEn || 0)) {
      throw Error("RRHH offline: una marcacion antes confirmada ya no aparece en la ultima copia de SAP. " +
        "Conectate para revisar la diferencia antes de continuar.");
    }
    localesParaValidar.push(local);
  }

  const comprobantesParaValidar = comprobantes.filter(r => {
    const registradoEnSAP = remotos.some(sap => sap.type === r.type);
    if (registradoEnSAP) {
      // El acuse local aceptado NO es otro movimiento adicional.
      // Una peticion incierta sin conciliar SI permanece para revision.
      return r.sapState !== "accepted";
    }
    if (r.sapState === "accepted") {
      const guardadoLocal = Date.parse(r.createdAt || "");
      if (Number(historial.guardadoEn) >
          (Number.isFinite(guardadoLocal) ? guardadoLocal : 0)) {
        // SAP fue consultado DESPUES del comprobante local y no lo refleja.
        // No permitir que una aceptacion historica local complete la jornada.
        return false;
      }
    }
    return true;
  });
  const registros = [...comprobantesParaValidar, ...remotos, ...localesParaValidar];
  // No crear una salida/comida anterior cronologicamente a la entrada capturada.
  if (tipo !== "entrada") {
    const entradas = registros.filter(r => r.type === "entrada");
    for (const e of entradas) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e.date || ""));
      const hm = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(e.registerHour || e.time || ""));
      if (!match || !hm) continue;
      const inicio = new Date(Number(match[1]), Number(match[2])-1, Number(match[3]), Number(hm[1]), Number(hm[2]));
      if (ahora.getTime() < inicio.getTime()) {
        throw Error("RRHH offline: el reloj del equipo indica una hora anterior a tu entrada. Revisa la fecha del emulador y el turno nocturno.");
      }
    }
  }
  const resultado = evaluarMarcacionRH({
    empleado: perfil, tipo, registros, ahora, modalidad,
  });
  if (!resultado.permitido) throw Error(resultado.mensaje);
  // Retardo/salida anticipada: se exigira justificante local protegido.
  // Nunca se confunde una marcacion confirmada con su justificacion pendiente.
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
  registrosLocales = [], viajeDesde = "", viajeHasta = "",
  justificacionDatos = null,
}) {
  const validacion = await validarCapturaOfflineRH({
    empleado, personalNumber, email, tipo, modalidad, registrosLocales,
    viajeDesde, viajeHasta,
  });
  const { payload, gpsAccuracyMeters } = await prepararMarcacionRH({
    empleado: validacion.perfil,
    personalNumber,
    email,
    type: tipo,
    modalidad,
    registros: validacion.registros,
    viajeDesde, viajeHasta,
  });
  // El GPS es asincrono; si volvio internet o cambio el turno durante la
  // captura, no guardar con reglas anteriores. Nunca convertir a POST online.
  await comprobarSinInternet();
  const turnoActual = obtenerTurnoDelDia(validacion.perfil.scheduleDetail, new Date());
  if (!turnoActual?.valido || turnoActual.fechaJornada !== validacion.fechaJornada) {
    throw Error("RRHH offline: la jornada cambio durante la captura. Revisa nuevamente tu horario.");
  }
  const exigeJustificacion = !!(validacion.evaluacion.retardo || validacion.evaluacion.salidaAnticipada);
  let justificacion = null;
  if (exigeJustificacion) {
    if (!justificacionDatos || !String(justificacionDatos.comentario || "").trim()) {
      throw Error("RRHH offline: esta marcacion requiere motivo y comentario de justificacion.");
    }
    justificacion = prepararJustificacionRH({
      personalNumber, enterDate: payload.EnterDate, enterHour: payload.EnterHour,
      registerType: payload.RegisterType, motivo: justificacionDatos.motivo,
      comentario: justificacionDatos.comentario,
      recuperarTiempo: justificacionDatos.recuperarTiempo === true,
    });
  }
  const guardada = await guardarSolicitudRHProtegida({
    personalNumber, email, fechaJornada: validacion.fechaJornada,
    payload, justificacion,
  });
  return {
    ...guardada,
    gpsAccuracyMeters,
    aviso: guardada.yaExistia
      ? "Ya existia una marcacion guardada localmente. Revisa pendientes."
      : "Marcacion guardada en el telefono. Pendiente de conciliacion y envio a SAP.",
  };
}