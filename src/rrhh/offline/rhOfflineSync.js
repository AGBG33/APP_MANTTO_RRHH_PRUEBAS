// src/rrhh/offline/rhOfflineSync.js
// Sincronizacion exclusiva de RRHH. No utiliza sapQueue/outbox/OfflineProvider.
// Nunca modifica una hora de marcacion original ni el GPS capturado sin internet.
// Un timeout despues de iniciar un POST queda INCIERTO: no se reenvia ciegamente.
import NetInfo from "@react-native-community/netinfo";
import { leerPerfilRHCache } from "./rhOfflineDb";
import {
  listarMarcacionesPendientesRH,
  leerMarcacionProtegidaRH,
  cambiarEstadoMarcacionRH,
  marcarEnviosInterrumpidosComoInciertosRH,
} from "./rhPendingDb";
import { leerSolicitudRHProtegida } from "./rhPendingSecure";
import { consultarHistorialRH } from "../../services/rhHistory";
import { obtenerEmpleadoRH } from "../../services/rhEmployees";
import { enviarMarcacionRH } from "../../services/rhAttendance";
import { clasificarEmpleadoRH } from "../../services/rhPolicies";

const enEjecucion = new Set();
const listeners = new Set();
const VERSION = "rh-sync-v1";
const str = x => String(x ?? "").trim();
const canon = x => str(x).padStart(8, "0");
const normEmail = x => str(x).toLowerCase();
const tipos = Object.freeze({ P10: "p10Time", P15: "p15Time", P25: "p25Time", P20: "p20Time" });

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
async function consultarJornada(numero, fechaJornada) {
  const resultado = await consultarHistorialRH({
    personalNumber: numero, desde: fechaJornada, hasta: fechaJornada,
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
  const res = { ok: true, version: VERSION, confirmados: 0, enviados: 0, revision: 0, inciertos: 0,
    restantes: null, reason: "" };
  const cambiar = async (fila, nuevoEstado, error = "") => {
    await cambiarEstadoMarcacionRH({ personalNumber: numero, email: correo, id: fila.id, nuevoEstado, error });
    huboCambios = true;
    emitir("actualizacion", { id: fila.id, estado: nuevoEstado });
  };
  try {
    if (!shouldContinue() || !(await hayRed())) return { ok: false, reason: "sin_red" };
    // Primera lectura sin acceder a SAP. Cuando no hay registros, cero peticiones adicionales.
    let filas = await listarMarcacionesPendientesRH({ personalNumber: numero, email: correo });
    if (!filas.some(f => f.estado !== "confirmado")) return { ...res, reason: "sin_pendientes" };
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
    if (interrumpidos > 0) huboCambios = true;
    filas = await listarMarcacionesPendientesRH({ personalNumber: numero, email: correo });
    emitir("actualizacion", { estado: "revisando" });

    for (const fila of filas) {
      if (!shouldContinue() || !(await hayRed())) { res.ok = false; res.reason = "sin_red"; break; }
      if (fila.estado === "confirmado") continue;

      let jornada;
      try { jornada = await consultarJornada(numero, fila.fechaJornada); }
      catch (e) {
        res.ok = false; res.reason = "historial_sap"; res.detail = errorCorto(e);
        break; // Si SAP no responde, NO se hace POST.
      }
      const verificacion = revisarMovimientoSAP(jornada, fila);
      if (verificacion === "confirmado") {
        try { await cambiar(fila, "confirmado"); res.confirmados++; }
        catch (e) { res.ok = false; res.reason = "estado_local"; res.detail = errorCorto(e); break; }
        continue;
      }
      if (verificacion === "conflicto") {
        if (fila.estado !== "revision") await cambiar(fila, "revision", "SAP registra ese movimiento con otra hora: requiere revisión por RH.");
        res.revision++;
        res.reason = "conflicto";
        break; // Bloquear los siguientes movimientos dependientes.
      }
      // Rechazos tampoco se reenvían; solo se reconcilian contra el historial.
      if (fila.estado === "rechazado") { res.reason = "rechazado"; break; }
      // No repetir automáticamente algo que pudo haberse procesado.
      if (fila.estado === "incierto" || fila.estado === "revision") {
        res.inciertos++;
        res.reason = "requiere_revision";
        break;
      }
      if (fila.estado !== "pendiente") { res.reason = "estado_invalido"; break; }

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
    }
    const restante = await listarMarcacionesPendientesRH({ personalNumber: numero, email: correo });
    res.restantes = restante.filter(f => f.estado !== "confirmado").length;
    return res;
  } catch (e) {
    res.ok = false; res.reason = res.reason || "error_interno"; res.detail = errorCorto(e);
    return res;
  } finally {
    enEjecucion.delete(llave);
    if (huboCambios) emitir("finalizado", { personalNumber: numero, email: correo });
  }
}