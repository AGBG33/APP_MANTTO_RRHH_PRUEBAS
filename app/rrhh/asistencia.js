// app/rrhh/asistencia.js
// CHECK-IN de RRHH: pantalla limpia con jornada, siguiente acción y ajustes opcionales.
// P10/P15/P25/P20 se envían a SAP QAS. Modalidad y motivos son SOLO locales.
// Un acuse HTTP 2xx no equivale necesariamente a verificar una fila en SAP.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { obtenerEmpleadoRH } from "../../src/services/rhEmployees";
import { prepararMarcacionRH, enviarMarcacionRH } from "../../src/services/rhAttendance";

const C = {
  bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C",
  greenBg: "#EAF7EF", blue: "#375A80", blueBg: "#ECF3FA",
  amber: "#95610C", amberBg: "#FFF7E8", danger: "#AF2634",
};
const PREFIX = "rh:demo:attendance:v2:"; // Conserva el historial del proyecto existente.
const pad = (n) => String(n).padStart(2, "0");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const hora = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const primero = (value) => Array.isArray(value) ? value[0] : value;
const nomina = (value) => {
  const s = String(primero(value) ?? "").trim();
  return /^\d{1,8}$/.test(s) ? s.padStart(8, "0") : "";
};
const diaSemana = (fecha) => {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};
const TIPOS = {
  entrada: { name: "Entrada", code: "P10", icon: "log-in-outline" },
  comida_inicio: { name: "Inicio de comida", code: "P15", icon: "restaurant-outline" },
  comida_fin: { name: "Regreso de comida", code: "P25", icon: "play-outline" },
  salida: { name: "Salida", code: "P20", icon: "log-out-outline" },
};
const ORDEN = Object.keys(TIPOS);
const ultimo = (items, tipo) => [...items].reverse().find((r) => r.type === tipo);

function Action({ title, icon, onPress, disabled, outline = false, danger = false }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, outline && s.actionOutline, danger && s.actionDanger,
      disabled && s.disabled, pressed && s.pressed]}>
    <Ionicons name={icon || "checkmark-circle-outline"} size={19}
      color={outline ? (danger ? C.danger : C.red) : C.white}/>
    <Text style={[s.actionText, outline && { color: danger ? C.danger : C.red }]}>{title}</Text>
  </Pressable>;
}
function Section({ title, subtitle, icon }) {
  return <View style={s.sectionTitleLine}>
    {icon && <Ionicons name={icon} size={18} color={C.red}/>}
    <View style={{ flex: 1 }}><Text style={s.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}</View>
  </View>;
}
function SmallChoice({ value, selected, onPress, disabled }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: !!disabled }}
    disabled={disabled} onPress={onPress}
    style={[s.choice, selected && s.choiceSelected, disabled && s.disabled]}>
    <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20}
      color={selected ? C.red : C.sub}/>
    <Text style={[s.choiceText, selected && { color: C.red }]}>{value}</Text>
  </Pressable>;
}

export default function RHCheckIn() {
  const params = useLocalSearchParams();
  const personalNumber = useMemo(() => nomina(params.personalNumber), [params.personalNumber]);
  const numeroRegistro = useMemo(() => {
    const raw = String(primero(params.numeroRegistro) ?? "").trim();
    return /^\d{1,8}$/.test(raw) && raw.padStart(8, "0") === personalNumber
      ? raw : personalNumber;
  }, [params.numeroRegistro, personalNumber]);
  const storageKey = `${PREFIX}${personalNumber}`;
  const [employee, setEmployee] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dialog, setDialog] = useState(null);
  const [motivo, setMotivo] = useState("Laboral");
  const [comentario, setComentario] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [modalidad, setModalidad] = useState("Presencial");
  const [viajeDesde, setViajeDesde] = useState("");
  const [viajeHasta, setViajeHasta] = useState("");
  const [correo, setCorreo] = useState(String(primero(params.correoRegistro) ?? "").trim());

  // Se carga en paralelo información del empleado y acuses guardados en este equipo.
  useEffect(() => {
    if (!personalNumber) { setFetching(false); setReady(true); return; }
    let active = true;
    setEmployee(null); setFetchError(""); setFetching(true); setReady(false);
    obtenerEmpleadoRH(personalNumber)
      .then(data => {
        if (!active) return;
        if (!data || nomina(data.personalNumber) !== personalNumber) {
          setFetchError("No se pudo verificar el número de empleado con EmployeeSet.");
          return;
        }
        setEmployee(data);
        // Prioridad: correo opcional introducido > correo SAP; puede permanecer vacío.
        setCorreo(actual => actual.trim() || String(data.email ?? "").trim());
      })
      .catch(e => { if (active) setFetchError(e?.message || "No se pudo consultar SAP."); })
      .finally(() => { if (active) setFetching(false); });
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!active) return;
        const data = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(data)) throw Error("El historial local tiene un formato inválido.");
        // Se conservan todos los acuses (también los antiguos) en memoria para
        // no borrarlos accidentalmente al guardar una nueva marcación.
        setRecords(data.filter(x => x && typeof x === "object"
          && nomina(x.personalNumber) === personalNumber));
        setReady(true);
      })
      .catch(e => {
        if (!active) return;
        setFetchError(e?.message || "No se pudieron cargar los acuses locales.");
        setReady(true);
      });
    return () => { active = false; };
  }, [personalNumber, storageKey, refresh]);

  // La interfaz funcional oculta movimientos simulados antiguos, sin eliminarlos.
  const visibles = useMemo(() => records.filter(r => r.demo !== true), [records]);
  const registrosHoy = useMemo(() => visibles.filter(r => r.date === hoy()), [visibles]);
  const aceptados = useMemo(() => registrosHoy.filter(r => r.sapState === "accepted"), [registrosHoy]);
  const pendientes = useMemo(() => registrosHoy.filter(r => r.sapState === "sending" || r.sapState === "uncertain"), [registrosHoy]);
  const entrada = ultimo(aceptados, "entrada");
  const inicioComida = ultimo(aceptados, "comida_inicio");
  const finComida = ultimo(aceptados, "comida_fin");
  const salida = ultimo(aceptados, "salida");
  const tieneEntrada = !!entrada;
  const enComida = !!inicioComida && !finComida;
  const finJornada = !!salida;
  const bloqueado = pendientes.length > 0;
  const estado = !tieneEntrada ? "Pendiente de entrada" : finJornada ? "Jornada finalizada"
    : enComida ? "En pausa de comida" : "Jornada en curso";
  const usadoHomeOffice = visibles.some(r => r.type === "modalidad" && r.modality === "HomeOffice"
    && r.date !== hoy() && diaSemana(r.date) === diaSemana(hoy()));
  const modalidadHoy = ultimo(registrosHoy.filter(r => r.type === "modalidad"), "modalidad");

  const persistir = useCallback(async lista => {
    await AsyncStorage.setItem(storageKey, JSON.stringify(lista));
    setRecords(lista);
  }, [storageKey]);

  const abrirConfirmacion = (type, variant = "normal") => {
    if (busyRef.current || bloqueado) return;
    setMotivo("Laboral"); setComentario("");
    setDialog({ type, variant });
  };

  const registrar = async () => {
    if (!dialog || busyRef.current || !employee || !personalNumber || !ready) return;
    const { type, variant } = dialog;
    if (bloqueado) { Alert.alert("Revisión pendiente", "Verifica la marcación anterior en SAP antes de continuar."); return; }
    if (registrosHoy.some(r => r.type === type && ["accepted", "sending", "uncertain"].includes(r.sapState))) {
      Alert.alert("Ya existe una marcación", "Este evento ya fue enviado o está pendiente de verificar."); return;
    }
    if (variant !== "normal" && !motivo) { Alert.alert("Falta un dato", "Selecciona un motivo."); return; }
    const email = correo.trim();
    if (email && (email.length > 241 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      Alert.alert("Correo opcional no válido", "Corrígelo o déjalo vacío. No es obligatorio."); return;
    }
    busyRef.current = true; setBusy(true);
    let pendiente = null;
    let envioIniciado = false;
    let listaGuardada = records;
    try {
      // GPS, fecha y hora se capturan solamente tras confirmar la marcación.
      const { payload, gpsAccuracyMeters } = await prepararMarcacionRH({
        personalNumber: numeroRegistro, fullName: employee.fullName, email, type,
      });
      pendiente = {
        id: `${Date.now()}-${type}-${Math.random().toString(36).slice(2, 7)}`,
        personalNumber, numeroRegistro, email, type,
        date: payload.EnterDate, time: payload.EnterHour.slice(0, 5),
        createdAt: new Date().toISOString(), registerType: payload.RegisterType,
        gpsAccuracyMeters, demo: false, sapState: "sending",
        ...(variant === "late" ? { late: true, reason: motivo, comment: comentario } : {}),
        ...(variant === "early" ? { early: true, reason: motivo, comment: comentario } : {}),
      };
      listaGuardada = [...records, pendiente];
      await persistir(listaGuardada); // Se escribe ANTES de enviar para evitar reenvíos tras un cierre.
      envioIniciado = true;
      const resultado = await enviarMarcacionRH(payload);
      const aceptado = { ...pendiente, sapState: "accepted", httpStatus: resultado.httpStatus,
        sapMessage: resultado.message };
      listaGuardada = listaGuardada.map(r => r.id === pendiente.id ? aceptado : r);
      try { await persistir(listaGuardada); }
      catch (_) {
        setRecords(listaGuardada);
        Alert.alert("Respuesta recibida", "SAP respondió HTTP 2xx, pero falló guardar el acuse. Revisa SAP antes de reenviar.");
        setDialog(null); return;
      }
      setDialog(null);
      Alert.alert("Solicitud atendida por QAS", `${payload.RegisterType} · HTTP ${resultado.httpStatus}. La confirmación de persistencia debe verificarse en SAP.`);
    } catch (e) {
      if (envioIniciado && pendiente) {
        // Un timeout también puede ocurrir DESPUÉS de que SAP almacenó el movimiento.
        const sinConfirmar = { ...pendiente, sapState: "uncertain" };
        const nuevaLista = listaGuardada.map(r => r.id === pendiente.id ? sinConfirmar : r);
        try { await persistir(nuevaLista); } catch (_) { setRecords(nuevaLista); }
        setDialog(null);
        Alert.alert("Envío sin confirmación", `${e?.message || "Error de red"}\n\nNo se reenviará automáticamente. Comprueba ZHCM_REGISTROS antes de continuar.`);
      } else {
        Alert.alert("No se envió la marcación", e?.message || "Revisa tus datos, GPS e internet.");
      }
    } finally { busyRef.current = false; setBusy(false); }
  };

  const resolverPendiente = (registro, estaEnSAP) => {
    if (busyRef.current) return;
    Alert.alert(estaEnSAP ? "¿Ya está en SAP?" : "¿No está en SAP?",
      `Verifica en SE16N / ZHCM_REGISTROS:\nNómina ${registro.numeroRegistro || numeroRegistro}\nFecha ${registro.date}\nHora ${registro.time}\nTipo ${TIPOS[registro.type]?.code || registro.type}\n\n` +
      (estaEnSAP ? "Solo confirma si encontraste esta fila. No habrá otro POST."
        : "Solo confirma si verificaste que NO existe. Reintentar después podría duplicar el registro."),
      [{ text: "Cancelar", style: "cancel" }, { text: "Confirmar verificación", onPress: async () => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true);
        try {
          const raw = await AsyncStorage.getItem(storageKey);
          const lista = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(lista)) throw Error("Acuses locales inválidos.");
          const actual = lista.find(r => r.id === registro.id);
          if (!actual || !["sending", "uncertain"].includes(actual.sapState)) throw Error("El estado ya cambió. Actualiza la pantalla.");
          const actualizado = lista.map(r => r.id !== registro.id ? r : ({ ...r,
            sapState: estaEnSAP ? "accepted" : "not_recorded_sap", manuallyReviewed: true,
            reviewedAt: new Date().toISOString(), reviewResult: estaEnSAP ? "present_in_se16n" : "absent_in_se16n" }));
          await persistir(actualizado);
          Alert.alert("Verificación guardada", "Solo se actualizó el estado del dispositivo; no se realizó un POST.");
        } catch (e) { Alert.alert("No se pudo guardar", e?.message || "Error local."); }
        finally { busyRef.current = false; setBusy(false); }
      }}]);
  };

  const guardarModalidad = async () => {
    if (busyRef.current || !ready) return;
    if (modalidad === "HomeOffice" && usadoHomeOffice) {
      Alert.alert("HomeOffice utilizado", "Ya hay una modalidad HomeOffice en esta semana."); return;
    }
    if (modalidad === "Viaje de negocios" && (!/^\d{4}-\d{2}-\d{2}$/.test(viajeDesde)
      || !/^\d{4}-\d{2}-\d{2}$/.test(viajeHasta) || viajeDesde > viajeHasta)) {
      Alert.alert("Fechas inválidas", "Introduce un rango de viaje válido AAAA-MM-DD."); return;
    }
    busyRef.current = true; setBusy(true);
    try {
      const local = {
        id: `${Date.now()}-modalidad`, personalNumber, type: "modalidad",
        modality: modalidad, date: hoy(), time: hora(), createdAt: new Date().toISOString(),
        ...(modalidad === "Viaje de negocios" ? { startDate: viajeDesde, endDate: viajeHasta } : {}),
        demo: false, sapState: "local_only", // Opción actual; no se envía a SAP.
      };
      await persistir([...records.filter(r => !(r.type === "modalidad" && r.date === hoy() && r.demo !== true)), local]);
      Alert.alert("Modalidad guardada", "Se guardó solo en este teléfono. No se envió a SAP.");
    } catch (e) { Alert.alert("Error", e?.message || "No se pudo guardar la modalidad."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  if (!personalNumber) return <SafeAreaView style={s.safe}><View style={s.empty}>
    <Ionicons name="person-circle-outline" size={40} color={C.red}/>
    <Text style={s.sectionTitle}>Primero selecciona un empleado</Text>
    <Action title="Volver a Recursos Humanos" onPress={() => router.replace("/rrhh")} icon="arrow-back"/>
  </View></SafeAreaView>;

  if (fetching || !ready) return <SafeAreaView style={s.safe}><View style={s.empty}>
    <ActivityIndicator color={C.red} size="large"/><Text style={s.muted}>Cargando check-in y acuses locales…</Text>
  </View></SafeAreaView>;

  if (fetchError || !employee) return <SafeAreaView style={s.safe}><View style={s.empty}>
    <Ionicons name="alert-circle-outline" size={36} color={C.danger}/>
    <Text style={s.sectionTitle}>No se pudo abrir Check-in</Text>
    <Text style={s.muted}>{fetchError || "No hay datos del empleado."}</Text>
    <Action title="Reintentar" icon="refresh" onPress={() => setRefresh(v => v + 1)}/>
    <Action title="Volver a RRHH" icon="arrow-back" outline onPress={() => router.replace("/rrhh")}/>
  </View></SafeAreaView>;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}><Text style={s.headerTitle}>Check-in</Text>
        <Text style={s.headerSub}>Registro de asistencia · SAP QAS</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/rrhh/historial",
        params: { personalNumber, numeroRegistro } })} style={s.headerHistory}>
        <Ionicons name="calendar-outline" size={22} color={C.red}/>
      </Pressable>
    </View>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <View style={s.employeeBar}>
          <View style={s.miniAvatar}><Ionicons name="person" size={22} color={C.red}/></View>
          <View style={{ flex: 1 }}><Text style={s.employeeName}>{employee.fullName || "Empleado"}</Text>
            <Text style={s.muted}>Nómina: {numeroRegistro} · {hoy()}</Text></View>
          <Ionicons name="checkmark-circle" size={21} color={C.green}/>
        </View>

        <View style={s.card}>
          <Section title="Mi jornada de hoy" subtitle="Estatus basado en acuses guardados en el dispositivo." icon="time-outline"/>
          <View style={[s.status, finJornada ? s.statusGreen : bloqueado ? s.statusAmber : s.statusBlue]}>
            <Ionicons name={finJornada ? "checkmark-circle-outline" : bloqueado ? "alert-circle-outline" : "ellipse-outline"}
              color={finJornada ? C.green : bloqueado ? C.amber : C.blue} size={19}/>
            <Text style={[s.statusText, { color: finJornada ? C.green : bloqueado ? C.amber : C.blue }]}>
              {bloqueado ? "Revisión pendiente de SAP" : estado}
            </Text>
          </View>
          <View style={s.timeline}>
            {ORDEN.map((tipo, i) => {
              const reg = ultimo(aceptados, tipo);
              return <View key={tipo} style={s.milestone}>
                <View style={[s.dot, reg && s.dotDone]}>
                  {reg ? <Ionicons name="checkmark" size={15} color={C.white}/> : <Text style={s.dotNumber}>{i+1}</Text>}
                </View>
                <Text numberOfLines={2} style={s.milestoneLabel}>{TIPOS[tipo].name}</Text>
                <Text style={[s.milestoneTime, reg && { color: C.green }]}>{reg?.time || "--:--"}</Text>
              </View>;
            })}
          </View>
        </View>

        {bloqueado && <View style={s.warningCard}>
          <Section title="Marcación sin confirmar" subtitle="No se permitirán nuevos envíos hasta revisar SAP." icon="alert-circle-outline"/>
          {pendientes.map(reg => <View key={reg.id} style={s.pendingItem}>
            <Text style={s.employeeName}>{TIPOS[reg.type]?.name || reg.type} · {reg.time}</Text>
            <Text style={s.muted}>Revisar en SE16N, tabla ZHCM_REGISTROS.</Text>
            <Action disabled={busy} title="Confirmé que SÍ está en SAP" icon="checkmark-circle-outline"
              onPress={() => resolverPendiente(reg, true)}/>
            <Action disabled={busy} title="Verifiqué que NO está en SAP" icon="alert-circle-outline" outline danger
              onPress={() => resolverPendiente(reg, false)}/>
          </View>)}
        </View>}

        <View style={s.card}>
          <Section title="Registrar asistencia" subtitle="Selecciona la acción correspondiente a tu jornada." icon="finger-print-outline"/>
          {!tieneEntrada && <>
            <Action title="Registrar entrada" icon="log-in-outline" disabled={busy || bloqueado}
              onPress={() => abrirConfirmacion("entrada")}/>
            <Action title="Entrada con retardo" icon="time-outline" outline disabled={busy || bloqueado}
              onPress={() => abrirConfirmacion("entrada", "late")}/>
          </>}
          {tieneEntrada && !finJornada && enComida && <Action title="Registrar regreso de comida"
            icon="play-outline" disabled={busy || bloqueado} onPress={() => abrirConfirmacion("comida_fin")}/>}
          {tieneEntrada && !finJornada && !enComida && <>
            {!inicioComida && <Action title="Iniciar comida" icon="restaurant-outline"
              disabled={busy || bloqueado} onPress={() => abrirConfirmacion("comida_inicio")}/>}
            <Action title="Registrar salida" icon="log-out-outline" outline
              disabled={busy || bloqueado} onPress={() => abrirConfirmacion("salida")}/>
            <Pressable accessibilityRole="button" disabled={busy || bloqueado}
              onPress={() => abrirConfirmacion("salida", "early")}
              style={[s.textLink, (busy || bloqueado) && s.disabled]}>
              <Text style={s.textLinkLabel}>Registrar salida anticipada</Text>
              <Ionicons name="chevron-forward" size={17} color={C.blue}/>
            </Pressable>
          </>}
          {finJornada && <View style={s.doneBox}>
            <Ionicons name="checkmark-circle-outline" size={24} color={C.green}/>
            <Text style={s.doneText}>La jornada cuenta con acuse de salida. No se enviarán más marcaciones de hoy desde este equipo.</Text>
          </View>}
          <Text style={s.note}>Al confirmar se captura GPS y hora del dispositivo y se envía la marcación a SAP QAS.</Text>
        </View>

        <View style={s.card}>
          <Pressable accessibilityRole="button" onPress={() => setExtraOpen(v => !v)} style={s.expandHeader}>
            <View style={{ flex: 1 }}><Text style={s.sectionTitle}>Datos opcionales</Text>
              <Text style={s.sectionSub}>Modalidad de trabajo y correo (no obligatorio).</Text></View>
            <Ionicons name={extraOpen ? "chevron-up" : "chevron-down"} size={21} color={C.sub}/>
          </Pressable>
          {extraOpen && <>
            <Text style={s.fieldTitle}>Correo de asistencia (opcional)</Text>
            <TextInput style={s.input} value={correo} onChangeText={setCorreo}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
              placeholder="Se puede dejar vacío" placeholderTextColor="#99A3B0"/>
            <Text style={s.note}>Si SAP no proporciona correo, se enviará Email vacío. La app ya no impide realizar el check-in.</Text>
            <View style={s.line}/>
            <Text style={s.fieldTitle}>Modalidad de trabajo</Text>
            {!!modalidadHoy && <Text style={s.sectionSub}>Guardada hoy: {modalidadHoy.modality}</Text>}
            {["Presencial", "HomeOffice", "Viaje de negocios"].map(m => <SmallChoice
              key={m} value={m} selected={modalidad === m} onPress={() => setModalidad(m)}
              disabled={m === "HomeOffice" && usadoHomeOffice}/>)}
            {modalidad === "Viaje de negocios" && <>
              <Text style={s.fieldTitle}>Fechas del viaje (AAAA-MM-DD)</Text>
              <TextInput style={s.input} value={viajeDesde} onChangeText={setViajeDesde} placeholder="Desde: 2026-10-21"/>
              <TextInput style={s.input} value={viajeHasta} onChangeText={setViajeHasta} placeholder="Hasta: 2026-10-22"/>
            </>}
            <Action title="Guardar modalidad en el teléfono" outline icon="save-outline"
              onPress={guardarModalidad} disabled={busy}/>
            <Text style={s.note}>La modalidad, el motivo y los comentarios son datos locales; no se envían por AttendanceRecordSet.</Text>
          </>}
        </View>

        <View style={s.card}>
          <Section title="Movimientos de hoy" subtitle="Acuses locales, no historial leído desde SAP." icon="list-outline"/>
          {registrosHoy.length === 0 ? <Text style={s.muted}>Aún no hay movimientos en este dispositivo.</Text> :
            registrosHoy.slice().reverse().map(reg => <View key={reg.id || `${reg.type}-${reg.time}`} style={s.recordLine}>
              <Ionicons name={TIPOS[reg.type]?.icon || "briefcase-outline"} color={C.red} size={19}/>
              <View style={{ flex: 1 }}><Text style={s.recordTitle}>{TIPOS[reg.type]?.name || "Modalidad de trabajo"}</Text>
                <Text style={s.muted}>{reg.type === "modalidad" ? (reg.modality || "Local") :
                  reg.sapState === "accepted" ? (reg.manuallyReviewed ? "Verificado manualmente en SAP" : `Acuse HTTP ${reg.httpStatus || "2xx"}`) :
                  reg.sapState === "not_recorded_sap" ? "No encontrado al verificar SAP" :
                  ["sending", "uncertain"].includes(reg.sapState) ? "Sin confirmación" : "Solo local"}</Text></View>
              <Text style={s.recordTime}>{reg.time || "--:--"}</Text>
            </View>)}
        </View>

        <Action title="Ver historial de asistencias" outline icon="calendar-outline"
          onPress={() => router.push({ pathname: "/rrhh/historial", params: { personalNumber, numeroRegistro } })}/>
        <Text style={[s.note, { textAlign: "center" }]}>QAS · El registro de identidad manual es únicamente para pruebas.</Text>
      </ScrollView>
    </KeyboardAvoidingView>

    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => { if (!busy) setDialog(null); }}>
      <View style={s.modalOverlay}><View style={s.modalCard}>
        <View style={s.modalIcon}><Ionicons name="finger-print-outline" size={25} color={C.red}/></View>
        <Text style={s.modalTitle}>Confirmar {TIPOS[dialog?.type]?.name?.toLowerCase() || "marcación"}</Text>
        <Text style={s.modalText}>Se enviará {TIPOS[dialog?.type]?.code} a SAP QAS para la nómina {numeroRegistro}. La ubicación y la hora se obtendrán al confirmar.</Text>
        {dialog?.variant !== "normal" && !!dialog && <View style={{ gap: 10, width: "100%" }}>
          <Text style={s.fieldTitle}>Motivo de {dialog.variant === "late" ? "retardo" : "salida anticipada"}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["Laboral", "Personal"].map(m => <View key={m} style={{ flex: 1 }}>
              <SmallChoice value={m} selected={motivo === m} onPress={() => setMotivo(m)}/>
            </View>)}
          </View>
          <TextInput style={[s.input, { minHeight: 70, textAlignVertical: "top" }]} multiline
            value={comentario} onChangeText={setComentario} placeholder="Comentario (opcional)"/>
          <Text style={s.note}>El motivo y comentario se guardan solo en el dispositivo, no en SAP.</Text>
        </View>}
        <Action title={busy ? "Registrando…" : "Confirmar y enviar"} icon="checkmark-circle-outline"
          disabled={busy} onPress={registrar}/>
        <Action title="Cancelar" icon="close-outline" outline disabled={busy} onPress={() => setDialog(null)}/>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.white, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 30, height: 40, justifyContent: "center" },
  headerTitle: { fontWeight: "800", color: C.ink, fontSize: 19 },
  headerSub: { color: C.sub, fontSize: 11, marginTop: 3 },
  headerHistory: { width: 39, height: 39, borderRadius: 12, backgroundColor: C.pale, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 42, gap: 14 },
  employeeBar: { borderWidth: 1, borderColor: C.border, padding: 14, borderRadius: 16, backgroundColor: C.white, flexDirection: "row", alignItems: "center", gap: 12 },
  miniAvatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.pale, justifyContent: "center", alignItems: "center" },
  employeeName: { fontWeight: "700", color: C.ink, fontSize: 14 },
  muted: { color: C.sub, fontSize: 12, lineHeight: 18 },
  card: { padding: 16, gap: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17 },
  sectionTitleLine: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  sectionSub: { color: C.sub, fontSize: 12, lineHeight: 18, marginTop: 4 },
  status: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  statusBlue: { backgroundColor: C.blueBg },
  statusGreen: { backgroundColor: C.greenBg },
  statusAmber: { backgroundColor: C.amberBg },
  statusText: { fontWeight: "700", fontSize: 13 },
  timeline: { flexDirection: "row", justifyContent: "space-between", gap: 2, paddingTop: 4 },
  milestone: { flex: 1, alignItems: "center", gap: 5 },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#E8EAF0", justifyContent: "center", alignItems: "center" },
  dotDone: { backgroundColor: C.green },
  dotNumber: { color: C.sub, fontWeight: "800", fontSize: 12 },
  milestoneLabel: { color: C.ink, fontSize: 10, lineHeight: 13, fontWeight: "600", textAlign: "center", minHeight: 27 },
  milestoneTime: { color: C.sub, fontSize: 12, fontWeight: "800" },
  warningCard: { backgroundColor: C.amberBg, borderColor: "#ECD7AC", borderWidth: 1, borderRadius: 17, padding: 16, gap: 12 },
  pendingItem: { borderTopWidth: 1, borderTopColor: "#ECD7AC", paddingTop: 13, gap: 9 },
  action: { backgroundColor: C.red, minHeight: 49, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  actionOutline: { backgroundColor: C.white, borderColor: "#E6B2B5", borderWidth: 1 },
  actionDanger: { borderColor: "#E8ADAF" },
  actionText: { color: C.white, fontWeight: "800", fontSize: 13.5, textAlign: "center", flexShrink: 1 },
  disabled: { opacity: .48 }, pressed: { opacity: .75 },
  doneBox: { backgroundColor: C.greenBg, padding: 13, flexDirection: "row", gap: 10, borderRadius: 11, alignItems: "center" },
  doneText: { flex: 1, color: C.green, fontSize: 12, lineHeight: 19 },
  note: { color: C.sub, fontSize: 11, lineHeight: 17 },
  textLink: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, padding: 6 },
  textLinkLabel: { color: C.blue, fontWeight: "700", fontSize: 13 },
  expandHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  fieldTitle: { color: C.ink, fontSize: 12, fontWeight: "700" },
  input: { color: C.ink, fontSize: 13, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: "#FBFCFD", paddingHorizontal: 12, paddingVertical: 12 },
  line: { height: 1, backgroundColor: C.border },
  choice: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 12, paddingVertical: 11, backgroundColor: C.white, borderRadius: 11, borderWidth: 1, borderColor: C.border },
  choiceSelected: { borderColor: C.red, backgroundColor: C.pale },
  choiceText: { color: C.ink, fontSize: 12, fontWeight: "600" },
  recordLine: { borderTopWidth: 1, borderTopColor: C.border, flexDirection: "row", alignItems: "center", paddingTop: 13, gap: 10 },
  recordTitle: { fontWeight: "700", color: C.ink, fontSize: 12.5 },
  recordTime: { fontWeight: "800", color: C.ink, fontSize: 12 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 26, gap: 15 },
  modalOverlay: { flex: 1, backgroundColor: "#00000080", justifyContent: "center", padding: 19 },
  modalCard: { backgroundColor: C.white, borderRadius: 19, padding: 19, gap: 15, alignItems: "stretch", maxHeight: "90%" },
  modalIcon: { alignSelf: "center", backgroundColor: C.pale, borderRadius: 30, width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  modalTitle: { color: C.ink, fontSize: 19, fontWeight: "800", textAlign: "center" },
  modalText: { color: C.sub, fontSize: 13, lineHeight: 20, textAlign: "center" },
});