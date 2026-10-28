// app/rrhh/index.js
// Consulta de empleado y acceso a Check-in / Historial.
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { obtenerEmpleadoRH } from "../../src/services/rhEmployees";
import { clasificarEmpleadoRH } from "../../src/services/rhPolicies";

const C = {
  bg: "#F6F7F9", white: "#FFFFFF", ink: "#202733", sub: "#697586",
  line: "#E7E9ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C",
  blue: "#375A80", danger: "#B32634",
};
const emailValido = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 241;

function Campo({ label, icon, ...props }) {
  return <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <Ionicons name={icon} size={18} color={C.sub}/>
      <TextInput style={styles.input} placeholderTextColor="#A0A8B2" {...props}/>
    </View>
  </View>;
}
function Acceso({ title, description, icon, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.access, disabled && styles.disabled, pressed && styles.pressed]}>
    <View style={styles.accessIcon}><Ionicons name={icon} size={23} color={C.red}/></View>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.accessTitle}>{title}</Text>
      <Text style={styles.accessSub}>{description}</Text>
    </View>
    <Ionicons name={disabled ? "lock-closed-outline" : "chevron-forward"} size={20} color={C.sub}/>
  </Pressable>;
}
function FilaDetalle({ label, value }) {
  if (!String(value ?? "").trim()) return null;
  return <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{String(value)}</Text>
  </View>;
}

export default function RRHHInicio() {
  const [nomina, setNomina] = useState("");
  const [correo, setCorreo] = useState("");
  const [empleado, setEmpleado] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState("");
  const [verDetalles, setVerDetalles] = useState(false);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);

  const alEditar = setter => value => {
    requestId.current += 1;
    setter(value);
    setEmpleado(null);
    setError("");
    setConsultando(false);
    setVerDetalles(false);
  };
  const consultar = async () => {
    const numero = nomina.trim();
    const email = correo.trim();
    if (!/^\d{1,8}$/.test(numero)) { setError("Ingresa tu número de nómina (máximo 8 dígitos)."); return; }
    if (!emailValido(email)) { setError("Ingresa un correo electrónico válido."); return; }
    if (consultando) return;
    const id = ++requestId.current;
    setConsultando(true);
    setError("");
    setEmpleado(null);
    Keyboard.dismiss();
    try {
      const resultado = await obtenerEmpleadoRH(numero);
      if (requestId.current !== id) return;
      if (!resultado || (resultado.email && resultado.email.toLowerCase() !== email.toLowerCase())) {
        setError("No pudimos verificar tus datos. Revisa la nómina y el correo.");
        return;
      }
      setEmpleado(resultado);
    } catch (_) {
      if (requestId.current === id) setError("No se pudo consultar tu información. Intenta nuevamente.");
    } finally {
      if (requestId.current === id) setConsultando(false);
    }
  };
  const parametros = () => ({
    personalNumber: empleado.personalNumber,
    numeroRegistro: nomina.trim(),
    correoRegistro: correo.trim(),
  });
  const policy = empleado ? clasificarEmpleadoRH(empleado) : null;

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver al inicio"
        onPress={() => router.replace("/inicio")} style={styles.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>Recursos Humanos</Text>
        <Text style={styles.headerSub}>Control de asistencia</Text>
      </View>
    </View>

    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.title}>Mi asistencia</Text>
          <Text style={styles.subtitle}>Ingresa tus datos para continuar.</Text>
        </View>
        <View style={styles.card}>
          <Campo label="Número de nómina" icon="card-outline" value={nomina}
            onChangeText={alEditar(setNomina)} keyboardType="number-pad" maxLength={8}
            placeholder="Número de empleado" editable={!consultando}/>
          <Campo label="Correo electrónico" icon="mail-outline" value={correo}
            onChangeText={alEditar(setCorreo)} keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} placeholder="correo@empresa.com"
            editable={!consultando} returnKeyType="search" onSubmitEditing={consultar}/>
          {error ? <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={18} color={C.danger}/>
            <Text style={styles.errorText}>{error}</Text>
          </View> : null}
          <Pressable accessibilityRole="button" onPress={consultar}
            disabled={consultando || !nomina.trim() || !correo.trim()}
            style={({ pressed }) => [styles.primary,
              (consultando || !nomina.trim() || !correo.trim()) && styles.disabled,
              pressed && styles.pressed]}>
            {consultando ? <ActivityIndicator color={C.white}/> : <Ionicons name="search-outline" size={19} color={C.white}/>}
            <Text style={styles.primaryText}>{consultando ? "Consultando…" : "Continuar"}</Text>
          </Pressable>
        </View>
        {empleado && <>
          <View style={styles.employee}>
            <View style={styles.employeeTop}>
              <View style={styles.avatar}><Ionicons name="person-outline" size={23} color={C.red}/></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.employeeName}>{empleado.fullName || "Empleado"}</Text>
                <Text style={styles.employeeSub}>Nómina {empleado.personalNumber}</Text>
                {!!empleado.position && <Text style={styles.employeeSub}>{empleado.position}</Text>}
              </View>
              <Ionicons name="checkmark-circle" size={22} color={C.green}/>
            </View>
            <Pressable onPress={() => setVerDetalles(x => !x)} accessibilityRole="button"
              style={styles.detailsButton}>
              <Text style={styles.detailsButtonText}>{verDetalles ? "Ocultar información" : "Ver mi información"}</Text>
              <Ionicons name={verDetalles ? "chevron-up" : "chevron-down"} size={18} color={C.blue}/>
            </Pressable>
            {verDetalles && <View style={styles.detailList}>
              <FilaDetalle label="Horario" value={empleado.scheduleDetail || empleado.hourly}/>
              <FilaDetalle label="Zona" value={empleado.zone}/>
              <FilaDetalle label="Centro de trabajo" value={empleado.centerOffice}/>
              <FilaDetalle label="Tipo de personal" value={empleado.groupPersonDescription}/>
            </View>}
          </View>
          <Text style={styles.sectionTitle}>¿Qué deseas hacer?</Text>
          {!policy?.habilitado && <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={19} color={C.danger}/>
            <Text style={styles.errorText}>Tu registro de asistencia no está habilitado. Comunícate con Recursos Humanos.</Text>
          </View>}
          <Acceso title="Registrar asistencia" description="Entrada, comida y salida"
            icon="finger-print-outline" disabled={!policy?.habilitado}
            onPress={() => router.push({ pathname: "/rrhh/asistencia", params: parametros() })}/>
          <Acceso title="Historial de asistencias" description="Consulta tus registros por fecha"
            icon="calendar-outline"
            onPress={() => router.push({ pathname: "/rrhh/historial", params: parametros() })}/>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  back: { width: 32, minHeight: 35, justifyContent: "center" },
  headerTitle: { fontWeight: "800", fontSize: 18, color: C.ink },
  headerSub: { marginTop: 2, fontSize: 12, color: C.sub },
  content: { padding: 18, paddingBottom: 42, gap: 15 },
  intro: { gap: 5 }, title: { fontSize: 25, color: C.ink, fontWeight: "800" },
  subtitle: { fontSize: 14, color: C.sub },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 17, gap: 15 },
  fieldWrap: { gap: 7 }, label: { fontSize: 13, fontWeight: "700", color: C.ink },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 11, backgroundColor: "#FCFCFD", paddingHorizontal: 12, gap: 9, minHeight: 51 },
  input: { flex: 1, color: C.ink, fontSize: 14, paddingVertical: 10 },
  primary: { backgroundColor: C.red, minHeight: 50, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  primaryText: { color: C.white, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
  errorRow: { flexDirection: "row", gap: 9, alignItems: "flex-start", padding: 12, backgroundColor: C.pale, borderRadius: 12 },
  errorText: { color: C.danger, fontSize: 12, flex: 1, lineHeight: 18 },
  employee: { backgroundColor: C.white, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  employeeTop: { flexDirection: "row", gap: 11, alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.pale, justifyContent: "center", alignItems: "center" },
  employeeName: { fontSize: 15, fontWeight: "800", color: C.ink }, employeeSub: { fontSize: 12, color: C.sub },
  detailsButton: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailsButtonText: { color: C.blue, fontSize: 13, fontWeight: "700" },
  detailList: { gap: 0 }, detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
  detailLabel: { flex: 1, fontSize: 12, color: C.sub }, detailValue: { flex: 1.7, fontSize: 12, color: C.ink, textAlign: "right" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginTop: 4 },
  access: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16, minHeight: 87, flexDirection: "row", alignItems: "center", gap: 12 },
  accessIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: C.pale, justifyContent: "center", alignItems: "center" },
  accessTitle: { fontSize: 15, fontWeight: "800", color: C.ink }, accessSub: { fontSize: 12, color: C.sub },
});