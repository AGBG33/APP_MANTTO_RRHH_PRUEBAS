// app/tecnico/ordenes/[orderid]/finalizar-mantto-elevadores.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import NetInfo from "@react-native-community/netinfo";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";

import { upsertSapQueueItem } from "../../../../src/offline/sapQueue";
import {
  setLocalStatusPatch,
  patchCacheOrdenesTecnicoList,
} from "../../../../src/offline/ordenesTecnicoLocalPatch";
import {
  loadOrdenTecnicoDetail,
  saveOrdenTecnicoDetail,
} from "../../../../src/offline/ordenesTecnicoCache";

import {
  BLOQUE_TOP,
  SUBCONJUNTOS,
} from "../../../../src/constants/manttoElevadoresChecklist";
import { buildPdfHtmlElevadores } from "../../../../src/services/templates/mantenimientoPdfElevadores";

// ⚠️ Ruta SAP
const ORDER_STATUS_URL = () => `/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet`;

const ORDER_START_KEY = (orderId) => `orderStart:${orderId}`;
const DRAFT_KEY = (orderId) => `manttoElevadoresDraft:${orderId}`;

// “marca en elevador 1”
const DEFAULT_ELEVADOR = 1;

function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtHHMM(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtDateDMY(ms) {
  return new Date(ms).toLocaleDateString();
}

// ✅ Folio “aleatorio fijo” (persistente por draft)
function makeFolio() {
  // ejemplo: FOL-8K2P4Q
  return `${Math.random().toString(36).toUpperCase().slice(2, 8)}`;
}

async function loadOrderStart(orderId) {
  try {
    const raw = await AsyncStorage.getItem(ORDER_START_KEY(orderId));
    const v = raw ? Number(raw) : null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function loadDraft(orderId) {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveDraft(orderId, data) {
  try {
    await AsyncStorage.setItem(DRAFT_KEY(orderId), JSON.stringify(data));
  } catch {}
}

async function clearDraft(orderId) {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY(orderId));
  } catch {}
}

// ✅ online check
async function isOnlineNow() {
  try {
    const net = await NetInfo.fetch();
    return !!(net?.isConnected && net?.isInternetReachable !== false);
  } catch {
    return false;
  }
}

// ✅ payload builder para estatus (soporta 1 activo + N inactivos)
function buildStatusPayload({ orderId, activate, deactivateList = [] }) {
  const uniqDeact = Array.from(
    new Set((deactivateList || []).map((x) => String(x).trim()).filter(Boolean))
  );

  return {
    OrderId: String(orderId),
    WorkOrderHeader: { Orderid: String(orderId) },
    WorkOrderUserStatusSet: [
      { UserStText: String(activate), Langu: "ES", Inactive: "" },
      ...uniqDeact.map((st) => ({
        UserStText: String(st),
        Langu: "ES",
        Inactive: "X",
      })),
    ],
    Return: [],
  };
}

// ✅ payload builder PDF (según tu contrato)
function buildPdfSapPayload({ orderId, pdfBase64 }) {
  return {
    WorkOrderHeader: { Orderid: String(orderId) },
    Attachments: [
      {
        DocId: String(orderId),
        FileName: "mantenimiento_elevadores.pdf",
        MimeType: "pdf",
        Base64: String(pdfBase64 || ""),
      },
    ],
  };
}

async function patchLocalEverywhere({ userEmail, orderId, estatus_code }) {
  // 1) patch map (para pintar en lista)
  await setLocalStatusPatch(userEmail, orderId, estatus_code);
  // 2) patch lista cacheada (para persistencia)
  await patchCacheOrdenesTecnicoList(userEmail, orderId, estatus_code);

  // 3) patch detalle cacheado (para que el detalle también refleje offline)
  try {
    const cached = await loadOrdenTecnicoDetail(orderId);
    if (cached?.data) {
      const newDetail = { ...cached.data, estatus_code: String(estatus_code) };
      await saveOrdenTecnicoDetail(orderId, newDetail);
    }
  } catch {}
}

// ==== Refacciones helpers ====
function makeRefRow() {
  return {
    cantidad: "",
    descripcion: "",
    codigo: "",
    conCargo: false,
  };
}

function normalizeRefacciones(refacciones = []) {
  // Solo para el PDF: máximo 4 y limpio
  return (Array.isArray(refacciones) ? refacciones : [])
    .map((r) => ({
      cantidad: String(r?.cantidad ?? "").trim(),
      descripcion: String(r?.descripcion ?? "").trim(),
      codigo: String(r?.codigo ?? "").trim(),
      conCargo: !!r?.conCargo,
    }))
    .filter((r) => r.cantidad || r.descripcion || r.codigo)
    .slice(0, 4);
}

export default function FinalizarManttoElevadores() {
  const { orderid } = useLocalSearchParams();
  const { token, user } = useAuth();

  const orderId = String(orderid || "").trim();
  const userEmail = String(user?.email || user?.mail || "unknown");

  // ✅ Firma en modal (Opción A)
  const signatureRef = useRef(null);
  const [firmaOpen, setFirmaOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Datos de cabecera (vienen por params desde DetalleOrden)
  const params = useLocalSearchParams();

  const cliente = String(params?.cliente ?? "");
  const tecnico = String(params?.tecnico_nombre ?? user?.nombre ?? user?.email ?? "");
  const niveles = params?.niveles ? String(params.niveles) : "";
  const pisos = params?.pisos ? Number(params.pisos) : 6;

  // Checklist state:
  const [topChecks, setTopChecks] = useState(() => {
    const o = {};
    BLOQUE_TOP.forEach((k) => (o[k] = false));
    return o;
  });
  const [subChecks, setSubChecks] = useState(() => {
    const o = {};
    SUBCONJUNTOS.forEach((g) => g.items.forEach((it) => (o[it] = false)));
    return o;
  });

  const [detalleTrabajo, setDetalleTrabajo] = useState("");
  const [avisoCliente, setAvisoCliente] = useState("");

  // ✅ Refacciones (SÍ van al PDF)
  const [usoRefacciones, setUsoRefacciones] = useState(false);
  const [refacciones, setRefacciones] = useState(() => [makeRefRow()]); // hasta 4

  // ✅ Folio fijo para el PDF (guardado en draft)
  const [folio, setFolio] = useState("");

  // Firma (SÍ va al PDF)
  const [firmaBase64, setFirmaBase64] = useState(null);
  const [nombreFirma, setNombreFirma] = useState("");
  const [cargoFirma, setCargoFirma] = useState("");

  // ✅ Datos extra cliente (NO van a PDF / NO se mandan)
  const [telefonoCliente, setTelefonoCliente] = useState("");
  const [correoCliente, setCorreoCliente] = useState("");
  const [comentariosCliente, setComentariosCliente] = useState("");

  // Horas
  const [startMs, setStartMs] = useState(null);

  // Para saber si esto es “continuar” (venía de estatus 0400)
  const modoPendienteFirma = String(params?.modo ?? "") === "pendiente_firma";

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // ✅ leemos ambos: orderStart y draft
        const s = await loadOrderStart(orderId);
        const draft = await loadDraft(orderId);

        // ✅ Prioridad: orderStart -> draft.startMs -> ahora
        const resolvedStart =
          (Number.isFinite(s) ? s : null) ??
          (Number.isFinite(draft?.startMs) ? draft.startMs : null) ??
          Date.now();

        setStartMs(resolvedStart);

        // ✅ si no existía orderStart, lo guardamos
        if (!Number.isFinite(s)) {
          try {
            await AsyncStorage.setItem(ORDER_START_KEY(orderId), String(resolvedStart));
          } catch {}
        }

        // ✅ folio fijo: draft.folio -> generar uno
        const resolvedFolio = String(draft?.folio || "").trim() || makeFolio();
        setFolio(resolvedFolio);

        // si no traía folio, lo persistimos para que ya quede fijo
        if (!draft?.folio) {
          try {
            await saveDraft(orderId, { ...(draft || {}), folio: resolvedFolio });
          } catch {}
        }

        // ✅ hidratar el resto del draft
        if (draft?.topChecks) setTopChecks(draft.topChecks);
        if (draft?.subChecks) setSubChecks(draft.subChecks);
        if (draft?.detalleTrabajo) setDetalleTrabajo(draft.detalleTrabajo);
        if (draft?.avisoCliente) setAvisoCliente(draft.avisoCliente);

        if (typeof draft?.usoRefacciones === "boolean") setUsoRefacciones(draft.usoRefacciones);
        if (Array.isArray(draft?.refacciones) && draft.refacciones.length) {
          setRefacciones(draft.refacciones.slice(0, 4));
        }

        if (draft?.nombreFirma) setNombreFirma(draft.nombreFirma);
        if (draft?.cargoFirma) setCargoFirma(draft.cargoFirma);
        if (draft?.firmaBase64) setFirmaBase64(draft.firmaBase64);

        if (draft?.telefonoCliente) setTelefonoCliente(draft.telefonoCliente);
        if (draft?.correoCliente) setCorreoCliente(draft.correoCliente);
        if (draft?.comentariosCliente) setComentariosCliente(draft.comentariosCliente);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const bloquesParaPdf = useMemo(() => {
    const tablaTop = {};
    BLOQUE_TOP.forEach((label) => {
      tablaTop[label] = topChecks[label] ? [DEFAULT_ELEVADOR] : [];
    });

    const subconjuntos = {};
    Object.keys(subChecks).forEach((item) => {
      subconjuntos[item] = subChecks[item] ? [DEFAULT_ELEVADOR] : [];
    });

    return { tablaTop, subconjuntos };
  }, [topChecks, subChecks]);

  const guardarBorrador = async () => {
    const draft = {
      topChecks,
      subChecks,
      detalleTrabajo,
      avisoCliente,

      usoRefacciones,
      refacciones: (refacciones || []).slice(0, 4),

      nombreFirma,
      cargoFirma,
      firmaBase64,

      // extras (NO PDF / NO SAP)
      telefonoCliente,
      correoCliente,
      comentariosCliente,

      // ✅ persistimos hora inicio y folio fijo
      startMs,
      folio,

      updatedAt: Date.now(),
    };
    await saveDraft(orderId, draft);
  };

  async function postToSap(payload) {
    return await api.post(ORDER_STATUS_URL(), payload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }

  // ✅ Ahora genera PDF + regresa { uri, pdfBase64 }
  const generarPdf = async (finishMs, firmaFinal) => {
    const refParaPdf = usoRefacciones ? normalizeRefacciones(refacciones) : [];

    const payload = {
      orderid: orderId,
      cliente,
      tecnico,
      fecha: fmtDateDMY(finishMs),
      hora_entrada: startMs ? fmtHHMM(startMs) : "",
      hora_salida: fmtHHMM(finishMs),
      pisos: Number.isFinite(pisos) ? pisos : 6,
      niveles: niveles ?? "",
      aviso_cliente: avisoCliente ?? "",
      detalle_trabajo: detalleTrabajo ?? "",
      refacciones: refParaPdf, // ✅ ahora SÍ llena la tabla del PDF
      bloques: bloquesParaPdf,
      firmaClienteBase64: firmaFinal || "",
      nombreClienteFirma: nombreFirma || "",
      cargoClienteFirma: cargoFirma || "",
      folio: folio || "", // ✅ folio aleatorio fijo
    };

    const html = await buildPdfHtmlElevadores(payload, {
      logoModule: require("../../../../assets/imgDocs/logo.png"),
      elevadorModule: require("../../../../assets/imgDocs/elevador.png"),
    });

    const { uri } = await Print.printToFileAsync({ html });

    // ✅ lee base64 para SAP (cola / online)
    let pdfBase64 = "";
    try {
      pdfBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (e) {
      console.warn("No se pudo leer PDF a base64:", e?.message || e);
      pdfBase64 = "";
    }

    // Compartir (como antes)
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Reporte de mantenimiento - Elevadores",
        });
      } else {
        Alert.alert("PDF generado", "El archivo se generó en el almacenamiento de la app.");
      }
    } catch (e) {
      console.warn("No se pudo compartir PDF (continuo):", e?.message || e);
    }

    return { uri, pdfBase64 };
  };

  const onGuardarPendienteFirma = async () => {
    if (!String(detalleTrabajo || "").trim()) {
      Alert.alert("Falta información", "Describe el trabajo realizado (Detalle de trabajo).");
      return;
    }

    Alert.alert(
      "Guardar como pendiente de firma",
      "Se guardará como borrador y la orden quedará en estatus 0400 (Pendiente de firma). ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, guardar",
          onPress: async () => {
            try {
              setSaving(true);
              await guardarBorrador();

              const payload0400 = buildStatusPayload({
                orderId,
                activate: "0400",
                deactivateList: ["0200"],
              });

              const online = await isOnlineNow();

              if (online) {
                try {
                  await postToSap(payload0400);
                  Alert.alert("Listo", "Guardado. Orden marcada como Pendiente de firma (0400).");
                  router.replace("/tecnico/ordenes");
                  return;
                } catch (e) {
                  console.warn(
                    "No se pudo postear 0400 online, encolo:",
                    e?.response?.data || e?.message || e
                  );
                }
              }

              // OFFLINE (o falló online): encolar + patch local
              await upsertSapQueueItem({
                type: "STATUS",
                orderId,
                endpoint: ORDER_STATUS_URL(),
                payload: payload0400,
              });

              await patchLocalEverywhere({
                userEmail,
                orderId,
                estatus_code: "0400",
              });

              Alert.alert(
                "Listo (offline)",
                "Se guardó como pendiente de firma (0400). Se enviará a SAP cuando regrese internet."
              );

              router.replace("/tecnico/ordenes");
            } catch (e) {
              console.error("Error guardar pendiente firma:", e?.response?.data || e);
              Alert.alert("Error", "No se pudo guardar. Revisa logs.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const onFinalizarConFirma = async () => {
    if (!String(detalleTrabajo || "").trim()) {
      Alert.alert("Falta información", "Describe el trabajo realizado (Detalle de trabajo).");
      return;
    }
    if (!firmaBase64) {
      Alert.alert("Falta firma", "El cliente debe firmar para finalizar completamente (0300).");
      return;
    }

    Alert.alert(
      "Finalizar orden",
      "Esto generará el PDF, guardará la información y cambiará el estatus en SAP a 0300 (Finalizada). ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, finalizar",
          onPress: async () => {
            const finishMs = Date.now();

            try {
              setSaving(true);

              await guardarBorrador();

              const { pdfBase64 } = await generarPdf(finishMs, firmaBase64);
              const pdfPayload = buildPdfSapPayload({ orderId, pdfBase64 });

              // ✅ 0300: si venía de 0400, desactiva 0200 y 0400
              const statusPayload = buildStatusPayload({
                orderId,
                activate: "0300",
                deactivateList: modoPendienteFirma ? ["0200", "0400"] : ["0200"],
              });

              const online = await isOnlineNow();

              if (online) {
                try {
                  // recomendado: PDF primero, luego STATUS
                  await postToSap(pdfPayload);
                  await postToSap(statusPayload);

                  // en online sí limpiamos draft
                  await clearDraft(orderId);

                  Alert.alert("Listo", "Orden finalizada (0300) y PDF generado.");
                  router.replace("/tecnico/ordenes");
                  return;
                } catch (e) {
                  console.warn(
                    "Falló finalizar online, encolo:",
                    e?.response?.data || e?.message || e
                  );
                }
              }

              // OFFLINE (o falló online): encolar PDF + STATUS + patch local
              await upsertSapQueueItem({
                type: "PDF",
                orderId,
                endpoint: ORDER_STATUS_URL(),
                payload: pdfPayload,
              });

              await upsertSapQueueItem({
                type: "STATUS",
                orderId,
               endpoint: ORDER_STATUS_URL(),
                payload: statusPayload,
              });

              await patchLocalEverywhere({
                userEmail,
                orderId,
                estatus_code: "0300",
              });

              Alert.alert(
                "Listo (offline)",
                "Se generó el PDF y la orden se marcó como finalizada (0300) localmente. Se enviará a SAP cuando regrese internet."
              );

              router.replace("/tecnico/ordenes");
            } catch (e) {
              console.error("Error finalizar:", e?.response?.data || e);
              Alert.alert("Error", "No se pudo finalizar / generar PDF / encolar.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const toggleTop = (k) => setTopChecks((p) => ({ ...p, [k]: !p[k] }));
  const toggleSub = (k) => setSubChecks((p) => ({ ...p, [k]: !p[k] }));

  // ==== Refacciones UI actions ====
  const setRefField = (idx, key, val) => {
    setRefacciones((prev) => {
      const next = [...prev];
      const row = { ...(next[idx] || makeRefRow()) };
      row[key] = val;
      next[idx] = row;
      return next.slice(0, 4);
    });
  };

  const addRefRow = () => {
    setRefacciones((prev) => {
      const p = Array.isArray(prev) ? prev : [];
      if (p.length >= 4) return p;
      return [...p, makeRefRow()];
    });
  };

  const removeRefRow = (idx) => {
    setRefacciones((prev) => {
      const p = Array.isArray(prev) ? prev : [];
      const next = p.filter((_, i) => i !== idx);
      return next.length ? next : [makeRefRow()];
    });
  };

  const markUsoRefacciones = (val) => {
    setUsoRefacciones(val);
    if (!val) {
      // si dice que NO, limpiamos (para que el PDF vaya vacío)
      setRefacciones([makeRefRow()]);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={`Finalizar ${orderId}`} />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Cargando formulario…</Text>
        </View>
      </View>
    );
  }

  const refCountFilled = normalizeRefacciones(refacciones).length;

  return (
    <View style={styles.container}>
      <Header title={`Finalizar ${orderId}`} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Datos</Text>
          <Text style={styles.line}>
            <Text style={styles.bold}>Cliente:</Text> {cliente || "—"}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.bold}>Técnico:</Text> {tecnico || "—"}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.bold}>Hora entrada:</Text> {startMs ? fmtHHMM(startMs) : "—"}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.bold}>Hora salida:</Text> (se registra al finalizar)
          </Text>
          <Text style={styles.hint}>
            Marcado por defecto en elevador #{DEFAULT_ELEVADOR} (columna 1 del formato).
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Checklist</Text>
          {BLOQUE_TOP.map((k) => (
            <TouchableOpacity
              key={k}
              style={styles.row}
              onPress={() => toggleTop(k)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={topChecks[k] ? "checkbox" : "square-outline"}
                size={20}
                color={topChecks[k] ? "#0A6ED1" : "#111827"}
              />
              <Text style={styles.rowText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {SUBCONJUNTOS.map((g) => (
          <View key={g.titulo} style={styles.card}>
            <Text style={styles.title}>{g.titulo}</Text>
            {g.items.map((it) => (
              <TouchableOpacity
                key={it}
                style={styles.row}
                onPress={() => toggleSub(it)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={subChecks[it] ? "checkbox" : "square-outline"}
                  size={20}
                  color={subChecks[it] ? "#0A6ED1" : "#111827"}
                />
                <Text style={styles.rowText}>{it}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.title}>Detalle de trabajo (obligatorio)</Text>
          <TextInput
            value={detalleTrabajo}
            onChangeText={setDetalleTrabajo}
            placeholder="Describe el trabajo realizado…"
            multiline
            style={styles.textarea}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Aviso al cliente</Text>
          <TextInput
            value={avisoCliente}
            onChangeText={setAvisoCliente}
            placeholder="Opcional…"
            multiline
            style={styles.textarea}
          />
        </View>

        {/* ✅ Refacciones (ESTO SÍ VA AL PDF) */}
        <View style={styles.card}>
          <Text style={styles.title}>Refacciones utilizadas</Text>

          <Text style={styles.label}>¿Se consumieron refacciones?</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceBtn, usoRefacciones && styles.choiceBtnActive]}
              onPress={() => markUsoRefacciones(true)}
              activeOpacity={0.9}
            >
              <Ionicons
                name={usoRefacciones ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={usoRefacciones ? "#fff" : "#111827"}
              />
              <Text style={[styles.choiceText, usoRefacciones && styles.choiceTextActive]}>Sí</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceBtn, !usoRefacciones && styles.choiceBtnActive]}
              onPress={() => markUsoRefacciones(false)}
              activeOpacity={0.9}
            >
              <Ionicons
                name={!usoRefacciones ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={!usoRefacciones ? "#fff" : "#111827"}
              />
              <Text style={[styles.choiceText, !usoRefacciones && styles.choiceTextActive]}>No</Text>
            </TouchableOpacity>
          </View>

          {usoRefacciones ? (
            <>
              <Text style={styles.hint}>Llenar “Con cargo” si aplica.</Text>

              {refacciones.slice(0, 4).map((r, idx) => (
                <View key={idx} style={styles.refCard}>
                  <View style={styles.refHeader}>
                    <Text style={styles.refTitle}>Refacción #{idx + 1}</Text>

                    {refacciones.length > 1 && (
                      <TouchableOpacity
                        style={styles.refDelete}
                        onPress={() => removeRefRow(idx)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="trash-outline" size={16} color="#111827" />
                        <Text style={styles.refDeleteText}>Quitar</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.label}>Cantidad</Text>
                  <TextInput
                    value={String(r?.cantidad ?? "")}
                    onChangeText={(v) => setRefField(idx, "cantidad", v)}
                    keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
                    placeholder="Ej. 1"
                    style={styles.input}
                  />

                  <Text style={styles.label}>Descripción</Text>
                  <TextInput
                    value={String(r?.descripcion ?? "")}
                    onChangeText={(v) => setRefField(idx, "descripcion", v)}
                    placeholder="Ej. Fusible / Botonera / Sensor…"
                    style={styles.input}
                  />

                  <Text style={styles.label}>Código interno</Text>
                  <TextInput
                    value={String(r?.codigo ?? "")}
                    onChangeText={(v) => setRefField(idx, "codigo", v)}
                    placeholder="Opcional…"
                    style={styles.input}
                  />

                  <Text style={styles.label}>Con cargo al cliente</Text>
                  <View style={styles.choiceRow}>
                    <TouchableOpacity
                      style={[styles.choiceBtnSmall, r?.conCargo && styles.choiceBtnActive]}
                      onPress={() => setRefField(idx, "conCargo", true)}
                      activeOpacity={0.9}
                    >
                      <Text style={[styles.choiceText, r?.conCargo && styles.choiceTextActive]}>Sí</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.choiceBtnSmall, !r?.conCargo && styles.choiceBtnActive]}
                      onPress={() => setRefField(idx, "conCargo", false)}
                      activeOpacity={0.9}
                    >
                      <Text style={[styles.choiceText, !r?.conCargo && styles.choiceTextActive]}>No</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {refacciones.length < 4 && (
                <TouchableOpacity style={styles.btnGhost} onPress={addRefRow} activeOpacity={0.9}>
                  <Ionicons name="add-circle-outline" size={18} />
                  <Text style={styles.btnGhostText}>Agregar otra refacción</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.hint}>
                Renglones llenos para PDF: <Text style={styles.bold}>{refCountFilled}</Text>
              </Text>
            </>
          ) : (
            <Text style={styles.hint}>
              Si seleccionas “No”, la tabla de refacciones saldrá vacía en el PDF.
            </Text>
          )}
        </View>

        {/* ✅ Datos del cliente (no PDF / no SAP) */}
        <View style={styles.card}>
          <Text style={styles.title}>Datos del cliente</Text>

          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            value={telefonoCliente}
            onChangeText={setTelefonoCliente}
            placeholder="Opcional…"
            keyboardType="phone-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Correo</Text>
          <TextInput
            value={correoCliente}
            onChangeText={setCorreoCliente}
            placeholder="Opcional…"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />

          <Text style={styles.label}>Comentarios del cliente</Text>
          <TextInput
            value={comentariosCliente}
            onChangeText={setComentariosCliente}
            placeholder="Opcional…"
            multiline
            style={styles.textarea}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Firma del cliente</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput value={nombreFirma} onChangeText={setNombreFirma} style={styles.input} />

          <Text style={styles.label}>Cargo</Text>
          <TextInput value={cargoFirma} onChangeText={setCargoFirma} style={styles.input} />

          <TouchableOpacity
            style={[styles.btnSecondary, { marginTop: 10 }]}
            onPress={() => setFirmaOpen(true)}
            activeOpacity={0.9}
          >
            <Ionicons name="pencil-outline" size={18} color="#111827" />
            <Text style={styles.btnSecondaryText}>{firmaBase64 ? "Editar firma" : "Firmar"}</Text>
          </TouchableOpacity>

          {!!firmaBase64 && (
            <TouchableOpacity
              style={[styles.btnGhost, { marginTop: 10 }]}
              onPress={() => {
                Alert.alert("Quitar firma", "¿Quieres borrar la firma capturada?", [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Borrar", style: "destructive", onPress: () => setFirmaBase64(null) },
                ]);
              }}
              activeOpacity={0.9}
            >
              <Ionicons name="trash-outline" size={18} />
              <Text style={styles.btnGhostText}>Quitar firma</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.hint}>Si NO hay firma, guarda como “Pendiente de firma”.</Text>
        </View>

        <View style={{ height: 18 }} />

        <TouchableOpacity
          style={[styles.btnSecondary, saving && { opacity: 0.7 }]}
          disabled={saving}
          onPress={onGuardarPendienteFirma}
        >
          <Ionicons name="save-outline" size={18} color="#111827" />
          <Text style={styles.btnSecondaryText}>Guardar pendiente de firma</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnPrimary, saving && { opacity: 0.7 }]}
          disabled={saving}
          onPress={onFinalizarConFirma}
        >
          <Ionicons name="flag-outline" size={18} color="#fff" />
          <Text style={styles.btnPrimaryText}>Finalizar con firma + Generar PDF</Text>
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ✅ Modal Firma (COMPACTO) */}
      <Modal
        visible={firmaOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFirmaOpen(false)}
      >
        {/* backdrop */}
        <Pressable style={styles.modalBackdrop} onPress={() => setFirmaOpen(false)} />

        {/* sheet */}
        <View style={styles.modalSheet}>
          <View style={styles.signModalHeader}>
            <Pressable onPress={() => setFirmaOpen(false)}>
              <Text style={styles.signModalLink}>Cerrar</Text>
            </Pressable>

            <View style={{ alignItems: "center" }}>
              <Text style={styles.signModalTitle}>Firma del cliente</Text>
              <Text style={styles.signModalSubtitle}>Firma dentro del recuadro</Text>
            </View>

            <Text style={[styles.signModalLink, { opacity: 0 }]}>Cerrar</Text>
          </View>

          <View style={styles.signInstructions}>
            <Text style={styles.signInstructionText}>1) Firma con el dedo ✍️</Text>
            <Text style={styles.signInstructionText}>2) Si te equivocas, presiona “Limpiar”</Text>
            <Text style={styles.signInstructionText}>3) Presiona “Guardar firma” para continuar ✅</Text>
          </View>

          {/* ✅ Alto controlado del canvas */}
          <View style={styles.signatureBox}>
            <Signature
              ref={signatureRef}
              onOK={(sig) => {
                setFirmaBase64(sig);
                setFirmaOpen(false);
              }}
              onEmpty={() => Alert.alert("Aviso", "Firma vacía. Firma dentro del recuadro.")}
              descriptionText=""
              clearText=""
              confirmText=""
              webStyle={`
                html, body { height: 100%; margin:0; padding:0; overflow:hidden; background:#fff; }
                .m-signature-pad { box-shadow:none; border:none; height:100%; }
                .m-signature-pad--body { border: 2px dashed #0A6ED1; border-radius: 12px; }
                .m-signature-pad--footer { display:none; }
              `}
              webViewProps={{
                androidLayerType: "software",
                overScrollMode: "never",
                nestedScrollEnabled: false,
              }}
            />

            {/* ✅ Botones nativos SIEMPRE visibles */}
            <View style={styles.sigActionsRow}>
              <TouchableOpacity
                style={styles.sigBtnGhost}
                onPress={() => {
                  signatureRef.current?.clearSignature?.();
                  setFirmaBase64(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.sigBtnGhostText}>Limpiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sigBtnPrimary}
                onPress={() => {
                  signatureRef.current?.readSignature?.();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.sigBtnPrimaryText}>Guardar firma</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.signFooterHelp}>
            <Text style={styles.signFooterHelpText}>
              Tip: Firma lo más centrado posible para que se vea bien en el PDF.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F7" },
  content: { padding: 16, paddingBottom: 30 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { marginTop: 10, color: "#63718B", fontWeight: "700" },

  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  title: { fontSize: 14, fontWeight: "900", color: "#0B1F3B", marginBottom: 8 },
  line: { color: "#111827", marginBottom: 4 },
  bold: { fontWeight: "900" },
  hint: { marginTop: 8, color: "#63718B", fontSize: 12, fontWeight: "700" },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowText: { flex: 1, color: "#111827", fontWeight: "700" },

  label: { marginTop: 6, marginBottom: 6, color: "#63718B", fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    backgroundColor: "#fff",
  },
  textarea: {
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    backgroundColor: "#fff",
    textAlignVertical: "top",
  },

  btnPrimary: {
    marginTop: 10,
    backgroundColor: "#0A6ED1",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900" },

  btnSecondary: {
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  btnSecondaryText: { color: "#111827", fontWeight: "900" },

  btnGhost: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#fff",
    marginTop: 10,
  },
  btnGhostText: { fontWeight: "800", color: "#111827" },

  // ===== Refacciones UI =====
  choiceRow: { flexDirection: "row", gap: 10 },
  choiceBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  choiceBtnSmall: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBtnActive: { backgroundColor: "#0A6ED1", borderColor: "#0A6ED1" },
  choiceText: { fontWeight: "900", color: "#111827" },
  choiceTextActive: { color: "#fff" },

  refCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E6EEF9",
    backgroundColor: "#FBFDFF",
    borderRadius: 12,
    padding: 12,
  },
  refHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refTitle: { fontWeight: "900", color: "#0B1F3B" },
  refDelete: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  refDeleteText: { fontWeight: "900", color: "#111827" },

  // ===== Modal Firma =====
  signModalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  signModalTitle: { fontWeight: "900", fontSize: 16, color: "#111827" },
  signModalSubtitle: { marginTop: 2, fontSize: 12, color: "#6b7280", fontWeight: "700" },
  signModalLink: { color: "#0A6ED1", fontWeight: "900", fontSize: 14 },

  signInstructions: {
    padding: 12,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  signInstructionText: { fontSize: 12, color: "#374151", fontWeight: "700", marginBottom: 4 },

  signFooterHelp: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  signFooterHelpText: { fontSize: 12, color: "#31394a", textAlign: "center", fontWeight: "700" },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  modalSheet: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 80,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  signatureBox: {
    height: 320,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#fff",
  },

  sigActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  sigBtnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  sigBtnGhostText: { fontWeight: "900", color: "#111827" },

  sigBtnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#0A6ED1",
  },
  sigBtnPrimaryText: { fontWeight: "900", color: "#fff" },
});
