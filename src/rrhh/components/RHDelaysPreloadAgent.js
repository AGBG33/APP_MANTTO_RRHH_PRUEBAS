// src/rrhh/components/RHDelaysPreloadAgent.js
// Obtiene y conserva el total mensual cuando se valida el perfil SAP con internet.
// No realiza POST, no bloquea el login y nunca consulta datos de otra identidad.
import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useSapEmployee } from "../../context/SapEmployeeContext";
import { obtenerTurnoDelDia, hoyISO } from "../../services/rhPolicies";
import { consultarRetardosRH } from "../../services/rhDelays";
import { guardarRetardosRHCache } from "../offline/rhDelaysCache";

export default function RHDelaysPreloadAgent() {
  const { employee, email, origenPerfil } = useSapEmployee();
  const numero = String(employee?.personalNumber || "");
  const confirmado = employee?.numeroConfirmadoEnSAP === true;
  useEffect(() => {
    if (!confirmado || origenPerfil !== "sap" || !numero || !email) return;
    let vivo = true;
    (async () => {
      try {
        const red = await NetInfo.fetch();
        if (!vivo || red.isConnected !== true || red.isInternetReachable === false) return;
        const fechaJornada = obtenerTurnoDelDia(employee.scheduleDetail, new Date()).fechaJornada || hoyISO();
        const resumen = await consultarRetardosRH({ personalNumber: numero, fechaJornada });
        if (!vivo) return;
        await guardarRetardosRHCache({ personalNumber: numero, email, fechaJornada, resumen });
        if (__DEV__) console.log("[RRHH][RETARDOS] Conteo mensual precargado.");
      } catch (error) {
        if (__DEV__) console.warn("[RRHH][RETARDOS] No se logró precargar el conteo mensual:", error?.message);
      }
    })();
    return () => { vivo = false; };
  }, [confirmado, origenPerfil, numero, email, employee?.scheduleDetail]);
  return null;
}