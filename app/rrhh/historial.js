// app/rrhh/historial.js
// Historial independiente de asistencia (ETAPA DE PRUEBAS).
// Lee solo los movimientos de demostración guardados por app/rrhh/asistencia.js.
// NO consulta AttendanceHistorySet / AttendanceDaySet y NO registra movimientos en SAP.
// La conexión real a SAP se hará después de validar los filtros del servicio.

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

const C = {
  bg: "#F3F5F8",
  white: "#FFFFFF",
  text: "#1F2937",
  sub: "#596579",
  border: "#E5E9EF",
  red: "#E60012",
  redPale: "#FFF0F1",
  green: "#18794E",
  greenPale: "#EAF7F0",
  blue: "#355C7D",
  amber: "#94600C",
  amberPale: "#FFF7E8",
};

// Es la misma clave utilizada por app/rrhh/asistencia.js.
const LOCAL_PREFIX = "rh:demo:attendance:v2:";
const FILTERS = [
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
  { id: "all", label: "Todo", days: null },
];

const pad = n => String(n).padStart(2, "0");
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function normalizeNumber(value) {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = String(first ?? "").trim();
  return /^\d{1,8}$/.test(raw) ? raw.padStart(8, "0") : "";
}

function friendlyDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return "Fecha no disponible";
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime()) || localDay(d) !== value) return value;
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function friendlyType(item) {
  const map = {
    modalidad: "Modalidad de trabajo",
    entrada: item?.late ? "Entrada con retardo" : "Entrada",
    comida_inicio: "Inicio de comida",
    comida_fin: "Regreso de comida",
    salida: item?.early ? "Salida anticipada" : "Salida normal",
  };
  return map[item?.type] || "Movimiento de prueba";
}

function typeIcon(type) {
  return ({ modalidad: "business-outline", entrada: "log-in-outline", comida_inicio: "restaurant-outline", comida_fin: "play-outline", salida: "log-out-outline" })[type] || "time-outline";
}

function statusForDay(items) {
  const types = new Set(items.map(x => x.type));
  if (types.has("entrada") && types.has("salida")) return { text: "Completa (prueba)", good: true };
  if (types.has("entrada")) return { text: "En curso (prueba)", good: false };
  return { text: "Sin entrada (prueba)", good: false };
}

function PressAction({ label, icon, onPress, light = false }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.action, light && s.actionLight, pressed && { opacity: 0.75 }]}> 
      <Ionicons name={icon} size={18} color={light ? C.red : C.white} />
      <Text style={[s.actionText, light && { color: C.red }]}>{label}</Text>
    </Pressable>
  );
}

function ItemDetail({ record, onClose }) {
  if (!record) return null;
  const properties = [
    ["Tipo", friendlyType(record)],
    ["Fecha", friendlyDate(record.date)],
    ["Hora", record.time || "No registrada"],
    ["Modalidad", record.modality],
    ["Motivo", record.reason],
    ["Comentario", record.comment],
    ["Viaje desde", record.startDate],
    ["Viaje hasta", record.endDate],
    ["Salida anticipada", record.type === "salida" ? (record.early ? "Sí" : "No") : null],
    ["Entrada tardía", record.type === "entrada" ? (record.late ? "Sí" : "No") : null],
  ].filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== "");

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          <View style={s.modalTop}>
            <Text style={s.titleSmall}>Detalle del movimiento</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle" onPress={onClose} style={s.close}>
              <Ionicons name="close" color={C.text} size={24} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 390 }} contentContainerStyle={{ gap: 12 }}>
            {properties.map(([label, val]) => (
              <View key={label} style={s.detailRow}>
                <Text style={s.detailLabel}>{label}</Text>
                <Text style={s.detailValue} selectable>{String(val)}</Text>
              </View>
            ))}
            <Text style={s.demoText}>Registro local de demostración. No representa una marcación guardada en SAP.</Text>
          </ScrollView>
          <PressAction label="Cerrar" icon="close-outline" onPress={onClose} light />
        </View>
      </View>
    </Modal>
  );
}

export default function RHHistorial() {
  const params = useLocalSearchParams();
  const personalNumber = normalizeNumber(params.personalNumber);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState("30");
  const [selected, setSelected] = useState(null);
  const [reload, setReload] = useState(0);

  // Cada vez que se abre la pantalla, se actualizan los movimientos locales.
  useFocusEffect(useCallback(() => {
    if (!personalNumber) {
      setRecords([]);
      setLoading(false);
      setError("No se recibió un número de empleado válido.");
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError("");
    AsyncStorage.getItem(`${LOCAL_PREFIX}${personalNumber}`)
      .then(raw => {
        if (!active) return;
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw new Error("El historial local tiene un formato inválido.");
        // Evita mostrar registros de otro empleado aunque el almacenamiento esté corrupto.
        const ownRecords = parsed.filter(r =>
          r && typeof r === "object" &&
          normalizeNumber(r.personalNumber) === personalNumber &&
          r.demo === true &&
          /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "")
        );
        setRecords(ownRecords);
      })
      .catch(e => {
        if (!active) return;
        setRecords([]);
        setError(e?.message || "No se pudieron leer los movimientos guardados en este dispositivo.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [personalNumber, reload]));

  const filtered = useMemo(() => {
    const days = FILTERS.find(f => f.id === filter)?.days;
    let min = null;
    if (days) {
      const from = new Date();
      from.setHours(12, 0, 0, 0);
      from.setDate(from.getDate() - (days - 1));
      min = localDay(from);
    }
    return records
      .filter(r => !min || r.date >= min)
      .slice()
      .sort((a, b) => {
        const ka = `${a.date}|${a.time || ""}|${a.createdAt || ""}`;
        const kb = `${b.date}|${b.time || ""}|${b.createdAt || ""}`;
        return kb.localeCompare(ka);
      });
  }, [records, filter]);

  const days = useMemo(() => {
    const map = new Map();
    filtered.forEach(r => {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push(r);
    });
    return [...map.entries()].map(([date, items]) => ({ date, items }));
  }, [filtered]);

  const toAttendance = () => router.push({ pathname: "/rrhh/asistencia", params: { personalNumber } });

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver al perfil" onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" color={C.text} size={23} />
        </Pressable>
        <View style={s.brand}><Text style={s.brandText}>RH</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Historial de asistencia</Text>
          <Text style={s.sub}>Empleado {personalNumber || "sin seleccionar"}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.banner}>
          <Ionicons name="flask-outline" color={C.amber} size={21} />
          <Text style={s.bannerText}>
            Historial de pruebas locales. Aquí solo aparecen registros simulados guardados en este dispositivo para el empleado seleccionado; todavía no son datos de SAP.
          </Text>
        </View>

        <View style={s.summary}>
          <Text style={s.titleSmall}>Movimientos de demostración</Text>
          <Text style={s.summaryValue}>{filtered.length}</Text>
          <Text style={s.sub}>En {days.length} día(s) del período seleccionado</Text>
        </View>

        <View style={s.filters}>
          {FILTERS.map(item => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: filter === item.id }} onPress={() => setFilter(item.id)} style={[s.chip, filter === item.id && s.chipActive]}>
              <Text style={[s.chipText, filter === item.id && s.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {!personalNumber || error ? (
          <View style={s.empty}>
            <Ionicons name="alert-circle-outline" color={C.red} size={34} />
            <Text style={s.titleSmall}>No fue posible cargar el historial</Text>
            <Text style={s.subCenter}>{error || "Ingresa primero a Recursos Humanos y consulta un empleado."}</Text>
            {personalNumber ? <PressAction label="Reintentar" icon="refresh-outline" onPress={() => setReload(n => n + 1)} /> : null}
            <PressAction label="Volver a RR. HH." icon="arrow-back" light onPress={() => router.replace("/rrhh")} />
          </View>
        ) : loading ? (
          <View style={s.loading}><ActivityIndicator color={C.red} size="large" /><Text style={s.sub}>Leyendo registros locales…</Text></View>
        ) : days.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" color={C.sub} size={35} />
            <Text style={s.titleSmall}>Sin movimientos de prueba</Text>
            <Text style={s.subCenter}>Todavía no hay registros locales en este período. Puedes realizar una prueba en Asistencia y regresar a consultar el historial.</Text>
            <PressAction label="Ir a Asistencia" icon="time-outline" onPress={toAttendance} />
          </View>
        ) : (
          days.map(group => {
            const status = statusForDay(group.items);
            return (
              <View key={group.date} style={s.dayCard}>
                <View style={s.dayHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.dayTitle}>{friendlyDate(group.date)}</Text>
                    <Text style={s.sub}>{group.items.length} movimiento(s)</Text>
                  </View>
                  <View style={[s.status, status.good ? s.statusGood : s.statusPending]}>
                    <Text style={[s.statusText, { color: status.good ? C.green : C.amber }]}>{status.text}</Text>
                  </View>
                </View>
                {group.items.map((item, i) => (
                  <Pressable accessibilityRole="button" key={`${item.id || item.createdAt || item.type}-${i}`} onPress={() => setSelected(item)} style={({ pressed }) => [s.event, pressed && { backgroundColor: "#F9FAFB" }]}>
                    <View style={s.eventIcon}><Ionicons name={typeIcon(item.type)} size={20} color={C.red} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.eventTitle}>{friendlyType(item)}</Text>
                      {item.type === "modalidad" && item.modality ? <Text style={s.sub}>{item.modality}</Text> : null}
                    </View>
                    <Text style={s.eventTime}>{item.time || "--:--"}</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.sub} />
                  </Pressable>
                ))}
              </View>
            );
          })
        )}
        {personalNumber ? <PressAction label="Abrir Asistencia" icon="time-outline" light onPress={toAttendance} /> : null}
        <Text style={s.note}>Para obtener un historial real, primero validaremos en SAP los filtros y la implementación de AttendanceDaySet / AttendanceHistorySet.</Text>
      </ScrollView>
      <ItemDetail record={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { padding: 12, backgroundColor: C.white, borderBottomColor: C.border, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  brand: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.red, alignItems: "center", justifyContent: "center" },
  brandText: { color: C.white, fontSize: 13, fontWeight: "900" },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  sub: { color: C.sub, fontSize: 12, lineHeight: 18 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  banner: { padding: 13, borderRadius: 14, backgroundColor: C.amberPale, borderWidth: 1, borderColor: "#F1DDB5", flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bannerText: { color: C.amber, fontSize: 12, lineHeight: 19, flex: 1 },
  titleSmall: { color: C.text, fontSize: 16, fontWeight: "800" },
  summary: { backgroundColor: C.white, borderColor: C.border, borderWidth: 1, padding: 16, borderRadius: 17, gap: 7 },
  summaryValue: { color: C.text, fontWeight: "900", fontSize: 29 },
  filters: { flexDirection: "row", gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, minHeight: 39, alignItems: "center", justifyContent: "center" },
  chipActive: { borderColor: C.red, backgroundColor: C.redPale },
  chipText: { color: C.sub, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: C.red, fontWeight: "800" },
  dayCard: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 17, overflow: "hidden" },
  dayHeader: { borderBottomWidth: 1, borderBottomColor: C.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  dayTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  status: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 135 },
  statusGood: { backgroundColor: C.greenPale },
  statusPending: { backgroundColor: C.amberPale },
  statusText: { fontSize: 10, fontWeight: "800", textAlign: "center" },
  event: { minHeight: 64, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center", flexDirection: "row", gap: 10, borderBottomWidth: 1, borderColor: C.border },
  eventIcon: { backgroundColor: C.redPale, width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventTitle: { color: C.text, fontSize: 13, fontWeight: "700" },
  eventTime: { color: C.text, fontWeight: "700", fontSize: 12 },
  empty: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 22, gap: 13, alignItems: "center" },
  subCenter: { color: C.sub, fontSize: 13, lineHeight: 20, textAlign: "center" },
  loading: { alignItems: "center", padding: 25, gap: 12 },
  action: { minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 14, backgroundColor: C.red, borderRadius: 13 },
  actionLight: { backgroundColor: C.white, borderColor: C.red, borderWidth: 1 },
  actionText: { color: C.white, fontSize: 13, fontWeight: "700" },
  note: { color: C.sub, fontSize: 11, textAlign: "center", lineHeight: 17 },
  overlay: { flex: 1, backgroundColor: "#00000070", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 440, padding: 18, borderRadius: 20, backgroundColor: C.white, gap: 14 },
  modalTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  close: { marginLeft: "auto", height: 40, width: 40, alignItems: "center", justifyContent: "center" },
  detailRow: { gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 9 },
  detailLabel: { color: C.sub, fontSize: 12 },
  detailValue: { color: C.text, fontWeight: "600", fontSize: 14 },
  demoText: { color: C.amber, fontSize: 12, lineHeight: 19 },
});