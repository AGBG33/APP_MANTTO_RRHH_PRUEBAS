// app/rrhh/index.js
// Paso 4: mostrar claramente cuando el perfil procede de la cache offline.
// No habilita marcaciones sin consultar SAP. Mantiene el inicio de RRHH.
import React, { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSapEmployee } from "../../src/context/SapEmployeeContext";
import { clasificarEmpleadoRH } from "../../src/services/rhPolicies";

const C = {
  bg: "#F6F7F9", white: "#FFFFFF", ink: "#202733", sub: "#697586",
  line: "#E7E9ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C", blue: "#375A80",
  amber: "#95610C", amberBg: "#FFF7E8",
};
function Fila({ label, value }) {
  if (!String(value ?? "").trim()) return null;
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
      <Text style={s.accessTitle}>{title}</Text><Text style={s.accessSub}>{subtitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={C.sub}/>
  </Pressable>;
}
export default function RRHHInicio() {
  const { employee, loading, error, refresh, origenPerfil, perfilGuardadoEn, perfilDesactualizado } = useSapEmployee();
  const [showDetails, setShowDetails] = useState(false);
  const policy = employee ? clasificarEmpleadoRH(employee) : null;
  const modoConsultaOffline = origenPerfil === "cache";
  const fechaCopia = Number.isFinite(perfilGuardadoEn)
    ? new Date(perfilGuardadoEn).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.replace("/inicio")} style={s.back}>
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
        <Text style={s.feedbackText}>{error || "No encontramos tu información laboral. Comunícate con Recursos Humanos."}</Text>
        <Pressable accessibilityRole="button" style={s.retry} onPress={refresh}>
          <Ionicons name="refresh-outline" size={17} color={C.white}/>
          <Text style={s.retryText}>Volver a intentar</Text>
        </Pressable>
      </View>}
      {!loading && employee && <>
        {modoConsultaOffline && <View style={s.cacheNotice} accessibilityLiveRegion="polite">
          <View style={s.cacheTop}>
            <Ionicons name="cloud-offline-outline" size={22} color={C.amber}/>
            <Text style={s.cacheTitle}>Consulta sin conexión</Text>
          </View>
          <Text style={s.cacheText}>
            Estás viendo un perfil que SAP confirmó anteriormente{fechaCopia ? ` (guardado: ${fechaCopia})` : ""}.
            {perfilDesactualizado ? " La copia tiene más de 24 horas y puede estar desactualizada." : " Puede haber cambios pendientes de actualizar."}
          </Text>
          <Text style={s.cacheText}>
            Por ahora puedes consultar el historial guardado. El envío de marcaciones offline se habilitará en una etapa posterior.
          </Text>
          <Pressable accessibilityRole="button" onPress={refresh} style={s.cacheRetry}>
            <Ionicons name="refresh-outline" size={16} color={C.blue}/>
            <Text style={s.cacheRetryText}>Reintentar conexión con SAP</Text>
          </Pressable>
        </View>}
        <View style={s.profile}>
          <View style={s.profileTop}>
            <View style={s.avatar}><Ionicons name="person-outline" size={24} color={C.red}/></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.name}>{employee.fullName || "Empleado"}</Text>
              <Text style={s.muted}>Nómina {employee.personalNumber}</Text>
              {!!employee.position && <Text style={s.muted}>{employee.position}</Text>}
            </View>
            <Ionicons name={modoConsultaOffline ? "cloud-offline-outline" : "checkmark-circle"}
              size={22} color={modoConsultaOffline ? C.amber : C.green}/>
          </View>
          <Pressable style={s.detailsButton} onPress={() => setShowDetails(!showDetails)}>
            <Text style={s.detailsButtonText}>{showDetails ? "Ocultar información" : "Ver mi información"}</Text>
            <Ionicons name={showDetails ? "chevron-up" : "chevron-down"} color={C.blue} size={18}/>
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
          <Text style={s.feedbackText}>{policy?.razon || "Por el momento no puedes registrar asistencia desde la aplicación."}</Text>
        </View>}
        <Text style={s.sectionTitle}>¿Qué deseas hacer?</Text>
        {policy?.habilitado && !modoConsultaOffline && <Acceso title="Registrar asistencia" subtitle="Entrada, comida y salida"
          icon="finger-print-outline" onPress={() => router.push("/rrhh/asistencia")}/>}
        {policy?.habilitado && modoConsultaOffline && <View style={s.disabledAccess}>
          <View style={s.disabledIcon}><Ionicons name="lock-closed-outline" size={22} color={C.sub}/></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.accessTitle}>Registrar asistencia</Text>
            <Text style={s.accessSub}>Temporalmente requiere conexión a SAP. No se enviará una marcación sin confirmación.</Text>
          </View>
        </View>}
        <Acceso title="Historial de asistencias" subtitle={modoConsultaOffline
          ? "Ver períodos consultados y guardados en este dispositivo" : "Consulta tus movimientos por fecha"}
          icon="calendar-outline" onPress={() => router.push("/rrhh/historial")}/>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  back: { width: 32, minHeight: 35, justifyContent: "center" },
  headerTitle: { fontWeight: "800", fontSize: 18, color: C.ink },
  headerSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  content: { padding: 18, paddingBottom: 40, gap: 15 },
  intro: { gap: 5 }, title: { fontSize: 25, fontWeight: "800", color: C.ink },
  subtitle: { fontSize: 14, color: C.sub },
  profile: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    padding: 16, borderRadius: 17, gap: 12 },
  profileTop: { flexDirection: "row", gap: 11, alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 13, backgroundColor: C.pale,
    justifyContent: "center", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "800", color: C.ink },
  muted: { fontSize: 12, color: C.sub },
  detailsButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  detailsButtonText: { color: C.blue, fontWeight: "700", fontSize: 13 },
  detailRow: { flexDirection: "row", gap: 12, borderBottomWidth: 1, borderBottomColor: C.line,
    paddingVertical: 10 },
  detailLabel: { flex: 1, fontSize: 12, color: C.sub },
  detailValue: { flex: 1.8, color: C.ink, textAlign: "right", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginTop: 4 },
  feedback: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 17,
    padding: 20, gap: 12, alignItems: "center" },
  feedbackText: { color: C.sub, textAlign: "center", lineHeight: 20, fontSize: 13 },
  retry: { backgroundColor: C.red, borderRadius: 11, paddingHorizontal: 18,
    paddingVertical: 12, flexDirection: "row", gap: 8, alignItems: "center" },
  retryText: { fontSize: 13, fontWeight: "700", color: C.white },
  access: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  accessIcon: { width: 46, height: 46, backgroundColor: C.pale, borderRadius: 13,
    alignItems: "center", justifyContent: "center" },
  accessTitle: { fontSize: 15, fontWeight: "800", color: C.ink },
  accessSub: { fontSize: 12, color: C.sub, lineHeight: 17 },
  cacheNotice: { backgroundColor: C.amberBg, borderColor: "#F0DFBE", borderWidth: 1,
    borderRadius: 14, padding: 13, gap: 9 },
  cacheTop: { flexDirection: "row", gap: 9, alignItems: "center" },
  cacheTitle: { fontSize: 14, fontWeight: "800", color: C.ink },
  cacheText: { fontSize: 12, color: C.sub, lineHeight: 18 },
  cacheRetry: { flexDirection: "row", gap: 7, alignItems: "center", paddingTop: 4 },
  cacheRetryText: { fontSize: 12, fontWeight: "700", color: C.blue },
  disabledAccess: { backgroundColor: "#F0F1F3", borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  disabledIcon: { width: 46, height: 46, backgroundColor: "#E6E9ED", borderRadius: 13,
    alignItems: "center", justifyContent: "center" },
});