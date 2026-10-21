// app/rrhh/index.js
// Entrada al modulo RR. HH. | Consulta de EmployeeSet en SAP QAS.
// Esta pantalla es SOLO para pruebas: escribir un numero/correo NO autentica
// ni autoriza el acceso a los datos de otro empleado.
//
// Requiere: src/services/rhEmployees.js
// Abre app/rrhh/asistencia.js y app/rrhh/historial.js pasando el número verificado.
// Asistencia envia marcaciones a QAS. Historial sigue siendo un resumen local, no una consulta OData.

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  obtenerEmpleadoRH,
  prepararBusquedaEmpleadoRH,
} from "../../src/services/rhEmployees";

const C = {
  bg: "#F3F5F8",
  surface: "#FFFFFF",
  soft: "#F8F9FB",
  text: "#1F2937",
  muted: "#596579",
  border: "#E5E9EF",
  red: "#E60012",
  redSoft: "#FFF0F1",
  blue: "#355C7D",
  green: "#18794E",
  greenSoft: "#EAF7F0",
  warning: "#8A5B12",
  warningSoft: "#FFF7E8",
  error: "#B42332",
  errorSoft: "#FFF0F1",
};

const sinDato = (valor) => {
  const texto = String(valor ?? "").trim();
  return texto || "No registrado en SAP";
};

function Iniciales({ nombre }) {
  const letras = String(nombre ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{letras || "RH"}</Text>
    </View>
  );
}

function CampoEmpleado({ icono, etiqueta, valor }) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelRow}>
        <Ionicons name={icono} size={17} color={C.muted} />
        <Text style={styles.fieldLabel}>{etiqueta}</Text>
      </View>
      <Text style={styles.fieldValue} selectable>
        {sinDato(valor)}
      </Text>
    </View>
  );
}

function TarjetaEmpleado({ empleado }) {
  const activo = String(empleado.status ?? "").trim().toLowerCase() === "activo";
  return (
    <View style={styles.card}>
      <View style={styles.profileHeader}>
        <Iniciales nombre={empleado.fullName} />
        <View style={styles.profileHeaderText}>
          <Text style={styles.nameText}>{sinDato(empleado.fullName)}</Text>
          <Text style={styles.numberText} selectable>
            Empleado: {sinDato(empleado.personalNumber)}
          </Text>
        </View>
      </View>

      <View style={[styles.statusBox, activo && styles.statusActive]}>
        <Ionicons
          name={activo ? "checkmark-circle-outline" : "information-circle-outline"}
          size={17}
          color={activo ? C.green : C.blue}
        />
        <Text style={[styles.statusText, { color: activo ? C.green : C.blue }]}>
          {sinDato(empleado.status)}
        </Text>
      </View>

      <Text style={styles.cardTitle}>Información del empleado</Text>
      <CampoEmpleado icono="briefcase-outline" etiqueta="Puesto" valor={empleado.position} />
      <CampoEmpleado icono="time-outline" etiqueta="Horario" valor={empleado.hourly} />
      <CampoEmpleado icono="sunny-outline" etiqueta="Turno" valor={empleado.shift} />
      <CampoEmpleado icono="location-outline" etiqueta="Base" valor={empleado.base} />
      <CampoEmpleado icono="map-outline" etiqueta="Zona" valor={empleado.zone} />
      <CampoEmpleado icono="business-outline" etiqueta="Centro / Oficina" valor={empleado.centerOffice} />
      <CampoEmpleado icono="mail-outline" etiqueta="Correo electrónico" valor={empleado.email} />
      {Boolean(empleado.descriptionStatus) && (
        <CampoEmpleado
          icono="information-circle-outline"
          etiqueta="Descripción de estatus"
          valor={empleado.descriptionStatus}
        />
      )}
      {Boolean(empleado.registerType) && (
        <CampoEmpleado icono="finger-print-outline" etiqueta="Tipo de registro" valor={empleado.registerType} />
      )}
      {Boolean(empleado.authorisedRegister) && (
        <CampoEmpleado
          icono="shield-checkmark-outline"
          etiqueta="Registro autorizado"
          valor={empleado.authorisedRegister}
        />
      )}
    </View>
  );
}

function Acceso({ icono, titulo, detalle, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.accessCard,
        disabled && styles.accessCardDisabled,
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <View style={styles.accessIcon}>
        <Ionicons name={icono} size={22} color={C.red} />
      </View>
      <View style={styles.accessContent}>
        <Text style={styles.accessTitle}>{titulo}</Text>
        <Text style={styles.accessDescription}>{detalle}</Text>
      </View>
      <Ionicons name={disabled ? "lock-closed-outline" : "chevron-forward"} size={19} color={C.muted} />
    </Pressable>
  );
}

export default function RRHHInicio() {
  // Identidad manual temporal, SOLO para pruebas QAS.
  const [identificador, setIdentificador] = useState("1111111");
  // Correo del JSON de prueba: editable e independiente del Email vacio que devuelve SAP.
  const [correoRegistro, setCorreoRegistro] = useState("fscherrer@tellus-technologies.com");
  const [errorCorreo, setErrorCorreo] = useState("");
  const [empleado, setEmpleado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const solicitudActual = useRef(0);

  // Impide actualizar esta pantalla con solicitudes que terminen tras desmontarla.
  useEffect(() => () => { solicitudActual.current += 1; }, []);

  const cambiarBusqueda = (nuevoValor) => {
    solicitudActual.current += 1;
    setIdentificador(nuevoValor);
    setEmpleado(null);
    setLoading(false);
    setError("");
  };

  const cambiarCorreo = (valor) => {
    setCorreoRegistro(valor);
    setErrorCorreo("");
  };

  const validarCorreoRegistro = () => {
    const valor = correoRegistro.trim();
    if (valor.length > 241 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
      setErrorCorreo("Escribe un correo valido para el registro de asistencia.");
      return false;
    }
    setErrorCorreo("");
    return true;
  };

  const consultar = async () => {
    if (loading) return;
    const actual = ++solicitudActual.current;
    setError("");
    setEmpleado(null);

    try {
      prepararBusquedaEmpleadoRH(identificador);
    } catch (e) {
      setError(e?.message || "Escribe un número de empleado o correo válido.");
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const respuesta = await obtenerEmpleadoRH(identificador);
      if (actual !== solicitudActual.current) return;
      if (!respuesta) {
        setError("No se encontró un empleado para este número o correo.");
      } else {
        setEmpleado(respuesta);
      }
    } catch (e) {
      if (actual !== solicitudActual.current) return;
      setError(e?.message || "No fue posible obtener la información de SAP.");
    } finally {
      if (actual === solicitudActual.current) setLoading(false);
    }
  };

  const consultarOtro = () => {
    solicitudActual.current += 1;
    setEmpleado(null);
    setIdentificador("");
    setLoading(false);
    setError("");
  };

  const abrirAsistencia = () => {
    if (!empleado?.personalNumber || !validarCorreoRegistro()) return;
    // Se conserva lo tecleado para el POST: 1111111, sin anteponer un cero.
    // El numero normalizado de 8 digitos continua usandose para GET EmployeeSet.
    const numeroCapturado = /^\d{1,8}$/.test(identificador.trim())
      ? identificador.trim()
      : empleado.personalNumber;
    router.push({
      pathname: "/rrhh/asistencia",
      params: {
        personalNumber: empleado.personalNumber,
        numeroRegistro: numeroCapturado,
        correoRegistro: correoRegistro.trim(),
      },
    });
  };

  const abrirHistorial = () => {
    if (!empleado?.personalNumber) return;
    router.push({
      pathname: "/rrhh/historial",
      params: { personalNumber: empleado.personalNumber },
    });
  };

  let numeroNormalizado = "";
  try {
    const busqueda = prepararBusquedaEmpleadoRH(identificador);
    if (busqueda.tipo === "numero") numeroNormalizado = busqueda.valor;
  } catch (_) {
    // Se mostrara el mensaje de validacion cuando el usuario pulse Consultar.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio"
          onPress={() => router.replace("/inicio")}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <View style={styles.brand}><Text style={styles.brandText}>RH</Text></View>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Recursos Humanos</Text>
          <Text style={styles.headerSubtitle}>Consulta de empleado · SAP QAS</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.pageTitle}>Mis datos de empleado</Text>
            <Text style={styles.paragraph}>
              Durante las pruebas, consulta un empleado ingresando su número o correo.
              Más adelante se obtendrá automáticamente desde la sesión autorizada.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Buscar empleado</Text>
            <Text style={styles.inputLabel}>Número de empleado o correo</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="search-outline" size={19} color={C.muted} />
              <TextInput
                accessibilityLabel="Número de empleado o correo"
                style={styles.input}
                placeholder="Ej. 1111111 o empleado@empresa.com"
                placeholderTextColor="#84909D"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                value={identificador}
                onChangeText={cambiarBusqueda}
                onSubmitEditing={consultar}
                editable={!loading}
              />
            </View>
            {Boolean(numeroNormalizado) && (
              <Text style={styles.helper}>Se consultará el número SAP: {numeroNormalizado}</Text>
            )}
            <Text style={styles.inputLabel}>Correo para enviar la asistencia (editable)</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={19} color={C.muted} />
              <TextInput
                accessibilityLabel="Correo del registro de asistencia"
                style={styles.input}
                placeholder="correo@empresa.com"
                placeholderTextColor="#84909D"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={correoRegistro}
                onChangeText={cambiarCorreo}
                editable={!loading}
              />
            </View>
            <Text style={styles.helper}>
              Para pruebas QAS. No se toma del correo que devuelve EmployeeSet.
            </Text>
            {Boolean(errorCorreo) && (
              <Text style={styles.errorText}>{errorCorreo}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || !identificador.trim() }}
              disabled={loading || !identificador.trim()}
              onPress={consultar}
              style={({ pressed }) => [
                styles.primaryButton,
                (loading || !identificador.trim()) && styles.primaryDisabled,
                pressed && !loading && { opacity: 0.85 },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="search-outline" size={19} color="#FFFFFF" />
              )}
              <Text style={styles.primaryButtonText}>
                {loading ? "Consultando SAP…" : "Consultar empleado"}
              </Text>
            </Pressable>
            {Boolean(error) && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color={C.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>

          {empleado && (
            <>
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle-outline" size={18} color={C.green} />
                <Text style={styles.successText}>Datos obtenidos de SAP correctamente.</Text>
              </View>
              <TarjetaEmpleado empleado={empleado} />
              <Pressable accessibilityRole="button" onPress={consultarOtro} style={styles.changeButton}>
                <Ionicons name="swap-horizontal-outline" size={18} color={C.blue} />
                <Text style={styles.changeButtonText}>Consultar otro empleado</Text>
              </Pressable>

              <Text style={styles.sectionTitle}>Opciones de Recursos Humanos</Text>
              <Acceso
                icono="time-outline"
                titulo="Asistencia (pruebas)"
                detalle="Envía P10/P15/P25/P20 a SAP QAS usando GPS y hora del teléfono."
                onPress={abrirAsistencia}
              />
              <Acceso
                icono="calendar-outline"
                titulo="Historial de asistencia"
                detalle="Consulta los movimientos guardados localmente; no lee AttendanceHistorySet."
                onPress={abrirHistorial}
              />
              <View style={styles.warningBox}>
                <Ionicons name="information-circle-outline" size={18} color={C.warning} />
                <Text style={styles.warningText}>
                  Asistencia enviará marcaciones reales al ambiente SAP QAS. El número
                  y el correo son editables SOLO para pruebas. El Historial sigue leyendo
                  el resumen local del dispositivo, no AttendanceHistorySet de SAP.
                </Text>
              </View>
            </>
          )}
          <Text style={styles.footer}>
            Pruebas QAS · Identificar un empleado manualmente no equivale a autenticarlo.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.surface,
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
    borderBottomColor: C.border, gap: 10,
  },
  backButton: { width: 40, height: 42, justifyContent: "center", alignItems: "center" },
  brand: { width: 39, height: 39, borderRadius: 12, backgroundColor: C.red, alignItems: "center", justifyContent: "center" },
  brandText: { color: C.surface, fontSize: 13, fontWeight: "900" },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.text },
  headerSubtitle: { fontSize: 11, color: C.muted, marginTop: 2 },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  intro: { gap: 7, paddingHorizontal: 2 },
  pageTitle: { color: C.text, fontSize: 22, fontWeight: "800" },
  paragraph: { color: C.muted, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: C.surface, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.border, gap: 11 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "800", marginBottom: 1 },
  inputLabel: { color: C.text, fontSize: 12, fontWeight: "700" },
  inputWrap: {
    borderWidth: 1, borderColor: "#CFD6DF", borderRadius: 12,
    minHeight: 51, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 9,
  },
  input: { flex: 1, paddingVertical: 10, color: C.text, fontSize: 15, minWidth: 0 },
  helper: { color: C.muted, fontSize: 12 },
  primaryButton: {
    minHeight: 51, borderRadius: 12, backgroundColor: C.red, alignItems: "center",
    justifyContent: "center", flexDirection: "row", gap: 9, paddingHorizontal: 14,
  },
  primaryDisabled: { opacity: 0.55 },
  primaryButtonText: { color: C.surface, fontSize: 14, fontWeight: "800" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: C.errorSoft, padding: 12, borderRadius: 10 },
  errorText: { color: C.error, flex: 1, fontSize: 12, lineHeight: 18 },
  successBox: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: 11, padding: 12, backgroundColor: C.greenSoft },
  successText: { color: C.green, flex: 1, fontSize: 12, fontWeight: "700" },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, backgroundColor: C.redSoft, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  avatarText: { color: C.red, fontWeight: "800", fontSize: 15 },
  profileHeaderText: { flex: 1, gap: 4 },
  nameText: { color: C.text, fontSize: 15, fontWeight: "800" },
  numberText: { color: C.muted, fontSize: 12 },
  statusBox: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#EEF3F7", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  statusActive: { backgroundColor: C.greenSoft },
  statusText: { fontSize: 12, fontWeight: "700" },
  fieldRow: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: C.border },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldLabel: { color: C.muted, fontSize: 12 },
  fieldValue: { color: C.text, fontSize: 14, fontWeight: "600", paddingLeft: 25 },
  changeButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 9, minHeight: 42, paddingHorizontal: 10 },
  changeButtonText: { color: C.blue, fontSize: 13, fontWeight: "700" },
  sectionTitle: { color: C.text, fontWeight: "800", fontSize: 17, marginTop: 4 },
  accessCard: { backgroundColor: C.surface, borderRadius: 15, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  accessCardDisabled: { opacity: 0.55 },
  accessIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.redSoft, alignItems: "center", justifyContent: "center" },
  accessContent: { flex: 1, gap: 4 },
  accessTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  accessDescription: { color: C.muted, fontSize: 12, lineHeight: 18 },
  warningBox: { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.warningSoft, gap: 10, padding: 13, borderRadius: 12 },
  warningText: { color: C.warning, fontSize: 12, lineHeight: 18, flex: 1 },
  footer: { fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 16, paddingHorizontal: 8 },
});