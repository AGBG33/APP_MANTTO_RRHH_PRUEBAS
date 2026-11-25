
import React, { useEffect, useRef } from "react";

import {
  AppState,
  DeviceEventEmitter,
} from "react-native";

import * as Notifications from "expo-notifications";

import { useAuth } from "../../../core/auth";

import {
  useSapEmployee,
  correoAutenticadoRH,
} from "../context/SapEmployeeContext";

import {
  registrarSesionRecordatoriosRH,
  limpiarRecordatoriosDeOtraCuentaRH,
  cancelarTodosLosRecordatoriosRH,
  sincronizarRecordatoriosRH,
} from "../notifications/rhReminderScheduler";

// En SDK 54 es necesario configurar el handler para ver avisos en foreground.
// No toma decisiones sobre asistencia, solo visualiza las notificaciones.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RHReminderAgent() {
  const { user, loading: authLoading } = useAuth();
  const { employee, email, loading: perfilLoading, origenPerfil,
    perfilDesactualizado, estadoOffline } = useSapEmployee();
  const cuentaAutenticada = correoAutenticadoRH(user);
  const emailNormal = String(email || '').trim().toLowerCase();
  const valido = !authLoading && !perfilLoading && !!cuentaAutenticada &&
    !!employee && employee.numeroConfirmadoEnSAP === true &&
    emailNormal === cuentaAutenticada &&
    String(employee.email || '').trim().toLowerCase() === cuentaAutenticada;
  const ref = useRef({ valido: false });
  ref.current = { valido, employee, email: cuentaAutenticada, origenPerfil,
    cacheReciente: !perfilDesactualizado };

  // Cuenta Microsoft primero. Al cambiarla se invalidan tareas previas y se
  // eliminan las notificaciones que pudieran pertenecer a otra persona.
  useEffect(() => {
    if (authLoading) return;
    registrarSesionRecordatoriosRH(cuentaAutenticada);
    const promesa = cuentaAutenticada
      ? limpiarRecordatoriosDeOtraCuentaRH(cuentaAutenticada)
      : cancelarTodosLosRecordatoriosRH();
    promesa.catch(e => {
      if (__DEV__) console.warn('[RRHH][AVISOS] Limpieza al cambiar sesión:', e?.message);
    });
  }, [authLoading, cuentaAutenticada]);

  // Programar SOLO después de que EmployeeSet confirmó identidad y horario.
  // Si hay caché reciente (<24h) se permite recuperar las alarmas sin internet.
  useEffect(() => {
    if (!valido) return;
    sincronizarRecordatoriosRH({ empleado: employee,
      email: cuentaAutenticada, origenPerfil,
      cacheReciente: !perfilDesactualizado,
    }).catch(e => {
      if (__DEV__) console.warn('[RRHH][AVISOS] No se pudo programar:', e?.message);
    });
  }, [valido, employee, cuentaAutenticada, origenPerfil,
    perfilDesactualizado, estadoOffline]);

  // Cada check almacenado en asistencia.js dispara el evento 'rh:check-actualizado'.
  // Se releen los registros reales y se cancelan de inmediato los avisos sobrantes.
  // También se comprueban mientras la app está abierta cada minuto, útil si el
  // historial/cola se actualizó por sincronización fuera de la pantalla RRHH.
  // El intervalo NO genera avisos: solo reconcilia un plan de fechas FINITAS.
  useEffect(() => {
    const actualizar = () => {
      if (AppState.currentState !== 'active' || !ref.current.valido) return;
      const r = ref.current;
      sincronizarRecordatoriosRH({ empleado: r.employee, email: r.email,
        origenPerfil: r.origenPerfil, cacheReciente: r.cacheReciente,
      }).catch(e => {
        if (__DEV__) console.warn('[RRHH][AVISOS] No se pudo actualizar:', e?.message);
      });
    };
    const aplicacion = AppState.addEventListener('change', estado => {
      if (estado === 'active') actualizar();
    });
    const marcaciones = DeviceEventEmitter.addListener('rh:check-actualizado', actualizar);
    const intervalo = setInterval(actualizar, 60 * 1000);
    return () => {
      aplicacion.remove();
      marcaciones.remove();
      clearInterval(intervalo);
    };
  }, []);
  return null;
}