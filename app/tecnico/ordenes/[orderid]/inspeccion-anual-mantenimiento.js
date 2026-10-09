// app/tecnico/ordenes/[orderid]/inspeccion-anual-mantenimiento.js
// Inspección anual de mantenimiento — formulario tipo wizard.
// La sección de cables incluye datos de prueba fijos para simular la integración
// con el formulario especializado de inspección/mantenimiento de cables.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildInspeccionAnualMantenimientoHtml } from "../../../../src/services/templates/inspeccion_anual_mantenimiento/buildInspeccionAnualMantenimientoHtml";

const UI = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  cardSoft: "#F8FAFC",
  border: "#E2E8F0",
  borderDark: "#CBD5E1",
  text: "#172033",
  muted: "#64748B",
  muted2: "#94A3B8",
  blue: "#123A72",
  blueSoft: "#EEF4FC",
  green: "#15803D",
  greenSoft: "#ECFDF3",
  amber: "#B45309",
  amberSoft: "#FFF7ED",
  red: "#B91C1C",
  dark: "#111827",
};

const STEPS = [
  { key: "general", title: "General" },
  { key: "ambiente", title: "Ambiente" },
  { key: "freno", title: "Freno" },
  { key: "polea", title: "Polea" },
  { key: "gobernador", title: "Gobernador" },
  { key: "cables", title: "Cables" },
  { key: "cabina-fosa", title: "Cabina / Fosa" },
  { key: "puertas", title: "Puertas" },
  { key: "evaluacion", title: "Evaluación" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const safe = (v) => String(v ?? "").trim();
const formatDMY = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

function parseDMY(value) {
  const parts = safe(value).split("/").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return new Date();
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

function getUserName(user) {
  return safe(
    user?.nombre ||
      user?.name ||
      user?.fullName ||
      user?.displayName ||
      user?.username ||
      user?.correo ||
      user?.email ||
      ""
  );
}

function mapAddress(addr) {
  if (!addr) return { razonSocial: "", direccion: "" };
  return {
    razonSocial: [addr.Name1, addr.Name2].filter(Boolean).join(" ").trim(),
    direccion: [
      `${addr.Street ?? ""} ${addr.HouseNum1 ?? ""}`.trim(),
      addr.StrSuppl3,
      addr.Location,
      addr.City1,
      addr.Region,
      addr.PostCode1,
      addr.Country,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

const DEFAULT_GENERAL = {
  fechaInspeccion: formatDMY(new Date()),
  mxOrden: "",
  noEqp: "",
  fechaEntrega: "",
  tipoContrato: "",
  inspector: "",
  razonSocial: "",
  direccionCliente: "",
  tipoControl: "",
  velocidad: "",
  tipoMaquina: "",
  recorridoM: "",
  cantidadArranques: "",
  fechaReferencia: "",
};

const DEFAULT_S1 = {
  cerraduraCuarto: "BIEN",
  goteras: "BIEN",
  equipoRescate: "BIEN",
  numeracionInterruptor: "BIEN",
  numeracionTablero: "BIEN",
  numeracionMaquina: "BIEN",
  rs: "",
  st: "",
  rt: "",
  l1l2: "",
  voltaje7900: "",
  bascula: "BIEN",
};

const DEFAULT_S2 = {
  pernoLeva: "BIEN",
  contactoLevaEmbolo: "BIEN",
  tambor: "BIEN",
  balata: "BIEN",
  espesorBalata: "",
  lubricacionEmbolo: "BIEN",
  desplazamientoEmbolo: "",
  espesorArandelaCuero: "",
  aperturaContactoBk: "",
  torque: "",
  fugaAceiteLeten: "BIEN",
  nivelAceite: "BIEN",
};

const DEFAULT_S4 = {
  diametroCableGob: "",
  condicionCableGob: "BIEN",
  contactoGob: "BIEN",
  lubricacionPernos: "BIEN",
  distanciaFrenado: "",
  inclinacionCabina: "BIEN",
  contactoSaf: "BIEN",
  nudoArriba: "BIEN",
  nudoAbajo: "BIEN",
};

const DEFAULT_S6 = {
  barandal: "BIEN",
  limpiezaArriba: "BIEN",
  gateSw: "BIEN",
  bandaCadena: "BIEN",
  rielLimpLub: "BIEN",
  deslizador: "BIEN",
  resquicioPuerta: "BIEN",
  sdeMbs: "BIEN",
  iluminacion: "BIEN",
  ventilador: "BIEN",
  cuadroMandoCop: "BIEN",
  tornilloCop: "BIEN",
};

const DEFAULT_S7 = {
  escaleraMarina: "SI HAY",
  pitSw: "BIEN",
  lampara: "BIEN",
  limpieza: "BIEN",
  agua: "NO HAY",
  oxidacion: "NO HAY",
  runbyCwt: "BIEN",
  distanciaCompensacion: "",
  distanciaPoleaTension: "",
  swLimiteDot: "BIEN",
  swLimiteOut: "BIEN",
};

const makePoleaCable = (seed = {}) => ({
  a0: "",
  a90: "",
  a180: "",
  a270: "",
  deslizamiento: "",
  ...seed,
});

const DEFAULT_POLEA = {
  b: "5.0",
  recorrido: "",
  roping: "1",
  cables: [
    makePoleaCable({ a0: "1.3", a90: "1.3", a180: "1.5", a270: "1.5", deslizamiento: "10.0" }),
    makePoleaCable({ a0: "1.3", a90: "1.3", a180: "1.5", a270: "1.7", deslizamiento: "10.0" }),
    makePoleaCable({ a0: "1.1", a90: "1.2", a180: "1.4", a270: "1.5", deslizamiento: "10.0" }),
    makePoleaCable({ a0: "1.1", a90: "1.3", a180: "1.5", a270: "1.5", deslizamiento: "10.0" }),
    makePoleaCable(),
    makePoleaCable(),
    makePoleaCable(),
    makePoleaCable(),
  ],
};

// Datos de prueba fijos para simular información que vendría de mantto-cables.js.
const TEST_CABLES = {
  diametroNominal: "12",
  numeroCables: "4",
  origen: "FORMULARIO_CABLES_TEST",
  cables: [
    {
      cableNo: 1,
      zonaNoUso: "12.20",
      masDelgado: "11.85",
      porcentaje: "97.13%",
      oxidacion: "OBSERVACIÓN",
      deformaciones: "NO HAY",
      fracturas: "NO HAY",
      tension: "BIEN",
      anclaCabina: "BIEN",
      anclaCwt: "BIEN",
    },
    {
      cableNo: 2,
      zonaNoUso: "12.22",
      masDelgado: "11.90",
      porcentaje: "97.38%",
      oxidacion: "OBSERVACIÓN",
      deformaciones: "NO HAY",
      fracturas: "NO HAY",
      tension: "BIEN",
      anclaCabina: "BIEN",
      anclaCwt: "BIEN",
    },
    {
      cableNo: 3,
      zonaNoUso: "12.25",
      masDelgado: "11.92",
      porcentaje: "97.31%",
      oxidacion: "OBSERVACIÓN",
      deformaciones: "NO HAY",
      fracturas: "NO HAY",
      tension: "BIEN",
      anclaCabina: "BIEN",
      anclaCwt: "BIEN",
    },
    {
      cableNo: 4,
      zonaNoUso: "12.26",
      masDelgado: "11.96",
      porcentaje: "97.55%",
      oxidacion: "OBSERVACIÓN",
      deformaciones: "NO HAY",
      fracturas: "NO HAY",
      tension: "BIEN",
      anclaCabina: "BIEN",
      anclaCwt: "BIEN",
    },
  ],
};

const newPuerta = (nomenclatura = "") => ({
  nomenclatura,
  condicionFijacion: "BIEN",
  interlock: "BIEN",
  swInterlock: "BIEN",
  cierre: "BIEN",
  cablePoleas: "BIEN",
  chaveta: "BIEN",
  rodajasExcentricos: "BIEN",
  rielLimpLub: "BIEN",
  deslizador: "BIEN",
  resquicioPuerta: "BIEN",
});

const DEFAULT_PUERTAS = [
  newPuerta("PB"),
  newPuerta("1"),
  newPuerta("3"),
  newPuerta("A"),
];

const DEFAULT_EVALUACION = {
  limpieza: "3",
  lubricacion: "3",
  aprieteTornilleria: "3",
  colocacionTapas: "3",
  confortViaje: "3",
  cambioPartes: "3",
};

const S1_ITEMS = [
  ["cerraduraCuarto", "Cerradura de cuarto", "status"],
  ["goteras", "Goteras", "status"],
  ["equipoRescate", "Equipo de rescate", "status"],
  ["numeracionInterruptor", "Numeración de interruptor", "status"],
  ["numeracionTablero", "Numeración de tablero", "status"],
  ["numeracionMaquina", "Numeración de máquina", "status"],
  ["rs", "R-S", "text"],
  ["st", "S-T", "text"],
  ["rt", "R-T", "text"],
  ["l1l2", "L1-L2", "text"],
  ["voltaje7900", "79-00 (420-400)", "text"],
  ["bascula", "Báscula", "status"],
];

const S2_ITEMS = [
  ["pernoLeva", "Perno de leva", "status"],
  ["contactoLevaEmbolo", "Contacto leva y émbolo", "status"],
  ["tambor", "Tambor", "status"],
  ["balata", "Balata", "status"],
  ["espesorBalata", "Espesor de balata", "text"],
  ["lubricacionEmbolo", "Lubricación de émbolo", "status"],
  ["desplazamientoEmbolo", "Desplazamiento de émbolo", "text"],
  ["espesorArandelaCuero", "Espesor de arandela", "text"],
  ["aperturaContactoBk", "Apertura de contacto BK", "text"],
  ["torque", "Torque", "text"],
  ["fugaAceiteLeten", "Fuga de aceite", "status"],
  ["nivelAceite", "Nivel de aceite", "status"],
];

const S4_ITEMS = [
  ["diametroCableGob", "Diámetro cable gobernador", "text"],
  ["condicionCableGob", "Condición cable gobernador", "status"],
  ["contactoGob", "Contacto gobernador", "status"],
  ["lubricacionPernos", "Lubricación para pernos", "status"],
  ["distanciaFrenado", "Distancia de frenado", "text"],
  ["inclinacionCabina", "Inclinación de cabina", "status"],
  ["contactoSaf", "Contacto SAF", "status"],
  ["nudoArriba", "Nudo arriba", "status"],
  ["nudoAbajo", "Nudo abajo", "status"],
];

const S6_ITEMS = [
  ["barandal", "Barandal", "status"],
  ["limpiezaArriba", "Limpieza arriba", "status"],
  ["gateSw", "Gate SW", "status"],
  ["bandaCadena", "Banda o cadena", "status"],
  ["rielLimpLub", "Riel limpio / lubricado", "status"],
  ["deslizador", "Deslizador", "status"],
  ["resquicioPuerta", "Resquicio de puerta", "status"],
  ["sdeMbs", "SDE o MBS", "status"],
  ["iluminacion", "Iluminación", "status"],
  ["ventilador", "Ventilador", "status"],
  ["cuadroMandoCop", "Cuadro de mando (COP)", "status"],
  ["tornilloCop", "Tornillo de COP", "status"],
];

const S7_ITEMS = [
  ["escaleraMarina", "Escalera marina", "text"],
  ["pitSw", "PIT SW", "status"],
  ["lampara", "Lámpara", "status"],
  ["limpieza", "Limpieza", "status"],
  ["agua", "Agua", "text"],
  ["oxidacion", "Oxidación", "text"],
  ["runbyCwt", "Runby CWT", "status"],
  ["distanciaCompensacion", "Distancia de compensación", "text"],
  ["distanciaPoleaTension", "Distancia polea de tensión", "text"],
  ["swLimiteDot", "SW límite DOT", "status"],
  ["swLimiteOut", "SW límite OUT", "status"],
];

const parseNumber = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  editable = true,
  keyboardType = "default",
  icon,
}) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>
      <View style={[styles.inputWrap, multiline && styles.inputWrapMultiline, !editable && styles.readonly]}>
        {icon ? <Ionicons name={icon} size={17} color={UI.muted} /> : null}
        <TextInput
          value={String(value ?? "")}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={UI.muted2}
          multiline={multiline}
          editable={editable}
          keyboardType={keyboardType}
          style={[styles.input, multiline && styles.textArea]}
        />
      </View>
    </View>
  );
}

function DateButton({ label, value, onPress }) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>
      <TouchableOpacity style={styles.pickerBox} onPress={onPress} activeOpacity={0.88}>
        <View style={styles.pickerLeft}>
          <Ionicons name="calendar-outline" size={17} color={UI.blue} />
          <Text style={styles.pickerText}>{value || "DD/MM/AAAA"}</Text>
        </View>
        <Ionicons name="chevron-down-outline" size={18} color={UI.muted} />
      </TouchableOpacity>
    </View>
  );
}

function SectionBox({ title, subtitle, icon, children }) {
  return (
    <View style={styles.sectionBox}>
      <View style={styles.sectionTop}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon || "clipboard-outline"} size={18} color={UI.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

function StatusChips({ value, onChange }) {
  const options = ["BIEN", "OBSERVACIÓN", "MALO"];
  return (
    <View style={styles.chipsWrap}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function InspectionFields({ items, values, onChange }) {
  return (
    <View>
      {items.map(([key, label, type]) => (
        <View key={key} style={styles.inspectionRow}>
          <Text style={styles.inspectionLabel}>{label}</Text>
          <View style={styles.inspectionControl}>
            {type === "status" ? (
              <StatusChips value={values[key]} onChange={(v) => onChange(key, v)} />
            ) : (
              <TextInput
                value={String(values[key] ?? "")}
                onChangeText={(v) => onChange(key, v)}
                placeholder="Dato / resultado"
                placeholderTextColor={UI.muted2}
                style={styles.compactInput}
              />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function InfoItem({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

function RatingChips({ value, onChange }) {
  return (
    <View style={styles.ratingWrap}>
      {[4, 3, 2, 1].map((n) => {
        const active = String(value) === String(n);
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(String(n))}
            style={[styles.ratingChip, active && styles.ratingChipActive]}
          >
            <Text style={[styles.ratingNumber, active && styles.ratingNumberActive]}>{n}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function InspeccionAnualMantenimientoForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();
  const safeOrderId = safe(orderid || "SIN_ORDEN");
  const draftKey = useMemo(() => `inspeccion_anual:${safeOrderId}`, [safeOrderId]);
  const tecnico = getUserName(user);

  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [dateTarget, setDateTarget] = useState(null);

  const [general, setGeneral] = useState({ ...DEFAULT_GENERAL, mxOrden: safeOrderId, inspector: tecnico });
  const [seccion1, setSeccion1] = useState(DEFAULT_S1);
  const [seccion2, setSeccion2] = useState(DEFAULT_S2);
  const [seccion3, setSeccion3] = useState(DEFAULT_POLEA);
  const [seccion4, setSeccion4] = useState(DEFAULT_S4);
  const [seccion5] = useState(TEST_CABLES);
  const [seccion6, setSeccion6] = useState(DEFAULT_S6);
  const [seccion7, setSeccion7] = useState(DEFAULT_S7);
  const [seccion8, setSeccion8] = useState(DEFAULT_PUERTAS);
  const [evaluacion, setEvaluacion] = useState(DEFAULT_EVALUACION);
  const [comentarioCliente, setComentarioCliente] = useState("");

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!tecnico) return;
    setGeneral((prev) => ({ ...prev, inspector: prev.inspector || tecnico }));
  }, [tecnico]);

  const poleaCalculada = useMemo(() => {
    const b = parseNumber(seccion3.b);
    const cables = (seccion3.cables || []).map((c) => {
      const mediciones = [c.a0, c.a90, c.a180, c.a270].map(parseNumber).filter((v) => v !== null);
      const promedio = mediciones.length
        ? mediciones.reduce((a, x) => a + x, 0) / mediciones.length
        : null;
      const bMenosA = b !== null && promedio !== null ? b - promedio : null;
      return {
        ...c,
        promedioA: promedio !== null ? promedio.toFixed(2) : "",
        bMenosA: bMenosA !== null ? bMenosA.toFixed(2) : "",
      };
    });

    const slips = cables.map((c) => parseNumber(c.deslizamiento)).filter((v) => v !== null);
    const pd = slips.length ? slips.reduce((a, x) => a + x, 0) / slips.length : null;
    const tr = parseNumber(seccion3.recorrido || general.recorridoM);
    const rp = parseNumber(seccion3.roping) || 1;
    const indiceR = pd !== null && tr && tr !== 0 ? (pd / tr) * rp : null;

    return {
      ...seccion3,
      recorrido: seccion3.recorrido || general.recorridoM,
      cables,
      pd: pd !== null ? pd.toFixed(2) : "",
      indiceR: indiceR !== null ? indiceR.toFixed(3) : "",
    };
  }, [seccion3, general.recorridoM]);

  const evaluacionTotal = useMemo(() => {
    return [
      evaluacion.limpieza,
      evaluacion.lubricacion,
      evaluacion.aprieteTornilleria,
      evaluacion.colocacionTapas,
      evaluacion.confortViaje,
      evaluacion.cambioPartes,
    ].reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [evaluacion]);

  const buildPayload = useCallback(() => ({
    orderid: safeOrderId,
    general,
    seccion1,
    seccion2,
    seccion3: poleaCalculada,
    seccion4,
    seccion5,
    seccion6,
    seccion7,
    seccion8,
    evaluacion: { ...evaluacion, total: String(evaluacionTotal) },
    comentarioCliente,
  }), [
    safeOrderId,
    general,
    seccion1,
    seccion2,
    poleaCalculada,
    seccion4,
    seccion5,
    seccion6,
    seccion7,
    seccion8,
    evaluacion,
    evaluacionTotal,
    comentarioCliente,
  ]);

  const loadDraft = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.general) setGeneral((prev) => ({ ...prev, ...d.general }));
      if (d.seccion1) setSeccion1({ ...DEFAULT_S1, ...d.seccion1 });
      if (d.seccion2) setSeccion2({ ...DEFAULT_S2, ...d.seccion2 });
      if (d.seccion3) setSeccion3({ ...DEFAULT_POLEA, ...d.seccion3, cables: d.seccion3.cables || DEFAULT_POLEA.cables });
      if (d.seccion4) setSeccion4({ ...DEFAULT_S4, ...d.seccion4 });
      if (d.seccion6) setSeccion6({ ...DEFAULT_S6, ...d.seccion6 });
      if (d.seccion7) setSeccion7({ ...DEFAULT_S7, ...d.seccion7 });
      if (Array.isArray(d.seccion8) && d.seccion8.length) setSeccion8(d.seccion8);
      if (d.evaluacion) setEvaluacion({ ...DEFAULT_EVALUACION, ...d.evaluacion });
      if (typeof d.comentarioCliente === "string") setComentarioCliente(d.comentarioCliente);
    } catch (e) {
      console.log("[ANUAL] No se pudo cargar borrador:", e?.message || e);
    }
  }, [draftKey]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    let alive = true;

    async function loadOrder() {
      if (!safeOrderId || safeOrderId === "SIN_ORDEN" || safeOrderId === "[orderid]") return;
      try {
        setLoading(true);
        const res = await api.get(`/api/ordenes/sap/${safeOrderId}`);
        const orden = res?.data || {};

        let razon = safe(orden.razon_social || orden.cliente || orden.Name1 || "");
        let direccion = safe(orden.direccion || orden.address || "");

        try {
          const addrRes = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${safeOrderId}')/ToAddresses`
          );
          const results = addrRes?.data?.d?.results || addrRes?.data?.results || [];
          const mapped = mapAddress(results?.[0]);
          if (mapped.razonSocial) razon = mapped.razonSocial;
          if (mapped.direccion) direccion = mapped.direccion;
        } catch (e) {
          console.log("[ANUAL] Dirección no disponible:", e?.message);
        }

        if (!alive) return;
        setGeneral((prev) => ({
          ...prev,
          mxOrden: prev.mxOrden || safe(orden.Orderid || orden.OrderId || safeOrderId),
          noEqp: prev.noEqp || safe(orden.Equipment || orden.equipment || ""),
          razonSocial: prev.razonSocial || razon,
          direccionCliente: prev.direccionCliente || direccion,
          tipoControl: prev.tipoControl || safe(orden.ControlType || orden.tipo_control || ""),
          velocidad: prev.velocidad || safe(orden.Speed || orden.velocidad || ""),
          tipoMaquina: prev.tipoMaquina || safe(orden.MachineType || orden.tipo_maquina || ""),
        }));
      } catch (e) {
        console.log("[ANUAL] No se pudieron cargar datos SAP:", e?.response?.data || e?.message || e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadOrder();
    return () => {
      alive = false;
    };
  }, [safeOrderId]);

  const saveDraft = async () => {
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(buildPayload()));
      Alert.alert("Borrador guardado", "La inspección anual quedó guardada localmente.");
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el borrador.");
    }
  };

  const onChangeGeneral = (key, value) => setGeneral((p) => ({ ...p, [key]: value }));
  const updateObject = (setter) => (key, value) => setter((p) => ({ ...p, [key]: value }));

  const updatePoleaCable = (idx, field, value) => {
    setSeccion3((prev) => ({
      ...prev,
      cables: prev.cables.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    }));
  };

  const updatePuerta = (idx, field, value) => {
    setSeccion8((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addPuerta = () => setSeccion8((prev) => [...prev, newPuerta("")]);
  const removePuerta = (idx) => setSeccion8((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;
    onChangeGeneral(dateTarget, formatDMY(selectedDate));
  };

  const generarPdfLocal = async () => {
    const html = buildInspeccionAnualMantenimientoHtml(buildPayload());
    const result = await Print.printToFileAsync({ html, base64: false });
    setPreviewHtml(html);
    setPdfUri(result.uri);
    return result.uri;
  };

  const generarPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setPdfUri(null);
      setShowPreview(true);
      await generarPdfLocal();
    } catch (e) {
      setShowPreview(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const abrirPdf = async () => {
    try {
      setGeneratingPdf(true);
      let uri = pdfUri;
      if (!uri) uri = await generarPdfLocal();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("No disponible", "Este dispositivo no permite compartir archivos.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Inspección anual de mantenimiento",
      });
    } catch (e) {
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const goNext = () => setActiveStep((s) => Math.min(STEPS.length - 1, s + 1));
  const goBack = () => setActiveStep((s) => Math.max(0, s - 1));

  const renderGeneral = () => (
    <>
      <SectionBox
        icon="document-text-outline"
        title="Datos generales"
        subtitle="Información principal de la inspección y del equipo."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Orden" value={general.mxOrden} />
          <InfoItem label="Equipo" value={general.noEqp} />
          <InfoItem label="Inspector" value={general.inspector} />
          <InfoItem label="Cliente" value={general.razonSocial} />
        </View>
      </SectionBox>

      <SectionBox icon="calendar-outline" title="Identificación de inspección">
        <DateButton
          label="Fecha de inspección"
          value={general.fechaInspeccion}
          onPress={() => setDateTarget("fechaInspeccion")}
        />
        <Input label="MX - Orden" value={general.mxOrden} onChangeText={(v) => onChangeGeneral("mxOrden", v)} icon="document-outline" />
        <Input label="No. de equipo" value={general.noEqp} onChangeText={(v) => onChangeGeneral("noEqp", v)} icon="construct-outline" />
        <DateButton
          label="Fecha de entrega"
          value={general.fechaEntrega}
          onPress={() => setDateTarget("fechaEntrega")}
        />
        <Input label="Tipo de contrato" value={general.tipoContrato} onChangeText={(v) => onChangeGeneral("tipoContrato", v)} />
        <Input label="Inspector" value={general.inspector} onChangeText={(v) => onChangeGeneral("inspector", v)} icon="person-outline" />
      </SectionBox>

      <SectionBox icon="business-outline" title="Cliente y características del equipo">
        <Input label="Razón social" value={general.razonSocial} onChangeText={(v) => onChangeGeneral("razonSocial", v)} />
        <Input label="Dirección del cliente" value={general.direccionCliente} onChangeText={(v) => onChangeGeneral("direccionCliente", v)} multiline />
        <Input label="Tipo de control" value={general.tipoControl} onChangeText={(v) => onChangeGeneral("tipoControl", v)} />
        <Input label="Velocidad" value={general.velocidad} onChangeText={(v) => onChangeGeneral("velocidad", v)} />
        <Input label="Tipo de máquina" value={general.tipoMaquina} onChangeText={(v) => onChangeGeneral("tipoMaquina", v)} />
        <Input label="Recorrido (m)" value={general.recorridoM} onChangeText={(v) => onChangeGeneral("recorridoM", v)} keyboardType="numeric" />
        <Input label="Cantidad de arranques" value={general.cantidadArranques} onChangeText={(v) => onChangeGeneral("cantidadArranques", v)} />
        <DateButton
          label="Fecha de referencia"
          value={general.fechaReferencia}
          onPress={() => setDateTarget("fechaReferencia")}
        />
      </SectionBox>
    </>
  );

  const renderAmbiente = () => (
    <SectionBox
      icon="grid-outline"
      title="1. Ambiente de cuarto de máquinas y tablero"
      subtitle="Revisión visual, accionamiento y mediciones eléctricas."
    >
      <InspectionFields items={S1_ITEMS} values={seccion1} onChange={updateObject(setSeccion1)} />
    </SectionBox>
  );

  const renderFreno = () => (
    <SectionBox
      icon="disc-outline"
      title="2. Freno y caja de corona"
      subtitle="Resultados generales y mediciones relevantes del sistema de freno."
    >
      <InspectionFields items={S2_ITEMS} values={seccion2} onChange={updateObject(setSeccion2)} />
    </SectionBox>
  );

  const renderPolea = () => (
    <>
      <SectionBox
        icon="radio-button-on-outline"
        title="3. Desgaste de polea de tracción"
        subtitle="A, B, deslizamiento y cálculo automático del índice R."
      >
        <View style={styles.inlineFields}>
          <View style={{ flex: 1 }}>
            <Input label="B - Dist. garganta/borde" value={seccion3.b} onChangeText={(v) => setSeccion3((p) => ({ ...p, b: v }))} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Recorrido TR (m)" value={seccion3.recorrido || general.recorridoM} onChangeText={(v) => setSeccion3((p) => ({ ...p, recorrido: v }))} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Roping (1 o 2)" value={seccion3.roping} onChangeText={(v) => setSeccion3((p) => ({ ...p, roping: v }))} keyboardType="numeric" />
          </View>
        </View>

        <View style={styles.calcSummary}>
          <View><Text style={styles.calcLabel}>PD promedio</Text><Text style={styles.calcValue}>{poleaCalculada.pd || "—"}</Text></View>
          <View><Text style={styles.calcLabel}>Índice R</Text><Text style={styles.calcValue}>{poleaCalculada.indiceR || "—"}</Text></View>
        </View>

        {seccion3.cables.slice(0, Number(seccion5.numeroCables) || 4).map((c, idx) => {
          const calc = poleaCalculada.cables[idx] || {};
          return (
            <View key={`polea-${idx}`} style={styles.rowCard}>
              <Text style={styles.rowTitle}>Cable {idx + 1}</Text>
              <View style={styles.inlineFields}>
                {["a0", "a90", "a180", "a270"].map((field, angleIdx) => (
                  <View key={field} style={{ flex: 1, minWidth: 110 }}>
                    <Input
                      label={["A 0°", "A 90°", "A 180°", "A 270°"][angleIdx]}
                      value={c[field]}
                      onChangeText={(v) => updatePoleaCable(idx, field, v)}
                      keyboardType="numeric"
                    />
                  </View>
                ))}
              </View>
              <Input label="Deslizamiento (mm)" value={c.deslizamiento} onChangeText={(v) => updatePoleaCable(idx, "deslizamiento", v)} keyboardType="numeric" />
              <View style={styles.smallResultRow}>
                <Text style={styles.smallResult}>Promedio A: {calc.promedioA || "—"}</Text>
                <Text style={styles.smallResult}>B-A: {calc.bMenosA || "—"}</Text>
              </View>
            </View>
          );
        })}
      </SectionBox>
    </>
  );

  const renderGobernador = () => (
    <SectionBox
      icon="speedometer-outline"
      title="4. Gobernador y seguro contra caída"
      subtitle="Condición del gobernador, seguro y elementos relacionados."
    >
      <InspectionFields items={S4_ITEMS} values={seccion4} onChange={updateObject(setSeccion4)} />
    </SectionBox>
  );

  const renderCables = () => (
    <SectionBox
      icon="git-merge-outline"
      title="5. Inspección de cable de tracción"
      subtitle="Datos precargados de prueba para simular la información obtenida del formulario de cables."
    >
      <View style={styles.importBanner}>
        <Ionicons name="checkmark-circle-outline" size={20} color={UI.green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.importTitle}>Datos importados de prueba</Text>
          <Text style={styles.importText}>
            Estos valores son fijos por ahora. Después se pueden sustituir por la lectura real del formulario mantto-cables.js usando la orden/equipo.
          </Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoItem label="Diámetro nominal" value={`${seccion5.diametroNominal} mm`} />
        <InfoItem label="Número de cables" value={seccion5.numeroCables} />
      </View>

      {seccion5.cables.map((c) => (
        <View key={c.cableNo} style={styles.cableCard}>
          <View style={styles.cableHeader}>
            <Text style={styles.rowTitle}>Cable {c.cableNo}</Text>
            <Text style={styles.readonlyBadge}>IMPORTADO</Text>
          </View>
          <View style={styles.infoGrid}>
            <InfoItem label="Zona no uso" value={`${c.zonaNoUso} mm`} />
            <InfoItem label="Más delgado" value={`${c.masDelgado} mm`} />
            <InfoItem label="Porcentaje" value={c.porcentaje} />
            <InfoItem label="Oxidación" value={c.oxidacion} />
            <InfoItem label="Deformaciones" value={c.deformaciones} />
            <InfoItem label="Fracturas" value={c.fracturas} />
            <InfoItem label="Tensión" value={c.tension} />
            <InfoItem label="Ancla cabina" value={c.anclaCabina} />
            <InfoItem label="Ancla CWT" value={c.anclaCwt} />
          </View>
        </View>
      ))}
    </SectionBox>
  );

  const renderCabinaFosa = () => (
    <>
      <SectionBox icon="cube-outline" title="6. Inspección de cabina">
        <InspectionFields items={S6_ITEMS} values={seccion6} onChange={updateObject(setSeccion6)} />
      </SectionBox>
      <SectionBox icon="trail-sign-outline" title="7. Inspección de fosa (PIT) y SW límite">
        <InspectionFields items={S7_ITEMS} values={seccion7} onChange={updateObject(setSeccion7)} />
      </SectionBox>
    </>
  );

  const renderPuertas = () => (
    <SectionBox
      icon="albums-outline"
      title="8. Puertas de piso y SW límite"
      subtitle="Agrega las paradas necesarias para el equipo."
    >
      {seccion8.map((r, idx) => (
        <View key={`puerta-${idx}`} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>Piso {idx + 1}</Text>
            {seccion8.length > 1 ? (
              <TouchableOpacity onPress={() => removePuerta(idx)}>
                <Text style={styles.removeText}>Eliminar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Input label="Nomenclatura" value={r.nomenclatura} onChangeText={(v) => updatePuerta(idx, "nomenclatura", v)} />
          {[
            ["condicionFijacion", "Condición de fijación"],
            ["interlock", "Interlock (I/L)"],
            ["swInterlock", "SW de I/L"],
            ["cierre", "Cierre"],
            ["cablePoleas", "Cable entre poleas"],
            ["chaveta", "Chaveta"],
            ["rodajasExcentricos", "Rodajas y excéntricos"],
            ["rielLimpLub", "Riel limpio / lubricado"],
            ["deslizador", "Deslizador"],
            ["resquicioPuerta", "Resquicio de puerta"],
          ].map(([key, label]) => (
            <View key={key} style={styles.doorStatusRow}>
              <Text style={styles.inspectionLabel}>{label}</Text>
              <StatusChips value={r[key]} onChange={(v) => updatePuerta(idx, key, v)} />
            </View>
          ))}
        </View>
      ))}
      <TouchableOpacity style={styles.secondaryButton} onPress={addPuerta}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.secondaryButtonText}>Agregar piso</Text>
      </TouchableOpacity>
    </SectionBox>
  );

  const renderEvaluacion = () => (
    <>
      <SectionBox
        icon="star-outline"
        title="9. Evaluación del supervisor"
        subtitle="4 Excelente · 3 Bien · 2 Regular · 1 Malo"
      >
        {[
          ["limpieza", "Limpieza"],
          ["lubricacion", "Lubricación"],
          ["aprieteTornilleria", "Apriete de tornillería"],
          ["colocacionTapas", "Colocación y fijación de tapas"],
          ["confortViaje", "Confort de viaje y nivelación"],
          ["cambioPartes", "Cambio de partes según cobertura"],
        ].map(([key, label]) => (
          <View key={key} style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>{label}</Text>
            <RatingChips value={evaluacion[key]} onChange={(v) => setEvaluacion((p) => ({ ...p, [key]: v }))} />
          </View>
        ))}

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{evaluacionTotal}</Text>
        </View>
      </SectionBox>

      <SectionBox icon="chatbox-outline" title="10. Comentario del cliente o S/V">
        <Input
          label="Comentario"
          value={comentarioCliente}
          onChangeText={setComentarioCliente}
          placeholder="Comentarios del cliente, supervisor o seguimiento..."
          multiline
        />
      </SectionBox>
    </>
  );

  const renderStep = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderAmbiente();
    if (activeStep === 2) return renderFreno();
    if (activeStep === 3) return renderPolea();
    if (activeStep === 4) return renderGobernador();
    if (activeStep === 5) return renderCables();
    if (activeStep === 6) return renderCabinaFosa();
    if (activeStep === 7) return renderPuertas();
    return renderEvaluacion();
  };

  return (
    <View style={styles.container}>
      <Header title="Inspección anual" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="clipboard-outline" size={22} color={UI.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introKicker}>TEL-GMA-FRT-013.0</Text>
            <Text style={styles.introTitle}>Inspección anual de mantenimiento</Text>
            <Text style={styles.introText}>Completa la revisión por secciones. La sección de cables ya contiene información fija de prueba.</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingStrip}>
            <ActivityIndicator color={UI.blue} />
            <Text style={styles.loadingStripText}>Consultando datos de la orden…</Text>
          </View>
        ) : null}

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>Paso {activeStep + 1} de {STEPS.length}</Text>
            <Text style={styles.progressCurrent}>{STEPS[activeStep].title}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((activeStep + 1) / STEPS.length) * 100}%` }]} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepsRow}>
            {STEPS.map((step, idx) => {
              const active = idx === activeStep;
              const done = idx < activeStep;
              return (
                <TouchableOpacity
                  key={step.key}
                  onPress={() => setActiveStep(idx)}
                  style={[styles.stepPill, active && styles.stepPillActive, done && styles.stepPillDone]}
                >
                  <Text style={[styles.stepPillText, (active || done) && styles.stepPillTextActive]}>{idx + 1}. {step.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {renderStep()}

        {dateTarget ? (
          <DateTimePicker
            value={parseDMY(general[dateTarget])}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        ) : null}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navButton, activeStep === 0 && styles.navDisabled]}
            disabled={activeStep === 0}
            onPress={goBack}
          >
            <Ionicons name="arrow-back-outline" size={18} color={activeStep === 0 ? UI.muted2 : UI.blue} />
            <Text style={[styles.navButtonText, activeStep === 0 && { color: UI.muted2 }]}>Anterior</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButtonPrimary, activeStep === STEPS.length - 1 && styles.navDisabled]}
            disabled={activeStep === STEPS.length - 1}
            onPress={goNext}
          >
            <Text style={styles.navButtonPrimaryText}>Siguiente</Text>
            <Ionicons name="arrow-forward-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.draftButton} onPress={saveDraft}>
          <Ionicons name="save-outline" size={18} color={UI.blue} />
          <Text style={styles.draftButtonText}>Borrador</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.previewButton} onPress={generarPreviewPdf} disabled={generatingPdf}>
          {generatingPdf ? <ActivityIndicator color="#fff" /> : <Ionicons name="eye-outline" size={18} color="#fff" />}
          <Text style={styles.previewButtonText}>Vista previa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pdfButton} onPress={abrirPdf} disabled={generatingPdf}>
          <Ionicons name="share-social-outline" size={18} color="#fff" />
          <Text style={styles.pdfButtonText}>PDF</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPreview}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalKicker}>Documento</Text>
                <Text style={styles.modalTitle}>Inspección anual</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.webWrap}>
              {generatingPdf || !previewHtml ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={UI.blue} />
                  <Text style={styles.loadingText}>Generando PDF…</Text>
                </View>
              ) : (
                <WebView originWhitelist={["*"]} source={{ html: previewHtml }} style={styles.webview} />
              )}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.footerLight} onPress={() => setShowPreview(false)}>
                <Text style={styles.footerLightText}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerPrimary} onPress={abrirPdf}>
                <Text style={styles.footerPrimaryText}>Abrir / compartir PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bg },
  content: { padding: 14, paddingBottom: 126 },
  introCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 16,
    padding: 14,
  },
  introIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: UI.blueSoft, alignItems: "center", justifyContent: "center" },
  introKicker: { color: UI.blue, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  introTitle: { color: UI.text, fontSize: 19, fontWeight: "800", marginTop: 2 },
  introText: { color: UI.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  loadingStrip: { marginTop: 10, borderRadius: 12, backgroundColor: UI.blueSoft, padding: 10, flexDirection: "row", gap: 9, alignItems: "center" },
  loadingStripText: { color: UI.blue, fontWeight: "700", fontSize: 12 },
  progressCard: { marginTop: 12, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 12 },
  progressTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  progressCurrent: { color: UI.text, fontSize: 13, fontWeight: "800" },
  progressTrack: { height: 4, borderRadius: 99, backgroundColor: "#E9EDF2", overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", backgroundColor: UI.blue, borderRadius: 99 },
  stepsRow: { gap: 7, paddingTop: 10, paddingRight: 10 },
  stepPill: { borderRadius: 10, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.cardSoft, paddingVertical: 7, paddingHorizontal: 10 },
  stepPillActive: { backgroundColor: UI.blue, borderColor: UI.blue },
  stepPillDone: { backgroundColor: "#E9F7EF", borderColor: "#B7E2C7" },
  stepPillText: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  stepPillTextActive: { color: UI.text },
  sectionBox: { marginTop: 12, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 14 },
  sectionTop: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 12 },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: UI.blueSoft, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: UI.text, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: UI.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  inputBlock: { marginBottom: 11 },
  label: { color: UI.muted, fontSize: 10.5, fontWeight: "800", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 },
  inputWrap: { minHeight: 44, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 11, flexDirection: "row", gap: 8, alignItems: "center" },
  inputWrapMultiline: { alignItems: "flex-start" },
  input: { flex: 1, color: UI.text, fontSize: 14, paddingVertical: Platform.OS === "ios" ? 11 : 8 },
  textArea: { height: 98, textAlignVertical: "top" },
  readonly: { backgroundColor: "#F1F5F9" },
  pickerBox: { minHeight: 44, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerText: { color: UI.text, fontSize: 14, fontWeight: "700" },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoItem: { flexGrow: 1, flexBasis: "47%", minWidth: 145, borderWidth: 1, borderColor: UI.border, borderRadius: 11, backgroundColor: UI.cardSoft, padding: 10 },
  infoLabel: { color: UI.muted, fontSize: 9.5, fontWeight: "800", textTransform: "uppercase" },
  infoValue: { color: UI.text, fontSize: 13, fontWeight: "800", marginTop: 3 },
  inspectionRow: { borderBottomWidth: 1, borderBottomColor: UI.border, paddingVertical: 10 },
  inspectionLabel: { color: UI.text, fontSize: 12.5, fontWeight: "700", marginBottom: 7 },
  inspectionControl: { flex: 1 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderColor: UI.borderDark, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#fff" },
  chipActive: { backgroundColor: UI.blue, borderColor: UI.blue },
  chipText: { color: UI.muted, fontSize: 10.5, fontWeight: "800" },
  chipTextActive: { color: "#fff" },
  compactInput: { minHeight: 40, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 10, paddingHorizontal: 10, color: UI.text, backgroundColor: "#fff" },
  inlineFields: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  calcSummary: { flexDirection: "row", gap: 10, marginBottom: 10 },
  calcLabel: { color: UI.muted, fontSize: 10, fontWeight: "700" },
  calcValue: { color: UI.blue, fontSize: 17, fontWeight: "900", marginTop: 2 },
  rowCard: { marginTop: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 12, backgroundColor: UI.cardSoft, padding: 11 },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  rowTitle: { color: UI.text, fontSize: 13.5, fontWeight: "800" },
  smallResultRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  smallResult: { color: UI.blue, backgroundColor: UI.blueSoft, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, fontSize: 11, fontWeight: "800" },
  importBanner: { flexDirection: "row", gap: 9, alignItems: "flex-start", backgroundColor: UI.greenSoft, borderWidth: 1, borderColor: "#BBE4C8", borderRadius: 11, padding: 10, marginBottom: 10 },
  importTitle: { color: UI.green, fontSize: 12.5, fontWeight: "800" },
  importText: { color: UI.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  cableCard: { marginTop: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 12, padding: 11, backgroundColor: "#FBFCFD" },
  cableHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  readonlyBadge: { fontSize: 9, fontWeight: "900", color: UI.green, backgroundColor: UI.greenSoft, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  doorStatusRow: { borderTopWidth: 1, borderTopColor: UI.border, paddingTop: 9, marginTop: 2 },
  removeText: { color: UI.red, fontWeight: "800", fontSize: 11 },
  secondaryButton: { marginTop: 10, minHeight: 44, borderRadius: 11, backgroundColor: UI.dark, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  ratingRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: UI.border },
  ratingLabel: { color: UI.text, fontSize: 12.5, fontWeight: "700", marginBottom: 7 },
  ratingWrap: { flexDirection: "row", gap: 8 },
  ratingChip: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: UI.borderDark, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  ratingChipActive: { backgroundColor: UI.blue, borderColor: UI.blue },
  ratingNumber: { color: UI.text, fontWeight: "900" },
  ratingNumberActive: { color: "#fff" },
  totalCard: { marginTop: 12, backgroundColor: UI.blueSoft, borderRadius: 11, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: UI.blue, fontWeight: "800", fontSize: 13 },
  totalValue: { color: UI.blue, fontSize: 23, fontWeight: "900" },
  navRow: { flexDirection: "row", gap: 9, marginTop: 14 },
  navButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: UI.blue, borderRadius: 11, backgroundColor: "#fff", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  navButtonPrimary: { flex: 1, minHeight: 46, borderRadius: 11, backgroundColor: UI.blue, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  navButtonText: { color: UI.blue, fontSize: 13, fontWeight: "800" },
  navButtonPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  navDisabled: { opacity: 0.4 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 7, backgroundColor: "rgba(244,246,248,0.98)", borderTopWidth: 1, borderTopColor: UI.border, paddingHorizontal: 10, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 24 : 12 },
  draftButton: { flex: 0.9, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: UI.blue, backgroundColor: "#fff", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  draftButtonText: { color: UI.blue, fontSize: 12, fontWeight: "800" },
  previewButton: { flex: 1.25, minHeight: 50, borderRadius: 12, backgroundColor: UI.blue, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  previewButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  pdfButton: { flex: 0.75, minHeight: 50, borderRadius: 12, backgroundColor: UI.dark, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  pdfButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.58)", padding: 10, justifyContent: "center" },
  modalCard: { flex: 1, backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { backgroundColor: UI.blue, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalKicker: { color: "#CFE0F6", fontSize: 9.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  webWrap: { flex: 1, padding: 8 },
  webview: { flex: 1, backgroundColor: "#fff" },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: UI.muted, fontSize: 12, fontWeight: "700", marginTop: 8 },
  modalFooter: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: UI.border },
  footerLight: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.cardSoft, alignItems: "center", justifyContent: "center" },
  footerLightText: { color: UI.text, fontWeight: "800", fontSize: 12 },
  footerPrimary: { flex: 1.4, minHeight: 44, borderRadius: 10, backgroundColor: UI.blue, alignItems: "center", justifyContent: "center" },
  footerPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});