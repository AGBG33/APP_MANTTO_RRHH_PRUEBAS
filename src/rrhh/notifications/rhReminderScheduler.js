
 // RRHH: programación nativa de notificaciones LOCALES (sin push/SAP/BTP).
 // Programación finita: 7 días, para no conservar indefinidamente un horario viejo.
 // NO modifica AttendanceRecordSet, ProcessingDelaysSet ni ninguna cola.
 import AsyncStorage from '@react-native-async-storage/async-storage';
 import { Platform } from 'react-native';
 import * as Notifications from 'expo-notifications';
 import { clasificarEmpleadoRH } from '../../services/rhPolicies';
 import { mesLaboralRH } from '../../services/rhBusinessRules';
 import { leerHistorialRHCache } from '../offline/rhOfflineDb';
 import { listarMarcacionesPendientesRH } from '../offline/rhPendingDb';
 import { leerCuartoRetardoRH } from '../offline/rhDelaysCache';
 import { crearPlanRecordatoriosRH, RH_DIAS_PROGRAMADOS } from './rhReminderPlan';

 const MARCA = 'rh-asistencia-local-v1';
 const CANAL = 'rh-asistencia-recordatorios-v1';
 const PREFIJO_PREF = 'rh:recordatorios:preferencia:v1:';
 const ULTIMO_DUENO = 'rh:recordatorios:ultimo-dueno:v1';
 const CAMPO_TIPO = Object.freeze({ P10: 'p10Time', P15: 'p15Time', P25: 'p25Time', P20: 'p20Time' });
 const NO_LABORABLE = new Set(['AUSENTE', 'INASISTENCIA', 'FALTA']);
 const pad = x => String(x).padStart(2, '0');
 const normMail = x => String(x ?? '').trim().toLowerCase();
 const num = x => String(x ?? '').trim();
 let secuencia = Promise.resolve();
 let correoSesion = '';
 let generacionSesion = 0;

 function encolar(fn) {
   const tarea = secuencia.catch(() => {}).then(fn);
   secuencia = tarea.catch(() => {});
   return tarea;
 }

 export function identidadRecordatoriosRH(empleado, email) {
   const numero = num(empleado?.personalNumber);
   const correo = normMail(email);
   if (!/^[0-9]{1,8}$/.test(numero) ||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
       empleado?.numeroConfirmadoEnSAP !== true ||
       normMail(empleado?.email) !== correo) return '';
   return `${numero.padStart(8, '0')}|${correo}`;
 }

 // Llamado en cada cambio real de cuenta Microsoft. Invalida operaciones viejas,
 // incluso si la solicitud de permisos quedó abierta al cerrar sesión.
 export function registrarSesionRecordatoriosRH(correoAutenticado) {
   const nuevo = normMail(correoAutenticado);
   if (nuevo !== correoSesion) {
     correoSesion = nuevo;
     generacionSesion++;
   }
   return generacionSesion;
 }

 const permitidoParaSesion = (identidad, generacion) =>
   !!identidad && identidad.endsWith(`|${correoSesion}`) &&
   generacion === generacionSesion;

 async function borrarSoloRRHH() {
   const existentes = await Notifications.getAllScheduledNotificationsAsync();
   const propios = existentes.filter(n => n.content?.data?.rhFuente === MARCA);
   for (const item of propios) {
     await Notifications.cancelScheduledNotificationAsync(item.identifier);
   }
   return propios.length;
 }

 // Al entrar otra cuenta, eliminar cualquier recordatorio de un empleado anterior.
 // En la cuenta correcta, conservar los eventos ya programados mientras carga SAP.
 export function limpiarRecordatoriosDeOtraCuentaRH(correoAutenticado) {
   const correo = normMail(correoAutenticado);
   return encolar(async () => {
     const dueño = await AsyncStorage.getItem(ULTIMO_DUENO);
     if (dueño && (!correo || !dueño.endsWith(`|${correo}`))) {
       const cancelados = await borrarSoloRRHH();
       await AsyncStorage.removeItem(ULTIMO_DUENO);
       return { cancelados };
     }
     // Si el dueño no está guardado, limpiar huérfanos etiquetados de otras cuentas.
     if (!dueño) {
       const avisos = await Notifications.getAllScheduledNotificationsAsync();
       for (const aviso of avisos) {
         if (aviso.content?.data?.rhFuente === MARCA &&
             (!correo || !String(aviso.content.data.propietario || '').endsWith(`|${correo}`))) {
           await Notifications.cancelScheduledNotificationAsync(aviso.identifier);
         }
       }
     }
     return { cancelados: 0 };
   });
 }

 export function cancelarTodosLosRecordatoriosRH() {
   return encolar(async () => {
     const cancelados = await borrarSoloRRHH();
     await AsyncStorage.removeItem(ULTIMO_DUENO);
     return { cancelados };
   });
 }

 export async function consultarPreferenciaRecordatoriosRH(empleado, email) {
   const identidad = identidadRecordatoriosRH(empleado, email);
   return !!identidad && (await AsyncStorage.getItem(PREFIJO_PREF + identidad)) === '1';
 }

 async function prepararCanalYPermisos(pedirPermiso) {
   if (Platform.OS === 'android') {
     await Notifications.setNotificationChannelAsync(CANAL, {
       name: 'Recordatorios de asistencia RRHH',
       importance: Notifications.AndroidImportance.HIGH,
       sound: 'default',
       vibrationPattern: [0, 250, 150, 250],
       lightColor: '#D71920',
     });
   }
   let permiso = await Notifications.getPermissionsAsync();
   if (!permiso.granted && pedirPermiso && permiso.canAskAgain !== false) {
     permiso = await Notifications.requestPermissionsAsync();
   }
   return permiso.granted ||
     (Platform.OS === 'ios' && permiso.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
 }

 async function obtenerChecksGuardados(empleado, email, ahora) {
   const marcacionesExistentes = new Set();
   const diasNoLaborablesSAP = new Set();
   const diasSoloEntrada = new Set();
   const desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 12);
   const meses = new Map();
   for (let i = 0; i < RH_DIAS_PROGRAMADOS; i++) {
     const fecha = new Date(desde);
     fecha.setDate(fecha.getDate() + i);
     const mes = mesLaboralRH(`${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`);
     meses.set(mes.desde, mes);
   }
   // Una respuesta de SAP guardada (no un simple HTTP 2xx) permite omitir
   // recordatorios correspondientes a checks que ya constan en historial.
   for (const mes of meses.values()) {
     try {
       const copia = await leerHistorialRHCache({
         personalNumber: empleado.personalNumber, email,
         desde: mes.desde, hasta: mes.hasta,
       });
       for (const dia of (copia?.jornadas || [])) {
         if (NO_LABORABLE.has(String(dia.dayStatus || '').trim().toUpperCase())) {
           diasNoLaborablesSAP.add(dia.date);
         }
         for (const [tipo, campo] of Object.entries(CAMPO_TIPO)) {
           const hora = String(dia[campo] || '');
           if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(hora) && hora !== '00:00:00') {
             marcacionesExistentes.add(`${dia.date}|${tipo}`);
           }
         }
       }
     } catch (error) {
       if (__DEV__) console.warn('[RRHH][AVISOS] Caché de historial no disponible:', error?.message);
     }
   }
   // Viaje seleccionado en la pantalla de asistencia: solo P10 durante
   // su período, aunque EmployeeSet todavía no indique RelationJob 04.
   // El cuarto retardo durable bloquea los avisos de otros checks de ese día.
   const viajes = [];
   for (let i = 0; i < RH_DIAS_PROGRAMADOS; i++) {
     const fecha = new Date(desde);
     fecha.setDate(fecha.getDate() + i);
     const dia = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
     try {
       const raw = await AsyncStorage.getItem(`rh:modalidad:q4:${num(empleado.personalNumber).padStart(8, '0')}:${dia}`);
       const modalidad = raw ? JSON.parse(raw) : null;
       if (modalidad?.modalidad === 'Viaje de negocios') {
         if (modalidad.desde && modalidad.hasta && modalidad.desde <= modalidad.hasta) {
           viajes.push({ desde: modalidad.desde, hasta: modalidad.hasta });
         } else {
           diasSoloEntrada.add(dia);
         }
       }
     } catch (_) { diasNoLaborablesSAP.add(dia); /* Fallar cerrado ante modalidad corrupta. */ }
     try {
       const bloqueo = await leerCuartoRetardoRH({
         personalNumber: empleado.personalNumber, email, fechaJornada: dia,
       });
       if (bloqueo?.cuartoRetardo) diasNoLaborablesSAP.add(dia);
     } catch (e) {
       diasNoLaborablesSAP.add(dia); // Sin certeza sobre el bloqueo, no notificar.
       if (__DEV__) console.warn('[RRHH][AVISOS] No se pudo revisar cuarto retardo:', e?.message);
     }
   }
   for (let i = 0; i < RH_DIAS_PROGRAMADOS; i++) {
     const fecha = new Date(desde);
     fecha.setDate(fecha.getDate() + i);
     const dia = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
     if (viajes.some(v => v.desde <= dia && dia <= v.hasta)) diasSoloEntrada.add(dia);
   }

   try {
     const pendientes = await listarMarcacionesPendientesRH({ personalNumber: empleado.personalNumber, email });
     for (const p of pendientes) {
       if (CAMPO_TIPO[p.tipo] &&
           ['pendiente', 'enviando', 'incierto', 'confirmado', 'revision'].includes(p.estado)) {
         marcacionesExistentes.add(`${p.fechaJornada}|${p.tipo}`);
       }
     }
   } catch (error) {
     if (__DEV__) console.warn('[RRHH][AVISOS] Cola local no disponible:', error?.message);
   }
   return { marcacionesExistentes, diasNoLaborablesSAP, diasSoloEntrada };
 }

 async function programarParaIdentidad({ empleado, email, identidad, generacion, origenPerfil, cacheReciente }) {
   // Un perfil offline desactualizado no debe GENERAR nuevas alarmas.
   // Las que ya estaban registradas en Android siguen durante sus 7 días.
   if (origenPerfil !== 'sap' && !(origenPerfil === 'cache' && cacheReciente)) {
     const anterior = await AsyncStorage.getItem(ULTIMO_DUENO);
     if (anterior && anterior !== identidad) await borrarSoloRRHH();
     return { programados: 0, motivo: 'perfil_sin_confirmacion_reciente' };
   }
   const p = clasificarEmpleadoRH(empleado);
   if (!p.habilitado) {
     await borrarSoloRRHH();
     await AsyncStorage.removeItem(ULTIMO_DUENO);
     return { programados: 0, motivo: 'marcaje_no_habilitado' };
   }
   const tienePermiso = await prepararCanalYPermisos(false);
   if (!tienePermiso) {
     await borrarSoloRRHH();
     return { programados: 0, motivo: 'permiso_no_concedido' };
   }
   if (!permitidoParaSesion(identidad, generacion)) return { programados: 0, motivo: 'sesion_cambio' };
   const ahora = new Date();
   const { marcacionesExistentes, diasNoLaborablesSAP, diasSoloEntrada } =
     await obtenerChecksGuardados(empleado, email, ahora);
   if (!permitidoParaSesion(identidad, generacion)) return { programados: 0, motivo: 'sesion_cambio' };
   const plan = crearPlanRecordatoriosRH({ empleado, ahora, marcacionesExistentes, diasNoLaborablesSAP, diasSoloEntrada });
   // Actualización diferencial. Conserva cada aviso que ya tiene fecha, tipo,
   // propietario y mensaje correctos: no interrumpir una alarma próxima.
   const existentes = (await Notifications.getAllScheduledNotificationsAsync())
     .filter(n => n.content?.data?.rhFuente === MARCA);
   const porClave = new Map();
   for (const aviso of existentes) {
     const d = aviso.content?.data || {};
     if (d.propietario !== identidad) {
       await Notifications.cancelScheduledNotificationAsync(aviso.identifier);
       continue;
     }
     if (d.esPrueba === true) continue; // La prueba de 60 s es independiente.
     const clave = String(d.clavePlan || '');
     if (!porClave.has(clave)) porClave.set(clave, []);
     porClave.get(clave).push(aviso);
   }
   const deseados = new Set();
   let agregados = 0;
   for (const evento of plan) {
     if (!permitidoParaSesion(identidad, generacion)) {
       await borrarSoloRRHH();
       return { programados: 0, motivo: 'sesion_cambio' };
     }
     const clave = `${evento.fechaJornada}|${evento.tipo}|${evento.cuando.getTime()}`;
     deseados.add(clave);
     const iguales = porClave.get(clave) || [];
     const correcto = iguales.find(n => n.content?.title === evento.titulo &&
       n.content?.body === evento.mensaje);
     if (correcto) {
       // El resto de los avisos para la misma clave son duplicados/obsoletos.
       for (const n of iguales) if (n.identifier !== correcto.identifier) {
         await Notifications.cancelScheduledNotificationAsync(n.identifier);
       }
     } else {
       // Programar primero el nuevo y después retirar el antiguo.
       await Notifications.scheduleNotificationAsync({
         content: {
           title: evento.titulo, body: evento.mensaje, sound: 'default',
           data: { rhFuente: MARCA, tipo: evento.tipo,
             fechaJornada: evento.fechaJornada, propietario: identidad,
             clavePlan: clave, cuandoMs: evento.cuando.getTime() },
         },
         trigger: {
           type: Notifications.SchedulableTriggerInputTypes.DATE,
           date: evento.cuando,
           ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
         },
       });
       agregados++;
       for (const n of iguales) await Notifications.cancelScheduledNotificationAsync(n.identifier);
     }
   }
   for (const [clave, avisos] of porClave) {
     if (deseados.has(clave)) continue;
     for (const n of avisos) await Notifications.cancelScheduledNotificationAsync(n.identifier);
   }
   if (!permitidoParaSesion(identidad, generacion)) {
     await borrarSoloRRHH();
     return { programados: 0, motivo: 'sesion_cambio' };
   }
   await AsyncStorage.setItem(ULTIMO_DUENO, identidad);
   if (__DEV__) console.log('[RRHH][AVISOS] Plan actualizado:', {
     total: plan.length, nuevos: agregados, identidadValidada: true,
   });
   return { programados: plan.length, nuevos: agregados,
     motivo: plan.length ? 'ok' : 'sin_horarios_futuros' };
 }

 export function sincronizarRecordatoriosRH({ empleado, email, origenPerfil = 'sap', cacheReciente = false } = {}) {
   const identidad = identidadRecordatoriosRH(empleado, email);
   const generacion = generacionSesion;
   return encolar(async () => {
     if (!permitidoParaSesion(identidad, generacion)) {
       return { programados: 0, motivo: 'identidad_no_validada' };
     }
     const anterior = await AsyncStorage.getItem(ULTIMO_DUENO);
     if (anterior && anterior !== identidad) {
       await borrarSoloRRHH();
       await AsyncStorage.removeItem(ULTIMO_DUENO);
     }
     const activado = await consultarPreferenciaRecordatoriosRH(empleado, email);
     if (!activado) {
       await borrarSoloRRHH();
       await AsyncStorage.removeItem(ULTIMO_DUENO);
       return { programados: 0, motivo: 'no_activado' };
     }
     return programarParaIdentidad({ empleado, email, identidad, generacion, origenPerfil, cacheReciente });
   });
 }

 export async function activarRecordatoriosRH({ empleado, email, origenPerfil } = {}) {
   const identidad = identidadRecordatoriosRH(empleado, email);
   if (!identidad || !permitidoParaSesion(identidad, generacionSesion) || origenPerfil !== 'sap') {
     throw Error('Para activar los recordatorios, inicia sesión y valida el perfil en SAP con internet.');
   }
   const generacion = generacionSesion;
   const permiso = await prepararCanalYPermisos(true);
   if (!permiso) throw Error('El teléfono no concedió permiso para mostrar notificaciones.');
   if (!permitidoParaSesion(identidad, generacion)) throw Error('La cuenta cambió mientras se pedía permiso.');
   return encolar(async () => {
     if (!permitidoParaSesion(identidad, generacion)) throw Error('La cuenta cambió.');
     await AsyncStorage.setItem(PREFIJO_PREF + identidad, '1');
     try {
       const resultado = await programarParaIdentidad({
         empleado, email, identidad, generacion, origenPerfil: 'sap', cacheReciente: true,
       });
       if (!resultado.programados) {
         throw Error('No fue posible programar avisos con el horario SAP actual. Revisa ScheduleDetail, TimeFoodSchedule y los días laborales.');
       }
       return resultado;
     } catch (error) {
       await AsyncStorage.removeItem(PREFIJO_PREF + identidad);
       throw error;
     }
   });
 }

 export function desactivarRecordatoriosRH({ empleado, email } = {}) {
   const identidad = identidadRecordatoriosRH(empleado, email);
   return encolar(async () => {
     if (!identidad || !permitidoParaSesion(identidad, generacionSesion)) {
       throw Error('No se pudo validar el usuario actual para desactivar recordatorios.');
     }
     await AsyncStorage.removeItem(PREFIJO_PREF + identidad);
     await borrarSoloRRHH();
     await AsyncStorage.removeItem(ULTIMO_DUENO);
     return { desactivado: true };
   });
 }

 // Vista de diagnóstico: muestra exclusivamente avisos del usuario autenticado.
 export function listarRecordatoriosProgramadosRH({ empleado, email } = {}) {
   const identidad = identidadRecordatoriosRH(empleado, email);
   const generacion = generacionSesion;
   return encolar(async () => {
     if (!permitidoParaSesion(identidad, generacion)) throw Error('La sesión cambió.');
     const todos = await Notifications.getAllScheduledNotificationsAsync();
     return todos.filter(n => n.content?.data?.rhFuente === MARCA &&
         n.content?.data?.propietario === identidad && n.content?.data?.esPrueba !== true)
       .map(n => ({
         tipo: String(n.content.data.tipo || ''),
         cuandoMs: Number(n.content.data.cuandoMs || 0),
         titulo: String(n.content.title || ''),
       }))
       .filter(n => Number.isFinite(n.cuandoMs) && n.cuandoMs > Date.now())
       .sort((a, b) => a.cuandoMs - b.cuandoMs);
   });
 }

 // Prueba aislada y verificable sin cambiar los horarios de SAP ni enviar POST.
 export function programarPruebaRecordatorioRH({ empleado, email } = {}) {
   const identidad = identidadRecordatoriosRH(empleado, email);
   const generacion = generacionSesion;
   return encolar(async () => {
     if (!permitidoParaSesion(identidad, generacion) ||
       !(await consultarPreferenciaRecordatoriosRH(empleado, email))) {
       throw Error('Activa primero los recordatorios de la cuenta actual.');
     }
     if (!(await prepararCanalYPermisos(false))) {
       throw Error('El teléfono no tiene permiso para notificaciones.');
     }
     if (!permitidoParaSesion(identidad, generacion)) throw Error('La cuenta cambió.');
     const id = await Notifications.scheduleNotificationAsync({
       content: {
         title: 'Prueba de recordatorios RRHH',
         body: 'El teléfono recibió un aviso local, sin enviar registros a SAP.',
         sound: 'default',
         data: { rhFuente: MARCA, propietario: identidad, esPrueba: true },
       },
       trigger: {
         type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
         seconds: 60,
         ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
       },
     });
     return { identificador: id, segundos: 60 };
   });
 }
