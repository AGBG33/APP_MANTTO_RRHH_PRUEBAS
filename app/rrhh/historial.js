// app/rrhh/historial.js
// Historial funcional: consulta AttendanceHistorySet en SAP QAS por nómina y fechas.
// NO utiliza AsyncStorage. Los registros y sus detalles vienen de la respuesta OData.
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { cambiarDiasRH, consultarHistorialRH, fechaLocalRH } from "../../src/services/rhHistory";

const C = {
  bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C",
  greenBg: "#EAF7EF", blue: "#375A80", blueBg: "#ECF3FA",
  amber: "#95610C", amberBg: "#FFF7E8", danger: "#AF2634",
};
const primero = valor => Array.isArray(valor) ? valor[0] : valor;
const esNomina = numero => /^\d{1,8}$/.test(String(numero ?? "").trim());
const normalizarNomina = numero => esNomina(numero) ? String(numero).trim().padStart(8, "0") : "";
const inicioHoy = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
};
const fechaAmigable = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "Fecha no informada";
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};
const fechaCorta = date => date.toLocaleDateString("es-MX", {
  day: "2-digit", month: "short", year: "numeric",
});
const PRESETS = [
  { id: "hoy", label: "Hoy", dias: 1 },
  { id: "7", label: "7 días", dias: 7 },
  { id: "30", label: "30 días", dias: 30 },
];

function Dato({ label, value }) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return <View style={s.detailRow}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={s.detailValue} selectable>{String(value)}</Text>
  </View>;
}

function Boton({ title, icon = "search-outline", onPress, outline = false, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, outline && s.buttonOutline, disabled && s.disabled, pressed && s.pressed]}>
    <Ionicons name={icon} size={19} color={outline ? C.red : C.white}/>
    <Text style={[s.buttonText, outline && { color: C.red }]}>{title}</Text>
  </Pressable>;
}

function SeleccionFecha({ label, value, onPress }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${fechaCorta(value)}`}
    style={({ pressed }) => [s.dateSelect, pressed && s.pressed]}>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.dateLabel}>{label}</Text>
      <Text style={s.dateValue}>{fechaCorta(value)}</Text>
    </View>
    <Ionicons name="calendar-outline" size={19} color={C.red}/>
  </Pressable>;
}

export default function RHHistorial() {
  const params = useLocalSearchParams();
  const personalNumber = normalizarNomina(primero(params.personalNumber));
  const raw = String(primero(params.numeroRegistro) ?? "").trim();
  // La pantalla de RRHH conserva el número tecleado (ej. 1111111) para el GET.
  const numeroRegistro = esNomina(raw) && normalizarNomina(raw) === personalNumber
    ? raw : personalNumber;

  const [desde, setDesde] = useState(() => cambiarDiasRH(inicioHoy(), -6));
  const [hasta, setHasta] = useState(inicioHoy);
  const [preset, setPreset] = useState("7");
  const [picker, setPicker] = useState(null); // 'desde' o 'hasta'
  // Cambiar una fecha NO dispara consultas hasta pulsar Buscar.
  const [aplicado, setAplicado] = useState(() => ({
    desde: fechaLocalRH(cambiarDiasRH(inicioHoy(), -6)),
    hasta: fechaLocalRH(inicioHoy()),
    id: 0,
  }));
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState("");
  const [metodo, setMetodo] = useState("");
  const [selected, setSelected] = useState(null);

  useFocusEffect(useCallback(() => {
    if (!numeroRegistro) {
      setError("Primero consulta un empleado en la pantalla de Recursos Humanos.");
      setRegistros([]);
      setLoading(false);
      return undefined;
    }
    let activo = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    setRegistros([]);
    consultarHistorialRH({ personalNumber: numeroRegistro,
      desde: aplicado.desde, hasta: aplicado.hasta, signal: controller.signal })
      .then(({ registros: rows, metodo: via }) => {
        if (!activo) return;
        setRegistros(rows);
        setMetodo(via);
      })
      .catch(e => {
        if (!activo) return;
        const status = e?.response?.status;
        const mensaje = status === 401 ? "La sesión expiró. Inicia sesión nuevamente."
          : status === 403 ? "No tienes permiso para consultar el historial del empleado."
          : status === 404 ? "No se encontró AttendanceHistorySet en el servidor."
          : status >= 500 ? "SAP QAS no está disponible por el momento."
          : e?.message || "No fue posible consultar SAP QAS.";
        setError(mensaje);
      })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; controller.abort(); };
  }, [numeroRegistro, aplicado]));

  const aplicar = (a, b, presetSeleccionado = "custom") => {
    const inicio = fechaLocalRH(a);
    const fin = fechaLocalRH(b);
    if (inicio > fin) {
      Alert.alert("Revisa las fechas", "La fecha inicial no puede ser posterior a la final.");
      return;
    }
    const days = Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000) + 1;
    if (days > 90) {
      Alert.alert("Rango muy amplio", "Selecciona un período de hasta 90 días por consulta.");
      return;
    }
    setPreset(presetSeleccionado);
    setAplicado(prev => ({ desde: inicio, hasta: fin, id: prev.id + 1 }));
  };

  const seleccionarPreset = item => {
    const fin = inicioHoy();
    const inicio = cambiarDiasRH(fin, 1 - item.dias);
    setDesde(inicio);
    setHasta(fin);
    aplicar(inicio, fin, item.id);
  };

  const alCambiarFecha = (event, nuevaFecha) => {
    if (Platform.OS === "android") setPicker(null);
    if (event?.type === "dismissed" || !nuevaFecha) return;
    const fecha = new Date(nuevaFecha.getFullYear(), nuevaFecha.getMonth(), nuevaFecha.getDate(), 12);
    if (picker === "desde") setDesde(fecha);
    if (picker === "hasta") setHasta(fecha);
    setPreset("custom");
  };

  const grupos = useMemo(() => {
    const map = new Map();
    for (const item of registros) {
      const key = item.date || "sin-fecha";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].map(([date, items]) => ({ date, items }));
  }, [registros]);
  const entradas = registros.filter(r => r.registerType === "P10").length;
  const salidas = registros.filter(r => r.registerType === "P20").length;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver a RRHH"
        onPress={() => router.back()} style={s.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Historial de asistencias</Text>
        <Text style={s.headerSub}>Nómina {numeroRegistro || "sin seleccionar"} · SAP QAS</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar historial"
        onPress={() => setAplicado(prev => ({ ...prev, id: prev.id + 1 }))}
        style={s.reload} disabled={loading}>
        <Ionicons name="refresh-outline" size={21} color={C.red}/>
      </Pressable>
    </View>

    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.notice}>
        <Ionicons name="cloud-done-outline" size={20} color={C.blue}/>
        <Text style={s.noticeText}>Los registros se consultan directamente en SAP QAS mediante AttendanceHistorySet. No se usa el historial del teléfono.</Text>
      </View>

      <View style={s.card}>
        <View style={s.sectionLine}>
          <Ionicons name="options-outline" size={20} color={C.red}/>
          <Text style={s.sectionTitle}>Filtros de consulta</Text>
        </View>
        <Text style={s.label}>Período rápido</Text>
        <View style={s.presets}>
          {PRESETS.map(item => <Pressable key={item.id} accessibilityRole="button"
            accessibilityState={{ selected: preset === item.id }}
            style={[s.preset, preset === item.id && s.presetActive]}
            onPress={() => seleccionarPreset(item)}>
            <Text style={[s.presetText, preset === item.id && s.presetTextActive]}>{item.label}</Text>
          </Pressable>)}
        </View>
        <Text style={s.label}>Rango personalizado</Text>
        <View style={s.dates}>
          <SeleccionFecha label="Desde" value={desde} onPress={() => setPicker("desde")}/>
          <SeleccionFecha label="Hasta" value={hasta} onPress={() => setPicker("hasta")}/>
        </View>
        <Boton title={loading ? "Consultando SAP…" : "Buscar asistencias"} icon="search-outline"
          disabled={loading || !numeroRegistro} onPress={() => aplicar(desde, hasta, preset)}/>
        <Text style={s.helper}>Consultando del {aplicado.desde} al {aplicado.hasta} (ambos incluidos).</Text>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Resumen del período</Text>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statValue}>{registros.length}</Text><Text style={s.statLabel}>Movimientos</Text></View>
          <View style={s.stat}><Text style={[s.statValue, { color: C.green }]}>{entradas}</Text><Text style={s.statLabel}>Entradas P10</Text></View>
          <View style={s.stat}><Text style={[s.statValue, { color: C.blue }]}>{salidas}</Text><Text style={s.statLabel}>Salidas P20</Text></View>
        </View>
        {!!metodo && !loading && <Text style={s.helper}>Fuente: SAP QAS · {metodo === "dias_individuales" ? "Consulta por fechas individuales" : metodo === "dia" ? "Consulta por día" : "Consulta por rango"}</Text>}
      </View>

      {loading ? <View style={s.stateCard}>
        <ActivityIndicator size="large" color={C.red}/>
        <Text style={s.sectionTitle}>Consultando SAP QAS</Text>
        <Text style={s.stateText}>Buscando las asistencias del período seleccionado…</Text>
      </View> : !!error ? <View style={s.stateCard}>
        <Ionicons name="alert-circle-outline" size={35} color={C.danger}/>
        <Text style={s.sectionTitle}>No se pudo consultar el historial</Text>
        <Text style={s.stateText}>{error}</Text>
        <Boton title="Reintentar" icon="refresh-outline" outline
          onPress={() => setAplicado(prev => ({ ...prev, id: prev.id + 1 }))}/>
      </View> : registros.length === 0 ? <View style={s.stateCard}>
        <Ionicons name="calendar-clear-outline" size={37} color={C.sub}/>
        <Text style={s.sectionTitle}>No hay asistencias en este período</Text>
        <Text style={s.stateText}>SAP respondió sin registros para la nómina y las fechas consultadas. Puedes seleccionar otro rango.</Text>
      </View> : <>
        <Text style={s.listHeading}>Movimientos encontrados</Text>
        {grupos.map(group => <View key={group.date} style={s.dayCard}>
          <View style={s.dayHead}>
            <View style={s.dayIcon}><Ionicons name="calendar-outline" color={C.red} size={19}/></View>
            <View style={{ flex: 1 }}>
              <Text style={s.dayTitle}>{fechaAmigable(group.date)}</Text>
              <Text style={s.muted}>{group.items.length} movimiento(s)</Text>
            </View>
          </View>
          {group.items.map((reg, i) => <Pressable key={`${reg.id}-${i}`}
            accessibilityRole="button" onPress={() => setSelected(reg)}
            style={({ pressed }) => [s.event, pressed && s.pressed]}>
            <View style={s.eventIcon}><Ionicons name={reg.icon} size={19} color={C.red}/></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.eventTitle}>{reg.title}</Text>
              <Text style={s.muted}>{reg.registerType || "Código no informado"} · SAP QAS</Text>
            </View>
            <Text style={s.eventTime}>{reg.time?.slice(0,5) || "--:--"}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.sub}/>
          </Pressable>)}
        </View>)}
      </>}
      {!!personalNumber && <Boton title="Ir a Check-in" icon="finger-print-outline" outline
        onPress={() => router.push({ pathname: "/rrhh/asistencia", params: { personalNumber, numeroRegistro } })}/>}
      <Text style={s.bottomNote}>Modo de pruebas QAS. El acceso por nómina manual debe restringirse en backend/SAP antes de producción.</Text>
    </ScrollView>

    {/* Android usa diálogo nativo; iOS utiliza selector dentro de modal. */}
    {picker && Platform.OS === "android" && <DateTimePicker
      value={picker === "desde" ? desde : hasta} mode="date" display="default"
      onChange={alCambiarFecha}/>} 
    {picker && Platform.OS === "ios" && <Modal visible transparent animationType="fade" onRequestClose={() => setPicker(null)}>
      <View style={s.overlay}><View style={s.modalCard}>
        <Text style={s.sectionTitle}>Selecciona fecha {picker === "desde" ? "inicial" : "final"}</Text>
        <DateTimePicker value={picker === "desde" ? desde : hasta} mode="date" display="spinner"
          locale="es-MX" onChange={alCambiarFecha}/>
        <Boton title="Listo" icon="checkmark-outline" onPress={() => setPicker(null)}/>
      </View></View>
    </Modal>}

    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <View style={s.overlay}><View style={s.modalCard}>
        <View style={s.modalHead}>
          <Text style={s.sectionTitle}>Detalle del registro SAP</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle"
            onPress={() => setSelected(null)}>
            <Ionicons name="close" size={23} color={C.ink}/>
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 430 }}>
          <Dato label="Movimiento" value={selected?.title}/>
          <Dato label="Código de marcación" value={selected?.registerType}/>
          <Dato label="Fecha" value={selected?.date}/>
          <Dato label="Hora" value={selected?.time}/>
          <Dato label="Nómina" value={selected?.personalNumber || numeroRegistro}/>
          <Dato label="Nombre" value={selected?.fullName}/>
          <Dato label="Canal" value={selected?.channel}/>
          <Dato label="Estatus" value={selected?.status}/>
          <Dato label="Horario" value={selected?.schedule}/>
          <Dato label="Zona" value={selected?.zone}/>
          <Dato label="Centro / Oficina" value={selected?.centerOffice}/>
          <Dato label="Retardo" value={selected?.isLate}/>
          <Dato label="Estatus GPS" value={selected?.geoStatus}/>
          <Dato label="Estado de solicitud" value={selected?.statusReq}/>
          <Dato label="Mensaje SAP" value={selected?.message}/>
          <Dato label="Identificador SAP" value={selected?.id}/>
        </ScrollView>
        <Text style={s.bottomNote}>Información devuelta por AttendanceHistorySet de SAP QAS.</Text>
        <Boton title="Cerrar" icon="close-outline" outline onPress={() => setSelected(null)}/>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { width: 30, height: 38, justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.ink },
  headerSub: { fontSize: 11, color: C.sub, marginTop: 3 },
  reload: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.pale, alignItems: "center", justifyContent: "center" },
  content: { gap: 15, padding: 16, paddingBottom: 42 },
  notice: { flexDirection: "row", gap: 10, padding: 13, backgroundColor: C.blueBg, borderRadius: 13 },
  noticeText: { flex: 1, fontSize: 12, color: C.blue, lineHeight: 18 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 16, gap: 14 },
  sectionLine: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  label: { fontSize: 12, fontWeight: "700", color: C.ink },
  presets: { flexDirection: "row", gap: 8 },
  preset: { flex: 1, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: C.border, borderRadius: 11 },
  presetActive: { backgroundColor: C.pale, borderColor: C.red },
  presetText: { fontSize: 12, color: C.sub, fontWeight: "700" },
  presetTextActive: { color: C.red },
  dates: { flexDirection: "row", gap: 10 },
  dateSelect: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#FBFCFE" },
  dateLabel: { color: C.sub, fontSize: 11 },
  dateValue: { color: C.ink, fontWeight: "800", fontSize: 13 },
  button: { borderRadius: 12, minHeight: 48, backgroundColor: C.red, paddingHorizontal: 12, paddingVertical: 12, gap: 9, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  buttonOutline: { backgroundColor: C.white, borderColor: C.red, borderWidth: 1 },
  buttonText: { color: C.white, fontWeight: "800", fontSize: 14 },
  disabled: { opacity: .52 },
  pressed: { opacity: .74 },
  helper: { color: C.sub, fontSize: 11.5, lineHeight: 17 },
  stats: { flexDirection: "row", gap: 7 },
  stat: { flex: 1, backgroundColor: "#F8F9FB", borderRadius: 11, paddingVertical: 12, alignItems: "center", gap: 4 },
  statValue: { fontSize: 25, fontWeight: "900", color: C.ink },
  statLabel: { fontSize: 10.5, color: C.sub, textAlign: "center" },
  stateCard: { borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, padding: 26, alignItems: "center", gap: 13 },
  stateText: { fontSize: 12.5, color: C.sub, lineHeight: 19, textAlign: "center" },
  listHeading: { fontSize: 16, fontWeight: "800", color: C.ink, marginTop: 5 },
  dayCard: { borderRadius: 17, backgroundColor: C.white, borderColor: C.border, borderWidth: 1, padding: 15, gap: 3 },
  dayHead: { flexDirection: "row", alignItems: "center", gap: 11, paddingBottom: 10 },
  dayIcon: { backgroundColor: C.pale, borderRadius: 12, width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  dayTitle: { fontSize: 14, fontWeight: "800", color: C.ink, textTransform: "capitalize" },
  muted: { color: C.sub, fontSize: 12, lineHeight: 18 },
  event: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 12 },
  eventIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.pale },
  eventTitle: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  eventTime: { fontSize: 13, fontWeight: "800", color: C.ink },
  bottomNote: { fontSize: 11, color: C.sub, lineHeight: 17, textAlign: "center" },
  overlay: { flex: 1, backgroundColor: "#0007", padding: 20, justifyContent: "center" },
  modalCard: { backgroundColor: C.white, padding: 18, borderRadius: 18, gap: 15 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", gap: 10 },
  detailLabel: { color: C.sub, fontSize: 12, flex: 1 },
  detailValue: { color: C.ink, fontWeight: "600", fontSize: 12, textAlign: "right", flex: 1.4 },
});