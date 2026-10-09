// app/tecnico/no_mantenimiento/index.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, router } from "expo-router";
import Header from "../../../src/components/Header";
import { useAuth } from "../../../src/context/AuthContext";
import { useOrdenesTecnico } from "../../../src/context/OrdenesTecnicoContext";
import { loadOrdenTecnicoDetail } from "../../../src/offline/ordenesTecnicoCache";
/* ===================== Paleta ===================== */
const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  neutralBtn: "#ECEFF5",
  noMantto: "#B90909",
};
const ESTATUS_CARTA_NO_MANTTO = "0600";
const ESTATUS_CARTA_NO_MANTTO_LABEL = "Carta No Mantto";
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
/* ===================== Utilidades ===================== */
const safeStr = (value) => (value == null ? "" : String(value));
const atStartOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};
const atEndOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};
const startOfMonth = (value) =>
  new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (value) =>
  new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
const startOfYear = (year) => new Date(year, 0, 1, 0, 0, 0, 0);
const endOfYear = (year) => new Date(year, 11, 31, 23, 59, 59, 999);
const parseSapDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  if (!text) return null;
  const sapMatch = text.match(/\/Date\((-?\d+)(?:[+-]\d+)?\)\//);
  if (sapMatch) {
    const milliseconds = Number(sapMatch[1]);
    if (!Number.isFinite(milliseconds)) return null;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // Formato SAP yyyyMMdd.
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDateDMY = (value) => {
  const date = parseSapDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};
function normalizeCode(code) {
  const text = safeStr(code).trim();
  if (!text) return "";
  const number = parseInt(text, 10);
  if (Number.isNaN(number)) return text;
  return String(number).padStart(4, "0");
}
function extractStatusCodes(userstatusRaw) {
  const text = safeStr(userstatusRaw).trim();
  if (!text) return [];
  const matches = text.match(/\d{1,4}/g) || [];
  const codes = matches
    .map((value) => normalizeCode(value))
    .filter((value) => /^\d{4}$/.test(value));
  return Array.from(new Set(codes));
}
function isCartaNoManttoByUserstatus(userstatusRaw, estatusCodeRaw) {
  const codes = extractStatusCodes(userstatusRaw);
  const apiCode = normalizeCode(estatusCodeRaw);
  return (
    codes.includes(ESTATUS_CARTA_NO_MANTTO) ||
    apiCode === ESTATUS_CARTA_NO_MANTTO
  );
}
function getOrderId(item = {}) {
  return safeStr(
    item?.Orderid || item?.OrderId || item?.OrderID || item?.orderid,
  ).trim();
}
function getOrderIdDisplay(item = {}) {
  const raw = getOrderId(item);
  if (!raw) return "";
  return raw.replace(/^0+/, "") || raw;
}
function getEquipment(item = {}) {
  return safeStr(
    item?.equipment || item?.Equipment || item?.EQUIPMENT,
  ).trim();
}
function getStartDateValue(item = {}) {
  return (
    item?.start_date ||
    item?.StartDate ||
    item?.startDate ||
    item?.BasicStartDate ||
    item?.BasicStart ||
    null
  );
}
function getFinishDateValue(item = {}) {
  return (
    item?.finish_date ||
    item?.FinishDate ||
    item?.finishDate ||
    item?.BasicFinDate ||
    item?.BasicFinish ||
    null
  );
}
function getOrderType(item = {}) {
  return safeStr(
    item?.order_type ||
      item?.OrderType ||
      item?.Ordertype ||
      item?.Auart,
  ).trim();
}
function getCoberturaOrden(item = {}) {
  const raw = safeStr(
    item?.ShortText ||
      item?.shortText ||
      item?.shorttext ||
      item?.short_text ||
      item?.coverage ||
      item?.cobertura,
  ).trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.includes("BASICA") || upper.includes("BÁSICA")) {
    return "BÁSICA";
  }
  if (upper.includes("MEDIA")) {
    return "MEDIA";
  }
  if (
    upper.includes("SEMI FULL") ||
    upper.includes("SEMIFULL") ||
    upper.includes("SEMI")
  ) {
    return "SEMIFULL";
  }
  if (upper.includes("FULL")) {
    return "FULL";
  }
  return raw.split("|")[0].replace(/COBERTURA/gi, "").trim();
}
function isWithinRange(date, start, end) {
  if (!date) return false;
  const timestamp = date.getTime();
  if (start && timestamp < atStartOfDay(start).getTime()) return false;
  if (end && timestamp > atEndOfDay(end).getTime()) return false;
  return true;
}
function matchesQuery(item, query) {
  const needle = safeStr(query).trim().toLowerCase();
  if (!needle) return true;
  const fields = [
    getOrderId(item),
    getOrderIdDisplay(item),
    getOrderType(item),
    getEquipment(item),
    getCoberturaOrden(item),
    ESTATUS_CARTA_NO_MANTTO_LABEL,
    item?.partner_name,
    item?.partner_address,
    item?.estatus_code,
    item?.estatus_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return fields.includes(needle);
}
async function mergeRowsWithCachedDetails(items = []) {
  const source = Array.isArray(items) ? items : [];
  return Promise.all(
    source.map(async (item) => {
      const orderId = getOrderId(item);
      if (!orderId) return item;
      try {
        const cached = await loadOrdenTecnicoDetail(orderId);
        const detail = cached?.data;
        if (!detail || typeof detail !== "object") return item;
        return {
          ...detail,
          ...item,
          Orderid: getOrderId(item) || getOrderId(detail) || orderId,
          equipment:
            getEquipment(item) ||
            getEquipment(detail) ||
            "",
          start_date:
            getStartDateValue(item) ||
            getStartDateValue(detail) ||
            "",
          finish_date:
            getFinishDateValue(item) ||
            getFinishDateValue(detail) ||
            "",
          order_type:
            getOrderType(item) ||
            getOrderType(detail) ||
            "",
          ShortText:
            item?.ShortText ||
            item?.short_text ||
            item?.shortText ||
            detail?.ShortText ||
            detail?.short_text ||
            detail?.shortText ||
            "",
        };
      } catch (error) {
        console.log(
          "[NO MANTENIMIENTO] No se pudo leer detalle guardado:",
          orderId,
          error?.message || error,
        );
        return item;
      }
    }),
  );
}
/* ===================== Pantalla ===================== */
export default function TecnicoNoMantenimientoIndex() {
  const { user } = useAuth();
  const {
    ordenes: ordenesCompartidas,
    loadingInitial: loading,
    refreshing,
    loadLocal,
    refresh: refreshCentral,
  } = useOrdenesTecnico();
  const correo = useMemo(
    () =>
      safeStr(
        user?.email ||
          user?.correo ||
          user?.upn ||
          user?.username,
      ).trim(),
    [user],
  );
  const now = new Date();
  const [allRows, setAllRows] = useState([]);
  const [query, setQuery] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [dateMode, setDateMode] = useState("day");
  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);
  const [monthYear, setMonthYear] = useState({
    month: now.getMonth(),
    year: now.getFullYear(),
  });
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [yearOnly, setYearOnly] = useState(now.getFullYear());
  const [showYearModal, setShowYearModal] = useState(false);
  const params = useLocalSearchParams();
  const { refresh: refreshParam } = params;
  const selectedRange = useMemo(() => {
    if (dateMode === "day") {
      return {
        start: atStartOfDay(dayRef),
        end: atEndOfDay(dayRef),
      };
    }
    if (dateMode === "weekRange") {
      return {
        start: weekStart ? atStartOfDay(weekStart) : null,
        end: weekEnd ? atEndOfDay(weekEnd) : null,
      };
    }
    if (dateMode === "month") {
      const reference = new Date(monthYear.year, monthYear.month, 1);
      return {
        start: startOfMonth(reference),
        end: endOfMonth(reference),
      };
    }
    if (dateMode === "year") {
      return {
        start: startOfYear(yearOnly),
        end: endOfYear(yearOnly),
      };
    }
    return { start: null, end: null };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);
  const applySharedLista = useCallback(
    async (data = []) => {
      if (!correo) {
        setAllRows([]);
        return [];
      }
      setPreparing(true);
      try {
        const source = await mergeRowsWithCachedDetails(
          Array.isArray(data) ? data : [],
        );
        const noMantenimiento = source.filter((item) => {
          const userstatus =
            item?.userstatus ||
            item?.Userstatus ||
            item?.UserStatus ||
            item?.UserStText ||
            "";
          const estatusCode =
            item?.estatus_code ||
            item?.EstatusCode ||
            item?.StatusCode ||
            item?.Status ||
            "";
          return isCartaNoManttoByUserstatus(userstatus, estatusCode);
        });
        setAllRows(noMantenimiento);
        return noMantenimiento;
      } finally {
        setPreparing(false);
      }
    },
    [correo],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) {
          await applySharedLista(ordenesCompartidas);
        }
      } catch (error) {
        console.log(
          "[NO MANTENIMIENTO] Error preparando la lista:",
          error?.message || error,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySharedLista, ordenesCompartidas]);
  const rows = useMemo(() => {
    return allRows.filter((item) => {
      if (!matchesQuery(item, query)) return false;
      const startDate = parseSapDate(getStartDateValue(item));
      return isWithinRange(
        startDate,
        selectedRange.start,
        selectedRange.end,
      );
    });
  }, [allRows, query, dateMode, selectedRange]);
  const reloadListaLocal = useCallback(async () => {
    const cached = await loadLocal();
    return applySharedLista(cached?.data || []);
  }, [applySharedLista, loadLocal]);
  const refreshLista = useCallback(async () => {
    try {
      const result = await refreshCentral();
      await applySharedLista(result?.cached?.data || []);
      return result;
    } catch (error) {
      console.error(
        "Error actualizando Carta No Mantto:",
        error?.message || error,
      );
      await reloadListaLocal();
      return { ok: false, error };
    }
  }, [applySharedLista, refreshCentral, reloadListaLocal]);
  useEffect(() => {
    if (refreshParam) {
      reloadListaLocal();
    }
  }, [refreshParam, reloadListaLocal]);
  const clearFilters = useCallback(() => {
    setQuery("");
    setDateMode("day");
    setDayRef(new Date());
    setWeekStart(null);
    setWeekEnd(null);
    setMonthYear({
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
    });
    setYearOnly(new Date().getFullYear());
  }, []);
  const openDetalle = (item) => {
    const orderId = getOrderId(item);
    if (!orderId) {
      Alert.alert("Error", "No se pudo determinar la orden.");
      return;
    }
    router.push({
      pathname: "/tecnico/ordenes/[id]",
      params: { id: orderId },
    });
  };
  const activeRangeText = useMemo(() => {
    if (dateMode === "day") {
      return `Día: ${atStartOfDay(dayRef).toLocaleDateString("es-MX")}`;
    }
    if (dateMode === "weekRange") {
      const startText = weekStart
        ? atStartOfDay(weekStart).toLocaleDateString("es-MX")
        : "—";
      const endText = weekEnd
        ? atEndOfDay(weekEnd).toLocaleDateString("es-MX")
        : "—";
      return `Semana (rango): ${startText} → ${endText}`;
    }
    if (dateMode === "month") {
      return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    }
    if (dateMode === "year") {
      return `Año: ${yearOnly}`;
    }
    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);
  const YearPickerContent = ({
    selectedYear,
    onSelect,
    from = now.getFullYear() - 10,
    to = now.getFullYear() + 2,
  }) => {
    const years = [];
    for (let year = to; year >= from; year -= 1) {
      years.push(year);
    }
    return (
      <ScrollView style={{ maxHeight: 320 }}>
        {years.map((year) => (
          <TouchableOpacity
            key={year}
            style={[
              styles.yearItem,
              selectedYear === year && styles.yearItemActive,
            ]}
            onPress={() => onSelect(year)}
          >
            <Text
              style={[
                styles.yearItemText,
                selectedYear === year && styles.yearItemTextActive,
              ]}
            >
              {year}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };
  const renderItem = ({ item }) => {
    const orderIdDisplay = getOrderIdDisplay(item);
    const equipment = getEquipment(item);
    const orderType = getOrderType(item);
    const coberturaLabel = getCoberturaOrden(item);
    const startLabel = formatDateDMY(getStartDateValue(item));
    const finishLabel = formatDateDMY(getFinishDateValue(item));
    return (
      <Pressable
        style={[
          styles.card,
          styles.cardNoMant,
          { borderLeftColor: FIORI.noMantto },
        ]}
        onPress={() => openDetalle(item)}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            #{orderIdDisplay || "—"}{" "}
            {!!orderType && (
              <Text style={styles.cardSubtitle}>• {orderType}</Text>
            )}
          </Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: `${FIORI.noMantto}1A` },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: FIORI.noMantto },
              ]}
            />
            <Text style={[styles.badgeText, { color: FIORI.noMantto }]}>
              {ESTATUS_CARTA_NO_MANTTO_LABEL}
            </Text>
          </View>
        </View>
        <View style={styles.cardMiddleRow}>
          <Text style={styles.infoText} numberOfLines={1}>
            <Text style={styles.infoStrong}>Eq: </Text>
            {equipment || "—"}
          </Text>
          <Text style={styles.infoDateText} numberOfLines={1}>
            {startLabel} - {finishLabel}
          </Text>
        </View>
        <View style={styles.coverageRow}>
          <Text style={styles.coverageText} numberOfLines={1}>
            <Text style={styles.coverageLabel}>Cobertura: </Text>
            {coberturaLabel || "Sin cobertura"}
          </Text>
        </View>
        <View style={styles.cardBottomRow}>
          <Text style={styles.lockText}>
            Carta No Mantto. Bloqueada.
          </Text>
        </View>
      </Pressable>
    );
  };
  const isLoading = loading || preparing;
  return (
    <View style={styles.container}>
      <Header title="No mantenimientos" />
      <View style={styles.filtersWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por #, tipo, equipo, cobertura…"
            placeholderTextColor={FIORI.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
          />
        </View>
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
        <View style={styles.filterActionsRow}>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={clearFilters}
            activeOpacity={0.85}
          >
            <Text style={styles.clearBtnText}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={refreshLista}
            activeOpacity={0.85}
          >
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.activeRangeText}>
          {activeRangeText} · {rows.length} orden
          {rows.length === 1 ? "" : "es"}
        </Text>
        {showDayPicker && (
          <DateTimePicker
            value={dayRef || new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, date) => {
              if (Platform.OS === "android") {
                setShowDayPicker(false);
                if (event.type !== "set") return;
              }
              if (date) setDayRef(date);
            }}
          />
        )}
        {showWeekStartPicker && (
          <DateTimePicker
            value={weekStart || new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, date) => {
              if (Platform.OS === "android") {
                setShowWeekStartPicker(false);
                if (event.type !== "set") return;
              }
              if (date) {
                setWeekStart(date);
                if (
                  weekEnd &&
                  atStartOfDay(weekEnd).getTime() <
                    atStartOfDay(date).getTime()
                ) {
                  setWeekEnd(null);
                }
                if (Platform.OS !== "ios") {
                  setShowWeekEndPicker(true);
                }
              }
            }}
          />
        )}
        {showWeekEndPicker && (
          <DateTimePicker
            value={weekEnd || weekStart || new Date()}
            mode="date"
            minimumDate={weekStart || undefined}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, date) => {
              if (Platform.OS === "android") {
                setShowWeekEndPicker(false);
                if (event.type !== "set") return;
              }
              if (date) setWeekEnd(date);
            }}
          />
        )}
        {dateMode === "weekRange" && (
          <View style={styles.rangeButtonsRow}>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => setShowWeekStartPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Inicio:{" "}
                {weekStart
                  ? weekStart.toLocaleDateString("es-MX")
                  : "—"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => setShowWeekEndPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Fin:{" "}
                {weekEnd
                  ? weekEnd.toLocaleDateString("es-MX")
                  : "—"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
                  setMonthYear((current) => ({
                    ...current,
                    year: current.year - 1,
                  }))
                }
              >
                <Text style={styles.modalHeaderBtn}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>
                {monthYear.year}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setMonthYear((current) => ({
                    ...current,
                    year: current.year + 1,
                  }))
                }
              >
                <Text style={styles.modalHeaderBtn}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {MONTHS.map((month, index) => {
                const active =
                  index === monthYear.month && dateMode === "month";
                return (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.monthCell,
                      active && styles.monthCellActive,
                    ]}
                    onPress={() => {
                      setMonthYear({
                        month: index,
                        year: monthYear.year,
                      });
                      setShowMonthModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.monthCellText,
                        active && styles.monthCellTextActive,
                      ]}
                    >
                      {month}
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
              onSelect={(year) => {
                setYearOnly(year);
                setShowYearModal(false);
              }}
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
      {isLoading && allRows.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={FIORI.accent} />
          <Text style={styles.loadingText}>Cargando…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, index) =>
            getOrderId(item) || `no-mantto-${index}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshLista}
              colors={[FIORI.accent]}
              tintColor={FIORI.accent}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No hay órdenes de Carta No Mantto con los filtros actuales.
            </Text>
          }
        />
      )}
    </View>
  );
}
/* ===================== Estilos ===================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },
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
        shadowOpacity: 0.03,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 1,
      },
      default: {},
    }),
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    backgroundColor: FIORI.cardSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: FIORI.ink,
    borderWidth: 1,
    borderColor: FIORI.border,
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
  clearBtn: {
    backgroundColor: FIORI.neutralBtn,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  clearBtnText: {
    color: FIORI.ink,
    fontWeight: "700",
    fontSize: 12,
  },
  refreshBtn: {
    backgroundColor: FIORI.accent,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  refreshBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  filterActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  activeRangeText: {
    marginTop: 8,
    color: FIORI.textMuted,
    fontSize: 12,
  },
  rangeButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap",
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  smallBtnText: {
    color: FIORI.ink,
    fontWeight: "600",
  },
  listContent: {
    padding: 12,
    paddingTop: 6,
    paddingBottom: 90,
  },
  loadingBox: {
    paddingTop: 40,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: FIORI.textMuted,
  },
  emptyText: {
    color: FIORI.textMuted,
    textAlign: "center",
    marginTop: 24,
  },
  card: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  cardNoMant: {
    backgroundColor: "#F8F9FA",
    borderColor: "#E2E2E2",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontWeight: "800",
    fontSize: 14,
    color: FIORI.ink,
    flex: 1,
    marginRight: 6,
  },
  cardSubtitle: {
    fontWeight: "400",
    color: FIORI.textMuted,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  cardMiddleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: FIORI.textMuted,
  },
  infoStrong: {
    fontWeight: "700",
    color: FIORI.ink,
  },
  infoDateText: {
    fontSize: 12,
    color: FIORI.textMuted,
    textAlign: "right",
  },
  coverageRow: {
    marginTop: 6,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  coverageText: {
    fontSize: 11,
    color: FIORI.textMuted,
    fontWeight: "600",
  },
  coverageLabel: {
    color: FIORI.ink,
    fontWeight: "800",
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
  },
  lockText: {
    color: FIORI.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    flex: 1,
    textAlign: "right",
  },
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
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: FIORI.ink,
  },
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
  monthCellActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },
  monthCellText: {
    color: FIORI.ink,
    fontWeight: "600",
  },
  monthCellTextActive: {
    color: "#FFFFFF",
  },
  modalClose: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: FIORI.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  yearItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  yearItemActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },
  yearItemText: {
    fontSize: 16,
    color: FIORI.ink,
    fontWeight: "600",
  },
  yearItemTextActive: {
    color: "#FFFFFF",
  },
});