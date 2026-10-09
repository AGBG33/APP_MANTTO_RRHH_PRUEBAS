// app/tecnico/ordenes/[orderid]/reporte-averia-mantenimiento.js
// Reporte de Avería en Mantenimiento (R.A.M.)
// Formulario creado desde el formato TEP de R.A.M.
// Compatible con:
// src/services/templates/reporte_averia_mantenimiento/buildReporteAveriaMantenimientoHtml.js
// Sin validaciones bloqueantes para permitir vista previa del PDF con campos vacíos.

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
import { buildReporteAveriaMantenimientoHtml } from "../../../../src/services/templates/reporte_averia_mantenimiento/buildReporteAveriaMantenimientoHtml";

const UI = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  cardSoft: "#F8FAFC",
  border: "#E2E8F0",
  borderDark: "#CBD5E1",
  text: "#172033",
  muted: "#667085",
  muted2: "#98A2B3",
  primary: "#123A72",
  primarySoft: "#EDF3FA",
  success: "#16865C",
  successSoft: "#EAF7F1",
  warning: "#B26A00",
  warningSoft: "#FFF6E6",
  danger: "#C43A3A",
  dangerSoft: "#FFF0F0",
  dark: "#1F2937",
};

const STEPS = [
  { key: "general", title: "General", short: "RAM" },
  { key: "equipo", title: "Equipo", short: "Contrato" },
  { key: "problema", title: "Problema", short: "Diagnóstico" },
  { key: "refacciones", title: "Refacciones", short: "Estado" },
  { key: "medidas", title: "Medidas", short: "C.C." },
  { key: "cierre", title: "Cierre", short: "Firmas" },
];

const MEDIDAS_IMPLEMENTADAS = [
  ["arregloProvisional", "Se hizo un arreglo provisional"],
  ["partesOtraOrden", "Partes tomadas de otra orden"],
  ["esperandoPartes", "Esperando partes"],
  ["esperandoOpinionCC", "Esperando opinión de C.C."],
  ["hojasAnexas", "Ver hojas anexas"],
  ["otras", "Otras"],
];

const MEDIDAS_REQUERIDAS = [
  ["investigarCausas", "Investigar directamente las causas del problema"],
  ["asesoriaTecnica", "Proporcionar información o asesoría técnica"],
  ["opinionCC", "Informar opinión de Control de Calidad"],
  ["cambioGarantia", "Análisis para efectuar cambio por garantía"],
  ["partesJapon", "Solicitar partes a Japón"],
  ["otras", "Otras"],
];

const RESPUESTAS_CC = [
  ["investigarCausas", "Se investigarán directamente las causas del problema"],
  ["asesoriaTecnica", "Se proporcionará asesoría técnica"],
  ["reporteJapon", "Se enviará reporte de avería a Japón"],
  ["contramedidaCC", "Se realizará la contramedida por Control de Calidad"],
  ["analizarDatos", "Se analizarán los datos"],
  ["otras", "Otras"],
];

const pad2 = (n) => String(n).padStart(2, "0");

function safe(v) {
  return String(v ?? "").trim();
}

function formatDateDMY(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function parseDMYToDate(value) {
  const [dd, mm, yyyy] = String(value || "")
    .split("/")
    .map((x) => Number(x));

  if (!dd || !mm || !yyyy) return new Date();

  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? new Date() : d;
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

function mapDireccion(addr) {
  if (!addr) return { razonSocial: "", direccion: "" };

  const razonSocial = [addr.Name1, addr.Name2].filter(Boolean).join(" ").trim();
  const direccion = [
    `${addr.Street ?? ""} ${addr.HouseNum1 ?? ""}`.trim(),
    addr.StrSuppl3,
    addr.Location,
    addr.City1,
    addr.Region,
    addr.PostCode1,
    addr.Country,
  ]
    .filter(Boolean)
    .join(", ");

  return { razonSocial, direccion };
}

function newRefaccion() {
  return {
    nombre: "",
    noDibujo: "",
    cantidad: "",
    costo: "",
  };
}

function emptyChecks() {
  return {
    arregloProvisional: false,
    partesOtraOrden: false,
    esperandoPartes: false,
    esperandoOpinionCC: false,
    hojasAnexas: false,
    otras: false,
    detalle: "",
  };
}

function emptyMedidasRequeridas() {
  return {
    investigarCausas: false,
    asesoriaTecnica: false,
    opinionCC: false,
    cambioGarantia: false,
    partesJapon: false,
    otras: false,
    detalle: "",
  };
}

function emptyRespuestaCC() {
  return {
    investigarCausas: false,
    asesoriaTecnica: false,
    reporteJapon: false,
    contramedidaCC: false,
    analizarDatos: false,
    otras: false,
    detalle: "",
  };
}

function createDefaultForm(userName = "", orderId = "") {
  return {
    para: "CONTROL DE CALIDAD",
    de: userName,
    fechaEmision: formatDateDMY(new Date()),
    folioRam: "",

    razonSocial: "",
    direccion: "",
    tipoControl: "",
    fechaProduccion: "",
    estadoContrato: "",
    postventaMeses: "",
    contratoAnios: "",

    noOrdenMx: orderId,
    noOrdenPlanta: "",
    numeroEquipo: "",
    tipoEquipo: "",
    modelo: "",
    fechaEntregaCliente: "",
    mesesGarantia: "",

    descripcionProblema: "",
    causaProblema: "",

    refacciones: [newRefaccion(), newRefaccion()],

    estadoEquipo: "",
    estadoEquipoDetalles: "",

    medidasImplementadas: emptyChecks(),
    medidasRequeridasCC: emptyMedidasRequeridas(),
    respuestaCC: emptyRespuestaCC(),

    reportadoPor: userName,
    revisoMantenimiento: "",
    revisoControlCalidad: "",

    anexo: "",
  };
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  icon,
  keyboardType = "default",
  editable = true,
}) {
  return (
    <View style={styles.inputBlock}>
      {!!label && <Label>{label}</Label>}

      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          !editable && styles.readonlyWrap,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={17}
            color={UI.muted}
            style={{ marginTop: multiline ? 12 : 0 }}
          />
        ) : null}

        <TextInput
          value={String(value ?? "")}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={UI.muted2}
          multiline={multiline}
          keyboardType={keyboardType}
          editable={editable}
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

      <TouchableOpacity
        style={styles.dateButton}
        onPress={onPress}
        activeOpacity={0.88}
      >
        <View style={styles.dateButtonLeft}>
          <Ionicons name="calendar-outline" size={17} color={UI.primary} />
          <Text style={[styles.dateButtonText, !value && styles.placeholderText]}>
            {value || "DD/MM/AAAA"}
          </Text>
        </View>

        <Ionicons name="chevron-down-outline" size={17} color={UI.muted} />
      </TouchableOpacity>
    </View>
  );
}

function Section({ title, subtitle, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons
            name={icon || "document-text-outline"}
            size={18}
            color={UI.primary}
          />
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

function Choice({ label, active, onPress, tone = "primary" }) {
  const activeStyle =
    tone === "success"
      ? styles.choiceSuccessActive
      : tone === "danger"
      ? styles.choiceDangerActive
      : tone === "warning"
      ? styles.choiceWarningActive
      : styles.choicePrimaryActive;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={[styles.choice, active && activeStyle]}
    >
      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
        {active ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function CheckRow({ label, value, onChange }) {
  return (
    <TouchableOpacity
      style={[styles.checkRow, value && styles.checkRowActive]}
      onPress={() => onChange(!value)}
      activeOpacity={0.86}
    >
      <View style={[styles.checkBox, value && styles.checkBoxActive]}>
        {value ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoItem({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value || "—"}
      </Text>
    </View>
  );
}

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Field({ children, small = false, wide = false }) {
  return (
    <View
      style={[
        styles.field,
        small && styles.fieldSmall,
        wide && styles.fieldWide,
      ]}
    >
      {children}
    </View>
  );
}

export default function ReporteAveriaMantenimientoForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const tecnicoPrincipal = getUserName(user);
  const safeOrderId = safe(orderid && orderid !== "[orderid]" ? orderid : "");
  const draftKey = useMemo(
    () => `reporte_averia_mantenimiento:${safeOrderId || "local"}`,
    [safeOrderId]
  );

  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState(() =>
    createDefaultForm(tecnicoPrincipal, safeOrderId)
  );

  const [dateTarget, setDateTarget] = useState(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const patchForm = useCallback((patch) => {
    setPdfUri(null);
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const patchSection = useCallback((section, patch) => {
    setPdfUri(null);
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        ...patch,
      },
    }));
  }, []);

  const updateRefaccion = useCallback((idx, field, value) => {
    setPdfUri(null);
    setForm((prev) => ({
      ...prev,
      refacciones: prev.refacciones.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r
      ),
    }));
  }, []);

  const addRefaccion = useCallback(() => {
    setPdfUri(null);
    setForm((prev) => ({
      ...prev,
      refacciones: [...prev.refacciones, newRefaccion()],
    }));
  }, []);

  const removeRefaccion = useCallback((idx) => {
    setPdfUri(null);
    setForm((prev) => {
      const next = prev.refacciones.filter((_, i) => i !== idx);
      return {
        ...prev,
        refacciones: next.length ? next : [newRefaccion()],
      };
    });
  }, []);

  useEffect(() => {
    if (!tecnicoPrincipal) return;

    setForm((prev) => ({
      ...prev,
      de: prev.de || tecnicoPrincipal,
      reportadoPor: prev.reportadoPor || tecnicoPrincipal,
    }));
  }, [tecnicoPrincipal]);

  const loadDraft = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(draftKey);
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      setForm((prev) => ({
        ...prev,
        ...parsed,
        noOrdenMx: safe(parsed.noOrdenMx || prev.noOrdenMx || safeOrderId),
        de: safe(parsed.de || prev.de || tecnicoPrincipal),
        reportadoPor: safe(
          parsed.reportadoPor || prev.reportadoPor || tecnicoPrincipal
        ),
        refacciones:
          Array.isArray(parsed.refacciones) && parsed.refacciones.length
            ? parsed.refacciones
            : prev.refacciones,
        medidasImplementadas: {
          ...prev.medidasImplementadas,
          ...(parsed.medidasImplementadas || {}),
        },
        medidasRequeridasCC: {
          ...prev.medidasRequeridasCC,
          ...(parsed.medidasRequeridasCC || {}),
        },
        respuestaCC: {
          ...prev.respuestaCC,
          ...(parsed.respuestaCC || {}),
        },
      }));

      return true;
    } catch (e) {
      console.log("[RAM] loadDraft error:", e);
      return false;
    }
  }, [draftKey, safeOrderId, tecnicoPrincipal]);

  const cargarOrden = useCallback(async () => {
    if (!safeOrderId) return;

    try {
      const resOrden = await api.get(`/api/ordenes/sap/${safeOrderId}`);
      const orden = resOrden?.data || {};

      let razonSocial = safe(
        orden.razon_social ||
          orden.cliente ||
          `${orden.Name1 ?? ""} ${orden.Name2 ?? ""}`
      );
      let direccion = safe(
        orden.direccion || orden.address || orden.partner_address || ""
      );

      try {
        const resAddr = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${safeOrderId}')/ToAddresses`
        );
        const results = resAddr?.data?.d?.results || resAddr?.data?.results || [];
        const mapped = mapDireccion(results?.[1] || results?.[0]);
        if (mapped.razonSocial) razonSocial = mapped.razonSocial;
        if (mapped.direccion) direccion = mapped.direccion;
      } catch (addrError) {
        console.log("[RAM] ToAddresses no disponible:", addrError?.message);
      }

      const rawTipo = safe(
        orden.tipo_equipo ||
          orden.EquipmentType ||
          orden.equipment_type ||
          orden.DescripcionEquipo ||
          orden.description ||
          ""
      ).toLowerCase();

      patchForm({
        noOrdenMx: safe(orden.Orderid || orden.OrderId || safeOrderId),
        numeroEquipo: safe(orden.Equipment || orden.equipment || orden.Equnr || ""),
        razonSocial,
        direccion,
        tipoEquipo: rawTipo.includes("escal")
          ? "Escalera"
          : rawTipo.includes("elev")
          ? "Elevador"
          : "",
      });
    } catch (e) {
      console.log("[RAM] No se pudieron precargar datos de la orden:", e?.message);
    }
  }, [safeOrderId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const hadDraft = await loadDraft();
      if (!hadDraft) await cargarOrden();
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [loadDraft, cargarOrden]);

  const saveDraft = useCallback(async () => {
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(form));
      Alert.alert("Borrador guardado", "El reporte se guardó localmente.");
    } catch (e) {
      console.log("[RAM] saveDraft error:", e);
      Alert.alert("Error", "No se pudo guardar el borrador.");
    }
  }, [draftKey, form]);

  const getDateValue = (target) => {
    if (target === "fechaEmision") return form.fechaEmision;
    if (target === "fechaProduccion") return form.fechaProduccion;
    if (target === "fechaEntregaCliente") return form.fechaEntregaCliente;
    return "";
  };

  const setDateValue = (target, value) => {
    if (target === "fechaEmision") patchForm({ fechaEmision: value });
    if (target === "fechaProduccion") patchForm({ fechaProduccion: value });
    if (target === "fechaEntregaCliente") patchForm({ fechaEntregaCliente: value });
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;
    setDateValue(dateTarget, formatDateDMY(selectedDate));
  };

  const buildPayload = useCallback(
    () => ({
      ...form,
      para: safe(form.para),
      de: safe(form.de),
      fechaEmision: safe(form.fechaEmision),
      folioRam: safe(form.folioRam),
      razonSocial: safe(form.razonSocial),
      direccion: safe(form.direccion),
      tipoControl: safe(form.tipoControl),
      fechaProduccion: safe(form.fechaProduccion),
      estadoContrato: safe(form.estadoContrato),
      postventaMeses: safe(form.postventaMeses),
      contratoAnios: safe(form.contratoAnios),
      noOrdenMx: safe(form.noOrdenMx),
      noOrdenPlanta: safe(form.noOrdenPlanta),
      numeroEquipo: safe(form.numeroEquipo),
      tipoEquipo: safe(form.tipoEquipo),
      modelo: safe(form.modelo),
      fechaEntregaCliente: safe(form.fechaEntregaCliente),
      mesesGarantia: safe(form.mesesGarantia),
      descripcionProblema: safe(form.descripcionProblema),
      causaProblema: safe(form.causaProblema),
      estadoEquipo: safe(form.estadoEquipo),
      estadoEquipoDetalles: safe(form.estadoEquipoDetalles),
      reportadoPor: safe(form.reportadoPor),
      revisoMantenimiento: safe(form.revisoMantenimiento),
      revisoControlCalidad: safe(form.revisoControlCalidad),
      anexo: safe(form.anexo),
      refacciones: (form.refacciones || []).map((r) => ({
        nombre: safe(r.nombre),
        noDibujo: safe(r.noDibujo),
        cantidad: safe(r.cantidad),
        costo: safe(r.costo),
      })),
    }),
    [form]
  );

  const generarPdfLocal = useCallback(async () => {
    const html = buildReporteAveriaMantenimientoHtml(buildPayload());
    const result = await Print.printToFileAsync({ html, base64: false });

    setPreviewHtml(html);
    setPdfUri(result.uri);

    return { html, uri: result.uri };
  }, [buildPayload]);

  const generarPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setPdfUri(null);
      setShowPreview(true);
      await generarPdfLocal();
    } catch (e) {
      console.log("[RAM PDF] preview error:", e);
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
      if (!uri) {
        const result = await generarPdfLocal();
        uri = result.uri;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite abrir o compartir archivos."
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Abrir / compartir Reporte de Avería en Mantenimiento",
      });
    } catch (e) {
      console.log("[RAM PDF] share error:", e);
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const selectedMeasures = useMemo(() => {
    const a = Object.entries(form.medidasImplementadas || {}).filter(
      ([key, value]) => key !== "detalle" && value === true
    ).length;
    const b = Object.entries(form.medidasRequeridasCC || {}).filter(
      ([key, value]) => key !== "detalle" && value === true
    ).length;
    const c = Object.entries(form.respuestaCC || {}).filter(
      ([key, value]) => key !== "detalle" && value === true
    ).length;
    return a + b + c;
  }, [form.medidasImplementadas, form.medidasRequeridasCC, form.respuestaCC]);

  const renderProgress = () => {
    const pct = Math.round(((activeStep + 1) / STEPS.length) * 100);

    return (
      <View style={styles.progressBox}>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.progressEyebrow}>
              Paso {activeStep + 1} de {STEPS.length}
            </Text>
            <Text style={styles.progressCurrent}>{STEPS[activeStep].title}</Text>
          </View>
          <Text style={styles.progressPercent}>{pct}%</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepLinks}
        >
          {STEPS.map((step, index) => {
            const active = index === activeStep;
            const done = index < activeStep;
            return (
              <TouchableOpacity
                key={step.key}
                style={[styles.stepLink, active && styles.stepLinkActive]}
                onPress={() => setActiveStep(index)}
                activeOpacity={0.86}
              >
                <View
                  style={[
                    styles.stepDot,
                    active && styles.stepDotActive,
                    done && styles.stepDotDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepDotText,
                      (active || done) && styles.stepDotTextActive,
                    ]}
                  >
                    {done ? "✓" : index + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLinkText, active && styles.stepLinkTextActive]}>
                  {step.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderGeneral = () => (
    <>
      <View style={styles.introCard}>
        <View style={styles.introTextWrap}>
          <Text style={styles.introKicker}>Formato técnico</Text>
          <Text style={styles.introTitle}>Reporte de Avería en Mantenimiento</Text>
          <Text style={styles.introText}>
            Captura la información del R.A.M. y genera el documento sin bloquear campos vacíos.
          </Text>
        </View>

        <TouchableOpacity style={styles.quickPreview} onPress={generarPreviewPdf}>
          <Ionicons name="eye-outline" size={17} color={UI.primary} />
          <Text style={styles.quickPreviewText}>Ver PDF</Text>
        </TouchableOpacity>
      </View>

      <Section
        title="Encabezado del R.A.M."
        subtitle="Destino, emisor, fecha y folio asignado por Control de Calidad."
        icon="document-text-outline"
      >
        <Input
          label="Para"
          value={form.para}
          onChangeText={(v) => patchForm({ para: v })}
          placeholder="Control de Calidad"
          icon="send-outline"
        />

        <Input
          label="De"
          value={form.de}
          onChangeText={(v) => patchForm({ de: v })}
          placeholder="Nombre / departamento"
          icon="person-outline"
        />

        <FieldRow>
          <Field>
            <DateButton
              label="Fecha de emisión"
              value={form.fechaEmision}
              onPress={() => setDateTarget("fechaEmision")}
            />
          </Field>

          <Field>
            <Input
              label="Folio de RAM (por C.C.)"
              value={form.folioRam}
              onChangeText={(v) => patchForm({ folioRam: v })}
              placeholder="Folio"
              icon="reader-outline"
            />
          </Field>
        </FieldRow>
      </Section>

      <Section
        title="Resumen de la orden"
        subtitle="Los datos pueden precargarse desde la orden y seguir siendo editables."
        icon="information-circle-outline"
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Orden MX" value={form.noOrdenMx || safeOrderId} />
          <InfoItem label="Equipo" value={form.numeroEquipo} />
          <InfoItem label="Cliente" value={form.razonSocial} />
          <InfoItem label="Reportado por" value={form.reportadoPor || tecnicoPrincipal} />
        </View>
      </Section>
    </>
  );

  const renderEquipo = () => (
    <>
      <Section
        title="Cliente y contrato"
        subtitle="Datos comerciales y vigencia relacionada con el equipo."
        icon="business-outline"
      >
        <Input
          label="Razón social"
          value={form.razonSocial}
          onChangeText={(v) => patchForm({ razonSocial: v })}
          placeholder="Cliente / empresa"
          icon="business-outline"
        />

        <Input
          label="Dirección"
          value={form.direccion}
          onChangeText={(v) => patchForm({ direccion: v })}
          placeholder="Dirección completa"
          icon="location-outline"
          multiline
        />

        <FieldRow>
          <Field>
            <Input
              label="Tipo de control"
              value={form.tipoControl}
              onChangeText={(v) => patchForm({ tipoControl: v })}
              placeholder="Tipo de control"
              icon="options-outline"
            />
          </Field>
          <Field>
            <DateButton
              label="Fecha de producción"
              value={form.fechaProduccion}
              onPress={() => setDateTarget("fechaProduccion")}
            />
          </Field>
        </FieldRow>

        <Label>Estado de contrato</Label>
        <View style={styles.choiceWrap}>
          <Choice
            label="Postventa"
            active={form.estadoContrato === "Postventa"}
            onPress={() => patchForm({ estadoContrato: "Postventa" })}
          />
          <Choice
            label="Contrato"
            active={form.estadoContrato === "Contrato"}
            onPress={() => patchForm({ estadoContrato: "Contrato" })}
          />
        </View>

        <FieldRow>
          <Field>
            <Input
              label="Postventa por meses"
              value={form.postventaMeses}
              onChangeText={(v) => patchForm({ postventaMeses: v })}
              placeholder="Meses"
              keyboardType="numeric"
              icon="calendar-number-outline"
            />
          </Field>
          <Field>
            <Input
              label="Contrato por años"
              value={form.contratoAnios}
              onChangeText={(v) => patchForm({ contratoAnios: v })}
              placeholder="Años"
              keyboardType="numeric"
              icon="calendar-outline"
            />
          </Field>
        </FieldRow>
      </Section>

      <Section
        title="Identificación del equipo"
        subtitle="Orden, planta, equipo, modelo, entrega y garantía."
        icon="construct-outline"
      >
        <FieldRow>
          <Field>
            <Input
              label="No. orden MX"
              value={form.noOrdenMx}
              onChangeText={(v) => patchForm({ noOrdenMx: v })}
              placeholder="Orden MX"
              icon="barcode-outline"
            />
          </Field>
          <Field>
            <Input
              label="No. orden de planta"
              value={form.noOrdenPlanta}
              onChangeText={(v) => patchForm({ noOrdenPlanta: v })}
              placeholder="Orden de planta"
              icon="business-outline"
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Input
              label="Número de equipo"
              value={form.numeroEquipo}
              onChangeText={(v) => patchForm({ numeroEquipo: v })}
              placeholder="Equipo"
              icon="construct-outline"
            />
          </Field>
          <Field>
            <Input
              label="Modelo"
              value={form.modelo}
              onChangeText={(v) => patchForm({ modelo: v })}
              placeholder="Modelo"
              icon="layers-outline"
            />
          </Field>
        </FieldRow>

        <Label>Tipo de equipo</Label>
        <View style={styles.choiceWrap}>
          <Choice
            label="Elevador"
            active={form.tipoEquipo === "Elevador"}
            onPress={() => patchForm({ tipoEquipo: "Elevador" })}
          />
          <Choice
            label="Escalera"
            active={form.tipoEquipo === "Escalera"}
            onPress={() => patchForm({ tipoEquipo: "Escalera" })}
          />
        </View>

        <FieldRow>
          <Field>
            <DateButton
              label="Fecha de entrega al cliente"
              value={form.fechaEntregaCliente}
              onPress={() => setDateTarget("fechaEntregaCliente")}
            />
          </Field>
          <Field>
            <Input
              label="Meses de garantía"
              value={form.mesesGarantia}
              onChangeText={(v) => patchForm({ mesesGarantia: v })}
              placeholder="Meses"
              keyboardType="numeric"
              icon="shield-checkmark-outline"
            />
          </Field>
        </FieldRow>
      </Section>
    </>
  );

  const renderProblema = () => (
    <>
      <Section
        title="Descripción del problema"
        subtitle="Describe qué ocurrió y cómo se manifestó la avería."
        icon="alert-circle-outline"
      >
        <Input
          label="Descripción"
          value={form.descripcionProblema}
          onChangeText={(v) => patchForm({ descripcionProblema: v })}
          placeholder="Describe el problema..."
          icon="alert-circle-outline"
          multiline
        />
      </Section>

      <Section
        title="Causa del problema"
        subtitle="Registra la causa identificada o el diagnóstico preliminar."
        icon="search-outline"
      >
        <Input
          label="Causa"
          value={form.causaProblema}
          onChangeText={(v) => patchForm({ causaProblema: v })}
          placeholder="Causa raíz / diagnóstico..."
          icon="search-outline"
          multiline
        />
      </Section>
    </>
  );

  const renderRefacciones = () => (
    <>
      <Section
        title="Refacciones involucradas"
        subtitle="El formato PDF reserva siete renglones; puedes agregar los que necesites."
        icon="cube-outline"
      >
        {form.refacciones.map((r, idx) => (
          <View key={`ref-${idx}`} style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <View>
                <Text style={styles.rowTitle}>Refacción {idx + 1}</Text>
                <Text style={styles.rowSub}>Nombre, dibujo, cantidad y costo</Text>
              </View>

              <TouchableOpacity onPress={() => removeRefaccion(idx)}>
                <Text style={styles.removeTxt}>Eliminar</Text>
              </TouchableOpacity>
            </View>

            <Input
              label="Nombre"
              value={r.nombre}
              onChangeText={(v) => updateRefaccion(idx, "nombre", v)}
              placeholder="Nombre de la refacción"
              icon="cube-outline"
            />

            <FieldRow>
              <Field>
                <Input
                  label="No. de dibujo"
                  value={r.noDibujo}
                  onChangeText={(v) => updateRefaccion(idx, "noDibujo", v)}
                  placeholder="No. dibujo"
                  icon="document-outline"
                />
              </Field>
              <Field small>
                <Input
                  label="Cantidad"
                  value={r.cantidad}
                  onChangeText={(v) => updateRefaccion(idx, "cantidad", v)}
                  placeholder="1"
                  keyboardType="numeric"
                  icon="calculator-outline"
                />
              </Field>
              <Field small>
                <Input
                  label="Costo"
                  value={r.costo}
                  onChangeText={(v) => updateRefaccion(idx, "costo", v)}
                  placeholder="$"
                  keyboardType="numeric"
                  icon="cash-outline"
                />
              </Field>
            </FieldRow>
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addRefaccion}>
          <Ionicons name="add-circle-outline" size={18} color={UI.primary} />
          <Text style={styles.addButtonText}>Agregar refacción</Text>
        </TouchableOpacity>
      </Section>

      <Section
        title="Estado en que queda el equipo"
        subtitle="Selecciona el estado final y agrega los detalles necesarios."
        icon="pulse-outline"
      >
        <View style={styles.choiceWrap}>
          <Choice
            label="Operando"
            tone="success"
            active={form.estadoEquipo === "Operando"}
            onPress={() => patchForm({ estadoEquipo: "Operando" })}
          />
          <Choice
            label="Detenido"
            tone="danger"
            active={form.estadoEquipo === "Detenido"}
            onPress={() => patchForm({ estadoEquipo: "Detenido" })}
          />
        </View>

        <Input
          label="Detalles"
          value={form.estadoEquipoDetalles}
          onChangeText={(v) => patchForm({ estadoEquipoDetalles: v })}
          placeholder="Condición final del equipo..."
          multiline
          icon="document-text-outline"
        />
      </Section>
    </>
  );

  const renderCheckSection = (title, subtitle, icon, options, sectionKey) => (
    <Section title={title} subtitle={subtitle} icon={icon}>
      <View style={styles.checkList}>
        {options.map(([key, label]) => (
          <CheckRow
            key={key}
            label={label}
            value={!!form[sectionKey]?.[key]}
            onChange={(value) => patchSection(sectionKey, { [key]: value })}
          />
        ))}
      </View>

      <Input
        label="Detalle / observaciones"
        value={form[sectionKey]?.detalle || ""}
        onChangeText={(v) => patchSection(sectionKey, { detalle: v })}
        placeholder="Describe información adicional..."
        multiline
        icon="create-outline"
      />
    </Section>
  );

  const renderMedidas = () => (
    <>
      <View style={styles.statusNote}>
        <Ionicons name="checkmark-done-outline" size={18} color={UI.primary} />
        <Text style={styles.statusNoteText}>
          Has marcado {selectedMeasures} medida{selectedMeasures === 1 ? "" : "s"} en total.
        </Text>
      </View>

      {renderCheckSection(
        "Medidas implementadas",
        "Acciones tomadas por mantenimiento ante la avería.",
        "hammer-outline",
        MEDIDAS_IMPLEMENTADAS,
        "medidasImplementadas"
      )}

      {renderCheckSection(
        "Medidas requeridas por Control de Calidad",
        "Solicitudes que se envían a Control de Calidad.",
        "shield-checkmark-outline",
        MEDIDAS_REQUERIDAS,
        "medidasRequeridasCC"
      )}

      {renderCheckSection(
        "Respuesta de Control de Calidad y contramedidas",
        "Acciones o respuesta establecida por Control de Calidad.",
        "chatbox-ellipses-outline",
        RESPUESTAS_CC,
        "respuestaCC"
      )}
    </>
  );

  const renderCierre = () => (
    <>
      <Section
        title="Responsables"
        subtitle="Nombres o referencias de firma y sello del documento."
        icon="people-outline"
      >
        <Input
          label="Reportado por"
          value={form.reportadoPor}
          onChangeText={(v) => patchForm({ reportadoPor: v })}
          placeholder="Nombre"
          icon="person-outline"
        />

        <Input
          label="Revisó en mantenimiento"
          value={form.revisoMantenimiento}
          onChangeText={(v) => patchForm({ revisoMantenimiento: v })}
          placeholder="Gerencia / Subdirección / Dirección"
          icon="person-circle-outline"
        />

        <Input
          label="Revisó en Control de Calidad"
          value={form.revisoControlCalidad}
          onChangeText={(v) => patchForm({ revisoControlCalidad: v })}
          placeholder="Gerencia / Subdirección / Dirección"
          icon="shield-outline"
        />
      </Section>

      <Section
        title="Hoja anexa"
        subtitle="El documento original incluye una segunda página para información complementaria."
        icon="documents-outline"
      >
        <Input
          label="Información complementaria"
          value={form.anexo}
          onChangeText={(v) => patchForm({ anexo: v })}
          placeholder="Notas, evidencia descrita o información para la hoja anexa..."
          multiline
          icon="document-attach-outline"
        />
      </Section>

      <Section
        title="Guardar borrador"
        subtitle="Conserva el avance localmente en este dispositivo."
        icon="save-outline"
      >
        <TouchableOpacity style={styles.saveInsideButton} onPress={saveDraft}>
          <Ionicons name="save-outline" size={18} color="#FFFFFF" />
          <Text style={styles.saveInsideText}>Guardar borrador</Text>
        </TouchableOpacity>
      </Section>
    </>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderEquipo();
    if (activeStep === 2) return renderProblema();
    if (activeStep === 3) return renderRefacciones();
    if (activeStep === 4) return renderMedidas();
    return renderCierre();
  };

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={UI.primary} />
        <Text style={styles.loadingTitle}>Preparando R.A.M.</Text>
        <Text style={styles.loadingText}>Cargando datos y borrador local…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Reporte de avería en mantenimiento" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {renderProgress()}
        {renderStepContent()}

        {dateTarget && (
          <DateTimePicker
            value={parseDMYToDate(getDateValue(dateTarget))}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        )}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navSecondary, activeStep === 0 && styles.navDisabled]}
            onPress={goBack}
            disabled={activeStep === 0}
          >
            <Ionicons
              name="arrow-back-outline"
              size={18}
              color={activeStep === 0 ? UI.muted2 : UI.primary}
            />
            <Text
              style={[
                styles.navSecondaryText,
                activeStep === 0 && styles.navDisabledText,
              ]}
            >
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navPrimary,
              activeStep === STEPS.length - 1 && styles.navDisabled,
            ]}
            onPress={goNext}
            disabled={activeStep === STEPS.length - 1}
          >
            <Text
              style={[
                styles.navPrimaryText,
                activeStep === STEPS.length - 1 && styles.navDisabledText,
              ]}
            >
              Siguiente
            </Text>
            <Ionicons
              name="arrow-forward-outline"
              size={18}
              color={activeStep === STEPS.length - 1 ? UI.muted2 : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.draftBtn} onPress={saveDraft}>
          <Ionicons name="save-outline" size={18} color={UI.primary} />
          <Text style={styles.draftBtnText}>Borrador</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.previewBtn}
          onPress={generarPreviewPdf}
          disabled={generatingPdf}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
              <Text style={styles.previewBtnText}>Vista previa</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={abrirPdf}
          disabled={generatingPdf}
        >
          <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
          <Text style={styles.shareBtnText}>PDF</Text>
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
                <Text style={styles.modalKicker}>Documento R.A.M.</Text>
                <Text style={styles.modalTitle}>Vista previa del PDF</Text>
              </View>

              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowPreview(false)}
              >
                <Ionicons name="close" size={20} color={UI.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.webWrap}>
              {generatingPdf || !previewHtml ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={UI.primary} />
                  <Text style={styles.loadingText}>Generando documento…</Text>
                </View>
              ) : (
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: previewHtml }}
                  style={styles.webview}
                />
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalLightBtn}
                onPress={() => setShowPreview(false)}
              >
                <Text style={styles.modalLightText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={abrirPdf}>
                <Ionicons name="share-outline" size={17} color="#FFFFFF" />
                <Text style={styles.modalPrimaryText}>Abrir / compartir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: UI.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingTitle: {
    marginTop: 14,
    color: UI.text,
    fontSize: 18,
    fontWeight: "800",
  },
  loadingText: {
    marginTop: 4,
    color: UI.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    padding: 16,
    paddingBottom: 128,
  },
  introCard: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  introTextWrap: {
    flex: 1,
  },
  introKicker: {
    color: UI.primary,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  introTitle: {
    color: UI.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 2,
  },
  introText: {
    color: UI.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  quickPreview: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    backgroundColor: UI.cardSoft,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickPreviewText: {
    color: UI.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  progressBox: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressEyebrow: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  progressCurrent: {
    color: UI.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2,
  },
  progressPercent: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#E8EDF3",
    borderRadius: 99,
    marginTop: 11,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: UI.primary,
    borderRadius: 99,
  },
  stepLinks: {
    gap: 8,
    paddingTop: 12,
    paddingRight: 6,
  },
  stepLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  stepLinkActive: {
    backgroundColor: UI.primarySoft,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E9EEF4",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: UI.primary,
  },
  stepDotDone: {
    backgroundColor: UI.success,
  },
  stepDotText: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  stepDotTextActive: {
    color: "#FFFFFF",
  },
  stepLinkText: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  stepLinkTextActive: {
    color: UI.primary,
  },
  section: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: UI.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    color: UI.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: UI.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 145,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    padding: 11,
  },
  infoLabel: {
    color: UI.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  infoValue: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
    lineHeight: 17,
  },
  inputBlock: {
    marginBottom: 11,
  },
  label: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  inputWrap: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputWrapMultiline: {
    alignItems: "flex-start",
  },
  readonlyWrap: {
    backgroundColor: "#F1F4F7",
  },
  input: {
    flex: 1,
    color: UI.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
  },
  textArea: {
    minHeight: 108,
    textAlignVertical: "top",
    paddingTop: 11,
  },
  dateButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateButtonText: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "700",
  },
  placeholderText: {
    color: UI.muted2,
  },
  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  field: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 155,
  },
  fieldSmall: {
    minWidth: 105,
  },
  fieldWide: {
    minWidth: 220,
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  choice: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  choicePrimaryActive: {
    backgroundColor: UI.primarySoft,
    borderColor: "#9DB5D4",
  },
  choiceSuccessActive: {
    backgroundColor: UI.successSoft,
    borderColor: "#9DD5BF",
  },
  choiceWarningActive: {
    backgroundColor: UI.warningSoft,
    borderColor: "#E4BE7E",
  },
  choiceDangerActive: {
    backgroundColor: UI.dangerSoft,
    borderColor: "#E8AEAE",
  },
  radioOuter: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: UI.muted2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: UI.primary,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: UI.primary,
  },
  choiceText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
  },
  choiceTextActive: {
    color: UI.primary,
  },
  rowCard: {
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  rowTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "800",
  },
  rowSub: {
    color: UI.muted,
    fontSize: 10,
    marginTop: 2,
  },
  removeTxt: {
    color: UI.danger,
    fontSize: 11,
    fontWeight: "800",
  },
  addButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: UI.borderDark,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  addButtonText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  checkList: {
    gap: 7,
    marginBottom: 12,
  },
  checkRow: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.cardSoft,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  checkRowActive: {
    backgroundColor: UI.primarySoft,
    borderColor: "#B8C9DE",
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: UI.muted2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxActive: {
    backgroundColor: UI.primary,
    borderColor: UI.primary,
  },
  checkLabel: {
    flex: 1,
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  statusNote: {
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusNoteText: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  saveInsideButton: {
    minHeight: 46,
    backgroundColor: UI.dark,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  saveInsideText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  navRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 2,
  },
  navSecondary: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: UI.primary,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  navPrimary: {
    flex: 1,
    minHeight: 46,
    backgroundColor: UI.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  navSecondaryText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  navPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  navDisabled: {
    opacity: 0.42,
  },
  navDisabledText: {
    color: UI.muted2,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 25 : 13,
    backgroundColor: "rgba(244,246,248,0.98)",
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },
  draftBtn: {
    flex: 0.9,
    minHeight: 50,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  draftBtnText: {
    color: UI.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  previewBtn: {
    flex: 1.25,
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  previewBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  shareBtn: {
    flex: 0.75,
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: UI.dark,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23,32,51,0.58)",
    padding: 12,
    justifyContent: "center",
  },
  modalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
  },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalKicker: {
    color: UI.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modalTitle: {
    color: UI.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 1,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: UI.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  webWrap: {
    flex: 1,
    backgroundColor: "#F2F4F7",
    padding: 7,
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalFooter: {
    padding: 11,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    flexDirection: "row",
    gap: 9,
  },
  modalLightBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: UI.borderDark,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalLightText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "800",
  },
  modalPrimaryBtn: {
    flex: 1.4,
    minHeight: 44,
    backgroundColor: UI.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  modalPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});