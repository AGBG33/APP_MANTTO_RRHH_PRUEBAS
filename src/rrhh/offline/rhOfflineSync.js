// src/rrhh/offline/rhOfflineSync.js
// Sincronizacion exclusiva de RRHH. No utiliza sapQueue/outbox/OfflineProvider.
// Nunca modifica una hora de marcacion original ni el GPS capturado sin internet.
// Un timeout despues de iniciar un POST queda INCIERTO: no se reenvia ciegamente.
import NetInfo from "@react-native-community/netinfo";
import { leerPerfilRHCache, guardarHistorialRHCache,
  iniciarConsultaHistorialRH } from "./rhOfflineDb";
import {
  listarMarcacionesPendientesRH,
  leerMarcacionProtegidaRH,
  cambiarEstadoMarcacionRH,
  marcarEnviosInterrumpidosComoInciertosRH,
  cambiarEstadoJustificacionRH,
  marcarJustificacionesInterrumpidasComoInciertasRH,
} from "./rhPendingDb";
import { leerSolicitudRHProtegida, finalizarSolicitudRHConfirmada } from "./rhPendingSecure";
import { consultarHistorialRH } from "../../services/rhHistory";
import { obtenerEmpleadoRH } from "../../services/rhEmployees";
import { enviarMarcacionRH } from "../../services/rhAttendance";
import { enviarJustificacionRH } from "../../services/rhJustifications";
import { clasificarEmpleadoRH } from "../../services/rhPolicies";

const enEjecucion = new Set();
const listeners = new Set();
const VERSION = "rh-sync-v3-orden-y-revision-manual";
const str = x => String(x ?? "").trim();
const canon = x => str(x).padStart(8, "0");
const normEmail = x => str(x).toLowerCase();
const tipos = Object.freeze({ P10: "p10Time", P15: "p15Time", P25: "p25Time", P20: "p20Time" });
// Orden real de captura: fecha + hora originales. Nunca ordenar por fechaJornada
// porque en turnos nocturnos una salida 06:30 es del dia SIGUIENTE.
const ordenarMarcacionesRH = (a, b) =>
  str(a.fechaMarcacion).localeCompare(str(b.fechaMarcacion)) ||
  str(a.horaMarcacion).localeCompare(str(b.horaMarcacion)) ||
  (Number(a.creadoEn) || 0) - (Number(b.creadoEn) || 0) ||
  str(a.id).localeCompare(str(b.id));

function emitir(evento, datos = {}) {
  for (const cb of [...listeners]) {
    try { cb({ evento, ...datos }); } catch (_) {}
  }
}
export function suscribirSincronizacionRH(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function horaSAP(x) {
  const t = str(x);
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(t) && t !== "00:00:00"
    ? (t.length === 5 ? `${t}:00` : t) : "";
}
function revisarMovimientoSAP(jornada, fila) {
  if (!jornada) return "ausente";
  const campo = tipos[fila.tipo];
  if (!campo) return "conflicto";
  const hora = horaSAP(jornada[campo]);
  if (!hora) return "ausente";
  if (hora === fila.horaMarcacion) return "confirmado";
  // El mismo P10/P15/P25/P20 con otra hora NO es prueba del mismo registro.
  return "conflicto";
}
const errorCorto = e => str(e?.sapMessage || e?.response?.data?.message || e?.message || "Error desconocido").slice(0, 310);
const bloqueante = e => Boolean(e?.sapRejected) || [400, 403, 404, 409, 422].includes(Number(e?.response?.status));
async function hayRed() {
  const red = await NetInfo.fetch();
  return red.isConnected === true && red.isInternetReachable !== false;
}
async function consultarJornada(numero, fechaJornada, scheduleDetail) {
  // En un turno nocturno consultar fecha de inicio + día siguiente;
  // consultarHistorialRH consolida ambas filas de SAP en una jornada.
  const resultado = await consultarHistorialRH({
    personalNumber: numero, desde: fechaJornada, hasta: fechaJornada,
    scheduleDetail,
  });
  return resultado.jornadas.find(j => j.date === fechaJornada) || null;
}

/**
 * Envia exclusivamente filas 'pendiente' con comprobante protegido.
 * El perfil debe haberse validado online, y el token debe estar vigente.
 * El backend SAP/ABAP debe imponer idempotencia para garantizar exactly-once
 * entre dispositivos o ante fallos de red; la app sola no puede prometerlo.
 *
 * shouldContinue previene que una sesion que se cerro o cambio de usuario
 * comience otra peticion. No puede deshacer una peticion que ya inicio.
 */
export async function sincronizarPendientesRH({
  personalNumber, email, ensureValidToken, shouldContinue = () => true,
} = {}) {
  const numero = str(personalNumber);
  const correo = normEmail(email);
  if (!/^\d{1,8}$/.test(numero) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { ok: false, reason: "identidad" };
  }
  const llave = `${canon(numero)}|${correo}`;
  if (enEjecucion.has(llave)) return { ok: false, reason: "en_curso" };
  enEjecucion.add(llave);
  let huboCambios = false;
  const fechasConfirmadas = new Set();
  const res = { ok: true, version: VERSION, confirmados: 0, enviados: 0, revision: 0, inciertos: 0,
    justificacionesConfirmadas: 0, limpiados: 0, restantes: null, reason: "" };
  const cambiar = async (fila, nuevoEstado, error = "") => {
    await cambiarEstadoMarcacionRH({ personalNumber: numero, email: correo, id: fila.id, nuevoEstado, error });
    huboCambios = true;
    emitir("actualizacion", { id: fila.id, estado: nuevoEstado });
  };
  const cambiarJust = async (fila, nuevoEstado, error = "") => {
    await cambiarEstadoJustificacionRH({
      personalNumber: numero, email: correo, id: fila.id, nuevoEstado, error,
    });
    huboCambios = true;
    emitir("actualizacion", { id: fila.id, justificacionEstado: nuevoEstado });
  };

  // Limpiar el comprobante ya finalizado. La cola NO es un historial de
  // asistencias: los registros confirmados se leen desde SAP/SQLite de consulta.
  // Nunca se eliminan marcaciones inciertas ni justificaciones sin confirmar.
  const finalizar = async fila => {
    try {
      const eliminado = await finalizarSolicitudRHConfirmada({
        personalNumber: numero, email: correo, id: fila.id,
      });
      if (!eliminado) {
        res.ok = false; res.reason = "limpieza_no_confirmada";
        res.detail = "La marcacion o su justificacion aun no estan totalmente confirmadas.";
        return false;
      }
      res.limpiados++;
      huboCambios = true;
      fechasConfirmadas.add(fila.fechaJornada);
      emitir("actualizacion", { id: fila.id, estado: "finalizado" });
      if (__DEV__) console.log("[RRHH][SYNC] Comprobante confirmado retirado de pendientes", fila.tipo, fila.fechaJornada);
      return true;
    } catch (error) {
      res.ok = false; res.reason = "limpieza_local";
      res.detail = errorCorto(error);
      if (__DEV__) console.warn("[RRHH][SYNC] No se pudo finalizar comprobante confirmado:", errorCorto(error));
      return false;
    }
  };

  // Una justificacion se envia SOLO despues de confirmar AttendanceRecordSet.
  // La columna propia persiste aunque Android cierre la app.
  const procesarJustificacion = async (fila) => {
    const estado = fila.justificacionEstado || "no_aplica";
    if (["no_aplica", "confirmado"].includes(estado)) return true;
    if (estado !== "pendiente") {
      res.ok = false; res.reason = "justificacion_requiere_revision";
      res.detail = `Justificacion ${estado}: verificar en RH antes de reenviar.`;
      return false;
    }
    if (!shouldContinue() || !(await hayRed())) {
      res.ok = false; res.reason = "sin_red"; return false;
    }
    let comprobante;
    try {
      comprobante = await leerSolicitudRHProtegida({
        personalNumber: numero, email: correo, id: fila.id,
      });
      const j = comprobante?.justificacion;
      if (!j || j.PersonalNumber === undefined ||
          canon(j.PersonalNumber) !== canon(numero) ||
          j.WorkDate !== fila.fechaMarcacion || j.RegisterHourLate !== fila.horaMarcacion ||
          j.RegisterType !== fila.tipo) {
        throw Error("Justificacion original ausente o no coincide con la marcacion.");
      }
    } catch (error) {
      await cambiarJust(fila, "revision", errorCorto(error));
      res.ok = false; res.reason = "comprobante_justificacion";
      res.detail = errorCorto(error); return false;
    }
    await cambiarJust(fila, "enviando");
    try {
      const resultado = await enviarJustificacionRH(comprobante.justificacion);
      await cambiarJust(fila, "confirmado");
      res.justificacionesConfirmadas++;
      if (__DEV__) console.log("[RRHH][SYNC] Justificacion confirmada por SAP", fila.tipo, fila.fechaJornada, resultado.status);
      return true;
    } catch (error) {
      const nuevoEstado = bloqueante(error) ? "rechazado" : "incierto";
      try { await cambiarJust(fila, nuevoEstado, errorCorto(error)); } catch (_) {}
      res.ok = false; res.reason = `justificacion_${nuevoEstado}`;
      res.detail = errorCorto(error);
      return false;
    }
  };

  try {
    if (!shouldContinue() || !(await hayRed())) return { ok: false, reason: "sin_red" };
    // Primera lectura sin acceder a SAP. Cuando no hay registros, cero peticiones adicionales.
    let filas = await listarMarcacionesPendientesRH({ personalNumber: numero, email: correo });
    filas.sort(ordenarMarcacionesRH);
    // Aunque todas las filas ya estén confirmadas, NO salir aquí: todavía
    // hay que retirar sus comprobantes protegidos y compactar SQLite.
    if (filas.length === 0) return { ...res, reason: "sin_pendientes" };
    if (typeof ensureValidToken !== "function" || !(await ensureValidToken())) {
      return { ok: false, reason: "sesion_sin_token" };
    }
    if (!shouldContinue() || !(await hayRed())) return { ok: false, reason: "sin_red" };

    // La identidad de SAP se reconfirma online ANTES de cualquier POST.
    let perfil;
    try { perfil = await obtenerEmpleadoRH(correo); }
    catch (e) { return { ok: false, reason: "perfil_sap", detail: errorCorto(e) }; }
    if (!perfil || perfil.numeroConfirmadoEnSAP !== true ||
        canon(perfil.personalNumber) !== canon(numero) || normEmail(perfil.email) !== correo) {
      return { ok: false, reason: "perfil_diferente" };
    }
    const permisos = clasificarEmpleadoRH(perfil);
    if (!permisos.habilitado) return { ok: false, reason: "sin_permiso", detail: permisos.razon };
    const cache = await leerPerfilRHCache({ personalNumber: numero, email: correo });
    if (!cache || !cache.perfil ||
        cache.perfil.scheduleDetail !== perfil.scheduleDetail ||
        cache.perfil.groupPerson !== perfil.groupPerson ||
        cache.perfil.authorisedRegister !== perfil.authorisedRegister ||
        cache.perfil.relationJob !== perfil.relationJob) {
      // Cambio de horarios o permisos: RH debe valorar marcaciones viejas.
      return { ok: false, reason: "perfil_cambio", detail: "Cambio de horario, modalidad o permisos; revisión por RH." };
    }
    if (!shouldContinue()) return { ok: false, reason: "sesion_cambiada" };

    const interrumpidos = await marcarEnviosInterrumpidosComoInciertosRH({ personalNumber: numero, email: correo });
    const justInterrumpidas = await marcarJustificacionesInterrumpidasComoInciertasRH({
      personalNumber: numero, email: correo,
    });
    if (interrumpidos > 0 || justInterrumpidas > 0) huboCambios = true;
    filas = await listarMarcacionesPendientesRH({ personalNumber: numero, email: correo });
    filas.sort(ordenarMarcacionesRH);
    emitir("actualizacion", { estado: "revisando" });

    // La lista proviene de rhPendingDb: fecha REAL + hora REAL de marcacion,
    // no fecha de jornada. Ordena correctamente turnos nocturnos 23:00-07:00.
    // Ante cualquier falla se DETIENE: ningun paso posterior adelanta al previo.
    for (const fila of filas) {
      if (!shouldContinue() || !(await hayRed())) { res.ok = false; res.reason = "sin_red"; break; }
      if (fila.estado === "confirmado") {
        if (!(await procesarJustificacion(fila))) break;
        if (!(await finalizar(fila))) break;
        continue;
      }

      let jornada;
      try { jornada = await consultarJornada(numero, fila.fechaJornada, perfil.scheduleDetail); }
      catch (e) {
        res.ok = false; res.reason = "historial_sap"; res.detail = errorCorto(e);
        break; // Si SAP no responde, NO se hace POST.
      }
      const verificacion = revisarMovimientoSAP(jornada, fila);
      if (verificacion === "confirmado") {
        try { await cambiar(fila, "confirmado"); res.confirmados++; fechasConfirmadas.add(fila.fechaJornada); }
        catch (e) { res.ok = false; res.reason = "estado_local"; res.detail = errorCorto(e); break; }
        if (!(await procesarJustificacion({ ...fila, estado: "confirmado" }))) break;
        if (!(await finalizar(fila))) break;
        continue;
      }
      if (verificacion === "conflicto") {
        if (fila.estado !== "revision") await cambiar(fila, "revision", "SAP registra ese movimiento con otra hora: requiere revisión por RH.");
        res.revision++;
        res.ok = false;
        res.reason = "conflicto";
        res.detail = "SAP tiene una marcacion con otra hora: requiere revision RH.";
        break; // Bloquear los siguientes movimientos dependientes.
      }
      // Rechazos tampoco se reenvían; solo se reconcilian contra el historial.
      if (fila.estado === "rechazado") {
        res.ok = false; res.reason = "rechazado";
        res.detail = fila.ultimoError || "SAP rechazo este registro; revisalo antes de reenviar.";
        break;
      }
      // No repetir automáticamente algo que pudo haberse procesado.
      if (fila.estado === "incierto" || fila.estado === "revision") {
        res.inciertos++; res.ok = false;
        res.reason = "requiere_revision";
        res.detail = fila.ultimoError || "Esta marcacion requiere revision antes del reenvio manual.";
        break;
      }
      if (fila.estado !== "pendiente") {
        res.ok = false; res.reason = "estado_invalido";
        res.detail = "Estado de cola inesperado: no se reenviara automaticamente.";
        break;
      }

      // Validacion de integridad: recuperar el payload original (GPS y hora exactos).
      let comprobante;
      try { comprobante = await leerSolicitudRHProtegida({ personalNumber: numero, email: correo, id: fila.id }); }
      catch (e) {
        await cambiar(fila, "revision", "Comprobante local no disponible o inconsistente. Requiere RH.");
        res.revision++; res.reason = "comprobante"; break;
      }
      const payload = comprobante?.payload;
      if (!payload || payload.RegisterType !== fila.tipo || payload.EnterHour !== fila.horaMarcacion ||
          payload.EnterDate !== fila.fechaMarcacion || canon(payload.PersonalNumber) !== canon(numero) ||
          normEmail(payload.Email) !== correo) {
        await cambiar(fila, "revision", "La marcación no coincide con el comprobante protegido.");
        res.revision++; res.reason = "integridad"; break;
      }
      if (!shouldContinue() || !(await hayRed())) { res.ok = false; res.reason = "sin_red"; break; }

      // Transicion persistida ANTES de efectuar el POST. Si Android cierra la
      // aplicacion durante el envio, el siguiente arranque lo deja INCIERTO.
      await cambiar(fila, "enviando");
      try {
        const resultado = await enviarMarcacionRH(payload); // HTTP2xx + StatusReq=OK
        await cambiar({ ...fila, estado: "enviando" }, "confirmado");
        res.enviados++; res.confirmados++;
        fechasConfirmadas.add(fila.fechaJornada);
        if (__DEV__) console.log("[RRHH][SYNC] Marcación confirmada por SAP", fila.tipo, fila.fechaJornada,
          resultado.statusReq);
      } catch (e) {
        // Si comenzó un POST, el resultado de un timeout es incierto, NO 'pendiente'.
        const nuevoEstado = bloqueante(e) ? "rechazado" : "incierto";
        try { await cambiar({ ...fila, estado: "enviando" }, nuevoEstado, errorCorto(e)); }
        catch (_) {} // Permanece 'enviando': se convertirá en 'incierto' al reiniciar.
        if (nuevoEstado === "incierto") res.inciertos++; else res.revision++;
        res.ok = false; res.reason = nuevoEstado; res.detail = errorCorto(e);
        break;
      }
      if (!(await procesarJustificacion({ ...fila, estado: "confirmado" }))) break;
      if (!(await finalizar(fila))) break;
    }
    // La sincronizacion puede ejecutarse sin la pantalla de asistencia abierta.
    // Después de cambiar el estado de la cola, volver a LEER SAP y actualizar
    // la copia diaria: al desconectarse no deben reaparecer horas antiguas.
    // Una lectura fallida no cambia un POST ya confirmado ni borra pendientes.
    for (const fecha of fechasConfirmadas) {
      if (!shouldContinue() || !(await hayRed())) break;
      const ticketConsulta = iniciarConsultaHistorialRH();
      try {
        const respuesta = await consultarHistorialRH({
          personalNumber: numero, desde: fecha, hasta: fecha,
          scheduleDetail: perfil.scheduleDetail,
        });
        await guardarHistorialRHCache({ personalNumber: numero, email: correo,
          desde: fecha, hasta: fecha, jornadas: respuesta.jornadas, ticketConsulta });
      } catch (errorCache) {
        if (__DEV__) console.warn("[RRHH][CACHE] No se pudo conciliar jornada despues del envio:",
          errorCache?.message || errorCache);
      }
    }
    const restante = await listarMarcacionesPendientesRH({ personalNumber: numero, email: correo });
    res.restantes = restante.filter(f => f.estado !== "confirmado" ||
      !["no_aplica", "confirmado"].includes(f.justificacionEstado)).length;
    return res;
  } catch (e) {
    res.ok = false; res.reason = res.reason || "error_interno"; res.detail = errorCorto(e);
    return res;
  } finally {
    enEjecucion.delete(llave);
    if (huboCambios) emitir("finalizado", { personalNumber: numero, email: correo });
  }
}