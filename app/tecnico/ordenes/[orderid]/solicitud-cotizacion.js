// app/tecnico/ordenes/[orderid]/solicitud-cotizacion.js
// Solicitud de cotización — formulario móvil + vista previa PDF
// Basado en TLA-GMA-FRT-004 / Anexo 8.
// Sin validaciones bloqueantes para permitir previsualizar el PDF con datos parciales.

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
  Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";
import { buildSolicitudCotizacionHtml } from "../../../../src/services/templates/solicitud_cotizacion/buildSolicitudCotizacionHtml";

const UI = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  soft: "#F8FAFC",
  border: "#E2E8F0",
  borderDark: "#CBD5E1",
  text: "#172033",
  muted: "#667085",
  muted2: "#98A2B3",
  primary: "#123A72",
  primarySoft: "#EEF4FF",
  green: "#15803D",
  greenSoft: "#ECFDF3",
  red: "#C62828",
  redSoft: "#FEF3F2",
  amber: "#B54708",
  amberSoft: "#FFFAEB",
};

const STEPS = [
  { key: "cliente", title: "Cliente", short: "Datos generales" },
  { key: "equipo", title: "Equipo", short: "Características" },
  { key: "reporte", title: "Reporte", short: "Falla" },
  { key: "electricas", title: "Eléctricas", short: "Partes" },
  { key: "mecanicas", title: "Mecánicas", short: "Partes" },
  { key: "software", title: "Software / KABA", short: "Cambios" },
  { key: "fotos", title: "Fotos y cierre", short: "Evidencia" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const safe = (v) => String(v ?? "").trim();
const formatDMY = (d) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

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

const newParte = () => ({
  concepto: "",
  numeroPartePlano: "",
  cantidad: "",
  horas: "",
  personas: "",
  dias: "",
  comentarios: "",
});

const newFoto = () => ({
  titulo: "",
  descripcion: "",
  dataUri: "",
});

function createInitialForm(userName = "") {
  return {
    fechaIso: new Date().toISOString(),
    razonSocial: "",
    mx: "",
    cm: "",
    direccion: "",
    solicitante: userName,
    puesto: "",
    email: "",
    telefono: "",
    contrato: "",
    cobertura: "",

    tipoEquipo: "",
    maquina: "",
    control: "",
    capacidad: "",
    velocidad: "",
    voltaje: "",
    pisosServicio: "",
    modelo: "",
    numeroEquipo: "",
    ubicacion: {
      cuartoMaquinas: false,
      cubo: false,
      cabina: false,
      fosa: false,
    },

    observaciones: "",
    funcionando: "",
    partesElectricas: [newParte()],
    analisisCambioPartes: "",
    partesMecanicas: [newParte()],

    software: {
      cambiosRequeridos: "",
      concepto: "",
      horas: "",
      personas: "",
      dias: "",
      actual: "",
      requerido: "",
      cuentaPc: "",
    },

    kaba: {
      enCabina: false,
      juntoBotonPiso: false,
      instalacionEspecial: false,
      nuevaCantidad: "",
      nuevaPisoDepto: "",
      descripcionInstalacion: "",
      nuevaCombinacion: "",
      combinacionActual: "",
      cambioCantidad: "",
      cambioPisoDepto: "",
      llavesCombinacion: "",
      llavesCantidad: "",
      llavesPisoDepto: "",
    },

    voboJefatura: "",
    supervisor: userName,
    fotos: [],
  };
}

function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
  editable = true,
  icon,
}) {
  return (
    <View style={styles.inputBlock}>
      {!!label && <Label>{label}</Label>}
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          !editable && styles.inputReadonly,
        ]}
      >
        {!!icon && (
          <Ionicons
            name={icon}
            size={17}
            color={UI.muted}
            style={{ marginTop: multiline ? 12 : 0 }}
          />
        )}
        <TextInput
          value={String(value ?? "")}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={UI.muted2}
          keyboardType={keyboardType}
          editable={editable}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          style={[styles.input, multiline && styles.textArea]}
        />
      </View>
    </View>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function Choice({ label, options, value, onChange }) {
  return (
    <View style={styles.inputBlock}>
      <Label>{label}</Label>
      <View style={styles.choiceWrap}>
        {options.map((option) => {
          const active = value === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.choice, active && styles.choiceActive]}
              onPress={() => onChange(option)}
              activeOpacity={0.86}
            >
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.toggleRight}>
        <Text style={styles.toggleValue}>{value ? "Sí" : "No"}</Text>
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: "#D0D5DD", true: "#A9C7EE" }}
          thumbColor={value ? UI.primary : "#FFFFFF"}
        />
      </View>
    </View>
  );
}

function DateField({ value, onPress }) {
  return (
    <View style={styles.inputBlock}>
      <Label>Fecha</Label>
      <TouchableOpacity style={styles.dateButton} onPress={onPress} activeOpacity={0.88}>
        <View style={styles.dateButtonLeft}>
          <Ionicons name="calendar-outline" size={17} color={UI.primary} />
          <Text style={styles.dateText}>{value}</Text>
        </View>
        <Ionicons name="chevron-down" size={17} color={UI.muted} />
      </TouchableOpacity>
    </View>
  );
}

function ParteCard({ item, index, onChange, onRemove }) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View>
          <Text style={styles.itemTitle}>Partida {index + 1}</Text>
          <Text style={styles.itemSubtitle}>Parte, cantidad y mano de obra</Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.removeText}>Eliminar</Text>
        </TouchableOpacity>
      </View>

      <Input
        label="Concepto"
        value={item.concepto}
        onChangeText={(v) => onChange("concepto", v)}
        placeholder="Descripción de la parte o trabajo"
      />
      <Input
        label="No. de parte / plano"
        value={item.numeroPartePlano}
        onChangeText={(v) => onChange("numeroPartePlano", v)}
        placeholder="Número de parte o plano"
      />
      <View style={styles.gridRow}>
        <View style={styles.gridCell}>
          <Input
            label="Cantidad"
            value={item.cantidad}
            onChangeText={(v) => onChange("cantidad", v)}
            placeholder="1"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.gridCell}>
          <Input
            label="Horas"
            value={item.horas}
            onChangeText={(v) => onChange("horas", v)}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.gridCell}>
          <Input
            label="Personas"
            value={item.personas}
            onChangeText={(v) => onChange("personas", v)}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.gridCell}>
          <Input
            label="Días"
            value={item.dias}
            onChangeText={(v) => onChange("dias", v)}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
      </View>
      <Input
        label="Comentarios"
        value={item.comentarios}
        onChangeText={(v) => onChange("comentarios", v)}
        placeholder="Comentarios de la partida"
        multiline
      />
    </View>
  );
}

function PhotoCard({ photo, index, onCamera, onGallery, onChange, onRemove }) {
  const hasPhoto = !!safe(photo.dataUri);

  return (
    <View style={[styles.photoCard, hasPhoto && styles.photoCardReady]}>
      <View style={styles.itemHeader}>
        <View>
          <Text style={styles.itemTitle}>Fotografía {index + 1}</Text>
          <Text style={[styles.itemSubtitle, hasPhoto && styles.photoReadyText]}>
            {hasPhoto ? "Imagen agregada al PDF" : "Aún sin imagen"}
          </Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.removeText}>Eliminar</Text>
        </TouchableOpacity>
      </View>

      <Input
        label="Título"
        value={photo.titulo}
        onChangeText={(v) => onChange("titulo", v)}
        placeholder="Ej. Tarjeta de control"
      />
      <Input
        label="Descripción / referencia"
        value={photo.descripcion}
        onChangeText={(v) => onChange("descripcion", v)}
        placeholder="Indica la parte, medida o referencia"
        multiline
      />

      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.outlineSmallBtn} onPress={onCamera}>
          <Ionicons name="camera-outline" size={17} color={UI.primary} />
          <Text style={styles.outlineSmallText}>Cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineSmallBtn} onPress={onGallery}>
          <Ionicons name="images-outline" size={17} color={UI.primary} />
          <Text style={styles.outlineSmallText}>Galería</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SolicitudCotizacionForm() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();
  const userName = getUserName(user);
  const safeOrderId = safe(orderid || "SIN_ORDEN");

  const draftKey = useMemo(
    () => `solicitud_cotizacion:${safeOrderId || "local"}`,
    [safeOrderId]
  );

  const [form, setForm] = useState(() => createInitialForm(userName));
  const [activeStep, setActiveStep] = useState(0);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const patch = (values) => setForm((prev) => ({ ...prev, ...values }));
  const patchNested = (section, values) =>
    setForm((prev) => ({
      ...prev,
      [section]: { ...(prev[section] || {}), ...values },
    }));

  useEffect(() => {
    if (!userName) return;
    setForm((prev) => ({
      ...prev,
      solicitante: prev.solicitante || userName,
      supervisor: prev.supervisor || userName,
    }));
  }, [userName]);

  const cargarOrden = useCallback(async () => {
    const oid = safe(orderid);
    if (!oid || oid === "[orderid]") {
      setLoadingOrder(false);
      return;
    }

    try {
      setLoadingOrder(true);
      const resOrden = await api.get(`/api/ordenes/sap/${oid}`);
      const orden = resOrden?.data || {};

      let razon = safe(orden.razon_social || orden.cliente || orden.Name1 || "");
      let direccion = safe(orden.direccion || orden.address || "");
      let telefono = safe(orden.TelNumber || orden.telefono || orden.phone || "");

      try {
        const resAddr = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${oid}')/ToAddresses`
        );
        const results = resAddr?.data?.d?.results || resAddr?.data?.results || [];
        const mapped = mapDireccion(results?.[0]);
        razon = mapped.razonSocial || razon;
        direccion = mapped.direccion || direccion;
        telefono = mapped.telefono || telefono;
      } catch (e) {
        console.log("[SOLICITUD COTIZACION] Dirección no disponible:", e?.message);
      }

      const rawTipo = safe(
        orden.tipo_equipo || orden.EquipmentType || orden.description || ""
      ).toLowerCase();

      setForm((prev) => ({
        ...prev,
        razonSocial: prev.razonSocial || razon,
        direccion: prev.direccion || direccion,
        telefono: prev.telefono || telefono,
        mx: prev.mx || safe(orden.ObjectNumber || orden.MX || ""),
        numeroEquipo:
          prev.numeroEquipo || safe(orden.Equipment || orden.equipment || ""),
        tipoEquipo:
          prev.tipoEquipo ||
          (rawTipo.includes("escal")
            ? "Escalera"
            : rawTipo.includes("elev")
            ? "Elevador"
            : ""),
      }));
    } catch (e) {
      console.log("[SOLICITUD COTIZACION] Error cargando orden:", e?.response?.data || e);
    } finally {
      setLoadingOrder(false);
    }
  }, [orderid]);

  useEffect(() => {
    cargarOrden();
  }, [cargarOrden]);

  const loadDraft = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      setForm((prev) => ({
        ...prev,
        ...saved,
        ubicacion: { ...prev.ubicacion, ...(saved.ubicacion || {}) },
        software: { ...prev.software, ...(saved.software || {}) },
        kaba: { ...prev.kaba, ...(saved.kaba || {}) },
        partesElectricas:
          Array.isArray(saved.partesElectricas) && saved.partesElectricas.length
            ? saved.partesElectricas
            : prev.partesElectricas,
        partesMecanicas:
          Array.isArray(saved.partesMecanicas) && saved.partesMecanicas.length
            ? saved.partesMecanicas
            : prev.partesMecanicas,
        fotos: Array.isArray(saved.fotos) ? saved.fotos : prev.fotos,
      }));
    } catch (e) {
      console.log("[SOLICITUD COTIZACION] loadDraft:", e);
    }
  }, [draftKey]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const saveDraft = async () => {
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(form));
      Alert.alert("Borrador guardado", "La solicitud se guardó localmente.");
    } catch (e) {
      console.log("[SOLICITUD COTIZACION] saveDraft:", e);
      Alert.alert("Error", "No se pudo guardar el borrador.");
    }
  };

  const updateParte = (section, index, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: prev[section].map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addParte = (section) =>
    setForm((prev) => ({ ...prev, [section]: [...prev[section], newParte()] }));

  const removeParte = (section, index) =>
    setForm((prev) => {
      const next = prev[section].filter((_, i) => i !== index);
      return { ...prev, [section]: next.length ? next : [newParte()] };
    });

  const addFoto = () =>
    setForm((prev) => ({ ...prev, fotos: [...(prev.fotos || []), newFoto()] }));

  const updateFoto = (index, field, value) =>
    setForm((prev) => ({
      ...prev,
      fotos: prev.fotos.map((foto, i) =>
        i === index ? { ...foto, [field]: value } : foto
      ),
    }));

  const removeFoto = (index) =>
    setForm((prev) => ({
      ...prev,
      fotos: prev.fotos.filter((_, i) => i !== index),
    }));

  const setFotoDesdeAsset = (index, asset) => {
    const base64 = asset?.base64;
    if (!base64) {
      Alert.alert("Error", "No se pudo obtener la imagen.");
      return;
    }
    const mime = asset?.mimeType || "image/jpeg";
    updateFoto(index, "dataUri", `data:${mime};base64,${base64}`);
  };

  const tomarFoto = async (index) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permiso requerido", "Permite el acceso a la cámara para agregar fotografías.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.45,
        base64: true,
      });
      if (!result.canceled) setFotoDesdeAsset(index, result.assets?.[0]);
    } catch (e) {
      console.log("[SOLICITUD COTIZACION] cámara:", e);
      Alert.alert("Error", "No se pudo tomar la fotografía.");
    }
  };

  const seleccionarFoto = async (index) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permiso requerido", "Permite el acceso a la galería para agregar fotografías.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.45,
        base64: true,
      });
      if (!result.canceled) setFotoDesdeAsset(index, result.assets?.[0]);
    } catch (e) {
      console.log("[SOLICITUD COTIZACION] galería:", e);
      Alert.alert("Error", "No se pudo seleccionar la fotografía.");
    }
  };

  const buildPayload = () => ({
    ...form,
    fecha: formatDMY(new Date(form.fechaIso || Date.now())),
  });

  const generarPdfLocal = async () => {
    const payload = buildPayload();
    const html = buildSolicitudCotizacionHtml(payload);
    const result = await Print.printToFileAsync({ html, base64: false });
    return { html, uri: result.uri };
  };

  const generarPreviewPdf = async () => {
    try {
      setGeneratingPdf(true);
      setPreviewHtml("");
      setShowPreview(true);
      const result = await generarPdfLocal();
      setPreviewHtml(result.html);
    } catch (e) {
      console.log("[SOLICITUD COTIZACION PDF] preview:", e);
      setShowPreview(false);
      Alert.alert("Error", "No se pudo generar la vista previa del PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const compartirPdf = async () => {
    try {
      setGeneratingPdf(true);
      const result = await generarPdfLocal();
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF generado", "Este dispositivo no permite compartir archivos.");
        return;
      }
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir solicitud de cotización",
      });
    } catch (e) {
      console.log("[SOLICITUD COTIZACION PDF] share:", e);
      Alert.alert("Error", "No se pudo generar o compartir el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const onChangeDate = (_event, selectedDate) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate) patch({ fechaIso: selectedDate.toISOString() });
  };

  const filledPhotos = useMemo(
    () => (form.fotos || []).filter((f) => !!safe(f.dataUri)).length,
    [form.fotos]
  );

  const renderStepper = () => {
    const progress = ((activeStep + 1) / STEPS.length) * 100;
    return (
      <View style={styles.stepperCard}>
        <View style={styles.stepperTop}>
          <View>
            <Text style={styles.stepperEyebrow}>Paso {activeStep + 1} de {STEPS.length}</Text>
            <Text style={styles.stepperTitle}>{STEPS[activeStep].title}</Text>
          </View>
          <Text style={styles.stepperPercent}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepTabs}>
          {STEPS.map((step, index) => (
            <TouchableOpacity
              key={step.key}
              style={[styles.stepTab, index === activeStep && styles.stepTabActive]}
              onPress={() => setActiveStep(index)}
            >
              <Text style={[styles.stepTabNumber, index === activeStep && styles.stepTabNumberActive]}>{index + 1}</Text>
              <Text style={[styles.stepTabText, index === activeStep && styles.stepTabTextActive]}>{step.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderCliente = () => (
    <>
      <View style={styles.introCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.introEyebrow}>ANEXO 8 · TLA-GMA-FRT-004</Text>
          <Text style={styles.introTitle}>Solicitud de cotización</Text>
          <Text style={styles.introText}>Captura la información técnica necesaria para solicitar una cotización.</Text>
        </View>
        <TouchableOpacity style={styles.previewMini} onPress={generarPreviewPdf}>
          <Ionicons name="eye-outline" size={17} color={UI.primary} />
          <Text style={styles.previewMiniText}>Ver PDF</Text>
        </TouchableOpacity>
      </View>

      <Section title="Datos del cliente" subtitle="Información de contacto, contrato y cobertura.">
        <DateField value={formatDMY(new Date(form.fechaIso))} onPress={() => setShowDatePicker(true)} />
        {showDatePicker && (
          <DateTimePicker
            value={new Date(form.fechaIso)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeDate}
          />
        )}

        <Input label="Razón social" value={form.razonSocial} onChangeText={(v) => patch({ razonSocial: v })} placeholder="Cliente / empresa" />
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="MX" value={form.mx} onChangeText={(v) => patch({ mx: v })} placeholder="MX" /></View>
          <View style={styles.gridCell}><Input label="CM" value={form.cm} onChangeText={(v) => patch({ cm: v })} placeholder="CM" /></View>
        </View>
        <Input label="Dirección" value={form.direccion} onChangeText={(v) => patch({ direccion: v })} placeholder="Dirección completa" multiline />
        <Input label="Solicitante" value={form.solicitante} onChangeText={(v) => patch({ solicitante: v })} placeholder="Nombre del solicitante" />
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="Puesto" value={form.puesto} onChangeText={(v) => patch({ puesto: v })} placeholder="Puesto" /></View>
          <View style={styles.gridCell}><Input label="Teléfono" value={form.telefono} onChangeText={(v) => patch({ telefono: v })} placeholder="Teléfono" keyboardType="phone-pad" /></View>
        </View>
        <Input label="Email" value={form.email} onChangeText={(v) => patch({ email: v })} placeholder="correo@empresa.com" keyboardType="email-address" />
        <Choice label="Contrato" options={["Vigente", "Post venta", "Recuperación"]} value={form.contrato} onChange={(v) => patch({ contrato: v })} />
        <Input label="Cobertura" value={form.cobertura} onChangeText={(v) => patch({ cobertura: v })} placeholder="Cobertura" />
      </Section>
    </>
  );

  const renderEquipo = () => (
    <Section title="Datos del equipo" subtitle="Características técnicas y ubicación de la intervención.">
      <View style={styles.gridRow}>
        <View style={styles.gridCell}><Input label="Tipo de equipo" value={form.tipoEquipo} onChangeText={(v) => patch({ tipoEquipo: v })} placeholder="Elevador / Escalera" /></View>
        <View style={styles.gridCell}><Input label="Máquina" value={form.maquina} onChangeText={(v) => patch({ maquina: v })} placeholder="Máquina" /></View>
      </View>
      <Input label="Control" value={form.control} onChangeText={(v) => patch({ control: v })} placeholder="Tipo de control" />
      <View style={styles.gridRow}>
        <View style={styles.gridCell}><Input label="Capacidad" value={form.capacidad} onChangeText={(v) => patch({ capacidad: v })} placeholder="kg" /></View>
        <View style={styles.gridCell}><Input label="Velocidad" value={form.velocidad} onChangeText={(v) => patch({ velocidad: v })} placeholder="m/min" /></View>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.gridCell}><Input label="Voltaje" value={form.voltaje} onChangeText={(v) => patch({ voltaje: v })} placeholder="V" /></View>
        <View style={styles.gridCell}><Input label="Pisos de servicio" value={form.pisosServicio} onChangeText={(v) => patch({ pisosServicio: v })} placeholder="Pisos" /></View>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.gridCell}><Input label="Modelo" value={form.modelo} onChangeText={(v) => patch({ modelo: v })} placeholder="Modelo" /></View>
        <View style={styles.gridCell}><Input label="No. de equipo" value={form.numeroEquipo} onChangeText={(v) => patch({ numeroEquipo: v })} placeholder="Equipo" /></View>
      </View>

      <Text style={styles.subheading}>Ubicación</Text>
      <ToggleRow label="Cuarto de máquinas" value={form.ubicacion.cuartoMaquinas} onChange={(v) => patchNested("ubicacion", { cuartoMaquinas: v })} />
      <ToggleRow label="Cubo" value={form.ubicacion.cubo} onChange={(v) => patchNested("ubicacion", { cubo: v })} />
      <ToggleRow label="Cabina" value={form.ubicacion.cabina} onChange={(v) => patchNested("ubicacion", { cabina: v })} />
      <ToggleRow label="Fosa" value={form.ubicacion.fosa} onChange={(v) => patchNested("ubicacion", { fosa: v })} />
    </Section>
  );

  const renderReporte = () => (
    <Section title="Reporte / especificación de falla" subtitle="Describe lo encontrado y confirma si el equipo está funcionando.">
      <Input label="Observaciones" value={form.observaciones} onChangeText={(v) => patch({ observaciones: v })} placeholder="Describe la falla, condición y alcance..." multiline />
      <Choice label="¿El equipo está funcionando?" options={["Sí", "No"]} value={form.funcionando} onChange={(v) => patch({ funcionando: v })} />
      <Input label="Cómo determinó el cambio de partes (análisis de falla)" value={form.analisisCambioPartes} onChangeText={(v) => patch({ analisisCambioPartes: v })} placeholder="Describe el análisis realizado..." multiline />
    </Section>
  );

  const renderPartes = (section, title, subtitle) => (
    <Section title={title} subtitle={subtitle}>
      {form[section].map((item, index) => (
        <ParteCard
          key={`${section}-${index}`}
          item={item}
          index={index}
          onChange={(field, value) => updateParte(section, index, field, value)}
          onRemove={() => removeParte(section, index)}
        />
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={() => addParte(section)}>
        <Ionicons name="add" size={18} color={UI.primary} />
        <Text style={styles.addBtnText}>Agregar partida</Text>
      </TouchableOpacity>
    </Section>
  );

  const renderSoftware = () => (
    <>
      <Section title="Modificación de software" subtitle="Cambios requeridos, mano de obra y valores actual/requerido.">
        <Input label="Cambios que se requieren" value={form.software.cambiosRequeridos} onChangeText={(v) => patchNested("software", { cambiosRequeridos: v })} placeholder="Describe los cambios..." multiline />
        <Input label="Concepto" value={form.software.concepto} onChangeText={(v) => patchNested("software", { concepto: v })} placeholder="Concepto" />
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="Horas" value={form.software.horas} onChangeText={(v) => patchNested("software", { horas: v })} placeholder="0" keyboardType="numeric" /></View>
          <View style={styles.gridCell}><Input label="Personas" value={form.software.personas} onChangeText={(v) => patchNested("software", { personas: v })} placeholder="0" keyboardType="numeric" /></View>
          <View style={styles.gridCell}><Input label="Días" value={form.software.dias} onChangeText={(v) => patchNested("software", { dias: v })} placeholder="0" keyboardType="numeric" /></View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="Actual" value={form.software.actual} onChangeText={(v) => patchNested("software", { actual: v })} placeholder="Actual" multiline /></View>
          <View style={styles.gridCell}><Input label="Requerido" value={form.software.requerido} onChangeText={(v) => patchNested("software", { requerido: v })} placeholder="Requerido" multiline /></View>
        </View>
        <Choice label="¿Mantenimiento cuenta con la PC para realizarlo?" options={["Sí", "No"]} value={form.software.cuentaPc} onChange={(v) => patchNested("software", { cuentaPc: v })} />
      </Section>

      <Section title="Chapas tipo KABA" subtitle="Nueva instalación, cambio físico y llaves KABA.">
        <Text style={styles.subheading}>Nueva instalación</Text>
        <ToggleRow label="En cabina" value={form.kaba.enCabina} onChange={(v) => patchNested("kaba", { enCabina: v })} />
        <ToggleRow label="Junto a botón de piso" value={form.kaba.juntoBotonPiso} onChange={(v) => patchNested("kaba", { juntoBotonPiso: v })} />
        <ToggleRow label="Instalación especial" value={form.kaba.instalacionEspecial} onChange={(v) => patchNested("kaba", { instalacionEspecial: v })} />
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="Cantidad" value={form.kaba.nuevaCantidad} onChangeText={(v) => patchNested("kaba", { nuevaCantidad: v })} placeholder="Cantidad" /></View>
          <View style={styles.gridCell}><Input label="Piso / departamento" value={form.kaba.nuevaPisoDepto} onChangeText={(v) => patchNested("kaba", { nuevaPisoDepto: v })} placeholder="Piso / depto" /></View>
        </View>
        <Input label="Descripción de instalación" value={form.kaba.descripcionInstalacion} onChangeText={(v) => patchNested("kaba", { descripcionInstalacion: v })} placeholder="Descripción" multiline />

        <Text style={styles.subheading}>Cambio físico</Text>
        <Input label="Nueva combinación" value={form.kaba.nuevaCombinacion} onChangeText={(v) => patchNested("kaba", { nuevaCombinacion: v })} placeholder="Nueva combinación" />
        <Input label="Combinación actual" value={form.kaba.combinacionActual} onChangeText={(v) => patchNested("kaba", { combinacionActual: v })} placeholder="Combinación actual" />
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="Cantidad" value={form.kaba.cambioCantidad} onChangeText={(v) => patchNested("kaba", { cambioCantidad: v })} placeholder="Cantidad" /></View>
          <View style={styles.gridCell}><Input label="Piso / departamento" value={form.kaba.cambioPisoDepto} onChangeText={(v) => patchNested("kaba", { cambioPisoDepto: v })} placeholder="Piso / depto" /></View>
        </View>

        <Text style={styles.subheading}>Llaves KABA</Text>
        <Input label="Combinación" value={form.kaba.llavesCombinacion} onChangeText={(v) => patchNested("kaba", { llavesCombinacion: v })} placeholder="Combinación" />
        <View style={styles.gridRow}>
          <View style={styles.gridCell}><Input label="Cantidad" value={form.kaba.llavesCantidad} onChangeText={(v) => patchNested("kaba", { llavesCantidad: v })} placeholder="Cantidad" /></View>
          <View style={styles.gridCell}><Input label="Piso / departamento" value={form.kaba.llavesPisoDepto} onChangeText={(v) => patchNested("kaba", { llavesPisoDepto: v })} placeholder="Piso / depto" /></View>
        </View>
      </Section>
    </>
  );

  const renderFotos = () => (
    <>
      <Section title="Fotografías" subtitle={`Hoja 2 del formato · ${filledPhotos} fotografía(s) agregada(s).`}>
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={19} color={UI.primary} />
          <Text style={styles.noticeText}>Las fotografías complementan la información. Señala la parte requerida y, cuando aplique, agrega medidas o referencias.</Text>
        </View>

        {(form.fotos || []).map((photo, index) => (
          <PhotoCard
            key={`foto-${index}`}
            photo={photo}
            index={index}
            onCamera={() => tomarFoto(index)}
            onGallery={() => seleccionarFoto(index)}
            onChange={(field, value) => updateFoto(index, field, value)}
            onRemove={() => removeFoto(index)}
          />
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={addFoto}>
          <Ionicons name="add" size={18} color={UI.primary} />
          <Text style={styles.addBtnText}>Agregar fotografía</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Elaboración y visto bueno" subtitle="Responsables que aparecen al final de la hoja 1.">
        <Input label="Vo.Bo. Jefatura" value={form.voboJefatura} onChangeText={(v) => patch({ voboJefatura: v })} placeholder="Nombre / referencia de firma" />
        <Input label="Supervisor / elaboró" value={form.supervisor} onChangeText={(v) => patch({ supervisor: v })} placeholder="Nombre del supervisor" />
      </Section>
    </>
  );

  const renderCurrentStep = () => {
    if (activeStep === 0) return renderCliente();
    if (activeStep === 1) return renderEquipo();
    if (activeStep === 2) return renderReporte();
    if (activeStep === 3) return renderPartes("partesElectricas", "Partes electrónicas y/o eléctricas", "Captura las partes y la mano de obra considerada.");
    if (activeStep === 4) return renderPartes("partesMecanicas", "Partes mecánicas y/o reparación mayor", "Captura las partes y la mano de obra considerada.");
    if (activeStep === 5) return renderSoftware();
    return renderFotos();
  };

  const goBack = () => setActiveStep((s) => Math.max(0, s - 1));
  const goNext = () => setActiveStep((s) => Math.min(STEPS.length - 1, s + 1));

  return (
    <View style={styles.container}>
      <Header title="Solicitud de cotización" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {loadingOrder ? (
          <View style={styles.loadingInline}>
            <ActivityIndicator color={UI.primary} />
            <Text style={styles.loadingInlineText}>Consultando datos disponibles de la orden…</Text>
          </View>
        ) : null}

        {renderStepper()}
        {renderCurrentStep()}

        <View style={styles.navigationRow}>
          <TouchableOpacity
            style={[styles.navSecondary, activeStep === 0 && styles.disabledBtn]}
            onPress={goBack}
            disabled={activeStep === 0}
          >
            <Ionicons name="chevron-back" size={18} color={activeStep === 0 ? UI.muted2 : UI.primary} />
            <Text style={[styles.navSecondaryText, activeStep === 0 && { color: UI.muted2 }]}>Anterior</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navPrimary, activeStep === STEPS.length - 1 && styles.disabledBtn]}
            onPress={goNext}
            disabled={activeStep === STEPS.length - 1}
          >
            <Text style={styles.navPrimaryText}>Siguiente</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomDraft} onPress={saveDraft}>
          <Ionicons name="save-outline" size={18} color={UI.primary} />
          <Text style={styles.bottomDraftText}>Borrador</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomPreview} onPress={generarPreviewPdf} disabled={generatingPdf}>
          {generatingPdf ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="eye-outline" size={18} color="#FFFFFF" /><Text style={styles.bottomPreviewText}>Vista previa</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomShare} onPress={compartirPdf} disabled={generatingPdf}>
          <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
          <Text style={styles.bottomShareText}>PDF</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showPreview} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowPreview(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>SOLICITUD DE COTIZACIÓN</Text>
                <Text style={styles.modalTitle}>Vista previa PDF</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={20} color={UI.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.webWrap}>
              {generatingPdf || !previewHtml ? (
                <View style={styles.previewLoading}>
                  <ActivityIndicator size="large" color={UI.primary} />
                  <Text style={styles.previewLoadingText}>Generando documento…</Text>
                </View>
              ) : (
                <WebView originWhitelist={["*"]} source={{ html: previewHtml }} style={styles.webview} />
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalFooterLight} onPress={() => setShowPreview(false)}>
                <Text style={styles.modalFooterLightText}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalFooterPrimary} onPress={compartirPdf}>
                <Ionicons name="share-outline" size={17} color="#FFFFFF" />
                <Text style={styles.modalFooterPrimaryText}>Compartir PDF</Text>
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
  content: { padding: 14, paddingBottom: 122 },
  loadingInline: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  loadingInlineText: { color: UI.muted, fontSize: 12, fontWeight: "600" },

  introCard: { backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 15, flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 10 },
  introEyebrow: { color: UI.primary, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  introTitle: { color: UI.text, fontSize: 20, fontWeight: "800", marginTop: 3 },
  introText: { color: UI.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  previewMini: { borderWidth: 1, borderColor: UI.borderDark, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  previewMiniText: { color: UI.primary, fontSize: 11, fontWeight: "800" },

  stepperCard: { backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 13, marginBottom: 10 },
  stepperTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepperEyebrow: { color: UI.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  stepperTitle: { color: UI.text, fontSize: 17, fontWeight: "800", marginTop: 2 },
  stepperPercent: { color: UI.muted, fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 4, borderRadius: 99, backgroundColor: "#EAECF0", overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", backgroundColor: UI.primary, borderRadius: 99 },
  stepTabs: { gap: 6, paddingTop: 10, paddingRight: 8 },
  stepTab: { borderWidth: 1, borderColor: UI.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: UI.soft },
  stepTabActive: { borderColor: "#B6CCEA", backgroundColor: UI.primarySoft },
  stepTabNumber: { width: 20, height: 20, borderRadius: 10, textAlign: "center", textAlignVertical: "center", color: UI.muted, backgroundColor: "#EAECF0", fontSize: 10, fontWeight: "800", lineHeight: 20 },
  stepTabNumberActive: { color: "#FFFFFF", backgroundColor: UI.primary },
  stepTabText: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  stepTabTextActive: { color: UI.primary },

  section: { backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 14, marginBottom: 10 },
  sectionHeading: { marginBottom: 12 },
  sectionTitle: { color: UI.text, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: UI.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  subheading: { color: UI.text, fontSize: 13, fontWeight: "800", marginTop: 4, marginBottom: 8 },

  inputBlock: { marginBottom: 11 },
  label: { color: UI.muted, fontSize: 10.5, fontWeight: "700", marginBottom: 5 },
  inputWrap: { minHeight: 44, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 11, backgroundColor: "#FFFFFF", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7 },
  inputWrapMultiline: { alignItems: "flex-start" },
  inputReadonly: { backgroundColor: UI.soft },
  input: { flex: 1, color: UI.text, fontSize: 13.5, paddingVertical: Platform.OS === "ios" ? 12 : 8 },
  textArea: { minHeight: 92, paddingTop: 11 },

  gridRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  gridCell: { flex: 1, minWidth: 125 },

  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { minHeight: 40, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#FFFFFF" },
  choiceActive: { borderColor: "#9DBAE0", backgroundColor: UI.primarySoft },
  choiceText: { color: UI.text, fontSize: 12, fontWeight: "700" },
  choiceTextActive: { color: UI.primary },
  radio: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: UI.borderDark, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: UI.primary },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: UI.primary },

  toggleRow: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: UI.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  toggleLabel: { color: UI.text, fontSize: 13, fontWeight: "700", flex: 1 },
  toggleRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  toggleValue: { color: UI.muted, fontSize: 11, fontWeight: "700" },

  dateButton: { minHeight: 44, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 11, paddingHorizontal: 11, backgroundColor: "#FFFFFF", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateButtonLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  dateText: { color: UI.text, fontSize: 13, fontWeight: "700" },

  itemCard: { backgroundColor: UI.soft, borderWidth: 1, borderColor: UI.border, borderRadius: 13, padding: 12, marginBottom: 10 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 },
  itemTitle: { color: UI.text, fontSize: 13.5, fontWeight: "800" },
  itemSubtitle: { color: UI.muted, fontSize: 10.5, marginTop: 2 },
  removeText: { color: UI.red, fontSize: 11, fontWeight: "800" },
  addBtn: { minHeight: 44, borderWidth: 1, borderStyle: "dashed", borderColor: "#9DBAE0", borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F8FBFF" },
  addBtnText: { color: UI.primary, fontSize: 12.5, fontWeight: "800" },

  noticeBox: { borderWidth: 1, borderColor: "#C7D7F0", backgroundColor: UI.primarySoft, borderRadius: 11, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 11 },
  noticeText: { color: UI.muted, fontSize: 11.5, lineHeight: 16, flex: 1 },
  photoCard: { borderWidth: 1, borderColor: UI.border, borderRadius: 13, padding: 12, backgroundColor: UI.soft, marginBottom: 10 },
  photoCardReady: { borderColor: "#ABEFC6", backgroundColor: UI.greenSoft },
  photoReadyText: { color: UI.green },
  photoActions: { flexDirection: "row", gap: 8 },
  outlineSmallBtn: { flex: 1, borderWidth: 1, borderColor: "#9DBAE0", borderRadius: 10, minHeight: 40, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: "#FFFFFF" },
  outlineSmallText: { color: UI.primary, fontSize: 11.5, fontWeight: "800" },

  navigationRow: { flexDirection: "row", gap: 9, marginTop: 2, marginBottom: 4 },
  navSecondary: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: "#9DBAE0", borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#FFFFFF" },
  navSecondaryText: { color: UI.primary, fontSize: 13, fontWeight: "800" },
  navPrimary: { flex: 1, minHeight: 46, borderRadius: 11, backgroundColor: UI.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  navPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  disabledBtn: { opacity: 0.4 },

  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(244,246,248,0.98)", borderTopWidth: 1, borderTopColor: UI.border, paddingHorizontal: 11, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 24 : 12, flexDirection: "row", gap: 7 },
  bottomDraft: { flex: 0.9, minHeight: 48, borderWidth: 1, borderColor: "#9DBAE0", borderRadius: 12, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  bottomDraftText: { color: UI.primary, fontSize: 12, fontWeight: "800" },
  bottomPreview: { flex: 1.25, minHeight: 48, borderRadius: 12, backgroundColor: UI.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  bottomPreviewText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  bottomShare: { flex: 0.7, minHeight: 48, borderRadius: 12, backgroundColor: UI.text, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  bottomShareText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(16,24,40,0.58)", padding: 10, justifyContent: "center" },
  modalCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden" },
  modalHeader: { minHeight: 62, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: UI.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalEyebrow: { color: UI.primary, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6 },
  modalTitle: { color: UI.text, fontSize: 17, fontWeight: "800", marginTop: 2 },
  modalClose: { width: 36, height: 36, borderRadius: 10, backgroundColor: UI.soft, alignItems: "center", justifyContent: "center" },
  webWrap: { flex: 1, backgroundColor: UI.soft, padding: 6 },
  webview: { flex: 1, backgroundColor: "#FFFFFF" },
  previewLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  previewLoadingText: { color: UI.muted, fontSize: 12, fontWeight: "700", marginTop: 9 },
  modalFooter: { padding: 10, borderTopWidth: 1, borderTopColor: UI.border, flexDirection: "row", gap: 8 },
  modalFooterLight: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: UI.borderDark, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  modalFooterLightText: { color: UI.text, fontSize: 12.5, fontWeight: "800" },
  modalFooterPrimary: { flex: 1, minHeight: 44, borderRadius: 11, backgroundColor: UI.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  modalFooterPrimaryText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
});