// app/rrhh/historial.js
// Historial de asistencias RRHH: consultas SAP QAS por día, mes o año.
// Cada tarjeta representa WorkDate y muestra las cuatro horas consolidadas.
// No utiliza AsyncStorage y no modifica marcaciones existentes.
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView,
  SafeAreaView, StatusBar, StyleSheet, Text, View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSapEmployee } from "../../src/context/SapEmployeeContext";
import { consultarHistorialRH, fechaLocalRH } from "../../src/services/rhHistory";

const C = {
  bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2",
  danger: "#AF2634", soft: "#F8F9FB",
};
const MODOS = [
  { id: "dia", label: "Día" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const ANIOS = Array.from({ length: 51 }, (_, i) => new Date().getFullYear() + 2 - i);

const fechaLocalAlMediodia = fecha => new Date(
  fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0, 0,
);

function periodoDe(fecha, modo) {
  const y = fecha.getFullYear();
  const m = fecha.getMonth();
  if (modo === "anio") {
    return { desde: `${y}-01-01`, hasta: `${y}-12-31`, etiqueta: `Año ${y}` };
  }
  if (modo === "mes") {
    const ultimoDia = new Date(y, m + 1, 0, 12);
    return {
      desde: fechaLocalRH(new Date(y, m, 1, 12)),
      hasta: fechaLocalRH(ultimoDia),
      etiqueta: `${MESES[m]} de ${y}`,
    };
  }
  const dia = fechaLocalRH(fecha);
  return { desde: dia, hasta: dia, etiqueta: fecha.toLocaleDateString("es-MX", {
    day: "numeric", month: "long", year: "numeric",
  }) };
}

function nombreDia(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ""))) return "Día sin fecha";
  const [y, m, d] = dateISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d, 12);
  return fecha.toLocaleDateString("es-MX", { weekday: "long" });
}

function fechaAmigable(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ""))) return "Fecha no disponible";
  const [y, m, d] = dateISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d, 12);
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function tiempoVisible(value) {
  const hora = String(value || "").trim();
  // SAP utiliza 00:00:00 como valor inicial cuando no hay marcación.
  if (!hora || hora === "00:00:00") return "—";
  return hora;
}

function Boton({ title, icon = "search-outline", onPress, outline = false, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, outline && s.buttonOutline,
      disabled && s.disabled, pressed && s.pressed]}>
    <Ionicons name={icon} size={19} color={outline ? C.red : C.white}/>
    <Text style={[s.buttonText, outline && s.buttonOutlineText]}>{title}</Text>
  </Pressable>;
}

function Tiempo({ etiqueta, valor }) {
  return <View style={s.timeCard}>
    <Text style={s.timeLabel}>{etiqueta}</Text>
    <Text style={s.timeValue} selectable>{tiempoVisible(valor)}</Text>
  </View>;
}

function TarjetaJornada({ jornada }) {
  const estatus = String(jornada.dayStatus || "").trim();
  const mostrarEstatus = !!estatus && estatus.toUpperCase() !== "RETARDO";
  return <View style={s.dayCard}>
    <View style={s.dayHeader}>
      <View style={s.calendarIcon}>
        <Ionicons name="calendar-outline" size={21} color={C.red}/>
      </View>
      <View style={s.dayHeaderText}>
        <Text style={s.weekday}>{nombreDia(jornada.date)}</Text>
        <Text style={s.dayDate}>{fechaAmigable(jornada.date)}</Text>
      </View>
    </View>

    {mostrarEstatus && <View style={s.statusRow}>
      <Text style={s.statusLabel}>Modalidad / estado</Text>
      <Text style={s.statusValue}>{estatus}</Text>
    </View>}

    <View style={s.timesGrid}>
      <Tiempo etiqueta="Entrada" valor={jornada.p10Time}/>
      <Tiempo etiqueta="Inicio de comida" valor={jornada.p15Time}/>
      <Tiempo etiqueta="Regreso de comida" valor={jornada.p25Time}/>
      <Tiempo etiqueta="Salida" valor={jornada.p20Time}/>
    </View>
  </View>;
}

export default function RHHistorial() {
  // Identidad de Microsoft ya vinculada al EmployeeSet de SAP.
  const { employee: perfilSap, loading: perfilLoading, error: perfilError } = useSapEmployee();
  const numeroRegistro = String(perfilSap?.personalNumber ?? "").trim();
  const nominaValida = /^\d{1,8}$/.test(numeroRegistro);

  const [modo, setModo] = useState("dia");
  const [fechaElegida, setFechaElegida] = useState(() => fechaLocalAlMediodia(new Date()));
  const [selector, setSelector] = useState(null); // dia | mes | anio
  const [anioDelMes, setAnioDelMes] = useState(() => new Date().getFullYear());
  const [aplicado, setAplicado] = useState(() => ({
    ...periodoDe(fechaLocalAlMediodia(new Date()), "dia"),
    modo: "dia", version: 0,
  }));
  const [loading, setLoading] = useState(true);
  const [jornadas, setJornadas] = useState([]);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (perfilLoading) {
      setLoading(true);
      return undefined;
    }
    if (!nominaValida) {
      setError(perfilError || "No encontramos tu número de nómina en SAP.");
      setJornadas([]);
      setLoading(false);
      return undefined;
    }
    let activo = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setJornadas([]);
    consultarHistorialRH({
      personalNumber: numeroRegistro,
      desde: aplicado.desde,
      hasta: aplicado.hasta,
      signal: controller.signal,
    }).then(({ jornadas: rows }) => {
      if (activo) setJornadas(Array.isArray(rows) ? rows : []);
    }).catch(e => {
      if (!activo) return;
      const status = e?.response?.status;
      const mensaje = status === 401 ? "Tu sesión terminó. Inicia sesión nuevamente."
        : status === 403 ? "No tienes permiso para consultar el historial."
        : status === 404 ? "No se encontró AttendanceHistorySet en SAP QAS."
        : status >= 500 ? "SAP no está disponible. Intenta más tarde."
        : e?.message === "El historial excedió el límite de páginas. Consulta un período menor."
          ? e.message
          : "No pudimos consultar las asistencias. Verifica tu conexión e inténtalo de nuevo.";
      setError(mensaje);
    }).finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; controller.abort(); };
  }, [numeroRegistro, nominaValida, perfilLoading, perfilError,
    aplicado.desde, aplicado.hasta, aplicado.version]));

  // Una selección en el calendario o en las listas lanza directamente la consulta.
  // Se incrementa version incluso si se vuelve a elegir el mismo día, mes o año.
  const aplicarSeleccion = (fecha, tipo) => {
    const nuevaFecha = fechaLocalAlMediodia(fecha);
    const periodo = periodoDe(nuevaFecha, tipo);
    setFechaElegida(nuevaFecha);
    setModo(tipo);
    setAplicado(prev => ({ ...periodo, modo: tipo, version: prev.version + 1 }));
    setSelector(null);
  };

  const abrirSelector = tipo => {
    setAnioDelMes(fechaElegida.getFullYear());
    setSelector(tipo);
  };

  const cambiarDia = (evento, fecha) => {
    if (evento?.type === "dismissed" || !fecha) {
      setSelector(null);
      return;
    }
    aplicarSeleccion(fecha, "dia");
  };

  const consultarDeNuevo = () => {
    setAplicado(prev => ({ ...prev, version: prev.version + 1 }));
  };

  // Los tres filtros caben en una sola fila. Tocar uno abre su selector;
  // no hay flechas, campos de fecha adicionales ni botón Buscar.
  const Filtros = <View style={s.filterCard}>
    <View style={s.modes}>
      {MODOS.map(opcion => <Pressable key={opcion.id} accessibilityRole="button"
        accessibilityLabel={`Seleccionar por ${opcion.label.toLowerCase()}`}
        accessibilityState={{ selected: modo === opcion.id }}
        onPress={() => abrirSelector(opcion.id)}
        style={({ pressed }) => [s.mode, modo === opcion.id && s.modeActive,
          pressed && s.pressed]}>
        <Ionicons name={opcion.id === "dia" ? "calendar-outline" :
          opcion.id === "mes" ? "calendar-number-outline" : "calendar-clear-outline"}
          size={17} color={modo === opcion.id ? C.red : C.sub}/>
        <Text style={[s.modeText, modo === opcion.id && s.modeTextActive]}>{opcion.label}</Text>
      </Pressable>)}
    </View>
    <Text style={s.selectedPeriod} numberOfLines={1}>
      {aplicado.etiqueta}
    </Text>
  </View>;

  const Encabezado = <View style={s.topContent}>
    {Filtros}
    {!loading && !error && <View style={s.summary}>
      <Text style={s.summaryCount}>{jornadas.length} {jornadas.length === 1 ? "día registrado" : "días registrados"}</Text>
    </View>}
    {loading && <View style={s.stateCard}>
      <ActivityIndicator size="large" color={C.red}/>
      <Text style={s.stateText}>Consultando tus asistencias en SAP…</Text>
    </View>}
    {!loading && !!error && <View style={s.stateCard}>
      <Ionicons name="alert-circle-outline" size={31} color={C.danger}/>
      <Text style={s.sectionTitle}>No se pudo cargar el historial</Text>
      <Text style={s.stateText}>{error}</Text>
      <Boton title="Reintentar" icon="refresh-outline" outline onPress={consultarDeNuevo}/>
    </View>}
    {!loading && !error && jornadas.length === 0 && <View style={s.stateCard}>
      <Ionicons name="calendar-clear-outline" size={32} color={C.sub}/>
      <Text style={s.sectionTitle}>Sin registros</Text>
      <Text style={s.stateText}>No encontramos asistencias para el período consultado.</Text>
    </View>}
  </View>;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.back()} style={s.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Historial de asistencias</Text>
        <Text style={s.headerSub}>Nómina {numeroRegistro || "—"}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar historial"
        onPress={consultarDeNuevo} style={s.reload} disabled={loading}>
        <Ionicons name="refresh-outline" size={21} color={C.red}/>
      </Pressable>
    </View>

    <FlatList data={loading || error ? [] : jornadas}
      keyExtractor={item => `${item.personalNumber}-${item.date}`}
      renderItem={({ item }) => <TarjetaJornada jornada={item}/>}
      ListHeaderComponent={Encabezado}
      ListFooterComponent={<View style={s.footer}>
        <Boton title="Ir a registrar asistencia" icon="finger-print-outline"
          outline onPress={() => router.push("/rrhh/asistencia")}/>
      </View>}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}/>

    {selector === "dia" && Platform.OS === "android" && <DateTimePicker
      value={fechaElegida} mode="date" display="default" onChange={cambiarDia}/>}

    {Platform.OS === "ios" && <Modal visible={selector === "dia"} transparent animationType="fade"
      onRequestClose={() => setSelector(null)}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Selecciona un día</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario"
              onPress={() => setSelector(null)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={C.ink}/>
            </Pressable>
          </View>
          <DateTimePicker value={fechaElegida} mode="date" display="inline"
            locale="es-MX" onChange={cambiarDia}/>
        </View>
      </View>
    </Modal>}

    <Modal visible={selector === "mes"} transparent animationType="fade"
      onRequestClose={() => setSelector(null)}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Selecciona un mes</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lista de meses"
              onPress={() => setSelector(null)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={C.ink}/>
            </Pressable>
          </View>
          <View style={s.monthYearRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Año anterior"
              style={s.yearArrow} onPress={() => setAnioDelMes(a => a - 1)}>
              <Ionicons name="chevron-back" size={21} color={C.red}/>
            </Pressable>
            <Text style={s.monthYearValue}>{anioDelMes}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Año siguiente"
              style={s.yearArrow} onPress={() => setAnioDelMes(a => a + 1)}>
              <Ionicons name="chevron-forward" size={21} color={C.red}/>
            </Pressable>
          </View>
          <View style={s.optionGrid}>
            {MESES.map((mes, index) => {
              const elegido = modo === "mes" && fechaElegida.getMonth() === index &&
                fechaElegida.getFullYear() === anioDelMes;
              return <Pressable key={mes} accessibilityRole="button"
                accessibilityLabel={`${mes} de ${anioDelMes}`}
                onPress={() => aplicarSeleccion(new Date(anioDelMes, index, 1, 12), "mes")}
                style={({ pressed }) => [s.option, elegido && s.optionSelected, pressed && s.pressed]}>
                <Text style={[s.optionText, elegido && s.optionTextSelected]}>
                  {mes[0].toUpperCase() + mes.slice(1)}
                </Text>
              </Pressable>;
            })}
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={selector === "anio"} transparent animationType="fade"
      onRequestClose={() => setSelector(null)}>
      <View style={s.overlay}>
        <View style={[s.modalCard, s.yearModal]}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Selecciona un año</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lista de años"
              onPress={() => setSelector(null)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={C.ink}/>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.optionGrid}>
            {ANIOS.map(anio => {
              const elegido = modo === "anio" && fechaElegida.getFullYear() === anio;
              return <Pressable key={anio} accessibilityRole="button"
                onPress={() => aplicarSeleccion(new Date(anio, 0, 1, 12), "anio")}
                style={({ pressed }) => [s.option, elegido && s.optionSelected, pressed && s.pressed]}>
                <Text style={[s.optionText, elegido && s.optionTextSelected]}>{anio}</Text>
              </Pressable>;
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { width: 30, height: 38, justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.ink },
  headerSub: { fontSize: 11, color: C.sub, marginTop: 3 },
  reload: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.pale,
    alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 32, gap: 13 },
  topContent: { gap: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  filterCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: 10, gap: 8 },
  modes: { flexDirection: "row", gap: 7 },
  mode: { flex: 1, minHeight: 39, flexDirection: "row", gap: 6,
    alignItems: "center", justifyContent: "center", borderRadius: 9,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  modeActive: { backgroundColor: C.pale, borderColor: C.red },
  modeText: { fontSize: 12.5, color: C.sub, fontWeight: "700" },
  modeTextActive: { color: C.red },
  selectedPeriod: { color: C.sub, fontSize: 11.5, textAlign: "center",
    textTransform: "capitalize" },
  button: { borderRadius: 12, minHeight: 48, backgroundColor: C.red,
    paddingHorizontal: 12, paddingVertical: 12, gap: 9, flexDirection: "row",
    alignItems: "center", justifyContent: "center" },
  buttonOutline: { backgroundColor: C.white, borderColor: C.red, borderWidth: 1 },
  buttonText: { color: C.white, fontWeight: "800", fontSize: 14 },
  buttonOutlineText: { color: C.red },
  disabled: { opacity: 0.52 },
  pressed: { opacity: 0.74 },
  summary: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", paddingHorizontal: 3 },
  summaryCount: { color: C.ink, fontWeight: "800", fontSize: 13 },
  stateCard: { borderRadius: 17, backgroundColor: C.white, borderWidth: 1,
    borderColor: C.border, padding: 26, alignItems: "center", gap: 13 },
  stateText: { fontSize: 12.5, color: C.sub, lineHeight: 19, textAlign: "center" },
  dayCard: { borderRadius: 17, backgroundColor: C.white, borderColor: C.border,
    borderWidth: 1, padding: 15, gap: 13 },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  calendarIcon: { backgroundColor: C.pale, borderRadius: 12, width: 43, height: 43,
    alignItems: "center", justifyContent: "center" },
  dayHeaderText: { flex: 1, gap: 3 },
  weekday: { color: C.ink, fontWeight: "800", fontSize: 14, textTransform: "capitalize" },
  dayDate: { color: C.sub, fontSize: 12, textTransform: "capitalize" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 12, backgroundColor: C.soft, borderRadius: 10, padding: 10 },
  statusLabel: { color: C.sub, fontWeight: "600", fontSize: 11.5 },
  statusValue: { color: C.ink, fontWeight: "800", fontSize: 11.5, flexShrink: 1, textAlign: "right" },
  timesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9 },
  timeCard: { width: "48.5%", padding: 11, backgroundColor: C.soft,
    borderRadius: 11, borderWidth: 1, borderColor: C.border, gap: 8 },
  timeLabel: { color: C.sub, fontSize: 11 },
  timeValue: { fontSize: 17, fontWeight: "800", color: C.ink },
  footer: { marginTop: 5, marginBottom: 12 },
  overlay: { flex: 1, backgroundColor: "#0007", padding: 20, justifyContent: "center" },
  modalCard: { backgroundColor: C.white, padding: 17, borderRadius: 18, gap: 14,
    maxHeight: "82%" },
  modalTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  modalClose: { padding: 5 },
  monthYearRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18 },
  yearArrow: { width: 40, height: 36, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, justifyContent: "center", alignItems: "center" },
  monthYearValue: { width: 68, textAlign: "center", fontSize: 16, fontWeight: "800", color: C.ink },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { width: "30%", minHeight: 43, borderRadius: 10, justifyContent: "center",
    alignItems: "center", backgroundColor: C.soft, borderWidth: 1, borderColor: C.border },
  optionSelected: { backgroundColor: C.pale, borderColor: C.red },
  optionText: { fontSize: 12, fontWeight: "700", color: C.ink },
  optionTextSelected: { color: C.red },
  yearModal: { maxHeight: "74%" },
});