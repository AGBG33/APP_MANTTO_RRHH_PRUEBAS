// src/context/SapEmployeeContext.js
// Perfil RRHH: consulta SAP, guarda perfil e historial mensual y recupera cache.
// La captura offline se controla separadamente en rhOfflineCapture.js.
// No modifica autenticacion, servicios de mantenimiento ni POST de asistencia.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "./AuthContext";
import { obtenerEmpleadoRH } from "../services/rhEmployees";
import { guardarPerfilRHCache, leerPerfilRHCachePorCorreo,
  guardarHistorialRHCache, leerHistorialRHCache,
  iniciarConsultaHistorialRH } from "../rrhh/offline/rhOfflineDb";
import { consultarHistorialRH } from "../services/rhHistory";
import { obtenerTurnoDelDia, hoyISO } from "../services/rhPolicies";
import { mesLaboralRH } from "../services/rhBusinessRules";

const SapEmployeeContext = createContext(null);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Coincide con el maximo de sesion local de AuthContext (15 dias).
// La lectura del perfil no confirma un envio a SAP; cada marcacion offline
// tiene validaciones propias y queda pendiente hasta sincronizar.
const MAX_LECTURA_OFFLINE_MS = 15 * 24 * 60 * 60 * 1000;
// Un emulador puede retroceder el reloj durante pruebas de turnos nocturnos.
// Produccion: solo 5 minutos de tolerancia. DEV: hasta 72 horas para pruebas.
// No se usa esta tolerancia para permitir registros con cuentas diferentes.
const MARGEN_RELOJ_ATRAS_MS = __DEV__ ? 72 * 60 * 60 * 1000 : 5 * 60 * 1000;
function antiguedadAceptable(guardadoEn, maxMs = MAX_LECTURA_OFFLINE_MS) {
  const fecha = Number(guardadoEn);
  const diferencia = Date.now() - fecha;
  return Number.isFinite(fecha) && fecha > 0 &&
    diferencia >= -MARGEN_RELOJ_ATRAS_MS && diferencia <= maxMs;
}
const ESTADO_INICIAL = {
  identity: "", loading: false, employee: null, error: "",
  origenPerfil: null, perfilGuardadoEn: null, perfilDesactualizado: false,
  estadoOffline: "desconocido", // preparando | listo | falta_historial | cache | desconocido
};

export function correoAutenticadoRH(user) {
  if (!user) return "";
  const opciones = [
    user.correo, user.email, user.mail,
    user.preferred_username, user.userPrincipalName, user.upn,
    user.username,
  ];
  const value = opciones.find(x => typeof x === "string" && EMAIL_REGEX.test(x.trim()));
  return String(value || "").trim().toLowerCase();
}

function falloDeTransporte(error) {
  // Un rechazo de autenticacion o una respuesta de SAP NO se interpreta como modo offline.
  if (error?.response?.status) return false;
  const codigo = String(error?.code || "");
  const mensaje = String(error?.message || "");
  return /ERR_NETWORK|ECONNABORTED|ETIMEDOUT|ENETUNREACH|ENOTFOUND/i.test(codigo) ||
    /network error|network request failed|timeout|timed out|sin conexi[oó]n/i.test(mensaje);
}

export function SapEmployeeProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const email = correoAutenticadoRH(user);
  const identity = user ? `${String(user.id ?? user.oid ?? user.azure_oid ?? "")}|${email}` : "";
  const [sequence, setSequence] = useState(0);
  const [state, setState] = useState(ESTADO_INICIAL);
  const redAnteriorRef = useRef(null);

  const refresh = useCallback(() => setSequence(n => n + 1), []);

  useEffect(() => {
    let live = true;
    if (authLoading) return () => { live = false; };
    if (!user) {
      setState(ESTADO_INICIAL);
      return () => { live = false; };
    }
    if (!email) {
      setState({ ...ESTADO_INICIAL, identity,
        error: "Tu cuenta no proporciono un correo corporativo. Contacta a soporte." });
      return () => { live = false; };
    }

    setState({ ...ESTADO_INICIAL, identity, loading: true });

    // Solo leer una copia que previamente haya sido confirmada por EmployeeSet,
    // pertenezca al correo de la sesion local y tenga una vigencia razonable.
    const recuperarPerfilGuardado = async () => {
      try {
        const copia = await leerPerfilRHCachePorCorreo(email);
        if (!live) return false;
        const empleado = copia?.perfil;
        const guardadoEn = Number(copia?.guardadoEn);
        const fechaValida = antiguedadAceptable(guardadoEn);
        const valido = empleado?.numeroConfirmadoEnSAP === true &&
          /^\d{1,8}$/.test(String(empleado?.personalNumber || "")) &&
          String(empleado?.email || "").trim().toLowerCase() === email && fechaValida;
        if (!valido) {
          // Diagnostico sin exponer correo, nomina ni datos personales.
          if (__DEV__) console.warn("[RRHH][OFFLINE][CACHE] Perfil no recuperable:", {
            existeCopia: !!copia,
            confirmadoSAP: empleado?.numeroConfirmadoEnSAP === true,
            identidadCoincide: String(empleado?.email || "").trim().toLowerCase() === email,
            fechaValida,
            relojAdelantadoRespectoAlGuardado: Number.isFinite(guardadoEn) && guardadoEn > Date.now(),
          });
          return false;
        }

        let estadoOffline = "falta_historial";
        try {
          const turno = obtenerTurnoDelDia(empleado.scheduleDetail, new Date());
          const mes = mesLaboralRH(turno?.fechaJornada || hoyISO(new Date()));
          const copiaMes = await leerHistorialRHCache({
            personalNumber: empleado.personalNumber, email, desde: mes.desde, hasta: mes.hasta,
          });
          if (copiaMes && antiguedadAceptable(copiaMes.guardadoEn)) {
            estadoOffline = "listo";
          }
        } catch (_) {}
        if (!live) return false;
        setState({ identity, loading: false, employee: empleado, error: "",
          origenPerfil: "cache", perfilGuardadoEn: guardadoEn,
          perfilDesactualizado: !copia.reciente, estadoOffline });
        if (__DEV__) console.log("[RRHH][OFFLINE] Perfil guardado recuperado.");
        return true;
      } catch (error) {
        if (__DEV__) console.warn("[RRHH][OFFLINE] No se pudo recuperar el perfil guardado.");
        return false;
      }
    };

    const cargar = async () => {
      try {
        const red = await NetInfo.fetch();
        if (!live) return;
        const sinInternet = red.isConnected === false || red.isInternetReachable === false;
        if (sinInternet) {
          const recuperado = await recuperarPerfilGuardado();
          if (!live) return;
          if (!recuperado) {
            setState({ ...ESTADO_INICIAL, identity,
              error: "Sin internet y sin perfil guardado vigente. Conectate para consultar EmployeeSet al menos una vez." });
          }
          return;
        }

        // Con red, la fuente de verdad sigue siendo EmployeeSet de SAP.
        const empleado = await obtenerEmpleadoRH(email);
        if (!live) return;
        if (!empleado || !empleado.personalNumber ||
            String(empleado.email || "").trim().toLowerCase() !== email) {
          setState({ ...ESTADO_INICIAL, identity,
            error: "No encontramos un empleado asociado a tu correo. Contacta a Recursos Humanos." });
          return;
        }
        if (!/^\d{1,8}$/.test(String(empleado.personalNumber))) {
          setState({ ...ESTADO_INICIAL, identity,
            error: "Tu numero de empleado no esta disponible. Contacta a Recursos Humanos." });
          return;
        }

        // El usuario ve el perfil validado en cuanto responde SAP. La precarga
        // del historial mensual empieza AQUI, al iniciar sesion, sin visitar Historial.
        setState({ identity, loading: false, employee: empleado, error: "",
          origenPerfil: "sap", perfilGuardadoEn: null, perfilDesactualizado: false,
          estadoOffline: "preparando" });

        if (empleado.numeroConfirmadoEnSAP === true) {
          try {
            const guardadoEn = await guardarPerfilRHCache({
              personalNumber: empleado.personalNumber, email, perfil: empleado,
            });
            if (live && __DEV__) console.log("[RRHH][CACHE] Perfil validado guardado correctamente.");
            const turno = obtenerTurnoDelDia(empleado.scheduleDetail, new Date());
            const mes = mesLaboralRH(turno?.fechaJornada || hoyISO(new Date()));
            const params = { personalNumber: empleado.personalNumber, email,
              desde: mes.desde, hasta: mes.hasta };
            // Siempre comprobar el mes con SAP en una sesion ONLINE.
            // La copia de hace 2 minutos no reemplaza una consulta real,
            // especialmente si una marcacion se corrigio/eliminó en QAS.
            const ticketConsulta = iniciarConsultaHistorialRH();
            const consulta = await consultarHistorialRH({
              personalNumber: empleado.personalNumber,
              desde: mes.desde, hasta: mes.hasta,
              scheduleDetail: empleado.scheduleDetail,
            });
            if (!live) return;
            await guardarHistorialRHCache({ ...params,
              jornadas: consulta.jornadas, ticketConsulta });
            if (__DEV__) console.log("[RRHH][CACHE] Historial del mes actualizado desde SAP.");
            if (!live) return;
            setState(anterior => anterior.identity !== identity ? anterior : {
              ...anterior, estadoOffline: "listo", perfilGuardadoEn: guardadoEn,
            });
            if (__DEV__) console.log("[RRHH][OFFLINE] Perfil e historial mensual listos para consulta sin internet.");
          } catch (cacheError) {
            if (!live) return;
            setState(anterior => anterior.identity !== identity ? anterior : {
              ...anterior, estadoOffline: "falta_historial",
            });
            // No bloquear RRHH online si no se logró completar la preparación.
            if (__DEV__) console.warn("[RRHH][OFFLINE] Preparación incompleta:", cacheError?.message || cacheError);
          }
        }
      } catch (error) {
        if (!live) return;
        if (falloDeTransporte(error)) {
          const recuperado = await recuperarPerfilGuardado();
          if (!live || recuperado) return;
        }
        const code = error?.response?.status;
        const mensaje = code === 401
          ? "Tu sesion expiro. Vuelve a iniciar sesion con Microsoft."
          : code === 403
          ? "No tienes autorizacion para consultar tu informacion. Contacta a soporte."
          : "No pudimos consultar tus datos en este momento. Revisa tu conexion e intentalo otra vez.";
        setState({ ...ESTADO_INICIAL, identity, error: mensaje });
      }
    };
    cargar();
    return () => { live = false; };
  }, [authLoading, user, identity, email, sequence]);

  // Actualizar el origen del perfil al perder o recuperar la conexion,
  // una sola vez por transicion de red.
  // La primera notificacion de NetInfo solo establece el estado inicial.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(red => {
      const online = red.isConnected === true && red.isInternetReachable !== false;
      const redAnterior = redAnteriorRef.current;
      const cuentaActual = state.identity === identity;
      // Al desconectar NO vaciar el perfil validado en esta misma sesion.
      // Antes se llamaba refresh(), se ponia employee=null y una fecha del
      // emulador movida hacia atras podia dejar toda RRHH sin perfil.
      if (redAnterior === true && !online && cuentaActual &&
          state.origenPerfil === "sap") {
        if (state.employee?.numeroConfirmadoEnSAP === true &&
            String(state.employee.email || "").trim().toLowerCase() === email) {
          setState(actual => actual.identity !== identity || !actual.employee ? actual : {
            ...actual, origenPerfil: "cache", loading: false,
            // No declarar la precarga lista cuando aun estaba preparandose.
            estadoOffline: actual.estadoOffline === "listo" ? "listo" : "falta_historial",
          });
          if (__DEV__) console.log("[RRHH][OFFLINE] Sesion activa: perfil validado conservado al desconectar.");
        } else {
          refresh(); // Intentar leer la copia de SQLite si aun no habia perfil en memoria.
        }
      }
      // Al recuperar internet, actualizar el perfil cacheado desde SAP.
      if (redAnterior === false && online && cuentaActual &&
          state.origenPerfil === "cache") {
        refresh();
      }
      redAnteriorRef.current = online;
    });
    return () => unsubscribe();
  }, [identity, email, state.identity, state.employee, state.origenPerfil, refresh]);

  // Nunca reutilizar el perfil del usuario anterior al cambiar de cuenta.
  const matched = Boolean(user && state.identity === identity);
  const loading = authLoading || (Boolean(user) && (!matched || state.loading));
  const employee = matched && !state.loading ? state.employee : null;
  const error = matched && !state.loading ? state.error : "";
  const origenPerfil = matched && !state.loading ? state.origenPerfil : null;
  const perfilGuardadoEn = matched && !state.loading ? state.perfilGuardadoEn : null;
  const perfilDesactualizado = matched && !state.loading ? state.perfilDesactualizado : false;
  const estadoOffline = matched && !state.loading ? state.estadoOffline : "desconocido";

  const value = useMemo(() => ({
    employee, email, loading, error, refresh,
    origenPerfil, perfilGuardadoEn, perfilDesactualizado, estadoOffline,
  }), [employee, email, loading, error, refresh,
    origenPerfil, perfilGuardadoEn, perfilDesactualizado, estadoOffline]);

  return <SapEmployeeContext.Provider value={value}>{children}</SapEmployeeContext.Provider>;
}

export function useSapEmployee() {
  const ctx = useContext(SapEmployeeContext);
  if (!ctx) throw Error("useSapEmployee requiere SapEmployeeProvider.");
  return ctx;
}

export default SapEmployeeProvider;