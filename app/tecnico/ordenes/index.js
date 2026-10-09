// app/tecnico/ordenes/index.js
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
  ScrollView,
  Alert,
  Pressable,
  Image,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { buildOfflineWindow } from "../../../src/offline/ordenesTecnicoCache";

import {
  setLocalStatusPatch,
  patchCacheOrdenesTecnicoList,
  patchCacheOrdenTecnicoDetail,
} from "../../../src/offline/ordenesTecnicoLocalPatch";
import { useAuth } from "../../../src/context/AuthContext";
import { useOrdenesTecnico } from "../../../src/context/OrdenesTecnicoContext";
import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import * as FileSystem from "expo-file-system/legacy";
import { preloadAvisoAveriaCatalogos } from "../../../src/services/avisoAveriaSap";
import { 
  buildWorkOrderBulkId,
} from "../../../src/utils/workOrderBulkId";

// ============================
// Guarda EQUIPO activo para geolocalización
// UbicacionContext leerá esta key:
//   activeEquipment:<correo> => equipment
// ============================
const ACTIVE_EQUIP_KEY = (userEmail) =>
  `activeEquipment:${String(userEmail || "anon")
    .toLowerCase()
    .trim()}`;
const TBMKY_STATUS_KEY = (orderId) =>
  `tbmky_status_${String(orderId || "").trim()}`;

const WORK_ORDER_BULK_ENDPOINT =
  "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

function buildCheckinBulkPayload({ orderId, base64 }) {
  const cleanOrderId = String(orderId || "").trim();
  const cleanBase64 = String(base64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "")
    .trim();

  if (!cleanOrderId) throw new Error("Falta orderId para el check-in.");
  if (!cleanBase64) throw new Error("La fotografía del check-in está vacía.");

  return {
    BulkId: buildWorkOrderBulkId({
      firstOrderId: cleanOrderId,
    }),
    WorkOrderSet: [
      {
        OrderId: cleanOrderId,
        WorkOrderHeader: { Orderid: cleanOrderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0100", Langu: "ES", Inactive: "" },
        ],
        Attachments: [
          {
            DocId: cleanOrderId,
            FileName: `CHECKIN_${cleanOrderId}.jpg`,
            MimeType: "image/jpeg",
            Base64: cleanBase64,
          },
        ],
        Return: [],
      },
    ],
  };
}

function logBulkPayload(label, payload) {
  try {
    const payloadParaLog = JSON.parse(
      JSON.stringify(payload),
    );

    payloadParaLog.WorkOrderSet?.forEach((order) => {
      order.Attachments?.forEach((attachment) => {
        const base64 = String(attachment.Base64 || "");

        attachment.Base64 =
          `<<BASE64 OMITIDO: ${base64.length} caracteres>>`;
      });
    });

    console.log(label);
    console.log(JSON.stringify(payloadParaLog, null, 2));
  } catch (error) {
    console.log(
      `${label} No se pudo imprimir el payload:`,
      error,
    );
  }
}
// ===== Fiori Palette =====
const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  borderMuted: "#CFD8E3",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  accentSoft: "#E3F2FD",
  neutralBtn: "#ECEFF5",
  danger: "#EB5757",
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

const parseSapDate = (value) => {
  if (!value) return null;

  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const getUtcYmd = (d) => {
  if (!d) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const formatLocalYmd = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getOrderKey = (item = {}) =>
  String(item?.Orderid || item?.OrderId || item?.orderid || "").trim();

const mergeOrdersKeepingCache = (cached = [], remote = []) => {
  const map = new Map();

  // Primero se conserva lo que ya existe localmente.
  for (const item of Array.isArray(cached) ? cached : []) {
    const key = getOrderKey(item);

    if (key) {
      map.set(key, item);
    }
  }

  // La respuesta más reciente de SAP reemplaza únicamente
  // las órdenes que hayan sido consultadas nuevamente.
  for (const item of Array.isArray(remote) ? remote : []) {
    const key = getOrderKey(item);

    if (key) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
};

const formatDateDMY = (value) => {
  const d = parseSapDate(value);
  if (!d) return "—";

  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();

  return `${dd}/${mm}/${yyyy}`;
};

const isWithin = (date, start, end) => {
  if (!date) return false;

  const dStr = getUtcYmd(date);
  const sStr = start ? getUtcYmd(start) : null;
  const eStr = end ? getUtcYmd(end) : null;

  if (sStr && dStr < sStr) return false;
  if (eStr && dStr > eStr) return false;

  return true;
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

/* =========================
   Reglas de Userstatus
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
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0200": {
    label: "EN PROCESO",
    type: "proceso",
    color: "#D49C00",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0300": {
    label: "FINALIZADA",
    type: "final",
    color: "#27AE60",
    lockActions: true,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0301": {
    label: "FINALIZADA SUPER",
    type: "final",
    color: "#025f29",
    lockActions: true,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0400": {
    label: "PENDIENTE DE FIRMA",
    type: "firma",
    color: "#2D9CDB",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
  },
  "0600": {
    label: "Carta No Mantto",
    type: "no_mantto",
    color: "#b90909",
    lockActions: true,
    allowCheckin: false,
    isNoMantto: true,
  },
};

const PRIORITY = ["0600", "0400", "0300", "0200", "0100", "0301"];

function resolveUserstatus(
  rawUserstatus,
  _catalogMap = {},
  itemFromApi = null,
) {
  /*
   * estatus_code ya representa el estatus efectivo normalizado.
   * Si está presente, debe utilizarse directamente.
   *
   * No debe combinarse con userstatus porque este último puede
   * contener códigos anteriores o inactivos.
   */
  const effectiveCode = normalizeCode(itemFromApi?.estatus_code);

  if (effectiveCode) {
    const metadata = STATUS_META[effectiveCode];

    if (metadata) {
      return {
        code: effectiveCode,
        ...metadata,
        rawCodes: [effectiveCode],
      };
    }

    return {
      code: effectiveCode,
      label:
        itemFromApi?.estatus_label ||
        _catalogMap?.[effectiveCode] ||
        `Estatus ${effectiveCode}`,
      type: "unknown",
      color: "#6A7381",
      lockActions: false,
      allowCheckin: false,
      isNoMantto: false,
      rawCodes: [effectiveCode],
    };
  }

  /*
   * Compatibilidad para órdenes que todavía no tengan estatus_code.
   */
  const rawCodes = extractCodes(rawUserstatus);

  if (!rawCodes.length) {
    return {
      code: "",
      label: "Sin empezar",
      type: "start",
      color: "#6A7381",
      lockActions: false,
      allowCheckin: true,
      isNoMantto: false,
      rawCodes: [],
    };
  }

  /*
   * En el valor recibido de SAP normalmente el último código
   * corresponde al estatus más reciente.
   */
  const fallbackCode = rawCodes[rawCodes.length - 1];
  const metadata = STATUS_META[fallbackCode];

  if (metadata) {
    return {
      code: fallbackCode,
      ...metadata,
      rawCodes,
    };
  }

  return {
    code: fallbackCode,
    label:
      _catalogMap?.[fallbackCode] ||
      `Estatus ${fallbackCode}`,
    type: "unknown",
    color: "#6A7381",
    lockActions: false,
    allowCheckin: false,
    isNoMantto: false,
    rawCodes,
  };
}

/* =========================
   Search
   ========================= */
const matchesQuery = (item, q) => {
  if (!q) return true;

  const needle = q.toLowerCase().trim();

  const fields = [
    item?.Orderid?.toString?.() ?? "",
    item?.order_type ?? "",
    item?.equipment ?? "",
    item?.partner_name ?? "",
    item?.partner_address ?? "",
    item?.ShortText ?? "",
    item?.shortText ?? "",
    item?.short_text ?? "",
    item?.cobertura ?? "",
    item?.userstatus ?? "",
    item?.estatus_label ?? "",
    item?.estatus_code ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return fields.includes(needle);
};

/* =========================
   CHECKIN OFFLINE QUEUE
   ========================= */
function makeQueueKey(userEmail) {
  const safe =
    String(userEmail || "anon")
      .toLowerCase()
      .trim() || "anon";

  return `checkin_queue_v1_${safe}`;
}

async function loadCheckinQueue(userEmail) {
  try {
    const key = makeQueueKey(userEmail);
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];

    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveCheckinQueue(userEmail, arr) {
  const key = makeQueueKey(userEmail);

  await AsyncStorage.setItem(
    key,
    JSON.stringify(Array.isArray(arr) ? arr : []),
  );
}

async function enqueueCheckin(userEmail, item) {
  const q = await loadCheckinQueue(userEmail);

  // evita duplicados por OrderId
  const exists = q.some((x) => String(x?.orderId) === String(item?.orderId));
  if (exists) return q;

  const next = [{ ...item }, ...q].slice(0, 50);

  await saveCheckinQueue(userEmail, next);

  return next;
}

async function removeFromQueue(userEmail, orderId) {
  const q = await loadCheckinQueue(userEmail);
  const next = q.filter((x) => String(x?.orderId) !== String(orderId));

  await saveCheckinQueue(userEmail, next);

  return next;
}

export default function ListaOrdenesTecnico() {
  const { user, ensureValidToken } = useAuth();

  const {
    ordenes: ordenesCompartidas,
    loadingInitial: loading,
    refreshing: refreshingCentral,
    loadLocal,
    refresh,
  } = useOrdenesTecnico();

  const userEmail = user?.correo || user?.email || user?.username || null;

  const [allOrdenes, setAllOrdenes] = useState([]);
  const [historicalOrdenes, setHistoricalOrdenes] = useState([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [ordenes, setOrdenes] = useState([]);

  const refreshing = refreshingCentral || loadingHistorical;

  const [query, setQuery] = useState("");
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

  const [showMonthModal, setShowMonthModal] = useState(false);

  // check-in modal + foto
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinOrderId, setCheckinOrderId] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [checkinPhotoBase64, setCheckinPhotoBase64] = useState(null);
  const [checkinPhotoUri, setCheckinPhotoUri] = useState(null);

  // catálogo status
  const [statusCatalogMap, setStatusCatalogMap] = useState({});

  // estado red + cola
  const [isOnline, setIsOnline] = useState(true);
  const [checkinQueue, setCheckinQueue] = useState([]);
  const syncingRef = useRef(false);

  const pendingSet = useMemo(() => {
    const s = new Set();

    (checkinQueue || []).forEach((x) => {
      if (x?.orderId) s.add(String(x.orderId));
    });

    return s;
  }, [checkinQueue]);

  const { start, end } = useMemo(() => {
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

    // Modo por defecto: día
    const s = atStartOfDay(dayRef);
    return { start: s, end: s };
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear]);

  const selectedRangeIsCached = useMemo(() => {
    const offlineWindow = buildOfflineWindow(new Date());
    const selectedStart = formatLocalYmd(start);
    const selectedEnd = formatLocalYmd(end);

    return (
      selectedStart >= offlineWindow.startStr &&
      selectedEnd <= offlineWindow.endStr
    );
  }, [start, end]);

  const selectedRangeKey = useMemo(
    () => `${formatLocalYmd(start)}:${formatLocalYmd(end)}`,
    [start, end],
  );

  const applyTbmkyOfflineStatuses = useCallback(async (data = []) => {
    try {
      const arr = Array.isArray(data) ? data : [];

      const keys = arr
        .map((x) => x?.Orderid)
        .filter(Boolean)
        .map((id) => TBMKY_STATUS_KEY(id));

      if (!keys.length) return arr;

      const pairs = await AsyncStorage.multiGet(keys);

      const statusByOrder = {};

      pairs.forEach(([key, value]) => {
        if (!value) return;

        const orderId = key.replace("tbmky_status_", "");
        statusByOrder[String(orderId)] = String(value).trim();
      });

      return arr.map((x) => {
        const orderId = String(x?.Orderid || "");
        const status = statusByOrder[orderId];

        if (!status) return x;

        const currentStatus = normalizeCode(
          x?.estatus_code ||
            x?.userstatus ||
            x?.UserStatus ||
            x?.UserStText ||
            "",
        );

        // tbmky_status_ solo puede completar una orden que todavía no tenga
        // un estatus efectivo proveniente del contexto, caché o SAP.
        if (currentStatus) {
          AsyncStorage.removeItem(TBMKY_STATUS_KEY(orderId)).catch(() => {});
          return x;
        }

        const localTbmkyStatus = normalizeCode(status);
        if (!localTbmkyStatus) return x;

        return {
          ...x,
          estatus_code: localTbmkyStatus,
          userstatus: localTbmkyStatus,
          Userstatus: localTbmkyStatus,
          UserStatus: localTbmkyStatus,
          UserStText: localTbmkyStatus,
          estatus_label:
            STATUS_META[localTbmkyStatus]?.label || localTbmkyStatus,
        };
      });
    } catch (e) {
      console.log("[ORDENES][TBMKY_STATUS] error:", e?.message || e);
      return data;
    }
  }, []);
  const fetchStatusCatalog = async () => {
    try {
      const res = await api.get(
        "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet?$filter=Stsma%20eq%20%27CS000001%27&$format=json",
      );

      const results = res?.data?.d?.results || [];
      const map = {};

      results.forEach((r) => {
        const k = normalizeCode(r?.Status1);
        const v = String(r?.Status2 || "").trim();

        if (k) map[k] = v;
      });

      setStatusCatalogMap(map);
    } catch (e) {
      console.log(
        "Error catálogo estatus:",
        e?.response?.data || e?.message || e,
      );
      setStatusCatalogMap({});
    }
  };

  const refreshQueue = useCallback(async () => {
    const q = await loadCheckinQueue(userEmail);
    setCheckinQueue(q);
  }, [userEmail]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // escuchar red
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const onlineNow = !!(
        state?.isConnected && state?.isInternetReachable !== false
      );

      setIsOnline(onlineNow);
    });

    return () => unsub();
  }, []);


  // Precarga en segundo plano los catálogos del aviso de avería (R, S, T)
  // para que el formulario pueda mostrar daños, localizaciones y causas offline.
  useEffect(() => {
    let alive = true;

    const preloadAvisoCatalogos = async () => {
      try {
        const net = await NetInfo.fetch();
        const online = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );

        if (!online) return;

        const okToken = await ensureValidToken();
        if (!okToken) return;

        if (!alive) return;

        await preloadAvisoAveriaCatalogos(null);
      } catch (e) {
        console.log(
          "[ORDENES][AVISO-AVERIA][PRELOAD] No se pudieron precargar catálogos:",
          e?.message || e,
        );
      }
    };

    preloadAvisoCatalogos();

    return () => {
      alive = false;
    };
  }, [ensureValidToken]);

  const applySharedOrdenes = useCallback(
    async (data = []) => {
      const source = Array.isArray(data) ? data : [];
      const patchedData = await applyTbmkyOfflineStatuses(source);

      setAllOrdenes(patchedData);
      return patchedData;
    },
    [applyTbmkyOfflineStatuses],
  );

  // Consulta temporal para periodos fuera de la ventana offline.
  // Los resultados se guardan solo en el estado de esta pantalla.
  const fetchHistoricalOrdenes = useCallback(async () => {
    if (selectedRangeIsCached) {
      setHistoricalOrdenes([]);
      return { ok: true, source: "cache_window", data: [] };
    }

    try {
      setLoadingHistorical(true);

      const net = await NetInfo.fetch();
      const online = !!(
        net?.isConnected && net?.isInternetReachable !== false
      );
      setIsOnline(online);

      if (!online) {
        setHistoricalOrdenes([]);
        return { ok: false, reason: "offline", data: [] };
      }

      const okToken = await ensureValidToken();
      if (!okToken) {
        return { ok: false, reason: "invalid_token", data: [] };
      }

      const params = new URLSearchParams({
        start: formatLocalYmd(start),
        end: formatLocalYmd(end),
        mode: "range",
      });

      console.log("[ORDENES][HISTORICO] Consulta temporal:", {
        start: formatLocalYmd(start),
        end: formatLocalYmd(end),
      });

      const res = await api.get(
        `/api/ordenes/sap/list?${params.toString()}`,
      );
      const remote = Array.isArray(res?.data) ? res.data : [];
      const patchedRemote = await applyTbmkyOfflineStatuses(remote);

      setHistoricalOrdenes(patchedRemote);

      return {
        ok: true,
        source: "remote_temporary",
        data: patchedRemote,
      };
    } catch (error) {
      console.log(
        "[ORDENES][HISTORICO] Error:",
        error?.response?.data || error?.message || error,
      );

      setHistoricalOrdenes([]);
      return { ok: false, reason: "request_error", error, data: [] };
    } finally {
      setLoadingHistorical(false);
    }
  }, [
    applyTbmkyOfflineStatuses,
    ensureValidToken,
    selectedRangeIsCached,
    selectedRangeKey,
    start,
    end,
  ]);

  // Relee únicamente AsyncStorage. No consulta SAP.
  const reloadOrdenesFromLocal = useCallback(async () => {
    try {
      const cached = await loadLocal();
      const data = Array.isArray(cached?.data) ? cached.data : [];

      await applySharedOrdenes(data);

      return { ok: true, data };
    } catch (error) {
      console.log(
        "[ORDENES] No se pudo releer la caché local:",
        error?.message || error,
      );

      return { ok: false, error };
    }
  }, [applySharedOrdenes, loadLocal]);

  // Solamente la recarga manual obliga a consultar nuevamente SAP.
  const refreshOrdenes = useCallback(async () => {
    // Fuera de la ventana offline se actualiza únicamente el periodo
    // seleccionado y no se escribe nada en AsyncStorage.
    if (!selectedRangeIsCached) {
      return fetchHistoricalOrdenes();
    }

    try {
      const result = await refresh();
      const cached = result?.cached;
      const data = Array.isArray(cached?.data) ? cached.data : [];

      await applySharedOrdenes(data);

      if (!result?.ok && !data.length) {
        Alert.alert(
          "Actualización",
          "No se pudieron actualizar las órdenes y todavía no hay información guardada.",
        );
      }

      return result;
    } catch (error) {
      console.log(
        "[ORDENES] Error actualizando órdenes:",
        error?.response?.data || error?.message || error,
      );

      Alert.alert(
        "Actualización",
        "No se pudieron actualizar las órdenes. Se conservarán los datos guardados.",
      );

      return { ok: false, error };
    }
  }, [
    applySharedOrdenes,
    fetchHistoricalOrdenes,
    refresh,
    selectedRangeIsCached,
  ]);

  // catálogo una vez
  useEffect(() => {
    fetchStatusCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refleja la lista central compartida cuando cambia.
  useEffect(() => {
    applySharedOrdenes(ordenesCompartidas);
  }, [applySharedOrdenes, ordenesCompartidas]);

  // Al seleccionar un periodo fuera de caché, lo consulta temporalmente.
  useEffect(() => {
    if (selectedRangeIsCached) {
      setHistoricalOrdenes([]);
      return;
    }

    fetchHistoricalOrdenes();
  }, [
    fetchHistoricalOrdenes,
    selectedRangeIsCached,
    selectedRangeKey,
  ]);

  // Al volver desde el detalle, relee cambios locales sin consultar SAP.
  useFocusEffect(
    useCallback(() => {
      reloadOrdenesFromLocal();
    }, [reloadOrdenesFromLocal]),
  );

  // filtrar en memoria
  useEffect(() => {
    const source = mergeOrdersKeepingCache(
      allOrdenes,
      historicalOrdenes,
    );

    const filtered = source.filter((item) => {
      const okQuery = matchesQuery(item, query);
      if (!okQuery) return false;

      const sd = parseSapDate(item?.start_date);
      if (!sd) return false;

      return isWithin(sd, start, end);
    });

    setOrdenes(filtered);
  }, [allOrdenes, historicalOrdenes, query, start, end]);

  // ===========================
  // GUARDAR EQUIPO ACTIVO
  // ===========================
  const saveActiveEquipmentFromItem = useCallback(
    async (item) => {
      try {
        const correo = userEmail || "";
        if (!correo) return;

        const equipment = String(item?.equipment || "").trim();
        if (!equipment) return;

        await AsyncStorage.setItem(ACTIVE_EQUIP_KEY(correo), equipment);

        console.log("[ORDENES] active equipment saved:", equipment);
      } catch (e) {
        console.log("[ORDENES] saveActiveEquipment error:", e?.message || e);
      }
    },
    [userEmail],
  );

  const irADetalles = async (itemOrOrderId) => {
    let orderId = itemOrOrderId;

    if (typeof itemOrOrderId === "object" && itemOrOrderId) {
      await saveActiveEquipmentFromItem(itemOrOrderId);
      orderId = itemOrOrderId?.Orderid;
    }

    const id = String(orderId);
    router.push(`/tecnico/ordenes/${id}`);
  };

  const abrirModalCheckin = (item, orderId) => {
    if (item) saveActiveEquipmentFromItem(item);

    setCheckinOrderId(orderId);
    setCheckinPhotoBase64(null);
    setCheckinPhotoUri(null);
    setShowCheckinModal(true);
  };

  // cámara -> archivo local
  const takeCheckinPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();

      if (!perm.granted) {
        Alert.alert(
          "Permiso requerido",
          "Necesitamos permiso de cámara para tomar la evidencia.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: false,
        allowsEditing: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        Alert.alert("Error", "No se pudo obtener la foto.");
        return;
      }

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 850 } }],
        {
          compress: 0.5,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        },
      );

      const fileName = `checkin_${Date.now()}.jpg`;
      const permanentUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: manipulated.uri,
        to: permanentUri,
      });

      const fileInfo = await FileSystem.getInfoAsync(permanentUri);

      if (!fileInfo.exists) {
        Alert.alert(
          "Error",
          "No se pudo guardar la foto en el almacenamiento local.",
        );
        return;
      }

      setCheckinPhotoUri(permanentUri);
      setCheckinPhotoBase64(null);

      console.log("[CHECKIN] Foto guardada localmente:", permanentUri);
    } catch (e) {
      console.log("takeCheckinPhoto ERROR:", e);
      Alert.alert("Error", "No se pudo abrir la cámara o guardar la foto.");
    }
  };

  const postCheckinBulk = async (orderId, base64) => {
    const bulkPayload = buildCheckinBulkPayload({
      orderId,
      base64,
    });

    console.log(
      "[CHECKIN][BULK][URL]",
      WORK_ORDER_BULK_ENDPOINT,
    );

    logBulkPayload(
      "[CHECKIN][BULK][PAYLOAD FINAL]",
      bulkPayload,
    );

    try {
      const response = await api.post(
        WORK_ORDER_BULK_ENDPOINT,
        bulkPayload,
        {
          timeout: 300000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      console.log(
        "[CHECKIN][BULK][RESPUESTA SAP]",
        JSON.stringify(response?.data, null, 2),
      );

      return response;
    } catch (error) {
      console.log(
        "[CHECKIN][BULK][ERROR]",
        JSON.stringify(
          error?.response?.data || {
            message: error?.message,
            code: error?.code,
          },
          null,
          2,
        ),
      );

      throw error;
    }
  };

  const applyLocalOfflineStatus = async (orderId, statusCode = "0100") => {
    const finalStatus = normalizeCode(statusCode) || "0100";

    try {
      await setLocalStatusPatch(userEmail, orderId, finalStatus);
      await patchCacheOrdenesTecnicoList(userEmail, orderId, finalStatus);
      await patchCacheOrdenTecnicoDetail(orderId, finalStatus);

      setAllOrdenes((prev) =>
        (prev || []).map((x) =>
          String(x?.Orderid) === String(orderId)
            ? {
                ...x,
                estatus_code: finalStatus,
                userstatus: finalStatus,
                UserStatus: finalStatus,
                UserStText: finalStatus,
                estatus_label: STATUS_META[finalStatus]?.label || finalStatus,
              }
            : x,
        ),
      );

      console.log("[CHECKIN][STATUS][LOCAL]", {
        orderId,
        finalStatus,
      });
    } catch (e) {
      console.log("[CHECKIN][STATUS][LOCAL] error:", e?.message || e);
    }
  };

  // Sync cola a SAP (foto + estatus)
  const syncCheckinQueue = useCallback(async () => {
    if (!userEmail) return;
    if (syncingRef.current) return;

    const net = await NetInfo.fetch();

    const online = !!(net?.isConnected && net?.isInternetReachable !== false);

    setIsOnline(online);

    if (!online) return;

    syncingRef.current = true;

    try {
      const q = await loadCheckinQueue(userEmail);
      if (!q.length) return;

      const ok = await ensureValidToken();
      if (!ok) return;

      const ordered = [...q].sort(
        (a, b) => (a?.createdAt || 0) - (b?.createdAt || 0),
      );

      for (const item of ordered) {
        const orderId = String(item?.orderId || "").trim();
        const photoUri = String(item?.photoUri || "").trim();

        if (!orderId || !photoUri) {
          await removeFromQueue(userEmail, orderId);
          continue;
        }

        try {
          const b64 = await FileSystem.readAsStringAsync(photoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          console.log("[CHECKIN][SYNC] Enviando:", {
            orderId,
            photoUri,
            b64len: b64.length,
          });

          await postCheckinBulk(orderId, b64);
          await removeFromQueue(userEmail, orderId);

          await FileSystem.deleteAsync(photoUri, { idempotent: true });
        } catch (e) {
          console.log(
            "[CHECKIN][SYNC] Error SAP:",
            orderId,
            e?.response?.data || e?.message || e,
          );
          break;
        }
      }

      const q2 = await loadCheckinQueue(userEmail);
      setCheckinQueue(q2);

      await refreshOrdenes();
    } finally {
      syncingRef.current = false;
    }
  }, [ensureValidToken, refreshOrdenes, userEmail]);

  // Auto-sync cuando regresa internet y hay cola
  useEffect(() => {
    if (isOnline && checkinQueue.length > 0) {
      syncCheckinQueue().catch(() => {});
    }
  }, [isOnline, checkinQueue.length, syncCheckinQueue]);

  const continuarAlDetalleDespuesCheckin = async (orderId) => {
    const id = String(orderId || "").trim();

    if (!id) {
      console.log("[CHECKIN] No hay OrderId para abrir el detalle.");
      return;
    }

    // Cerramos el modal y limpiamos la evidencia temporal del estado.
    setShowCheckinModal(false);
    setCheckinPhotoBase64(null);
    setCheckinPhotoUri(null);

    // Releemos únicamente la caché local para que el detalle
    // reciba inmediatamente el nuevo estatus (0100).
    await reloadOrdenesFromLocal();

    // Abrimos el detalle de la misma orden.
    await irADetalles(id);
  };

  const enviarCheckinCompletoASap = async () => {
    if (!checkinOrderId) {
      Alert.alert("Error", "No hay orden seleccionada.");
      return;
    }

    if (!checkinPhotoUri) {
      Alert.alert("Falta evidencia", "Primero toma una foto.");
      return;
    }

    const orderId = String(checkinOrderId).trim();

    try {
      setIsSending(true);

      const net = await NetInfo.fetch();
      const online = !!(net?.isConnected && net?.isInternetReachable !== false);

      setIsOnline(online);

      if (!online) {
        const offlineStatus = "0100";

        await applyLocalOfflineStatus(orderId, offlineStatus);

        const nextQueue = await enqueueCheckin(userEmail, {
          orderId,
          photoUri: checkinPhotoUri,
          statusCode: offlineStatus,
          lastValidStatus: offlineStatus,
          createdAt: Date.now(),
        });

        setCheckinQueue(nextQueue);

        Alert.alert(
          "Check-in offline",
          "Sin internet. Se guardó el check-in en cola y se enviará automáticamente cuando regrese la conexión ✅",
        );

        await continuarAlDetalleDespuesCheckin(orderId);

        return;
      }

      const ok = await ensureValidToken();
      if (!ok) return;

      const onlineStatus = "0100";

      const base64Data = await FileSystem.readAsStringAsync(checkinPhotoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await postCheckinBulk(orderId, base64Data);
      await applyLocalOfflineStatus(orderId, onlineStatus);

      await FileSystem.deleteAsync(checkinPhotoUri, { idempotent: true });

      Alert.alert(
        "Check-in",
        "Evidencia enviada y estatus actualizado a PENDIENTE",
      );

      await continuarAlDetalleDespuesCheckin(orderId);
    } catch (e) {
      console.log(
        "enviarCheckinCompletoASap ERROR:",
        e?.response?.data || e?.message || e,
      );

      const net2 = await NetInfo.fetch();

      const online2 = !!(
        net2?.isConnected && net2?.isInternetReachable !== false
      );

      if (!online2) {
        const offlineStatus = "0100";

        await applyLocalOfflineStatus(orderId, offlineStatus);

        const nextQueue = await enqueueCheckin(userEmail, {
          orderId,
          photoUri: checkinPhotoUri,
          statusCode: offlineStatus,
          lastValidStatus: offlineStatus,
          createdAt: Date.now(),
        });

        setCheckinQueue(nextQueue);

        Alert.alert(
          "Check-in guardado",
          "Se cayó la conexión. Se guardó en cola y se enviará cuando regrese internet ✅",
        );

        await continuarAlDetalleDespuesCheckin(orderId);

        return;
      }

      Alert.alert(
        "Error SAP",
        "No se pudo completar el check-in (foto/estatus). Revisa logs.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setDateMode("day");
    setDayRef(new Date());
    setWeekStart(null);
    setWeekEnd(null);
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() });
  };

  const getOrderIdDisplay = (item = {}) => {
    const raw = String(item?.Orderid || item?.orderid || "").trim();

    if (!raw) return "";

    return raw.replace(/^0+/, "") || raw;
  };
  const getCoberturaOrden = (item = {}) => {
    const raw = String(
      item?.ShortText ||
        item?.shortText ||
        item?.shorttext ||
        item?.short_text ||
        item?.coverage ||
        item?.cobertura ||
        "",
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
  };

  const renderItem = ({ item }) => {
    const startLabel = formatDateDMY(item.start_date);
    const finishLabel = formatDateDMY(item.finish_date);

    const orderIdDisplay = getOrderIdDisplay(item);

    const coberturaLabel = getCoberturaOrden(item);

    const stBase = resolveUserstatus(
      item?.userstatus ?? "",
      statusCatalogMap,
      item,
    );

    const isPendingOffline = pendingSet.has(String(item?.Orderid));

    const tbmYaProceso = stBase.code === "0200";
    const ordenYaAvanzo = ["0400", "0300", "0600"].includes(stBase.code);

    const st =
      isPendingOffline && !tbmYaProceso && !ordenYaAvanzo
        ? {
            ...stBase,
            code: "0100",
            label: STATUS_META["0100"]?.label || "PENDIENTE",
            type: "pendiente",
            color: STATUS_META["0100"]?.color || "#D64545",
            lockActions: false,
            allowCheckin: false,
          }
        : stBase;

    const showCheckinBtn = st.type === "start" && st.allowCheckin;

    return (
      <Pressable
        style={[
          styles.card,
          { borderLeftColor: st.color },
          st.type === "no_mantto" && styles.cardNoMant,
          st.type === "final" && styles.cardFinished,
        ]}
        onPress={() => irADetalles(item)}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            #{orderIdDisplay}{" "}
            <Text style={styles.cardSubtitle}>• {item.order_type}</Text>
          </Text>

          <View style={[styles.badge, { backgroundColor: `${st.color}1A` }]}>
            <View style={[styles.statusDot, { backgroundColor: st.color }]} />
            <Text style={[styles.badgeText, { color: st.color }]}>
              {st.label}
            </Text>
          </View>
        </View>

        <View style={styles.cardMiddleRow}>
          <Text style={styles.infoText} numberOfLines={1}>
            <Text style={styles.infoStrong}>Eq: </Text>
            {item.equipment || "—"}
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

        {showCheckinBtn && (
          <View style={styles.cardBottomRow} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.boton, { backgroundColor: FIORI.accent }]}
              onPress={(e) => {
                e?.stopPropagation?.();
                abrirModalCheckin(item, item.Orderid);
              }}
            >
              <Text style={styles.botonTexto}>Check-in</Text>
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    );
  };

  const activeRangeText = useMemo(() => {
    if (dateMode === "weekRange") {
      const a = weekStart ? atStartOfDay(weekStart).toLocaleDateString() : "—";
      const b = weekEnd ? atEndOfDay(weekEnd).toLocaleDateString() : "—";
      return `Semana: ${a} → ${b}`;
    }

    if (dateMode === "month") {
      return `${MONTHS[monthYear.month]} ${monthYear.year}`;
    }

    return `Día: ${atStartOfDay(dayRef).toLocaleDateString()}`;
  }, [dateMode, dayRef, weekStart, weekEnd, monthYear]);

  return (
    <View style={styles.container}>
      <Header title="Órdenes asignadas" />

      <View style={styles.filtersWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por #, tipo, equipo, estatus…"
            placeholderTextColor={FIORI.textMuted}
            returnKeyType="search"
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
        </View>

        <View style={styles.rangeSummary}>
          <View style={styles.rangeSummaryMain}>
            <Text style={styles.rangeSummaryLabel}>Periodo seleccionado</Text>
            <Text style={styles.activeRangeText}>{activeRangeText}</Text>
          </View>

          <View style={styles.connectionStatus}>
            <View
              style={[
                styles.connectionDot,
                { backgroundColor: isOnline ? "#16A34A" : "#DC2626" },
              ]}
            />
            <Text style={styles.connectionText}>
              {isOnline ? "Online" : "Offline"}
            </Text>
          </View>
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
            onPress={refreshOrdenes}
            activeOpacity={0.85}
          >
            <Text style={styles.refreshBtnText}>Recargar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.syncBtn,
              checkinQueue.length === 0 && { opacity: 0.55 },
            ]}
            onPress={async () => {
              await refreshQueue();
              await syncCheckinQueue();
            }}
            activeOpacity={0.85}
            disabled={checkinQueue.length === 0}
          >
            <Text style={styles.syncBtnText}>
              {isOnline ? "Sincronizar pendientes" : "Pendientes (sin red)"}{" "}
              {checkinQueue.length ? `(${checkinQueue.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {showDayPicker && (
          <DateTimePicker
            value={dayRef ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android") {
                setShowDayPicker(false);
                if (e.type !== "set") return;
              }

              if (date) setDayRef(date);
              if (Platform.OS === "ios") setShowDayPicker(true);
            }}
          />
        )}

        {showWeekStartPicker && (
          <DateTimePicker
            value={weekStart ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(e, date) => {
              if (Platform.OS === "android") {
                setShowWeekStartPicker(false);
                if (e.type !== "set") return;
              }

              if (date) {
                setWeekStart(date);
                if (Platform.OS !== "ios") setShowWeekEndPicker(true);
              }

              if (Platform.OS === "ios") setShowWeekStartPicker(true);
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
              if (Platform.OS === "android") {
                setShowWeekEndPicker(false);
                if (e.type !== "set") return;
              }

              if (date) setWeekEnd(date);
              if (Platform.OS === "ios") setShowWeekEndPicker(true);
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

      {/* Modal Mes */}
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

      {/* Modal Check-in */}
      <Modal
        visible={showCheckinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCheckinModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 480 }]}>
            <Text style={styles.modalHeaderTitle}>
              Check-in #{checkinOrderId ?? ""}
            </Text>

            <Text style={{ color: FIORI.textMuted, marginBottom: 10 }}>
              Toma una foto de evidencia:
            </Text>

            {checkinPhotoUri ? (
              <View style={{ marginBottom: 12 }}>
                <Image
                  source={{ uri: checkinPhotoUri }}
                  style={{
                    width: "100%",
                    height: 180,
                    borderRadius: 10,
                    backgroundColor: "#EEE",
                  }}
                  resizeMode="cover"
                />

                <Text
                  style={{ marginTop: 6, color: FIORI.textMuted, fontSize: 12 }}
                >
                  Foto guardada localmente ✅
                </Text>
              </View>
            ) : (
              <View
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: FIORI.border,
                  borderRadius: 10,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: FIORI.textMuted }}>
                  Aún no hay foto. Presiona “Tomar foto”.
                </Text>
              </View>
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.neutralBtn }]}
                onPress={() => setShowCheckinModal(false)}
                disabled={isSending}
              >
                <Text style={styles.smallBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.cardSubtle }]}
                onPress={takeCheckinPhoto}
                disabled={isSending}
              >
                <Text style={styles.smallBtnText}>Tomar foto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.accent }]}
                onPress={enviarCheckinCompletoASap}
                disabled={isSending}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  {isSending
                    ? "Procesando..."
                    : isOnline
                      ? "Enviar a SAP"
                      : "Guardar offline"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && allOrdenes.length === 0 ? (
        <ActivityIndicator
          style={{ marginTop: 40 }}
          size="large"
          color={FIORI.accent}
        />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item, idx) => String(item?.Orderid ?? `row-${idx}`)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingTop: 6 }}
          refreshing={refreshing}
          onRefresh={refreshOrdenes}
          ListEmptyComponent={
            <Text
              style={{
                textAlign: "center",
                marginTop: 24,
                color: FIORI.textMuted,
              }}
            >
              No hay órdenes con los filtros actuales.
            </Text>
          }
        />
      )}
    </View>
  );
}

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
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },

  searchRow: {
    flexDirection: "row",
    gap: 8,
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
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },

  syncBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },

  syncBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
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
    paddingHorizontal: 8,
  },

  filterModeButtonActive: {
    backgroundColor: FIORI.accent,
  },

  filterModeText: {
    color: FIORI.textMuted,
    fontWeight: "800",
    fontSize: 12,
  },

  filterModeTextActive: {
    color: "#FFFFFF",
  },

  filterActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },

  rangeSummary: {
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  rangeSummaryMain: {
    flex: 1,
  },

  rangeSummaryLabel: {
    color: FIORI.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  activeRangeText: {
    marginTop: 2,
    color: FIORI.ink,
    fontSize: 12,
    fontWeight: "800",
  },

  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  connectionText: {
    color: FIORI.textMuted,
    fontSize: 11,
    fontWeight: "700",
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
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  smallBtnText: {
    color: FIORI.ink,
    fontWeight: "600",
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

  coverageRow: {
    marginTop: 6,
    backgroundColor: "#F5F7FA",
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
  cardNoMant: {
    backgroundColor: "#F8F9FA",
    borderColor: "#E2E2E2",
  },

  cardFinished: {
    backgroundColor: "#F2FCF5",
    borderColor: "#D3EEDC",
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

  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
    flexWrap: "wrap",
  },

  lockText: {
    color: FIORI.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    flex: 1,
    textAlign: "right",
  },

  boton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  botonTexto: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
  },

  botonSecundario: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: FIORI.accent,
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
    color: "#fff",
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
    color: "#fff",
    fontWeight: "700",
  },

});