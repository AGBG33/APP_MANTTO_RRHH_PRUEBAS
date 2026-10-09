// app/supervisor/ordenes/index.js
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../src/components/Header";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import { isOnline } from "../../../src/offline/net";
import { fetchOrdenesSupervisor } from "../../../src/services/ordenesSupervisor";
import {
  fetchOrdenDetalleSupervisor,
  fetchOperacionesSupervisor,
} from "../../../src/services/operacionesSupervisor";
import api from "../../../src/services/api";

/* ====================== Helpers de fecha UI ====================== */
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

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const buildSupervisorWindow = (baseDate = new Date()) => {
  const today = atStartOfDay(baseDate);

  return {
    start: atStartOfDay(addDays(today, -15)),
    end: atEndOfDay(addDays(today, 15)),
  };
};

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/* ====================== Paleta ====================== */
const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  muted: "#63718B",
  shadow: "#000000",
};

/* ====================== Opciones filtro estatus ====================== */
const STATUS_FILTER_OPTIONS = [
  { key: "all", label: "Todos" },
  { key: "start", label: "Sin empezar" },
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "final", label: "Finalizada" },
  { key: "firma", label: "Pendiente de firma" },
  { key: "no_mantto", label: "Carta No Mantto" },
];

function getStatusFilterLabel(value) {
  const found = STATUS_FILTER_OPTIONS.find((x) => x.key === value);
  return found ? found.label : "Todos";
}

/* ====================== Parse SAP /Date(…)/ -> ms ====================== */
function sapDateToMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const s = String(value);
  const m = s.match(/\/Date\((\-?\d+)([+-]\d{4})?\)\//);
  if (m) {
    /*
     * En el formato OData /Date(ms+offset)/, los milisegundos ya
     * representan el instante. El sufijo sólo describe el offset y no se
     * debe volver a aplicar; hacerlo puede mover una fecha SAP a otro día.
     */
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? ms : null;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function sapMsToUtcYmd(ms) {
  if (ms === null || ms === undefined) return null;

  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ====================== Formato fecha ====================== */
function formatSapMsAsDMY(ms) {
  if (ms === null || ms === undefined) return "—";
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* =========================
   Catálogo de estatus
   ========================= */
async function fetchStatusCatalogMap() {
  const url =
    "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet?$filter=" +
    encodeURIComponent("Stsma eq 'CS000001'") +
    "&$format=json";

  const res = await api.get(url);
  const results = res?.data?.d?.results || [];
  const map = {};

  for (const r of results) {
    const code = normalizeCode(r?.Status1 || "");
    const label = String(r?.Status2 || "").trim();
    if (code) map[code] = label || code;
  }

  return map;
}

/* =========================
   Reglas Userstatus
   ========================= */
function normalizeCode(code) {
  if (code === null || code === undefined) return "";

  const s = String(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function extractCodes(raw) {
  if (!raw) return [];

  const s = String(raw).trim();
  if (!s) return [];

  const matches = s.match(/\d{1,4}/g) || [];

  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));

  return Array.from(new Set(codes));
}

const STATUS_META = {
  "0100": {
    label: "PENDIENTE",
    type: "pendiente",
    color: "#D64545",
  },
  "0200": {
    label: "EN PROCESO",
    type: "proceso",
    color: "#D9A400",
  },
  "0300": {
    label: "FINALIZADA",
    type: "final",
    color: "#28B463",
  },
  "0301": {
    label: "FINALIZADA SUPER",
    type: "final",
    color: "#025f29",
  },
  "0400": {
    label: "PENDIENTE DE FIRMA",
    type: "firma",
    color: "#2D9CDB",
  },
  "0600": {
    label: "Carta No Mantto",
    type: "no_mantto",
    color: "#b90909",
  },
};

const PRIORITY = ["0600", "0400", "0300", "0200", "0100", "0301"];

function resolveUserstatus(
  rawUserstatus,
  _catalogMap = {},
  itemFromApi = null,
) {
  const rawCodes = extractCodes(rawUserstatus);
  const apiCode = normalizeCode(itemFromApi?.estatus_code);

  const codes = Array.from(
    new Set([...(rawCodes || []), ...(apiCode ? [apiCode] : [])]),
  );

  if (!codes.length) {
    return {
      code: "",
      label: "Sin empezar",
      type: "start",
      color: "#95A0AF",
      rawCodes: [],
    };
  }

  for (const p of PRIORITY) {
    if (codes.includes(p)) {
      return {
        code: p,
        ...STATUS_META[p],
        rawCodes: codes,
      };
    }
  }

  return {
    code: codes[0],
    label: `Estatus ${codes.join(", ")}`,
    type: "unknown",
    color: "#95A0AF",
    rawCodes: codes,
  };
}

/* =========================
   Detectar / mapear item
   ========================= */
function isSapRaw(item) {
  return (
    item &&
    (item.Orderid || item.Equipment || item.StartDate || item.Userstatus)
  );
}

function mapOrdenSapToUi(o) {
  return {
    orderid: String(o?.Orderid ?? ""),
    equipment: String(o?.Equipment ?? ""),
    nombre_orden: String(o?.ShortText ?? ""),
    startdate: sapDateToMs(o?.StartDate),
    finishdate: sapDateToMs(o?.FinishDate),
    userstatus: String(o?.Userstatus ?? ""),
    id_mecanico: String(o?.IdMecanico ?? ""),
    nombre_mecanico: String(o?.NombreMec ?? ""),
    nombre_cliente: String(o?.NombreCliente ?? ""),
    estatus_code: String(o?.estatus_code ?? o?.EstatusCode ?? ""),
    _raw: o,
  };
}

function normalizeOrdenItem(item) {
  if (!item) return null;

  if (
    item.orderid ||
    item.equipment ||
    item.userstatus ||
    item.startdate ||
    item.finishdate
  ) {
    const startMs =
      typeof item.startdate === "number"
        ? item.startdate
        : sapDateToMs(item.startdate ?? item.StartDate);

    const finishMs =
      typeof item.finishdate === "number"
        ? item.finishdate
        : sapDateToMs(item.finishdate ?? item.FinishDate);

    return {
      ...item,
      orderid: String(item.orderid ?? item.Orderid ?? ""),
      equipment: String(item.equipment ?? item.Equipment ?? ""),
      nombre_orden: String(item.nombre_orden ?? item.ShortText ?? ""),
      userstatus: String(item.userstatus ?? item.Userstatus ?? ""),
      startdate: startMs,
      finishdate: finishMs,
      id_mecanico: String(item.id_mecanico ?? item.IdMecanico ?? ""),
      nombre_mecanico: String(item.nombre_mecanico ?? item.NombreMec ?? ""),
      nombre_cliente: String(item.nombre_cliente ?? item.NombreCliente ?? ""),
      estatus_code: String(item.estatus_code ?? item.EstatusCode ?? ""),
    };
  }

  if (isSapRaw(item)) return mapOrdenSapToUi(item);

  return null;
}

/* =========================
   Prefetch
   ========================= */
const PREFETCH_LIMIT = 25;
const PREFETCH_CONCURRENCY = 3;

async function prefetchDetallesDeOrdenes(orderIds = []) {
  const online = await isOnline();
  if (!online) return;

  const unique = Array.from(new Set(orderIds.map((x) => String(x))));
  const ids = unique.slice(0, PREFETCH_LIMIT);

  let i = 0;

  const worker = async () => {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];

      try {
        await fetchOrdenDetalleSupervisor(id);
        await fetchOperacionesSupervisor(id);
      } catch (e) {}
    }
  };

  const workers = Array.from({ length: PREFETCH_CONCURRENCY }, () => worker());
  await Promise.all(workers);
}

/* =========================
   Fondo de tarjeta por estatus
   ========================= */
function getCardToneByStatus(st) {
  if (st.type === "final") {
    return {
      bg: "#EAF7EF",
      border: "#BEE6CB",
    };
  }

  if (st.type === "proceso") {
    return {
      bg: "#FFF8E8",
      border: "#F1D98A",
    };
  }

  if (st.type === "pendiente") {
    return {
      bg: "#FFF0F0",
      border: "#F0B7B7",
    };
  }

  if (st.type === "firma") {
    return {
      bg: "#EDF7FF",
      border: "#B8DDF8",
    };
  }

  if (st.type === "no_mantto") {
    return {
      bg: "#F1F3F5",
      border: "#C9CED6",
    };
  }

  return {
    bg: "#FFFFFF",
    border: COLORS.border,
  };
}

export default function ListaOrdenesSupervisor() {
  const currentYear = new Date().getFullYear();

  const [yearOptions] = useState(() => {
    const arr = [];
    for (let y = currentYear + 2; y >= currentYear - 10; y--) {
      arr.push(y);
    }
    return arr;
  });

  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateMode, setDateMode] = useState("day");

  const [dayRef, setDayRef] = useState(new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  const [weekStart, setWeekStart] = useState(null);
  const [weekEnd, setWeekEnd] = useState(null);
  const [showWeekStartPicker, setShowWeekStartPicker] = useState(false);
  const [showWeekEndPicker, setShowWeekEndPicker] = useState(false);

  const now = new Date();
  const [monthYear, setMonthYear] = useState({
    month: now.getMonth(),
    year: now.getFullYear(),
  });
  const [yearOnly, setYearOnly] = useState(now.getFullYear());

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const [statusCatalog, setStatusCatalog] = useState({});
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showStatusModal, setShowStatusModal] = useState(false);

  const requestIdRef = useRef(0);
  const lastPrefetchKeyRef = useRef("");
  const initialWindowRef = useRef(buildSupervisorWindow());
  const [loadedRange, setLoadedRange] = useState(() => ({
    start: initialWindowRef.current.start,
    end: initialWindowRef.current.end,
  }));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  /* =========================================================
     RANGO INICIAL DEL SUPERVISOR
     - 15 días antes de hoy
     - 15 días después de hoy

     Los periodos fuera de esta ventana se consultan bajo demanda
     cuando el usuario elige Día / Semana / Mes / Año.
     ========================================================= */
  const initialWindow = initialWindowRef.current;

  /* =========================================================
     RANGO DE FILTRO FRONTEND USANDO FECHA DE INICIO
     ========================================================= */
  const frontendDateFilter = useMemo(() => {
    if (dateMode === "day") {
      return {
        start: atStartOfDay(dayRef),
        end: atEndOfDay(dayRef),
      };
    }

    if (dateMode === "weekRange") {
      if (!weekStart || !weekEnd) return { start: null, end: null };

      return {
        start: atStartOfDay(weekStart),
        end: atEndOfDay(weekEnd),
      };
    }

    if (dateMode === "month") {
      const ref = new Date(monthYear.year, monthYear.month, 1);

      return {
        start: startOfMonth(ref),
        end: endOfMonth(ref),
      };
    }

    if (dateMode === "year") {
      return {
        start: startOfYear(yearOnly),
        end: endOfYear(yearOnly),
      };
    }

    return {
      start: null,
      end: null,
    };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  const canLoadCurrentRange = useMemo(() => true, []);

  const activeRangeText = useMemo(() => {
    if (dateMode === "day") {
      return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
    }

    if (dateMode === "weekRange") {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—";
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—";
      return `Semana (rango): ${a} → ${b}`;
    }

    if (dateMode === "month") {
      return `Mes: ${MONTHS[monthYear.month]} ${monthYear.year}`;
    }

    if (dateMode === "year") return `Año: ${yearOnly}`;

    return "";
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear, yearOnly]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const online = await isOnline();
        if (!online) return;

        setLoadingCatalog(true);
        const map = await fetchStatusCatalogMap();

        if (mounted) setStatusCatalog(map || {});
      } catch (e) {
        console.log("[CATALOGO STATUS ERROR]", e?.message || e);
      } finally {
        if (mounted) setLoadingCatalog(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const isRangeCovered = useCallback(
    (start, end) => {
      if (!(start instanceof Date) || !(end instanceof Date)) return false;
      if (!(loadedRange?.start instanceof Date) || !(loadedRange?.end instanceof Date)) {
        return false;
      }

      return (
        atStartOfDay(start) >= atStartOfDay(loadedRange.start) &&
        atEndOfDay(end) <= atEndOfDay(loadedRange.end)
      );
    },
    [loadedRange],
  );

  const cargarRango = useCallback(
    async (start, end, { force = false } = {}) => {
      if (!(start instanceof Date) || !(end instanceof Date)) return;

      const currentRequestId = ++requestIdRef.current;

      try {
        setLoading(true);

        const sStr = ymd(start);
        const eStr = ymd(end);

        const online = await isOnline();

        /*
         * Si no hay conexión, fetchOrdenesSupervisor intentará usar
         * la caché exacta de ese rango. Si nunca se consultó antes,
         * simplemente regresará un arreglo vacío.
         */
        const data = await fetchOrdenesSupervisor(sStr, eStr, "range");

        if (currentRequestId !== requestIdRef.current) return;

        let arr = [];
        if (Array.isArray(data)) arr = data;
        else if (Array.isArray(data?.d?.results)) arr = data.d.results;
        else if (Array.isArray(data?.results)) arr = data.results;

        const normalized = arr.map(normalizeOrdenItem).filter(Boolean);

        if (!online && normalized.length === 0 && !force) {
          Alert.alert(
            "Sin conexión",
            "Este periodo no está disponible en la caché. Conéctate a internet para consultarlo.",
          );
          return;
        }

        setOrdenes(normalized);
        setLoadedRange({
          start: atStartOfDay(start),
          end: atEndOfDay(end),
        });

        if (online && normalized.length) {
          const prefetchKey = `${sStr}|${eStr}|${normalized.length}`;

          if (lastPrefetchKeyRef.current !== prefetchKey) {
            lastPrefetchKeyRef.current = prefetchKey;

            const ids = normalized.map((x) => x?.orderid).filter(Boolean);

            /*
             * Se mantiene el límite actual de 25 detalles.
             * La lista puede contener más órdenes, pero sólo estas
             * primeras candidatas intentan precargar detalle + operaciones.
             */
            prefetchDetallesDeOrdenes(ids);
          }
        }
      } catch (error) {
        if (currentRequestId !== requestIdRef.current) return;

        console.error(
          "Error al cargar órdenes supervisor:",
          error?.message || error,
        );

        setOrdenes([]);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const ensureRangeLoaded = useCallback(
    async (start, end) => {
      if (!(start instanceof Date) || !(end instanceof Date)) return;

      if (isRangeCovered(start, end)) {
        return;
      }

      await cargarRango(start, end);
    },
    [cargarRango, isRangeCovered],
  );

  /*
   * Carga inicial única:
   * solamente 15 días antes y 15 días después de la fecha actual.
   */
  useEffect(() => {
    cargarRango(initialWindow.start, initialWindow.end);
    // La ventana inicial queda fijada al montar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = () => {
    /*
     * Recarga exactamente el periodo que ya está cargado.
     * Así no vuelve a pedir automáticamente todo el año.
     */
    cargarRango(loadedRange.start, loadedRange.end, { force: true });
  };

  const filteredOrdenes = useMemo(() => {
    const q = debouncedQuery.toLowerCase();

    return ordenes.filter((o) => {
      const orderid = String(o?.orderid ?? "").toLowerCase();
      const eq = String(o?.equipment ?? "").toLowerCase();
      const nombre = String(o?.nombre_orden ?? "").toLowerCase();
      const tecnico = String(o?.nombre_mecanico ?? "").toLowerCase();
      const nomina = String(o?.id_mecanico ?? "").toLowerCase();
      const cliente = String(o?.nombre_cliente ?? "").toLowerCase();

      const st = resolveUserstatus(
        o?.userstatus ?? o?.Userstatus,
        statusCatalog,
        o,
      );

      const stLabel = String(st?.label ?? "").toLowerCase();
      const stCode = String(st?.code ?? "").toLowerCase();

      const matchesQuery =
        !q ||
        orderid.includes(q) ||
        eq.includes(q) ||
        nombre.includes(q) ||
        tecnico.includes(q) ||
        nomina.includes(q) ||
        cliente.includes(q) ||
        stLabel.includes(q) ||
        stCode.includes(q);

      const matchesStatus =
        selectedStatus === "all" || st.type === selectedStatus;

      let matchesDate = true;

      const startMs =
        typeof o?.startdate === "number"
          ? o.startdate
          : sapDateToMs(o?.StartDate ?? o?.startdate);

      if (startMs === null || startMs === undefined) {
        matchesDate = false;
      } else {
        /*
         * Las fechas de orden de SAP son días de calendario codificados en
         * UTC. Convertirlas a medianoche local (por ejemplo, UTC-6 en México)
         * las desplaza al día anterior y hacía que el supervisor viera las
         * órdenes del día siguiente. Se compara el YYYY-MM-DD de SAP en UTC
         * contra el YYYY-MM-DD elegido localmente, igual que en Técnico.
         */
        const orderStartYmd = sapMsToUtcYmd(startMs);

        if (
          frontendDateFilter.start instanceof Date &&
          frontendDateFilter.end instanceof Date
        ) {
          matchesDate =
            Boolean(orderStartYmd) &&
            orderStartYmd >= ymd(frontendDateFilter.start) &&
            orderStartYmd <= ymd(frontendDateFilter.end);
        }
      }

      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [
    ordenes,
    debouncedQuery,
    statusCatalog,
    selectedStatus,
    dateMode,
    frontendDateFilter,
  ]);

  const renderItem = ({ item }) => {
    const st = resolveUserstatus(
      item?.userstatus ?? item?.Userstatus,
      statusCatalog,
      item,
    );

    const startMs =
      typeof item?.startdate === "number"
        ? item.startdate
        : sapDateToMs(item?.StartDate ?? item?.startdate);

    const finishMs =
      typeof item?.finishdate === "number"
        ? item.finishdate
        : sapDateToMs(item?.FinishDate ?? item?.finishdate);

    const tone = getCardToneByStatus(st);

    const showBlockedMessage =
      st.type === "final" ||
      st.type === "firma" ||
      st.type === "pendiente" ||
      st.type === "no_mantto";

    return (
      <TouchableOpacity
        style={[
          styles.cardModern,
          {
            backgroundColor: tone.bg,
            borderColor: tone.border,
            borderLeftColor: st.color,
          },
        ]}
        onPress={() => router.push(`/supervisor/ordenes/${item.orderid}`)}
        activeOpacity={0.9}
      >
        <View style={styles.cardTopRow}>
          <Text
            style={styles.cardModernTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            #{item.orderid}{" "}
            <Text style={styles.cardModernSubtitle}>
              • {item.nombre_orden || "SM01"}
            </Text>
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: `${st.color}1A` }]}>
            <View style={[styles.statusDot, { backgroundColor: st.color }]} />
            <Text
              style={[styles.statusBadgeText, { color: st.color }]}
              numberOfLines={1}
            >
              {st.label}
            </Text>
          </View>
        </View>

        <View style={styles.cardMiddleRow}>
          <Text style={styles.compactInfoText} numberOfLines={1}>
            <Text style={styles.compactInfoStrong}>Equipo: </Text>
            {item.equipment || "—"}
          </Text>

          <Text style={styles.compactDateText} numberOfLines={1}>
            {formatSapMsAsDMY(startMs)} - {formatSapMsAsDMY(finishMs)}
          </Text>
        </View>

        <View style={styles.cardMiddleRow}>
          <Text style={styles.compactInfoText} numberOfLines={1}>
            <Text style={styles.compactInfoStrong}>Técnico: </Text>
            {item.nombre_mecanico || "—"}
          </Text>

          <Text style={styles.compactNominaText} numberOfLines={1}>
            <Text style={styles.compactInfoStrong}>Nómina: </Text>
            {item.id_mecanico || "—"}
          </Text>
        </View>

        <Text
          style={styles.clientText}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          <Text style={styles.compactInfoStrong}>Cliente: </Text>
          {item.nombre_cliente || "—"}
        </Text>

        {showBlockedMessage ? (
          <Text style={styles.blockedText} numberOfLines={1}>
            Orden bloqueada por estatus.
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Ordenes del Supervisor" />

      <View style={styles.filtersWrap}>
        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={16}
            color={COLORS.muted}
            style={{ marginRight: 8 }}
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por #orden, equipo, técnico, nómina o estatus…"
            placeholderTextColor="#8A97A6"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
          />

          {!!query && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              style={styles.clearBtn}
              hitSlop={10}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chipsRow}>

          <TouchableOpacity
            style={[styles.chip, dateMode === "day" && styles.chipActive]}
            onPress={() => {
              setDateMode("day");
              setShowDayPicker(true);
              setShowMonthPicker(false);
              setShowYearPicker(false);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "day" && styles.chipTextActive,
              ]}
            >
              Día
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "weekRange" && styles.chipActive]}
            onPress={() => {
              setDateMode("weekRange");
              setShowWeekStartPicker(true);
              setShowMonthPicker(false);
              setShowYearPicker(false);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "weekRange" && styles.chipTextActive,
              ]}
            >
              Semana
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "month" && styles.chipActive]}
            onPress={() => {
              setDateMode("month");
              setShowMonthPicker(true);
              setShowYearPicker(false);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "month" && styles.chipTextActive,
              ]}
            >
              Mes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, dateMode === "year" && styles.chipActive]}
            onPress={() => {
              setDateMode("year");
              setShowYearPicker(true);
              setShowMonthPicker(false);
            }}
          >
            <Text
              style={[
                styles.chipText,
                dateMode === "year" && styles.chipTextActive,
              ]}
            >
              Año
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statusFilterInlineBtn}
            activeOpacity={0.85}
            onPress={() => setShowStatusModal(true)}
          >
            <View style={styles.statusFilterBtnLeft}>
              <Ionicons name="funnel-outline" size={16} color={COLORS.title} />
              <Text style={styles.statusFilterBtnText}>
                Estatus: {getStatusFilterLabel(selectedStatus)}
              </Text>
            </View>

            <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.activeRangeText}>
          {activeRangeText}
          {loadingCatalog ? " · cargando catálogo…" : ""}
          {debouncedQuery ? ` · búsqueda: "${debouncedQuery}"` : ""}
          {selectedStatus !== "all"
            ? ` · estatus: "${getStatusFilterLabel(selectedStatus)}"`
            : ""}
        </Text>

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

              if (date) {
                setDayRef(date);
                ensureRangeLoaded(atStartOfDay(date), atEndOfDay(date));
              }
              setShowDayPicker(Platform.OS === "ios");
            }}
          />
        )}

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

              if (date) {
                setWeekEnd(date);

                const start = weekStart ?? date;
                ensureRangeLoaded(
                  atStartOfDay(start),
                  atEndOfDay(date),
                );
              }
              setShowWeekEndPicker(Platform.OS === "ios");
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
                Inicio: {weekStart ? weekStart.toLocaleDateString() : "—"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => setShowWeekEndPicker(true)}
            >
              <Text style={styles.smallBtnText}>
                Fin: {weekEnd ? weekEnd.toLocaleDateString() : "—"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal
        visible={showStatusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusModal(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowStatusModal(false)}
        >
          <Pressable style={styles.statusModalCard} onPress={() => {}}>
            <Text style={styles.statusModalTitle}>Filtrar por estatus</Text>

            {STATUS_FILTER_OPTIONS.map((option) => {
              const active = selectedStatus === option.key;

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.statusOptionItem,
                    active && styles.statusOptionItemActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedStatus(option.key);
                    setShowStatusModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      active && styles.statusOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>

                  {active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={COLORS.accent}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.statusClearBtn}
              activeOpacity={0.9}
              onPress={() => {
                setSelectedStatus("all");
                setShowStatusModal(false);
              }}
            >
              <Text style={styles.statusClearBtnText}>Quitar filtro</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showMonthPicker && dateMode === "month"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthPicker(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowMonthPicker(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() =>
                  setMonthYear((s) => ({ ...s, year: s.year - 1 }))
                }
              >
                <Text style={styles.pickerBtnText}>‹</Text>
              </TouchableOpacity>

              <Text style={styles.pickerTitle}>{monthYear.year}</Text>

              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() =>
                  setMonthYear((s) => ({ ...s, year: s.year + 1 }))
                }
              >
                <Text style={styles.pickerBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthGrid}>
              {MONTHS.map((m, idx) => {
                const active =
                  idx === monthYear.month && monthYear.year === yearOnly;

                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthCell, active && styles.monthCellActive]}
                    onPress={() => {
                      const selectedMonth = new Date(monthYear.year, idx, 1);

                      setMonthYear({ month: idx, year: monthYear.year });
                      setYearOnly(monthYear.year);
                      setShowMonthPicker(false);

                      ensureRangeLoaded(
                        startOfMonth(selectedMonth),
                        endOfMonth(selectedMonth),
                      );
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showYearPicker && dateMode === "year"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowYearPicker(false)}
        >
          <Pressable style={styles.yearListModalCard} onPress={() => {}}>
            <Text style={styles.yearListTitle}>Selecciona un año</Text>

            <ScrollView
              style={styles.yearListScroll}
              showsVerticalScrollIndicator={true}
            >
              {yearOptions.map((year) => {
                const active = year === yearOnly;

                return (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.yearOptionItem,
                      active && styles.yearOptionItemActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setYearOnly(year);
                      setShowYearPicker(false);

                      ensureRangeLoaded(
                        startOfYear(year),
                        endOfYear(year),
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.yearOptionText,
                        active && styles.yearOptionTextActive,
                      ]}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.yearFooter}>
              <TouchableOpacity
                style={styles.yearCloseBtn}
                onPress={() => setShowYearPicker(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.yearCloseBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={styles.pageSubtitle}>
        {loading
          ? "Cargando..."
          : `${filteredOrdenes.length} órdenes${
              debouncedQuery ? " (filtradas)" : ""
            }`}
      </Text>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: 40 }}
        />
      ) : (
        <FlatList
          data={filteredOrdenes}
          keyExtractor={(it, idx) => `${String(it.orderid)}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {debouncedQuery
                ? "No se encontraron órdenes con ese criterio."
                : "No hay órdenes en este rango."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },

  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: COLORS.cardBg,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 1 },
    }),
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    marginBottom: 10,
  },

  searchInput: {
    flex: 1,
    color: COLORS.title,
    fontWeight: "600",
    paddingVertical: 0,
  },

  clearBtn: { marginLeft: 8 },

  /*
   * Filtros de fecha estilo segmentado, igual que en técnico.
   * Los 4 botones ocupan todo el ancho disponible de la pantalla.
   */
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  chip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },

  chipActive: {
    backgroundColor: COLORS.accent,
  },

  chipText: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },

  chipTextActive: {
    color: "#FFFFFF",
  },

  actionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    width: "100%",
  },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.accent,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
  },

  refreshBtnText: {
    color: "#fff",
    fontWeight: "800",
  },

  statusFilterInlineBtn: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  statusFilterBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },

  statusFilterBtnText: {
    color: COLORS.title,
    fontSize: 13,
    fontWeight: "600",
  },

  activeRangeText: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 12,
  },

  rangeButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: COLORS.border,
    flex: 1,
  },

  smallBtnText: {
    color: COLORS.title,
    fontWeight: "600",
    textAlign: "center",
  },

  pageSubtitle: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    fontSize: 13,
    color: COLORS.text,
  },

  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 90,
  },

  cardModern: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    marginBottom: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 1,
      },
    }),
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },

  cardModernTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.title,
  },

  cardModernSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },

  statusBadge: {
    maxWidth: "44%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginRight: 5,
  },

  statusBadgeText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "800",
  },

  cardMiddleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },

  compactInfoText: {
    flex: 1,
    fontSize: 11.5,
    color: "#68758A",
  },

  compactDateText: {
    flexShrink: 0,
    fontSize: 11,
    color: "#68758A",
    textAlign: "right",
  },

  compactNominaText: {
    flexShrink: 0,
    maxWidth: "42%",
    fontSize: 11.5,
    color: "#68758A",
    textAlign: "right",
  },

  compactInfoStrong: {
    color: COLORS.title,
    fontWeight: "800",
  },

  clientText: {
    marginTop: 4,
    fontSize: 11.5,
    color: "#68758A",
  },

  blockedText: {
    marginTop: 5,
    fontSize: 10.5,
    fontStyle: "italic",
    color: "#667085",
    textAlign: "right",
  },

  emptyText: {
    textAlign: "center",
    marginTop: 24,
    color: COLORS.text,
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 18,
    justifyContent: "center",
  },

  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statusModalCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statusModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 12,
  },

  statusOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "transparent",
  },

  statusOptionItemActive: {
    borderColor: COLORS.accent,
    backgroundColor: "#EEF5FF",
  },

  statusOptionText: {
    color: COLORS.title,
    fontSize: 14,
    fontWeight: "600",
  },

  statusOptionTextActive: {
    color: COLORS.accent,
  },

  statusClearBtn: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 11,
  },

  statusClearBtnText: {
    color: "#fff",
    fontWeight: "800",
  },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  pickerBtn: {
    width: 40,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  pickerBtnText: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.accent,
  },

  pickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.title,
  },

  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  monthCell: {
    width: "31.5%",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  monthCellActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  monthCellText: {
    color: COLORS.title,
    fontWeight: "700",
  },

  monthCellTextActive: {
    color: "#fff",
  },

  yearListModalCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: "70%",
  },

  yearListTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 12,
  },

  yearListScroll: {
    maxHeight: 340,
  },

  yearOptionItem: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 8,
  },

  yearOptionItemActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  yearOptionText: {
    color: COLORS.title,
    fontSize: 14,
    fontWeight: "700",
  },

  yearOptionTextActive: {
    color: "#fff",
  },

  yearFooter: {
    marginTop: 10,
    alignItems: "flex-end",
  },

  yearCloseBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },

  yearCloseBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});
