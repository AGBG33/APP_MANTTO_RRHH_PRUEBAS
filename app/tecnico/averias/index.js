// app/tecnico/averias/index.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import Header from "../../../src/components/Header";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../src/context/AuthContext";
import api from "../../../src/services/api";
import {
  saveAveriasListCache,
  loadAveriasListCache,
} from "../../../src/offline/averiasCache";
// Paleta Fiori
const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1", // azul SAP
};
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
// ===== Helpers =====
const isOnlineNow = async () => {
  const st = await NetInfo.fetch();
  return !!st?.isConnected && st?.isInternetReachable !== false;
};
const ymd = (d) => {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
// OData datetime: YYYY-MM-DDTHH:mm:ss
const toOdataDateTime = (d, endOfDay = false) => {
  const date = new Date(d);
  if (endOfDay) date.setHours(23, 59, 59, 0);
  else date.setHours(0, 0, 0, 0);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};
// SAP /Date(…)/ a Date
const sapDateToDate = (val) => {
  if (!val) return null;
  const s = String(val);
  const m = s.match(/\/Date\((\d+)\)\//);
  if (m?.[1]) {
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};
const formatDate = (value) => {
  if (!value) return "—";
  const text = String(value).trim();
  const sapMatch = text.match(/\/Date\((-?\d+)(?:[+-]\d{4})?\)\//);
  // NotifDate representa una fecha de calendario en SAP. Se leen sus
  // componentes UTC para evitar que la zona horaria de México la reste un día.
  if (sapMatch?.[1]) {
    const ms = Number(sapMatch[1]);
    if (!Number.isFinite(ms)) return "—";
    const d = new Date(ms);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  // También evita el desfase para valores ISO como 2026-08-02 o
  // 2026-08-02T00:00:00.
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
const atStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const atEndOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfYear = (y) => new Date(y, 0, 1, 0, 0, 0, 0);
const endOfYear = (y) => new Date(y, 11, 31, 23, 59, 59, 999);
// ===== UI helpers =====
const normalize = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
export default function AveriaIndexTecnico() {
  const { user, token } = useAuth();
  const [avisos, setAvisos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [offlineMsg, setOfflineMsg] = useState("");
  // ✅ Buscador
  const [query, setQuery] = useState("");
  // Filtros
  const [dateMode, setDateMode] = useState("day"); // 'day' | 'weekRange' | 'month' | 'year'
  // Día
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);
  // Semana (rango)
  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);
  // Mes
  const now = new Date();
  const [monthYear, setMonthYear] = useState({
    month: now.getMonth(),
    year: now.getFullYear(),
  });
  const [showMonthModal, setShowMonthModal] = useState(false);
  // Año
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);
  const getCorreo = () =>
    user?.email ||
    user?.correo ||
    user?.preferred_username ||
    user?.upn ||
    user?.username ||
    "";
  // ===== ventana activa =====
  const { start, end } = useMemo(() => {
    if (dateMode === "day") {
      const s = atStartOfDay(dayRef);
      return { start: s, end: s };
    }
    if (dateMode === "weekRange") {
      return {
        start: weekStart ? atStartOfDay(weekStart) : atStartOfDay(new Date()),
        end: weekEnd ? atEndOfDay(weekEnd) : atEndOfDay(new Date()),
      };
    }
    if (dateMode === "month") {
      const ref = new Date(monthYear.year, monthYear.month, 1);
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    }
    if (dateMode === "year") {
      return { start: startOfYear(yearOnly), end: endOfYear(yearOnly) };
    }
    // 'all' -> últimos 90 días
    const e = new Date();
    const s = new Date();
    s.setDate(s.getDate() - 90);
    return { start: atStartOfDay(s), end: atEndOfDay(e) };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);
  const activeRangeText = useMemo(() => {
    if (dateMode === "day")
      return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    if (dateMode === "weekRange") {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—";
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—";
      return `Semana (rango): ${a} → ${b}`;
    }
    if (dateMode === "month")
      return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    if (dateMode === "year") return `Año: ${yearOnly}`;
    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);
  const fetchAvisosForRange = useCallback(async () => {
    const correo = getCorreo();
    const startYmd = ymd(start);
    const endYmd = ymd(end);
    try {
      setErrorMsg("");
      setOfflineMsg("");
      setLoading(true);
      if (!correo) {
        setAvisos([]);
        setErrorMsg("No se encontró el correo del usuario logueado.");
        return;
      }
      const online = await isOnlineNow();
      // ✅ OFFLINE -> intenta cache
      if (!online) {
        const cached = await loadAveriasListCache({ correo, startYmd, endYmd });
        const items = cached?.items || cached?.value?.items || [];
        if (Array.isArray(items) && items.length) {
          setAvisos(items);
          setOfflineMsg(
            `Mostrando datos offline (guardados: ${new Date(cached.savedAt).toLocaleString()})`,
          );
        } else {
          setAvisos([]);
          setErrorMsg("Sin conexión y no hay cache para este filtro.");
        }
        return;
      }
      // ✅ ONLINE -> pega a SAP
      const createdFrom = toOdataDateTime(start, false);
      const notifTo = toOdataDateTime(end, true);
      const filter = `CreatedOn ge datetime'${createdFrom}' and NotifDate le datetime'${notifTo}' and Userstatus eq '${correo}'`;
      const res = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet`,
        {
          params: { $filter: filter, $format: "json" },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const raw = res?.data;
      const results =
        raw?.d?.results ??
        raw?.value ??
        (Array.isArray(raw?.d) ? raw.d : null) ??
        (Array.isArray(raw) ? raw : []);
      const mapped = (Array.isArray(results) ? results : []).map((it) => ({
        id: it?.NotifNo,
        NotifNo: it?.NotifNo,
        ShortText: it?.ShortText || "",
        Equipment: it?.Equipment || "",
        MaterialLong: it?.MaterialLong || "",
        CustNo: it?.CustNo || "",
        NotifDate: it?.NotifDate || null,
        CreatedOn: it?.CreatedOn || null,
        raw: it,
      }));
      mapped.sort((a, b) => {
        const da = sapDateToDate(a.NotifDate)?.getTime() ?? 0;
        const db = sapDateToDate(b.NotifDate)?.getTime() ?? 0;
        return db - da;
      });
      setAvisos(mapped);
      // ✅ guarda cache (para offline)
      await saveAveriasListCache({ correo, startYmd, endYmd, items: mapped });
    } catch (err) {
      console.error("Error cargando avisos OData:", err?.response?.data || err);
      setErrorMsg(
        "No se pudieron cargar los avisos desde SAP. Intenta nuevamente.",
      );
      // ✅ fallback a cache
      try {
        const correo = getCorreo();
        const startYmd = ymd(start);
        const endYmd = ymd(end);
        const cached = await loadAveriasListCache({ correo, startYmd, endYmd });
        const items = cached?.items || [];
        if (Array.isArray(items) && items.length) {
          setAvisos(items);
          setOfflineMsg(
            `Mostrando último cache guardado (guardado: ${new Date(cached.savedAt).toLocaleString()})`,
          );
          setErrorMsg("");
        } else {
          setAvisos([]);
        }
      } catch {
        setAvisos([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    start,
    end,
    token,
    user,
    dateMode,
    dayRef,
    weekStart,
    weekEnd,
    monthYear,
    yearOnly,
  ]);
  useEffect(() => {
    fetchAvisosForRange();
  }, [fetchAvisosForRange]);
  const onRefresh = () => {
    setRefreshing(true);
    fetchAvisosForRange();
  };
  const YearPickerContent = ({
    selectedYear,
    onSelect,
    from = 2020,
    to = now.getFullYear() + 2,
  }) => {
    const years = [];
    for (let y = to; y >= from; y--) years.push(y);
    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((y) => (
          <TouchableOpacity
            key={y}
            style={[
              styles.yearItem,
              selectedYear === y && styles.yearItemActive,
            ]}
            onPress={() => onSelect(y)}
          >
            <Text
              style={[
                styles.yearItemText,
                selectedYear === y && styles.yearItemTextActive,
              ]}
            >
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };
  // ✅ Filtrado por buscador (sobre lo que ya trae SAP/cache)
  const filteredAvisos = useMemo(() => {
    const q = normalize(query);
    if (!q) return avisos;
    return (avisos || []).filter((it) => {
      const a = normalize(it?.NotifNo);
      const b = normalize(it?.Equipment);
      const c = normalize(it?.ShortText);
      return a.includes(q) || b.includes(q) || c.includes(q);
    });
  }, [avisos, query]);
  const listHeader = () => (
    <View style={styles.headerBox}>
      {/* * ✅ Buscador * */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={FIORI.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por notificación, equipo o descripción…"
          placeholderTextColor="#9AA5B1"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {!!query && (
          <TouchableOpacity
            onPress={() => setQuery("")}
            style={styles.clearBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle" size={18} color="#9AA5B1" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.resultsRow}>
        <Text style={styles.resultsText}>
          Mostrando{" "}
          <Text style={styles.resultsStrong}>{filteredAvisos.length}</Text> de{" "}
          <Text style={styles.resultsStrong}>{avisos.length}</Text>
        </Text>
      </View>
    </View>
  );
  const renderItem = ({ item }) => {
    const notifNo = item?.NotifNo || item?.id;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => {
          if (!notifNo) {
            Alert.alert("Aviso", "No se encontró número de notificación.");
            return;
          }
          router.push(`/tecnico/averias/${notifNo}/detalles`);
        }}
      >
        <View style={styles.cardBar} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.cardId} numberOfLines={1}>
              Notif: {notifNo || "—"}
            </Text>
            <Text style={styles.cardDate}>{formatDate(item?.NotifDate)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Equipo:</Text>
            <Text style={styles.metaText}>{item?.Equipment || "—"}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item?.ShortText || "Sin descripción"}
          </Text>
        </View>
        <View style={styles.chevWrap}>
          <Ionicons name="chevron-forward" size={18} color="#9AA5B1" />
        </View>
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.container}>
      <Header title="Avisos de avería" />
      <View style={styles.filtersWrap}>
        <View style={styles.filterModeRow}>
          <TouchableOpacity
            style={[
              styles.filterModeButton,
              dateMode === "day" && styles.filterModeButtonActive,
            ]}
            onPress={() => {
              setDateMode("day");
              setShowDayPicker(true);
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterModeText,
                dateMode === "day" && styles.filterModeTextActive,
              ]}
            >
              Día
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterModeButton,
              dateMode === "weekRange" && styles.filterModeButtonActive,
            ]}
            onPress={() => {
              setDateMode("weekRange");
              setShowWeekStartPicker(true);
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterModeText,
                dateMode === "weekRange" && styles.filterModeTextActive,
              ]}
            >
              Semana
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterModeButton,
              dateMode === "month" && styles.filterModeButtonActive,
            ]}
            onPress={() => {
              setDateMode("month");
              setShowMonthModal(true);
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterModeText,
                dateMode === "month" && styles.filterModeTextActive,
              ]}
            >
              Mes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterModeButton,
              dateMode === "year" && styles.filterModeButtonActive,
            ]}
            onPress={() => {
              setDateMode("year");
              setShowYearModal(true);
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterModeText,
                dateMode === "year" && styles.filterModeTextActive,
              ]}
            >
              Año
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.activeRangeText}>{activeRangeText}</Text>
        {!!offlineMsg && (
          <View style={styles.offlineBox}>
            <Text style={styles.offlineText}>{offlineMsg}</Text>
          </View>
        )}
        {!!errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={fetchAvisosForRange}>
              <Text style={styles.errorRetry}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* * Día * */}
        {showDayPicker && (
          <DateTimePicker
            value={dayRef ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") {
                setShowDayPicker(false);
                return;
              }
              if (date) setDayRef(date);
              setShowDayPicker(Platform.OS === "ios");
            }}
          />
        )}
        {/* * Semana * */}
        {showWeekStartPicker && (
          <DateTimePicker
            value={weekStart ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") {
                setShowWeekStartPicker(false);
                return;
              }
              if (date) {
                setWeekStart(date);
                if (Platform.OS !== "ios") setShowWeekEndPicker(true);
              }
              setShowWeekStartPicker(Platform.OS === "ios");
            }}
          />
        )}
        {showWeekEndPicker && (
          <DateTimePicker
            value={weekEnd ?? weekStart ?? new Date()}
            mode="date"
            minimumDate={weekStart ?? undefined}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android" && e.type !== "set") {
                setShowWeekEndPicker(false);
                return;
              }
              if (date) setWeekEnd(date);
              setShowWeekEndPicker(Platform.OS === "ios");
            }}
          />
        )}
        {dateMode === "weekRange" && (
          <View style={styles.rangeButtonsRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
              onPress={() => setShowWeekStartPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Inicio: {weekStart ? weekStart.toLocaleDateString() : "—"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
              onPress={() => setShowWeekEndPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Fin: {weekEnd ? weekEnd.toLocaleDateString() : "—"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {/* * Modal Mes * */}
      <Modal
        visible={showMonthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() =>
                  setMonthYear((s) => ({ ...s, year: s.year - 1 }))
                }
              >
                <Text style={styles.modalHeaderBtn}>{"‹"}</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>{monthYear.year}</Text>
              <TouchableOpacity
                onPress={() =>
                  setMonthYear((s) => ({ ...s, year: s.year + 1 }))
                }
              >
                <Text style={styles.modalHeaderBtn}>{"›"}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => {
                const active = idx === monthYear.month && dateMode === "month";
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthCell, active && styles.monthCellActive]}
                    onPress={() => {
                      setMonthYear({ month: idx, year: monthYear.year });
                      setShowMonthModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.monthCellText,
                        active && styles.monthCellTextActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowMonthModal(false)}
            >
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* * Modal Año * */}
      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalHeaderTitle, { marginBottom: 8 }]}>
              Selecciona un año
            </Text>
            <YearPickerContent
              selectedYear={yearOnly}
              onSelect={(y) => {
                setYearOnly(y);
                setShowYearModal(false);
              }}
              from={now.getFullYear() - 10}
              to={now.getFullYear() + 2}
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowYearModal(false)}
            >
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* * Lista * */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={FIORI.accent} />
            <Text style={{ marginTop: 10 }}>Cargando avisos...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredAvisos}
            keyExtractor={(item, index) =>
              item?.NotifNo?.toString() || `notif-${index}`
            }
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 40,
                  color: FIORI.textMuted,
                }}
              >
                {query
                  ? "No hay resultados con esa búsqueda."
                  : "No hay avisos con los filtros actuales."}
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  filtersWrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    backgroundColor: FIORI.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  filterModeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 4,
    borderRadius: 14,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  filterModeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  filterModeButtonActive: {
    backgroundColor: FIORI.accent,
  },
  filterModeText: {
    color: FIORI.textMuted,
    fontWeight: "800",
    fontSize: 11,
    textAlign: "center",
  },
  filterModeTextActive: {
    color: "#FFFFFF",
  },
  activeRangeText: { marginTop: 8, color: FIORI.textMuted, fontSize: 12 },
  offlineBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFFBEA",
    borderWidth: 1,
    borderColor: "#F7E7A3",
  },
  offlineText: { color: "#6b4f00", fontWeight: "700" },
  rangeButtonsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    flex: 1,
  },
  smallBtnText: { color: FIORI.ink, fontWeight: "600" },
  errorBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FCE0E0",
  },
  errorText: { color: "#7a0000", fontWeight: "700" },
  errorRetry: { marginTop: 4, color: FIORI.accent, fontWeight: "800" },
  // ===== search header =====
  headerBox: {
    marginBottom: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: FIORI.cardBg,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: FIORI.ink,
    paddingVertical: 0,
  },
  clearBtn: {
    paddingLeft: 4,
    paddingVertical: 2,
  },
  resultsRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultsText: { color: FIORI.textMuted, fontSize: 12 },
  resultsStrong: { color: FIORI.ink, fontWeight: "800" },
  // ===== cards =====
  card: {
    backgroundColor: "#fff",
    borderRadius: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  cardBar: { width: 4, backgroundColor: FIORI.accent },
  cardBody: { flex: 1, paddingHorizontal: 11, paddingVertical: 9 },
  chevWrap: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#EEF2F7",
    backgroundColor: "#FAFBFD",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardId: { flex: 1, fontWeight: "800", fontSize: 13, color: FIORI.ink },
  cardDate: { fontSize: 11, color: FIORI.textMuted },
  cardTitle: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
    color: FIORI.ink,
    lineHeight: 17,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaLabel: { color: FIORI.textMuted, fontSize: 12 },
  metaText: { color: FIORI.ink, fontSize: 12, fontWeight: "700" },
  // ===== modals =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: FIORI.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalHeaderTitle: { fontSize: 18, fontWeight: "700", color: FIORI.ink },
  modalHeaderBtn: {
    fontSize: 22,
    fontWeight: "900",
    color: FIORI.accent,
    paddingHorizontal: 12,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  monthCell: {
    width: "31.5%",
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  monthCellActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  monthCellText: { color: FIORI.ink, fontWeight: "600" },
  monthCellTextActive: { color: "#fff" },
  modalClose: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCloseText: { color: "#fff", fontWeight: "700" },
  yearItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  yearItemActive: { backgroundColor: FIORI.accent, borderColor: FIORI.accent },
  yearItemText: { fontSize: 16, color: FIORI.ink, fontWeight: "600" },
  yearItemTextActive: { color: "#fff" },
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center" },
});