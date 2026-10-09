// app/tecnico/ordenes/[orderid]/mantto-cables.js
// Formulario de mantenimiento de cables - diseño simple y técnico.
// Mantiene la vista previa del PDF sin validaciones bloqueantes.

import React, { useCallback, useEffect, useState } from "react";
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

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildManttoCablesHtml } from "../../../../src/services/templates/mantto_cables/buildManttoCablesHtml";

const THEME = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  soft: "#F8FAFC",
  text: "#172033",
  muted: "#667085",
  muted2: "#98A2B3",
  border: "#E4E7EC",
  borderStrong: "#D0D5DD",
  primary: "#123A72",
  primarySoft: "#EFF4FF",
  success: "#15803D",
  successSoft: "#F0FDF4",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  danger: "#B42318",
  dangerSoft: "#FEF3F2",
};

const STEPS = [
  { key: "general", title: "Datos generales", short: "General" },
  { key: "diametros", title: "Diámetros", short: "Diámetros" },
  { key: "rupturas", title: "Rupturas", short: "Rupturas" },
  { key: "hallazgos", title: "Revisión", short: "Revisión" },
  { key: "resultado", title: "Resultado", short: "Resultado" },
];

function safeStr(v) {
  return String(v ?? "").trim();
}

function fmtSapDate(val) {
  if (!val) return "—";

  if (typeof val === "string" && val.startsWith("/Date(")) {
    const ms = parseInt(val.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return fmtDate(new Date(ms));
  }

  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return safeStr(val) || "—";
  return fmtDate(d);
}

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

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

function createDefaultForm(orderid = "") {
  return {
    orderid,
    created_by: null,
    tipo_reporte: "overhaul",
    cantidad_cables: 8,
    diametro_estandar_mm: "",
    tiempo_uso_cables: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",

    seccion_diametros: Array.from({ length: 8 }, (_, i) => ({
      cable_no: i + 1,
      diametro_mm: "",
      parte_desgaste_mm: "",
      parte_intacta_mm: "",
      desgaste_pct: null,
      peor: false,
    })),

    seccion_rupturas: Array.from({ length: 8 }, (_, i) => ({
      cable_no: i + 1,
      hay: false,
      rupturas_por_paso: "",
      posicion_cabina: "",
      cambio: false,
    })),

    seccion_longitud: {
      encontrado: false,
      cable_no: "",
      posicion_cabina: "",
      longitud_mm: "",
    },

    seccion_oxido: {
      encontrado: false,
      alcance: "no",
      cable_no: "",
      posicion_cabina: "",
    },

    seccion_tension: {
      estado: "bien",
    },

    seccion_deformaciones: {
      encontrado: false,
      cable_no: "",
      posicion_cabina: "",
      problema: "",
    },

    seccion_terminales: {
      estado: "sin_anomalias",
    },

    resultado_total: {
      bien: true,
      cambio_inmediato: false,
      programar_cambio: false,
      tipos_problema: [],
      detalle: "",
    },
  };
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

const Input = ({ style, ...props }) => (
  <TextInput
    {...props}
    placeholderTextColor={THEME.muted2}
    style={[styles.input, style]}
  />
);

const Toggle = ({ value, onValueChange }) => (
  <Switch
    value={!!value}
    onValueChange={onValueChange}
    trackColor={{ false: "#D0D5DD", true: "#AFC7E8" }}
    thumbColor={value ? THEME.primary : "#FFFFFF"}
  />
);

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Field({ children, compact = false, wide = false }) {
  return (
    <View
      style={[
        styles.field,
        compact && styles.fieldCompact,
        wide && styles.fieldWide,
      ]}
    >
      {children}
    </View>
  );
}

function Section({ title, description, children, style }) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!description && (
          <Text style={styles.sectionDescription}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

function OrderData({ label, value, wide = false }) {
  return (
    <View style={[styles.orderData, wide && styles.orderDataWide]}>
      <Text style={styles.orderDataLabel}>{label}</Text>
      <Text style={styles.orderDataValue} numberOfLines={2}>
        {safeStr(value) || "—"}
      </Text>
    </View>
  );
}

function Choice({
  active,
  label,
  onPress,
  tone = "primary",
  compact = false,
}) {
  const toneStyle =
    tone === "success"
      ? styles.choiceActiveSuccess
      : tone === "warning"
      ? styles.choiceActiveWarning
      : tone === "danger"
      ? styles.choiceActiveDanger
      : styles.choiceActivePrimary;

  const toneText =
    tone === "success"
      ? styles.choiceTextSuccess
      : tone === "warning"
      ? styles.choiceTextWarning
      : tone === "danger"
      ? styles.choiceTextDanger
      : styles.choiceTextPrimary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.choice,
        compact && styles.choiceCompact,
        active && toneStyle,
      ]}
    >
      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
        {active && <View style={styles.radioInner} />}
      </View>
      <Text style={[styles.choiceText, active && toneText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CheckChoice({ active, label, onPress, tone = "primary" }) {
  const activeStyle =
    tone === "success"
      ? styles.checkChoiceActiveSuccess
      : tone === "warning"
      ? styles.checkChoiceActiveWarning
      : tone === "danger"
      ? styles.checkChoiceActiveDanger
      : styles.checkChoiceActivePrimary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.checkChoice, active && activeStyle]}
    >
      <View style={[styles.checkChoiceBox, active && styles.checkChoiceBoxActive]}>
        {active && <Text style={styles.checkChoiceMark}>✓</Text>}
      </View>
      <Text style={[styles.checkChoiceText, active && styles.checkChoiceTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ToggleQuestion({ title, description, value, onValueChange }) {
  return (
    <View style={styles.toggleQuestion}>
      <View style={styles.toggleQuestionText}>
        <Text style={styles.toggleQuestionTitle}>{title}</Text>
        {!!description && (
          <Text style={styles.toggleQuestionDescription}>{description}</Text>
        )}
      </View>
      <View style={styles.toggleQuestionControl}>
        <Text style={styles.toggleStateText}>{value ? "Sí" : "No"}</Text>
        <Toggle value={value} onValueChange={onValueChange} />
      </View>
    </View>
  );
}

function CableMeasurementRow({ row, onChange }) {
  const updateLocal = (patch) => {
    const next = { ...(row || {}), ...patch };

    const desg = Number(next.parte_desgaste_mm);
    const intc = Number(next.parte_intacta_mm);

    if (!Number.isNaN(desg) && !Number.isNaN(intc) && intc > 0) {
      next.desgaste_pct = Math.round((desg / intc) * 1000) / 10;
    } else {
      next.desgaste_pct = null;
    }

    onChange(next);
  };

  return (
    <View style={[styles.cableRow, row?.peor && styles.cableRowMarked]}>
      <View style={styles.cableRowHeader}>
        <View style={styles.cableIdentity}>
          <View style={styles.cableBadge}>
            <Text style={styles.cableBadgeText}>{row.cable_no}</Text>
          </View>
          <View>
            <Text style={styles.cableName}>Cable {row.cable_no}</Text>
            <Text style={styles.cableSubtext}>Medición individual</Text>
          </View>
        </View>

        <View style={styles.wearValueBox}>
          <Text style={styles.wearValueLabel}>Desgaste</Text>
          <Text style={styles.wearValue}>
            {row?.desgaste_pct != null ? `${row.desgaste_pct}%` : "—"}
          </Text>
        </View>
      </View>

      <FieldRow>
        <Field compact>
          <Label>Ø medido (mm)</Label>
          <Input
            keyboardType="numeric"
            value={String(row?.diametro_mm ?? "")}
            onChangeText={(t) =>
              updateLocal({ diametro_mm: t.replace(",", ".") })
            }
            placeholder="0.00"
          />
        </Field>

        <Field compact>
          <Label>Parte desgaste</Label>
          <Input
            keyboardType="numeric"
            value={String(row?.parte_desgaste_mm ?? "")}
            onChangeText={(t) =>
              updateLocal({ parte_desgaste_mm: t.replace(",", ".") })
            }
            placeholder="0.00"
          />
        </Field>

        <Field compact>
          <Label>Parte intacta</Label>
          <Input
            keyboardType="numeric"
            value={String(row?.parte_intacta_mm ?? "")}
            onChangeText={(t) =>
              updateLocal({ parte_intacta_mm: t.replace(",", ".") })
            }
            placeholder="0.00"
          />
        </Field>
      </FieldRow>

      <View style={styles.markWorstRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.markWorstTitle}>Marcar como peor cable</Text>
          <Text style={styles.markWorstDescription}>
            Se resaltará como referencia en el reporte.
          </Text>
        </View>
        <Toggle
          value={!!row?.peor}
          onValueChange={(v) => updateLocal({ peor: v })}
        />
      </View>
    </View>
  );
}

export default function ManttoCablesScreen() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const update = (patch) => {
    setPdfUri(null);
    setForm((s) => ({ ...s, ...patch }));
  };

  const updateArrayItem = (key, idx, patch) => {
    setPdfUri(null);
    setForm((s) => {
      const arr = [...(s[key] || [])];
      arr[idx] = { ...(arr[idx] || {}), ...patch };
      return { ...s, [key]: arr };
    });
  };

  const mapOrdenToAuto = useCallback(
    (data, oid) => ({
      orden: safeStr(data?.Orderid || data?.OrderId || oid),
      cliente: safeStr(
        data?.cliente ||
          data?.Client ||
          data?.Name1 ||
          data?.nombre_cliente ||
          data?.customer ||
          ""
      ),
      equipo: safeStr(
        data?.equipment || data?.Equipment || data?.equipo || data?.Equnr || ""
      ),
      tecnico_nombre: getUserName(user),
      start_date: safeStr(data?.start_date || data?.StartDate || data?.fecha || ""),
    }),
    [user]
  );

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
          "[ManttoCables] No se pudo cargar ToAddresses:",
          addrError?.response?.data || addrError?.message || addrError
        );
      }

      const data = {
        ...dataOrden,
        cliente: clienteFromAddress || dataOrden?.cliente || dataOrden?.Name1 || "",
      };

      const autoData = mapOrdenToAuto(data, oid);

      setOrden(data);
      setAuto(autoData);

      setForm((s) => ({
        ...s,
        orderid: autoData.orden || oid,
        created_by: user?.id ?? s.created_by,
        fecha: s.fecha || fmtSapDate(autoData.start_date),
      }));
    } catch (e) {
      console.log("[ManttoCables] cargarOrden error:", e?.response?.data || e);

      const oid = safeStr(orderid);

      setOrden({ Orderid: oid });
      setAuto({
        orden: oid,
        cliente: "",
        equipo: "",
        tecnico_nombre: getUserName(user),
        start_date: "",
      });

      setForm((s) => ({
        ...s,
        orderid: oid,
        created_by: user?.id ?? s.created_by,
      }));

      Alert.alert(
        "Aviso",
        "No se pudieron cargar todos los datos de la orden. Puedes llenar el formulario y generar el PDF."
      );
    } finally {
      setLoading(false);
    }
  }, [orderid, user, mapOrdenToAuto]);

  useEffect(() => {
    cargarOrden();
  }, [cargarOrden]);

  const activeCableCount = Number(form.cantidad_cables || 8);

  function buildHtmlActual() {
    return buildManttoCablesHtml({
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
      console.log("[ManttoCables] preview error:", e);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
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

      const fileName = `mantto_cables_${cleanOrder}.pdf`;
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
        dialogTitle: "Compartir mantenimiento de cables",
      });
    } catch (e) {
      console.log("[ManttoCables] compartir error:", e);
      Alert.alert("Error", "No se pudo generar o compartir el PDF.");
    }
  };

  const save = async () => {
    try {
      setSaving(true);

      const payload = {
        ...form,
        orderid: form.orderid || auto.orden,
        diametro_estandar_mm: form.diametro_estandar_mm
          ? Number(form.diametro_estandar_mm)
          : null,
        cantidad_cables: form.cantidad_cables ? Number(form.cantidad_cables) : 8,
        seccion_diametros: (form.seccion_diametros || []).map((r) => ({
          ...r,
          diametro_mm:
            r.diametro_mm !== null && r.diametro_mm !== ""
              ? Number(r.diametro_mm)
              : null,
          parte_desgaste_mm:
            r.parte_desgaste_mm !== null && r.parte_desgaste_mm !== ""
              ? Number(r.parte_desgaste_mm)
              : null,
          parte_intacta_mm:
            r.parte_intacta_mm !== null && r.parte_intacta_mm !== ""
              ? Number(r.parte_intacta_mm)
              : null,
          desgaste_pct:
            r.desgaste_pct !== null && r.desgaste_pct !== ""
              ? Number(r.desgaste_pct)
              : null,
        })),
      };

      console.log("[ManttoCables] payload borrador:", payload);
      Alert.alert("Guardado", "El formulario quedó listo para generar PDF.");
    } catch (e) {
      console.log("[ManttoCables] save error:", e);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    } finally {
      setSaving(false);
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
        <View>
          <Text style={styles.stepperEyebrow}>
            Paso {activeStep + 1} de {STEPS.length}
          </Text>
          <Text style={styles.stepperCurrentTitle}>{STEPS[activeStep].title}</Text>
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
              onPress={() => setActiveStep(index)}
              activeOpacity={0.8}
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

  const renderGeneralStep = () => (
    <>
      <Section
        title="Información de la orden"
        description="Estos datos se cargan automáticamente y se incluirán en el PDF."
      >
        <View style={styles.orderGrid}>
          <OrderData label="Orden" value={auto?.orden || form?.orderid} />
          <OrderData label="Equipo" value={auto?.equipo} />
          <OrderData label="Cliente" value={auto?.cliente} wide />
          <OrderData label="Técnico" value={auto?.tecnico_nombre} />
          <OrderData label="Fecha de orden" value={fmtSapDate(auto?.start_date)} />
        </View>
      </Section>

      <Section
        title="Datos del reporte"
        description="Captura únicamente la información necesaria para identificar el mantenimiento."
      >
        <Label>Tipo de reporte</Label>
        <View style={styles.choiceStack}>
          <Choice
            active={form.tipo_reporte === "overhaul"}
            label="Overhaul"
            onPress={() => update({ tipo_reporte: "overhaul" })}
          />
          <Choice
            active={form.tipo_reporte === "ajuste_reparacion_sustitucion"}
            label="Ajuste / reparación / sustitución"
            onPress={() =>
              update({ tipo_reporte: "ajuste_reparacion_sustitucion" })
            }
          />
        </View>

        <FieldRow>
          <Field>
            <Label>Fecha del reporte</Label>
            <Input
              value={String(form.fecha ?? "")}
              onChangeText={(t) => update({ fecha: t })}
              placeholder="DD/MM/AAAA"
            />
          </Field>
          <Field compact>
            <Label>Hora inicio</Label>
            <Input
              value={String(form.hora_inicio ?? "")}
              onChangeText={(t) => update({ hora_inicio: t })}
              placeholder="08:00"
            />
          </Field>
          <Field compact>
            <Label>Hora fin</Label>
            <Input
              value={String(form.hora_fin ?? "")}
              onChangeText={(t) => update({ hora_fin: t })}
              placeholder="10:30"
            />
          </Field>
        </FieldRow>

        <View style={styles.divider} />

        <FieldRow>
          <Field compact>
            <Label>Cantidad de cables</Label>
            <Input
              keyboardType="numeric"
              value={String(form.cantidad_cables ?? 8)}
              onChangeText={(t) => update({ cantidad_cables: Number(t || 8) })}
              placeholder="8"
            />
          </Field>
          <Field compact>
            <Label>Ø estándar (mm)</Label>
            <Input
              keyboardType="numeric"
              value={String(form.diametro_estandar_mm ?? "")}
              onChangeText={(t) =>
                update({ diametro_estandar_mm: t.replace(",", ".") })
              }
              placeholder="0.00"
            />
          </Field>
          <Field>
            <Label>Tiempo de uso de cables</Label>
            <Input
              value={String(form.tiempo_uso_cables ?? "")}
              onChangeText={(t) => update({ tiempo_uso_cables: t })}
              placeholder="Ej. 2 años / 18 meses"
            />
          </Field>
        </FieldRow>
      </Section>
    </>
  );

  const renderDiametrosStep = () => (
    <Section
      title="Diámetros y desgaste"
      description="Registra las mediciones por cable. El porcentaje de desgaste se calcula automáticamente."
    >
      <View style={styles.helperBox}>
        <Text style={styles.helperTitle}>Captura flexible</Text>
        <Text style={styles.helperText}>
          Puedes dejar campos vacíos y aun así abrir la vista previa del PDF.
        </Text>
      </View>

      <View style={styles.listGap}>
        {(form.seccion_diametros || [])
          .slice(0, activeCableCount || 8)
          .map((row, idx) => (
            <CableMeasurementRow
              key={`diametro-${row.cable_no}`}
              row={row}
              onChange={(patch) =>
                updateArrayItem("seccion_diametros", idx, patch)
              }
            />
          ))}
      </View>
    </Section>
  );

  const renderRupturasStep = () => (
    <Section
      title="Ruptura de alambres"
      description="Marca únicamente los cables donde exista ruptura y captura el detalle cuando corresponda."
    >
      <View style={styles.listGap}>
        {(form.seccion_rupturas || [])
          .slice(0, activeCableCount || 8)
          .map((r, idx) => (
            <View
              key={`ruptura-${r.cable_no}`}
              style={[styles.ruptureRow, r.hay && styles.ruptureRowActive]}
            >
              <View style={styles.ruptureHeader}>
                <View style={styles.cableIdentity}>
                  <View style={styles.cableBadgeSoft}>
                    <Text style={styles.cableBadgeSoftText}>{r.cable_no}</Text>
                  </View>
                  <View>
                    <Text style={styles.cableName}>Cable {r.cable_no}</Text>
                    <Text style={styles.cableSubtext}>¿Presenta ruptura?</Text>
                  </View>
                </View>

                <View style={styles.toggleQuestionControl}>
                  <Text style={styles.toggleStateText}>{r.hay ? "Sí" : "No"}</Text>
                  <Toggle
                    value={r.hay}
                    onValueChange={(v) =>
                      updateArrayItem("seccion_rupturas", idx, { hay: v })
                    }
                  />
                </View>
              </View>

              {r.hay && (
                <View style={styles.ruptureDetails}>
                  <FieldRow>
                    <Field compact>
                      <Label>Rupturas por paso</Label>
                      <Input
                        keyboardType="numeric"
                        value={String(r.rupturas_por_paso ?? "")}
                        onChangeText={(t) =>
                          updateArrayItem("seccion_rupturas", idx, {
                            rupturas_por_paso: t,
                          })
                        }
                        placeholder="0"
                      />
                    </Field>

                    <Field>
                      <Label>Posición en cabina</Label>
                      <Input
                        value={String(r.posicion_cabina ?? "")}
                        onChangeText={(t) =>
                          updateArrayItem("seccion_rupturas", idx, {
                            posicion_cabina: t,
                          })
                        }
                        placeholder="Ej. izquierda 2"
                      />
                    </Field>
                  </FieldRow>

                  <View style={styles.changeRequiredRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.changeRequiredTitle}>
                        ¿Requiere cambio?
                      </Text>
                      <Text style={styles.changeRequiredText}>
                        Indica si la condición requiere sustitución del cable.
                      </Text>
                    </View>
                    <View style={styles.toggleQuestionControl}>
                      <Text style={styles.toggleStateText}>
                        {r.cambio ? "Sí" : "No"}
                      </Text>
                      <Toggle
                        value={!!r.cambio}
                        onValueChange={(v) =>
                          updateArrayItem("seccion_rupturas", idx, {
                            cambio: v,
                          })
                        }
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))}
      </View>
    </Section>
  );

  const renderHallazgosStep = () => (
    <>
      <Section title="Longitud de desgaste">
        <ToggleQuestion
          title="¿Se detectó longitud de desgaste?"
          description="Activa esta opción para registrar ubicación y longitud."
          value={form.seccion_longitud?.encontrado}
          onValueChange={(v) =>
            update({
              seccion_longitud: {
                ...(form.seccion_longitud || {}),
                encontrado: v,
              },
            })
          }
        />

        {form.seccion_longitud?.encontrado && (
          <View style={styles.conditionalFields}>
            <FieldRow>
              <Field compact>
                <Label>Cable #</Label>
                <Input
                  keyboardType="numeric"
                  value={String(form.seccion_longitud?.cable_no ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_longitud: {
                        ...(form.seccion_longitud || {}),
                        cable_no: t,
                      },
                    })
                  }
                  placeholder="1"
                />
              </Field>
              <Field>
                <Label>Posición en cabina</Label>
                <Input
                  value={String(form.seccion_longitud?.posicion_cabina ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_longitud: {
                        ...(form.seccion_longitud || {}),
                        posicion_cabina: t,
                      },
                    })
                  }
                  placeholder="Ej. derecha 1"
                />
              </Field>
              <Field compact>
                <Label>Longitud (mm)</Label>
                <Input
                  keyboardType="numeric"
                  value={String(form.seccion_longitud?.longitud_mm ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_longitud: {
                        ...(form.seccion_longitud || {}),
                        longitud_mm: t.replace(",", "."),
                      },
                    })
                  }
                  placeholder="0"
                />
              </Field>
            </FieldRow>
          </View>
        )}
      </Section>

      <Section title="Óxido">
        <ToggleQuestion
          title="¿Se detectó óxido?"
          description="Activa esta opción si hay evidencia visual."
          value={form.seccion_oxido?.encontrado}
          onValueChange={(v) =>
            update({
              seccion_oxido: {
                ...(form.seccion_oxido || {}),
                encontrado: v,
              },
            })
          }
        />

        {form.seccion_oxido?.encontrado && (
          <View style={styles.conditionalFields}>
            <Label>Alcance</Label>
            <View style={styles.choiceStack}>
              <Choice
                compact
                active={form.seccion_oxido?.alcance === "completo"}
                label="Recorrido completo"
                onPress={() =>
                  update({
                    seccion_oxido: {
                      ...(form.seccion_oxido || {}),
                      alcance: "completo",
                    },
                  })
                }
              />
              <Choice
                compact
                active={form.seccion_oxido?.alcance === "parcial"}
                label="Parte del recorrido"
                onPress={() =>
                  update({
                    seccion_oxido: {
                      ...(form.seccion_oxido || {}),
                      alcance: "parcial",
                    },
                  })
                }
              />
              <Choice
                compact
                active={form.seccion_oxido?.alcance === "no"}
                label="No se encontró"
                onPress={() =>
                  update({
                    seccion_oxido: {
                      ...(form.seccion_oxido || {}),
                      alcance: "no",
                    },
                  })
                }
              />
            </View>

            <FieldRow>
              <Field compact>
                <Label>Cable #</Label>
                <Input
                  keyboardType="numeric"
                  value={String(form.seccion_oxido?.cable_no ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_oxido: {
                        ...(form.seccion_oxido || {}),
                        cable_no: t,
                      },
                    })
                  }
                  placeholder="1"
                />
              </Field>
              <Field>
                <Label>Posición en cabina</Label>
                <Input
                  value={String(form.seccion_oxido?.posicion_cabina ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_oxido: {
                        ...(form.seccion_oxido || {}),
                        posicion_cabina: t,
                      },
                    })
                  }
                  placeholder="Ej. centro"
                />
              </Field>
            </FieldRow>
          </View>
        )}
      </Section>

      <Section
        title="Tensión de cables"
        description="Selecciona la condición observada durante la revisión."
      >
        <View style={styles.choiceStack}>
          <Choice
            tone="success"
            active={form.seccion_tension?.estado === "bien"}
            label="La tensión se encuentra bien"
            onPress={() => update({ seccion_tension: { estado: "bien" } })}
          />
          <Choice
            tone="danger"
            active={form.seccion_tension?.estado === "pendiente_corregir"}
            label="Mal, pendiente de corregir"
            onPress={() =>
              update({ seccion_tension: { estado: "pendiente_corregir" } })
            }
          />
          <Choice
            tone="warning"
            active={form.seccion_tension?.estado === "corregido"}
            label="Mal, pero se corrigió"
            onPress={() => update({ seccion_tension: { estado: "corregido" } })}
          />
        </View>
      </Section>

      <Section title="Dobleces o deformaciones">
        <ToggleQuestion
          title="¿Se detectó algún problema?"
          description="Activa para capturar ubicación y descripción."
          value={form.seccion_deformaciones?.encontrado}
          onValueChange={(v) =>
            update({
              seccion_deformaciones: {
                ...(form.seccion_deformaciones || {}),
                encontrado: v,
              },
            })
          }
        />

        {form.seccion_deformaciones?.encontrado && (
          <View style={styles.conditionalFields}>
            <FieldRow>
              <Field compact>
                <Label>Cable #</Label>
                <Input
                  keyboardType="numeric"
                  value={String(form.seccion_deformaciones?.cable_no ?? "")}
                  onChangeText={(t) =>
                    update({
                      seccion_deformaciones: {
                        ...(form.seccion_deformaciones || {}),
                        cable_no: t,
                      },
                    })
                  }
                  placeholder="1"
                />
              </Field>
              <Field>
                <Label>Posición en cabina</Label>
                <Input
                  value={String(
                    form.seccion_deformaciones?.posicion_cabina ?? ""
                  )}
                  onChangeText={(t) =>
                    update({
                      seccion_deformaciones: {
                        ...(form.seccion_deformaciones || {}),
                        posicion_cabina: t,
                      },
                    })
                  }
                  placeholder="Ej. atrás"
                />
              </Field>
            </FieldRow>
            <Label style={{ marginTop: 12 }}>Problema detectado</Label>
            <Input
              value={String(form.seccion_deformaciones?.problema ?? "")}
              onChangeText={(t) =>
                update({
                  seccion_deformaciones: {
                    ...(form.seccion_deformaciones || {}),
                    problema: t,
                  },
                })
              }
              placeholder="Describe el problema"
            />
          </View>
        )}
      </Section>

      <Section
        title="Terminales de los cables"
        description="Selecciona la condición general de los terminales."
      >
        <View style={styles.choiceStack}>
          <Choice
            tone="danger"
            active={form.seccion_terminales?.estado === "grietas"}
            label="Presenta grietas / daños"
            onPress={() =>
              update({ seccion_terminales: { estado: "grietas" } })
            }
          />
          <Choice
            tone="warning"
            active={form.seccion_terminales?.estado === "grasa"}
            label="Grasa negra en Metal Babbit"
            onPress={() =>
              update({ seccion_terminales: { estado: "grasa" } })
            }
          />
          <Choice
            tone="success"
            active={form.seccion_terminales?.estado === "sin_anomalias"}
            label="Sin anomalías"
            onPress={() =>
              update({ seccion_terminales: { estado: "sin_anomalias" } })
            }
          />
        </View>
      </Section>
    </>
  );

  const renderResultadoStep = () => (
    <Section
      title="Resultado del mantenimiento"
      description="Selecciona el dictamen final, identifica los problemas y agrega observaciones."
    >
      <Label>Dictamen</Label>
      <Text style={styles.selectionHint}>
        Puedes marcar más de una opción si el reporte lo requiere.
      </Text>
      <View style={styles.choiceStack}>
        <CheckChoice
          tone="success"
          active={!!form.resultado_total?.bien}
          label="Bien"
          onPress={() =>
            update({
              resultado_total: {
                ...(form.resultado_total || {}),
                bien: !form.resultado_total?.bien,
              },
            })
          }
        />
        <CheckChoice
          tone="danger"
          active={!!form.resultado_total?.cambio_inmediato}
          label="Cambio inmediato"
          onPress={() =>
            update({
              resultado_total: {
                ...(form.resultado_total || {}),
                cambio_inmediato: !form.resultado_total?.cambio_inmediato,
              },
            })
          }
        />
        <CheckChoice
          tone="warning"
          active={!!form.resultado_total?.programar_cambio}
          label="Programar cambio"
          onPress={() =>
            update({
              resultado_total: {
                ...(form.resultado_total || {}),
                programar_cambio: !form.resultado_total?.programar_cambio,
              },
            })
          }
        />
      </View>

      <View style={styles.divider} />

      <Label>Tipos de problema</Label>
      <View style={styles.problemGrid}>
        {[
          ["diametro", "Diámetro"],
          ["tension", "Tensión"],
          ["rupturas", "Rupturas"],
          ["dobleces", "Dobleces"],
          ["desgaste", "Desgaste"],
          ["terminales", "Terminales"],
          ["oxido", "Óxido"],
          ["otros", "Otros"],
        ].map(([value, label]) => {
          const active = form.resultado_total?.tipos_problema?.includes(value);
          return (
            <TouchableOpacity
              key={value}
              activeOpacity={0.8}
              style={[
                styles.problemOption,
                active && styles.problemOptionActive,
              ]}
              onPress={() => {
                const cur = new Set(form.resultado_total?.tipos_problema || []);
                if (active) cur.delete(value);
                else cur.add(value);

                update({
                  resultado_total: {
                    ...(form.resultado_total || {}),
                    tipos_problema: Array.from(cur),
                  },
                });
              }}
            >
              <View
                style={[
                  styles.checkbox,
                  active && styles.checkboxActive,
                ]}
              >
                {active && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text
                style={[
                  styles.problemOptionText,
                  active && styles.problemOptionTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Label style={{ marginTop: 18 }}>Detalle / observaciones</Label>
      <Input
        multiline
        style={styles.textArea}
        placeholder="Notas, observaciones, acciones realizadas..."
        value={String(form.resultado_total?.detalle ?? "")}
        onChangeText={(t) =>
          update({
            resultado_total: {
              ...(form.resultado_total || {}),
              detalle: t,
            },
          })
        }
      />

      <TouchableOpacity
        style={styles.saveButton}
        onPress={save}
        disabled={saving || generatingPdf}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Guardar formulario</Text>
        )}
      </TouchableOpacity>
    </Section>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneralStep();
    if (activeStep === 1) return renderDiametrosStep();
    if (activeStep === 2) return renderRupturasStep();
    if (activeStep === 3) return renderHallazgosStep();
    return renderResultadoStep();
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingTitle}>Cargando formulario</Text>
        <Text style={styles.loadingText}>Preparando datos de la orden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Mantenimiento de cables" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Reporte de mantenimiento</Text>
            <Text style={styles.introText}>
              Completa el formulario por secciones. Puedes revisar el PDF en
              cualquier momento aunque existan campos vacíos.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.introPreviewButton}
            onPress={abrirPreviewPdf}
            disabled={generatingPdf}
            activeOpacity={0.8}
          >
            <Text style={styles.introPreviewButtonText}>Ver PDF</Text>
          </TouchableOpacity>
        </View>

        {renderStepIndicator()}
        {renderStepContent()}

        <View style={styles.navigationRow}>
          <TouchableOpacity
            style={[
              styles.secondaryNavButton,
              activeStep === 0 && styles.navButtonDisabled,
            ]}
            onPress={goBack}
            disabled={activeStep === 0}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.secondaryNavButtonText,
                activeStep === 0 && styles.navButtonDisabledText,
              ]}
            >
              Anterior
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.primaryNavButton,
              activeStep === STEPS.length - 1 && styles.navButtonDisabled,
            ]}
            onPress={goNext}
            disabled={activeStep === STEPS.length - 1}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.primaryNavButtonText,
                activeStep === STEPS.length - 1 &&
                  styles.navButtonDisabledText,
              ]}
            >
              Siguiente
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.previewButton}
          onPress={abrirPreviewPdf}
          disabled={generatingPdf}
          activeOpacity={0.85}
        >
          <Text style={styles.previewButtonText}>Vista previa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={compartirPdf}
          disabled={generatingPdf}
          activeOpacity={0.85}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.shareButtonText}>Compartir PDF</Text>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.previewEyebrow}>Documento</Text>
                <Text style={styles.previewTitle}>Vista previa del PDF</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setPreviewVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.closeButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <WebView
              originWhitelist={["*"]}
              source={{ html: previewHtml }}
              style={styles.webview}
            />

            <View style={styles.previewFooter}>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={compartirPdf}
                disabled={generatingPdf}
                activeOpacity={0.85}
              >
                {generatingPdf ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.shareButtonText}>Compartir PDF</Text>
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
    backgroundColor: THEME.bg,
  },

  loadingScreen: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingTitle: {
    marginTop: 14,
    fontSize: 18,
    color: THEME.text,
    fontWeight: "800",
  },

  loadingText: {
    marginTop: 4,
    fontSize: 13,
    color: THEME.muted,
    fontWeight: "500",
  },

  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 118,
  },

  introCard: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  introTextWrap: {
    flex: 1,
  },

  introTitle: {
    color: THEME.text,
    fontSize: 17,
    fontWeight: "800",
  },

  introText: {
    color: THEME.muted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: "500",
  },

  introPreviewButton: {
    backgroundColor: THEME.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  introPreviewButtonText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  stepperCard: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
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
    color: THEME.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  stepperCurrentTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },

  stepperPercent: {
    color: THEME.primary,
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
    backgroundColor: THEME.primary,
    borderRadius: 999,
  },

  stepLinks: {
    gap: 8,
    paddingTop: 14,
    paddingRight: 8,
  },

  stepLink: {
    minWidth: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 9,
  },

  stepLinkActive: {
    backgroundColor: THEME.primarySoft,
  },

  stepLinkDone: {
    backgroundColor: "#F9FAFB",
  },

  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EAECF0",
    alignItems: "center",
    justifyContent: "center",
  },

  stepDotActive: {
    backgroundColor: THEME.primary,
  },

  stepDotDone: {
    backgroundColor: "#667085",
  },

  stepDotText: {
    color: THEME.muted,
    fontSize: 10,
    fontWeight: "800",
  },

  stepDotTextActive: {
    color: "#FFFFFF",
  },

  stepLinkText: {
    color: THEME.muted,
    fontSize: 11.5,
    fontWeight: "700",
  },

  stepLinkTextActive: {
    color: THEME.primary,
  },

  stepLinkTextDone: {
    color: THEME.text,
  },

  section: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 15,
    marginTop: 12,
  },

  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "800",
  },

  sectionDescription: {
    color: THEME.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    fontWeight: "500",
  },

  orderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    overflow: "hidden",
  },

  orderData: {
    width: "50%",
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: THEME.border,
  },

  orderDataWide: {
    width: "100%",
  },

  orderDataLabel: {
    color: THEME.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },

  orderDataValue: {
    color: THEME.text,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 5,
  },

  label: {
    color: THEME.text,
    fontSize: 11.5,
    fontWeight: "700",
    marginBottom: 6,
  },

  input: {
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    color: THEME.text,
    fontSize: 13.5,
    fontWeight: "500",
  },

  textArea: {
    minHeight: 118,
    paddingTop: 11,
    textAlignVertical: "top",
  },

  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },

  field: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 160,
  },

  fieldCompact: {
    minWidth: 110,
  },

  fieldWide: {
    minWidth: 220,
  },

  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 16,
  },

  choiceStack: {
    gap: 8,
  },

  choice: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },

  choiceCompact: {
    minHeight: 42,
    paddingVertical: 8,
  },

  choiceActivePrimary: {
    backgroundColor: THEME.primarySoft,
    borderColor: "#9CB7DC",
  },

  choiceActiveSuccess: {
    backgroundColor: THEME.successSoft,
    borderColor: "#A6D9B5",
  },

  choiceActiveWarning: {
    backgroundColor: THEME.warningSoft,
    borderColor: "#E9C68C",
  },

  choiceActiveDanger: {
    backgroundColor: THEME.dangerSoft,
    borderColor: "#E7AAA5",
  },

  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: THEME.muted2,
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterActive: {
    borderColor: THEME.primary,
  },

  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: THEME.primary,
  },

  choiceText: {
    flex: 1,
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
  },

  choiceTextPrimary: {
    color: THEME.primary,
  },

  choiceTextSuccess: {
    color: THEME.success,
  },

  choiceTextWarning: {
    color: THEME.warning,
  },

  choiceTextDanger: {
    color: THEME.danger,
  },

  checkChoice: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },

  checkChoiceActivePrimary: {
    backgroundColor: THEME.primarySoft,
    borderColor: "#9CB7DC",
  },

  checkChoiceActiveSuccess: {
    backgroundColor: THEME.successSoft,
    borderColor: "#A6D9B5",
  },

  checkChoiceActiveWarning: {
    backgroundColor: THEME.warningSoft,
    borderColor: "#E9C68C",
  },

  checkChoiceActiveDanger: {
    backgroundColor: THEME.dangerSoft,
    borderColor: "#E7AAA5",
  },

  checkChoiceBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.muted2,
    alignItems: "center",
    justifyContent: "center",
  },

  checkChoiceBoxActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },

  checkChoiceMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 13,
  },

  checkChoiceText: {
    flex: 1,
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
  },

  checkChoiceTextActive: {
    fontWeight: "700",
  },

  selectionHint: {
    color: THEME.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: -2,
    marginBottom: 8,
  },

  helperBox: {
    backgroundColor: THEME.soft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 11,
    marginBottom: 12,
  },

  helperTitle: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "700",
  },

  helperText: {
    color: THEME.muted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
    fontWeight: "500",
  },

  listGap: {
    gap: 10,
  },

  cableRow: {
    backgroundColor: THEME.soft,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 12,
  },

  cableRowMarked: {
    backgroundColor: THEME.warningSoft,
    borderColor: "#E5C07B",
  },

  cableRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  cableIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
  },

  cableBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  cableBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  cableBadgeSoft: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  cableBadgeSoftText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  cableName: {
    color: THEME.text,
    fontSize: 13.5,
    fontWeight: "800",
  },

  cableSubtext: {
    color: THEME.muted,
    fontSize: 10.5,
    fontWeight: "500",
    marginTop: 1,
  },

  wearValueBox: {
    alignItems: "flex-end",
  },

  wearValueLabel: {
    color: THEME.muted,
    fontSize: 9.5,
    fontWeight: "600",
    textTransform: "uppercase",
  },

  wearValue: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 1,
  },

  markWorstRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    marginTop: 12,
    paddingTop: 10,
  },

  markWorstTitle: {
    color: THEME.text,
    fontSize: 11.5,
    fontWeight: "700",
  },

  markWorstDescription: {
    color: THEME.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },

  ruptureRow: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  ruptureRowActive: {
    borderColor: "#B7C9E3",
  },

  ruptureHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
  },

  ruptureDetails: {
    backgroundColor: THEME.soft,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    padding: 12,
  },

  changeRequiredRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },

  changeRequiredTitle: {
    color: THEME.text,
    fontSize: 11.5,
    fontWeight: "700",
  },

  changeRequiredText: {
    color: THEME.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },

  toggleQuestion: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 11,
    backgroundColor: THEME.soft,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  toggleQuestionText: {
    flex: 1,
  },

  toggleQuestionTitle: {
    color: THEME.text,
    fontSize: 12.5,
    fontWeight: "700",
  },

  toggleQuestionDescription: {
    color: THEME.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },

  toggleQuestionControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  toggleStateText: {
    color: THEME.muted,
    fontSize: 11,
    fontWeight: "700",
    minWidth: 16,
  },

  conditionalFields: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },

  problemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  problemOption: {
    minWidth: "47%",
    flexGrow: 1,
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  problemOptionActive: {
    backgroundColor: THEME.primarySoft,
    borderColor: "#A4BAD8",
  },

  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.muted2,
    alignItems: "center",
    justifyContent: "center",
  },

  checkboxActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },

  checkboxMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 13,
  },

  problemOptionText: {
    color: THEME.text,
    fontSize: 11.5,
    fontWeight: "600",
  },

  problemOptionTextActive: {
    color: THEME.primary,
    fontWeight: "700",
  },

  saveButton: {
    minHeight: 48,
    backgroundColor: THEME.text,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  navigationRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  secondaryNavButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryNavButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: THEME.primary,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryNavButtonText: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "700",
  },

  primaryNavButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  navButtonDisabled: {
    opacity: 0.38,
  },

  navButtonDisabledText: {
    color: THEME.muted,
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
    backgroundColor: "rgba(244,246,248,0.98)",
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },

  previewButton: {
    flex: 1,
    minHeight: 50,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  previewButtonText: {
    color: THEME.primary,
    fontSize: 13,
    fontWeight: "800",
  },

  shareButton: {
    flex: 1,
    minHeight: 50,
    backgroundColor: THEME.primary,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16,24,40,0.60)",
    padding: 10,
    justifyContent: "center",
  },

  previewCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },

  previewHeader: {
    minHeight: 62,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  previewEyebrow: {
    color: THEME.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },

  previewTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 1,
  },

  closeButton: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 9,
    backgroundColor: THEME.soft,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },

  closeButtonText: {
    color: THEME.text,
    fontSize: 11.5,
    fontWeight: "700",
  },

  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  previewFooter: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: "#FFFFFF",
  },
});