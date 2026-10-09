// app/tecnico/ordenes/[orderid]/mantto-freno-em-eh.js
// Diseño simple y técnico para Mantenimiento Freno EM/EH.
// Mantiene la vista previa del PDF sin validaciones bloqueantes.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildManttoFrenoEmEhHtml } from "../../../../src/services/templates/mantto_freno_em_eh/buildManttoFrenoEmEhHtml";

const UI = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  cardSoft: "#F8FAFC",
  border: "#E4E7EC",
  borderDark: "#D0D5DD",
  text: "#172033",
  muted: "#667085",
  muted2: "#98A2B3",
  blue: "#123A72",
  blue2: "#123A72",
  blueSoft: "#EFF4FF",
  green: "#15803D",
  greenSoft: "#F0FDF4",
  yellow: "#B45309",
  yellowSoft: "#FFFBEB",
  red: "#B42318",
  redSoft: "#FEF3F2",
};

const STEPS = [
  { key: "general", title: "General", short: "Orden" },
  { key: "revision1", title: "Revisión 1", short: "Pines / Torque" },
  { key: "revision2", title: "Revisión 2", short: "Resorte / Émbolo" },
  { key: "revision3", title: "Revisión 3", short: "Brazo / Tambor" },
  { key: "fotos", title: "Fotos", short: "Evidencia" },
  { key: "resultado", title: "Resultado", short: "Cierre" },
];

const safeStr = (v) => String(v ?? "").trim();

function getUserName(user) {
  return safeStr(
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

function fmtDate(value) {
  if (!value) return "";
  if (typeof value === "string" && value.includes("/")) return value;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeStr(value);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function createDefaultForm(orderid = "") {
  return {
    orderid,
    tipo_reporte: "overhaul",
    tipo_mt: "",
    velocidad_nominal: "",
    capacidad: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",

    pines_levas: {
      kitLubricacion: {
        oxido_antes: false,
        oxido_despues: false,
        lubricacion_antes: "bien",
        lubricacion_despues: "bien",
      },
      kitLibre: {
        giro_antes: "bien",
        giro_despues: "bien",
        cubierta_antes: false,
        cubierta_despues: false,
      },
      revisado: true,
      revision_sma: "Ok",
    },

    torque: {
      medicion1_antes: "",
      medicion1_despues: "",
      medicion2_antes: "",
      medicion2_despues: "",
      medicion3_antes: "",
      medicion3_despues: "",
      promedio_antes: "",
      promedio_despues: "",
      estado_antes: "bien",
      estado_despues: "bien",
      revisado: true,
      revision_sma: "Ok",
    },

    resorte: {
      izq_mm_antes: "",
      izq_pct_antes: "",
      izq_mm_despues: "",
      izq_pct_despues: "",
      der_mm_antes: "",
      der_pct_antes: "",
      der_mm_despues: "",
      der_pct_despues: "",
      estado_antes: "bien",
      estado_despues: "bien",
      revisado: true,
      revision_sma: "Ok",
    },

    embolo: {
      recorrido_izq_antes: "",
      recorrido_izq_despues: "",
      recorrido_der_antes: "",
      recorrido_der_despues: "",
      desgaste_antes: false,
      desgaste_despues: false,
      oxido_antes: false,
      oxido_despues: false,
      lubricacion_antes: "bien",
      lubricacion_despues: "bien",
      arandela_antes: "",
      arandela_despues: "",
      revisado: true,
      revision_sma: "Ok",
    },

    contacto: {
      izq_antes: "",
      izq_despues: "",
      der_antes: "",
      der_despues: "",
      punto_antes: "bien",
      punto_despues: "bien",
      revisado: true,
      revision_sma: "Ok",
    },

    brazo: {
      desgaste_izq_antes: false,
      desgaste_izq_despues: false,
      desgaste_der_antes: false,
      desgaste_der_despues: false,
      oxido_izq_antes: false,
      oxido_izq_despues: false,
      oxido_der_antes: false,
      oxido_der_despues: false,
      lubricacion_izq_antes: "bien",
      lubricacion_izq_despues: "bien",
      lubricacion_der_antes: "bien",
      lubricacion_der_despues: "bien",
      revisado: true,
      revision_sma: "Ok",
    },

    tambor: {
      desgaste_antes: false,
      desgaste_despues: false,
      aceite_antes: false,
      aceite_despues: false,
      oxido_antes: false,
      oxido_despues: false,
      revisado: true,
      revision_sma: "Ok",
    },

    balatas: {
      izquierdo_antes: false,
      izquierdo_despues: false,
      derecho_antes: false,
      derecho_despues: false,
      revisado: true,
      revision_sma: "Ok",
    },

    operacion: {
      antes: "bien",
      despues: "bien",
      revisado: true,
      revision_sma: "Ok",
    },

    observaciones: "",
    resultado_total: {
      bien: true,
      seguimiento: false,
      detalle: "",
    },

    fotos: {
      embolo_antes: "",
      embolo_despues: "",
      revestimiento_izq: "",
      revestimiento_der: "",
      brazo_izq_antes: "",
      brazo_izq_despues: "",
      brazo_der_antes: "",
      brazo_der_despues: "",
      otro_1_titulo: "",
      otro_1_antes: "",
      otro_1_despues: "",
      otro_2_titulo: "",
      otro_2_antes: "",
      otro_2_despues: "",
    },
  };
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

const Input = ({ style, ...props }) => (
  <TextInput
    {...props}
    placeholderTextColor={UI.muted2}
    style={[styles.input, style]}
  />
);

const Toggle = ({ value, onValueChange }) => (
  <Switch
    value={!!value}
    onValueChange={onValueChange}
    trackColor={{ false: "#D0D5DD", true: "#AFC7E8" }}
    thumbColor={value ? UI.blue : "#FFFFFF"}
  />
);

const Chip = ({ active, children, onPress, tone = "blue" }) => {
  const activeStyle =
    tone === "green"
      ? styles.chipGreen
      : tone === "yellow"
      ? styles.chipYellow
      : tone === "red"
      ? styles.chipRed
      : styles.chipBlue;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={[styles.chip, active && activeStyle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
};

const InfoItem = ({ label, value }) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text numberOfLines={2} style={styles.infoValue}>
      {String(value || "—")}
    </Text>
  </View>
);

const StatBox = ({ label, value, tone = "blue" }) => {
  const boxStyle =
    tone === "green"
      ? styles.statGreen
      : tone === "yellow"
      ? styles.statYellow
      : tone === "red"
      ? styles.statRed
      : styles.statBlue;

  return (
    <View style={[styles.statBox, boxStyle]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Field({ children, small = false, wide = false }) {
  return (
    <View style={[styles.field, small && styles.fieldSmall, wide && styles.fieldWide]}>
      {children}
    </View>
  );
}

function SectionBox({ title, subtitle, children }) {
  return (
    <View style={styles.sectionBox}>
      <View style={styles.sectionTop}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>

      {children}
    </View>
  );
}

function BoolField({ label, value, onChange }) {
  return (
    <View style={styles.boolCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.boolTitle}>{label}</Text>
        <Text style={styles.boolHint}>{value ? "Marcado como Sí" : "Marcado como No"}</Text>
      </View>

      <View style={styles.boolRight}>
        <Text style={styles.boolValue}>{value ? "Sí" : "No"}</Text>
        <Toggle value={value} onValueChange={onChange} />
      </View>
    </View>
  );
}

function BienMalField({ label, value, onChange }) {
  return (
    <View style={styles.statusBlock}>
      <Label>{label}</Label>

      <View style={styles.chipsWrap}>
        <Chip tone="green" active={value === "bien"} onPress={() => onChange("bien")}>
          Bien
        </Chip>

        <Chip tone="red" active={value === "mal"} onPress={() => onChange("mal")}>
          Mal
        </Chip>
      </View>
    </View>
  );
}

function PhotoField({ label, value, onCamera, onGallery, onRemove }) {
  const hasPhoto = !!safeStr(value);

  return (
    <View style={[styles.photoField, hasPhoto && styles.photoFieldActive]}>
      <View style={styles.photoIcon}>
        <Text style={styles.photoIconText}>{hasPhoto ? "✓" : "+"}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.photoLabel}>{label}</Text>
        <Text style={[styles.photoStatus, hasPhoto && styles.photoStatusActive]}>
          {hasPhoto ? "Foto agregada al reporte" : "Sin foto"}
        </Text>
      </View>

      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.photoBtn} onPress={onCamera} activeOpacity={0.86}>
          <Text style={styles.photoBtnText}>Cámara</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.photoBtnLight} onPress={onGallery} activeOpacity={0.86}>
          <Text style={styles.photoBtnLightText}>Galería</Text>
        </TouchableOpacity>

        {hasPhoto ? (
          <TouchableOpacity style={styles.photoRemoveBtn} onPress={onRemove} activeOpacity={0.86}>
            <Text style={styles.photoRemoveText}>Quitar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function ManttoFrenoEmEhScreen() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState(null);

  const [auto, setAuto] = useState({
    orden: "",
    cliente: "",
    equipo: "",
    tecnico_nombre: "",
    start_date: "",
  });

  const [form, setForm] = useState(() => createDefaultForm(""));
  const [activeStep, setActiveStep] = useState(0);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const patchForm = (patch) => {
    setPdfUri(null);
    setForm((s) => ({ ...s, ...patch }));
  };

  const patchSection = (section, patch) => {
    setPdfUri(null);
    setForm((s) => ({
      ...s,
      [section]: {
        ...(s[section] || {}),
        ...patch,
      },
    }));
  };

  const patchNested = (section, group, patch) => {
    setPdfUri(null);
    setForm((s) => ({
      ...s,
      [section]: {
        ...(s[section] || {}),
        [group]: {
          ...(s[section]?.[group] || {}),
          ...patch,
        },
      },
    }));
  };

  const setFoto = (key, value) => {
    setPdfUri(null);
    setForm((s) => ({
      ...s,
      fotos: {
        ...(s.fotos || {}),
        [key]: value,
      },
    }));
  };

  const tomarFoto = async (key) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();

      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Permite acceso a la cámara para tomar fotos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.45,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      const base64 = asset?.base64;

      if (!base64) {
        Alert.alert("Error", "No se pudo obtener la foto.");
        return;
      }

      const mime = asset?.mimeType || "image/jpeg";
      setFoto(key, `data:${mime};base64,${base64}`);
    } catch (e) {
      console.log("[ManttoFrenoEmEh] tomarFoto error:", e);
      Alert.alert("Error", "No se pudo tomar la foto.");
    }
  };

  const seleccionarFoto = async (key) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Permite acceso a la galería para seleccionar fotos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.45,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      const base64 = asset?.base64;

      if (!base64) {
        Alert.alert("Error", "No se pudo obtener la imagen.");
        return;
      }

      const mime = asset?.mimeType || "image/jpeg";
      setFoto(key, `data:${mime};base64,${base64}`);
    } catch (e) {
      console.log("[ManttoFrenoEmEh] seleccionarFoto error:", e);
      Alert.alert("Error", "No se pudo seleccionar la foto.");
    }
  };

  const quitarFoto = (key) => setFoto(key, "");

  const cargarOrden = useCallback(async () => {
    const oid = safeStr(orderid);

    if (!oid || oid === "[orderid]") {
      setLoading(false);
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    try {
      setLoading(true);

      const resOrden = await api.get(`/api/ordenes/sap/${oid}`);
      const dataOrden = resOrden?.data || {};
      let clienteFromAddress = "";

      try {
        const resAddr = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${oid}')/ToAddresses`
        );

        const results = resAddr?.data?.d?.results || resAddr?.data?.results || [];
        clienteFromAddress = safeStr(results?.[0]?.Name1);
      } catch (addrError) {
        console.log(
          "[ManttoFrenoEmEh] ToAddresses error:",
          addrError?.response?.data || addrError?.message || addrError
        );
      }

      const data = {
        ...dataOrden,
        cliente: clienteFromAddress || dataOrden?.cliente || dataOrden?.Name1 || "",
      };

      const autoData = {
        orden: safeStr(data?.Orderid || data?.OrderId || oid),
        cliente: safeStr(data?.cliente || ""),
        equipo: safeStr(data?.equipment || data?.Equipment || data?.equipo || data?.Equnr || ""),
        tecnico_nombre: getUserName(user),
        start_date: safeStr(data?.start_date || data?.StartDate || data?.fecha || ""),
      };

      setOrden(data);
      setAuto(autoData);

      setForm((s) => ({
        ...s,
        orderid: autoData.orden || oid,
        fecha: s.fecha || fmtDate(autoData.start_date),
      }));
    } catch (e) {
      console.log("[ManttoFrenoEmEh] cargarOrden error:", e?.response?.data || e);

      const oid = safeStr(orderid);

      setOrden({ Orderid: oid });
      setAuto({
        orden: oid,
        cliente: "",
        equipo: "",
        tecnico_nombre: getUserName(user),
        start_date: "",
      });

      setForm((s) => ({ ...s, orderid: oid }));

      Alert.alert(
        "Aviso",
        "No se pudieron cargar todos los datos de la orden. Puedes llenar el formulario y generar el PDF."
      );
    } finally {
      setLoading(false);
    }
  }, [orderid, user]);

  useEffect(() => {
    cargarOrden();
  }, [cargarOrden]);

  const photoCount = useMemo(() => {
    const fotos = form.fotos || {};
    return Object.keys(fotos).filter((key) => key.includes("antes") || key.includes("despues") || key.includes("revestimiento") || key.includes("brazo")).filter(
      (key) => !!safeStr(fotos[key])
    ).length;
  }, [form.fotos]);

  const issueCount = useMemo(() => {
    let count = 0;

    if (form.torque.estado_antes === "mal") count += 1;
    if (form.torque.estado_despues === "mal") count += 1;
    if (form.resorte.estado_antes === "mal") count += 1;
    if (form.resorte.estado_despues === "mal") count += 1;
    if (form.embolo.desgaste_antes) count += 1;
    if (form.embolo.desgaste_despues) count += 1;
    if (form.embolo.oxido_antes) count += 1;
    if (form.embolo.oxido_despues) count += 1;
    if (form.resultado_total.seguimiento) count += 1;

    return count;
  }, [form]);

  function buildHtmlActual() {
    return buildManttoFrenoEmEhHtml({
      orden: {
        ...(orden || {}),
        Orderid: auto?.orden || form?.orderid,
        cliente: auto?.cliente,
        equipment: auto?.equipo,
        tecnico_nombre: auto?.tecnico_nombre,
        start_date: auto?.start_date || form?.fecha,
      },
      form,
      user,
    });
  }

  const abrirPreviewPdf = async () => {
    try {
      const html = buildHtmlActual();
      setPreviewHtml(html);
      setPreviewVisible(true);
    } catch (e) {
      console.log("[ManttoFrenoEmEh] preview error:", e);
      Alert.alert("Error", "No se pudo generar la vista previa.");
    }
  };

  const generarPdf = async () => {
    try {
      setGeneratingPdf(true);

      const html = buildHtmlActual();

      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const cleanOrder = safeStr(auto?.orden || form?.orderid || "orden").replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );

      const fileName = `mantto_freno_em_eh_${cleanOrder}.pdf`;
      const targetUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: result.uri,
        to: targetUri,
      });

      setPdfUri(targetUri);
      return targetUri;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const compartirPdf = async () => {
    try {
      const uri = pdfUri || (await generarPdf());
      const canShare = await Sharing.isAvailableAsync();

      if (!canShare) {
        Alert.alert(
          "PDF generado",
          "El PDF se generó, pero este dispositivo no permite compartir archivos."
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir mantenimiento de freno EM/EH",
      });
    } catch (e) {
      console.log("[ManttoFrenoEmEh] compartir error:", e);
      Alert.alert("Error", "No se pudo generar o compartir el PDF.");
    }
  };

  const goNext = () => {
    setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setActiveStep((s) => Math.max(s - 1, 0));
  };

  const renderStepIndicator = () => (
    <View style={styles.stepperCard}>
      <View style={styles.stepperTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepperEyebrow}>
            Paso {activeStep + 1} de {STEPS.length}
          </Text>
          <Text style={styles.stepperCurrentTitle}>
            {STEPS[activeStep].title}
          </Text>
        </View>

        <Text style={styles.stepperPercent}>
          {Math.round(((activeStep + 1) / STEPS.length) * 100)}%
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${((activeStep + 1) / STEPS.length) * 100}%` },
          ]}
        />
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
              activeOpacity={0.82}
              onPress={() => setActiveStep(index)}
              style={[
                styles.stepLink,
                active && styles.stepLinkActive,
                done && styles.stepLinkDone,
              ]}
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
                  {index + 1}
                </Text>
              </View>

              <Text
                style={[
                  styles.stepLinkText,
                  active && styles.stepLinkTextActive,
                  done && styles.stepLinkTextDone,
                ]}
              >
                {step.short}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderGeneral = () => (
    <>
      <SectionBox
        title="Resumen de la orden"
        subtitle="Datos automáticos que se enviarán al PDF."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Orden / Control" value={auto.orden || form.orderid} />
          <InfoItem label="Cliente" value={auto.cliente} />
          <InfoItem label="No. equipo" value={auto.equipo} />
          <InfoItem label="Técnico" value={auto.tecnico_nombre} />
        </View>
      </SectionBox>

      <SectionBox
        title="Datos generales"
        subtitle="Información base del mantenimiento."
      >
        <Label>Tipo de reporte</Label>

        <View style={styles.chipsWrap}>
          <Chip
            active={form.tipo_reporte === "overhaul"}
            onPress={() => patchForm({ tipo_reporte: "overhaul" })}
          >
            Overhaul
          </Chip>

          <Chip
            active={form.tipo_reporte === "ajuste_reparacion_sustitucion"}
            onPress={() => patchForm({ tipo_reporte: "ajuste_reparacion_sustitucion" })}
          >
            Ajuste / reparación / sustitución
          </Chip>
        </View>

        <FieldRow>
          <Field>
            <Label>Fecha</Label>
            <Input
              value={form.fecha}
              onChangeText={(t) => patchForm({ fecha: t })}
              placeholder="DD/MM/AAAA"
            />
          </Field>

          <Field small>
            <Label>Hora inicio</Label>
            <Input
              value={form.hora_inicio}
              onChangeText={(t) => patchForm({ hora_inicio: t })}
              placeholder="08:00"
            />
          </Field>

          <Field small>
            <Label>Hora fin</Label>
            <Input
              value={form.hora_fin}
              onChangeText={(t) => patchForm({ hora_fin: t })}
              placeholder="10:30"
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Label>Tipo de MT</Label>
            <Input
              value={form.tipo_mt}
              onChangeText={(t) => patchForm({ tipo_mt: t })}
              placeholder="Preventivo / Correctivo"
            />
          </Field>

          <Field small>
            <Label>Velocidad nominal</Label>
            <Input
              keyboardType="numeric"
              value={form.velocidad_nominal}
              onChangeText={(t) => patchForm({ velocidad_nominal: t })}
              placeholder="m/min"
            />
          </Field>

          <Field small>
            <Label>Capacidad</Label>
            <Input
              keyboardType="numeric"
              value={form.capacidad}
              onChangeText={(t) => patchForm({ capacidad: t })}
              placeholder="kg"
            />
          </Field>
        </FieldRow>
      </SectionBox>
    </>
  );

  const renderRevision1 = () => (
    <>
      <SectionBox
        title="1. Pines y levas de freno"
        subtitle="Revisión del kit con lubricación y kit libre."
      >
        <View style={styles.groupPill}>
          <Text style={styles.groupPillText}>Kit con lubricación</Text>
        </View>

        <BoolField
          label="Óxido antes"
          value={form.pines_levas.kitLubricacion.oxido_antes}
          onChange={(v) => patchNested("pines_levas", "kitLubricacion", { oxido_antes: v })}
        />

        <BoolField
          label="Óxido después"
          value={form.pines_levas.kitLubricacion.oxido_despues}
          onChange={(v) => patchNested("pines_levas", "kitLubricacion", { oxido_despues: v })}
        />

        <BienMalField
          label="Lubricación antes"
          value={form.pines_levas.kitLubricacion.lubricacion_antes}
          onChange={(v) => patchNested("pines_levas", "kitLubricacion", { lubricacion_antes: v })}
        />

        <BienMalField
          label="Lubricación después"
          value={form.pines_levas.kitLubricacion.lubricacion_despues}
          onChange={(v) => patchNested("pines_levas", "kitLubricacion", { lubricacion_despues: v })}
        />

        <View style={styles.divider} />

        <View style={styles.groupPill}>
          <Text style={styles.groupPillText}>Kit libre de lubricación</Text>
        </View>

        <BienMalField
          label="Giro libre antes"
          value={form.pines_levas.kitLibre.giro_antes}
          onChange={(v) => patchNested("pines_levas", "kitLibre", { giro_antes: v })}
        />

        <BienMalField
          label="Giro libre después"
          value={form.pines_levas.kitLibre.giro_despues}
          onChange={(v) => patchNested("pines_levas", "kitLibre", { giro_despues: v })}
        />

        <BoolField
          label="Cubierta antes"
          value={form.pines_levas.kitLibre.cubierta_antes}
          onChange={(v) => patchNested("pines_levas", "kitLibre", { cubierta_antes: v })}
        />

        <BoolField
          label="Cubierta después"
          value={form.pines_levas.kitLibre.cubierta_despues}
          onChange={(v) => patchNested("pines_levas", "kitLibre", { cubierta_despues: v })}
        />
      </SectionBox>

      <SectionBox
        title="2. Par de torsión / Torque"
        subtitle="Captura mediciones antes/después y estado."
      >
        <FieldRow>
          {["1", "2", "3"].map((n) => (
            <React.Fragment key={n}>
              <Field small>
                <Label>{`Medición ${n} antes`}</Label>
                <Input
                  value={form.torque[`medicion${n}_antes`]}
                  onChangeText={(t) => patchSection("torque", { [`medicion${n}_antes`]: t })}
                  placeholder="Valor"
                />
              </Field>

              <Field small>
                <Label>{`Medición ${n} después`}</Label>
                <Input
                  value={form.torque[`medicion${n}_despues`]}
                  onChangeText={(t) => patchSection("torque", { [`medicion${n}_despues`]: t })}
                  placeholder="Valor"
                />
              </Field>
            </React.Fragment>
          ))}
        </FieldRow>

        <FieldRow>
          <Field>
            <Label>Promedio antes</Label>
            <Input
              value={form.torque.promedio_antes}
              onChangeText={(t) => patchSection("torque", { promedio_antes: t })}
              placeholder="Valor"
            />
          </Field>

          <Field>
            <Label>Promedio después</Label>
            <Input
              value={form.torque.promedio_despues}
              onChangeText={(t) => patchSection("torque", { promedio_despues: t })}
              placeholder="Valor"
            />
          </Field>
        </FieldRow>

        <BienMalField
          label="Estado antes"
          value={form.torque.estado_antes}
          onChange={(v) => patchSection("torque", { estado_antes: v })}
        />

        <BienMalField
          label="Estado después"
          value={form.torque.estado_despues}
          onChange={(v) => patchSection("torque", { estado_despues: v })}
        />
      </SectionBox>
    </>
  );

  const renderRevision2 = () => (
    <>
      <SectionBox
        title="3. Resorte de freno"
        subtitle="Mediciones de lado izquierdo y derecho."
      >
        <FieldRow>
          {[
            ["izq_mm_antes", "Izq. mm antes"],
            ["izq_pct_antes", "Izq. % antes"],
            ["izq_mm_despues", "Izq. mm después"],
            ["izq_pct_despues", "Izq. % después"],
            ["der_mm_antes", "Der. mm antes"],
            ["der_pct_antes", "Der. % antes"],
            ["der_mm_despues", "Der. mm después"],
            ["der_pct_despues", "Der. % después"],
          ].map(([key, label]) => (
            <Field small key={key}>
              <Label>{label}</Label>
              <Input
                keyboardType="numeric"
                value={form.resorte[key]}
                onChangeText={(t) => patchSection("resorte", { [key]: t })}
                placeholder="0"
              />
            </Field>
          ))}
        </FieldRow>

        <BienMalField
          label="Estado antes"
          value={form.resorte.estado_antes}
          onChange={(v) => patchSection("resorte", { estado_antes: v })}
        />

        <BienMalField
          label="Estado después"
          value={form.resorte.estado_despues}
          onChange={(v) => patchSection("resorte", { estado_despues: v })}
        />
      </SectionBox>

      <SectionBox
        title="4. Condiciones del émbolo"
        subtitle="Recorridos, desgaste, óxido y lubricación."
      >
        <FieldRow>
          {[
            ["recorrido_izq_antes", "Recorrido izq. antes"],
            ["recorrido_izq_despues", "Recorrido izq. después"],
            ["recorrido_der_antes", "Recorrido der. antes"],
            ["recorrido_der_despues", "Recorrido der. después"],
            ["arandela_antes", "Espesor arandela antes"],
            ["arandela_despues", "Espesor arandela después"],
          ].map(([key, label]) => (
            <Field key={key}>
              <Label>{label}</Label>
              <Input
                keyboardType="numeric"
                value={form.embolo[key]}
                onChangeText={(t) => patchSection("embolo", { [key]: t })}
                placeholder="0"
              />
            </Field>
          ))}
        </FieldRow>

        <BoolField
          label="Desgaste antes"
          value={form.embolo.desgaste_antes}
          onChange={(v) => patchSection("embolo", { desgaste_antes: v })}
        />

        <BoolField
          label="Desgaste después"
          value={form.embolo.desgaste_despues}
          onChange={(v) => patchSection("embolo", { desgaste_despues: v })}
        />

        <BoolField
          label="Óxido antes"
          value={form.embolo.oxido_antes}
          onChange={(v) => patchSection("embolo", { oxido_antes: v })}
        />

        <BoolField
          label="Óxido después"
          value={form.embolo.oxido_despues}
          onChange={(v) => patchSection("embolo", { oxido_despues: v })}
        />

        <BienMalField
          label="Lubricación antes"
          value={form.embolo.lubricacion_antes}
          onChange={(v) => patchSection("embolo", { lubricacion_antes: v })}
        />

        <BienMalField
          label="Lubricación después"
          value={form.embolo.lubricacion_despues}
          onChange={(v) => patchSection("embolo", { lubricacion_despues: v })}
        />
      </SectionBox>

      <SectionBox
        title="5. Contacto de freno"
        subtitle="Mediciones por lado y punto de contacto."
      >
        <FieldRow>
          {[
            ["izq_antes", "Izquierdo antes"],
            ["izq_despues", "Izquierdo después"],
            ["der_antes", "Derecho antes"],
            ["der_despues", "Derecho después"],
          ].map(([key, label]) => (
            <Field small key={key}>
              <Label>{label}</Label>
              <Input
                keyboardType="numeric"
                value={form.contacto[key]}
                onChangeText={(t) => patchSection("contacto", { [key]: t })}
                placeholder="0"
              />
            </Field>
          ))}
        </FieldRow>

        <BienMalField
          label="Punto de contacto antes"
          value={form.contacto.punto_antes}
          onChange={(v) => patchSection("contacto", { punto_antes: v })}
        />

        <BienMalField
          label="Punto de contacto después"
          value={form.contacto.punto_despues}
          onChange={(v) => patchSection("contacto", { punto_despues: v })}
        />
      </SectionBox>
    </>
  );

  const renderRevision3 = () => (
    <>
      <SectionBox
        title="6. Brazo, palanca y perno"
        subtitle="Desgaste, óxido y lubricación por lado."
      >
        {[
          ["desgaste_izq_antes", "Desgaste izquierdo antes"],
          ["desgaste_izq_despues", "Desgaste izquierdo después"],
          ["desgaste_der_antes", "Desgaste derecho antes"],
          ["desgaste_der_despues", "Desgaste derecho después"],
          ["oxido_izq_antes", "Óxido izquierdo antes"],
          ["oxido_izq_despues", "Óxido izquierdo después"],
          ["oxido_der_antes", "Óxido derecho antes"],
          ["oxido_der_despues", "Óxido derecho después"],
        ].map(([key, label]) => (
          <BoolField
            key={key}
            label={label}
            value={form.brazo[key]}
            onChange={(v) => patchSection("brazo", { [key]: v })}
          />
        ))}

        <BienMalField
          label="Lubricación izquierdo antes"
          value={form.brazo.lubricacion_izq_antes}
          onChange={(v) => patchSection("brazo", { lubricacion_izq_antes: v })}
        />

        <BienMalField
          label="Lubricación izquierdo después"
          value={form.brazo.lubricacion_izq_despues}
          onChange={(v) => patchSection("brazo", { lubricacion_izq_despues: v })}
        />

        <BienMalField
          label="Lubricación derecho antes"
          value={form.brazo.lubricacion_der_antes}
          onChange={(v) => patchSection("brazo", { lubricacion_der_antes: v })}
        />

        <BienMalField
          label="Lubricación derecho después"
          value={form.brazo.lubricacion_der_despues}
          onChange={(v) => patchSection("brazo", { lubricacion_der_despues: v })}
        />
      </SectionBox>

      <SectionBox
        title="7. Condiciones de tambor"
        subtitle="Revisión de desgaste, aceite y óxido."
      >
        {[
          ["desgaste_antes", "Desgaste antes"],
          ["desgaste_despues", "Desgaste después"],
          ["aceite_antes", "Aceite antes"],
          ["aceite_despues", "Aceite después"],
          ["oxido_antes", "Óxido antes"],
          ["oxido_despues", "Óxido después"],
        ].map(([key, label]) => (
          <BoolField
            key={key}
            label={label}
            value={form.tambor[key]}
            onChange={(v) => patchSection("tambor", { [key]: v })}
          />
        ))}
      </SectionBox>

      <SectionBox
        title="8. Revestimiento / Balatas"
        subtitle="Revisión del lado izquierdo y derecho."
      >
        {[
          ["izquierdo_antes", "Izquierdo antes"],
          ["izquierdo_despues", "Izquierdo después"],
          ["derecho_antes", "Derecho antes"],
          ["derecho_despues", "Derecho después"],
        ].map(([key, label]) => (
          <BoolField
            key={key}
            label={label}
            value={form.balatas[key]}
            onChange={(v) => patchSection("balatas", { [key]: v })}
          />
        ))}
      </SectionBox>

      <SectionBox
        title="9. Operación del freno"
        subtitle="Prueba antes y después del mantenimiento."
      >
        <BienMalField
          label="Prueba antes"
          value={form.operacion.antes}
          onChange={(v) => patchSection("operacion", { antes: v })}
        />

        <BienMalField
          label="Prueba después"
          value={form.operacion.despues}
          onChange={(v) => patchSection("operacion", { despues: v })}
        />
      </SectionBox>
    </>
  );

  const renderFotos = () => (
    <SectionBox
      title="Hoja de fotos"
      subtitle="Agrega evidencia fotográfica antes/después."
    >
      <View style={styles.photoSummary}>
        <Text style={styles.photoSummaryTitle}>Fotos agregadas</Text>
        <Text style={styles.photoSummaryValue}>{photoCount}</Text>
      </View>

      <Text style={styles.photoGroupTitle}>Émbolo del freno</Text>

      <PhotoField
        label="Émbolo antes"
        value={form.fotos.embolo_antes}
        onCamera={() => tomarFoto("embolo_antes")}
        onGallery={() => seleccionarFoto("embolo_antes")}
        onRemove={() => quitarFoto("embolo_antes")}
      />

      <PhotoField
        label="Émbolo después"
        value={form.fotos.embolo_despues}
        onCamera={() => tomarFoto("embolo_despues")}
        onGallery={() => seleccionarFoto("embolo_despues")}
        onRemove={() => quitarFoto("embolo_despues")}
      />

      <Text style={styles.photoGroupTitle}>Revestimiento del freno</Text>

      <PhotoField
        label="Revestimiento lado izquierdo"
        value={form.fotos.revestimiento_izq}
        onCamera={() => tomarFoto("revestimiento_izq")}
        onGallery={() => seleccionarFoto("revestimiento_izq")}
        onRemove={() => quitarFoto("revestimiento_izq")}
      />

      <PhotoField
        label="Revestimiento lado derecho"
        value={form.fotos.revestimiento_der}
        onCamera={() => tomarFoto("revestimiento_der")}
        onGallery={() => seleccionarFoto("revestimiento_der")}
        onRemove={() => quitarFoto("revestimiento_der")}
      />

      <Text style={styles.photoGroupTitle}>Brazo, palanca y pernos lado izquierdo</Text>

      <PhotoField
        label="Lado izquierdo antes"
        value={form.fotos.brazo_izq_antes}
        onCamera={() => tomarFoto("brazo_izq_antes")}
        onGallery={() => seleccionarFoto("brazo_izq_antes")}
        onRemove={() => quitarFoto("brazo_izq_antes")}
      />

      <PhotoField
        label="Lado izquierdo después"
        value={form.fotos.brazo_izq_despues}
        onCamera={() => tomarFoto("brazo_izq_despues")}
        onGallery={() => seleccionarFoto("brazo_izq_despues")}
        onRemove={() => quitarFoto("brazo_izq_despues")}
      />

      <Text style={styles.photoGroupTitle}>Brazo, palanca y pernos lado derecho</Text>

      <PhotoField
        label="Lado derecho antes"
        value={form.fotos.brazo_der_antes}
        onCamera={() => tomarFoto("brazo_der_antes")}
        onGallery={() => seleccionarFoto("brazo_der_antes")}
        onRemove={() => quitarFoto("brazo_der_antes")}
      />

      <PhotoField
        label="Lado derecho después"
        value={form.fotos.brazo_der_despues}
        onCamera={() => tomarFoto("brazo_der_despues")}
        onGallery={() => seleccionarFoto("brazo_der_despues")}
        onRemove={() => quitarFoto("brazo_der_despues")}
      />

      <Text style={styles.photoGroupTitle}>Otros</Text>

      <Label>Nombre otro 1</Label>
      <Input
        value={form.fotos.otro_1_titulo}
        onChangeText={(t) => patchSection("fotos", { otro_1_titulo: t })}
        placeholder="Ej. Tambor / cable / soporte"
      />

      <PhotoField
        label="Otro 1 antes"
        value={form.fotos.otro_1_antes}
        onCamera={() => tomarFoto("otro_1_antes")}
        onGallery={() => seleccionarFoto("otro_1_antes")}
        onRemove={() => quitarFoto("otro_1_antes")}
      />

      <PhotoField
        label="Otro 1 después"
        value={form.fotos.otro_1_despues}
        onCamera={() => tomarFoto("otro_1_despues")}
        onGallery={() => seleccionarFoto("otro_1_despues")}
        onRemove={() => quitarFoto("otro_1_despues")}
      />

      <Label>Nombre otro 2</Label>
      <Input
        value={form.fotos.otro_2_titulo}
        onChangeText={(t) => patchSection("fotos", { otro_2_titulo: t })}
        placeholder="Ej. Componente adicional"
      />

      <PhotoField
        label="Otro 2 antes"
        value={form.fotos.otro_2_antes}
        onCamera={() => tomarFoto("otro_2_antes")}
        onGallery={() => seleccionarFoto("otro_2_antes")}
        onRemove={() => quitarFoto("otro_2_antes")}
      />

      <PhotoField
        label="Otro 2 después"
        value={form.fotos.otro_2_despues}
        onCamera={() => tomarFoto("otro_2_despues")}
        onGallery={() => seleccionarFoto("otro_2_despues")}
        onRemove={() => quitarFoto("otro_2_despues")}
      />
    </SectionBox>
  );

  const renderResultado = () => (
    <SectionBox
      title="Observaciones y resultado"
      subtitle="Cierre del mantenimiento y detalle final."
    >
      <Label>Observaciones</Label>
      <Input
        multiline
        style={styles.textArea}
        value={form.observaciones}
        onChangeText={(t) => patchForm({ observaciones: t })}
        placeholder="Observaciones generales"
      />

      <Label>Resultado total</Label>

      <View style={styles.chipsWrap}>
        <Chip
          tone="green"
          active={form.resultado_total.bien}
          onPress={() =>
            patchSection("resultado_total", {
              bien: !form.resultado_total.bien,
            })
          }
        >
          Bien
        </Chip>

        <Chip
          tone="yellow"
          active={form.resultado_total.seguimiento}
          onPress={() =>
            patchSection("resultado_total", {
              seguimiento: !form.resultado_total.seguimiento,
            })
          }
        >
          Necesita seguimiento
        </Chip>
      </View>

      <Label>Detalle</Label>
      <Input
        multiline
        style={styles.textArea}
        value={form.resultado_total.detalle}
        onChangeText={(t) => patchSection("resultado_total", { detalle: t })}
        placeholder="Detalle del resultado"
      />
    </SectionBox>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderRevision1();
    if (activeStep === 2) return renderRevision2();
    if (activeStep === 3) return renderRevision3();
    if (activeStep === 4) return renderFotos();
    return renderResultado();
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={UI.blue} />
        <Text style={styles.loadingTitle}>Cargando formulario</Text>
        <Text style={styles.loadingText}>Preparando datos de la orden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Mantenimiento freno EM/EH" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Reporte de mantenimiento</Text>
            <Text style={styles.introText}>
              Captura la revisión antes y después, evidencia fotográfica y resultado final. Puedes revisar el PDF en cualquier momento.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.introPreviewButton}
            onPress={abrirPreviewPdf}
            disabled={generatingPdf}
            activeOpacity={0.82}
          >
            <Text style={styles.introPreviewButtonText}>Ver PDF</Text>
          </TouchableOpacity>
        </View>

        {renderStepIndicator()}

        {renderStepContent()}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, activeStep === 0 && styles.navBtnDisabled]}
            onPress={goBack}
            disabled={activeStep === 0}
            activeOpacity={0.86}
          >
            <Text style={[styles.navBtnText, activeStep === 0 && styles.navBtnTextDisabled]}>
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtnPrimary, activeStep === STEPS.length - 1 && styles.navBtnDisabled]}
            onPress={goNext}
            disabled={activeStep === STEPS.length - 1}
            activeOpacity={0.86}
          >
            <Text
              style={[
                styles.navBtnPrimaryText,
                activeStep === STEPS.length - 1 && styles.navBtnTextDisabled,
              ]}
            >
              Siguiente
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.previewBtn}
          onPress={abrirPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          <Text style={styles.previewBtnText}>Vista previa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={compartirPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.shareBtnText}>Compartir PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={previewVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.previewKicker}>Documento</Text>
                <Text style={styles.previewTitle}>Vista previa PDF</Text>
              </View>

              <TouchableOpacity
                style={styles.previewClose}
                onPress={() => setPreviewVisible(false)}
              >
                <Text style={styles.previewCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <WebView
              originWhitelist={["*"]}
              source={{ html: previewHtml }}
              style={styles.webview}
            />

            <View style={styles.previewFooter}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={compartirPdf}
                disabled={generatingPdf}
                activeOpacity={0.9}
              >
                {generatingPdf ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.shareBtnText}>Compartir PDF</Text>
                )}
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
    fontWeight: "900",
  },

  loadingText: {
    marginTop: 4,
    color: UI.muted,
    fontSize: 13,
    fontWeight: "700",
  },

  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 118,
  },

  hero: {
    backgroundColor: UI.blue,
    borderRadius: 28,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  heroKicker: {
    color: "#BFDBFE",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 4,
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
  },

  heroText: {
    color: "#DBEAFE",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
  },

  heroBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },

  statBox: {
    flexGrow: 1,
    minWidth: 82,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: "center",
  },

  statBlue: {
    backgroundColor: "rgba(255,255,255,0.13)",
  },

  statGreen: {
    backgroundColor: "rgba(22,163,74,0.28)",
  },

  statYellow: {
    backgroundColor: "rgba(245,158,11,0.28)",
  },

  statRed: {
    backgroundColor: "rgba(220,38,38,0.26)",
  },

  statValue: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
  },

  statLabel: {
    color: "#DBEAFE",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  progressCard: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 22,
    padding: 14,
    marginTop: 14,
  },

  progressTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },

  stepsScroll: {
    gap: 10,
    paddingRight: 10,
  },

  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minWidth: 130,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  stepItemActive: {
    backgroundColor: UI.blueSoft,
    borderColor: "#93C5FD",
  },

  stepItemDone: {
    backgroundColor: UI.greenSoft,
    borderColor: "#86EFAC",
  },

  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  stepNumberActive: {
    backgroundColor: UI.blue,
  },

  stepNumberDone: {
    backgroundColor: UI.green,
  },

  stepNumberText: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: "900",
  },

  stepNumberTextActive: {
    color: "#FFFFFF",
  },

  stepName: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "900",
  },

  stepNameActive: {
    color: UI.blue,
  },

  stepNameDone: {
    color: UI.green,
  },

  stepShort: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },

  activeStepHeader: {
    marginTop: 16,
    marginBottom: 8,
  },

  activeStepSmall: {
    color: UI.blue2,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  activeStepTitle: {
    color: UI.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 2,
  },

  sectionBox: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 16,
    padding: 15,
    marginTop: 12,
  },

  sectionTop: {
    marginBottom: 14,
  },

  sectionTitle: {
    color: UI.text,
    fontSize: 16,
    fontWeight: "800",
  },

  sectionSubtitle: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    marginTop: 3,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  infoItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 145,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },

  infoLabel: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },

  infoValue: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },

  label: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    minHeight: 44,
    color: UI.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },

  textArea: {
    minHeight: 118,
    paddingTop: 12,
    textAlignVertical: "top",
  },

  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },

  field: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 165,
  },

  fieldSmall: {
    minWidth: 108,
  },

  fieldWide: {
    minWidth: 225,
  },

  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },

  chip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },

  chipBlue: {
    backgroundColor: UI.blue,
    borderColor: UI.blue,
  },

  chipGreen: {
    backgroundColor: UI.green,
    borderColor: UI.green,
  },

  chipYellow: {
    backgroundColor: UI.yellow,
    borderColor: UI.yellow,
  },

  chipRed: {
    backgroundColor: UI.red,
    borderColor: UI.red,
  },

  chipText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
  },

  chipTextActive: {
    color: "#FFFFFF",
  },

  groupPill: {
    alignSelf: "flex-start",
    backgroundColor: UI.blueSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },

  groupPillText: {
    color: UI.blue,
    fontSize: 12,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: UI.border,
    marginVertical: 14,
  },

  boolCard: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    paddingVertical: 12,
    paddingHorizontal: 2,
    marginBottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  boolTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "700",
  },

  boolHint: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },

  boolRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  boolValue: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
  },

  statusBlock: {
    marginTop: 4,
    marginBottom: 6,
  },

  photoSummary: {
    backgroundColor: UI.blueSoft,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  photoSummaryTitle: {
    color: UI.blue,
    fontWeight: "700",
    fontSize: 13,
  },

  photoSummaryValue: {
    color: UI.blue,
    fontWeight: "800",
    fontSize: 20,
  },

  photoGroupTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 8,
  },

  photoField: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    padding: 11,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  photoFieldActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#A6D5B5",
  },

  photoIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: UI.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  photoIconText: {
    color: UI.blue,
    fontSize: 16,
    fontWeight: "800",
  },

  photoLabel: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "700",
  },

  photoStatus: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },

  photoStatusActive: {
    color: UI.green,
  },

  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "flex-end",
  },

  photoBtn: {
    backgroundColor: UI.blue,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },

  photoBtnText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "700",
  },

  photoBtnLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },

  photoBtnLightText: {
    color: UI.text,
    fontSize: 10.5,
    fontWeight: "700",
  },

  photoRemoveBtn: {
    backgroundColor: UI.redSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },

  photoRemoveText: {
    color: UI.red,
    fontSize: 10.5,
    fontWeight: "700",
  },

  navRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },

  navBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 13,
  },

  navBtnPrimary: {
    flex: 1,
    backgroundColor: UI.blue,
    borderWidth: 1,
    borderColor: UI.blue,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 13,
  },

  navBtnDisabled: {
    opacity: 0.45,
  },

  navBtnText: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "700",
  },

  navBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  navBtnTextDisabled: {
    color: UI.muted,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },

  previewBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },

  previewBtnText: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "700",
  },

  shareBtn: {
    flex: 1,
    backgroundColor: UI.blue,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },

  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.58)",
    padding: 12,
    justifyContent: "center",
  },

  previewCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },

  previewHeader: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },

  previewKicker: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  previewTitle: {
    color: UI.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 1,
  },

  previewClose: {
    backgroundColor: UI.cardSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
  },

  previewCloseText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
  },

  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  previewFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },

  introCard: {
    backgroundColor: UI.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  introTextWrap: {
    flex: 1,
  },

  introTitle: {
    color: UI.text,
    fontSize: 17,
    fontWeight: "800",
  },

  introText: {
    color: UI.muted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: "500",
  },

  introPreviewButton: {
    backgroundColor: UI.blueSoft,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  introPreviewButtonText: {
    color: UI.blue,
    fontSize: 12,
    fontWeight: "800",
  },

  stepperCard: {
    backgroundColor: UI.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 15,
    marginTop: 12,
  },

  stepperTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  stepperEyebrow: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  stepperCurrentTitle: {
    color: UI.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },

  stepperPercent: {
    color: UI.blue,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },

  progressTrack: {
    height: 5,
    backgroundColor: "#EAECF0",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 13,
  },

  progressFill: {
    height: "100%",
    backgroundColor: UI.blue,
    borderRadius: 999,
  },

  stepLinks: {
    gap: 8,
    paddingTop: 14,
    paddingRight: 8,
  },

  stepLink: {
    minWidth: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: UI.cardSoft,
  },

  stepLinkActive: {
    backgroundColor: UI.blueSoft,
  },

  stepLinkDone: {
    backgroundColor: "#F6F8FA",
  },

  stepDot: {
    width: 23,
    height: 23,
    borderRadius: 7,
    backgroundColor: "#EAECF0",
    alignItems: "center",
    justifyContent: "center",
  },

  stepDotActive: {
    backgroundColor: UI.blue,
  },

  stepDotDone: {
    backgroundColor: "#667085",
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
    color: UI.blue,
  },

  stepLinkTextDone: {
    color: UI.text,
  },

});