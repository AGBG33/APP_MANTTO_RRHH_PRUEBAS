
 // app/rrhh/index.js
 // Inicio de RRHH. Se mantiene el flujo de asistencia y se agrega un control
 // voluntario de recordatorios por empleado autenticado.
 import React, { useEffect, useState } from 'react';
 import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import NetInfo from '@react-native-community/netinfo';
 import { router } from 'expo-router';
 import { useSapEmployee } from '../context/SapEmployeeContext';
 import { clasificarEmpleadoRH } from '../services/rhPolicies';
 import {
   consultarPreferenciaRecordatoriosRH,
   activarRecordatoriosRH,
   desactivarRecordatoriosRH,
   identidadRecordatoriosRH,
   listarRecordatoriosProgramadosRH,
   programarPruebaRecordatorioRH,
 } from '../notifications/rhReminderScheduler';

 const C = {
   bg: '#F6F7F9', white: '#FFFFFF', ink: '#202733', sub: '#697586',
   line: '#E7E9ED', red: '#D71920', pale: '#FFF1F2', green: '#18764C', blue: '#375A80',
   amber: '#95610C', amberBg: '#FFF7E8',
 };

 function Fila({ label, value }) {
   if (!String(value ?? '').trim()) return null;
   return <View style={s.detailRow}>
     <Text style={s.detailLabel}>{label}</Text>
     <Text style={s.detailValue}>{String(value)}</Text>
   </View>;
 }

 function Acceso({ title, subtitle, icon, onPress }) {
   return <Pressable onPress={onPress} accessibilityRole="button"
     style={({ pressed }) => [s.access, pressed && { opacity: 0.75 }]}>
     <View style={s.accessIcon}><Ionicons name={icon} size={23} color={C.red}/></View>
     <View style={{ flex: 1, gap: 4 }}>
       <Text style={s.accessTitle}>{title}</Text>
       <Text style={s.accessSub}>{subtitle}</Text>
     </View>
     <Ionicons name="chevron-forward" size={20} color={C.sub}/>
   </Pressable>;
 }

 export default function RRHHInicio() {
   const { employee, email: correoCuenta, loading, error, refresh, origenPerfil } = useSapEmployee();
   const [showDetails, setShowDetails] = useState(false);
   const policy = employee ? clasificarEmpleadoRH(employee) : null;
   const modoConsultaOffline = origenPerfil === 'cache';
   const [sinInternet, setSinInternet] = useState(null);
   const [recordatoriosActivos, setRecordatoriosActivos] = useState(null);
   const [cambiandoRecordatorios, setCambiandoRecordatorios] = useState(false);
   const [errorRecordatorios, setErrorRecordatorios] = useState('');
   const identidad = identidadRecordatoriosRH(employee, correoCuenta);

   useEffect(() => {
     let activo = true;
     const actualizar = red => {
       if (!activo) return;
       setSinInternet(red.isConnected === false || red.isInternetReachable === false);
     };
     NetInfo.fetch().then(actualizar).catch(() => {});
     const unsubscribe = NetInfo.addEventListener(actualizar);
     return () => { activo = false; unsubscribe(); };
   }, []);

   useEffect(() => {
     let activo = true;
     setRecordatoriosActivos(null);
     setErrorRecordatorios('');
     if (!employee || !identidad) return () => { activo = false; };
     consultarPreferenciaRecordatoriosRH(employee, correoCuenta)
       .then(habilitado => { if (activo) setRecordatoriosActivos(habilitado); })
       .catch(e => { if (activo) setErrorRecordatorios(String(e?.message || 'No se pudo leer tu preferencia.')); });
     return () => { activo = false; };
   }, [identidad, employee?.numeroConfirmadoEnSAP, correoCuenta]);

   const probarAviso = async () => {
     if (!employee || !identidad || !recordatoriosActivos || cambiandoRecordatorios) return;
     try {
       await programarPruebaRecordatorioRH({ empleado: employee, email: correoCuenta });
       Alert.alert('Prueba programada', 'La notificación aparecerá aproximadamente en 60 segundos. Puedes poner el teléfono en modo avión y cerrar la app.');
     } catch (e) {
       Alert.alert('No se pudo programar la prueba', String(e?.message || e));
     }
   };

   const verHorariosProgramados = async () => {
     if (!employee || !identidad || !recordatoriosActivos) return;
     try {
       const avisos = await listarRecordatoriosProgramadosRH({ empleado: employee, email: correoCuenta });
       const resumen = avisos.slice(0, 12).map(n => {
         const fecha = new Date(n.cuandoMs);
         return `${n.tipo} · ${fecha.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
       }).join('\n');
       Alert.alert('Próximos avisos programados',
         `${avisos.length} avisos en este teléfono para la cuenta actual.\n\n${resumen || 'No hay avisos futuros.'}`);
     } catch (e) {
       Alert.alert('No se pudo consultar', String(e?.message || e));
     }
   };

   const cambiarNotificaciones = async () => {
     if (cambiandoRecordatorios || !employee || !identidad || recordatoriosActivos === null) return;
     const identidadAlInicio = identidad;
     const activar = !recordatoriosActivos;
     if (activar && (!policy?.habilitado || origenPerfil !== 'sap')) {
       Alert.alert('Conéctate a SAP', 'Para activar recordatorios necesitamos validar primero el perfil y horario de esta cuenta en SAP.');
       return;
     }
     setCambiandoRecordatorios(true);
     setErrorRecordatorios('');
     try {
       if (activar) {
         const r = await activarRecordatoriosRH({ empleado: employee, email: correoCuenta, origenPerfil });
         if (identidadRecordatoriosRH(employee, correoCuenta) === identidadAlInicio) setRecordatoriosActivos(true);
         Alert.alert('Recordatorios activados',
           `Se programaron ${r.programados} avisos para los próximos 7 días, según tu horario SAP. ` +
           'Funcionarán sin internet y con la app cerrada, sujetos a los ajustes de Android.');
       } else {
         await desactivarRecordatoriosRH({ empleado: employee, email: correoCuenta });
         if (identidadRecordatoriosRH(employee, correoCuenta) === identidadAlInicio) setRecordatoriosActivos(false);
         Alert.alert('Recordatorios desactivados', 'Se cancelaron los avisos locales de RRHH en este teléfono.');
       }
     } catch (e) {
       const mensaje = String(e?.message || 'No pudimos actualizar tus recordatorios.');
       setErrorRecordatorios(mensaje);
       Alert.alert('Recordatorios de RRHH', mensaje);
     } finally { setCambiandoRecordatorios(false); }
   };

   return <SafeAreaView style={s.safe}>
     <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
     <View style={s.header}>
       <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.replace('/inicio')} style={s.back}>
         <Ionicons name="arrow-back" size={23} color={C.ink}/>
       </Pressable>
       <View style={{ flex: 1 }}>
         <Text style={s.headerTitle}>Recursos Humanos</Text>
         <Text style={s.headerSub}>Control de asistencia</Text>
       </View>
     </View>
     <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
       <View style={s.intro}>
         <Text style={s.title}>Mi asistencia</Text>
         <Text style={s.subtitle}>Consulta tus movimientos y registra tu jornada.</Text>
       </View>
       {loading && <View style={s.feedback}>
         <ActivityIndicator size="large" color={C.red}/>
         <Text style={s.feedbackText}>Cargando tu información…</Text>
       </View>}
       {!loading && !employee && <View style={s.feedback}>
         <Ionicons name="person-circle-outline" size={35} color={C.sub}/>
         <Text style={s.sectionTitle}>No pudimos cargar tu perfil</Text>
         <Text style={s.feedbackText}>{error || 'No encontramos tu información laboral. Comunícate con Recursos Humanos.'}</Text>
         <Pressable accessibilityRole="button" style={s.retry} onPress={refresh}>
           <Ionicons name="refresh-outline" size={17} color={C.white}/>
           <Text style={s.retryText}>Volver a intentar</Text>
         </Pressable>
       </View>}
       {!loading && employee && <>
         {modoConsultaOffline && <View style={s.connectionNotice} accessibilityLiveRegion="polite">
           <Ionicons name="cloud-offline-outline" size={17} color={C.amber}/>
           <Text style={s.connectionNoticeText}>
             {sinInternet === true ? 'Sin conexión · Usando datos guardados' : 'Sin acceso a SAP · Usando datos guardados'}
           </Text>
         </View>}
         <View style={s.profile}>
           <View style={s.profileTop}>
             <View style={s.avatar}><Ionicons name="person-outline" size={24} color={C.red}/></View>
             <View style={{ flex: 1, gap: 4 }}>
               <Text style={s.name}>{employee.fullName || 'Empleado'}</Text>
               <Text style={s.muted}>Nómina {employee.personalNumber}</Text>
               {!!employee.position && <Text style={s.muted}>{employee.position}</Text>}
             </View>
             <Ionicons name={modoConsultaOffline ? 'cloud-offline-outline' : 'checkmark-circle'}
               size={22} color={modoConsultaOffline ? C.amber : C.green}/>
           </View>
           <Pressable style={s.detailsButton} onPress={() => setShowDetails(!showDetails)}>
             <Text style={s.detailsButtonText}>{showDetails ? 'Ocultar información' : 'Ver mi información'}</Text>
             <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} color={C.blue} size={18}/>
           </Pressable>
           {showDetails && <View>
             <Fila label="Correo corporativo" value={employee.email}/>
             <Fila label="Horario" value={employee.scheduleDetail || employee.hourly}/>
             <Fila label="Zona" value={employee.zone}/>
             <Fila label="Centro de trabajo" value={employee.centerOffice}/>
             <Fila label="Tipo de personal" value={employee.groupPersonDescription}/>
           </View>}
         </View>
         {!policy?.habilitado && <View style={s.feedback}>
           <Ionicons name="information-circle-outline" size={25} color={C.blue}/>
           <Text style={s.feedbackText}>{policy?.razon || 'Por el momento no puedes registrar asistencia desde la aplicación.'}</Text>
         </View>}
         <Text style={s.sectionTitle}>¿Qué deseas hacer?</Text>
         {policy?.habilitado && <Acceso title="Registrar asistencia"
           subtitle={modoConsultaOffline ? 'Registrar sin conexión' : 'Entrada, comida y salida'}
           icon="finger-print-outline" onPress={() => router.push('/rrhh/asistencia')}/>}
         <Acceso title="Historial de asistencias" subtitle={modoConsultaOffline ? 'Consultar historial guardado' : 'Consulta tus movimientos por fecha'}
           icon="calendar-outline" onPress={() => router.push('/rrhh/historial')}/>

         {policy?.habilitado && <View style={s.reminderCard}>
           <View style={s.reminderHeading}>
             
             
           </View>
           <Pressable accessibilityRole="button"
             accessibilityState={{ disabled: cambiandoRecordatorios || recordatoriosActivos === null ||
               (!recordatoriosActivos && origenPerfil !== 'sap') }}
             onPress={cambiarNotificaciones}
             disabled={cambiandoRecordatorios || recordatoriosActivos === null ||
               (!recordatoriosActivos && origenPerfil !== 'sap')}
             style={[s.reminderButton, (cambiandoRecordatorios || recordatoriosActivos === null ||
               (!recordatoriosActivos && origenPerfil !== 'sap')) && s.reminderDisabled]}>
             {cambiandoRecordatorios ? <ActivityIndicator size="small" color={C.white}/>
               : <Ionicons name={recordatoriosActivos ? 'notifications-off-outline' : 'notifications-outline'} color={C.white} size={17}/>}
             <Text style={s.reminderButtonText}>{cambiandoRecordatorios ? 'Actualizando…'
               : recordatoriosActivos === null ? 'Consultando…'
               : recordatoriosActivos ? 'Desactivar recordatorios' : 'Activar recordatorios'}</Text>
           </Pressable>
           {recordatoriosActivos && <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
             <Pressable onPress={verHorariosProgramados} style={s.reminderSecondaryButton}>
               <Text style={s.reminderSecondaryText}>Ver horarios</Text>
             </Pressable>
             <Pressable onPress={probarAviso} style={s.reminderSecondaryButton}>
               <Text style={s.reminderSecondaryText}>Probar aviso (60 s)</Text>
             </Pressable>
           </View>}
           {recordatoriosActivos && <Text style={s.reminderCaption}>
             Activados en este teléfono. Se actualizan al abrir la app, con el perfil SAP disponible. Cobertura de siete días.
           </Text>}
           {!recordatoriosActivos && modoConsultaOffline && <Text style={s.reminderCaption}>
             Conéctate a SAP para activarlos por primera vez. Si ya estaban programados, siguen hasta su fecha.
           </Text>}
           {!!errorRecordatorios && <Text style={s.reminderError}>{errorRecordatorios}</Text>}
         </View>}
       </>}
     </ScrollView>
   </SafeAreaView>;
 }

 const s = StyleSheet.create({
   safe: { flex: 1, backgroundColor: C.bg },
   header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
     backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
   back: { width: 32, minHeight: 35, justifyContent: 'center' },
   headerTitle: { fontWeight: '800', fontSize: 18, color: C.ink },
   headerSub: { fontSize: 12, color: C.sub },
   content: { padding: 18, paddingBottom: 40, gap: 15 },
   intro: { gap: 5 }, title: { fontSize: 25, fontWeight: '800', color: C.ink },
   subtitle: { fontSize: 14, color: C.sub },
   profile: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
     padding: 16, borderRadius: 17, gap: 12 },
   profileTop: { flexDirection: 'row', gap: 11, alignItems: 'center' },
   avatar: { width: 48, height: 48, borderRadius: 13, backgroundColor: C.pale,
     alignItems: 'center', justifyContent: 'center' },
   name: { fontSize: 16, fontWeight: '800', color: C.ink },
   muted: { fontSize: 12, color: C.sub },
   detailsButton: { borderTopWidth: 1, borderTopColor: C.line,
     paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
   detailsButtonText: { color: C.blue, fontWeight: '700', fontSize: 13 },
   detailRow: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: C.line,
     paddingVertical: 10 },
   detailLabel: { flex: 1, fontSize: 12, color: C.sub },
   detailValue: { flex: 1.8, color: C.ink, textAlign: 'right', fontSize: 12 },
   sectionTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 4 },
   feedback: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 17,
     padding: 20, gap: 12, alignItems: 'center' },
   feedbackText: { color: C.sub, textAlign: 'center', lineHeight: 20, fontSize: 13 },
   retry: { backgroundColor: C.red, borderRadius: 11, paddingHorizontal: 18,
     paddingVertical: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
   retryText: { fontSize: 13, fontWeight: '700', color: C.white },
   access: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
     borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
   accessIcon: { width: 46, height: 46, backgroundColor: C.pale, borderRadius: 13,
     alignItems: 'center', justifyContent: 'center' },
   accessTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
   accessSub: { fontSize: 12, color: C.sub, lineHeight: 17 },
   connectionNotice: { flexDirection: 'row', alignItems: 'center', gap: 7,
     paddingHorizontal: 4, paddingVertical: 2 },
   connectionNoticeText: { color: C.amber, fontSize: 12, fontWeight: '600', flexShrink: 1 },
   disabledAccess: { backgroundColor: '#F0F1F3', borderWidth: 1, borderColor: C.line,
     borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
   disabledIcon: { width: 46, height: 46, backgroundColor: '#E6E9ED', borderRadius: 13,
     alignItems: 'center', justifyContent: 'center' },
   reminderCard: { backgroundColor: C.white, borderRadius: 17, borderWidth: 1,
     borderColor: C.line, padding: 16, gap: 12 },
   reminderHeading: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
   reminderSubtitle: { fontSize: 12, color: C.sub, lineHeight: 18, marginTop: 5 },
   reminderButton: { flexDirection: 'row', backgroundColor: C.red, borderRadius: 11,
     alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 8 },
   reminderButtonText: { fontSize: 13, color: C.white, fontWeight: '700' },
   reminderDisabled: { opacity: 0.45 },
   reminderCaption: { fontSize: 12, color: C.sub, lineHeight: 17 },
   reminderError: { fontSize: 12, color: '#AF2634', lineHeight: 17 },
   reminderSecondaryButton: { borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
   reminderSecondaryText: { color: C.blue, fontSize: 12, fontWeight: '700' },
 });
