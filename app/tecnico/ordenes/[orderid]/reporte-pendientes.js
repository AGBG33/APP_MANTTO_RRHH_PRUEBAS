// app/tecnico/ordenes/[orderid]/reporte-pendientes.js
// Reporte de pendientes — diseño simple y técnico, consistente con los formularios de mantenimiento.
// Mantiene carga de la orden, fechas y vista previa del PDF sin validaciones bloqueantes.

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
import Header from "../../../../src/components/Header";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildReportePendientesHtml } from "../../../../src/services/templates/reporte_pendientes/buildReportePendientesHtml";

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
  { key: "general", title: "General", short: "Orden" },
  { key: "pendiente", title: "Pendiente", short: "Problema" },
  { key: "seguimiento", title: "Seguimiento", short: "Supervisor" },
  { key: "solucion", title: "Solución", short: "Cierre" },
];

const pad2 = (n) => String(n).padStart(2, "0");

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

function safe(v) {
  return String(v ?? "").trim();
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
  if (!addr) return { razonSocial: "", direccion: "", telefono: "" };

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

  return {
    razonSocial,
    direccion,
    telefono: safe(addr.TelNumber || addr.TelNumber1 || addr.PhoneNumber || ""),
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
          keyboardType={keyboardType}
          editable={editable}
          multiline={multiline}
          style={[styles.input, multiline && styles.textArea]}
        />
      </View>
    </View>
  );
}

function Chip({ active, children, onPress, tone = "blue" }) {
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
}

function RadioChips({ options, value, onChange }) {
  return (
    <View style={styles.chipsWrap}>
      {options.map((opt) => (
        <Chip
          key={opt}
          active={value === opt}
          onPress={() => onChange(opt)}
          tone={opt === "Elevador" ? "blue" : "green"}
        >
          {opt}
        </Chip>
      ))}
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
    <View style={[styles.field, small && styles.fieldSmall, wide && styles.fieldWide]}>
      {children}
    </View>
  );
}

export default function ReportePendientesForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const safeOrderId = safe(orderid || "SIN_ORDEN");
  const fechaHoy = useMemo(() => formatDateDMY(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  const [mx, setMx] = useState("");
  const [folioPreventivo, setFolioPreventivo] = useState(safeOrderId || "SIN_ORDEN");
  const [numeroEquipo, setNumeroEquipo] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoEquipo, setTipoEquipo] = useState("");

  const [fechaReporte, setFechaReporte] = useState(fechaHoy);
  const [mecanicoReporta, setMecanicoReporta] = useState(getUserName(user));
  const [fechaEnteradoSMA, setFechaEnteradoSMA] = useState("");
  const [firmaSelloSMA, setFirmaSelloSMA] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");

  const [seguimientoSupervisor, setSeguimientoSupervisor] = useState("");
  const [fechaSolucion, setFechaSolucion] = useState("");
  const [fechaEnteradoMec, setFechaEnteradoMec] = useState("");
  const [auxiliar, setAuxiliar] = useState("");
  const [firmaMec, setFirmaMec] = useState("");
  const [procedimiento, setProcedimiento] = useState("");
  const [solucionProblema, setSolucionProblema] = useState("");

  const [dateTarget, setDateTarget] = useState(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    const name = getUserName(user);
    if (!mecanicoReporta && name) setMecanicoReporta(name);
  }, [user, mecanicoReporta]);

  useEffect(() => {
    let alive = true;

    async function cargarDatosOrden() {
      const orderId = safe(orderid);

      if (!orderId || orderId === "[orderid]") {
        if (!alive) return;

        setFolioPreventivo("SIN_ORDEN");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const resOrden = await api.get(`/api/ordenes/sap/${orderId}`);
        const orden = resOrden?.data || {};

        let razon = safe(
          orden.razon_social ||
            orden.cliente ||
            `${orden.Name1 ?? ""} ${orden.Name2 ?? ""}`
        );

        let dir = safe(orden.direccion || orden.address || orden.partner_address || "");
        let tel = safe(orden.TelNumber || orden.telefono || orden.phone || "");

        try {
          const resAddr = await api.get(
            `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToAddresses`
          );

          const results = resAddr?.data?.d?.results || resAddr?.data?.results || [];
          const chosen = results?.[1] || results?.[0] || null;
          const mapped = mapDireccion(chosen);

          if (mapped.razonSocial) razon = mapped.razonSocial;
          if (mapped.direccion) dir = mapped.direccion;
          if (mapped.telefono) tel = mapped.telefono;
        } catch (e) {
          console.log("[PENDIENTES] Dirección no disponible:", e?.message);
        }

        const rawTipo = safe(
          orden.tipo_equipo ||
            orden.EquipmentType ||
            orden.equipment_type ||
            orden.DescripcionEquipo ||
            orden.description ||
            ""
        ).toLowerCase();

        if (!alive) return;

        setFolioPreventivo(safe(orden.Orderid || orden.OrderId || orderId));
        setNumeroEquipo(safe(orden.Equipment || orden.equipment || ""));
        setRazonSocial(razon);
        setDireccion(dir);
        setTelefono(tel);

        if (rawTipo.includes("escal")) setTipoEquipo("Escalera");
        else if (rawTipo.includes("elev")) setTipoEquipo("Elevador");
      } catch (e) {
        console.log("[PENDIENTES] Error cargando orden:", e?.response?.data || e);

        if (alive) {
          setFolioPreventivo(orderId || "SIN_ORDEN");
          Alert.alert(
            "Aviso",
            "No se pudieron traer los datos de la orden. Puedes capturarlos manualmente y generar el PDF."
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    cargarDatosOrden();

    return () => {
      alive = false;
    };
  }, [orderid]);

  const buildPayload = useCallback(
    () => ({
      mx: safe(mx),
      folioPreventivo: safe(folioPreventivo || safeOrderId || "SIN_ORDEN"),
      numeroEquipo: safe(numeroEquipo),
      razonSocial: safe(razonSocial),
      direccion: safe(direccion),
      telefono: safe(telefono),
      tipoEquipo: safe(tipoEquipo),
      fechaReporte: safe(fechaReporte),
      mecanicoReporta: safe(mecanicoReporta),
      fechaEnteradoSMA: safe(fechaEnteradoSMA),
      firmaSelloSMA: safe(firmaSelloSMA),
      descripcionProblema: safe(descripcionProblema),
      seguimientoSupervisor: safe(seguimientoSupervisor),
      fechaSolucion: safe(fechaSolucion),
      fechaEnteradoMec: safe(fechaEnteradoMec),
      auxiliar: safe(auxiliar),
      firmaMec: safe(firmaMec),
      procedimiento: safe(procedimiento),
      solucionProblema: safe(solucionProblema),
    }),
    [
      mx,
      folioPreventivo,
      safeOrderId,
      numeroEquipo,
      razonSocial,
      direccion,
      telefono,
      tipoEquipo,
      fechaReporte,
      mecanicoReporta,
      fechaEnteradoSMA,
      firmaSelloSMA,
      descripcionProblema,
      seguimientoSupervisor,
      fechaSolucion,
      fechaEnteradoMec,
      auxiliar,
      firmaMec,
      procedimiento,
      solucionProblema,
    ]
  );

  const getDateValue = (target) => {
    if (target === "fechaReporte") return fechaReporte;
    if (target === "fechaEnteradoSMA") return fechaEnteradoSMA;
    if (target === "fechaSolucion") return fechaSolucion;
    if (target === "fechaEnteradoMec") return fechaEnteradoMec;
    return "";
  };

  const setDateValue = (target, value) => {
    if (target === "fechaReporte") setFechaReporte(value);
    if (target === "fechaEnteradoSMA") setFechaEnteradoSMA(value);
    if (target === "fechaSolucion") setFechaSolucion(value);
    if (target === "fechaEnteradoMec") setFechaEnteradoMec(value);
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setDateTarget(null);
    if (!selectedDate || !dateTarget) return;
    setDateValue(dateTarget, formatDateDMY(selectedDate));
  };

  const generarPdfLocal = async () => {
    const payload = buildPayload();
    const html = buildReportePendientesHtml(payload);

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
      console.log("[REPORTE PENDIENTES PDF] error:", e);
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
        dialogTitle: "Abrir / compartir reporte de pendientes",
      });
    } catch (e) {
      console.log("[PENDIENTES] abrirPdf error:", e);
      Alert.alert("Error", "No se pudo abrir o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const filledCount = useMemo(() => {
    const values = [
      mx,
      folioPreventivo,
      numeroEquipo,
      razonSocial,
      direccion,
      telefono,
      tipoEquipo,
      fechaReporte,
      mecanicoReporta,
      fechaEnteradoSMA,
      firmaSelloSMA,
      descripcionProblema,
      seguimientoSupervisor,
      fechaSolucion,
      fechaEnteradoMec,
      auxiliar,
      firmaMec,
      procedimiento,
      solucionProblema,
    ];

    return values.filter((v) => !!safe(v)).length;
  }, [
    mx,
    folioPreventivo,
    numeroEquipo,
    razonSocial,
    direccion,
    telefono,
    tipoEquipo,
    fechaReporte,
    mecanicoReporta,
    fechaEnteradoSMA,
    firmaSelloSMA,
    descripcionProblema,
    seguimientoSupervisor,
    fechaSolucion,
    fechaEnteradoMec,
    auxiliar,
    firmaMec,
    procedimiento,
    solucionProblema,
  ]);

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
        icon="document-text-outline"
        title="Resumen del reporte"
        subtitle="Datos principales de la orden y del equipo."
      >
        <View style={styles.infoGrid}>
          <InfoItem label="Folio" value={folioPreventivo || safeOrderId || "SIN_ORDEN"} />
          <InfoItem label="Equipo" value={numeroEquipo} />
          <InfoItem label="Tipo equipo" value={tipoEquipo} />
          <InfoItem label="Mecánico" value={mecanicoReporta} />
        </View>
      </SectionBox>

      <SectionBox
        icon="business-outline"
        title="Datos principales"
        subtitle="Se precargan desde la orden, pero puedes corregirlos."
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
              label="No. folio mantto preventivo"
              value={folioPreventivo}
              onChangeText={setFolioPreventivo}
              placeholder="Folio"
              icon="document-text-outline"
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Input
              label="No. de equipo"
              value={numeroEquipo}
              onChangeText={setNumeroEquipo}
              placeholder="Equipo"
              icon="construct-outline"
            />
          </Field>

          <Field>
            <Input
              label="Teléfono"
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Teléfono"
              icon="call-outline"
              keyboardType="phone-pad"
            />
          </Field>
        </FieldRow>

        <Input
          label="Razón social"
          value={razonSocial}
          onChangeText={setRazonSocial}
          placeholder="Cliente / empresa"
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

        <Label>Tipo de equipo</Label>

        <RadioChips
          options={["Escalera", "Elevador"]}
          value={tipoEquipo}
          onChange={setTipoEquipo}
        />
      </SectionBox>
    </>
  );

  const renderPendiente = () => (
    <>
      <SectionBox
        icon="calendar-outline"
        title="Datos del pendiente"
        subtitle="Fecha, mecánico, SMA y descripción del problema."
      >
        <DateButton
          label="Fecha de reporte"
          value={fechaReporte}
          onPress={() => setDateTarget("fechaReporte")}
        />

        <Input
          label="Mecánico que reporta"
          value={mecanicoReporta}
          onChangeText={setMecanicoReporta}
          placeholder="Nombre del mecánico"
          icon="person-circle-outline"
        />

        <DateButton
          label="Fecha de enterado SMA"
          value={fechaEnteradoSMA}
          onPress={() => setDateTarget("fechaEnteradoSMA")}
        />

        <Input
          label="Firma y sello SMA"
          value={firmaSelloSMA}
          onChangeText={setFirmaSelloSMA}
          placeholder="Texto o referencia"
          icon="create-outline"
        />
      </SectionBox>

      <SectionBox
        icon="alert-circle-outline"
        title="Descripción del problema / pendiente"
        subtitle="Describe qué se encontró o qué queda pendiente."
      >
        <Input
          label="Descripción"
          value={descripcionProblema}
          onChangeText={setDescripcionProblema}
          placeholder="Describe el problema o pendiente..."
          multiline
          icon="alert-circle-outline"
        />
      </SectionBox>
    </>
  );

  const renderSeguimiento = () => (
    <>
      <SectionBox
        icon="briefcase-outline"
        title="Seguimiento del supervisor"
        subtitle="Responsable, comentarios y fechas de seguimiento."
      >
        <Input
          label="Seguimiento del supervisor"
          value={seguimientoSupervisor}
          onChangeText={setSeguimientoSupervisor}
          placeholder="Seguimiento / responsable / comentario"
          icon="person-outline"
          multiline
        />

        <FieldRow>
          <Field>
            <DateButton
              label="Fecha de solución"
              value={fechaSolucion}
              onPress={() => setDateTarget("fechaSolucion")}
            />
          </Field>

          <Field>
            <DateButton
              label="Fecha de enterado MEC"
              value={fechaEnteradoMec}
              onPress={() => setDateTarget("fechaEnteradoMec")}
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Input
              label="Auxiliar"
              value={auxiliar}
              onChangeText={setAuxiliar}
              placeholder="Nombre del auxiliar"
              icon="people-outline"
            />
          </Field>

          <Field>
            <Input
              label="Firma MEC"
              value={firmaMec}
              onChangeText={setFirmaMec}
              placeholder="Firma / referencia"
              icon="create-outline"
            />
          </Field>
        </FieldRow>
      </SectionBox>
    </>
  );

  const renderSolucion = () => (
    <>
      <SectionBox
        icon="hammer-outline"
        title="Procedimiento"
        subtitle="Describe el procedimiento realizado para atender el pendiente."
      >
        <Input
          label="Procedimiento"
          value={procedimiento}
          onChangeText={setProcedimiento}
          placeholder="Describe el procedimiento..."
          multiline
          icon="hammer-outline"
        />
      </SectionBox>

      <SectionBox
        icon="checkmark-done-outline"
        title="Solución del problema"
        subtitle="Describe la solución o el cierre del pendiente."
      >
        <Input
          label="Solución del problema / fecha de solución"
          value={solucionProblema}
          onChangeText={setSolucionProblema}
          placeholder="Describe la solución..."
          multiline
          icon="checkmark-done-outline"
        />
      </SectionBox>
    </>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderPendiente();
    if (activeStep === 2) return renderSeguimiento();
    return renderSolucion();
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={UI.blue} />
        <Text style={styles.loadingText}>Cargando datos de la orden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Reporte de pendientes" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Reporte de pendientes</Text>
            <Text style={styles.introText}>
              Registra el pendiente, seguimiento del supervisor y solución. La vista previa del PDF permanece disponible aunque falten campos.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.introPreviewButton}
            onPress={generarPreviewPdf}
            disabled={generatingPdf}
            activeOpacity={0.82}
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