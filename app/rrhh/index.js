// app/rrhh/index.js
// Pantalla principal RRHH: consulta de empleado y dos accesos independientes.
// Pruebas QAS: la búsqueda manual NO sustituye la autenticación/autorización.
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { obtenerEmpleadoRH, prepararBusquedaEmpleadoRH } from "../../src/services/rhEmployees";

const C = {
  bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C",
  greenBg: "#EAF7EF", blue: "#375A80", danger: "#AF2634",
};
const valor = (s) => String(s ?? "").trim() || "No registrado en SAP";

function Info({ label, value }) {
  return <View style={s.infoRow}>
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={s.infoValue} selectable>{valor(value)}</Text>
  </View>;
}
function Modulo({ icon, title, text, note, onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [s.module, pressed && s.pressed]}>
    <View style={s.moduleIcon}><Ionicons name={icon} size={25} color={C.red}/></View>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.moduleTitle}>{title}</Text>
      <Text style={s.moduleText}>{text}</Text>
      <Text style={s.moduleNote}>{note}</Text>
    </View>
    <Ionicons name="chevron-forward" size={21} color={C.sub}/>
  </Pressable>;
}

export default function RRHHInicio() {
  // Dato temporal de QAS: eliminar la precarga al habilitar usuarios reales.
  const [identificador, setIdentificador] = useState("1111111");
  const [empleado, setEmpleado] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState("");
  const [verDetalles, setVerDetalles] = useState(false);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);

  const cambiarBusqueda = (v) => {
    requestId.current += 1;
    setIdentificador(v);
    setEmpleado(null);
    setError("");
    setConsultando(false);
    setVerDetalles(false);
  };

  const consultar = async () => {
    if (consultando) return;
    const id = ++requestId.current;
    setError("");
    setEmpleado(null);
    try {
      prepararBusquedaEmpleadoRH(identificador);
    } catch (e) {
      setError(e?.message || "Ingresa un número o correo válido.");
      return;
    }
    Keyboard.dismiss();
    setConsultando(true);
    try {
      const data = await obtenerEmpleadoRH(identificador.trim());
      if (requestId.current !== id) return;
      if (!data) setError("No se encontró el empleado en SAP QAS.");
      else setEmpleado(data);
    } catch (e) {
      if (requestId.current === id) setError(e?.message || "Error al consultar SAP.");
    } finally {
      if (requestId.current === id) setConsultando(false);
    }
  };

  const parametros = () => {
    const original = identificador.trim();
    return {
      personalNumber: empleado.personalNumber,
      // Para el POST se conserva el número ingresado, sin agregar ceros.
      numeroRegistro: /^\d{1,8}$/.test(original) ? original : empleado.personalNumber,
    };
  };

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver al inicio"
        style={s.back} onPress={() => router.replace("/inicio")}>
        <Ionicons name="arrow-back" color={C.ink} size={23}/>
      </Pressable>
      <View style={s.brand}><Text style={s.brandText}>RH</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Recursos Humanos</Text>
        <Text style={s.headerSub}>Control de asistencia · SAP QAS</Text>
      </View>
    </View>

    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}>
        <View style={s.intro}>
          <Text style={s.title}>Mi asistencia</Text>
          <Text style={s.subtitle}>Consulta a un empleado y selecciona lo que quieres hacer.</Text>
        </View>

        <View style={s.card}>
          <View style={s.sectionHead}>
            <View style={s.step}><Text style={s.stepText}>1</Text></View>
            <Text style={s.sectionTitle}>Identificar empleado</Text>
          </View>
          <Text style={s.label}>Número de nómina o correo</Text>
          <View style={s.field}>
            <Ionicons name="search-outline" size={19} color={C.sub}/>
            <TextInput value={identificador} onChangeText={cambiarBusqueda}
              placeholder="Ej. 1111111" placeholderTextColor="#98A1AE"
              autoCapitalize="none" autoCorrect={false} returnKeyType="search"
              onSubmitEditing={consultar} editable={!consultando} style={s.input}
              accessibilityLabel="Número o correo del empleado"/>
          </View>
          <Pressable disabled={consultando || !identificador.trim()} onPress={consultar}
            accessibilityRole="button" style={({ pressed }) => [s.primary,
              (consultando || !identificador.trim()) && s.disabled, pressed && s.pressed]}>
            {consultando ? <ActivityIndicator color="#FFFFFF"/> : <Ionicons name="search" color="#FFFFFF" size={19}/>}
            <Text style={s.primaryText}>{consultando ? "Consultando SAP…" : "Consultar empleado"}</Text>
          </Pressable>
          {!!error && <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={C.danger}/>
            <Text style={s.errorText}>{error}</Text>
          </View>}
          <Text style={s.helper}>Modo de pruebas: el empleado se consulta manualmente. No se solicita correo para registrar asistencia.</Text>
        </View>

        {empleado && <>
          <View style={s.profile}>
            <View style={s.profileTop}>
              <View style={s.avatar}><Ionicons name="person" size={25} color={C.red}/></View>
              <View style={{ flex: 1 }}>
                <Text style={s.profileName}>{valor(empleado.fullName)}</Text>
                <Text style={s.profileNumber}>Nómina: {valor(empleado.personalNumber)}</Text>
                <Text style={s.profileNumber}>{valor(empleado.position)}</Text>
              </View>
              <Ionicons name="checkmark-circle" color={C.green} size={23}/>
            </View>
            <Pressable accessibilityRole="button" style={s.detailsButton}
              onPress={() => setVerDetalles(v => !v)}>
              <Text style={s.detailsLabel}>{verDetalles ? "Ocultar datos del empleado" : "Ver datos del empleado"}</Text>
              <Ionicons name={verDetalles ? "chevron-up" : "chevron-down"} color={C.blue} size={18}/>
            </Pressable>
            {verDetalles && <View style={s.details}>
              <Info label="Correo SAP" value={empleado.email}/>
              <Info label="Puesto" value={empleado.position}/>
              <Info label="Horario" value={empleado.hourly}/>
              <Info label="Turno" value={empleado.shift}/>
              <Info label="Base" value={empleado.base}/>
              <Info label="Zona" value={empleado.zone}/>
              <Info label="Centro / Oficina" value={empleado.centerOffice}/>
              <Info label="Estatus" value={empleado.status}/>
            </View>}
          </View>

          <View style={s.sectionHead}>
            <View style={s.step}><Text style={s.stepText}>2</Text></View>
            <Text style={s.sectionTitle}>Selecciona una opción</Text>
          </View>
          <Modulo icon="finger-print-outline" title="Check-in"
            text="Registrar entrada, comida y salida de la jornada."
            note="Envía marcaciones a SAP QAS"
            onPress={() => router.push({ pathname: "/rrhh/asistencia", params: parametros() })}/>
          <Modulo icon="calendar-outline" title="Historial de asistencias"
            text="Consultar movimientos registrados en SAP por fecha."
            note="Historial real desde AttendanceHistorySet"
            onPress={() => router.push({ pathname: "/rrhh/historial", params: parametros() })}/>
        </>}

        <View style={s.notice}>
          <Ionicons name="information-circle-outline" size={18} color={C.blue}/>
          <Text style={s.noticeText}>Las marcaciones se envían a SAP QAS. El historial consulta AttendanceHistorySet con filtros de fechas.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.white, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { width: 30, height: 40, justifyContent: "center" },
  brand: { backgroundColor: C.red, borderRadius: 10, width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  brandText: { fontWeight: "900", color: C.white, fontSize: 13 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.ink },
  headerSub: { fontSize: 11, color: C.sub, marginTop: 2 },
  content: { padding: 18, paddingBottom: 40, gap: 15 },
  intro: { gap: 5, marginBottom: 3 },
  title: { fontSize: 25, fontWeight: "800", color: C.ink },
  subtitle: { fontSize: 14, color: C.sub, lineHeight: 20 },
  card: { backgroundColor: C.white, padding: 17, borderRadius: 17, borderWidth: 1, borderColor: C.border, gap: 13 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: { width: 27, height: 27, borderRadius: 14, backgroundColor: C.pale, alignItems: "center", justifyContent: "center" },
  stepText: { color: C.red, fontSize: 13, fontWeight: "800" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  label: { color: C.ink, fontWeight: "600", fontSize: 13 },
  field: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 51, backgroundColor: "#FBFCFE", gap: 8 },
  input: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 0 },
  primary: { backgroundColor: C.red, borderRadius: 12, minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 12 },
  primaryText: { color: C.white, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: .48 },
  pressed: { opacity: .75 },
  helper: { color: C.sub, fontSize: 11, lineHeight: 17 },
  errorBox: { flexDirection: "row", gap: 8, padding: 10, backgroundColor: C.pale, borderRadius: 10, alignItems: "center" },
  errorText: { flex: 1, color: C.danger, fontSize: 12, lineHeight: 18 },
  profile: { backgroundColor: C.white, padding: 17, borderRadius: 17, borderWidth: 1, borderColor: C.border, gap: 14 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { backgroundColor: C.pale, width: 51, height: 51, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  profileName: { fontSize: 16, fontWeight: "800", color: C.ink },
  profileNumber: { fontSize: 12, color: C.sub, marginTop: 3 },
  detailsButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  detailsLabel: { color: C.blue, fontSize: 13, fontWeight: "700" },
  details: { gap: 0 },
  infoRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", gap: 10, justifyContent: "space-between" },
  infoLabel: { color: C.sub, fontSize: 12, flex: 1 },
  infoValue: { color: C.ink, fontWeight: "600", fontSize: 12, textAlign: "right", flex: 1.4 },
  module: { flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: C.white, padding: 17, minHeight: 112, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  moduleIcon: { width: 51, height: 51, borderRadius: 15, backgroundColor: C.pale, alignItems: "center", justifyContent: "center" },
  moduleTitle: { fontWeight: "800", fontSize: 16, color: C.ink },
  moduleText: { fontSize: 12, lineHeight: 18, color: C.sub },
  moduleNote: { fontSize: 11, fontWeight: "700", color: C.blue },
  notice: { flexDirection: "row", gap: 10, padding: 13, borderRadius: 12, backgroundColor: "#EBF3FA" },
  noticeText: { color: C.blue, flex: 1, fontSize: 11, lineHeight: 17 },
});