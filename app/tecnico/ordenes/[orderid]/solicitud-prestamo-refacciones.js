// app/tecnico/ordenes/[orderid]/solicitud-prestamo-refacciones.js
// Solicitud de préstamo de refacciones
// Diseño limpio tipo wizard, con borrador local, vista previa y generación de PDF.
// Sin validaciones bloqueantes para poder visualizar el PDF aunque falten datos.

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
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import Header from "../../../../src/components/Header";
import { buildSolicitudPrestamoRefaccionesHtml } from "../../../../src/services/templates/solicitud_prestamo_refacciones/buildSolicitudPrestamoRefaccionesHtml";

const UI = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  soft: "#F8FAFC",
  border: "#E1E6EC",
  borderDark: "#CCD4DE",
  text: "#172033",
  muted: "#687386",
  muted2: "#9AA4B2",
  primary: "#123A72",
  primarySoft: "#EEF4FC",
  success: "#2E7D5B",
  successSoft: "#EDF7F2",
  warning: "#A56A00",
  warningSoft: "#FFF7E8",
  danger: "#B84646",
  dangerSoft: "#FFF0F0",
  dark: "#202938",
};

const STEPS = [
  { key: "general", title: "General", short: "Equipo" },
  { key: "solicitante", title: "Solicitante", short: "Responsable" },
  { key: "refacciones", title: "Refacciones", short: "Préstamo" },
  { key: "motivo", title: "Motivo", short: "Justificación" },
  { key: "firmas", title: "Firmas", short: "Autorización" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const safe = (v) => String(v ?? "").trim();

function formatDMY(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatLongDateEs(d) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return formatDMY(d);
  }
}

function parseIsoDate(value) {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

const newRefaccion = () => ({
  codigo: "",
  cantidad: "",
  nombreRef: "",
  fechaDevolucionISO: null,
  fechaRealISO: null,
});

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

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
          editable={editable}
          keyboardType={keyboardType}
          style={[styles.input, multiline && styles.textArea]}
        />
      </View>
    </View>
  );
}

function Choice({ active, label, onPress, tone = "primary" }) {
  const toneStyle =
    tone === "success"
      ? styles.choiceSuccessActive
      : tone === "warning"
      ? styles.choiceWarningActive
      : styles.choicePrimaryActive;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[styles.choice, active && toneStyle]}
    >
      <View style={[styles.choiceDot, active && styles.choiceDotActive]}>
        {active ? <View style={styles.choiceDotInner} /> : null}
      </View>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DateField({ label, value, onPress, placeholder = "DD/MM/AAAA", readonly = false }) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>

      <TouchableOpacity
        onPress={readonly ? undefined : onPress}
        disabled={readonly}
        activeOpacity={0.9}
        style={[styles.dateField, readonly && styles.readonlyWrap]}
      >
        <View style={styles.dateLeft}>
          <Ionicons
            name={readonly ? "lock-closed-outline" : "calendar-outline"}
            size={17}
            color={readonly ? UI.muted2 : UI.primary}
          />
          <Text style={[styles.dateText, !value && styles.placeholderText]}>
            {value || placeholder}
          </Text>
        </View>

        {!readonly ? (
          <Ionicons name="chevron-down-outline" size={17} color={UI.muted} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function Section({ title, subtitle, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon || "document-text-outline"} size={18} color={UI.primary} />
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

function SummaryItem({ label, value }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.summaryValue}>
        {value || "—"}
      </Text>
    </View>
  );
}

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Field({ children, small = false }) {
  return <View style={[styles.field, small && styles.fieldSmall]}>{children}</View>;
}

export default function SolicitudPrestamoRefaccionesForm() {
  const { orderid } = useLocalSearchParams();
  const safeOrderId = safe(orderid || "local");

  const draftKey = useMemo(
    () => `solicitud_prestamo_refacciones:${safeOrderId || "local"}`,
    [safeOrderId]
  );

  const [activeStep, setActiveStep] = useState(0);

  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [departamento, setDepartamento] = useState("Mantenimiento");
  const [equipoMx, setEquipoMx] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estadoEquipo, setEstadoEquipo] = useState("Detenido");

  const [solicitante, setSolicitante] = useState("");
  const [puesto, setPuesto] = useState("");

  const [refacciones, setRefacciones] = useState([newRefaccion()]);
  const [activeRowIndex, setActiveRowIndex] = useState(null);
  const [showRowDatePicker, setShowRowDatePicker] = useState(false);

  const [motivo, setMotivo] = useState("");

  const [firmaSolicitante, setFirmaSolicitante] = useState("");
  const [firmaJefatura, setFirmaJefatura] = useState("");
  const [firmaAutorizacion, setFirmaAutorizacion] = useState("");

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const buildPayload = useCallback(() => {
    return {
      orderid: safeOrderId,
      fechaIso: fecha?.toISOString?.() || new Date().toISOString(),
      fechaDMY: formatDMY(fecha),
      fechaTexto: formatLongDateEs(fecha),
      departamento: safe(departamento),
      equipoMx: safe(equipoMx),
      razonSocial: safe(razonSocial),
      direccion: safe(direccion),
      estadoEquipo: safe(estadoEquipo),
      solicitante: safe(solicitante),
      puesto: safe(puesto),
      refacciones: refacciones.map((r) => ({
        codigo: safe(r.codigo),
        cantidad: safe(r.cantidad),
        nombreRef: safe(r.nombreRef),
        fechaDevolucionISO: r.fechaDevolucionISO || null,
        fechaDevolucionDMY: r.fechaDevolucionISO
          ? formatDMY(parseIsoDate(r.fechaDevolucionISO))
          : "",
        fechaRealISO: r.fechaRealISO || null,
        fechaRealDMY: r.fechaRealISO
          ? formatDMY(parseIsoDate(r.fechaRealISO))
          : "",
      })),
      motivo: safe(motivo),
      firmaSolicitante: safe(firmaSolicitante),
      firmaJefatura: safe(firmaJefatura),
      firmaAutorizacion: safe(firmaAutorizacion),
      notaAlmacen: 'La columna "Fecha REAL" es de llenado exclusivo por almacén.',
    };
  }, [
    safeOrderId,
    fecha,
    departamento,
    equipoMx,
    razonSocial,
    direccion,
    estadoEquipo,
    solicitante,
    puesto,
    refacciones,
    motivo,
    firmaSolicitante,
    firmaJefatura,
    firmaAutorizacion,
  ]);

  const loadDraft = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(draftKey);
      if (!raw) return;

      const d = JSON.parse(raw);

      if (d.fechaIso || d.fecha) {
        const nextDate = new Date(d.fechaIso || d.fecha);
        if (!Number.isNaN(nextDate.getTime())) setFecha(nextDate);
      }

      setDepartamento(d.departamento ?? "Mantenimiento");
      setEquipoMx(d.equipoMx ?? "");
      setRazonSocial(d.razonSocial ?? "");
      setDireccion(d.direccion ?? "");
      setEstadoEquipo(d.estadoEquipo ?? "Detenido");
      setSolicitante(d.solicitante ?? "");
      setPuesto(d.puesto ?? "");
      setRefacciones(
        Array.isArray(d.refacciones) && d.refacciones.length
          ? d.refacciones.map((r) => ({
              codigo: r?.codigo ?? "",
              cantidad: r?.cantidad ?? "",
              nombreRef: r?.nombreRef ?? "",
              fechaDevolucionISO: r?.fechaDevolucionISO || null,
              fechaRealISO: r?.fechaRealISO || null,
            }))
          : [newRefaccion()]
      );
      setMotivo(d.motivo ?? "");
      setFirmaSolicitante(d.firmaSolicitante ?? "");
      setFirmaJefatura(d.firmaJefatura ?? "");
      setFirmaAutorizacion(d.firmaAutorizacion ?? "");
    } catch (e) {
      console.log("[PRESTAMO REFACCIONES] loadDraft error:", e);
      Alert.alert("Error", "No se pudo cargar el borrador.");
    }
  }, [draftKey]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const saveDraft = useCallback(async () => {
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(buildPayload()));
      Alert.alert("Borrador guardado", "La solicitud se guardó localmente.");
    } catch (e) {
      console.log("[PRESTAMO REFACCIONES] saveDraft error:", e);
      Alert.alert("Error", "No se pudo guardar el borrador.");
    }
  }, [draftKey, buildPayload]);

  const guardarLocal = async () => {
    const payload = buildPayload();

    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {}

    console.log(
      "SOLICITUD_PRESTAMO_REFACCIONES_OUTPUT =>",
      JSON.stringify(payload, null, 2)
    );

    Alert.alert(
      "Datos guardados",
      "La solicitud se guardó localmente. Puedes generar el PDF aunque existan campos vacíos."
    );
  };

  const addRefaccion = () => {
    setPdfUri(null);
    setRefacciones((prev) => [...prev, newRefaccion()]);
  };

  const removeRefaccion = (idx) => {
    setPdfUri(null);
    setRefacciones((prev) => {
      if (prev.length <= 1) return [newRefaccion()];
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateRefaccion = (idx, field, value) => {
    setPdfUri(null);
    setRefacciones((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const openFechaDevolucion = (idx) => {
    setActiveRowIndex(idx);
    setShowRowDatePicker(true);
  };

  const onChangeRowDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setShowRowDatePicker(false);
    if (!selectedDate || activeRowIndex === null) return;

    updateRefaccion(activeRowIndex, "fechaDevolucionISO", selectedDate.toISOString());
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate) {
      setPdfUri(null);
      setFecha(selectedDate);
    }
  };

  const generarPdfLocal = async () => {
    const payload = buildPayload();
    const html = buildSolicitudPrestamoRefaccionesHtml(payload);

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
      console.log("[PRESTAMO REFACCIONES PDF] preview error:", e);
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
        dialogTitle: "Abrir / compartir solicitud de préstamo de refacciones",
      });
    } catch (e) {
      console.log("[PRESTAMO REFACCIONES PDF] compartir error:", e);
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const filledRefacciones = useMemo(() => {
    return refacciones.filter(
      (r) => safe(r.codigo) || safe(r.cantidad) || safe(r.nombreRef) || r.fechaDevolucionISO
    ).length;
  }, [refacciones]);

  const goNext = () => {
    setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setActiveStep((s) => Math.max(s - 1, 0));
  };

  const renderProgress = () => {
    const pct = Math.round(((activeStep + 1) / STEPS.length) * 100);

    return (
      <View style={styles.progressBlock}>
        <View style={styles.progressTop}>
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
          contentContainerStyle={styles.stepsRow}
        >
          {STEPS.map((step, index) => {
            const active = index === activeStep;
            const done = index < activeStep;

            return (
              <TouchableOpacity
                key={step.key}
                onPress={() => setActiveStep(index)}
                activeOpacity={0.86}
                style={[styles.stepTab, active && styles.stepTabActive]}
              >
                <View
                  style={[
                    styles.stepCircle,
                    active && styles.stepCircleActive,
                    done && styles.stepCircleDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepCircleText,
                      (active || done) && styles.stepCircleTextActive,
                    ]}
                  >
                    {done ? "✓" : index + 1}
                  </Text>
                </View>

                <Text style={[styles.stepTabText, active && styles.stepTabTextActive]}>
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
      <Section
        icon="document-text-outline"
        title="Solicitud de préstamo"
        subtitle="Información general del equipo y del servicio."
      >
        <View style={styles.summaryGrid}>
          <SummaryItem label="Fecha" value={formatDMY(fecha)} />
          <SummaryItem label="Departamento" value={departamento} />
          <SummaryItem label="Equipo" value={equipoMx} />
          <SummaryItem label="Estado" value={estadoEquipo} />
        </View>
      </Section>

      <Section
        icon="calendar-outline"
        title="Datos generales"
        subtitle="Captura los datos que aparecerán en el encabezado del formato."
      >
        <DateField
          label="Fecha"
          value={formatDMY(fecha)}
          onPress={() => setShowDatePicker(true)}
        />

        {showDatePicker && (
          <DateTimePicker
            value={fecha}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        )}

        <FieldRow>
          <Field>
            <Input
              label="Departamento"
              value={departamento}
              onChangeText={(v) => {
                setPdfUri(null);
                setDepartamento(v);
              }}
              placeholder="Mantenimiento"
              icon="business-outline"
            />
          </Field>

          <Field>
            <Input
              label="Equipo/s (MX-No)"
              value={equipoMx}
              onChangeText={(v) => {
                setPdfUri(null);
                setEquipoMx(v);
              }}
              placeholder="14JA448-07"
              icon="construct-outline"
            />
          </Field>
        </FieldRow>

        <Input
          label="Razón social"
          value={razonSocial}
          onChangeText={(v) => {
            setPdfUri(null);
            setRazonSocial(v);
          }}
          placeholder="Cliente / empresa"
          icon="briefcase-outline"
        />

        <Input
          label="Dirección"
          value={direccion}
          onChangeText={(v) => {
            setPdfUri(null);
            setDireccion(v);
          }}
          placeholder="Dirección completa"
          icon="location-outline"
          multiline
        />

        <Label>Estado del equipo</Label>
        <View style={styles.choiceRow}>
          <Choice
            label="Detenido"
            active={estadoEquipo === "Detenido"}
            tone="warning"
            onPress={() => {
              setPdfUri(null);
              setEstadoEquipo("Detenido");
            }}
          />

          <Choice
            label="Operando con deficiencias"
            active={estadoEquipo === "Operando con deficiencias"}
            tone="success"
            onPress={() => {
              setPdfUri(null);
              setEstadoEquipo("Operando con deficiencias");
            }}
          />
        </View>
      </Section>
    </>
  );

  const renderSolicitante = () => (
    <Section
      icon="person-outline"
      title="Datos del solicitante"
      subtitle="Responsable que solicita el préstamo de las refacciones."
    >
      <Input
        label="Nómina - Nombre"
        value={solicitante}
        onChangeText={(v) => {
          setPdfUri(null);
          setSolicitante(v);
        }}
        placeholder="00000 - Nombre Apellido"
        icon="person-circle-outline"
      />

      <Input
        label="Puesto"
        value={puesto}
        onChangeText={(v) => {
          setPdfUri(null);
          setPuesto(v);
        }}
        placeholder="Jefatura / Técnico / ..."
        icon="briefcase-outline"
      />
    </Section>
  );

  const renderRefacciones = () => (
    <Section
      icon="cube-outline"
      title="Refacciones solicitadas"
      subtitle="Agrega las piezas que se solicitan en préstamo y su fecha de devolución."
    >
      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={19} color={UI.primary} />
        <Text style={styles.noticeText}>
          La columna “Fecha REAL” queda reservada para llenado exclusivo de almacén.
        </Text>
      </View>

      <View style={styles.materialCounter}>
        <Text style={styles.materialCounterLabel}>Refacciones capturadas</Text>
        <Text style={styles.materialCounterValue}>{filledRefacciones}</Text>
      </View>

      {refacciones.map((r, idx) => (
        <View key={`refaccion-${idx}`} style={styles.materialCard}>
          <View style={styles.materialHeader}>
            <View>
              <Text style={styles.materialTitle}>Refacción {idx + 1}</Text>
              <Text style={styles.materialSubtitle}>Datos de la pieza solicitada</Text>
            </View>

            <TouchableOpacity onPress={() => removeRefaccion(idx)} activeOpacity={0.8}>
              <Text style={styles.removeText}>Eliminar</Text>
            </TouchableOpacity>
          </View>

          <FieldRow>
            <Field>
              <Input
                label="Código"
                value={r.codigo}
                onChangeText={(v) => updateRefaccion(idx, "codigo", v)}
                placeholder="KCD-1161 B"
                icon="barcode-outline"
              />
            </Field>

            <Field small>
              <Input
                label="Cantidad"
                value={r.cantidad}
                onChangeText={(v) => updateRefaccion(idx, "cantidad", v)}
                placeholder="1 PZA"
                icon="layers-outline"
              />
            </Field>
          </FieldRow>

          <Input
            label="Nombre de refacción"
            value={r.nombreRef}
            onChangeText={(v) => updateRefaccion(idx, "nombreRef", v)}
            placeholder="Descripción o nombre de la refacción"
            icon="cube-outline"
          />

          <FieldRow>
            <Field>
              <DateField
                label="Fecha de devolución"
                value={
                  r.fechaDevolucionISO
                    ? formatDMY(parseIsoDate(r.fechaDevolucionISO))
                    : ""
                }
                onPress={() => openFechaDevolucion(idx)}
              />
            </Field>

            <Field>
              <DateField
                label="Fecha REAL (almacén)"
                value={
                  r.fechaRealISO ? formatDMY(parseIsoDate(r.fechaRealISO)) : "—"
                }
                readonly
              />
            </Field>
          </FieldRow>
        </View>
      ))}

      {showRowDatePicker && (
        <DateTimePicker
          value={
            activeRowIndex !== null && refacciones[activeRowIndex]?.fechaDevolucionISO
              ? parseIsoDate(refacciones[activeRowIndex].fechaDevolucionISO)
              : new Date()
          }
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onChangeRowDate}
        />
      )}

      <TouchableOpacity style={styles.addButton} onPress={addRefaccion} activeOpacity={0.88}>
        <Ionicons name="add" size={18} color={UI.primary} />
        <Text style={styles.addButtonText}>Agregar refacción</Text>
      </TouchableOpacity>
    </Section>
  );

  const renderMotivo = () => (
    <>
      <Section
        icon="chatbox-ellipses-outline"
        title="Motivo de la solicitud"
        subtitle="Explica por qué se requiere el préstamo de las refacciones."
      >
        <Input
          label="Motivo"
          value={motivo}
          onChangeText={(v) => {
            setPdfUri(null);
            setMotivo(v);
          }}
          placeholder="Describe el motivo de la solicitud..."
          multiline
          icon="document-text-outline"
        />
      </Section>

      <Section
        icon="document-lock-outline"
        title="Compromiso del solicitante"
        subtitle="Condiciones establecidas en el formato de préstamo."
      >
        <View style={styles.commitmentBox}>
          <Text style={styles.commitmentText}>
            El solicitante se compromete a cerrar el préstamo de las refacciones
            descritas en un lapso no mayor a 30 días hábiles con los siguientes
            documentos:
          </Text>

          <View style={styles.commitmentItem}>
            <View style={styles.bullet} />
            <Text style={styles.commitmentItemText}>
              Memorándum de devolución con No. Aviso, No. Reserva y No. Diario.
            </Text>
          </View>

          <View style={styles.commitmentItem}>
            <View style={styles.bullet} />
            <Text style={styles.commitmentItemText}>Salida original de almacén.</Text>
          </View>

          <View style={styles.commitmentItem}>
            <View style={styles.bullet} />
            <Text style={styles.commitmentItemText}>Pieza(s) en buen estado.</Text>
          </View>
        </View>
      </Section>
    </>
  );

  const renderFirmas = () => (
    <>
      <Section
        icon="create-outline"
        title="Firmas y autorización"
        subtitle="Captura nombres, referencias de firma o sello para el documento."
      >
        <Input
          label="Firma y sello del solicitante"
          value={firmaSolicitante}
          onChangeText={(v) => {
            setPdfUri(null);
            setFirmaSolicitante(v);
          }}
          placeholder="Firma / nombre / sello"
          icon="create-outline"
        />

        <Input
          label="Firma y sello de jefatura"
          value={firmaJefatura}
          onChangeText={(v) => {
            setPdfUri(null);
            setFirmaJefatura(v);
          }}
          placeholder="Firma / nombre / sello"
          icon="create-outline"
        />

        <Input
          label="Autorización Dirección / Subdirección / Gerencia"
          value={firmaAutorizacion}
          onChangeText={(v) => {
            setPdfUri(null);
            setFirmaAutorizacion(v);
          }}
          placeholder="Firma / nombre / sello"
          icon="shield-checkmark-outline"
        />
      </Section>

      <Section
        icon="save-outline"
        title="Guardar información"
        subtitle="El guardado es local y no bloquea la generación del PDF."
      >
        <TouchableOpacity style={styles.saveLocalButton} onPress={guardarLocal} activeOpacity={0.88}>
          <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />
          <Text style={styles.saveLocalButtonText}>Guardar local</Text>
        </TouchableOpacity>
      </Section>
    </>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderSolicitante();
    if (activeStep === 2) return renderRefacciones();
    if (activeStep === 3) return renderMotivo();
    return renderFirmas();
  };

  return (
    <View style={styles.container}>
      <Header title="Préstamo de refacciones" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="swap-horizontal-outline" size={20} color={UI.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.introKicker}>Formato de almacén</Text>
            <Text style={styles.introTitle}>Solicitud de préstamo de refacciones</Text>
            <Text style={styles.introText}>
              Captura la solicitud y genera el PDF aun cuando existan campos pendientes.
            </Text>
          </View>

          <TouchableOpacity style={styles.introPdfButton} onPress={generarPreviewPdf} activeOpacity={0.88}>
            <Ionicons name="eye-outline" size={17} color={UI.primary} />
            <Text style={styles.introPdfButtonText}>Ver PDF</Text>
          </TouchableOpacity>
        </View>

        {renderProgress()}
        {renderStepContent()}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navButton, activeStep === 0 && styles.navButtonDisabled]}
            onPress={goBack}
            disabled={activeStep === 0}
            activeOpacity={0.88}
          >
            <Ionicons
              name="arrow-back-outline"
              size={17}
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
            activeOpacity={0.88}
          >
            <Text
              style={[
                styles.navButtonPrimaryText,
                activeStep === STEPS.length - 1 && styles.navButtonPrimaryTextDisabled,
              ]}
            >
              Siguiente
            </Text>
            <Ionicons
              name="arrow-forward-outline"
              size={17}
              color={activeStep === STEPS.length - 1 ? UI.muted2 : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.draftButton} onPress={saveDraft} activeOpacity={0.9}>
          <Ionicons name="save-outline" size={18} color={UI.primary} />
          <Text style={styles.draftButtonText}>Borrador</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.previewButton}
          onPress={generarPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
              <Text style={styles.previewButtonText}>Vista previa</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={abrirPdf}
          disabled={generatingPdf}
          activeOpacity={0.9}
        >
          <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
          <Text style={styles.shareButtonText}>PDF</Text>
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
                <Text style={styles.modalTitle}>Vista previa de la solicitud</Text>
              </View>

              <TouchableOpacity style={styles.modalClose} onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={20} color={UI.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.webWrap}>
              {generatingPdf || !previewHtml ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={UI.primary} />
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
              <TouchableOpacity style={styles.modalSecondary} onPress={() => setShowPreview(false)}>
                <Text style={styles.modalSecondaryText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalPrimary} onPress={abrirPdf}>
                <Ionicons name="share-social-outline" size={17} color="#FFFFFF" />
                <Text style={styles.modalPrimaryText}>Compartir PDF</Text>
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
    padding: 16,
    paddingBottom: 126,
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: UI.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  introKicker: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  introTitle: {
    color: UI.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2,
  },

  introText: {
    color: UI.muted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },

  introPdfButton: {
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
  },

  introPdfButtonText: {
    color: UI.primary,
    fontSize: 11,
    fontWeight: "800",
  },

  progressBlock: {
    marginTop: 14,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 18,
    padding: 14,
  },

  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  progressEyebrow: {
    color: UI.muted,
    fontSize: 10.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },

  progressCurrent: {
    color: UI.text,
    fontSize: 16,
    fontWeight: "800",
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
    backgroundColor: "#E9EDF2",
    overflow: "hidden",
    marginTop: 11,
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: UI.primary,
  },

  stepsRow: {
    gap: 8,
    paddingTop: 12,
    paddingRight: 10,
  },

  stepTab: {
    minWidth: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },

  stepTabActive: {
    backgroundColor: UI.primarySoft,
  },

  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#EDF0F4",
    alignItems: "center",
    justifyContent: "center",
  },

  stepCircleActive: {
    backgroundColor: UI.primary,
  },

  stepCircleDone: {
    backgroundColor: UI.success,
  },

  stepCircleText: {
    color: UI.muted,
    fontSize: 10.5,
    fontWeight: "900",
  },

  stepCircleTextActive: {
    color: "#FFFFFF",
  },

  stepTabText: {
    color: UI.muted,
    fontSize: 11.5,
    fontWeight: "800",
  },

  stepTabTextActive: {
    color: UI.primary,
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
    borderRadius: 10,
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
    fontSize: 11.5,
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
    flexBasis: "47%",
    minWidth: 135,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    paddingTop: 8,
    paddingBottom: 3,
  },

  summaryLabel: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  summaryValue: {
    color: UI.text,
    fontSize: 13.5,
    fontWeight: "800",
    marginTop: 3,
  },

  inputBlock: {
    marginBottom: 11,
  },

  label: {
    color: UI.muted,
    fontSize: 10.5,
    fontWeight: "800",
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
    backgroundColor: "#F1F3F6",
    borderColor: UI.border,
  },

  input: {
    flex: 1,
    color: UI.text,
    fontSize: 13.5,
    fontWeight: "600",
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
  },

  textArea: {
    minHeight: 105,
    textAlignVertical: "top",
  },

  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  field: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 160,
  },

  fieldSmall: {
    minWidth: 110,
  },

  dateField: {
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

  dateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  dateText: {
    color: UI.text,
    fontSize: 13.5,
    fontWeight: "700",
  },

  placeholderText: {
    color: UI.muted2,
  },

  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },

  choice: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },

  choicePrimaryActive: {
    backgroundColor: UI.primarySoft,
    borderColor: "#B6CAE3",
  },

  choiceSuccessActive: {
    backgroundColor: UI.successSoft,
    borderColor: "#B7D9C9",
  },

  choiceWarningActive: {
    backgroundColor: UI.warningSoft,
    borderColor: "#E5C888",
  },

  choiceDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: UI.borderDark,
    alignItems: "center",
    justifyContent: "center",
  },

  choiceDotActive: {
    borderColor: UI.primary,
  },

  choiceDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI.primary,
  },

  choiceText: {
    color: UI.text,
    fontSize: 12.5,
    fontWeight: "700",
  },

  choiceTextActive: {
    color: UI.primary,
  },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: UI.primarySoft,
    borderRadius: 12,
    padding: 11,
    marginBottom: 11,
  },

  noticeText: {
    flex: 1,
    color: UI.muted,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },

  materialCounter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  materialCounterLabel: {
    color: UI.muted,
    fontSize: 11.5,
    fontWeight: "700",
  },

  materialCounterValue: {
    color: UI.primary,
    fontSize: 16,
    fontWeight: "900",
  },

  materialCard: {
    backgroundColor: UI.soft,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },

  materialHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },

  materialTitle: {
    color: UI.text,
    fontSize: 13.5,
    fontWeight: "800",
  },

  materialSubtitle: {
    color: UI.muted,
    fontSize: 10.5,
    marginTop: 2,
  },

  removeText: {
    color: UI.danger,
    fontSize: 11.5,
    fontWeight: "800",
  },

  addButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#B8C7D9",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  addButtonText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "800",
  },

  commitmentBox: {
    backgroundColor: "#F8F5F5",
    borderWidth: 1,
    borderColor: "#E8DDDD",
    borderRadius: 13,
    padding: 13,
  },

  commitmentText: {
    color: UI.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 9,
  },

  commitmentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 7,
  },

  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: UI.primary,
    marginTop: 6,
  },

  commitmentItemText: {
    flex: 1,
    color: UI.muted,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
  },

  saveLocalButton: {
    minHeight: 47,
    borderRadius: 12,
    backgroundColor: UI.dark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  saveLocalButtonText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },

  navRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },

  navButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  navButtonPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: UI.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  navButtonDisabled: {
    opacity: 0.45,
  },

  navButtonText: {
    color: UI.primary,
    fontSize: 13,
    fontWeight: "800",
  },

  navButtonTextDisabled: {
    color: UI.muted2,
  },

  navButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
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
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 25 : 13,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    backgroundColor: "rgba(244,246,248,0.98)",
  },

  draftButton: {
    flex: 0.9,
    minHeight: 50,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  draftButtonText: {
    color: UI.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  previewButton: {
    flex: 1.25,
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: UI.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  previewButtonText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },

  shareButton: {
    flex: 0.72,
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: UI.dark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.60)",
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalKicker: {
    color: UI.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  modalTitle: {
    color: UI.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },

  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: UI.soft,
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: "center",
    justifyContent: "center",
  },

  webWrap: {
    flex: 1,
    backgroundColor: "#F2F3F5",
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
    fontWeight: "700",
    marginTop: 9,
  },

  modalFooter: {
    flexDirection: "row",
    gap: 9,
    padding: 11,
    borderTopWidth: 1,
    borderTopColor: UI.border,
    backgroundColor: "#FFFFFF",
  },

  modalSecondary: {
    flex: 1,
    minHeight: 45,
    borderWidth: 1,
    borderColor: UI.borderDark,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  modalSecondaryText: {
    color: UI.text,
    fontSize: 12.5,
    fontWeight: "800",
  },

  modalPrimary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 12,
    backgroundColor: UI.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  modalPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },
});