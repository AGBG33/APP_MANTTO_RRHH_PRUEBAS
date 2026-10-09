// app/tecnico/ordenes/[orderid]/autorizacion-gastos-error-humano.js
// Autorización de gastos por error humano — diseño simple y técnico.
// Mantiene fechas, costos, refacciones, vistos buenos y vista previa del PDF sin validaciones bloqueantes.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import Header from "../../../../src/components/Header";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { buildAutorizacionGastosHtml } from "../../../../src/services/templates/autorizacion_gastos_error_humano/buildAutorizacionGastosHtml";

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
  dark: "#172033",
};

const STEPS = [
  { key: "general", title: "General", short: "Equipo" },
  { key: "problema", title: "Problema", short: "Causa" },
  { key: "costos", title: "Costos", short: "Refacciones" },
  { key: "resultado", title: "Resultado", short: "Cierre" },
  { key: "firmas", title: "Firmas", short: "Vo.Bo." },
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
  return new Date(yyyy, mm - 1, dd);
}

const newRefaccion = () => ({
  codigo: "",
  nombre: "",
  horasHombre: "",
  costoManoObra: "",
  costoMateriales: "",
  costoTransporte: "",
  costoTotal: "",
});

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
      <Label>{label}</Label>

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
          style={[styles.input, multiline && styles.textArea]}
          value={String(value ?? "")}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={UI.muted2}
          multiline={multiline}
          keyboardType={keyboardType}
          editable={editable}
        />
      </View>
    </View>
  );
}

function DateButton({ label, value, onPress }) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>

      <TouchableOpacity style={styles.dateBtn} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.dateLeft}>
          <Ionicons name="calendar-outline" size={17} color={UI.blue} />
          <Text style={[styles.dateBtnText, !value && { color: UI.muted2 }]}>
            {value || "DD/MM/AAAA"}
          </Text>
        </View>

        <Ionicons name="chevron-down-outline" size={18} color={UI.muted} />
      </TouchableOpacity>
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

function StatBox({ label, value, tone = "blue" }) {
  const toneStyle =
    tone === "green"
      ? styles.statGreen
      : tone === "yellow"
      ? styles.statYellow
      : tone === "red"
      ? styles.statRed
      : styles.statBlue;

  return (
    <View style={[styles.statBox, toneStyle]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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

export default function AutorizacionGastosErrorHumanoForm() {
  const fechaHoy = useMemo(() => formatDateDMY(new Date()), []);

  const [activeStep, setActiveStep] = useState(0);

  const [mx, setMx] = useState("");
  const [direccion, setDireccion] = useState("");
  const [fechaEmision, setFechaEmision] = useState(fechaHoy);
  const [noEquipo, setNoEquipo] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [tipoControl, setTipoControl] = useState("");
  const [fechaEntregaEquipo, setFechaEntregaEquipo] = useState("");
  const [fechaAcontecimientos, setFechaAcontecimientos] = useState("");

  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [accionInmediata, setAccionInmediata] = useState("");
  const [resultadoFinal, setResultadoFinal] = useState("");

  const [refacciones, setRefacciones] = useState([
    newRefaccion(),
    newRefaccion(),
  ]);

  const [emitio, setEmitio] = useState("");
  const [voboMantenimiento, setVoboMantenimiento] = useState("");
  const [voboFinanzas, setVoboFinanzas] = useState("");
  const [enteradoDirector, setEnteradoDirector] = useState("");

  const [dateTarget, setDateTarget] = useState(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const setDateValue = (target, value) => {
    if (target === "fechaEmision") setFechaEmision(value);
    if (target === "fechaEntregaEquipo") setFechaEntregaEquipo(value);
    if (target === "fechaAcontecimientos") setFechaAcontecimientos(value);
  };

  const getDateValue = (target) => {
    if (target === "fechaEmision") return fechaEmision;
    if (target === "fechaEntregaEquipo") return fechaEntregaEquipo;
    if (target === "fechaAcontecimientos") return fechaAcontecimientos;
    return "";
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;
    setDateValue(dateTarget, formatDateDMY(selectedDate));
  };

  const addRefaccion = () => {
    setRefacciones((prev) => [...prev, newRefaccion()]);
  };

  const removeRefaccion = (idx) => {
    setRefacciones((prev) => {
      if (prev.length <= 1) return [newRefaccion()];
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateRefaccion = (idx, field, value) => {
    setRefacciones((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const buildPayload = () => ({
    mx: safe(mx),
    direccion: safe(direccion),
    fechaEmision: safe(fechaEmision),
    noEquipo: safe(noEquipo),
    razonSocial: safe(razonSocial),
    tipoControl: safe(tipoControl),
    fechaEntregaEquipo: safe(fechaEntregaEquipo),
    fechaAcontecimientos: safe(fechaAcontecimientos),
    descripcionProblema: safe(descripcionProblema),
    accionInmediata: safe(accionInmediata),
    refacciones: refacciones.map((r) => ({
      codigo: safe(r.codigo),
      nombre: safe(r.nombre),
      horasHombre: safe(r.horasHombre),
      costoManoObra: safe(r.costoManoObra),
      costoMateriales: safe(r.costoMateriales),
      costoTransporte: safe(r.costoTransporte),
      costoTotal: safe(r.costoTotal),
    })),
    resultadoFinal: safe(resultadoFinal),
    emitio: safe(emitio),
    voboMantenimiento: safe(voboMantenimiento),
    voboFinanzas: safe(voboFinanzas),
    enteradoDirector: safe(enteradoDirector),
  });

  const generarPdfLocal = async () => {
    const html = buildAutorizacionGastosHtml(buildPayload());

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

  const generarPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setPdfUri(null);
      setShowPreview(true);

      await generarPdfLocal();
    } catch (e) {
      console.log("[AUTORIZACION GASTOS PDF] error:", e);
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
          "Este dispositivo no permite abrir/compartir archivos."
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Abrir / compartir autorización de gastos",
      });
    } catch (e) {
      console.log("[AUTORIZACION GASTOS] abrirPdf error:", e);
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const filledCount = useMemo(() => {
    const values = [
      mx,
      direccion,
      fechaEmision,
      noEquipo,
      razonSocial,
      tipoControl,
      fechaEntregaEquipo,
      fechaAcontecimientos,
      descripcionProblema,
      accionInmediata,
      resultadoFinal,
      emitio,
      voboMantenimiento,
      voboFinanzas,
      enteradoDirector,
    ];

    return values.filter((v) => !!safe(v)).length;
  }, [
    mx,
    direccion,
    fechaEmision,
    noEquipo,
    razonSocial,
    tipoControl,
    fechaEntregaEquipo,
    fechaAcontecimientos,
    descripcionProblema,
    accionInmediata,
    resultadoFinal,
    emitio,
    voboMantenimiento,
    voboFinanzas,
    enteradoDirector,
  ]);

  const refCount = useMemo(() => {
    return refacciones.filter(
      (r) =>
        safe(r.codigo) ||
        safe(r.nombre) ||
        safe(r.horasHombre) ||
        safe(r.costoManoObra) ||
        safe(r.costoMateriales) ||
        safe(r.costoTransporte) ||
        safe(r.costoTotal)
    ).length;
  }, [refacciones]);

  const totalEstimado = useMemo(() => {
    return refacciones.reduce((acc, r) => {
      const raw = String(r.costoTotal || "")
        .replace("$", "")
        .replace(",", "")
        .trim();

      const n = Number(raw);
      return acc + (Number.isNaN(n) ? 0 : n);
    }, 0);
  }, [refacciones]);

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

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
        icon="cash-outline"
        title="Resumen de autorización"
        subtitle="Datos principales del documento."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="MX" value={mx} />
          <InfoItem label="Equipo" value={noEquipo} />
          <InfoItem label="Fecha emisión" value={fechaEmision} />
          <InfoItem label="PDF" value="Libre / sin validación" />
        </View>
      </SectionBox>

      <SectionBox
        icon="information-circle-outline"
        title="Datos principales"
        subtitle="Información base del equipo y cliente."
      >
        <FieldRow>
          <Field small>
            <Input
              label="MX"
              value={mx}
              onChangeText={setMx}
              placeholder="MX..."
              icon="barcode-outline"
            />
          </Field>

          <Field>
            <Input
              label="No. equipo"
              value={noEquipo}
              onChangeText={setNoEquipo}
              placeholder="No. equipo"
              icon="construct-outline"
            />
          </Field>
        </FieldRow>

        <Input
          label="Razón social"
          value={razonSocial}
          onChangeText={setRazonSocial}
          placeholder="Razón social"
          icon="business-outline"
        />

        <Input
          label="Dirección"
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Dirección completa"
          icon="location-outline"
          multiline
        />

        <Input
          label="Tipo de control"
          value={tipoControl}
          onChangeText={setTipoControl}
          placeholder="Tipo de control"
          icon="settings-outline"
        />

        <FieldRow>
          <Field>
            <DateButton
              label="Fecha de emisión"
              value={fechaEmision}
              onPress={() => setDateTarget("fechaEmision")}
            />
          </Field>

          <Field>
            <DateButton
              label="Fecha de entrega del equipo"
              value={fechaEntregaEquipo}
              onPress={() => setDateTarget("fechaEntregaEquipo")}
            />
          </Field>
        </FieldRow>

        <DateButton
          label="Fecha de acontecimientos"
          value={fechaAcontecimientos}
          onPress={() => setDateTarget("fechaAcontecimientos")}
        />
      </SectionBox>
    </>
  );

  const renderProblema = () => (
    <>
      <SectionBox
        icon="alert-circle-outline"
        title="Descripción del problema"
        subtitle="Describe qué ocurrió y por qué se genera la autorización."
      >
        <Input
          label="Descripción"
          value={descripcionProblema}
          onChangeText={setDescripcionProblema}
          placeholder="Describe el problema..."
          multiline
          icon="alert-circle-outline"
        />
      </SectionBox>

      <SectionBox
        icon="flash-outline"
        title="Acción inmediata"
        subtitle="Acciones realizadas para contener o atender el problema."
      >
        <Input
          label="Acción inmediata"
          value={accionInmediata}
          onChangeText={setAccionInmediata}
          placeholder="Describe la acción inmediata..."
          multiline
          icon="flash-outline"
        />
      </SectionBox>
    </>
  );

  const renderCostos = () => (
    <SectionBox
      icon="cube-outline"
      title="Refacciones y costos"
      subtitle="Captura materiales, mano de obra, transporte y costo total."
    >
      <View style={styles.costSummary}>
        <View>
          <Text style={styles.costTitle}>Resumen de costos</Text>
          <Text style={styles.costHint}>
            El total es solo una referencia visual.
          </Text>
        </View>

        <View style={styles.costPill}>
          <Text style={styles.costPillText}>
            ${totalEstimado.toLocaleString("es-MX")}
          </Text>
        </View>
      </View>

      {refacciones.map((r, idx) => (
        <View key={`refaccion-${idx}`} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <View>
              <Text style={styles.rowTitle}>Refacción {idx + 1}</Text>
              <Text style={styles.rowSub}>Material, horas y costos</Text>
            </View>

            <TouchableOpacity onPress={() => removeRefaccion(idx)}>
              <Text style={styles.removeTxt}>Eliminar</Text>
            </TouchableOpacity>
          </View>

          <FieldRow>
            <Field>
              <Input
                label="Código de refacción"
                value={r.codigo}
                onChangeText={(v) => updateRefaccion(idx, "codigo", v)}
                placeholder="Código"
                icon="barcode-outline"
              />
            </Field>

            <Field>
              <Input
                label="Nombre de refacción"
                value={r.nombre}
                onChangeText={(v) => updateRefaccion(idx, "nombre", v)}
                placeholder="Nombre"
                icon="cube-outline"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field small>
              <Input
                label="Horas hombre"
                value={r.horasHombre}
                onChangeText={(v) => updateRefaccion(idx, "horasHombre", v)}
                placeholder="Horas"
                icon="time-outline"
                keyboardType="numeric"
              />
            </Field>

            <Field small>
              <Input
                label="Mano de obra"
                value={r.costoManoObra}
                onChangeText={(v) => updateRefaccion(idx, "costoManoObra", v)}
                placeholder="$"
                icon="cash-outline"
                keyboardType="numeric"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field small>
              <Input
                label="Materiales"
                value={r.costoMateriales}
                onChangeText={(v) => updateRefaccion(idx, "costoMateriales", v)}
                placeholder="$"
                icon="cash-outline"
                keyboardType="numeric"
              />
            </Field>

            <Field small>
              <Input
                label="Transporte"
                value={r.costoTransporte}
                onChangeText={(v) => updateRefaccion(idx, "costoTransporte", v)}
                placeholder="$"
                icon="car-outline"
                keyboardType="numeric"
              />
            </Field>

            <Field small>
              <Input
                label="Costo total"
                value={r.costoTotal}
                onChangeText={(v) => updateRefaccion(idx, "costoTotal", v)}
                placeholder="$"
                icon="calculator-outline"
                keyboardType="numeric"
              />
            </Field>
          </FieldRow>
        </View>
      ))}

      <TouchableOpacity style={styles.secondary} onPress={addRefaccion}>
        <Ionicons name="add-circle-outline" size={18} color={UI.blue} />
        <Text style={styles.secondaryText}>Agregar refacción</Text>
      </TouchableOpacity>
    </SectionBox>
  );

  const renderResultado = () => (
    <SectionBox
      icon="checkmark-done-outline"
      title="Resultado final y contramedida"
      subtitle="Conclusión del caso y acciones para evitar recurrencia."
    >
      <Input
        label="Resultado final y contramedida"
        value={resultadoFinal}
        onChangeText={setResultadoFinal}
        placeholder="Resultado final..."
        multiline
        icon="checkmark-done-outline"
      />
    </SectionBox>
  );

  const renderFirmas = () => (
    <SectionBox
      icon="create-outline"
      title="Firmas y vistos buenos"
      subtitle="Responsables de emisión, mantenimiento, finanzas y dirección."
    >
      <Input
        label="Emitió"
        value={emitio}
        onChangeText={setEmitio}
        placeholder="Nombre"
        icon="person-outline"
      />

      <Input
        label="Vo.Bo. mantenimiento"
        value={voboMantenimiento}
        onChangeText={setVoboMantenimiento}
        placeholder="Nombre"
        icon="person-outline"
      />

      <Input
        label="Vo.Bo. finanzas"
        value={voboFinanzas}
        onChangeText={setVoboFinanzas}
        placeholder="Nombre"
        icon="person-outline"
      />

      <Input
        label="Enterado director general"
        value={enteradoDirector}
        onChangeText={setEnteradoDirector}
        placeholder="Nombre"
        icon="person-outline"
      />
    </SectionBox>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderProblema();
    if (activeStep === 2) return renderCostos();
    if (activeStep === 3) return renderResultado();
    return renderFirmas();
  };

  return (
    <View style={styles.container}>
      <Header title="Autorización de gastos" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Autorización de gastos</Text>
            <Text style={styles.introText}>
              Registra el caso, los costos relacionados y los vistos buenos.
              La vista previa está disponible aunque aún existan campos vacíos.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.introPreviewButton}
            onPress={generarPreviewPdf}
            disabled={generatingPdf}
            activeOpacity={0.86}
          >
            <Text style={styles.introPreviewButtonText}>Ver PDF</Text>
          </TouchableOpacity>
        </View>

        {renderStepIndicator()}

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
            style={[styles.navBtn, activeStep === 0 && styles.navBtnDisabled]}
            onPress={goBack}
            disabled={activeStep === 0}
            activeOpacity={0.86}
          >
            <Text
              style={[
                styles.navBtnText,
                activeStep === 0 && styles.navBtnTextDisabled,
              ]}
            >
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navBtnPrimary,
              activeStep === STEPS.length - 1 && styles.navBtnDisabled,
            ]}
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
          onPress={generarPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="eye-outline" size={18} color={UI.blue} />
              <Text style={styles.previewBtnText}>Vista previa</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={abrirPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          <Ionicons name="share-social-outline" size={18} color="#fff" />
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
                <Text style={styles.modalKicker}>Documento</Text>
                <Text style={styles.modalTitle}>Vista previa del reporte</Text>
              </View>

              <TouchableOpacity
                onPress={() => setShowPreview(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={UI.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.webWrap}>
              {generatingPdf || !previewHtml ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={UI.blue} />
                  <Text style={styles.loadingText}>Generando PDF…</Text>
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
                style={styles.footerLight}
                onPress={() => setShowPreview(false)}
              >
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

const elev = (multiplier = 1) =>
  Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 8 * multiplier,
      shadowOffset: { width: 0, height: 3 * multiplier },
    },
    android: { elevation: 2 * multiplier },
    default: {},
  });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.bg,
    padding: 24,
  },

  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 10,
    color: UI.muted,
    fontSize: 13,
    fontWeight: "600",
  },

  content: {
    padding: 14,
    paddingBottom: 122,
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
    minWidth: 84,
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

  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: UI.blueSoft,
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
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    marginTop: 3,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    overflow: "hidden",
  },

  infoItem: {
    flexGrow: 1,
    flexBasis: "48%",
    minWidth: 145,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: UI.border,
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
    fontSize: 13.5,
    fontWeight: "700",
    lineHeight: 18,
  },

  inputBlock: {
    marginBottom: 12,
  },

  label: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },

  inputWrap: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 11,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },

  inputWrapMultiline: {
    alignItems: "flex-start",
  },

  readonly: {
    backgroundColor: UI.cardSoft,
  },

  readonlyWrap: {
    backgroundColor: UI.cardSoft,
  },

  input: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    fontSize: 14,
    fontWeight: "500",
    color: UI.text,
  },

  textArea: {
    minHeight: 108,
    height: 108,
    paddingTop: 10,
    textAlignVertical: "top",
  },

  pickerBox: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },

  pickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  pickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: UI.text,
  },

  dateBtn: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },

  dateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  dateBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: UI.text,
  },

  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
    marginBottom: 4,
  },

  chip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  chipBlue: {
    backgroundColor: UI.blueSoft,
    borderColor: "#B2C6E6",
  },

  chipGreen: {
    backgroundColor: UI.greenSoft,
    borderColor: "#ABEFC6",
  },

  chipYellow: {
    backgroundColor: UI.yellowSoft,
    borderColor: "#FEDF89",
  },

  chipRed: {
    backgroundColor: UI.redSoft,
    borderColor: "#FECDCA",
  },

  chipText: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "700",
  },

  chipTextActive: {
    color: UI.text,
  },

  rowCard: {
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: UI.cardSoft,
  },

  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  rowTitle: {
    fontWeight: "800",
    color: UI.text,
    fontSize: 14,
  },

  rowSub: {
    marginTop: 2,
    color: UI.muted,
    fontWeight: "500",
    fontSize: 11,
  },

  removeTxt: {
    color: UI.red,
    fontWeight: "700",
    fontSize: 12,
  },


  costSummary: {
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  costTitle: {
    color: UI.text,
    fontWeight: "800",
    fontSize: 14,
  },

  costHint: {
    color: UI.muted,
    fontWeight: "500",
    fontSize: 11,
    marginTop: 2,
  },

  costPill: {
    backgroundColor: UI.blueSoft,
    borderWidth: 1,
    borderColor: "#B2C6E6",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  costPillText: {
    color: UI.blue,
    fontWeight: "800",
    fontSize: 13,
  },

  secondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    padding: 12,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  secondaryText: {
    color: UI.blue,
    fontWeight: "800",
    fontSize: 13,
  },

  primaryDark: {
    backgroundColor: UI.blue,
    padding: 13,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  primaryDarkText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },

  navRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },

  navBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 11,
    alignItems: "center",
    paddingVertical: 13,
  },

  navBtnPrimary: {
    flex: 1,
    backgroundColor: UI.blue,
    borderWidth: 1,
    borderColor: UI.blue,
    borderRadius: 11,
    alignItems: "center",
    paddingVertical: 13,
  },

  navBtnDisabled: {
    opacity: 0.42,
  },

  navBtnText: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "800",
  },

  navBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
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
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "rgba(244,246,248,0.98)",
    borderTopWidth: 1,
    borderTopColor: UI.border,
  },

  draftBtn: {
    flex: 0.9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
  },

  draftBtnText: {
    color: UI.blue,
    fontSize: 12,
    fontWeight: "800",
  },

  previewBtn: {
    flex: 1.25,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.blue,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
  },

  previewBtnText: {
    color: UI.blue,
    fontSize: 12.5,
    fontWeight: "800",
  },

  shareBtn: {
    flex: 1,
    backgroundColor: UI.blue,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
  },

  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23,32,51,0.56)",
    padding: 12,
    justifyContent: "center",
  },

  modalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },

  modalHeader: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },

  modalKicker: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  modalTitle: {
    color: UI.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 1,
  },

  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
  },

  webWrap: {
    flex: 1,
    padding: 8,
  },

  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  modalFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    flexDirection: "row",
    gap: 10,
  },

  footerLight: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.borderDark,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },

  footerLightText: {
    fontWeight: "800",
    color: UI.text,
    fontSize: 13,
  },

  footerPrimary: {
    flex: 1,
    backgroundColor: UI.blue,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },

  footerPrimaryText: {
    fontWeight: "800",
    color: "#FFFFFF",
    fontSize: 13,
  },

  // Compatibilidad con componentes auxiliares que ya no se muestran en el encabezado.
  hero: {},
  heroTop: {},
  heroIcon: {},
  heroKicker: {},
  heroTitle: {},
  heroSub: {},
  heroBadge: {},
  heroBadgeText: {},
  statsRow: {},
  statBox: {},
  statBlue: {},
  statGreen: {},
  statYellow: {},
  statRed: {},
  statValue: {},
  statLabel: {},
  progressCard: {},
  progressTitle: {},
  stepsScroll: {},
  stepItem: {},
  stepItemActive: {},
  stepItemDone: {},
  stepNumber: {},
  stepNumberActive: {},
  stepNumberDone: {},
  stepNumberText: {},
  stepNumberTextActive: {},
  stepName: {},
  stepNameActive: {},
  stepNameDone: {},
  stepShort: {},
  activeStepHeader: {},
  activeStepSmall: {},
  activeStepTitle: {},
});