
 // Agente RRHH independiente del motor de asistencia y de la cola SAP.
 // Opera solo cuando React Native está activo; los avisos ya programados los
 // dispara Android/iOS sin ejecutar JS, sin red y con la app cerrada.
 import React, { useEffect, useRef } from 'react';
 import { AppState } from 'react-native';
 import * as Notifications from 'expo-notifications';
 import { useAuth } from '../../context/AuthContext';
 import { useSapEmployee, correoAutenticadoRH } from '../../context/SapEmployeeContext';
 import {
   registrarSesionRecordatoriosRH,
   limpiarRecordatoriosDeOtraCuentaRH,
   cancelarTodosLosRecordatoriosRH,
   sincronizarRecordatoriosRH,
 } from '../notifications/rhReminderScheduler';

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

   // Al regresar a primer plano, reconciliar horarios y checks disponibles en
   // la copia SAP. Este listener NO mantiene viva la app en background.
   useEffect(() => {
     const subscripcion = AppState.addEventListener('change', estado => {
       if (estado !== 'active' || !ref.current.valido) return;
       const r = ref.current;
       sincronizarRecordatoriosRH({ empleado: r.employee, email: r.email,
         origenPerfil: r.origenPerfil, cacheReciente: r.cacheReciente,
       }).catch(() => {});
     });
     return () => subscripcion.remove();
   }, []);
   return null;
 }
