// app/rrhh/asistencia.js
// Check-in QAS: se selecciona modalidad ANTES de la entrada, y se bloquea tras el primer POST.
// Confianza X: PR / HO / VN; sindicalizado Y: solo PR.
// Estado de jornada basado en acuses locales; ABAP debe validar duplicados en backend.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useSapEmployee } from "../../src/context/SapEmployeeContext";
import { prepararMarcacionRH, enviarMarcacionRH } from "../../src/services/rhAttendance";
import { prepararJustificacionRH, enviarJustificacionRH } from "../../src/services/rhJustifications";
import { clasificarEmpleadoRH, evaluarMarcacionRH, hoyISO, modalidadesPermitidasRH,
  obtenerTurnoDelDia, horaCorta, codigoModalidadRH, TIPOS_RH } from "../../src/services/rhPolicies";

const C = { bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C",
  greenBg: "#E9F6EE", blue: "#375A80", blueBg: "#EDF4FC", amber: "#95610C",
  amberBg: "#FFF7E8", danger: "#AF2634" };
const PREFIX = "rh:demo:attendance:v2:"; // Conserva acuses anteriores sin perderlos.
const norm = p => /^\d{1,8}$/.test(String(p ?? "").trim())
  ? String(p).trim().padStart(8, "0") : "";
const mailOK = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "")) && String(v).length <= 241;
const MAP = {
  entrada: { title: "Entrada", icon: "log-in-outline" },
  comida_inicio: { title: "Inicio de comida", icon: "restaurant-outline" },
  comida_fin: { title: "Regreso de comida", icon: "play-outline" },
  salida: { title: "Salida", icon: "log-out-outline" },
};
const ORDEN = ["entrada", "comida_inicio", "comida_fin", "salida"];
// Conversión local sin UTC para que el calendario conserve el día seleccionado.
const fechaParaPicker = value => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
};
const fechaCorta = value => value
  ? fechaParaPicker(value).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
  : "Seleccionar fecha";
const ultimo = (items, tipo) => items.filter(x => x.type === tipo).sort((a,b) =>
  `${b.date}|${b.time}`.localeCompare(`${a.date}|${a.time}`))[0] || null;

function Btn({ title, icon, onPress, outline = false, disabled = false, danger = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.btn, outline && s.btnOutline, danger && s.btnDanger,
      disabled && s.disabled, pressed && s.pressed]}>
    <Ionicons name={icon || "checkmark-circle-outline"} size={19} color={outline ? (danger ? C.danger : C.red) : C.white}/>
    <Text style={[s.btnText, outline && { color: danger ? C.danger : C.red }]}>{title}</Text>
  </Pressable>;
}
function CardTitle({ title, sub, icon }) {
  return <View style={s.sectionHeader}><Ionicons name={icon} size={21} color={C.red}/>
    <View style={{ flex: 1 }}><Text style={s.sectionTitle}>{title}</Text>
      {!!sub && <Text style={s.sub}>{sub}</Text>}</View></View>;
}
function Pick({ title, selected, onPress, disabled }) {
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button"
    accessibilityState={{ selected, disabled }} style={[s.choice, selected && s.choiceSelected, disabled && s.disabled]}>
    <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? C.red : C.sub}/>
    <Text style={[s.choiceText, selected && { color: C.red }]}>{title}</Text></Pressable>;
}

export default function RHAsistencia() {
  // No se aceptan parámetros de navegación para la identidad del empleado.
  const { employee: perfilSap, email: correoAzure, loading: perfilLoading, error: perfilError, refresh: refreshPerfil } = useSapEmployee();
  const personalNumber = norm(perfilSap?.personalNumber);
  const numeroRegistro = String(perfilSap?.personalNumber ?? "").trim();
  const correo = String(correoAzure || "").trim();
  const storageKey = `${PREFIX}${personalNumber}`;
  const modalidadKey = `rh:modalidad:q4:${personalNumber}:${hoyISO()}`;
  const [employee, setEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [modalidad, setModalidad] = useState("Presencial");
  // NULL significa que el personal de confianza AÚN no ha seleccionado modalidad.
  const [modalidadGuardada, setModalidadGuardada] = useState(null);
  const [bloqueoModalidadSinDatos, setBloqueoModalidadSinDatos] = useState(false);
  const [viajeDesde, setViajeDesde] = useState("");
  const [viajeHasta, setViajeHasta] = useState("");
  const [viajePicker, setViajePicker] = useState(null); // "desde" o "hasta"
  const [extraOpen, setExtraOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dialog, setDialog] = useState(null);
  const [motivo, setMotivo] = useState("Laboral");
  const [comentario, setComentario] = useState("");
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      setLoading(true); setError("");
      if (perfilLoading) return;
      if (!perfilSap) {
        setEmployee(null); setRecords([]);
        setError(perfilError || "No encontramos tu perfil. Vuelve a Recursos Humanos e inténtalo otra vez.");
        setLoading(false); return;
      }
      try {
        if (!personalNumber) throw Error("No encontramos tu número de nómina. Comunícate con Recursos Humanos.");
        const empleado = perfilSap;
        const [raw, modeRaw] = await Promise.all([
          AsyncStorage.getItem(storageKey), AsyncStorage.getItem(modalidadKey),
        ]);
        if (!activo) return;
        if (!empleado || norm(empleado.personalNumber) !== personalNumber) {
          throw Error("No pudimos verificar los datos del empleado.");
        }
        if (!mailOK(correo)) throw Error("No pudimos comprobar el correo de tu cuenta. Vuelve a iniciar sesión.");
        if (empleado.email && empleado.email.toLowerCase() !== correo.toLowerCase()) {
          throw Error("El correo de tu cuenta no coincide con el registro de empleado.");
        }
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw Error("No se pudieron recuperar los registros anteriores. Contacta a Recursos Humanos.");
        setRecords(parsed.filter(r => r && typeof r === "object" && norm(r.personalNumber) === personalNumber));
        setEmployee(empleado);
        // Prioridad: 1) modalidad de una marcación realmente iniciada hoy;
        // 2) selección guardada previamente para HOY;
        // 3) sindicalizado -> Presencial fija;
        // 4) confianza -> sin seleccionar (bloquear P10 hasta guardar).
        const hoyActual = hoyISO(new Date());
        const registradosHoy = parsed.filter(r => r && r.demo !== true && r.date === hoyActual &&
          norm(r.personalNumber) === personalNumber &&
          ["accepted", "sending", "uncertain"].includes(r.sapState));
        const previas = registradosHoy.filter(r => ["entrada", "comida_inicio", "comida_fin", "salida"].includes(r.type));
        const modalidadesRegistradas = [...new Set(previas.map(r =>
          r.modality || ({ PR: "Presencial", HO: "HomeOffice", VN: "Viaje de negocios" }[r.typeSession]) || "").filter(Boolean))];
        const mode = modeRaw ? JSON.parse(modeRaw) : null;
        const permitido = modalidadesPermitidasRH(empleado);
        const grupo = clasificarEmpleadoRH(empleado);
        let actual = null;
        let sinDatos = false;
        if (modalidadesRegistradas.length > 1) {
          sinDatos = true; // Diferencias históricas: evitar nuevos POST hasta revisión.
        } else if (modalidadesRegistradas.length === 1) {
          actual = modalidadesRegistradas[0];
        } else if (previas.length > 0) {
          if (mode?.modalidad) actual = mode.modalidad;
          else sinDatos = true; // No inferir modalidad de una marcación antigua.
        } else if (mode?.modalidad) {
          actual = mode.modalidad;
        } else if (grupo.sindicalizado) {
          actual = "Presencial";
        }
        if (actual && !permitido.includes(actual)) sinDatos = true;
        setBloqueoModalidadSinDatos(sinDatos);
        setModalidad(actual && permitido.includes(actual) ? actual : "Presencial");
        setModalidadGuardada(!sinDatos && actual && permitido.includes(actual) ? actual : null);
        setViajeDesde(mode?.desde || ""); setViajeHasta(mode?.hasta || "");
        setExtraOpen(!actual && grupo.confianza);
      } catch (e) {
        if (activo) {
          const message = String(e?.message || "");
          setError(/SAP|QAS|EmployeeSet|AsyncStorage|ScheduleDetail|HTTP/i.test(message)
            ? "No pudimos cargar tu información. Intenta de nuevo o consulta con Recursos Humanos."
            : message || "No pudimos cargar tu asistencia.");
        }
      }
      finally { if (activo) setLoading(false); }
    };
    cargar();
    return () => { activo = false; };
  }, [personalNumber, correo, storageKey, modalidadKey, refresh, perfilSap, perfilLoading, perfilError]);

  useEffect(() => {
    const timer = setInterval(() => setAhora(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const today = hoyISO(ahora);
  const activos = useMemo(() => records.filter(r => r.demo !== true), [records]);
  const deHoy = useMemo(() => activos.filter(r => r.date === today), [activos, today]);
  const aceptados = useMemo(() => deHoy.filter(r => r.sapState === "accepted"), [deHoy]);
  const pendientes = useMemo(() => deHoy.filter(r => ["sending", "uncertain"].includes(r.sapState)), [deHoy]);
  const entrada = ultimo(aceptados, "entrada");
  const inicioComida = ultimo(aceptados, "comida_inicio");
  const regresoComida = ultimo(aceptados, "comida_fin");
  const salida = ultimo(aceptados, "salida");
  const policy = employee ? clasificarEmpleadoRH(employee) : null;
  const turno = employee ? obtenerTurnoDelDia(employee.scheduleDetail, ahora) : null;
  const modalidades = employee ? modalidadesPermitidasRH(employee) : ["Presencial"];
  // Cualquier POST iniciado o confirmado fija el TypeSession del día.
  // No limitarse a entrada aceptada: con un timeout también hay que bloquear cambios.
  const huboEnvioHoy = deHoy.some(r => ["accepted", "sending", "uncertain"].includes(r.sapState) && !!TIPOS_RH[r.type]);
  const modoBloqueado = huboEnvioHoy || busy;
  const modalidadLista = !!modalidadGuardada && !bloqueoModalidadSinDatos;

  const persistir = useCallback(async nuevos => {
    await AsyncStorage.setItem(storageKey, JSON.stringify(nuevos));
    setRecords(nuevos);
  }, [storageKey]);
  const revisar = tipo => evaluarMarcacionRH({ empleado: employee, tipo, registros: activos,
    ahora, modalidad: modalidadGuardada });
  const elegirFechaViaje = (evento, fecha) => {
    if (Platform.OS === "android") setViajePicker(null);
    if (evento?.type === "dismissed" || !fecha) return;
    const elegida = hoyISO(fecha);
    setModalidadGuardada(null);
    if (viajePicker === "desde") {
      setViajeDesde(elegida);
      if (viajeHasta && elegida > viajeHasta) setViajeHasta("");
    } else if (viajePicker === "hasta") {
      if (viajeDesde && elegida < viajeDesde) {
        Alert.alert("Revisa las fechas", "El fin del viaje no puede ser anterior al inicio.");
        return;
      }
      setViajeHasta(elegida);
    }
  };
  const justificacionesSinConfirmar = deHoy.filter(r =>
    r.sapState === "accepted" && r.needsJustification && r.justificationState !== "accepted");

  const guardarModalidad = async () => {
    if (!employee || busyRef.current || modoBloqueado || bloqueoModalidadSinDatos || !policy?.confianza) return;
    if (!modalidades.includes(modalidad)) { Alert.alert("Modalidad no permitida", "No corresponde al grupo de personal."); return; }
    try { codigoModalidadRH(modalidad); }
    catch (e) { Alert.alert("Modalidad no disponible", "No pudimos confirmar esta opción. Comunícate con Recursos Humanos."); return; }
    if (modalidad === "Viaje de negocios") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(viajeDesde) || !/^\d{4}-\d{2}-\d{2}$/.test(viajeHasta)
        || viajeDesde > viajeHasta || today < viajeDesde || today > viajeHasta) {
        Alert.alert("Fechas del viaje", "Captura un período AAAA-MM-DD que incluya el día de hoy."); return;
      }
    }
    try {
      await AsyncStorage.setItem(modalidadKey, JSON.stringify({ modalidad, desde: viajeDesde, hasta: viajeHasta }));
      setModalidadGuardada(modalidad);
      setExtraOpen(false);
      Alert.alert("Modalidad guardada", `Hoy trabajarás en modalidad ${modalidad}. No podrás cambiarla después de registrar tu entrada.`);
    } catch (e) { Alert.alert("Error al guardar", e?.message || "No se pudo guardar la modalidad."); }
  };
  const abrir = tipo => {
    if (busyRef.current) return;
    if (!modalidadLista) {
      Alert.alert("Falta seleccionar modalidad", "Guarda primero la modalidad antes de registrar la entrada.");
      setExtraOpen(true);
      return;
    }
    const resultado = revisar(tipo);
    if (!resultado.permitido) {
      const mensaje = /SAP|ScheduleDetail|TypeSession|ABAP/i.test(resultado.mensaje || "")
        ? "Este registro requiere revisión. Comunícate con Recursos Humanos."
        : resultado.mensaje;
      Alert.alert("Registro no disponible", mensaje); return;
    }
    setMotivo("Laboral"); setComentario("");
    setDialog({ tipo, aviso: resultado.aviso, late: !!resultado.retardo,
      early: !!resultado.salidaAnticipada });
  };
  const registrar = async () => {
    if (!dialog || busyRef.current || !employee || !modalidadLista) return;
    busyRef.current = true; setBusy(true);
    const tipo = dialog.tipo;
    let pendiente = null;
    let envioIniciado = false;
    let asistenciaAceptada = false;
    let guardados = records;
    try {
      // El rango del viaje se guarda solo en el teléfono; SAP recibe únicamente TypeSession=VN.
      if (modalidadGuardada === "Viaje de negocios" &&
        (today < viajeDesde || today > viajeHasta)) {
        throw Error("Hoy debe estar incluido en las fechas del viaje seleccionado.");
      }
      const resultado = evaluarMarcacionRH({ empleado: employee, tipo, registros: activos,
        ahora: new Date(), modalidad: modalidadGuardada });
      if (!resultado.permitido) throw Error(resultado.mensaje);
      const requiereMotivo = !!(resultado.retardo || resultado.salidaAnticipada);
      if (requiereMotivo !== !!(dialog.late || dialog.early)) {
        setDialog(null);
        Alert.alert("Horario actualizado", "Tu horario cambió mientras confirmabas. Vuelve a elegir el registro.");
        return;
      }
      if (requiereMotivo && (!comentario.trim() || !["Personal", "Laboral"].includes(motivo))) {
        Alert.alert("Falta la justificación", "Selecciona el motivo y escribe una explicación breve.");
        return;
      }
      const { payload, gpsAccuracyMeters, evaluacion } = await prepararMarcacionRH({
        empleado: employee, personalNumber: numeroRegistro, email: correo,
        type: tipo, modalidad: modalidadGuardada, registros: activos,
      });
      // GPS puede tardar: si el evento cambió de normal a retardo, no enviar incompleto.
      if (!!(evaluacion.retardo || evaluacion.salidaAnticipada) !== requiereMotivo) {
        setDialog(null);
        Alert.alert("Horario actualizado", "Vuelve a confirmar el registro con su justificación.");
        return;
      }
      pendiente = {
        id: `${Date.now()}-${tipo}-${Math.random().toString(36).slice(2,7)}`,
        personalNumber, numeroRegistro, email: correo, type: tipo,
        date: payload.EnterDate, time: payload.EnterHour.slice(0,5),
        registerType: TIPOS_RH[tipo], modality: modalidadGuardada,
        typeSession: payload.TypeSession, gpsAccuracyMeters,
        createdAt: new Date().toISOString(), demo: false, sapState: "sending",
        late: !!evaluacion.retardo, early: !!evaluacion.salidaAnticipada,
        needsJustification: requiereMotivo,
        justificationState: requiereMotivo ? "pending" : null,
        ...(requiereMotivo ? { reason: motivo, comment: comentario.trim() } : {}),
      };
      guardados = [...records, pendiente];
      await persistir(guardados); // Guardar acuse ANTES del primer POST.
      envioIniciado = true;
      const respuesta = await enviarMarcacionRH(payload);
      asistenciaAceptada = true;
      guardados = guardados.map(x => x.id === pendiente.id
        ? { ...x, sapState: "accepted", httpStatus: respuesta.httpStatus,
            sapMessage: respuesta.message, attendanceIdLog: respuesta.idLog || "" } : x);
      try { await persistir(guardados); }
      catch (_) {
        setRecords(guardados);
        setDialog(null);
        Alert.alert("Registro por revisar", "La marcación recibió respuesta, pero no pudimos guardar el comprobante. No la repitas; contacta a Recursos Humanos.");
        return;
      }
      if (!requiereMotivo) {
        setDialog(null);
        Alert.alert("Registro enviado", "Tu movimiento fue recibido. Puedes continuar con tu jornada.");
        return;
      }

      // Segunda operación INDEPENDIENTE: si falla, NUNCA repetir P10/P20.
      // Id_log: no se inventa. Si ABAP lo asigna, admite cadena vacía; confirmar contrato.
      const justificacion = prepararJustificacionRH({
        personalNumber: numeroRegistro, enterDate: payload.EnterDate,
        enterHour: payload.EnterHour, registerType: payload.RegisterType,
        motivo, comentario: comentario.trim(), idLog: "",
      });
      guardados = guardados.map(x => x.id === pendiente.id
        ? { ...x, justificationState: "sending" } : x);
      try {
        await persistir(guardados); // No hacer POST si no se puede persistir este estado.
        const respJust = await enviarJustificacionRH(justificacion);
        guardados = guardados.map(x => x.id === pendiente.id
          ? { ...x, justificationState: "accepted", justificationIdLog: respJust.idLog,
              justificationMessage: respJust.message } : x);
        await persistir(guardados);
        setDialog(null);
        Alert.alert("Registro enviado", "Tu marcación y su justificación fueron recibidas.");
      } catch (justError) {
        // Un timeout no indica si ABAP guardó la justificación: no reintentar automáticamente.
        guardados = guardados.map(x => x.id === pendiente.id
          ? { ...x, justificationState: "uncertain" } : x);
        try { await persistir(guardados); } catch (_) { setRecords(guardados); }
        setDialog(null);
        Alert.alert("Justificación por revisar",
          "Tu marcación fue recibida, pero no pudimos confirmar la justificación. No repitas la marcación ni la justificación; contacta a Recursos Humanos.");
      }
    } catch (e) {
      if (asistenciaAceptada) {
        // Nunca cambiar una asistencia confirmada a 'uncertain' por fallas posteriores.
        setDialog(null);
        Alert.alert("Registro por revisar", "Tu marcación fue recibida. Consulta con Recursos Humanos para completar la justificación.");
      } else if (envioIniciado && pendiente) {
        const sinConfirmar = guardados.map(x => x.id === pendiente.id ? { ...x, sapState: "uncertain" } : x);
        try { await persistir(sinConfirmar); } catch (_) { setRecords(sinConfirmar); }
        setDialog(null);
        Alert.alert("Registro pendiente", "No pudimos confirmar el resultado. Para evitar duplicados, no lo envíes nuevamente. Comunícate con Recursos Humanos.");
      } else {
        const detalle = /GPS|ubicación|permiso|hora|comida|horario|modalidad|viaje|justificación/i.test(e?.message || "")
          ? e.message : "Verifica tu conexión e inténtalo nuevamente.";
        Alert.alert("No se pudo registrar", detalle);
      }
    } finally { busyRef.current = false; setBusy(false); }
  };
  const resolverPendiente = (r, existe) => Alert.alert("Confirmar revisión",
    `Nómina ${r.numeroRegistro || numeroRegistro}\nFecha ${r.date}\nHora ${r.time}\nMovimiento ${MAP[r.type]?.title || "Asistencia"}\n\nConfirma con Recursos Humanos que el registro ${existe ? "sí aparece" : "no aparece"} en el historial antes de continuar.`,
    [{ text: "Cancelar", style: "cancel" }, { text: "Confirmar", onPress: async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true);
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const actual = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(actual)) throw Error("Acuses inválidos.");
        const item = actual.find(x => x.id === r.id);
        if (!item || !["sending", "uncertain"].includes(item.sapState)) throw Error("El estado del acuse cambió.");
        await persistir(actual.map(x => x.id === r.id ? { ...x,
          sapState: existe ? "accepted" : "not_recorded_sap", manuallyReviewed: true,
          reviewedAt: new Date().toISOString() } : x));
        Alert.alert("Revisión actualizada", "Se actualizó el estado de la marcación.");
      } catch (e) { Alert.alert("Error", e?.message || "No se guardó la revisión."); }
      finally { busyRef.current = false; setBusy(false); }
    }}]);

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}>
    <ActivityIndicator size="large" color={C.red}/>
    <Text style={s.muted}>Preparando tu asistencia…</Text>
  </View></SafeAreaView>;
  if (error || !employee) return <SafeAreaView style={s.safe}><View style={s.center}>
    <Ionicons name="alert-circle-outline" size={38} color={C.danger}/>
    <Text style={s.sectionTitle}>No se pudo abrir tu asistencia</Text>
    <Text style={[s.muted, { textAlign: "center" }]}>{error || "Intenta nuevamente."}</Text>
    <Btn title="Reintentar" icon="refresh-outline" onPress={() => { refreshPerfil(); setRefresh(x => x + 1); }}/>
    <Btn title="Volver al inicio" icon="arrow-back" outline onPress={() => router.replace("/rrhh")}/>
  </View></SafeAreaView>;

  const comidaCerrada = policy?.confianza && ahora.getHours() >= 14;
  const jornada = salida ? "Jornada finalizada" : pendientes.length ? "Registro pendiente de revisión"
    : !entrada ? "Aún no has registrado tu entrada"
    : inicioComida && !regresoComida && !comidaCerrada ? "En horario de comida"
    : "Jornada en curso";
  const botones = !entrada ? ["entrada"] : salida ? []
    : inicioComida && !regresoComida ? ["comida_fin", "salida"]
    : !inicioComida ? ["comida_inicio", "salida"] : ["salida"];
  const principal = botones.find(t => t !== "salida") || botones[0] || null;
  const secundaria = botones.includes("salida") && principal !== "salida" ? "salida" : null;
  const resultadoPrincipal = principal ? revisar(principal) : null;
  const mensajePrincipal = resultadoPrincipal?.mensaje?.includes("SAP") ||
    resultadoPrincipal?.mensaje?.includes("ScheduleDetail") || resultadoPrincipal?.mensaje?.includes("TypeSession")
    ? "No podemos habilitar este registro. Comunícate con Recursos Humanos."
    : resultadoPrincipal?.mensaje;
  const faltaModalidad = policy?.confianza && !modalidadLista;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Regresar"
        onPress={() => router.back()} style={s.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Registrar asistencia</Text>
        <Text style={s.headerSub}>Mi jornada de hoy</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir historial"
        onPress={() => router.push("/rrhh/historial")}>
        <Ionicons name="calendar-outline" color={C.red} size={23}/>
      </Pressable>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={s.employeeBar}>
          <Ionicons name="person-circle-outline" size={34} color={C.red}/>
          <View style={{ flex: 1 }}>
            <Text style={s.employeeName}>{employee.fullName}</Text>
            <Text style={s.muted}>Nómina {numeroRegistro}</Text>
          </View>
          <Text style={s.dateBadge}>{ahora.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</Text>
        </View>

        <View style={s.card}>
          <View style={s.jornadaHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.sectionTitle}>Estado de mi jornada</Text>
              <Text style={s.muted}>{jornada}</Text>
            </View>
            <Ionicons name={salida ? "checkmark-circle" : pendientes.length ? "alert-circle" : "time-outline"}
              size={23} color={salida ? C.green : pendientes.length ? C.amber : C.blue}/>
          </View>
          <View style={s.timeline}>{ORDEN.map((tipo, idx) => {
            const registro = ultimo(aceptados, tipo);
            return <View key={tipo} style={s.step}>
              <View style={[s.stepCircle, registro && s.stepDone]}>
                {registro ? <Ionicons name="checkmark" color={C.white} size={15}/>
                  : <Text style={s.stepNumber}>{idx + 1}</Text>}
              </View>
              <Text style={s.stepLabel}>{MAP[tipo].title}</Text>
              <Text style={[s.stepTime, registro && { color: C.green }]}>{registro?.time || "--:--"}</Text>
            </View>;
          })}</View>
          {policy?.sindicalizado && <Text style={s.turnoLine}>Modalidad: Presencial</Text>}
          {turno?.valido && <Text style={s.turnoLine}>
            <Ionicons name="time-outline" size={15} color={C.sub}/>  Horario de hoy: {turno.textoInicio}–{turno.textoFin}
          </Text>}
        </View>

        {!!justificacionesSinConfirmar.length && <View style={s.card}>
          <View style={s.reviewHead}>
            <Ionicons name="alert-circle-outline" size={21} color={C.amber}/>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.sectionTitle}>Justificación por confirmar</Text>
              <Text style={s.muted}>Tu marcación fue recibida. Consulta con Recursos Humanos para verificar su justificación. No vuelvas a enviarla.</Text>
            </View>
          </View>
        </View>}

        {!!pendientes.length && <View style={s.card}>
          <View style={s.reviewHead}>
            <Ionicons name="alert-circle-outline" size={21} color={C.amber}/>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.sectionTitle}>Tienes un registro por revisar</Text>
              <Text style={s.muted}>No repitas la marcación. Contacta a Recursos Humanos.</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setRevisionOpen(x => !x)}
            style={s.expand}>
            <Text style={[s.expandLabel, { flex: 1 }]}>{revisionOpen ? "Ocultar opciones" : "Opciones de revisión"}</Text>
            <Ionicons name={revisionOpen ? "chevron-up" : "chevron-down"} size={18} color={C.blue}/>
          </Pressable>
          {revisionOpen && pendientes.map(r => <View key={r.id} style={{ gap: 9 }}>
            <Text style={s.muted}>{MAP[r.type]?.title || "Marcación"} · {r.time}</Text>
            <Text style={s.note}>Estas opciones solo deben utilizarse después de verificar el resultado con Recursos Humanos.</Text>
            <Btn title="Se confirmó el registro" icon="checkmark-circle-outline"
              disabled={busy} onPress={() => resolverPendiente(r, true)}/>
            <Btn title="Se confirmó que no existe" icon="alert-circle-outline" outline danger
              disabled={busy} onPress={() => resolverPendiente(r, false)}/>
          </View>)}
        </View>}

        {policy?.confianza && <View style={s.card}>
          <CardTitle title="1. Modalidad de trabajo"
            sub="Elige cómo trabajarás hoy antes de registrar tu entrada."
            icon="briefcase-outline"/>
          {bloqueoModalidadSinDatos && <Text style={s.warning}>
            Encontramos registros que requieren revisión. Comunícate con Recursos Humanos.
          </Text>}
          {modalidadLista && <View style={s.modeSummary}>
            <Ionicons name="checkmark-circle" size={20} color={C.green}/>
            <Text style={s.modeText}>{modalidadGuardada === "HomeOffice" ? "Home Office" : modalidadGuardada}</Text>
            {!modoBloqueado && policy?.confianza && <Pressable accessibilityRole="button"
              onPress={() => setExtraOpen(x => !x)}>
              <Text style={s.expandLabel}>Cambiar</Text>
            </Pressable>}
          </View>}
          {policy?.confianza && !modoBloqueado && !bloqueoModalidadSinDatos && (extraOpen || !modalidadLista) && <>
            {modalidades.map(x => <Pick key={x}
              title={x === "HomeOffice" ? "Home Office" : x}
              selected={modalidad === x} onPress={() => {
                setModalidad(x);
                setModalidadGuardada(null);
              }} disabled={busy}/>) }
            {modalidad === "Viaje de negocios" && <View style={{ gap: 9 }}>
              <Text style={s.fieldLabel}>Fechas de tu viaje</Text>
              <View style={s.travelRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar inicio del viaje"
                  style={s.travelDate} onPress={() => setViajePicker("desde")}>
                  <Text style={s.travelCaption}>Desde</Text>
                  <Text style={s.travelDateText}>{fechaCorta(viajeDesde)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={C.red}/>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar fin del viaje"
                  style={s.travelDate} onPress={() => setViajePicker("hasta")}>
                  <Text style={s.travelCaption}>Hasta</Text>
                  <Text style={s.travelDateText}>{fechaCorta(viajeHasta)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={C.red}/>
                </Pressable>
              </View>
              <Text style={s.note}>Selecciona un período que incluya el día de hoy.</Text>
            </View>}
            <Btn title="Confirmar modalidad" icon="checkmark-circle-outline"
              disabled={busy} onPress={guardarModalidad}/>
          </>}
          {policy?.confianza && modoBloqueado && <Text style={s.note}>
            Esta modalidad se mantiene durante toda la jornada.
          </Text>}
        </View>}

        <View style={s.card}>
          <CardTitle title={policy?.confianza ? "2. Registrar movimiento" : "Registrar movimiento"}
            icon="finger-print-outline"/>
          {!policy?.habilitado && <Text style={s.warning}>
            Tu asistencia no está habilitada. Contacta a Recursos Humanos.
          </Text>}
          {faltaModalidad && <Text style={s.note}>Primero confirma tu modalidad de trabajo.</Text>}
          {principal && <>
            <Btn title={principal === "entrada" ? "Registrar entrada" :
                principal === "comida_inicio" ? "Iniciar comida" :
                principal === "comida_fin" ? "Regresar de comida" : "Registrar salida"}
              icon={MAP[principal].icon} onPress={() => abrir(principal)}
              disabled={!modalidadLista || !resultadoPrincipal?.permitido || busy || !!pendientes.length}/>
            {!!resultadoPrincipal && !resultadoPrincipal.permitido && modalidadLista &&
              !pendientes.length && <Text style={s.note}>{mensajePrincipal}</Text>}
            {!!resultadoPrincipal?.retardo && <Text style={s.warning}>
              Tu entrada se registrará con retardo.
            </Text>}
          </>}
          {secundaria && <Pressable accessibilityRole="button" disabled={busy || !modalidadLista || !!pendientes.length}
            onPress={() => abrir(secundaria)} style={[s.exitLink, (busy || !modalidadLista || !!pendientes.length) && s.disabled]}>
            <Text style={s.expandLabel}>Registrar salida</Text>
            <Ionicons name="arrow-forward" size={16} color={C.blue}/>
          </Pressable>}
          {salida && <Text style={s.success}>Completaste tus registros de hoy.</Text>}
          {!turno?.valido && !salida && <Text style={s.note}>
            No encontramos un horario válido para hoy. Consulta con Recursos Humanos.
          </Text>}
        </View>

        {deHoy.length > 0 && <View style={s.card}>
          <Text style={s.sectionTitle}>Movimientos de hoy</Text>
          {deHoy.slice().reverse().map(r => <View style={s.record} key={r.id || `${r.type}-${r.time}`}>
            <Ionicons name={MAP[r.type]?.icon || "time-outline"} size={19} color={C.red}/>
            <View style={{ flex: 1 }}>
              <Text style={s.recordTitle}>{MAP[r.type]?.title || "Marcación"}</Text>
              <Text style={s.muted}>{r.sapState === "accepted" ? "Solicitud recibida" :
                r.sapState === "not_recorded_sap" ? "No registrado" : "Pendiente de revisión"}
                {r.sapState === "accepted" && r.needsJustification &&
                  (r.justificationState === "accepted" ? " · Justificación recibida" : " · Justificación por revisar")}</Text>
            </View>
            <Text style={s.recordTime}>{r.time || "--:--"}</Text>
          </View>)}
        </View>}
        <Btn title="Ver historial de asistencias" icon="calendar-outline" outline
          onPress={() => router.push("/rrhh/historial")}/>
      </ScrollView>
    </KeyboardAvoidingView>

    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => !busy && setDialog(null)}>
      <View style={s.overlay}><View style={s.modal}>
        <Ionicons name="finger-print-outline" size={29} color={C.red}/>
        <Text style={s.modalTitle}>Confirmar {MAP[dialog?.tipo]?.title?.toLowerCase() || "registro"}</Text>
        <Text style={s.modalText}>Modalidad: {modalidadGuardada === "HomeOffice" ? "Home Office" : modalidadGuardada}</Text>
        {!!dialog?.aviso && <Text style={s.modalText}>{dialog.aviso}</Text>}
        {(dialog?.late || dialog?.early) && <>
          <Text style={s.fieldLabel}>Motivo {dialog.late ? "del retardo" : "de salida anticipada"}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["Laboral", "Personal"].map(x => <View key={x} style={{ flex: 1 }}>
              <Pick title={x} selected={motivo === x} onPress={() => setMotivo(x)}/>
            </View>)}
          </View>
          <TextInput style={[s.textInput, { minHeight: 70, textAlignVertical: "top" }]}
            value={comentario} onChangeText={setComentario} multiline
            maxLength={500} placeholder="Explica brevemente el motivo (obligatorio)"/>
        </>}
        <Btn title={busy ? "Guardando…" : "Confirmar registro"} icon="checkmark-circle-outline"
          disabled={busy} onPress={registrar}/>
        <Btn title="Cancelar" icon="close-outline" outline disabled={busy}
          onPress={() => setDialog(null)}/>
      </View></View>
    </Modal>

    {Platform.OS === "android" && !!viajePicker && <DateTimePicker
      mode="date" display="default"
      value={fechaParaPicker(viajePicker === "desde" ? viajeDesde : viajeHasta)}
      minimumDate={viajePicker === "hasta" && viajeDesde ? fechaParaPicker(viajeDesde) : undefined}
      onChange={elegirFechaViaje}/>} 
    {Platform.OS === "ios" && <Modal visible={!!viajePicker} transparent animationType="slide"
      onRequestClose={() => setViajePicker(null)}>
      <View style={s.overlay}><View style={s.modal}>
        <Text style={s.modalTitle}>{viajePicker === "desde" ? "Inicio del viaje" : "Fin del viaje"}</Text>
        <DateTimePicker mode="date" display="spinner" locale="es-MX"
          value={fechaParaPicker(viajePicker === "desde" ? viajeDesde : viajeHasta)}
          minimumDate={viajePicker === "hasta" && viajeDesde ? fechaParaPicker(viajeDesde) : undefined}
          onChange={elegirFechaViaje}/>
        <Btn title="Listo" onPress={() => setViajePicker(null)} icon="checkmark-outline"/>
      </View></View>
    </Modal>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, gap: 15 },
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { paddingVertical: 7, width: 28 }, headerTitle: { color: C.ink, fontSize: 18, fontWeight: "800" },
  headerSub: { fontSize: 11, color: C.sub }, content: { padding: 17, paddingBottom: 38, gap: 14 },
  employeeBar: { backgroundColor: C.white, borderRadius: 14, padding: 14, flexDirection: "row", gap: 11, alignItems: "center", borderWidth: 1, borderColor: C.border },
  employeeName: { color: C.ink, fontSize: 15, fontWeight: "800" }, muted: { color: C.sub, fontSize: 12, lineHeight: 18 },
  card: { padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 16, backgroundColor: C.white, gap: 13 },
  sectionHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  sub: { color: C.sub, fontSize: 12, marginTop: 4, lineHeight: 17 },
  status: { flexDirection: "row", alignItems: "center", padding: 11, gap: 9, borderRadius: 11 },
  amberBox: { backgroundColor: C.amberBg }, blueBox: { backgroundColor: C.blueBg },
  timeline: { flexDirection: "row", gap: 4, justifyContent: "space-between" },
  step: { flex: 1, alignItems: "center", gap: 6 }, stepCircle: { width: 29, height: 29, borderRadius: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  stepDone: { backgroundColor: C.green }, stepNumber: { color: C.sub, fontWeight: "700", fontSize: 12 },
  stepLabel: { textAlign: "center", color: C.sub, fontSize: 10, minHeight: 30 }, stepTime: { fontWeight: "800", fontSize: 11, color: C.sub },
  btn: { backgroundColor: C.red, borderRadius: 11, minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnOutline: { backgroundColor: C.white, borderWidth: 1, borderColor: C.red }, btnDanger: { borderColor: C.danger },
  btnText: { fontWeight: "800", color: C.white, fontSize: 13, textAlign: "center" },
  disabled: { opacity: .42 }, pressed: { opacity: .8 }, note: { fontSize: 11, lineHeight: 17, color: C.sub },
  warning: { color: C.amber, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  success: { color: C.green, fontSize: 12, lineHeight: 18 },
  expand: { flexDirection: "row", gap: 10, alignItems: "center" },
  choice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  choiceSelected: { borderColor: C.red, backgroundColor: C.pale }, choiceText: { fontSize: 12, color: C.ink, fontWeight: "700" },
  fieldLabel: { color: C.ink, fontSize: 12, fontWeight: "700" }, textInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: C.ink, fontSize: 13 },
  record: { flexDirection: "row", gap: 10, alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 11 },
  recordTitle: { color: C.ink, fontSize: 12, fontWeight: "700" }, recordTime: { fontSize: 12, color: C.ink, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: C.white, borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.ink }, modalText: { color: C.ink, fontSize: 13, lineHeight: 20 },
  dateBadge: { fontSize: 11, color: C.sub },
  jornadaHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  turnoLine: { paddingTop: 10, borderTopColor: C.border, borderTopWidth: 1, color: C.sub, fontSize: 12 },
  reviewHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  expandLabel: { fontSize: 13, color: C.blue, fontWeight: "800" },
  modeSummary: { backgroundColor: C.greenBg, borderRadius: 11, flexDirection: "row", alignItems: "center", padding: 12, gap: 9 },
  modeText: { color: C.ink, fontSize: 14, fontWeight: "800", flex: 1 },
  exitLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 43 },
  travelRow: { flexDirection: "row", gap: 9 },
  travelDate: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 11,
    padding: 12, backgroundColor: "#FBFCFE", gap: 6, minHeight: 91 },
  travelCaption: { fontSize: 11, color: C.sub },
  travelDateText: { fontSize: 13, color: C.ink, fontWeight: "700" },
});