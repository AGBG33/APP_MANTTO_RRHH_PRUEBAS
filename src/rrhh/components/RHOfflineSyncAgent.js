// src/rrhh/components/RHOfflineSyncAgent.js
// Agente RRHH independiente: sincroniza al recuperar red, volver a foreground
// y cada 60 s mientras la app esta abierta. No ejecuta trabajo en segundo plano
// garantizado con la app terminada (restriccion de Android/iOS).
import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../../context/AuthContext";
import { useSapEmployee } from "../../context/SapEmployeeContext";
import { sincronizarPendientesRH } from "../offline/rhOfflineSync";

export default function RHOfflineSyncAgent() {
  const { user, loading: authLoading, ensureValidToken } = useAuth();
  const { employee, email, loading: perfilLoading, origenPerfil } = useSapEmployee();
  const asegurarTokenRef = useRef(ensureValidToken);
  asegurarTokenRef.current = ensureValidToken;
  const numero = String(employee?.personalNumber ?? "").trim();
  const correo = String(email ?? "").trim().toLowerCase();
  const identidadValida = !!user && !authLoading && !perfilLoading &&
    origenPerfil === "sap" && /^\d{1,8}$/.test(numero) &&
    String(employee?.email ?? "").trim().toLowerCase() === correo;

  useEffect(() => {
    if (!identidadValida) return undefined;
    let activo = true;
    let previo = false;
    let ocupado = false;
    const ejecutar = async () => {
      if (!activo || ocupado || AppState.currentState !== "active") return;
      ocupado = true;
      try {
        await sincronizarPendientesRH({
          personalNumber: numero, email: correo, ensureValidToken: () => asegurarTokenRef.current(),
          shouldContinue: () => activo,
        });
      } catch (e) {
        if (__DEV__) console.warn("[RRHH][SYNC] Error controlado:", e?.message || e);
      } finally { ocupado = false; }
    };
    // Se dispara una vez al montar, sin esperar 60 segundos.
    ejecutar();
    const red = NetInfo.addEventListener(st => {
      const online = st.isConnected === true && st.isInternetReachable !== false;
      if (online && !previo) ejecutar();
      previo = online;
    });
    const app = AppState.addEventListener("change", st => {
      if (st === "active") ejecutar();
    });
    const timer = setInterval(ejecutar, 60000);
    return () => {
      activo = false;
      red?.();
      app?.remove?.();
      clearInterval(timer);
    };
  }, [identidadValida, numero, correo]);
  return null;
}