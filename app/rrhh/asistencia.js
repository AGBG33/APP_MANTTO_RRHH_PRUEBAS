// app/rrhh/asistencia.js
// Proceso de asistencia de RR. HH. vinculado al empleado consultado en EmployeeSet.
// Entrada, comida y salida se envian mediante POST a SAP QAS.
// Modalidad, motivos y comentarios siguen siendo locales (no hay POST de justificaciones).
// El historial local contiene acuses de HTTP 2xx; no reemplaza AttendanceHistorySet.
// QAS: envio incierto se resuelve manualmente tras comparar los datos en SE16N.
// Mantén el antiguo app/rrhh/asistencia.js como asistencia-respaldo.js
// para conservar las pantallas completas del prototipo anterior.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { obtenerEmpleadoRH } from "../../src/services/rhEmployees";
import { prepararMarcacionRH, enviarMarcacionRH, obtenerIdentificadorDispositivoRH } from "../../src/services/rhAttendance";

const C = {
  bg: "#F3F5F8", white: "#FFFFFF", text: "#1F2937", sub: "#596579",
  border: "#E5E9EF", red: "#E60012", redPale: "#FFF0F1",
  green: "#18794E", greenPale: "#EAF7F0", blue: "#355C7D",
  amber: "#94600C", amberPale: "#FFF7E8", danger: "#B42332",
};
const LOCAL_PREFIX = "rh:demo:attendance:v2:";
const PAD = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
};
const nowTime = () => {
  const d = new Date();
  return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`;
};
const show = (v) => String(v ?? "").trim() || "No registrado en SAP";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function weekStart(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
}

function BigButton({ title, icon = "checkmark-circle-outline", onPress, disabled, light = false }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.bigButton, light && s.lightButton, disabled && s.disabled, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name={icon} size={19} color={light ? C.red : C.white} />
      <Text style={[s.buttonText, light && { color: C.red }]}>{title}</Text>
    </Pressable>
  );
}
function Info({ label, value }) {
  return <View style={s.infoItem}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{show(value)}</Text></View>;
}
function EmployeeCard({ employee }) {
  const name = show(employee.fullName);
  const initials = name.split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase();
  return <View style={s.employeeCard}>
    <View style={s.employeeTop}>
      <View style={s.avatar}><Text style={s.avatarText}>{initials || "RH"}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.employeeName}>{name}</Text>
        <Text style={s.muted}>Empleado {show(employee.personalNumber)}</Text>
      </View>
    </View>
    <View style={s.grid}>
      <Info label="Puesto" value={employee.position} />
      <Info label="Estatus" value={employee.status} />
      <Info label="Turno" value={employee.shift} />
      <Info label="Horario" value={employee.hourly} />
      <Info label="Base" value={employee.base} />
      <Info label="Centro / Oficina" value={employee.centerOffice} />
    </View>
  </View>;
}
function Scenario({ title, detail, icon, onPress, disabled }) {
  return <Pressable disabled={disabled} accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [s.actionRow, disabled && s.disabled, pressed && { opacity: .7 }]}
  >
    <View style={s.actionIcon}><Ionicons name={icon} color={C.red} size={22} /></View>
    <View style={{ flex: 1 }}><Text style={s.actionTitle}>{title}</Text><Text style={s.muted}>{detail}</Text></View>
    <Ionicons name="chevron-forward" size={19} color={C.sub} />
  </Pressable>;
}
function SectionTitle({ title, subtitle }) {
  return <View style={{ gap: 3 }}><Text style={s.sectionTitle}>{title}</Text><Text style={s.muted}>{subtitle}</Text></View>;
}
function Confirmation({ value, onDismiss, onConfirm }) {
  return <Modal transparent visible={!!value} animationType="fade" onRequestClose={onDismiss}>
    <View style={s.overlay}>
      <View style={s.modalCard}>
        <View style={s.modalIcon}><Ionicons name="help-circle-outline" size={28} color={C.red} /></View>
        <Text style={s.sectionTitle}>{value?.title || "Confirmación"}</Text>
        <Text style={[s.muted, { textAlign: "center" }]}>{value?.detail}</Text>
        <Text style={s.warning}>
          {value?.type === "modalidad"
            ? "La modalidad se guarda solo en este telefono (no tiene POST SAP)."
            : "Esta marcacion SI se enviara a SAP QAS con ubicacion GPS, fecha y hora actuales."}
        </Text>
        <BigButton title={value?.type === "modalidad" ? "Guardar modalidad local" : "Confirmar y enviar a SAP"} onPress={onConfirm} />
        <BigButton light title="Cancelar" icon="close-outline" onPress={onDismiss} />
      </View>
    </View>
  </Modal>;
}
function Empty({ title, detail, retry }) {
  return <SafeAreaView style={s.safe}>
    <View style={s.center}>
      <Ionicons name="alert-circle-outline" color={C.red} size={38} />
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={[s.muted, { textAlign: "center" }]}>{detail}</Text>
      {retry && <BigButton title="Reintentar consulta" icon="refresh-outline" onPress={retry} />}
      <BigButton light title="Volver a RR. HH." icon="arrow-back" onPress={() => router.replace("/rrhh")} />
    </View>
  </SafeAreaView>;
}

export default function RHAsistencia() {
  const params = useLocalSearchParams();
  const personalNumber = useMemo(() => {
    const input = Array.isArray(params.personalNumber) ? params.personalNumber[0] : params.personalNumber;
    const text = String(input ?? "").trim();
    return /^\d{1,8}$/.test(text) ? text.padStart(8, "0") : "";
  }, [params.personalNumber]);

  // Numero mostrado en la busqueda: 8 digitos. Numero POST: exactamente el ingresado.
  const numeroRegistro = useMemo(() => {
    const input = Array.isArray(params.numeroRegistro) ? params.numeroRegistro[0] : params.numeroRegistro;
    const raw = String(input ?? "").trim();
    return /^\d{1,8}$/.test(raw) && raw.padStart(8, "0") === personalNumber ? raw : "";
  }, [params.numeroRegistro, personalNumber]);
  const correoRegistro = useMemo(() => {
    const input = Array.isArray(params.correoRegistro) ? params.correoRegistro[0] : params.correoRegistro;
    return String(input ?? "").trim();
  }, [params.correoRegistro]);

  const [employee, setEmployee] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchAttempt, setFetchAttempt] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState([]);
  const [stage, setStage] = useState("modalidad");
  const [modality, setModality] = useState("Presencial");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const storageKey = `${LOCAL_PREFIX}${personalNumber}`;

  // PRUEBA DE ID: solo al abrir Asistencia, sin hacer POST ni pedir GPS.
  // Se usa para verificar el identificador antes de registrarlo en SAP.
  useEffect(() => {
    let vigente = true;
    obtenerIdentificadorDispositivoRH()
      .then((id) => {
        if (vigente && __DEV__) {
          console.log("[RH ID PRUEBA SIN POST]", {
            idParaSAP: id,
            caracteres: id.length,
            sistema: Platform.OS,
          });
        }
      })
      .catch((error) => {
        if (vigente) console.warn("[RH ID ERROR]", error?.message || String(error));
      });
    return () => { vigente = false; };
  }, []);


  // Solo se consulta una identidad indicada por la pantalla de RR. HH.
  // Si se abre esta ruta directamente sin número, mostramos un estado seguro.
  useEffect(() => {
    if (!personalNumber) return undefined;
    let active = true;
    setEmployee(null);
    setStage("modalidad");
    setReason("");
    setComment("");
    setDialog(null);
    setFetchError("");
    setFetching(true);
    obtenerEmpleadoRH(personalNumber)
      .then(result => {
        if (!active) return;
        if (!result || result.personalNumber !== personalNumber) {
          setFetchError("No se pudo verificar el número de empleado en SAP.");
          return;
        }
        setEmployee(result);
      })
      .catch(error => { if (active) setFetchError(error?.message || "No se pudo consultar SAP."); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [personalNumber, fetchAttempt]);

  // Los registros simulados se aíslan por número de personal, nunca se mezclan.
  useEffect(() => {
    if (!personalNumber) return undefined;
    let active = true;
    setReady(false);
    setRecords([]);
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!active) return;
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw Error("Formato de registros local inválido");
        setRecords(parsed);
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setFetchError("No se pudieron leer los registros de prueba guardados en este dispositivo.");
          setReady(false);
        }
      });
    return () => { active = false; };
  }, [personalNumber, storageKey, loadAttempt]);

  // Los datos DEMO antiguos permanecen en almacenamiento local, pero NO cuentan
  // como marcaciones SAP: no bloquean una prueba nueva.
  const daily = useMemo(() => records.filter(r => r.date === today() && (r.sapState === "accepted" || r.sapState === "uncertain" || r.sapState === "sending")), [records]);
  const uncertain = daily.filter(r => r.sapState === "uncertain" || r.sapState === "sending");
  const acceptedToday = daily.filter(r => r.sapState === "accepted");
  const latest = (type) => acceptedToday.findLast ? acceptedToday.findLast(r => r.type === type) : acceptedToday.slice().reverse().find(r => r.type === type);
  const blockedByUncertain = uncertain.length > 0 || daily.some(r => r.sapState === "sending");
  const started = !!latest("entrada");
  const finished = !!latest("salida");
  const paused = !!latest("comida_inicio") && !latest("comida_fin");
  const breakComplete = !!latest("comida_fin");
  const usedHomeOffice = records.some(r => r.type === "modalidad" && r.modality === "HomeOffice" && weekStart(r.date) === weekStart(today()));
  const currentStage = !started ? "pendiente" : finished ? "finalizada" : paused ? "comida" : "jornada";

  const save = useCallback(async (type, extra = {}) => {
    if (!ready || busyRef.current || !personalNumber || !employee) return;
    busyRef.current = true;
    setBusy(true);
    let registroPendiente = null;
    let ultimoListado = records;
    let envioIniciado = false;

    // Esta funcion escribe el estado local antes y despues del POST.
    const guardar = async (lista) => {
      await AsyncStorage.setItem(storageKey, JSON.stringify(lista));
      ultimoListado = lista;
      setRecords(lista);
    };

    try {
      if (type === "modalidad") {
        const local = [...records, {
          id: `${Date.now()}-modalidad`, personalNumber, type,
          date: today(), time: nowTime(), createdAt: new Date().toISOString(),
          ...extra, demo: true, sapState: "local_only",
        }];
        await guardar(local);
        setStage("inicio");
        setDialog(null);
        return;
      }

      if (!numeroRegistro || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoRegistro)) {
        throw new Error("Regresa a RR. HH. y confirma el numero y correo de prueba.");
      }
      // Una respuesta incierta se debe verificar ANTES de volver a mandar cualquier evento.
      if (records.some(r => r.date === today() && (r.sapState === "uncertain" || r.sapState === "sending"))) {
        throw new Error("Existe una marcacion sin confirmar. Revisa ZHCM_REGISTROS antes de continuar.");
      }
      if (records.some(r => r.date === today() && r.type === type && (r.sapState === "accepted" || r.sapState === "sending"))) {
        throw new Error("Esta marcacion ya fue enviada hoy desde este dispositivo.");
      }

      // Obtener GPS y hora DESPUES de confirmar, no al abrir la pantalla.
      const { payload, gpsAccuracyMeters } = await prepararMarcacionRH({
        personalNumber: numeroRegistro,
        fullName: employee.fullName,
        email: correoRegistro,
        type,
      });

      registroPendiente = {
        id: `${Date.now()}-${type}-${Math.random().toString(36).slice(2, 7)}`,
        personalNumber, numeroRegistro, email: correoRegistro, type,
        date: payload.EnterDate, time: payload.EnterHour.slice(0, 5),
        createdAt: new Date().toISOString(),
        registerType: payload.RegisterType,
        gpsAccuracyMeters,
        ...extra,
        demo: false, sapState: "sending",
      };
      // Escribir ANTES de enviar: si la app se cierra durante el POST, al reabrir
      // el registro sigue como 'sending' y se tratara como incierto.
      await guardar([...records, registroPendiente]);
      envioIniciado = true;
      const respuesta = await enviarMarcacionRH(payload);

      const confirmado = { ...registroPendiente, sapState: "accepted", httpStatus: respuesta.httpStatus, sapMessage: respuesta.message };
      try {
        await guardar(ultimoListado.map(r => r.id === registroPendiente.id ? confirmado : r));
      } catch (errorLocal) {
        // SAP ya respondio 2xx: no reintentar POST por un error del almacenamiento.
        setRecords(prev => prev.map(r => r.id === registroPendiente.id ? confirmado : r));
        Alert.alert("SAP respondio correctamente", "La marcacion obtuvo respuesta HTTP exitosa, pero no se pudo guardar el acuse local. NO vuelvas a enviarla sin revisar SAP.");
        setDialog(null);
        return;
      }
      setDialog(null);
      setReason("");
      setComment("");
      if (type === "salida") setStage("resumen");
      if (type === "entrada" || type === "comida_fin") setStage("jornada");
      if (type === "comida_inicio") setStage("comida");
      Alert.alert("Respuesta de SAP QAS", `Marcacion ${payload.RegisterType}: HTTP ${respuesta.httpStatus}. Comprueba su persistencia en SE16N mientras el historial OData siga en revision.`);
    } catch (e) {
      if (envioIniciado && registroPendiente) {
        setDialog(null);
        const incierto = { ...registroPendiente, sapState: "uncertain" };
        try {
          await guardar(ultimoListado.map(r => r.id === registroPendiente.id ? incierto : r));
        } catch (_) {
          setRecords(prev => prev.map(r => r.id === registroPendiente.id ? incierto : r));
        }
        Alert.alert("Resultado del envio incierto", `${e?.message || "Error del servicio"}\n\nNo se reenviara automaticamente. Verifica en SAP si se guardo antes de reintentar.`);
      } else {
        Alert.alert("No se envio la marcacion", e?.message || "Revisa GPS, internet y la informacion del empleado.");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [employee, numeroRegistro, correoRegistro, personalNumber, ready, records, storageKey]);

  // SOLO QAS: resolucion MANUAL de una marcacion cuyo resultado es incierto.
  // NO consulta SAP, NO hace POST, NO borra los registros locales.
  // El usuario debe cotejar personalmente numero, fecha, hora y tipo en SE16N.
  const resolverEnvioPendiente = useCallback((registro, apareceEnSAP) => {
    if (!registro?.id || busyRef.current) return;
    const etiqueta = ({ entrada: "P10 (entrada)", comida_inicio: "P15 (inicio comida)",
      comida_fin: "P25 (regreso comida)", salida: "P20 (salida)" })[registro.type] || registro.type;
    const descripcion = `Empleado: ${registro.numeroRegistro || numeroRegistro}\nFecha: ${registro.date}\nHora aproximada: ${registro.time}\nTipo: ${etiqueta}`;
    const pregunta = apareceEnSAP
      ? "Confirma SOLO si encontraste esta marcacion en SE16N, tabla ZHCM_REGISTROS. Se anotara como verificada localmente. No se enviara un nuevo POST."
      : "Confirma SOLO si comprobaste en SE16N, tras actualizar y esperar, que esta marcacion NO existe. Se conservara el registro local como NO CONFIRMADO EN SAP y se habilitara una nueva marcacion manual. Podria duplicarse si SAP la guardo despues.";

    Alert.alert(
      apareceEnSAP ? "¿Encontraste la marcacion en SAP?" : "¿Seguro que NO esta en SAP?",
      `${descripcion}\n\n${pregunta}`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: apareceEnSAP ? "Si, esta en SAP" : "No esta en SAP", onPress: async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          try {
            // Lee siempre el valor actual de almacenamiento para no pisar cambios.
            const raw = await AsyncStorage.getItem(storageKey);
            const lista = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(lista)) throw new Error("Los acuses locales tienen un formato invalido.");
            const encontrado = lista.find(r => r.id === registro.id);
            if (!encontrado || (encontrado.sapState !== "uncertain" && encontrado.sapState !== "sending")) {
              throw new Error("Este pendiente ya fue modificado. Vuelve a abrir la pantalla.");
            }
            const actualizados = lista.map(r => r.id !== registro.id ? r : {
              ...r,
              sapState: apareceEnSAP ? "accepted" : "not_recorded_sap",
              manuallyReviewed: true,
              reviewResult: apareceEnSAP ? "present_in_se16n" : "absent_in_se16n",
              reviewedAt: new Date().toISOString(),
              ...(apareceEnSAP ? { sapMessage: "Verificado manualmente en SE16N (sin HTTP confirmado)" } : {}),
            });
            await AsyncStorage.setItem(storageKey, JSON.stringify(actualizados));
            setRecords(actualizados);
            setDialog(null);
            Alert.alert(
              "Revision local guardada",
              apareceEnSAP
                ? "Marcacion reconocida como existente en SAP. No se realizo un nuevo envio."
                : "Se conservo el acuse anterior como NO encontrado en SAP. Si intentas registrar otra vez, sera un POST nuevo y deberas confirmarlo manualmente."
            );
          } catch (e) {
            Alert.alert("No se pudo actualizar el acuse", e?.message || "No se modifico el almacenamiento local.");
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        } },
      ]
    );
  }, [storageKey, numeroRegistro]);

  const retry = () => { setFetchAttempt(x => x + 1); setLoadAttempt(x => x + 1); };

  const confirm = (type, title, detail, extra = {}) => {
    if (busyRef.current) return;
    if (type !== "modalidad" && blockedByUncertain) {
      Alert.alert("Marcacion pendiente de revisar", "Revisa el resultado anterior en SAP antes de volver a enviar.");
      return;
    }
    setDialog({ type, title, detail, extra });
  };
  const confirmNow = async () => {
    if (!dialog) return;
    await save(dialog.type, dialog.extra);
  };

  if (!personalNumber) return <Empty title="Selecciona un empleado" detail="Entra desde Recursos Humanos y consulta primero el número de empleado." />;
  if (!numeroRegistro || !correoRegistro) return <Empty title="Faltan datos de prueba" detail="Vuelve a RR. HH. para seleccionar el numero de nomina y el correo que se enviaran a SAP." />;
  if (fetching || !ready) {
    // Un error de almacenamiento también termina el flujo de carga, sin bloquear permanentemente.
    if (fetchError && !fetching) return <Empty title="No se pudo abrir asistencia" detail={fetchError} retry={retry} />;
    return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator size="large" color={C.red}/><Text style={s.muted}>Consultando empleado y acuses locales…</Text></View></SafeAreaView>;
  }
  if (fetchError || !employee) return <Empty title="No se pudo verificar el empleado" detail={fetchError || "No se recibieron datos."} retry={retry} />;

  // POST real solo para pruebas QAS; no es una autenticacion del empleado.
  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.headerButton}>
        <Ionicons name="chevron-back" size={24} color={C.text}/>
      </Pressable>
      <View style={s.brand}><Text style={s.brandText}>RH</Text></View>
      <View style={{ flex: 1 }}><Text style={s.headerTitle}>Mi asistencia</Text><Text style={s.muted}>Recursos Humanos</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cambiar empleado" onPress={() => router.replace("/rrhh")} style={s.headerButton}>
        <Ionicons name="person-outline" size={22} color={C.text}/>
      </Pressable>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <EmployeeCard employee={employee}/>
        <View style={s.banner}>
          <Ionicons name="flask-outline" size={21} color={C.amber}/>
          <Text style={s.bannerText}>Modo QAS: entrada, comida y salida SI se envian a SAP. Modalidad y motivos se guardan solo localmente. Identidad manual de pruebas: {numeroRegistro} · {correoRegistro}.</Text>
        </View>
        {blockedByUncertain && <View style={s.card}>
          <SectionTitle title="Envio pendiente de verificar en SAP" subtitle="El telefono conserva una marcacion sin confirmacion. Para evitar duplicados, el envio esta bloqueado. No se reenviara automaticamente."/>
          <Text style={s.warning}>Abre SE16N, tabla ZHCM_REGISTROS, y compara numero de empleado, fecha, hora y tipo de marcacion. Actualiza la consulta antes de decidir.</Text>
          {uncertain.map(item => <View key={item.id} style={{ gap: 8, paddingVertical: 7, borderBottomColor: C.border, borderBottomWidth: 1 }}>
            <Text style={s.actionTitle}>{({ entrada: "P10 - Entrada", comida_inicio: "P15 - Inicio de comida", comida_fin: "P25 - Regreso de comida", salida: "P20 - Salida" })[item.type] || item.type}</Text>
            <Text style={s.muted}>Nomina: {item.numeroRegistro || numeroRegistro} · Fecha: {item.date} · Hora aprox.: {item.time} · Estado local: {item.sapState}</Text>
            <BigButton title="Ya confirme que SI esta en SAP" icon="checkmark-circle-outline" disabled={busy} onPress={() => resolverEnvioPendiente(item, true)}/>
            <BigButton title="Verifique que NO esta en SAP" icon="alert-circle-outline" light disabled={busy} onPress={() => resolverEnvioPendiente(item, false)}/>
          </View>)}
          <Text style={s.muted}>Esta revision solo modifica el acuse local en este emulador. No modifica SAP ni verifica automaticamente el servidor. Ante cualquier duda, NO desbloquees el envio.</Text>
        </View>}
        <View style={s.card}>
          <Text style={s.smallUpper}>ESTADO DE JORNADA (ACUSES LOCALES DE QAS)</Text>
          <Text style={s.stageTitle}>{currentStage === "pendiente" ? "Pendiente de entrada" : currentStage === "finalizada" ? "Jornada finalizada" : currentStage === "comida" ? "En pausa de comida" : "Jornada en curso"}</Text>
          <Text style={s.muted}>Fecha: {today()} · Entrada: {latest("entrada")?.time || "Sin registro"} · Salida: {latest("salida")?.time || "Sin registro"}</Text>
        </View>

        {!started && !finished && stage === "modalidad" && <View style={s.card}>
          <SectionTitle title="Modalidad de trabajo" subtitle="Se almacena localmente. No se envia este dato a SAP."/>
          {["Presencial", "HomeOffice", "Viaje de negocios"].map(m => <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: modality === m }}
            disabled={m === "HomeOffice" && usedHomeOffice}
            onPress={() => setModality(m)} style={[s.choice, modality === m && s.choiceActive, m === "HomeOffice" && usedHomeOffice && s.disabled]}>
            <Ionicons name={modality === m ? "radio-button-on" : "radio-button-off"} size={22} color={modality === m ? C.red : C.sub}/>
            <Text style={s.actionTitle}>{m === "HomeOffice" && usedHomeOffice ? "HomeOffice (ya utilizado esta semana)" : m}</Text>
          </Pressable>)}
          {modality === "Viaje de negocios" && <View style={{ gap: 8 }}>
            <Text style={s.muted}>Rango de viaje (AAAA-MM-DD)</Text>
            <TextInput style={s.input} placeholder="Fecha inicial" value={tripStart} onChangeText={setTripStart} autoCapitalize="none" />
            <TextInput style={s.input} placeholder="Fecha final" value={tripEnd} onChangeText={setTripEnd} autoCapitalize="none" />
          </View>}
          <BigButton title="Continuar" disabled={busy || (modality === "HomeOffice" && usedHomeOffice) || (modality === "Viaje de negocios" && (!DATE_PATTERN.test(tripStart) || !DATE_PATTERN.test(tripEnd) || tripStart > tripEnd))}
            onPress={() => confirm("modalidad", "Confirmar modalidad", `Modalidad seleccionada: ${modality}`, { modality, ...(modality === "Viaje de negocios" ? { tripStart, tripEnd } : {}) })}/>
        </View>}

        {!started && !finished && stage !== "modalidad" && stage !== "retardo" && <View style={s.card}>
          <SectionTitle title="Registro de entrada" subtitle="Se enviara P10 a SAP QAS con GPS, fecha y hora del telefono."/>
          <BigButton disabled={busy || blockedByUncertain} title="Registrar inicio de labores" icon="log-in-outline" onPress={() => confirm("entrada", "Registrar entrada", `Se registrará entrada a las ${nowTime()}.`)} />
          <BigButton light title="Volver a modalidad" icon="business-outline" onPress={() => setStage("modalidad")}/>
          <Scenario title="Simular entrada con retardo" detail="Añadir motivo y comentario" icon="time-outline" onPress={() => setStage("retardo")}/>
        </View>}

        {!started && stage === "retardo" && <View style={s.card}>
          <SectionTitle title="Entrada con retardo" subtitle="P10 se envia a SAP; el motivo no se envia en este endpoint."/>
          {["Laboral", "Personal"].map(r => <Pressable key={r} style={[s.choice, reason === r && s.choiceActive]} onPress={() => setReason(r)}><Ionicons name={reason === r ? "radio-button-on" : "radio-button-off"} color={C.red} size={20}/><Text>{r}</Text></Pressable>)}
          <TextInput style={[s.input, { minHeight: 80 }]} value={comment} onChangeText={setComment} multiline placeholder="Comentario (opcional)"/>
          <BigButton disabled={busy || blockedByUncertain || !reason} title="Registrar entrada con retardo" onPress={() => confirm("entrada", "Entrada con retardo", `Motivo: ${reason}`, { late: true, reason, comment })} />
        </View>}

        {started && !finished && !paused && stage !== "salida_anticipada" && <View style={s.card}>
          <SectionTitle title="Jornada de pruebas QAS" subtitle="Las siguientes marcaciones se envian mediante POST a SAP."/>
          {!breakComplete && <BigButton title="Iniciar pausa de comida" icon="restaurant-outline" disabled={busy || blockedByUncertain} onPress={() => confirm("comida_inicio", "Iniciar comida", `Inicio de comida: ${nowTime()}`)}/>} 
          <BigButton light title="Registrar salida normal" icon="log-out-outline" disabled={busy || blockedByUncertain} onPress={() => confirm("salida", "Finalizar jornada", `Salida: ${nowTime()}`, { early: false })}/>
          <BigButton light title="Salida anticipada" icon="time-outline" disabled={busy} onPress={() => setStage("salida_anticipada")}/>
        </View>}

        {started && !finished && paused && <View style={s.card}>
          <SectionTitle title="Pausa de comida" subtitle={`Pausa iniciada a las ${latest("comida_inicio")?.time || "--:--"}.`}/>
          <BigButton disabled={busy || blockedByUncertain} title="Registrar regreso de comida" icon="play-outline" onPress={() => confirm("comida_fin", "Regresar de comida", `Hora de regreso: ${nowTime()}`)}/>
        </View>}

        {started && !finished && !paused && stage === "salida_anticipada" && <View style={s.card}>
          <SectionTitle title="Salida anticipada" subtitle="P20 se envia a SAP; el motivo aun se guarda solo en el telefono."/>
          {["Laboral", "Personal"].map(r => <Pressable key={r} style={[s.choice, reason === r && s.choiceActive]} onPress={() => setReason(r)}><Ionicons name={reason === r ? "radio-button-on" : "radio-button-off"} color={C.red} size={20}/><Text>{r}</Text></Pressable>)}
          <TextInput style={[s.input, { minHeight: 80 }]} value={comment} onChangeText={setComment} multiline placeholder="Comentario (opcional)"/>
          <BigButton disabled={busy || blockedByUncertain || !reason} title="Confirmar salida anticipada" onPress={() => confirm("salida", "Confirmar salida anticipada", `Motivo: ${reason}`, { early: true, reason, comment })}/>
        </View>}

        {finished && <View style={[s.card, s.finishCard]}>
          <Ionicons name="checkmark-circle-outline" size={43} color={C.green}/>
          <SectionTitle title="Jornada enviada a QAS" subtitle="SAP respondio a las solicitudes. Este resumen se almacena localmente; verifica los registros en SE16N."/>
          <Info label="Entrada" value={latest("entrada")?.time}/>
          <Info label="Inicio comida" value={latest("comida_inicio")?.time}/>
          <Info label="Regreso comida" value={latest("comida_fin")?.time}/>
          <Info label="Salida" value={latest("salida")?.time}/>
          <Info label="Tipo de salida" value={latest("salida")?.early ? "Anticipada" : "Normal"}/>
        </View>}

        <View style={s.card}>
          <SectionTitle title="Movimientos de hoy" subtitle="Acuses locales de respuestas de SAP QAS (no consulta historial SAP)."/>
          {daily.length === 0 ? <Text style={s.muted}>No hay marcaciones QAS registradas en este telefono hoy.</Text> : daily.slice().reverse().map(item => <View key={item.id} style={s.recordRow}><Text style={s.recordText}>{({ entrada: "Entrada P10", comida_inicio: "Inicio comida P15", comida_fin: "Regreso comida P25", salida: "Salida P20" })[item.type] || item.type}{item.late ? " (retardo: motivo local)" : ""}</Text><Text style={s.muted}>{item.time} · {item.sapState === "accepted" ? (item.manuallyReviewed ? "Verificado en SE16N" : `HTTP ${item.httpStatus}`) : "SIN CONFIRMAR"}</Text></View>)}
        </View>
        <View style={s.card}>
          <SectionTitle title="Pantallas anteriores" subtitle="Puedes conservar el prototipo completo de 16 escenarios sin perder el trabajo anterior."/>
          <Scenario title="Abrir prototipo anterior" icon="albums-outline" detail="Escenarios visuales anteriores (datos de ejemplo, no SAP)" onPress={() => router.push("/rrhh/asistencia-respaldo")}/>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Pressable onPress={() => router.replace("/inicio")} style={s.nav}><Ionicons name="home-outline" color={C.sub} size={22}/><Text style={s.navText}>Inicio</Text></Pressable>
        <View style={s.nav}><Ionicons name="time" color={C.red} size={22}/><Text style={[s.navText, { color: C.red }]}>Asistencia</Text></View>
        <Pressable onPress={() => router.replace("/rrhh")} style={s.nav}><Ionicons name="person-outline" color={C.sub} size={22}/><Text style={s.navText}>Empleado</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
    <Confirmation value={dialog} onDismiss={() => setDialog(null)} onConfirm={confirmNow}/>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.white, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderColor: C.border },
  headerButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  brand: { width: 38, height: 38, backgroundColor: C.red, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  brandText: { color: C.white, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 30, gap: 14 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 13 },
  employeeCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 16 },
  employeeTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { height: 48, width: 48, borderRadius: 24, backgroundColor: C.redPale, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.red, fontSize: 17, fontWeight: "800" },
  employeeName: { color: C.text, fontWeight: "800", fontSize: 16, lineHeight: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  infoItem: { width: "46%", flexGrow: 1, gap: 4 },
  infoLabel: { color: C.sub, fontSize: 12 },
  infoValue: { color: C.text, fontSize: 13, fontWeight: "600" },
  banner: { padding: 12, backgroundColor: C.amberPale, borderWidth: 1, borderColor: "#F0E0B4", borderRadius: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bannerText: { color: C.amber, flex: 1, lineHeight: 19, fontSize: 12, fontWeight: "600" },
  smallUpper: { color: C.sub, fontSize: 11, fontWeight: "800", letterSpacing: .6 },
  stageTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: "800" },
  muted: { color: C.sub, fontSize: 12, lineHeight: 19 },
  bigButton: { backgroundColor: C.red, minHeight: 50, borderRadius: 13, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  lightButton: { borderWidth: 1, borderColor: C.red, backgroundColor: C.white },
  buttonText: { color: C.white, fontWeight: "700", textAlign: "center", fontSize: 13 },
  disabled: { opacity: .45 },
  choice: { minHeight: 48, flexDirection: "row", gap: 12, alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  choiceActive: { backgroundColor: C.redPale, borderColor: C.red },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, color: C.text, backgroundColor: C.white },
  actionRow: { borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 10, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 },
  actionIcon: { height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.redPale },
  actionTitle: { fontSize: 14, color: C.text, fontWeight: "700" },
  finishCard: { alignItems: "stretch" },
  recordRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 9 },
  recordText: { color: C.text, fontWeight: "600", fontSize: 13 },
  footer: { backgroundColor: C.white, borderTopColor: C.border, borderTopWidth: 1, flexDirection: "row", padding: 8 },
  nav: { flex: 1, alignItems: "center", gap: 4, minHeight: 45 },
  navText: { color: C.sub, fontSize: 11 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 26, gap: 16 },
  overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { backgroundColor: C.white, width: "100%", maxWidth: 420, borderRadius: 21, padding: 22, gap: 14, alignItems: "stretch" },
  modalIcon: { alignSelf: "center", height: 56, width: 56, borderRadius: 28, backgroundColor: C.redPale, alignItems: "center", justifyContent: "center" },
  warning: { color: C.amber, fontSize: 12, textAlign: "center", lineHeight: 18 },
});