// src/context/SapEmployeeContext.js
// PASO 4 - Perfil RRHH online + recuperacion de cache SOLO PARA CONSULTA.
// No modifica autenticacion, servicios de mantenimiento ni POST de asistencia.
// Las marcaciones requieren todavia la verificacion online actual de SAP.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "./AuthContext";
import { obtenerEmpleadoRH } from "../services/rhEmployees";
import { guardarPerfilRHCache, leerPerfilRHCachePorCorreo } from "../rrhh/offline/rhOfflineDb";

const SapEmployeeContext = createContext(null);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Coincide con el maximo de sesion local de AuthContext (15 dias).
// Durante ese periodo la cache solo se muestra; NO autoriza enviar marcaciones.
const MAX_LECTURA_OFFLINE_MS = 15 * 24 * 60 * 60 * 1000;
const ESTADO_INICIAL = {
  identity: "", loading: false, employee: null, error: "",
  origenPerfil: null, perfilGuardadoEn: null, perfilDesactualizado: false,
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
        const antiguedad = Date.now() - guardadoEn;
        const valido = empleado?.numeroConfirmadoEnSAP === true &&
          /^\d{1,8}$/.test(String(empleado?.personalNumber || "")) &&
          String(empleado?.email || "").trim().toLowerCase() === email &&
          Number.isFinite(guardadoEn) && antiguedad >= 0 &&
          antiguedad <= MAX_LECTURA_OFFLINE_MS;
        if (!valido) return false;

        setState({ identity, loading: false, employee: empleado, error: "",
          origenPerfil: "cache", perfilGuardadoEn: guardadoEn,
          perfilDesactualizado: !copia.reciente });
        if (__DEV__) console.log("[RRHH][OFFLINE] Perfil guardado recuperado (solo lectura).");
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

        setState({ identity, loading: false, employee: empleado, error: "",
          origenPerfil: "sap", perfilGuardadoEn: null, perfilDesactualizado: false });

        // Fallas de SQLite nunca bloquean RRHH online.
        if (empleado.numeroConfirmadoEnSAP === true) {
          guardarPerfilRHCache({ personalNumber: empleado.personalNumber, email, perfil: empleado })
            .then(() => {
              if (live && __DEV__) console.log("[RRHH][CACHE] Perfil validado guardado correctamente.");
            })
            .catch(() => console.warn("[RRHH][CACHE] No se pudo guardar el perfil validado."));
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
      // Al perder internet, mostrar la copia guardada en vez de dejar
      // el perfil anterior con apariencia de informacion online actual.
      if (redAnterior === true && !online && cuentaActual &&
          state.origenPerfil === "sap") {
        refresh();
      }
      // Al recuperar internet, actualizar el perfil cacheado desde SAP.
      if (redAnterior === false && online && cuentaActual &&
          state.origenPerfil === "cache") {
        refresh();
      }
      redAnteriorRef.current = online;
    });
    return () => unsubscribe();
  }, [identity, state.identity, state.origenPerfil, refresh]);

  // Nunca reutilizar el perfil del usuario anterior al cambiar de cuenta.
  const matched = Boolean(user && state.identity === identity);
  const loading = authLoading || (Boolean(user) && (!matched || state.loading));
  const employee = matched && !state.loading ? state.employee : null;
  const error = matched && !state.loading ? state.error : "";
  const origenPerfil = matched && !state.loading ? state.origenPerfil : null;
  const perfilGuardadoEn = matched && !state.loading ? state.perfilGuardadoEn : null;
  const perfilDesactualizado = matched && !state.loading ? state.perfilDesactualizado : false;

  const value = useMemo(() => ({
    employee, email, loading, error, refresh,
    origenPerfil, perfilGuardadoEn, perfilDesactualizado,
  }), [employee, email, loading, error, refresh,
    origenPerfil, perfilGuardadoEn, perfilDesactualizado]);

  return <SapEmployeeContext.Provider value={value}>{children}</SapEmployeeContext.Provider>;
}

export function useSapEmployee() {
  const ctx = useContext(SapEmployeeContext);
  if (!ctx) throw Error("useSapEmployee requiere SapEmployeeProvider.");
  return ctx;
}

export default SapEmployeeProvider;