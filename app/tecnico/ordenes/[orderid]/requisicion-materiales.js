// app/tecnico/ordenes/[orderid]/requisicion-materiales.js
// Requisición de materiales — formulario independiente y rediseñado.
// Compatible con:
// src/services/templates/requisicion_materiales/buildRequisicionMaterialesHtml.js
// Sin validaciones bloqueantes para permitir vista previa del PDF aun con campos vacíos.

import React, { useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import Header from "../../../../src/components/Header";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildRequisicionMaterialesHtml } from "../../../../src/services/templates/requisicion_materiales/buildRequisicionMaterialesHtml";

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
  { key: "general", title: "General", short: "Entrega" },
  { key: "materiales", title: "Materiales", short: "Partidas" },
  { key: "responsables", title: "Responsables", short: "Firmas" },
  { key: "incidencia", title: "Incidencia", short: "Causas" },
];

const INCIDENCIAS = [
  "Solicitud nueva",
  "Reposición por daño",
  "Reposición por extravío",
  "Reposición por robo",
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

  const parsed = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
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

function newMaterial() {
  return {
    codigoDynamics: "",
    codigoMrp: "",
    descripcion: "",
    cantidad: "",
    um: "",
    observaciones: "",
  };
}

function createDefaultForm(userName = "") {
  return {
    almacen: "",
    depto: "",
    seccion: "",
    elDia: "",
    mx: "",
    direccionRazonSocial: "",

    materiales: [newMaterial(), newMaterial()],

    emitidaPorFecha: "",
    emitidaPor: userName,
    surtidaPorFecha: "",
    surtidaPor: "",
    recibidaPorFecha: "",
    recibidaPor: "",

    incidencia: "",
    causas: "",
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

function SummaryItem({ label, value }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.summaryValue}>
        {safe(value) || "—"}
      </Text>
    </View>
  );
}

function Choice({ label, active, onPress, icon }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={[styles.choice, active && styles.choiceActive]}
    >
      <View style={[styles.choiceMark, active && styles.choiceMarkActive]}>
        {active ? (
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
          {label}
        </Text>
      </View>

      {icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={active ? UI.primary : UI.muted2}
        />
      ) : null}
    </TouchableOpacity>
  );
}

function MaterialCard({ item, index, onChange, onRemove, canRemove }) {
  const hasData =
    safe(item.codigoDynamics) ||
    safe(item.codigoMrp) ||
    safe(item.descripcion) ||
    safe(item.cantidad) ||
    safe(item.um) ||
    safe(item.observaciones);

  return (
    <View style={[styles.materialCard, hasData && styles.materialCardActive]}>
      <View style={styles.materialHeader}>
        <View style={styles.materialNumber}>
          <Text style={styles.materialNumberText}>{index + 1}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.materialTitle}>Material {index + 1}</Text>
          <Text style={styles.materialSubtitle}>
            {hasData ? "Partida capturada" : "Partida vacía"}
          </Text>
        </View>

        {canRemove ? (
          <TouchableOpacity
            onPress={onRemove}
            activeOpacity={0.82}
            style={styles.removeButton}
          >
            <Ionicons name="trash-outline" size={17} color={UI.danger} />
            <Text style={styles.removeButtonText}>Quitar</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FieldRow>
        <Field>
          <Input
            label="Código Dynamics"
            value={item.codigoDynamics}
            onChangeText={(v) => onChange("codigoDynamics", v)}
            placeholder="Código"
            icon="barcode-outline"
          />
        </Field>

        <Field>
          <Input
            label="Código MRP"
            value={item.codigoMrp}
            onChangeText={(v) => onChange("codigoMrp", v)}
            placeholder="Código MRP"
            icon="pricetag-outline"
          />
        </Field>
      </FieldRow>

      <Input
        label="Descripción"
        value={item.descripcion}
        onChangeText={(v) => onChange("descripcion", v)}
        placeholder="Descripción del material"
        icon="cube-outline"
      />

      <FieldRow>
        <Field small>
          <Input
            label="Cantidad"
            value={item.cantidad}
            onChangeText={(v) => onChange("cantidad", v)}
            placeholder="0"
            keyboardType="numeric"
            icon="calculator-outline"
          />
        </Field>

        <Field small>
          <Input
            label="U / M"
            value={item.um}
            onChangeText={(v) => onChange("um", v)}
            placeholder="PZA"
            icon="resize-outline"
          />
        </Field>
      </FieldRow>

      <Input
        label="Observaciones"
        value={item.observaciones}
        onChangeText={(v) => onChange("observaciones", v)}
        placeholder="Observaciones de la partida"
        multiline
        icon="chatbox-ellipses-outline"
      />
    </View>
  );
}

export default function RequisicionMaterialesForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const tecnicoNombre = getUserName(user);
  const currentOrder = useMemo(() => safe(orderid), [orderid]);

  const [form, setForm] = useState(() => createDefaultForm(tecnicoNombre));
  const [activeStep, setActiveStep] = useState(0);
  const [dateTarget, setDateTarget] = useState(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!tecnicoNombre) return;

    setForm((prev) => {
      if (safe(prev.emitidaPor)) return prev;
      return { ...prev, emitidaPor: tecnicoNombre };
    });
  }, [tecnicoNombre]);

  const invalidatePdf = () => setPdfUri(null);

  const patchForm = (patch) => {
    invalidatePdf();
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateMaterial = (index, field, value) => {
    invalidatePdf();

    setForm((prev) => ({
      ...prev,
      materiales: prev.materiales.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addMaterial = () => {
    invalidatePdf();
    setForm((prev) => ({
      ...prev,
      materiales: [...prev.materiales, newMaterial()],
    }));
  };

  const removeMaterial = (index) => {
    invalidatePdf();

    setForm((prev) => {
      if (prev.materiales.length <= 1) {
        return { ...prev, materiales: [newMaterial()] };
      }

      return {
        ...prev,
        materiales: prev.materiales.filter((_, i) => i !== index),
      };
    });
  };

  const getDateValue = (target) => {
    if (target === "elDia") return form.elDia;
    if (target === "emitidaPorFecha") return form.emitidaPorFecha;
    if (target === "surtidaPorFecha") return form.surtidaPorFecha;
    if (target === "recibidaPorFecha") return form.recibidaPorFecha;
    return "";
  };

  const setDateValue = (target, value) => {
    if (!target) return;
    patchForm({ [target]: value });
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;

    setDateValue(dateTarget, formatDateDMY(selectedDate));
  };

  const buildPayload = () => ({
    almacen: safe(form.almacen),
    depto: safe(form.depto),
    seccion: safe(form.seccion),
    elDia: safe(form.elDia),
    mx: safe(form.mx),
    direccionRazonSocial: safe(form.direccionRazonSocial),
    materiales: (Array.isArray(form.materiales) ? form.materiales : []).map(
      (item) => ({
        codigoDynamics: safe(item.codigoDynamics),
        codigoMrp: safe(item.codigoMrp),
        descripcion: safe(item.descripcion),
        cantidad: safe(item.cantidad),
        um: safe(item.um),
        observaciones: safe(item.observaciones),
      })
    ),
    emitidaPorFecha: safe(form.emitidaPorFecha),
    emitidaPor: safe(form.emitidaPor),
    surtidaPorFecha: safe(form.surtidaPorFecha),
    surtidaPor: safe(form.surtidaPor),
    recibidaPorFecha: safe(form.recibidaPorFecha),
    recibidaPor: safe(form.recibidaPor),
    incidencia: safe(form.incidencia),
    causas: safe(form.causas),
  });

  const generarPdfLocal = async () => {
    const payload = buildPayload();
    const html = buildRequisicionMaterialesHtml(payload);

    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    setPreviewHtml(html);
    setPdfUri(result.uri);

    return {
      html,
      uri: result.uri,
    };
  };

  const abrirPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setPreviewVisible(true);

      await generarPdfLocal();
    } catch (e) {
      console.log("[REQUISICION MATERIALES] preview error:", e);
      setPreviewVisible(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const compartirPdf = async () => {
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
          "PDF generado",
          "El archivo se generó, pero este dispositivo no permite compartirlo."
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir requisición de materiales",
      });
    } catch (e) {
      console.log("[REQUISICION MATERIALES] compartirPdf error:", e);
      Alert.alert("Error", "No se pudo generar o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const materialCount = useMemo(() => {
    return form.materiales.filter(
      (item) =>
        safe(item.codigoDynamics) ||
        safe(item.codigoMrp) ||
        safe(item.descripcion) ||
        safe(item.cantidad) ||
        safe(item.um) ||
        safe(item.observaciones)
    ).length;
  }, [form.materiales]);

  const progress = Math.round(((activeStep + 1) / STEPS.length) * 100);

  const goNext = () => {
    setActiveStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const renderProgress = () => (
    <View style={styles.progressPanel}>
      <View style={styles.progressHeader}>
        <View>
          <Text style={styles.progressEyebrow}>
            Paso {activeStep + 1} de {STEPS.length}
          </Text>
          <Text style={styles.progressCurrent}>{STEPS[activeStep].title}</Text>
        </View>

        <Text style={styles.progressPercent}>{progress}%</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepList}
      >
        {STEPS.map((step, index) => {
          const active = index === activeStep;
          const done = index < activeStep;

          return (
            <TouchableOpacity
              key={step.key}
              onPress={() => setActiveStep(index)}
              activeOpacity={0.86}
              style={[
                styles.stepButton,
                active && styles.stepButtonActive,
                done && styles.stepButtonDone,
              ]}
            >
              <View
                style={[
                  styles.stepDot,
                  active && styles.stepDotActive,
                  done && styles.stepDotDone,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      active && styles.stepDotTextActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              <View>
                <Text
                  style={[
                    styles.stepTitle,
                    active && styles.stepTitleActive,
                  ]}
                >
                  {step.title}
                </Text>
                <Text style={styles.stepShort}>{step.short}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderGeneral = () => (
    <>
      <Section
        title="Requisición de materiales"
        subtitle="Información que aparecerá en el encabezado del formato."
        icon="document-text-outline"
      >
        <View style={styles.summaryGrid}>
          <SummaryItem label="Orden actual" value={currentOrder || "Sin orden"} />
          <SummaryItem label="MX" value={form.mx} />
          <SummaryItem label="Almacén" value={form.almacen} />
          <SummaryItem label="Entrega" value={form.elDia} />
        </View>
      </Section>

      <Section
        title="Destino de la requisición"
        subtitle="Captura almacén, departamento, sección y fecha de entrega."
        icon="storefront-outline"
      >
        <Input
          label="Al almacén"
          value={form.almacen}
          onChangeText={(v) => patchForm({ almacen: v })}
          placeholder="Nombre o clave del almacén"
          icon="business-outline"
        />

        <FieldRow>
          <Field>
            <Input
              label="Departamento"
              value={form.depto}
              onChangeText={(v) => patchForm({ depto: v })}
              placeholder="Departamento"
              icon="folder-open-outline"
            />
          </Field>

          <Field>
            <Input
              label="Sección"
              value={form.seccion}
              onChangeText={(v) => patchForm({ seccion: v })}
              placeholder="Sección"
              icon="layers-outline"
            />
          </Field>
        </FieldRow>

        <DateButton
          label="Entregar el día"
          value={form.elDia}
          onPress={() => setDateTarget("elDia")}
        />
      </Section>

      <Section
        title="Ubicación / cliente"
        subtitle="Datos de identificación que aparecen en el costado derecho del formato."
        icon="location-outline"
      >
        <Input
          label="MX"
          value={form.mx}
          onChangeText={(v) => patchForm({ mx: v })}
          placeholder="MX"
          icon="barcode-outline"
        />

        <Input
          label="Dirección / Razón social"
          value={form.direccionRazonSocial}
          onChangeText={(v) => patchForm({ direccionRazonSocial: v })}
          placeholder="Dirección, cliente o razón social"
          multiline
          icon="location-outline"
        />
      </Section>
    </>
  );

  const renderMateriales = () => (
    <Section
      title="Materiales solicitados"
      subtitle="El PDF conserva al menos 8 renglones; aquí puedes agregar las partidas que necesites."
      icon="cube-outline"
    >
      <View style={styles.materialSummary}>
        <View>
          <Text style={styles.materialSummaryTitle}>Partidas capturadas</Text>
          <Text style={styles.materialSummaryText}>
            {materialCount === 1
              ? "1 material con información"
              : `${materialCount} materiales con información`}
          </Text>
        </View>

        <View style={styles.materialSummaryBadge}>
          <Text style={styles.materialSummaryBadgeText}>{materialCount}</Text>
        </View>
      </View>

      {form.materiales.map((item, index) => (
        <MaterialCard
          key={`material-${index}`}
          item={item}
          index={index}
          canRemove={form.materiales.length > 1}
          onChange={(field, value) => updateMaterial(index, field, value)}
          onRemove={() => removeMaterial(index)}
        />
      ))}

      <TouchableOpacity
        style={styles.addButton}
        onPress={addMaterial}
        activeOpacity={0.88}
      >
        <Ionicons name="add-circle-outline" size={19} color={UI.primary} />
        <Text style={styles.addButtonText}>Agregar material</Text>
      </TouchableOpacity>
    </Section>
  );

  const renderResponsables = () => (
    <>
      <Section
        title="Emitida por"
        subtitle="Persona que genera la requisición."
        icon="create-outline"
      >
        <Input
          label="Nombre / firma"
          value={form.emitidaPor}
          onChangeText={(v) => patchForm({ emitidaPor: v })}
          placeholder="Nombre de quien emite"
          icon="person-outline"
        />

        <DateButton
          label="Fecha"
          value={form.emitidaPorFecha}
          onPress={() => setDateTarget("emitidaPorFecha")}
        />
      </Section>

      <Section
        title="Surtida por"
        subtitle="Persona de almacén que surte los materiales."
        icon="archive-outline"
      >
        <Input
          label="Nombre / firma"
          value={form.surtidaPor}
          onChangeText={(v) => patchForm({ surtidaPor: v })}
          placeholder="Nombre de quien surte"
          icon="person-outline"
        />

        <DateButton
          label="Fecha"
          value={form.surtidaPorFecha}
          onPress={() => setDateTarget("surtidaPorFecha")}
        />
      </Section>

      <Section
        title="Recibida por"
        subtitle="Persona que recibe físicamente los materiales."
        icon="checkmark-done-outline"
      >
        <Input
          label="Nombre / firma"
          value={form.recibidaPor}
          onChangeText={(v) => patchForm({ recibidaPor: v })}
          placeholder="Nombre de quien recibe"
          icon="person-outline"
        />

        <DateButton
          label="Fecha"
          value={form.recibidaPorFecha}
          onPress={() => setDateTarget("recibidaPorFecha")}
        />
      </Section>
    </>
  );

  const renderIncidencia = () => (
    <>
      <Section
        title="Tipo de incidencia"
        subtitle="Selecciona la opción que se marcará con una X en el PDF."
        icon="alert-circle-outline"
      >
        <View style={styles.choiceList}>
          {INCIDENCIAS.map((item, index) => (
            <Choice
              key={item}
              label={`${index + 1}. ${item}`}
              active={form.incidencia === item}
              onPress={() => patchForm({ incidencia: item })}
              icon={
                index === 0
                  ? "add-circle-outline"
                  : index === 1
                  ? "build-outline"
                  : index === 2
                  ? "help-circle-outline"
                  : "shield-outline"
              }
            />
          ))}
        </View>
      </Section>

      <Section
        title="Causas"
        subtitle="Describe el motivo de la solicitud o reposición."
        icon="reader-outline"
      >
        <Input
          label="Descripción de causas"
          value={form.causas}
          onChangeText={(v) => patchForm({ causas: v })}
          placeholder="Describe brevemente las causas..."
          multiline
          icon="create-outline"
        />
      </Section>

      <View style={styles.readyCard}>
        <View style={styles.readyIcon}>
          <Ionicons name="document-text-outline" size={22} color={UI.primary} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.readyTitle}>Documento listo para revisar</Text>
          <Text style={styles.readyText}>
            No hay validaciones bloqueantes. Puedes abrir la vista previa aun si
            faltan datos y regresar a corregirlos después.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.readyButton}
          onPress={abrirPreviewPdf}
          activeOpacity={0.88}
        >
          <Ionicons name="eye-outline" size={17} color={UI.primary} />
          <Text style={styles.readyButtonText}>Ver PDF</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderMateriales();
    if (activeStep === 2) return renderResponsables();
    return renderIncidencia();
  };

  return (
    <View style={styles.container}>
      <Header title="Requisición de materiales" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="cube-outline" size={23} color={UI.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.introKicker}>Formato de almacén</Text>
            <Text style={styles.introTitle}>Requisición de materiales</Text>
            <Text style={styles.introText}>
              Captura materiales, responsables e incidencia de forma sencilla.
            </Text>
          </View>

          <TouchableOpacity
            onPress={abrirPreviewPdf}
            activeOpacity={0.86}
            style={styles.introPdfButton}
          >
            <Ionicons name="eye-outline" size={16} color={UI.primary} />
            <Text style={styles.introPdfButtonText}>Ver PDF</Text>
          </TouchableOpacity>
        </View>

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
            style={[
              styles.navButton,
              activeStep === 0 && styles.navButtonDisabled,
            ]}
            onPress={goBack}
            disabled={activeStep === 0}
            activeOpacity={0.86}
          >
            <Ionicons
              name="chevron-back-outline"
              size={18}
              color={activeStep === 0 ? UI.muted2 : UI.primary}
            />
            <Text
              style={[
                styles.navButtonText,
                activeStep === 0 && styles.navButtonTextDisabled,
              ]}
            >
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navButtonPrimary,
              activeStep === STEPS.length - 1 && styles.navButtonDisabled,
            ]}
            onPress={goNext}
            disabled={activeStep === STEPS.length - 1}
            activeOpacity={0.86}
          >
            <Text
              style={[
                styles.navButtonPrimaryText,
                activeStep === STEPS.length - 1 &&
                  styles.navButtonPrimaryTextDisabled,
              ]}
            >
              Siguiente
            </Text>
            <Ionicons
              name="chevron-forward-outline"
              size={18}
              color={
                activeStep === STEPS.length - 1 ? UI.muted2 : "#FFFFFF"
              }
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.previewButton}
          onPress={abrirPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          <Ionicons name="eye-outline" size={18} color={UI.primary} />
          <Text style={styles.previewButtonText}>Vista previa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={compartirPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>Compartir PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={previewVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalKicker}>Documento</Text>
                <Text style={styles.modalTitle}>Vista previa de requisición</Text>
              </View>

              <TouchableOpacity
                onPress={() => setPreviewVisible(false)}
                style={styles.modalClose}
                activeOpacity={0.86}
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
                style={styles.modalSecondary}
                onPress={() => setPreviewVisible(false)}
                activeOpacity={0.86}
              >
                <Text style={styles.modalSecondaryText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalPrimary}
                onPress={compartirPdf}
                disabled={generatingPdf}
                activeOpacity={0.86}
              >
                {generatingPdf ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="share-social-outline"
                      size={17}
                      color="#FFFFFF"
                    />
                    <Text style={styles.modalPrimaryText}>Compartir PDF</Text>
                  </>
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

  content: {
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 122,
  },

  introCard: {
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: UI.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  introKicker: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  introTitle: {
    color: UI.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },

  introText: {
    color: UI.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },

  introPdfButton: {
    borderWidth: 1,
    borderColor: "#C9D8EA",
    backgroundColor: UI.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  introPdfButtonText: {
    color: UI.primary,
    fontSize: 11,
    fontWeight: "900",
  },

  progressPanel: {
    marginTop: 12,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 13,
  },

  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
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
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },

  progressPercent: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  progressTrack: {
    height: 5,
    borderRadius: 99,
    backgroundColor: "#E8EDF3",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: UI.primary,
  },

  stepList: {
    gap: 8,
    paddingTop: 12,
    paddingRight: 6,
  },

  stepButton: {
    minWidth: 112,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.cardSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  stepButtonActive: {
    backgroundColor: UI.primarySoft,
    borderColor: "#C1D2E7",
  },

  stepButtonDone: {
    backgroundColor: UI.successSoft,
    borderColor: "#C9E8DA",
  },

  stepDot: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: "#E8EDF3",
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
    fontSize: 11,
    fontWeight: "900",
  },

  stepDotTextActive: {
    color: "#FFFFFF",
  },

  stepTitle: {
    color: UI.text,
    fontSize: 11,
    fontWeight: "900",
  },

  stepTitleActive: {
    color: UI.primary,
  },

  stepShort: {
    color: UI.muted,
    fontSize: 9,
    marginTop: 1,
  },

  section: {
    marginTop: 12,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 14,
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.primarySoft,
  },

  sectionTitle: {
    color: UI.text,
    fontSize: 16,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: UI.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  summaryItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 135,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.cardSoft,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },

  summaryLabel: {
    color: UI.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  summaryValue: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },

  inputBlock: {
    marginBottom: 11,
  },

  label: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.35,
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
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
  },

  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
    paddingTop: 11,
  },

  dateButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
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
    fontSize: 13,
    fontWeight: "800",
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
    minWidth: 150,
  },

  fieldSmall: {
    minWidth: 105,
  },

  fieldWide: {
    minWidth: 220,
  },

  materialSummary: {
    backgroundColor: UI.primarySoft,
    borderWidth: 1,
    borderColor: "#D0DDEA",
    borderRadius: 13,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  materialSummaryTitle: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  materialSummaryText: {
    color: UI.muted,
    fontSize: 10,
    marginTop: 2,
  },

  materialSummaryBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  materialSummaryBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  materialCard: {
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 14,
    backgroundColor: UI.cardSoft,
    padding: 12,
    marginBottom: 10,
  },

  materialCardActive: {
    borderColor: "#C9D8EA",
    backgroundColor: "#FBFCFE",
  },

  materialHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 11,
  },

  materialNumber: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  materialNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  materialTitle: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "900",
  },

  materialSubtitle: {
    color: UI.muted,
    fontSize: 10,
    marginTop: 1,
  },

  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: UI.dangerSoft,
  },

  removeButtonText: {
    color: UI.danger,
    fontSize: 10,
    fontWeight: "900",
  },

  addButton: {
    minHeight: 45,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C4D4E7",
    backgroundColor: UI.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  addButtonText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  choiceList: {
    gap: 8,
  },

  choice: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    backgroundColor: UI.cardSoft,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  choiceActive: {
    backgroundColor: UI.primarySoft,
    borderColor: "#BFD0E5",
  },

  choiceMark: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: UI.borderDark,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  choiceMarkActive: {
    borderColor: UI.primary,
    backgroundColor: UI.primary,
  },

  choiceText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "800",
  },

  choiceTextActive: {
    color: UI.primary,
  },

  readyCard: {
    marginTop: 12,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  readyIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: UI.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  readyTitle: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "900",
  },

  readyText: {
    color: UI.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },

  readyButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D6E8",
    backgroundColor: UI.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  readyButtonText: {
    color: UI.primary,
    fontSize: 10,
    fontWeight: "900",
  },

  navRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },

  navButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#BFCFE1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },

  navButtonPrimary: {
    flex: 1,
    minHeight: 47,
    borderRadius: 13,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },

  navButtonDisabled: {
    opacity: 0.42,
  },

  navButtonText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  navButtonTextDisabled: {
    color: UI.muted2,
  },

  navButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  navButtonPrimaryTextDisabled: {
    color: UI.muted2,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: Platform.OS === "ios" ? 25 : 13,
    backgroundColor: "rgba(244,246,248,0.98)",
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },

  previewButton: {
    flex: 1,
    minHeight: 51,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#B9CADE",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  previewButtonText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  shareButton: {
    flex: 1,
    minHeight: 51,
    backgroundColor: UI.primary,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.58)",
    padding: 11,
    justifyContent: "center",
  },

  modalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
  },

  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
    fontWeight: "900",
    marginTop: 2,
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
    padding: 8,
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

  loadingText: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 9,
  },

  modalFooter: {
    padding: 11,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    gap: 8,
  },

  modalSecondary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.borderDark,
    backgroundColor: UI.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  modalSecondaryText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "900",
  },

  modalPrimary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 12,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  modalPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
});