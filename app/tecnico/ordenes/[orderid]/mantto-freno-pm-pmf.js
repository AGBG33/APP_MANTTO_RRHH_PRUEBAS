// app/tecnico/ordenes/[orderid]/mantto-freno-pm-pmf.js
// Diseño simple y técnico para Mantenimiento Freno PM/PMF.
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

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildManttoFrenoPmPmfHtml } from "../../../../src/services/templates/mantto_freno_pm_pmf/buildManttoFrenoPmPmfHtml";

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
  { key: "freno", title: "Freno", short: "Operación" },
  { key: "componentes", title: "Componentes", short: "Tambor / tubos" },
  { key: "switch", title: "Switch", short: "Micro switch" },
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
    tipo_mt: "",
    velocidad_nominal: "",
    capacidad: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",

    operacion_freno: {
      tornillo_ajuste: "bien",
      ruido_apertura_cierre: "bien",
      balatas_izq: "bien",
      balatas_der: "bien",
    },

    tambor: {
      aceite_grasa: "bien",
      oxido: "bien",
    },

    tubos_drenado: {
      tubo_transparente: "bien",
      tubo_negro: "bien",
    },

    micro_switch: {
      condicion_fisica: "bien",
      conexiones: "bien",
    },

    condicion_operacion: {
      prueba_funcionamiento: "bien",
    },

    observaciones: "",

    resultado_total: {
      bien: true,
      seguimiento: false,
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

function BienMalField({ label, description, value, onChange }) {
  const isMal = value === "mal";

  return (
    <View style={[styles.checkCard, isMal && styles.checkCardBad]}>
      <View style={styles.checkTop}>
        <View style={[styles.checkIcon, isMal && styles.checkIconBad]}>
          <Text style={[styles.checkIconText, isMal && styles.checkIconTextBad]}>{isMal ? "!" : "✓"}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.checkTitle}>{label}</Text>
          {!!description && <Text style={styles.checkDesc}>{description}</Text>}
        </View>

        <View
          style={[
            styles.statusPill,
            isMal ? styles.statusPillBad : styles.statusPillOk,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              isMal ? styles.statusPillTextBad : styles.statusPillTextOk,
            ]}
          >
            {isMal ? "Mal" : "Bien"}
          </Text>
        </View>
      </View>

      <View style={styles.chipsWrapMini}>
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

export default function ManttoFrenoPmPmfScreen() {
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

        const results =
          resAddr?.data?.d?.results || resAddr?.data?.results || [];

        clienteFromAddress = safeStr(results?.[0]?.Name1);
      } catch (addrError) {
        console.log(
          "[ManttoFrenoPmPmf] ToAddresses error:",
          addrError?.response?.data || addrError?.message || addrError
        );
      }

      const data = {
        ...dataOrden,
        cliente:
          clienteFromAddress || dataOrden?.cliente || dataOrden?.Name1 || "",
      };

      const autoData = {
        orden: safeStr(data?.Orderid || data?.OrderId || oid),
        cliente: safeStr(data?.cliente || ""),
        equipo: safeStr(
          data?.equipment || data?.Equipment || data?.equipo || data?.Equnr || ""
        ),
        tecnico_nombre: getUserName(user),
        start_date: safeStr(
          data?.start_date || data?.StartDate || data?.fecha || ""
        ),
      };

      setOrden(data);
      setAuto(autoData);

      setForm((s) => ({
        ...s,
        orderid: autoData.orden || oid,
        fecha: s.fecha || fmtDate(autoData.start_date),
      }));
    } catch (e) {
      console.log(
        "[ManttoFrenoPmPmf] cargarOrden error:",
        e?.response?.data || e
      );

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

  const issueCount = useMemo(() => {
    const values = [
      form.operacion_freno.tornillo_ajuste,
      form.operacion_freno.ruido_apertura_cierre,
      form.operacion_freno.balatas_izq,
      form.operacion_freno.balatas_der,
      form.tambor.aceite_grasa,
      form.tambor.oxido,
      form.tubos_drenado.tubo_transparente,
      form.tubos_drenado.tubo_negro,
      form.micro_switch.condicion_fisica,
      form.micro_switch.conexiones,
      form.condicion_operacion.prueba_funcionamiento,
    ];

    return values.filter((v) => v === "mal").length;
  }, [form]);

  function buildHtmlActual() {
    return buildManttoFrenoPmPmfHtml({
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
      console.log("[ManttoFrenoPmPmf] preview error:", e);
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

      const fileName = `mantto_freno_pm_pmf_${cleanOrder}.pdf`;
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
        dialogTitle: "Compartir mantenimiento de freno PM/PMF",
      });
    } catch (e) {
      console.log("[ManttoFrenoPmPmf] compartir error:", e);
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
              placeholder="Ej. Preventivo"
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

  const renderFreno = () => (
    <SectionBox
      title="Condición de operación de freno"
      subtitle="Revisión principal del freno PM/PMF."
    >
      <BienMalField
        label="Revisión de tornillo de ajuste de torque"
        description="Verifica que el tornillo se encuentre en condiciones correctas."
        value={form.operacion_freno.tornillo_ajuste}
        onChange={(v) =>
          patchSection("operacion_freno", { tornillo_ajuste: v })
        }
      />

      <BienMalField
        label="Ruido a la apertura y cierre"
        description="Detecta ruidos anormales durante la operación."
        value={form.operacion_freno.ruido_apertura_cierre}
        onChange={(v) =>
          patchSection("operacion_freno", {
            ruido_apertura_cierre: v,
          })
        }
      />

      <BienMalField
        label="Aceite o grasa en balatas - lado izquierdo"
        description="Revisión visual del lado izquierdo."
        value={form.operacion_freno.balatas_izq}
        onChange={(v) =>
          patchSection("operacion_freno", { balatas_izq: v })
        }
      />

      <BienMalField
        label="Aceite o grasa en balatas - lado derecho"
        description="Revisión visual del lado derecho."
        value={form.operacion_freno.balatas_der}
        onChange={(v) =>
          patchSection("operacion_freno", { balatas_der: v })
        }
      />
    </SectionBox>
  );

  const renderComponentes = () => (
    <>
      <SectionBox
        title="Condiciones de tambor"
        subtitle="Revisión visual del tambor de freno."
      >
        <BienMalField
          label="Hay existencia de aceite o grasa"
          description="Marca mal si se detecta contaminación por aceite o grasa."
          value={form.tambor.aceite_grasa}
          onChange={(v) => patchSection("tambor", { aceite_grasa: v })}
        />

        <BienMalField
          label="Óxido"
          description="Marca mal si se detecta óxido visible."
          value={form.tambor.oxido}
          onChange={(v) => patchSection("tambor", { oxido: v })}
        />
      </SectionBox>

      <SectionBox
        title="Tubos de drenado"
        subtitle="Estado de tubo transparente y tubo negro."
      >
        <BienMalField
          label="Tubo transparente"
          description="Condición física y funcionamiento del tubo."
          value={form.tubos_drenado.tubo_transparente}
          onChange={(v) =>
            patchSection("tubos_drenado", { tubo_transparente: v })
          }
        />

        <BienMalField
          label="Tubo negro"
          description="Condición física y funcionamiento del tubo."
          value={form.tubos_drenado.tubo_negro}
          onChange={(v) =>
            patchSection("tubos_drenado", { tubo_negro: v })
          }
        />
      </SectionBox>
    </>
  );

  const renderSwitch = () => (
    <>
      <SectionBox
        title="Micro switch"
        subtitle="Revisión física y conexiones."
      >
        <BienMalField
          label="Condición física"
          description="Verifica daños, desgaste o componentes flojos."
          value={form.micro_switch.condicion_fisica}
          onChange={(v) =>
            patchSection("micro_switch", { condicion_fisica: v })
          }
        />

        <BienMalField
          label="Conexiones"
          description="Revisa que las conexiones estén firmes y correctas."
          value={form.micro_switch.conexiones}
          onChange={(v) => patchSection("micro_switch", { conexiones: v })}
        />
      </SectionBox>

      <SectionBox
        title="Condiciones de operación"
        subtitle="Prueba final de funcionamiento del freno."
      >
        <BienMalField
          label="Prueba de funcionamiento"
          description="Marca el resultado de la prueba operativa."
          value={form.condicion_operacion.prueba_funcionamiento}
          onChange={(v) =>
            patchSection("condicion_operacion", {
              prueba_funcionamiento: v,
            })
          }
        />
      </SectionBox>
    </>
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

      <View style={styles.resultCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.resultTitle}>Dictamen general</Text>
          <Text style={styles.resultHint}>
            Puedes seleccionar uno o ambos estados según el resultado.
          </Text>
        </View>

        <View style={styles.resultChips}>
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
            Seguimiento
          </Chip>
        </View>
      </View>

      <Label>Detalle</Label>
      <Input
        multiline
        style={styles.textArea}
        value={form.resultado_total.detalle}
        onChangeText={(t) =>
          patchSection("resultado_total", { detalle: t })
        }
        placeholder="Detalle del resultado"
      />
    </SectionBox>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderFreno();
    if (activeStep === 2) return renderComponentes();
    if (activeStep === 3) return renderSwitch();
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
      <Header title="Mantenimiento freno PM/PMF" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Reporte de mantenimiento</Text>
            <Text style={styles.introText}>
              Completa la inspección del freno por secciones. Puedes revisar el PDF en cualquier momento aunque existan campos vacíos.
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

  chipsWrapMini: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
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

  checkCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 9,
  },

  checkCardBad: {
    backgroundColor: UI.redSoft,
    borderColor: "#F5C2BD",
  },

  checkTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  checkIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: UI.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  checkIconBad: {
    backgroundColor: UI.red,
  },

  checkIconText: {
    color: UI.green,
    fontSize: 14,
    fontWeight: "800",
  },

  checkTitle: {
    color: UI.text,
    fontSize: 13.5,
    fontWeight: "700",
  },

  checkDesc: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
    lineHeight: 16,
  },

  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },

  statusPillOk: {
    backgroundColor: UI.greenSoft,
  },

  statusPillBad: {
    backgroundColor: UI.redSoft,
  },

  statusPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  statusPillTextOk: {
    color: UI.green,
  },

  statusPillTextBad: {
    color: UI.red,
  },

  resultCard: {
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },

  resultTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "700",
  },

  resultHint: {
    color: UI.muted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
    lineHeight: 16,
  },

  resultChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
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


  checkIconTextBad: {
    color: "#FFFFFF",
  },

});