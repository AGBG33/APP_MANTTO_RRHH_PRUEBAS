// app/supervisor/averia/[averiaid]/crear-orden-mantto.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  muted: "#9AA5B1",
  danger: "#E74C3C",
  chipBg: "#EAF3FF",
};

const MATERIAL_CATEGORIES = [
  "GRASAS",
  "DIELECTRIC",
  "ACEITE",
  "TRAPO",
  "ESTOPA",
  "BANDAMOTOR",
  "CADENTRACC",
  "FUSIBLE",
  "DEMARESCAL",
  "PEINES",
  "TORNILLESP",
  "BOBINAFREN",
  "CONTACTOR",
  "MICROSWTCH",
  "BUJESESCAL",
  "BOTONPAROS",
];

function elev(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.06 * multiplier,
      shadowRadius: 6 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toIsoLocalFromDate(d) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}
function datePlusDays(hour = 8, minute = 0, plusDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function normActivity(n) {
  const v = Number(n);
  const act = Number.isFinite(v) ? v : 10;
  return String(act).padStart(4, "0");
}

function normItemNumberByIndex(index) {
  // 1->0010, 2->0020, 3->0030...
  return String((index + 1) * 10).padStart(4, "0");
}

/**
 * ✅ Extrae OrderId, Aviso y Oferta del Return:
 * - Orden = MessageV2 (típico IWO_BAPI2/126)
 * - Aviso = MessageV3 (típico IWO_BAPI2/126)
 * - Oferta = desde mensaje "Oferta creada: XXXXX" (típico ZSD/002)
 * - Fallbacks: regex desde Message
 */
function extractOrderFromReturn(dataOrD) {
  const d = dataOrD?.d ? dataOrD.d : dataOrD;

  const returns = d?.Return?.results || d?.ReturnSet?.results || [];
  if (!Array.isArray(returns) || returns.length === 0) {
    return {
      orderId: null,
      notifNo: null,
      offerNo: null,
      offerMessage: null,
      successItem: null,
      offerItem: null,
      errors: [],
      warnings: [],
      message: null,
      successMessages: [],
    };
  }

  const upperType = (x) => String(x?.Type || "").toUpperCase();
  const isSuccess = (r) => upperType(r) === "S";
  const isError = (r) => upperType(r) === "E";
  const isWarning = (r) => upperType(r) === "W" || upperType(r) === "A";

  const errors = returns.filter(isError);
  const warnings = returns.filter(isWarning);

  // ✅ mensajes de éxito (para mostrar en UI si quieres)
  const successMessages = returns
    .filter(isSuccess)
    .map((r) => String(r?.Message || "").trim())
    .filter(Boolean);

  // ✅ renglón típico de creación de orden (OrderId y Aviso)
  const successItem =
    returns.find(
      (r) =>
        isSuccess(r) &&
        String(r?.MessageV2 || "")
          .trim()
          .match(/^\d+$/),
    ) ||
    returns.find(
      (r) =>
        isSuccess(r) &&
        String(r?.Message || "")
          .toLowerCase()
          .includes("se ha grabado con número"),
    ) ||
    returns.find(isSuccess) ||
    null;

  const message = successItem?.Message ? String(successItem.Message) : null;

  let orderId = successItem?.MessageV2
    ? String(successItem.MessageV2).trim()
    : null;
  let notifNo = successItem?.MessageV3
    ? String(successItem.MessageV3).trim()
    : null;

  // ✅ Oferta creada (ZSD o texto "Oferta creada")
  const offerItem =
    returns.find(
      (r) =>
        isSuccess(r) &&
        (String(r?.Id || "").toUpperCase() === "ZSD" ||
          String(r?.Message || "")
            .toLowerCase()
            .includes("oferta creada")),
    ) || null;

  const offerMessage = offerItem?.Message
    ? String(offerItem.Message).trim()
    : null;

  let offerNo = null;
  if (offerMessage) {
    // Caso ideal: "Oferta creada: 0020000114"
    const m = offerMessage.match(/oferta creada:\s*([0-9]+)/i);
    if (m?.[1]) offerNo = m[1];
    // Fallback: primer número largo
    if (!offerNo) {
      const nums = offerMessage.match(/\b\d{6,15}\b/g) || [];
      offerNo = nums[0] || null;
    }
  }

  // Fallback por texto para orderId/notifNo si no vinieron en V2/V3
  if ((!orderId || !notifNo) && message) {
    const numbers = message.match(/\b\d{6,12}\b/g) || [];
    if (!orderId && numbers.length >= 1) orderId = numbers[0];
    if (!notifNo && numbers.length >= 2) notifNo = numbers[1];
  }

  return {
    orderId,
    notifNo,
    offerNo,
    offerMessage,
    successItem,
    offerItem,
    errors,
    warnings,
    message,
    successMessages,
  };
}

/**
 * ✅ Fallback: extrae #orden / #aviso desde sap-message header.
 */
function extractFromSapMessageHeader(headers) {
  const h = headers || {};
  const raw = h["sap-message"] || h["SAP-MESSAGE"] || h["Sap-Message"] || null;
  if (!raw) return { orderId: null, notifNo: null, text: null };

  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const text = String(obj?.message || obj?.msg || obj?.Message || "").trim();
    const nums = text.match(/\b\d{6,12}\b/g) || [];
    return { orderId: nums[0] || null, notifNo: nums[1] || null, text };
  } catch (e) {
    const text = String(raw || "").trim();
    const nums = text.match(/\b\d{6,12}\b/g) || [];
    return { orderId: nums[0] || null, notifNo: nums[1] || null, text };
  }
}

// ✅ TEMP: equipo fijo para BOM (Intrm)
const FIXED_INTRM_FOR_BOM = "MX06GR478NL3-10P";

/** ===================== MODELOS ===================== */
function emptyComponent(itemNumber, planPlant, activity) {
  return {
    ItemNumber: String(itemNumber).padStart(4, "0"),
    Activity: String(activity || "0010").padStart(4, "0"),

    Category: "",
    Materials: [],
    LoadingMaterials: false,

    Material: "",
    RequirementQuantity: "",
    StgeLoc: "",
    Plant: planPlant,

    Trackingno: "03", // normal direct 03

    NotFound: false,
    NotFoundCategories: [],
    LoadingNotFoundCategories: false,
    NotFoundCategory: "",
    NotFoundMaterials: [],
    LoadingNotFoundMaterials: false,

    // ✅ antes era multi; ahora limitamos a 1 (guardado como array de 0/1 para no romper payload)
    MultiSelected: [],
    MultiTrackingno: "02",
  };
}

function emptyOperation(index, planPlant) {
  const activity = normActivity((index + 1) * 10); // 0010,0020...
  return {
    Activity: activity,
    Description: "",
    DurationNormal: "",
    IsExternal: false,
    Components: [emptyComponent("0010", planPlant, activity)],
  };
}

/** ✅ Normaliza operaciones y componentes:
 * - operaciones: 0010,0020,0030...
 * - components ItemNumber: 0010,0020,0030... (en orden)
 * - component Activity siempre igual a la Activity de la operación
 */
function normalizeOpsAndComponents(list, planPlant) {
  return (list || []).map((op, opIdx) => {
    const act = normActivity((opIdx + 1) * 10);
    const comps = (op.Components || []).map((c, ci) => {
      const itemNo = normItemNumberByIndex(ci);
      return {
        ...c,
        Plant: c.Plant || planPlant,
        Activity: act,
        ItemNumber: itemNo,
      };
    });
    return { ...op, Activity: act, Components: comps };
  });
}

export default function CrearOrdenMantto() {
  const { averiaid, notifNo, equipment, MaterialLong, shortText } =
    useLocalSearchParams();

  const [orderType] = useState("SM01");
  const [planPlant] = useState("TLP1");

  // ✅ Fechas como Date (picker), pero se mandan formateadas
  const [startDT, setStartDT] = useState(datePlusDays(8, 0, 0));
  const [finishDT, setFinishDT] = useState(datePlusDays(18, 0, 1));

  // ✅ 1) ShortText de la orden VACÍO por defecto
  const [headerShortText, setHeaderShortText] = useState("");

  // Work centres (técnicos)
  const [workCenters, setWorkCenters] = useState([]);
  const [loadingWorkCenters, setLoadingWorkCenters] = useState(false);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState(null); // { Arbpl, Ktext }

  // ✅ Operaciones con materiales
  const [operations, setOperations] = useState(() =>
    normalizeOpsAndComponents([emptyOperation(0, planPlant)], planPlant),
  );

  const [saving, setSaving] = useState(false);

  // Multi select modal (para un componente de UNA operación)
  const [multiVisible, setMultiVisible] = useState(false);
  const [multiOpIndex, setMultiOpIndex] = useState(-1);
  const [multiCompIndex, setMultiCompIndex] = useState(-1);
  const [multiQuery, setMultiQuery] = useState("");

  // ✅ Picker state (fecha/hora)
  const [dtPickerVisible, setDtPickerVisible] = useState(false);
  const [dtPickerField, setDtPickerField] = useState(null); // "start" | "finish"
  const [dtPickerStep, setDtPickerStep] = useState("date"); // android: "date" -> "time"
  const [dtPickerTemp, setDtPickerTemp] = useState(new Date());

  // ✅ Personas (solo UI por ahora)
  const [peopleCount, setPeopleCount] = useState(null);

  const goBack = () => router.back();

  const startDateStr = useMemo(() => toIsoLocalFromDate(startDT), [startDT]);
  const finishDateStr = useMemo(() => toIsoLocalFromDate(finishDT), [finishDT]);

  const openDateTimePicker = (field) => {
    const current = field === "start" ? startDT : finishDT;
    setDtPickerField(field);
    setDtPickerTemp(new Date(current));
    if (Platform.OS === "android") setDtPickerStep("date");
    setDtPickerVisible(true);
  };

  const applyPickedDateTime = (finalDate) => {
    if (!finalDate || !dtPickerField) return;
    if (dtPickerField === "start") setStartDT(finalDate);
    if (dtPickerField === "finish") setFinishDT(finalDate);
  };

  // ==== Cargar WorkCentreSet ====
  useEffect(() => {
    const fetchWorkCenters = async () => {
      try {
        setLoadingWorkCenters(true);

        const url =
          "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com/api/odata/ZSD_CATALOGOS_SRV/WorkCentreSet?$format=json";

        const res = await fetch(url);
        const json = await res.json();
        const list = json?.d?.results ?? json?.value ?? [];

        const mapped = list.map((it) => ({
          Arbpl: it.Arbpl,
          Ktext: it.Ktext,
        }));

        setWorkCenters(mapped);
      } catch (err) {
        console.error("Error al cargar WorkCentreSet:", err);
        Alert.alert(
          "Catálogo de técnicos",
          "No se pudo cargar la lista de centros de trabajo.",
        );
      } finally {
        setLoadingWorkCenters(false);
      }
    };

    fetchWorkCenters();
  }, []);

  /** ===================== HELPERS OPERACIONES ===================== */
  const updateOperation = (opIndex, field, value) => {
    setOperations((prev) =>
      prev.map((op, i) => (i === opIndex ? { ...op, [field]: value } : op)),
    );
  };

  const addOperation = () => {
    setOperations((prev) => {
      const next = [...prev, emptyOperation(prev.length, planPlant)];
      return normalizeOpsAndComponents(next, planPlant);
    });
  };

  const removeOperation = (opIndex) => {
    setOperations((prev) => {
      if (prev.length === 1) {
        Alert.alert(
          "No permitido",
          "La orden debe tener al menos una operación.",
        );
        return prev;
      }
      const next = prev.filter((_, i) => i !== opIndex);
      return normalizeOpsAndComponents(next, planPlant);
    });
  };

  /** ===================== HELPERS COMPONENTES POR OPERACIÓN ===================== */
  const updateComponent = (opIndex, compIndex, field, value) => {
    setOperations((prev) => {
      const next = prev.map((op, i) => {
        if (i !== opIndex) return op;
        const comps = (op.Components || []).map((c, j) =>
          j === compIndex ? { ...c, [field]: value } : c,
        );
        return { ...op, Components: comps };
      });
      return normalizeOpsAndComponents(next, planPlant);
    });
  };

  const addComponentToOp = (opIndex) => {
    setOperations((prev) => {
      const next = prev.map((op, i) => {
        if (i !== opIndex) return op;
        const newComp = emptyComponent("0010", planPlant, op.Activity);
        return { ...op, Components: [...(op.Components || []), newComp] };
      });
      return normalizeOpsAndComponents(next, planPlant);
    });
  };

  const removeComponentFromOp = (opIndex, compIndex) => {
    setOperations((prev) => {
      const next = prev.map((op, i) => {
        if (i !== opIndex) return op;
        const comps = op.Components || [];
        if (comps.length === 1) {
          Alert.alert(
            "No permitido",
            "Debe haber al menos un componente por operación.",
          );
          return op;
        }
        return { ...op, Components: comps.filter((_, j) => j !== compIndex) };
      });
      return normalizeOpsAndComponents(next, planPlant);
    });
  };

  /** ============================
   *  ✅ NOT FOUND: Categorías + BOM
   *  ============================ */
  const fetchNotFoundCategories = async () => {
    const url = "/api/odata/ZSD_CATALOGOS_SRV/CategoriaManttoSet?$format=json";
    console.log("[CategoriaManttoSet] GET", url);

    const res = await api.get(url, { headers: { Accept: "application/json" } });
    const data = res?.data?.d?.results ?? res?.data?.value ?? [];
    console.log("[CategoriaManttoSet] rows:", data.length);

    const mapped = data
      .map((x) => {
        const desc = String(x?.Descripcion ?? x?.DESCRIPCION ?? "").trim();
        return {
          Id: String(x?.Id ?? x?.ID ?? "").trim(),
          Zeinr: desc,
          Texto: desc,
        };
      })
      .filter((x) => !!x.Zeinr);

    const uniq = new Map();
    for (const it of mapped) if (!uniq.has(it.Zeinr)) uniq.set(it.Zeinr, it);
    return Array.from(uniq.values());
  };

  const fetchNotFoundBomItems = async ({ equipmentIntrm, zeinr }) => {
    const eq = FIXED_INTRM_FOR_BOM;
    const cat = String(zeinr || "").trim();
    if (!eq || !cat) return [];

    const filterRaw = `Intrm eq '${eq}' and Zeinr eq '${cat}'`;
    console.log("[BomItemsSet] filter:", filterRaw);

    const url =
      "/api/odata/ZCS_GET_BOM_MATERIAL_SRV/BomItemsSet" +
      `?$filter=${encodeURIComponent(filterRaw)}` +
      "&$format=json";

    const res = await api.get(url, { headers: { Accept: "application/json" } });
    const data = res?.data?.d?.results ?? res?.data?.value ?? [];

    const mappedRaw = data.map((x) => ({
      Idnrk: String(x?.Idnrk ?? x?.IDNRK ?? "").trim(),
      Ojtxp: String(x?.Ojtxp ?? x?.OJTXP ?? "").trim(),
    }));

    const uniq = new Map();
    for (const it of mappedRaw) {
      if (!it.Idnrk) continue;
      if (!uniq.has(it.Idnrk)) uniq.set(it.Idnrk, it);
    }
    return Array.from(uniq.values());
  };

  const ensureNotFoundCategories = async (opIndex, compIndex) => {
    updateComponent(opIndex, compIndex, "LoadingNotFoundCategories", true);

    try {
      const cats = await fetchNotFoundCategories();
      setOperations((prev) => {
        const next = prev.map((op, i) => {
          if (i !== opIndex) return op;
          const comps = (op.Components || []).map((c, j) => {
            if (j !== compIndex) return c;
            return {
              ...c,
              NotFoundCategories: cats,
              LoadingNotFoundCategories: false,
            };
          });
          return { ...op, Components: comps };
        });
        return normalizeOpsAndComponents(next, planPlant);
      });
    } catch (e) {
      console.error("Error CategoriaManttoSet:", e);
      Alert.alert(
        "Categorías",
        "No se pudieron cargar las categorías de mantenimiento.",
      );
      updateComponent(opIndex, compIndex, "LoadingNotFoundCategories", false);
    }
  };

  const loadNotFoundMaterialsByCategory = async (
    opIndex,
    compIndex,
    zeinrDescripcion,
  ) => {
    const intrm = FIXED_INTRM_FOR_BOM;
    const zeinr = String(zeinrDescripcion || "").trim();

    setOperations((prev) => {
      const next = prev.map((op, i) => {
        if (i !== opIndex) return op;
        const comps = (op.Components || []).map((c, j) => {
          if (j !== compIndex) return c;
          return {
            ...c,
            NotFoundCategory: zeinr,
            LoadingNotFoundMaterials: true,
            NotFoundMaterials: [],
            MultiSelected: [], // ✅ solo 1 permitido, arrancamos limpio
          };
        });
        return { ...op, Components: comps };
      });
      return normalizeOpsAndComponents(next, planPlant);
    });

    try {
      const mats = await fetchNotFoundBomItems({
        equipmentIntrm: intrm,
        zeinr,
      });
      setOperations((prev) => {
        const next = prev.map((op, i) => {
          if (i !== opIndex) return op;
          const comps = (op.Components || []).map((c, j) => {
            if (j !== compIndex) return c;
            return {
              ...c,
              NotFoundMaterials: mats,
              LoadingNotFoundMaterials: false,
            };
          });
          return { ...op, Components: comps };
        });
        return normalizeOpsAndComponents(next, planPlant);
      });
    } catch (e) {
      console.error("Error BomItemsSet:", e);
      Alert.alert(
        "Materiales",
        "No se pudieron cargar los materiales por BOM.",
      );
      setOperations((prev) => {
        const next = prev.map((op, i) => {
          if (i !== opIndex) return op;
          const comps = (op.Components || []).map((c, j) => {
            if (j !== compIndex) return c;
            return { ...c, LoadingNotFoundMaterials: false };
          });
          return { ...op, Components: comps };
        });
        return normalizeOpsAndComponents(next, planPlant);
      });
    }
  };

  const openMultiSelect = async (opIndex, compIndex, forceNotFound = false) => {
    setMultiOpIndex(opIndex);
    setMultiCompIndex(compIndex);
    setMultiQuery("");
    setMultiVisible(true);

    if (forceNotFound) {
      await ensureNotFoundCategories(opIndex, compIndex);
      return;
    }

    const current = operations?.[opIndex]?.Components?.[compIndex];
    if (current?.NotFound && !(current?.NotFoundCategories || []).length) {
      await ensureNotFoundCategories(opIndex, compIndex);
    }
  };

  // ==== Cargar materiales por categoría (COBERTURA) ====
  const handleCategoryChangeForComponent = async (
    opIndex,
    compIndex,
    category,
  ) => {
    const op = operations[opIndex];
    if (!op) return;

    if (!category) {
      setOperations((prev) => {
        const next = prev.map((o, i) => {
          if (i !== opIndex) return o;
          const comps = (o.Components || []).map((c, j) => {
            if (j !== compIndex) return c;
            return {
              ...c,
              Category: "",
              Materials: [],
              Material: "",
              LoadingMaterials: false,
              MultiSelected: [],
              MultiTrackingno: "02",
            };
          });
          return { ...o, Components: comps };
        });
        return normalizeOpsAndComponents(next, planPlant);
      });
      return;
    }

    // set loading
    setOperations((prev) => {
      const next = prev.map((o, i) => {
        if (i !== opIndex) return o;
        const comps = (o.Components || []).map((c, j) => {
          if (j !== compIndex) return c;
          return {
            ...c,
            Category: category,
            Materials: [],
            Material: "",
            LoadingMaterials: true,
          };
        });
        return { ...o, Components: comps };
      });
      return normalizeOpsAndComponents(next, planPlant);
    });

    try {
      const baseUrl =
        "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet";
      const url =
        baseUrl +
        `?$filter=Agrupador1 eq 'BASICO' and Agrupador2 eq '${category}'&$format=json`;

      const res = await fetch(encodeURI(url));
      const json = await res.json();
      const list = json?.d?.results ?? json?.value ?? [];

      const mappedRaw = list.map((m) => ({
        Id: m.Id,
        Material: String(m.Material || "").trim(),
        Descripcion: String(m.Descripcion || "").trim(),
      }));

      const uniqMap = new Map();
      for (const it of mappedRaw) {
        if (!it.Material) continue;
        if (!uniqMap.has(it.Material)) uniqMap.set(it.Material, it);
      }
      const mapped = Array.from(uniqMap.values());

      setOperations((prev) => {
        const next = prev.map((o, i) => {
          if (i !== opIndex) return o;
          const comps = (o.Components || []).map((c, j) => {
            if (j !== compIndex) return c;
            return { ...c, Materials: mapped, LoadingMaterials: false };
          });
          return { ...o, Components: comps };
        });
        return normalizeOpsAndComponents(next, planPlant);
      });
    } catch (err) {
      console.error("Error al cargar MaterialesCoberturaSet:", err);
      Alert.alert("Catálogo de materiales", "No se pudo cargar el catálogo.");
      setOperations((prev) => {
        const next = prev.map((o, i) => {
          if (i !== opIndex) return o;
          const comps = (o.Components || []).map((c, j) => {
            if (j !== compIndex) return c;
            return { ...c, LoadingMaterials: false };
          });
          return { ...o, Components: comps };
        });
        return normalizeOpsAndComponents(next, planPlant);
      });
    }
  };

  /** ===================== VALIDACIONES Y GUARDADO ===================== */
  const onGuardar = async () => {
    if (!selectedWorkCenter) {
      Alert.alert(
        "Centro de trabajo",
        "Debes seleccionar un técnico (MnWkCtr).",
      );
      return;
    }
    if (!String(headerShortText || "").trim()) {
      Alert.alert("Descripción corta", "Captura el ShortText.");
      return;
    }

    // ✅ operaciones válidas: activity + desc + dur numérica
    const opsValidas = operations
      .map((op) => ({
        ...op,
        Activity: String(op.Activity || "").padStart(4, "0"),
        Description: String(op.Description || "").trim(),
        DurationNormal: String(op.DurationNormal || "").trim(),
      }))
      .filter((op) => {
        const dur = Number(op.DurationNormal);
        return (
          /^\d{4}$/.test(op.Activity) &&
          !!op.Description &&
          !!op.DurationNormal &&
          Number.isFinite(dur) &&
          dur > 0
        );
      });

    if (!opsValidas.length) {
      Alert.alert(
        "Operaciones",
        "Debes capturar al menos una operación válida (descripción + duración > 0).",
      );
      return;
    }

    const workCntrValue = String(selectedWorkCenter.Arbpl || "").trim();
    const planPlantValue = String(planPlant).trim();

    // ✅ Components payload: ligado a cada operación por Activity
    const componentItems = [];
    opsValidas.forEach((op) => {
      const opActivity = String(op.Activity).padStart(4, "0");

      (op.Components || []).forEach((c) => {
        const stge = String(c.StgeLoc || "").trim();
        const qty = String(c.RequirementQuantity || "").trim();

        const hasSomething =
          String(c.Material || "").trim() ||
          String(qty || "").trim() ||
          String(stge || "").trim() ||
          String(c.Category || "").trim() ||
          (c.NotFound && (c.MultiSelected || []).length > 0);

        if (!hasSomething) return;

        if (c.NotFound) {
          const tracking = String(c.MultiTrackingno || "02").trim();
          const sel = (c.MultiSelected || [])[0]; // ✅ solo 1
          if (!sel?.Material) return;

          componentItems.push({
            ItemNumber: String(c.ItemNumber || "").padStart(4, "0"),
            Material: String(sel.Material || "").trim(),
            RequirementQuantity: qty,
            StgeLoc: stge,
            Plant: planPlantValue,
            Activity: opActivity,
            Trackingno: tracking,
          });
          return;
        }

        // Normal (un material)
        componentItems.push({
          ItemNumber: String(c.ItemNumber || "").padStart(4, "0"),
          Material: String(c.Material || "").trim(),
          RequirementQuantity: qty,
          StgeLoc: stge,
          Plant: planPlantValue,
          Activity: opActivity,
          Trackingno: String(c.Trackingno || "03").trim(),
        });
      });
    });

    const notifOriginal = String(notifNo || averiaid || "").trim();
    const numPeople =
      Number.isFinite(Number(peopleCount)) && Number(peopleCount) > 0
        ? Number(peopleCount)
        : 1; // default si no seleccionan

    const payload = {
      WorkOrderHeader: {
        OrderType: String(orderType).trim(),
        Planplant: planPlantValue,
        MnWkCtr: workCntrValue,
        Equipment: String(equipment || "").trim(),
        ShortText: String(headerShortText || "").trim(),
        StartDate: String(startDateStr).trim(),
        FinishDate: String(finishDateStr).trim(),
        NotifNo: notifOriginal,
      },
      WorkOrderOperationSet: opsValidas.map((op) => {
        const base = {
          Activity: String(op.Activity || "").padStart(4, "0"),
          WorkCntr: workCntrValue,
          Plant: planPlantValue,
          Description: String(op.Description || "").trim(),

          // ✅ horas por persona (como tu ejemplo)
          DurationNormal: String(op.DurationNormal || "").trim(),

          // ✅ número de personas asignadas (como tu ejemplo)
          NumberOfCapacities: String(numPeople),
        };

        if (op.IsExternal) base.ControlKey = "X";
        return base;
      }),
      WorkOrderComponentSet: componentItems,
      Return: [],
    };

    try {
      setSaving(true);

      console.log("[CREATE WO] payload:", JSON.stringify(payload, null, 2));

      const url = "/api/odata/ZCS_CREATE_WORKORDER_SRV_02/WorkOrderSet";
      console.log("[CREATE WO] NotifNo usado:", notifOriginal);

      const res = await api.post(url, payload, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      console.log(
        "[CREATE WO] create response:",
        JSON.stringify(res.data, null, 2),
      );
      console.log(
        "[CREATE WO] response headers keys:",
        Object.keys(res.headers || {}),
      );

      // ✅ 1) Intentar Return inline
      const parsed = extractOrderFromReturn(res?.data);
      let orderId = parsed?.orderId || null;
      let avisoCreado = parsed?.notifNo || null;
      let ofertaNo = parsed?.offerNo || null;
      let ofertaMsg = parsed?.offerMessage || null;

      // ✅ 2) Fallback: sap-message
      if (!orderId) {
        const fromHeader = extractFromSapMessageHeader(res?.headers);
        if (fromHeader?.text)
          console.log("[CREATE WO] sap-message parsed:", fromHeader.text);
        orderId = fromHeader.orderId || orderId;
        avisoCreado = fromHeader.notifNo || avisoCreado;
      }

      const errors = parsed?.errors || [];
      const avisoOriginal = String(notifNo || averiaid || "").trim();

      if (errors.length && !orderId) {
        const errText = errors
          .map((e) => `• ${e?.Message || "Error SAP"}`)
          .join("\n");
        Alert.alert("Error SAP", errText || "Error al crear la orden.");
        return;
      }

      const baseMsg = orderId
        ? `✅ Orden creada: ${orderId}
        📌 Aviso original: ${avisoOriginal || "—"}
        📩 Aviso SAP (retorno): ${avisoCreado || "—"}
        💰 Oferta: ${ofertaNo ? ofertaNo : "—"}${ofertaMsg ? `\n🧾 ${ofertaMsg}` : ""}`
        : "✅ Orden creada (no pude leer el número desde Return/sap-message).";

      Alert.alert("Orden creada", baseMsg, [
        { text: "OK", onPress: () => router.replace("/supervisor/averia") },
      ]);
    } catch (err) {
      console.error(
        "Error al crear orden de mantenimiento:",
        err?.response?.data || err,
      );

      const sapMsg =
        err?.response?.data?.error?.message?.value ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "No se pudo crear la orden.";

      Alert.alert("Error", String(sapMsg));
    } finally {
      setSaving(false);
    }
  };

  /** ===================== RENDER ===================== */
  return (
    <View style={styles.container}>
      <Header title="Crear orden de mantenimiento" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={goBack}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver al aviso</Text>
        </TouchableOpacity>

        <View style={styles.cardHighlight}>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={COLORS.accent}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.chipText}>Aviso {notifNo || averiaid}</Text>
            </View>

            {equipment ? (
              <View style={styles.chip}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={14}
                  color={COLORS.accent}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.chipText}>{equipment}</Text>
              </View>
            ) : null}
          </View>

          {shortText ? (
            <Text style={styles.mainTitle}>{shortText}</Text>
          ) : (
            <Text style={styles.mainTitleMuted}>
              Sin descripción corta en el aviso
            </Text>
          )}

          <View style={styles.block}>
            <Text style={styles.infoLabel}>Ubicación funcional</Text>
            <Text style={styles.infoValue}>{MaterialLong || "—"}</Text>
          </View>
        </View>

        {/* Datos de la orden */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos de la orden</Text>

          <View style={styles.chipRow}>
            <View style={styles.chipSmall}>
              <Text style={styles.chipTextSmall}>OrderType: {orderType}</Text>
            </View>
            <View style={styles.chipSmall}>
              <Text style={styles.chipTextSmall}>Planplant: {planPlant}</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, marginBottom: 14 }}>
            <Text style={styles.fieldLabel}>Descripción corta de la orden</Text>
            <TextInput
              style={[
                styles.input,
                { minHeight: 60, textAlignVertical: "top" },
              ]}
              value={headerShortText}
              onChangeText={setHeaderShortText}
              placeholder="Escribe aquí la descripción corta (Supervisor)..."
              placeholderTextColor={COLORS.muted}
              multiline
            />
          </View>

          <Text style={styles.fieldLabel}>Técnico asignado</Text>
          {loadingWorkCenters ? (
            <View style={{ paddingVertical: 8 }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : (
            <SelectWorkCenter
              items={workCenters}
              selected={selectedWorkCenter}
              onSelect={setSelectedWorkCenter}
            />
          )}

          {/* ✅ Fechas con selector */}
          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <Text style={styles.fieldLabel}>Fecha inicio</Text>
              <TouchableOpacity
                style={[styles.input, styles.multiInput]}
                onPress={() => openDateTimePicker("start")}
                activeOpacity={0.75}
              >
                <Text
                  style={{ fontSize: 13, color: COLORS.title }}
                  numberOfLines={1}
                >
                  {startDateStr}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.dateCol}>
              <Text style={styles.fieldLabel}>Fecha fin</Text>
              <TouchableOpacity
                style={[styles.input, styles.multiInput]}
                onPress={() => openDateTimePicker("finish")}
                activeOpacity={0.75}
              >
                <Text
                  style={{ fontSize: 13, color: COLORS.title }}
                  numberOfLines={1}
                >
                  {finishDateStr}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.helpText}>
            Se enviará en formato:{" "}
            <Text style={{ fontWeight: "700" }}>YYYY-MM-DDTHH:mm:ss</Text>
          </Text>
        </View>

        {/* ✅ Operaciones + Materiales ligados */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Operaciones + materiales</Text>
          <Text style={styles.sectionSubtitle}>
            Captura cada operación y dentro agrega los materiales de esa
            operación.
          </Text>

          {operations.map((op, opIndex) => (
            <View key={`${opIndex}-${op.Activity}`} style={styles.opCard}>
              <View style={styles.opHeader}>
                <Text style={styles.opTitle}>
                  Operación {opIndex + 1} · Actividad {op.Activity}
                </Text>
                {operations.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeOperation(opIndex)}
                    style={styles.opDeleteBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={COLORS.danger}
                    />
                  </TouchableOpacity>
                )}
              </View>

              <Row label="Actividad" value={op.Activity} />

              <Text style={styles.fieldLabel}>Tipo de operación</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleChip,
                    !op.IsExternal && styles.toggleChipActive,
                  ]}
                  onPress={() => updateOperation(opIndex, "IsExternal", false)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      !op.IsExternal && styles.toggleTextActive,
                    ]}
                  >
                    Interna
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.toggleChip,
                    op.IsExternal && styles.toggleChipActive,
                  ]}
                  onPress={() => updateOperation(opIndex, "IsExternal", true)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      op.IsExternal && styles.toggleTextActive,
                    ]}
                  >
                    Externa
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>
                  Descripción de la actividad
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { minHeight: 60, textAlignVertical: "top" },
                  ]}
                  value={op.Description}
                  onChangeText={(txt) =>
                    updateOperation(opIndex, "Description", txt)
                  }
                  placeholder="Describe la actividad de mantenimiento..."
                  placeholderTextColor={COLORS.muted}
                  multiline
                />
              </View>

              <Field
                label="Duración (horas)"
                value={op.DurationNormal}
                onChangeText={(txt) =>
                  updateOperation(
                    opIndex,
                    "DurationNormal",
                    String(txt || "").replace(/[^0-9.]/g, ""),
                  )
                }
                placeholder="Ej. 2"
                keyboardType="numeric"
              />

              {/* ===== Materiales de esta operación ===== */}
              <Text
                style={[styles.sectionTitle, { marginTop: 6, fontSize: 13 }]}
              >
                Materiales de la operación {op.Activity}
              </Text>
              <Text style={[styles.sectionSubtitle, { marginBottom: 8 }]}>
                Cada material se enviará con Activity = {op.Activity}.
              </Text>

              {(op.Components || []).map((c, compIndex) => {
                const notFoundSelected = (c.MultiSelected || [])[0] || null;

                return (
                  <View
                    key={`${opIndex}-${compIndex}-${c.ItemNumber}`}
                    style={[
                      styles.materialCard,
                      compIndex > 0 && styles.materialCardSpaced,
                    ]}
                  >
                    <View style={styles.opHeader}>
                      <Text style={styles.opTitle}>
                        Material {compIndex + 1} · Item {c.ItemNumber}
                      </Text>
                      {op.Components.length > 1 && (
                        <TouchableOpacity
                          onPress={() =>
                            removeComponentFromOp(opIndex, compIndex)
                          }
                          style={styles.opDeleteBtn}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={COLORS.danger}
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* ✅ (CAMBIO) Toggle “Material no encontrado” SIEMPRE visible */}
                    <TouchableOpacity
                      style={styles.notFoundRow}
                      onPress={async () => {
                        const next = !c.NotFound;

                        setOperations((prev) => {
                          const nextOps = prev.map((o, oi) => {
                            if (oi !== opIndex) return o;
                            const comps = (o.Components || []).map((cc, ci) => {
                              if (ci !== compIndex) return cc;

                              if (next) {
                                // Cambia a BOM: limpia catálogo + limpia BOM + abre selector
                                return {
                                  ...cc,
                                  NotFound: true,
                                  // limpia catálogo
                                  Material: "",
                                  Category: "",
                                  Materials: [],
                                  LoadingMaterials: false,
                                  // limpia BOM
                                  NotFoundCategory: "",
                                  NotFoundMaterials: [],
                                  MultiSelected: [],
                                  MultiTrackingno: "02",
                                };
                              }

                              // Regresa a catálogo: limpia BOM (y deja catálogo listo para elegir de nuevo)
                              return {
                                ...cc,
                                NotFound: false,
                                // limpia BOM
                                NotFoundCategory: "",
                                NotFoundMaterials: [],
                                MultiSelected: [],
                                MultiTrackingno: "02",
                              };
                            });
                            return { ...o, Components: comps };
                          });
                          return normalizeOpsAndComponents(nextOps, planPlant);
                        });

                        if (next) {
                          await openMultiSelect(opIndex, compIndex, true);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          c.NotFound && styles.checkboxChecked,
                        ]}
                      >
                        {c.NotFound && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.notFoundTitle}>
                          {c.NotFound
                            ? "Material BOM activo"
                            : "¿No encuentras el material?"}
                        </Text>
                        <Text style={styles.notFoundSubtitle}>
                          {c.NotFound
                            ? "Toca aquí para volver a catálogo"
                            : "Buscar material desde BOM por categoría"}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* ✅ Si NO es NotFound: muestra categorías + material normal */}
                    {!c.NotFound && (
                      <>
                        <Text style={styles.fieldLabel}>
                          Categoría de material
                        </Text>
                        <View style={styles.categoryRow}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                          >
                            <View style={styles.categoryChipsWrapper}>
                              {MATERIAL_CATEGORIES.map((cat) => {
                                const active = c.Category === cat;
                                return (
                                  <TouchableOpacity
                                    key={cat}
                                    style={[
                                      styles.categoryChip,
                                      active && styles.categoryChipActive,
                                    ]}
                                    onPress={() =>
                                      handleCategoryChangeForComponent(
                                        opIndex,
                                        compIndex,
                                        cat,
                                      )
                                    }
                                    activeOpacity={0.8}
                                  >
                                    <Text
                                      style={[
                                        styles.categoryChipText,
                                        active && styles.categoryChipTextActive,
                                      ]}
                                    >
                                      {cat}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>

                        {c.LoadingMaterials && (
                          <View style={{ paddingVertical: 4 }}>
                            <ActivityIndicator color={COLORS.accent} />
                          </View>
                        )}

                        <View style={{ marginBottom: 10 }}>
                          <Text style={styles.fieldLabel}>Material</Text>
                          <SelectMaterial
                            items={c.Materials || []}
                            value={c.Material}
                            onSelect={(materialCode) =>
                              updateComponent(
                                opIndex,
                                compIndex,
                                "Material",
                                materialCode,
                              )
                            }
                            disabled={!c.Category || c.LoadingMaterials}
                          />
                        </View>

                        <Text style={styles.fieldLabel}>Tipo de material</Text>
                        <View style={styles.toggleRow}>
                          <TouchableOpacity
                            style={[
                              styles.toggleChip,
                              c.Trackingno === "03" && styles.toggleChipActive,
                            ]}
                            onPress={() =>
                              updateComponent(
                                opIndex,
                                compIndex,
                                "Trackingno",
                                "03",
                              )
                            }
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                c.Trackingno === "03" &&
                                  styles.toggleTextActive,
                              ]}
                            >
                              Directo
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.toggleChip,
                              c.Trackingno === "02" && styles.toggleChipActive,
                            ]}
                            onPress={() =>
                              updateComponent(
                                opIndex,
                                compIndex,
                                "Trackingno",
                                "02",
                              )
                            }
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                c.Trackingno === "02" &&
                                  styles.toggleTextActive,
                              ]}
                            >
                              Préstamo / Falla
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}

                    {/* ✅ Si ES NotFound: selección BOM (solo 1) + mostrar seleccionado */}
                    {c.NotFound && (
                      <>
                        <TouchableOpacity
                          style={[
                            styles.btnMini,
                            { opacity: c.LoadingNotFoundCategories ? 0.7 : 1 },
                          ]}
                          onPress={() =>
                            openMultiSelect(opIndex, compIndex, false)
                          }
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name="list-outline"
                            size={16}
                            color={COLORS.accent}
                          />
                          <Text style={styles.btnMiniText}>
                            {notFoundSelected
                              ? "Cambiar material BOM"
                              : "Seleccionar material BOM"}
                          </Text>
                        </TouchableOpacity>

                        {!!notFoundSelected && (
                          <View
                            style={{
                              marginTop: 8,
                              padding: 10,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                              borderRadius: 12,
                              backgroundColor: "#FAFBFF",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                color: COLORS.muted,
                                marginBottom: 4,
                              }}
                            >
                              Seleccionado:
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color: COLORS.title,
                                fontWeight: "800",
                              }}
                            >
                              {notFoundSelected.Descripcion || "—"}
                            </Text>
                            <Text style={{ fontSize: 12, color: COLORS.text }}>
                              {notFoundSelected.Material || "—"}
                            </Text>
                          </View>
                        )}

                        <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                          Tipo para “no encontrado”
                        </Text>
                        <View style={styles.toggleRow}>
                          <TouchableOpacity
                            style={[
                              styles.toggleChip,
                              c.MultiTrackingno === "02" &&
                                styles.toggleChipActive,
                            ]}
                            onPress={() =>
                              updateComponent(
                                opIndex,
                                compIndex,
                                "MultiTrackingno",
                                "02",
                              )
                            }
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                c.MultiTrackingno === "02" &&
                                  styles.toggleTextActive,
                              ]}
                            >
                              Préstamo
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.toggleChip,
                              c.MultiTrackingno === "01" &&
                                styles.toggleChipActive,
                            ]}
                            onPress={() =>
                              updateComponent(
                                opIndex,
                                compIndex,
                                "MultiTrackingno",
                                "01",
                              )
                            }
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                c.MultiTrackingno === "01" &&
                                  styles.toggleTextActive,
                              ]}
                            >
                              Oferta
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.smallBtn,
                            {
                              alignSelf: "flex-start",
                              marginBottom: 8,
                              backgroundColor: COLORS.cardBg,
                            },
                          ]}
                          onPress={() =>
                            updateComponent(
                              opIndex,
                              compIndex,
                              "MultiSelected",
                              [],
                            )
                          }
                        >
                          <Text style={styles.smallBtnText}>
                            Quitar selección
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <Field
                      label="Cantidad requerida"
                      value={c.RequirementQuantity}
                      onChangeText={(txt) =>
                        updateComponent(
                          opIndex,
                          compIndex,
                          "RequirementQuantity",
                          String(txt || "").replace(/[^0-9.]/g, ""),
                        )
                      }
                      placeholder="Ej. 2"
                      keyboardType="numeric"
                    />

                    <Field
                      label="Almacén"
                      value={c.StgeLoc}
                      onChangeText={(txt) =>
                        updateComponent(opIndex, compIndex, "StgeLoc", txt)
                      }
                      placeholder="BHER"
                    />
                  </View>
                );
              })}
              <View style={styles.operationDivider} />

              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => addComponentToOp(opIndex)}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={COLORS.accent}
                />
                <Text style={styles.btnSecondaryText}>
                  Agregar material a esta operación
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.btnSecondary} onPress={addOperation}>
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={COLORS.accent}
            />
            <Text style={styles.btnSecondaryText}>Agregar operación</Text>
          </TouchableOpacity>
        </View>

        {/* ✅ Personas (solo UI por ahora) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Asignación</Text>
          <Text style={styles.sectionSubtitle}>
            Selecciona cuántas personas se asignarán (por ahora solo se
            muestra).
          </Text>

          <SelectNumber
            label="Seleccione el número de personas que se asignarán"
            value={peopleCount}
            min={1}
            max={20}
            onSelect={setPeopleCount}
          />
        </View>

        {/* Guardar */}
        <Pressable
          android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          style={({ pressed }) => [
            styles.btnPrimary,
            pressed && styles.btnPrimaryPressed,
            saving && styles.btnPrimaryDisabled,
          ]}
          onPress={onGuardar}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.btnPrimaryContent}>
              <Ionicons
                name="save-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.btnPrimaryText}>
                Crear orden de mantenimiento
              </Text>
            </View>
          )}
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ===== Modal MultiSelect (NotFound) ===== */}
      <Modal
        visible={multiVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMultiVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar material BOM</Text>
              <TouchableOpacity
                onPress={() => setMultiVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12, paddingBottom: 6 }}>
              <View
                style={[
                  styles.input,
                  { flexDirection: "row", alignItems: "center", gap: 8 },
                ]}
              >
                <Ionicons name="search" size={16} color={COLORS.muted} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: COLORS.title }}
                  value={multiQuery}
                  onChangeText={setMultiQuery}
                  placeholder="Buscar..."
                  placeholderTextColor={COLORS.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {!!multiQuery && (
                  <TouchableOpacity
                    onPress={() => setMultiQuery("")}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            >
              {(() => {
                const op = operations[multiOpIndex] || {};
                const c = (op.Components || [])[multiCompIndex] || {};
                const q = String(multiQuery || "")
                  .trim()
                  .toLowerCase();

                if (!c.NotFound) {
                  return (
                    <View
                      style={{ paddingHorizontal: 14, paddingVertical: 10 }}
                    >
                      <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                        Este selector es solo para “Material no encontrado
                        (BOM)”.
                      </Text>
                    </View>
                  );
                }

                const cats = c.NotFoundCategories || [];
                const zeinr = String(c.NotFoundCategory || "").trim();

                // Paso 1: elegir categoría
                if (!zeinr) {
                  if (c.LoadingNotFoundCategories) {
                    return (
                      <View style={{ paddingVertical: 16 }}>
                        <ActivityIndicator color={COLORS.accent} />
                      </View>
                    );
                  }

                  const filteredCats = !q
                    ? cats
                    : cats.filter((x) =>
                        `${x.Texto || ""} ${x.Zeinr || ""}`
                          .toLowerCase()
                          .includes(q),
                      );

                  if (!filteredCats.length) {
                    return (
                      <View
                        style={{ paddingHorizontal: 14, paddingVertical: 10 }}
                      >
                        <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                          No hay categorías (o no hay resultados con esa
                          búsqueda).
                        </Text>
                        <TouchableOpacity
                          style={[styles.btnMini, { marginTop: 10 }]}
                          onPress={() =>
                            ensureNotFoundCategories(
                              multiOpIndex,
                              multiCompIndex,
                            )
                          }
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name="refresh"
                            size={16}
                            color={COLORS.accent}
                          />
                          <Text style={styles.btnMiniText}>Reintentar</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  return filteredCats.map((cat, idx) => {
                    const key = `${cat.Zeinr}-${idx}`;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.workerRow}
                        onPress={() =>
                          loadNotFoundMaterialsByCategory(
                            multiOpIndex,
                            multiCompIndex,
                            cat.Zeinr,
                          )
                        }
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, { opacity: 0.6 }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.workerName}>
                            {cat.Texto || cat.Zeinr}
                          </Text>
                          <Text style={styles.materialCodeText}>
                            {cat.Zeinr}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={COLORS.muted}
                        />
                      </TouchableOpacity>
                    );
                  });
                }

                // Paso 2: elegir materiales BOM (✅ solo 1)
                const list = c.NotFoundMaterials || [];

                if (c.LoadingNotFoundMaterials) {
                  return (
                    <View style={{ paddingVertical: 16 }}>
                      <ActivityIndicator color={COLORS.accent} />
                    </View>
                  );
                }

                if (!list.length) {
                  return (
                    <View
                      style={{ paddingHorizontal: 14, paddingVertical: 10 }}
                    >
                      <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                        No hay materiales BOM para: {zeinr}
                      </Text>

                      <View
                        style={{ flexDirection: "row", gap: 10, marginTop: 10 }}
                      >
                        <TouchableOpacity
                          style={[
                            styles.smallBtn,
                            { backgroundColor: COLORS.cardBg },
                          ]}
                          onPress={() =>
                            setOperations((prev) => {
                              const nextOps = prev.map((o, oi) => {
                                if (oi !== multiOpIndex) return o;
                                const comps = (o.Components || []).map(
                                  (cc, ci) => {
                                    if (ci !== multiCompIndex) return cc;
                                    return {
                                      ...cc,
                                      NotFoundCategory: "",
                                      NotFoundMaterials: [],
                                      MultiSelected: [],
                                    };
                                  },
                                );
                                return { ...o, Components: comps };
                              });
                              return normalizeOpsAndComponents(
                                nextOps,
                                planPlant,
                              );
                            })
                          }
                        >
                          <Text style={styles.smallBtnText}>
                            Cambiar categoría
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.smallBtn,
                            {
                              backgroundColor: COLORS.accent,
                              borderColor: COLORS.accent,
                            },
                          ]}
                          onPress={() =>
                            loadNotFoundMaterialsByCategory(
                              multiOpIndex,
                              multiCompIndex,
                              zeinr,
                            )
                          }
                        >
                          <Text
                            style={[styles.smallBtnText, { color: "#fff" }]}
                          >
                            Reintentar
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                const filtered = !q
                  ? list
                  : list.filter((m) =>
                      `${m.Ojtxp || ""} ${m.Idnrk || ""}`
                        .toLowerCase()
                        .includes(q),
                    );

                const selected0 = (c.MultiSelected || [])[0]?.Material || null;

                return filtered.map((m, idx) => {
                  const checked = selected0 === m.Idnrk;
                  const key = `${m.Idnrk}-${idx}`;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.workerRow}
                      onPress={() => {
                        // ✅ solo 1: si selecciona otro, reemplaza; si toca el mismo, lo quita
                        setOperations((prev) => {
                          const nextOps = prev.map((o, oi) => {
                            if (oi !== multiOpIndex) return o;
                            const comps = (o.Components || []).map((cc, ci) => {
                              if (ci !== multiCompIndex) return cc;

                              const curr =
                                (cc.MultiSelected || [])[0]?.Material || null;
                              const nextSel =
                                curr === m.Idnrk
                                  ? []
                                  : [
                                      {
                                        Material: m.Idnrk,
                                        Descripcion: m.Ojtxp,
                                      },
                                    ];

                              return { ...cc, MultiSelected: nextSel };
                            });
                            return { ...o, Components: comps };
                          });
                          return normalizeOpsAndComponents(nextOps, planPlant);
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          checked && styles.checkboxChecked,
                        ]}
                      >
                        {checked && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workerName}>
                          {m.Ojtxp || m.Idnrk}
                        </Text>
                        <Text style={styles.materialCodeText}>{m.Idnrk}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => {
                  if (multiOpIndex < 0 || multiCompIndex < 0) return;
                  setOperations((prev) => {
                    const nextOps = prev.map((o, oi) => {
                      if (oi !== multiOpIndex) return o;
                      const comps = (o.Components || []).map((cc, ci) => {
                        if (ci !== multiCompIndex) return cc;
                        return { ...cc, MultiSelected: [] };
                      });
                      return { ...o, Components: comps };
                    });
                    return normalizeOpsAndComponents(nextOps, planPlant);
                  });
                }}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  {
                    backgroundColor: COLORS.accent,
                    borderColor: COLORS.accent,
                  },
                ]}
                onPress={() => setMultiVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  Listo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== DateTime Picker (modal) ===== */}
      <Modal
        visible={dtPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDtPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {dtPickerField === "start"
                  ? "Seleccionar inicio"
                  : "Seleccionar fin"}
              </Text>
              <TouchableOpacity
                onPress={() => setDtPickerVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14 }}>
              {Platform.OS === "ios" ? (
                <>
                  <DateTimePicker
                    value={dtPickerTemp}
                    mode="datetime"
                    display="spinner"
                    onChange={(_, selectedDate) => {
                      if (selectedDate) setDtPickerTemp(selectedDate);
                    }}
                  />

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.smallBtn,
                        { backgroundColor: COLORS.cardBg },
                      ]}
                      onPress={() => setDtPickerVisible(false)}
                    >
                      <Text style={styles.smallBtnText}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.smallBtn,
                        {
                          backgroundColor: COLORS.accent,
                          borderColor: COLORS.accent,
                        },
                      ]}
                      onPress={() => {
                        applyPickedDateTime(dtPickerTemp);
                        setDtPickerVisible(false);
                      }}
                    >
                      <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                        Confirmar
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text
                    style={{
                      color: COLORS.muted,
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  >
                    Primero elige la fecha y luego la hora.
                  </Text>

                  <DateTimePicker
                    value={dtPickerTemp}
                    mode={dtPickerStep}
                    display="default"
                    onChange={(event, selectedDate) => {
                      if (event?.type === "dismissed") {
                        setDtPickerVisible(false);
                        return;
                      }

                      const picked = selectedDate || dtPickerTemp;
                      if (dtPickerStep === "date") {
                        // conserva la hora actual del temp, pero cambia fecha
                        const next = new Date(dtPickerTemp);
                        next.setFullYear(
                          picked.getFullYear(),
                          picked.getMonth(),
                          picked.getDate(),
                        );
                        setDtPickerTemp(next);
                        setDtPickerStep("time");
                        return;
                      }

                      // time
                      const next = new Date(dtPickerTemp);
                      next.setHours(
                        picked.getHours(),
                        picked.getMinutes(),
                        0,
                        0,
                      );
                      setDtPickerTemp(next);

                      applyPickedDateTime(next);
                      setDtPickerVisible(false);
                      setDtPickerStep("date");
                    }}
                  />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ========= Subcomponentes ========= */

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value || "—"}</Text>
  </View>
);

const Field = ({ label, value, onChangeText, placeholder, keyboardType }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.muted}
      keyboardType={keyboardType}
    />
  </View>
);

/** Selector de centro de trabajo (técnico) */
const SelectWorkCenter = ({ items, selected, onSelect }) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");

  const label = selected
    ? `${selected.Ktext} (${selected.Arbpl})`
    : "Seleccionar técnico / centro";
  const normalized = (s) =>
    String(s || "")
      .toLowerCase()
      .trim();

  const filteredItems = !query.trim()
    ? items
    : items.filter((wc) => {
        const q = normalized(query);
        return (
          normalized(wc.Ktext).includes(q) || normalized(wc.Arbpl).includes(q)
        );
      });

  return (
    <>
      <TouchableOpacity
        style={[styles.input, styles.multiInput]}
        onPress={() => {
          setVisible(true);
          setQuery("");
        }}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontSize: 13,
            color: selected ? COLORS.title : COLORS.muted,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        <Ionicons
          name="chevron-down-outline"
          size={18}
          color={COLORS.muted}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Seleccionar técnico / centro
              </Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12, paddingBottom: 6 }}>
              <View
                style={[
                  styles.input,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#fff",
                  },
                ]}
              >
                <Ionicons name="search" size={16} color={COLORS.muted} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: COLORS.title }}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar por nombre o Arbpl..."
                  placeholderTextColor={COLORS.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {!!query && (
                  <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
                {filteredItems.length} resultado(s)
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: 280 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            >
              {filteredItems.map((wc, index) => {
                const checked = selected?.Arbpl === wc.Arbpl;
                const key = wc.Arbpl ? `${wc.Arbpl}-${index}` : `wc-${index}`;

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.workerRow}
                    onPress={() => {
                      onSelect(wc);
                      setVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && styles.checkboxChecked,
                      ]}
                    >
                      {checked && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.workerName}>
                      {wc.Ktext} ({wc.Arbpl})
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {!filteredItems.length && (
                <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                    No hay resultados con esa búsqueda.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => {
                  onSelect(null);
                  setQuery("");
                }}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  {
                    backgroundColor: COLORS.accent,
                    borderColor: COLORS.accent,
                  },
                ]}
                onPress={() => setVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  Listo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/** Selector de material */
const SelectMaterial = ({ items, value, onSelect, disabled }) => {
  const [visible, setVisible] = useState(false);

  const selectedItem = items.find((m) => m.Material === value) || null;
  const label = disabled
    ? "Selecciona primero una categoría"
    : selectedItem
      ? `${selectedItem.Descripcion} (${selectedItem.Material})`
      : "Seleccionar material de catálogo";

  const open = () => {
    if (disabled) return;
    setVisible(true);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.input,
          styles.multiInput,
          disabled && { backgroundColor: "#F0F1F5" },
        ]}
        onPress={open}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text
          style={{
            fontSize: 13,
            color: selectedItem && !disabled ? COLORS.title : COLORS.muted,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {!disabled && (
          <Ionicons
            name="chevron-down-outline"
            size={18}
            color={COLORS.muted}
            style={{ marginLeft: 6 }}
          />
        )}
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar material</Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            >
              {items.map((m, index) => {
                const checked = value === m.Material;
                const key = m.Id ? `${m.Id}-${index}` : `mat-${index}`;

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.workerRow}
                    onPress={() => {
                      onSelect(m.Material);
                      setVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && styles.checkboxChecked,
                      ]}
                    >
                      {checked && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.workerName}>
                        {m.Descripcion || m.Material}
                      </Text>
                      <Text style={styles.materialCodeText}>{m.Material}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => onSelect("")}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  {
                    backgroundColor: COLORS.accent,
                    borderColor: COLORS.accent,
                  },
                ]}
                onPress={() => setVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  Listo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/** ✅ Selector dinámico de número (modal) */
const SelectNumber = ({ label, value, min = 1, max = 20, onSelect }) => {
  const [visible, setVisible] = useState(false);

  const numbers = useMemo(() => {
    const arr = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
  }, [min, max]);

  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, styles.multiInput]}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
      >
        <Text
          style={{ fontSize: 13, color: value ? COLORS.title : COLORS.muted }}
          numberOfLines={1}
        >
          {value ? `${value} persona(s)` : "Seleccionar..."}
        </Text>
        <Ionicons name="chevron-down-outline" size={18} color={COLORS.muted} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Seleccionar número de personas
              </Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            >
              {numbers.map((n) => {
                const checked = value === n;
                return (
                  <TouchableOpacity
                    key={`n-${n}`}
                    style={styles.workerRow}
                    onPress={() => {
                      onSelect(n);
                      setVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && styles.checkboxChecked,
                      ]}
                    >
                      {checked && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.workerName}>{n} persona(s)</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: COLORS.cardBg }]}
                onPress={() => {
                  onSelect(null);
                  setVisible(false);
                }}
              >
                <Text style={styles.smallBtnText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  {
                    backgroundColor: COLORS.accent,
                    borderColor: COLORS.accent,
                  },
                ]}
                onPress={() => setVisible(false)}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  Listo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

/* ========= Estilos ========= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 90 },

  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  backText: { marginLeft: 4, color: COLORS.accent, fontWeight: "600" },

  cardHighlight: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...elev(1.2),
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11, color: COLORS.title },

  chipSmall: {
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  chipTextSmall: { fontSize: 11, color: COLORS.title },

  mainTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 6,
  },
  mainTitleMuted: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.muted,
    fontStyle: "italic",
    marginBottom: 6,
  },

  block: { marginTop: 4 },
  infoLabel: {
    fontSize: 11,
    color: COLORS.text,
    opacity: 0.8,
    marginBottom: 2,
  },
  infoValue: { fontSize: 13, color: COLORS.title, fontWeight: "600" },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...elev(1),
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 4,
  },
  sectionSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: 10 },

  row: { marginBottom: 6 },

  fieldLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: 4,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 13,
    color: COLORS.title,
    backgroundColor: "#FDFDFE",
  },

  multiInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dateRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  dateCol: { flex: 1 },
  helpText: { fontSize: 11, color: COLORS.muted, marginTop: 4 },

  opCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 18,
    backgroundColor: "#FAFBFF",
  },

  opHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  opTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.title },
  opDeleteBtn: { paddingHorizontal: 6, paddingVertical: 4 },

  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingVertical: 8,
  },
  btnSecondaryText: {
    marginLeft: 6,
    color: COLORS.accent,
    fontWeight: "700",
    fontSize: 13,
  },

  btnPrimary: {
    marginTop: 10,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...elev(1.4),
  },
  btnPrimaryPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  btnPrimaryDisabled: { opacity: 0.7 },
  btnPrimaryContent: { flexDirection: "row", alignItems: "center" },
  btnPrimaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...elev(1.4),
  },
  modalHeader: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  modalTitle: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 14 },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  workerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  workerName: { fontSize: 13, color: COLORS.title },
  materialCodeText: { fontSize: 11, color: COLORS.muted },

  modalFooterRow: {
    padding: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  smallBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.text },

  categoryRow: { marginBottom: 8 },
  categoryChipsWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F7F8FC",
    marginRight: 6,
  },
  categoryChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  categoryChipText: { fontSize: 11, color: COLORS.text, fontWeight: "600" },
  categoryChipTextActive: { color: "#fff" },

  toggleRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  toggleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F7F8FC",
  },
  toggleChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  toggleText: { fontSize: 12, fontWeight: "800", color: COLORS.text },
  toggleTextActive: { color: "#fff" },

  btnMini: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  btnMiniText: { color: COLORS.accent, fontWeight: "900" },

  materialCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },

  materialCardSpaced: {
    marginTop: 14,
  },

  operationDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
    opacity: 0.6,
  },

  softDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
    opacity: 0.5,
  },

  notFoundRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FAFBFF",
    marginBottom: 12,
  },

  notFoundTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.title,
  },

  notFoundSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
});
