// app/supervisor/reprogramacionesPlan/opciones/no_mantenimiento/no-mantenimiento.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Platform,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, LocaleConfig } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";

/* ====================== Locale ES ====================== */
LocaleConfig.locales.es = {
  monthNames: [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ],
  monthNamesShort: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
  dayNames: ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"],
  dayNamesShort: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],
  today: "Hoy",
};
LocaleConfig.defaultLocale = "es";

/* ====================== Colores ====================== */
const COLORS = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  textPrimary: "#0B1F3B",
  textSub: "#6A7381",
  accent: "#0A6ED1",
  danger: "#E76565",
  ok: "#1F8A5B",
  warn: "#B26A00",
};

/* ====================== Endpoints (ajusta si tu SAP usa otro) ====================== */
const RESCHEDULE_PATH =
  "/api/odata/ZCS_RESCHEDULE_WORKORDER_SRV/WorkOrderHeaderSet";

const CHANGE_STATUS_PATH =
  "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet";

/* ====================== Helpers ====================== */
const pad2 = (n) => String(n).padStart(2, "0");

// Para fechas que tú construyes (calendario/rangos) en local
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// ✅ Para fechas que vienen en /Date(ms)/ desde SAP: conviértelas a YMD usando UTC
const toYMD_UTC_FROM_MS = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const safeStr = (v) => (v == null ? "" : String(v));

function ymdToSAP(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${y}${m}${d}`;
}

// ✅ Para comparar rangos sin “-1 día” por zona/DST: crea a mediodía local
function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// ✅ /Date(1768435200000)/ -> YYYY-MM-DD (sin “-1 día”)
function odataDateToYMD(value) {
  const s = safeStr(value);
  const match = s.match(/\/Date\((\d+)\)\//);
  if (!match) return "";
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return "";
  return toYMD_UTC_FROM_MS(ms);
}

/**
 * ✅ ESTA vista es lo CONTRARIO a la otra:
 * Aquí SOLO mostramos las que en Userstatus tengan códigos y TODOS estén entre 0001..0011.
 * (Es decir: "No mantenimiento")
 */
function isNoMantenimiento(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return false;

  const codes = s.match(/\b\d{4}\b/g) || [];
  if (codes.length === 0) return false;

  const allInRange = codes.every((c) => {
    const n = Number(c);
    return n >= 1 && n <= 11;
  });

  return allInRange;
}

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { startYmd: toYMD(start), endYmd: toYMD(end) };
}

function buildODataDayFilter({ ymd, email }) {
  return `StartDate ge datetime'${ymd}T00:00:00' and FinishDate le datetime'${ymd}T23:59:59' and Userstatus eq '${email}'`;
}

function buildODataRangeFilter({ startYmd, endYmd, email }) {
  return `StartDate ge datetime'${startYmd}T00:00:00' and FinishDate le datetime'${endYmd}T23:59:59' and Userstatus eq '${email}'`;
}

function buildRangeMarkedDates(startYmd, endYmd) {
  const marked = {};
  if (!startYmd) return marked;

  if (startYmd && !endYmd) {
    marked[startYmd] = {
      selected: true,
      selectedColor: COLORS.accent,
      selectedTextColor: "#fff",
    };
    return marked;
  }

  const s = ymdToDate(startYmd);
  const e = ymdToDate(endYmd);
  if (e < s) return marked;

  let cur = new Date(s);
  while (cur <= e) {
    const key = toYMD(cur);
    marked[key] = {
      color: COLORS.accent,
      textColor: "#FFFFFF",
      startingDay: key === startYmd,
      endingDay: key === endYmd,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return marked;
}

export default function NoMantenimiento() {
  const { token, user } = useAuth();

  const supervisorEmail =
    safeStr(user?.email) ||
    safeStr(user?.correo) ||
    safeStr(user?.username) ||
    "supervisor1@mitsu.com";

  const today = new Date();
  const [anioVisible, setAnioVisible] = useState(today.getFullYear());
  const [mesVisible, setMesVisible] = useState(today.getMonth() + 1);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [query, setQuery] = useState("");

  // multiselect
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectedCount = selectedIds.size;
  const bulkMode = selectedCount > 0;

  // Modal UNA (rango)
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pickStep, setPickStep] = useState("start");
  const [tempStart, setTempStart] = useState("");
  const [tempEnd, setTempEnd] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal BULK (rango)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState("start"); // start | end
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ✅ FETCH desde WorkOrderHeaderSet (filtra SOLO no-mant)
  const fetchOrders = useCallback(
    async ({ year, month, dayYmd }) => {
      try {
        setLoading(true);

        const { startYmd, endYmd } = getMonthRange(year, month);

        const filter = dayYmd
          ? buildODataDayFilter({ ymd: dayYmd, email: supervisorEmail })
          : buildODataRangeFilter({ startYmd, endYmd, email: supervisorEmail });

        const res = await api.get(
          "/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { $filter: filter, $format: "json" },
          }
        );

        const results = Array.isArray(res.data?.d?.results) ? res.data.d.results : [];

        const mapped = results
          .map((x) => {
            const id = safeStr(
              x.Orderid || x.OrderId || x.OrderID || x.NotifNo || x.Notification || x.id
            );

            const finalStart = safeStr(x.StartDate).includes("/Date(")
              ? odataDateToYMD(x.StartDate)
              : safeStr(x.StartDate || "");

            const finalFinish = safeStr(x.FinishDate).includes("/Date(")
              ? odataDateToYMD(x.FinishDate)
              : safeStr(x.FinishDate || "") || finalStart;

            const userstatusCodes = safeStr(x.Userstatus || x.UserStatus || "");

            return {
              id,
              equipo: safeStr(x.Equipment || x.Equipo || ""),
              shortText: safeStr(x.ShortText || x.Description || x.Descripcion || ""),
              startDate: finalStart,
              finishDate: finalFinish || finalStart,
              userstatusCodes,
            };
          })
          .filter((o) => o.id)
          .filter((o) => isNoMantenimiento(o.userstatusCodes));

        setOrders(mapped);
        clearSelection();
      } catch (error) {
        console.error("Error al cargar NO MANT:", error?.response?.data || error?.message || error);
        Alert.alert("Error", "No se pudieron cargar las órdenes NO mantenimiento.");
        setOrders([]);
        clearSelection();
      } finally {
        setLoading(false);
      }
    },
    [token, supervisorEmail]
  );

  useEffect(() => {
    if (!token) return;
    fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: null });
  }, [token, anioVisible, mesVisible, fetchOrders]);

  const markedDates = useMemo(() => {
    const marks = {};
    orders.forEach((o) => {
      if (o.startDate) {
        marks[o.startDate] = {
          ...(marks[o.startDate] || {}),
          marked: true,
          dotColor: COLORS.accent,
        };
      }
    });

    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || {}),
        selected: true,
        selectedColor: COLORS.accent,
        selectedTextColor: "#FFFFFF",
      };
    }

    return marks;
  }, [orders, selectedDate]);

  const filteredOrders = useMemo(() => {
    let list = orders;

    if (selectedDate) list = list.filter((o) => o.startDate === selectedDate);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        `${o.id} ${o.equipo} ${o.shortText} ${o.userstatusCodes}`.toLowerCase().includes(q)
      );
    }

    return list;
  }, [orders, selectedDate, query]);

  // ===== UNA orden (rango) =====
  function openEdit(order) {
    if (bulkMode) return;

    setEditing(order);
    const start = order.startDate || toYMD(new Date());
    setTempStart(start);
    setTempEnd("");
    setPickStep("start");
    setEditOpen(true);
  }

  function closeEdit() {
    if (saving) return;
    setEditOpen(false);
    setEditing(null);
    setPickStep("start");
    setTempStart("");
    setTempEnd("");
  }

  function onPickDate(ymd) {
    if (pickStep === "start") {
      setTempStart(ymd);
      setTempEnd("");
      setPickStep("end");
      return;
    }

    if (tempStart && ymdToDate(ymd) < ymdToDate(tempStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }
    setTempEnd(ymd);
  }

  function canSave() {
    return !!editing && !!tempStart && !!tempEnd && !saving;
  }

  // ===== Cambiar Userstatus a 0012 (Reprogramación) =====
  async function postUserStatus0012(orderId) {
    const payload = {
      OrderId: String(orderId),
      WorkOrderHeader: { Orderid: String(orderId) },
      WorkOrderUserStatusSet: [{ UserStText: "0012", Langu: "ES", Inactive: "" }],
      Return: [],
    };

    console.log("[NO_MANT][STATUS 0012] url:", CHANGE_STATUS_PATH);
    console.log("[NO_MANT][STATUS 0012] payload:", JSON.stringify(payload, null, 2));

    return api.post(CHANGE_STATUS_PATH, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  }

  // ✅ POST reprogramación (rango) + luego poner 0012
  async function saveEdit() {
    if (!editing) return;

    if (!tempStart || !tempEnd) {
      Alert.alert("Faltan fechas", "Selecciona fecha inicio y fecha fin.");
      return;
    }
    if (ymdToDate(tempEnd) < ymdToDate(tempStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }

    const payload = {
      WorkOrderHeader: { Supervisor: supervisorEmail },
      WorkOrderItemsSet: [
        {
          OrderId: safeStr(editing.id),
          OrderItem: "",
          FechaIni: ymdToSAP(tempStart),
          FechaFin: ymdToSAP(tempEnd),
        },
      ],
      ReturnSet: [],
    };

    try {
      setSaving(true);

      console.log("[NO_MANT][RESCHEDULE] payload:", JSON.stringify(payload, null, 2));

      // 1) Reprogramar fechas
      const res1 = await api.post(RESCHEDULE_PATH, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      console.log("[NO_MANT][RESCHEDULE OK] response:", res1?.data);

      // 2) Poner Userstatus 0012
      try {
        const res2 = await postUserStatus0012(editing.id);
        console.log("[NO_MANT][STATUS 0012 OK] response:", res2?.data);
      } catch (e2) {
        console.error("[NO_MANT][STATUS 0012 ERROR]", e2?.response?.data || e2?.message || e2);
        Alert.alert(
          "Aviso",
          "Las fechas se reprogramaron, pero NO se pudo poner el estatus 0012. Revisa la ruta/servicio de cambio de estatus."
        );
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === editing.id ? { ...o, startDate: tempStart, finishDate: tempEnd } : o))
      );

      closeEdit();
      Alert.alert("Reprogramación lista", `Orden #${editing.id}\nInicio: ${tempStart}\nFin: ${tempEnd}`);
    } catch (error) {
      console.error("[NO_MANT][RESCHEDULE ERROR]", error?.response?.data || error?.message || error);
      Alert.alert("Error", "No se pudo reprogramar en SAP (revisa logs del backend/BTP).");
    } finally {
      setSaving(false);
    }
  }

  // ===== BULK =====
  function openBulk() {
    if (!bulkMode) return;
    const todayYmd = toYMD(new Date());
    setBulkStep("start");
    setBulkStart(todayYmd);
    setBulkEnd("");
    setBulkOpen(true);
  }

  function closeBulk() {
    if (bulkSaving) return;
    setBulkOpen(false);
    setBulkStep("start");
    setBulkStart("");
    setBulkEnd("");
  }

  function onPickBulkDate(ymd) {
    if (bulkStep === "start") {
      setBulkStart(ymd);
      setBulkEnd("");
      setBulkStep("end");
      return;
    }

    if (bulkStart && ymdToDate(ymd) < ymdToDate(bulkStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }
    setBulkEnd(ymd);
  }

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  async function saveBulk() {
    if (!bulkMode) return;

    if (!bulkStart || !bulkEnd) {
      Alert.alert("Faltan fechas", "Selecciona fecha inicio y fecha fin.");
      return;
    }
    if (ymdToDate(bulkEnd) < ymdToDate(bulkStart)) {
      Alert.alert("Fecha inválida", "La fecha fin no puede ser menor a la fecha inicio.");
      return;
    }

    const payload = {
      WorkOrderHeader: { Supervisor: supervisorEmail },
      WorkOrderItemsSet: selectedIdsArray.map((id) => ({
        OrderId: safeStr(id),
        OrderItem: "",
        FechaIni: ymdToSAP(bulkStart),
        FechaFin: ymdToSAP(bulkEnd),
      })),
      ReturnSet: [],
    };

    try {
      setBulkSaving(true);

      console.log("[NO_MANT][RESCHEDULE BULK] payload:", JSON.stringify(payload, null, 2));

      // 1) Reprogramar fechas
      const res1 = await api.post(RESCHEDULE_PATH, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      console.log("[NO_MANT][RESCHEDULE BULK OK] response:", res1?.data);

      // 2) Poner 0012 a todas (sin bloquear si alguna falla)
      const statusResults = await Promise.allSettled(selectedIdsArray.map((id) => postUserStatus0012(id)));
      const okCount = statusResults.filter((r) => r.status === "fulfilled").length;
      const failCount = statusResults.length - okCount;

      if (failCount > 0) {
        Alert.alert(
          "Aviso",
          `Fechas reprogramadas. Estatus 0012 aplicado a ${okCount}/${statusResults.length} órdenes.`
        );
      }

      setOrders((prev) =>
        prev.map((o) => (selectedIds.has(o.id) ? { ...o, startDate: bulkStart, finishDate: bulkEnd } : o))
      );

      const count = selectedIdsArray.length;
      clearSelection();
      closeBulk();

      Alert.alert("Reprogramación lista", `Se reprogramaron ${count} órdenes.\nInicio: ${bulkStart}\nFin: ${bulkEnd}`);
    } catch (error) {
      console.error("[NO_MANT][RESCHEDULE BULK ERROR]", error?.response?.data || error?.message || error);
      Alert.alert("Error", "No se pudieron reprogramar las órdenes seleccionadas.");
    } finally {
      setBulkSaving(false);
    }
  }

  const monthLabel = `${pad2(mesVisible)}/${anioVisible}`;

  const HeaderUI = (
    <View>
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="person-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Supervisor</Text>

          <Pressable
            onPress={() => fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: null })}
            style={styles.refreshBtn}
          >
            <Ionicons name="refresh" size={16} color={COLORS.textSub} />
            <Text style={styles.refreshText}>Actualizar</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>{safeStr(supervisorEmail)}</Text>

        <Text style={styles.hint}>
          Mes visible: <Text style={styles.bold}>{monthLabel}</Text>
        </Text>

        <Text style={styles.hint}>
          *Aquí aparecen <Text style={styles.bold}>SOLO</Text> órdenes con códigos <Text style={styles.bold}>0001..0011</Text>.
        </Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="today-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Calendario</Text>

          {!!selectedDate && (
            <Pressable
              onPress={() => {
                setSelectedDate(null);
                fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: null });
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Ver mes</Text>
            </Pressable>
          )}
        </View>

        <Calendar
          current={`${anioVisible}-${pad2(mesVisible)}-01`}
          onMonthChange={(m) => {
            if (!m?.year || !m?.month) return;
            if (m.year === anioVisible && m.month === mesVisible) return;
            setAnioVisible(m.year);
            setMesVisible(m.month);
            setSelectedDate(null);
          }}
          markingType="simple"
          markedDates={markedDates}
          onDayPress={(day) => {
            const ymd = day.dateString;
            setSelectedDate(ymd);
            fetchOrders({ year: anioVisible, month: mesVisible, dayYmd: ymd });
          }}
          theme={{
            backgroundColor: "transparent",
            calendarBackground: "transparent",
            textSectionTitleColor: COLORS.textSub,
            dayTextColor: COLORS.textPrimary,
            monthTextColor: COLORS.textPrimary,
            arrowColor: COLORS.accent,
            todayTextColor: COLORS.accent,
          }}
        />

        <Text style={styles.hint}>
          {selectedDate ? `Mostrando solo órdenes del día: ${selectedDate}` : "Toca un día para filtrar/cargar por esa fecha."}
        </Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="search-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Buscar orden</Text>

          {loading && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={{ color: COLORS.textSub, fontSize: 12 }}>Cargando…</Text>
            </View>
          )}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textSub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Busca por #orden, equipo, texto o códigos…"
            placeholderTextColor="#9AA5B1"
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.textSub} />
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.count}>
        Mostrando <Text style={styles.bold}>{filteredOrders.length}</Text> órdenes
        {selectedDate ? ` del día ${selectedDate}` : ""}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <Header title="No mantenimiento (0001..0011)" />

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={HeaderUI}
        contentContainerStyle={{ paddingBottom: bulkMode ? 110 : 22 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? "Cargando…" : "No hay resultados."}</Text>}
        renderItem={({ item }) => {
          const checked = selectedIds.has(item.id);

          return (
            <View style={styles.orderRow}>
              <Pressable onPress={() => toggleSelect(item.id)} style={styles.checkWrap} hitSlop={10}>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? COLORS.accent : COLORS.textSub}
                />
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text style={styles.orderId}>Orden #{item.id}</Text>

                <Text style={styles.orderSub}>
                  {item.equipo ? item.equipo : "Equipo —"}
                  {item.shortText ? ` • ${item.shortText}` : ""}
                </Text>

                <Text style={styles.orderDates}>
                  Inicio: <Text style={styles.bold}>{item.startDate || "—"}</Text> · Fin:{" "}
                  <Text style={styles.bold}>{item.finishDate || "—"}</Text>
                </Text>

                {!!item.userstatusCodes && (
                  <Text style={styles.small}>Userstatus: {safeStr(item.userstatusCodes).trim() || "—"}</Text>
                )}
              </View>

              {!bulkMode && (
                <Pressable style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="calendar-outline" size={18} color="#fff" />
                  <Text style={styles.editBtnText}>Reprogramar</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      {bulkMode && (
        <View style={styles.bulkBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bulkTitle}>Seleccionadas: {selectedCount}</Text>
            <Text style={styles.bulkSub}>Reprogramar varias (Inicio + Fin) y poner 0012</Text>
          </View>

          <Pressable onPress={clearSelection} style={styles.bulkGhost}>
            <Text style={styles.bulkGhostText}>Limpiar</Text>
          </Pressable>

          <Pressable onPress={openBulk} style={styles.bulkPrimary}>
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={styles.bulkPrimaryText}>Reprogramar</Text>
          </Pressable>
        </View>
      )}

      {/* ===== Modal UNA ===== */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? `Orden #${editing.id}` : "Orden"}</Text>
              <Pressable onPress={closeEdit} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <View style={[styles.stepBanner, pickStep === "start" ? styles.stepBannerStart : styles.stepBannerEnd]}>
              <Ionicons
                name={pickStep === "start" ? "flag-outline" : "checkmark-circle-outline"}
                size={18}
                color={pickStep === "start" ? COLORS.warn : COLORS.ok}
              />
              <Text style={styles.stepBannerText}>
                {pickStep === "start"
                  ? "Paso 1: Selecciona la FECHA DE INICIO"
                  : "Paso 2: Selecciona la FECHA DE FIN"}
              </Text>
            </View>

            <View style={styles.pillsRow}>
              <View style={[styles.pill, pickStep === "start" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Inicio</Text>
                <Text style={styles.pillValue}>{tempStart || "—"}</Text>
              </View>
              <View style={[styles.pill, pickStep === "end" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Fin</Text>
                <Text style={styles.pillValue}>{tempEnd || "—"}</Text>
              </View>
            </View>

            <Calendar
              markingType={tempStart && tempEnd ? "period" : "simple"}
              markedDates={tempStart ? buildRangeMarkedDates(tempStart, tempEnd) : {}}
              onDayPress={(d) => onPickDate(d.dateString)}
              theme={{
                backgroundColor: "transparent",
                calendarBackground: "transparent",
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.stepRow}>
              <Pressable
                onPress={() => {
                  setPickStep("start");
                  setTempStart(editing?.startDate || toYMD(new Date()));
                  setTempEnd("");
                }}
                style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                <Ionicons name="arrow-back" size={16} color={COLORS.textPrimary} />
                <Text style={styles.stepBtnText}>Elegir inicio</Text>
              </Pressable>

              {pickStep === "end" && (
                <Pressable
                  onPress={() => {
                    if (!tempStart) return;
                    setTempEnd(tempStart);
                  }}
                  style={[styles.stepBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.textPrimary} />
                  <Text style={styles.stepBtnText}>Fin = Inicio</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setPickStep("start");
                  setTempStart(editing?.startDate || toYMD(new Date()));
                  setTempEnd("");
                }}
                style={[styles.ghostBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                <Text style={styles.ghostBtnText}>Restaurar</Text>
              </Pressable>

              <Pressable
                onPress={saveEdit}
                style={[styles.primaryBtn, !canSave() && { opacity: 0.6 }]}
                disabled={!canSave()}
              >
                <Text style={styles.primaryBtnText}>{saving ? "Guardando…" : "Guardar"}</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>
              *Se manda RESCHEDULE (fechas) y luego se intenta poner Userstatus 0012.
            </Text>
          </View>
        </View>
      </Modal>

      {/* ===== Modal BULK ===== */}
      <Modal visible={bulkOpen} transparent animationType="fade" onRequestClose={closeBulk}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reprogramar {selectedCount} órdenes</Text>
              <Pressable onPress={closeBulk} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <View style={[styles.stepBanner, bulkStep === "start" ? styles.stepBannerStart : styles.stepBannerEnd]}>
              <Ionicons
                name={bulkStep === "start" ? "flag-outline" : "checkmark-circle-outline"}
                size={18}
                color={bulkStep === "start" ? COLORS.warn : COLORS.ok}
              />
              <Text style={styles.stepBannerText}>
                {bulkStep === "start"
                  ? "Paso 1: Selecciona la FECHA DE INICIO (para todas)"
                  : "Paso 2: Selecciona la FECHA DE FIN (para todas)"}
              </Text>
            </View>

            <View style={styles.pillsRow}>
              <View style={[styles.pill, bulkStep === "start" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Inicio</Text>
                <Text style={styles.pillValue}>{bulkStart || "—"}</Text>
              </View>
              <View style={[styles.pill, bulkStep === "end" && styles.pillActive]}>
                <Text style={styles.pillLabel}>Fin</Text>
                <Text style={styles.pillValue}>{bulkEnd || "—"}</Text>
              </View>
            </View>

            <Calendar
              markingType={bulkStart && bulkEnd ? "period" : "simple"}
              markedDates={bulkStart ? buildRangeMarkedDates(bulkStart, bulkEnd) : {}}
              onDayPress={(d) => onPickBulkDate(d.dateString)}
              theme={{
                backgroundColor: "transparent",
                calendarBackground: "transparent",
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.stepRow}>
              <Pressable
                onPress={() => {
                  setBulkStep("start");
                  setBulkStart(toYMD(new Date()));
                  setBulkEnd("");
                }}
                style={[styles.stepBtn, bulkSaving && { opacity: 0.6 }]}
                disabled={bulkSaving}
              >
                <Ionicons name="arrow-back" size={16} color={COLORS.textPrimary} />
                <Text style={styles.stepBtnText}>Elegir inicio</Text>
              </Pressable>

              {bulkStep === "end" && (
                <Pressable
                  onPress={() => {
                    if (!bulkStart) return;
                    setBulkEnd(bulkStart);
                  }}
                  style={[styles.stepBtn, bulkSaving && { opacity: 0.6 }]}
                  disabled={bulkSaving}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.textPrimary} />
                  <Text style={styles.stepBtnText}>Fin = Inicio</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeBulk}
                style={[styles.ghostBtn, bulkSaving && { opacity: 0.6 }]}
                disabled={bulkSaving}
              >
                <Text style={styles.ghostBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={saveBulk}
                style={[
                  styles.primaryBtn,
                  (!bulkStart || !bulkEnd || bulkSaving) && { opacity: 0.6 },
                ]}
                disabled={!bulkStart || !bulkEnd || bulkSaving}
              >
                <Text style={styles.primaryBtnText}>{bulkSaving ? "Guardando…" : "Guardar"}</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>
              Rango: <Text style={styles.bold}>{bulkStart || "—"}</Text> a{" "}
              <Text style={styles.bold}>{bulkEnd || "—"}</Text>
              {"\n"}*Luego intenta poner Userstatus 0012 a todas.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ====================== Styles ====================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pageBg },

  card: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 2 },
    }),
  },

  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, flex: 1 },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  refreshText: { fontSize: 12, fontWeight: "800", color: COLORS.textSub },

  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  clearBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.textSub },

  hint: { marginTop: 8, fontSize: 12, color: COLORS.textSub },
  bold: { fontWeight: "900", color: COLORS.textPrimary },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textPrimary },

  count: { marginHorizontal: 16, marginTop: 10, color: COLORS.textSub, fontSize: 12.5 },
  empty: { paddingVertical: 18, paddingHorizontal: 16, color: COLORS.textSub, fontSize: 13 },

  orderRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
  },
  checkWrap: { alignSelf: "center" },

  orderId: { fontSize: 14, fontWeight: "900", color: COLORS.textPrimary },
  orderSub: { marginTop: 2, fontSize: 12.5, color: COLORS.textSub },
  orderDates: { marginTop: 6, fontSize: 12.5, color: COLORS.textSub },
  small: { marginTop: 4, fontSize: 11.5, color: COLORS.textSub },

  editBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  editBtnText: { color: "#fff", fontWeight: "900", fontSize: 12.5 },

  bulkBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  bulkTitle: { fontWeight: "900", color: COLORS.textPrimary, fontSize: 13 },
  bulkSub: { marginTop: 2, color: COLORS.textSub, fontSize: 12 },

  bulkGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  bulkGhostText: { fontWeight: "900", color: COLORS.textPrimary, fontSize: 12 },

  bulkPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  bulkPrimaryText: { fontWeight: "900", color: "#fff", fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 15, fontWeight: "900", color: COLORS.textPrimary },

  stepBanner: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
  },
  stepBannerStart: { borderColor: "#F0D7A8", backgroundColor: "#FFF7EA" },
  stepBannerEnd: { borderColor: "#BFE7D5", backgroundColor: "#ECFFF6" },
  stepBannerText: { flex: 1, fontSize: 12.8, fontWeight: "900", color: COLORS.textPrimary },

  pillsRow: { flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 8 },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  pillActive: { borderColor: COLORS.accent },
  pillLabel: { fontSize: 11.5, color: COLORS.textSub, fontWeight: "800" },
  pillValue: { marginTop: 2, fontSize: 13, color: COLORS.textPrimary, fontWeight: "900" },

  stepRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  stepBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  stepBtnText: { fontSize: 12.5, fontWeight: "900", color: COLORS.textPrimary },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  ghostBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  ghostBtnText: { fontSize: 13, fontWeight: "900", color: COLORS.textPrimary },

  primaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: COLORS.accent },
  primaryBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },

  modalFooter: { marginTop: 10, fontSize: 11.5, color: COLORS.textSub },
});
