// Autorizacion de modulos desde SAP. Un proveedor, una consulta por sesion/perfil.
// Offline: solo reutiliza una autorizacion exitosa anterior, ligada a identidad,
// area y puesto, con vigencia maxima de 24 horas. Sin cache valido: sin acceso.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../../core/auth/index";
import { correoAutenticadoRH } from "../../core/employee/identity";
import { useSapEmployee } from "../../apps/rrhh/context/SapEmployeeContext";
import { consultarModulosAutorizadosSAP } from "./sapModuleCatalogService";

const Context = createContext(null);
const CACHE_KEY = "sap:module-authorizations:v1";
const CACHE_MAX_MS = 24 * 60 * 60 * 1000;
const inicial = { key: "", loading: false, moduleCodes: [], error: "", source: null };
const texto = x => String(x ?? "").trim();

export function identidadAccesoSAP(user, employee) {
  const correo = correoAutenticadoRH(user);
  if (!user || !correo || employee?.numeroConfirmadoEnSAP !== true ||
      texto(employee?.email).toLowerCase() !== correo) return "";
  const nomina = texto(employee?.personalNumber);
  const area = texto(employee?.personalArea);
  const puesto = texto(employee?.positionCode);
  if (!nomina || !area || !puesto) return "";
  return JSON.stringify([correo, nomina, area, puesto, texto(user?.id ?? user?.oid ?? user?.azure_oid)]);
}

async function leerCache(key) {
  try {
    const crudo = await AsyncStorage.getItem(CACHE_KEY);
    if (!crudo) return null;
    const dato = JSON.parse(crudo);
    const edad = Date.now() - Number(dato?.verifiedAt);
    if (dato?.key !== key || !Number.isFinite(edad) || edad < 0 || edad > CACHE_MAX_MS ||
        !Array.isArray(dato?.moduleCodes)) return null;
    // Solo codigos de modulos definidos en la app, no valores arbitrarios del cache.
    const permitidos = new Set(["Z001", "Z002"]);
    if (dato.moduleCodes.some(x => !permitidos.has(x))) return null;
    return dato.moduleCodes;
  } catch (_) { return null; }
}

function esFalloDeRed(error) {
  if (error?.response?.status) return false; // 401, 403, 500, etc.: nunca usar cache
  return /network|timeout|timed out|ECONNABORTED|ENETUNREACH|ERR_NETWORK|fetch failed/i.test(
    String(error?.code ?? "") + " " + String(error?.message ?? ""));
}

export function SapModuleAccessProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { employee, loading: employeeLoading } = useSapEmployee();
  const key = identidadAccesoSAP(user, employee);
  const [state, setState] = useState(inicial);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(x => x + 1), []);

  useEffect(() => {
    let activo = true;
    if (authLoading || employeeLoading) return () => { activo = false; };
    if (!user) { setState(inicial); return () => { activo = false; }; }
    if (!key) {
      setState({ key: "", loading: false, moduleCodes: [],
        error: "No se pudo validar area y codigo de puesto desde EmployeeSet.", source: null });
      return () => { activo = false; };
    }
    setState({ key, loading: true, moduleCodes: [], error: "", source: null });
    (async () => {
      try {
        const red = await NetInfo.fetch();
        const sinRed = red?.isConnected === false || red?.isInternetReachable === false;
        if (sinRed) {
          const codes = await leerCache(key);
          if (!activo) return;
          setState(codes
            ? { key, loading: false, moduleCodes: codes, error: "", source: "cache" }
            : { key, loading: false, moduleCodes: [], error: "Sin internet y sin permisos SAP guardados vigentes.", source: null });
          return;
        }
        const codes = await consultarModulosAutorizadosSAP(employee);
        if (!activo) return;
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ key, verifiedAt: Date.now(), moduleCodes: codes }));
        } catch (_) { /* Sin cache, los permisos online siguen siendo validos. */ }
        if (activo) setState({ key, loading: false, moduleCodes: codes, error: "", source: "sap" });
      } catch (error) {
        if (!activo) return;
        const codes = esFalloDeRed(error) ? await leerCache(key) : null;
        if (!activo) return;
        setState(codes
          ? { key, loading: false, moduleCodes: codes, error: "", source: "cache" }
          : { key, loading: false, moduleCodes: [], error: "No fue posible validar los modulos autorizados en SAP.", source: null });
        if (__DEV__) console.warn("[SAP][MODULOS] Validacion sin autorizacion:", error?.message ?? error);
      }
    })();
    return () => { activo = false; };
  }, [authLoading, employeeLoading, user ? key : "", revision]);

  // Impide reutilizar, incluso por un frame, permisos de un empleado anterior.
  const actual = state.key === key && Boolean(key);
  const value = useMemo(() => ({
    loading: Boolean(user) && (authLoading || employeeLoading || (Boolean(key) && !actual) || (actual && state.loading)),
    moduleCodes: actual ? state.moduleCodes : [],
    error: !authLoading && !employeeLoading && user && !key
      ? "El empleado no tiene codigos validos de area y puesto en SAP."
      : actual ? state.error : "",
    source: actual ? state.source : null,
    refresh,
  }), [user, authLoading, employeeLoading, key, actual, state, refresh]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSapModuleAccess() {
  const value = useContext(Context);
  if (!value) throw new Error("useSapModuleAccess requiere SapModuleAccessProvider");
  return value;
}
