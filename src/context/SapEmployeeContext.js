// Perfil de SAP vinculado al correo de la cuenta autenticada con Microsoft.
// No se pide una contraseña adicional, ni se acepta una nómina escrita manualmente.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { obtenerEmpleadoRH } from "../services/rhEmployees";

const SapEmployeeContext = createContext(null);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Los nombres concretos de /api/auth/me pueden variar entre backends.
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

export function SapEmployeeProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const email = correoAutenticadoRH(user);
  const identity = user ? `${String(user.id ?? user.oid ?? user.azure_oid ?? "")}|${email}` : "";
  const [sequence, setSequence] = useState(0);
  const [state, setState] = useState({ identity: "", loading: false, employee: null, error: "" });

  const refresh = useCallback(() => setSequence(n => n + 1), []);

  useEffect(() => {
    let live = true;
    if (authLoading) return () => { live = false; };
    if (!user) {
      setState({ identity: "", loading: false, employee: null, error: "" });
      return () => { live = false; };
    }
    if (!email) {
      setState({ identity, loading: false, employee: null,
        error: "Tu cuenta no proporcionó un correo corporativo. Contacta a soporte." });
      return () => { live = false; };
    }

    setState({ identity, loading: true, employee: null, error: "" });
    // Se consulta EmployeeSet exclusivamente con el correo devuelto por /api/auth/me.
    obtenerEmpleadoRH(email)
      .then(empleado => {
        if (!live) return;
        if (!empleado || !empleado.personalNumber ||
            String(empleado.email || "").trim().toLowerCase() !== email) {
          setState({ identity, loading: false, employee: null,
            error: "No encontramos un empleado asociado a tu correo. Contacta a Recursos Humanos." });
          return;
        }
        if (!/^\d{1,8}$/.test(String(empleado.personalNumber))) {
          setState({ identity, loading: false, employee: null,
            error: "Tu número de empleado no está disponible. Contacta a Recursos Humanos." });
          return;
        }
        setState({ identity, loading: false, employee: empleado, error: "" });
      })
      .catch(err => {
        if (!live) return;
        // Mensajes sin detalles técnicos de BTP, OData o SAP.
        const code = err?.response?.status;
        const mensaje = code === 401
          ? "Tu sesión expiró. Vuelve a iniciar sesión con Microsoft."
          : code === 403
          ? "No tienes autorización para consultar tu información. Contacta a soporte."
          : "No pudimos consultar tus datos en este momento. Revisa tu conexión e inténtalo otra vez.";
        setState({ identity, loading: false, employee: null, error: mensaje });
      });
    return () => { live = false; };
  }, [authLoading, user, identity, email, sequence]);

  // Nunca reutilizar el perfil de un usuario anterior durante un cambio de cuenta.
  const matched = Boolean(user && state.identity === identity);
  const loading = authLoading || (Boolean(user) && (!matched || state.loading));
  const employee = matched && !state.loading ? state.employee : null;
  const error = matched && !state.loading ? state.error : "";

  const value = useMemo(() => ({ employee, email, loading, error, refresh }),
    [employee, email, loading, error, refresh]);
  return <SapEmployeeContext.Provider value={value}>{children}</SapEmployeeContext.Provider>;
}

export function useSapEmployee() {
  const ctx = useContext(SapEmployeeContext);
  if (!ctx) throw Error("useSapEmployee requiere SapEmployeeProvider.");
  return ctx;
}

// Exportacion por defecto para importar el Provider directamente en RootLayout.
export default SapEmployeeProvider;