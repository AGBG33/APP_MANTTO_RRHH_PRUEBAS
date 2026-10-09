// app/supervisor/no_mantenimiento/detalles.js
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import Signature from "react-native-signature-canvas";

import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

import { buildCartaNoMantenimientoHtml } from "../../../src/services/templates/noMantenimientoPdfTemplate";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  success: "#16A34A",
  warning: "#B45309",
  disabled: "#B7C2CF",
};

const ESTATUS_CARTA_NO_MANTTO = "0600";
const ESTATUS_CARTA_NO_MANTTO_LABEL = "Carta No Mantto";

const safeStr = (v) => (v == null ? "" : String(v));
const pad2 = (n) => String(n).padStart(2, "0");

const parseSapDate = (v) => {
  if (!v) return null;

  const m = String(v).match(/\/Date\((\-?\d+)\)\//);
  if (!m) return null;

  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;

  return new Date(ms);
};

const formatDateOnly = (d) => {
  if (!(d instanceof Date)) return "—";

  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatDateTime = (d) => {
  if (!(d instanceof Date)) return "—";

  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
};

function normalizeCode(code) {
  const s = safeStr(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function extractStatusCodes(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return [];

  const matches = s.match(/\d{1,4}/g) || [];

  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));

  return Array.from(new Set(codes));
}

function isCartaNoMantto(userstatusRaw, estatusCodeRaw) {
  const codes = extractStatusCodes(userstatusRaw);
  const apiCode = normalizeCode(estatusCodeRaw);

  return (
    codes.includes(ESTATUS_CARTA_NO_MANTTO) ||
    apiCode === ESTATUS_CARTA_NO_MANTTO
  );
}

// Estos códigos ahora son solo CAUSAS para el PDF.
// Ya no son estatus de la orden.
const isCausaNoManttoCode = (code) => {
  const s = String(code || "").trim();
  if (!/^\d{4}$/.test(s)) return false;

  const n = Number(s);

  return n >= 1 && n <= 17;
};

// SAP RESCHEDULE pide YYYYMMDD.
const toYYYYMMDD = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${y}${m}${day}`;
};

const cleanText = (v) => String(v || "").trim();

const joinUnique = (items = []) => {
  const seen = new Set();

  return items
    .map((x) => cleanText(x))
    .filter(Boolean)
    .filter((x) => {
      const key = x.toUpperCase();

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .join(", ");
};

function mapDireccionSap(addr) {
  if (!addr) {
    return {
      razonSocial: "",
      direccion: "",
      telefono: "",
      rawAddress: null,
    };
  }

  const razonSocial = joinUnique([
    addr?.Name1,
    addr?.Name2,
    addr?.Name3,
    addr?.Name4,
  ]);

  const calleNumero = joinUnique([
    [addr?.Street, addr?.HouseNum1].filter(Boolean).join(" "),
    addr?.HouseNum2,
    addr?.HouseNum3,
  ]);

  const direccion = joinUnique([
    calleNumero,
    addr?.StrSuppl1,
    addr?.StrSuppl2,
    addr?.StrSuppl3,
    addr?.Location,
    addr?.City2,
    addr?.City1,
    addr?.Region,
    addr?.PostCode1,
    addr?.Country,
  ]);

  return {
    razonSocial,
    direccion,
    telefono: cleanText(addr?.TelNumber),
    rawAddress: addr,
  };
}

// ====== ODATA PATHS ======
const WORKORDER_DETAIL_PATH =
  "/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet";

const STATUS_CATALOGO_PATH =
  "/api/odata/ZSD_CATALOGOS_SRV/StatusWorkOrderSet";

const CHANGE_STATUS_PATH =
  "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet";

const RESCHEDULE_PATH =
  "/api/odata/ZCS_RESCHEDULE_WORKORDER_SRV/WorkOrderHeaderSet";

/* ===================== HELPERS SAP RETURNS ===================== */
const pickSapReturns = (sapData) => {
  const arr =
    sapData?.ReturnSet?.results ||
    sapData?.Return?.results ||
    sapData?.ReturnSet ||
    sapData?.Return ||
    [];

  return Array.isArray(arr) ? arr : [];
};

const normalizeSapMsg = (r) => {
  const type = String(r?.Type || r?.type || "").toUpperCase();

  const msg =
    String(r?.Message || r?.message || r?.Text || r?.text || "").trim() ||
    JSON.stringify(r);

  return { type, msg };
};

const summarizeSapMessages = (returns) => {
  const msgs = (Array.isArray(returns) ? returns : []).map(normalizeSapMsg);

  const errors = msgs.filter((m) => m.type === "E" || m.type === "A");
  const warns = msgs.filter((m) => m.type === "W");
  const success = msgs.filter((m) => m.type === "S");
  const info = msgs.filter((m) => m.type === "I");

  return { msgs, errors, warns, success, info };
};

const isFatalSapReturn = (returns) => {
  const { errors, success } = summarizeSapMessages(returns);
  return errors.length > 0 && success.length === 0;
};

const formatSapMessages = (returns, max = 4) => {
  const { msgs } = summarizeSapMessages(returns);

  return msgs
    .slice(0, max)
    .map((m) => `• [${m.type || "-"}] ${m.msg}`)
    .join("\n");
};

function logPayloadSinBase64(label, payload) {
  try {
    const cloned = JSON.parse(JSON.stringify(payload));

    if (Array.isArray(cloned?.Attachments)) {
      cloned.Attachments = cloned.Attachments.map((a) => ({
        ...a,
        Base64: `<<base64 omitted: ${String(a?.Base64 || "").length} chars>>`,
      }));
    }

    console.log("========================================");
    console.log(label);
    console.log(JSON.stringify(cloned, null, 2));
    console.log("========================================");
  } catch {
    console.log(label, payload);
  }
}

export default function DetallesNoMantenimiento() {
  const params = useLocalSearchParams();
  const id = safeStr(params?.id).trim();

  const { user } = useAuth();

  const correo = useMemo(() => {
    return safeStr(
      user?.email || user?.correo || user?.upn || user?.username,
    ).trim();
  }, [user]);

  const nombreUsuario = useMemo(() => {
    return safeStr(user?.nombre || user?.name || correo).trim();
  }, [user, correo]);

  const signatureRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState(null);

  const [datosDireccion, setDatosDireccion] = useState({
    razonSocial: "",
    direccion: "",
    telefono: "",
    rawAddress: null,
  });

  // Causas 0001–0011. Ya no se mandan como status.
  const [modal, setModal] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [statusOptions, setStatusOptions] = useState([]);
  const [q, setQ] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(null);

  // Causa elegida, pero NO enviada a SAP.
  const [causaConfirmada, setCausaConfirmada] = useState(false);

  // Reprogramación solo se habilita tras PDF adjuntado.
  const [pdfEnviado, setPdfEnviado] = useState(false);

  // PDF local para ver / descargar / compartir
  const [pdfLocalUri, setPdfLocalUri] = useState("");
  const [pdfFileName, setPdfFileName] = useState("");

  const [descripcionConcreta, setDescripcionConcreta] = useState("");
  const [mesAfecto, setMesAfecto] = useState("");

  const [firmaModal, setFirmaModal] = useState(false);
  const [firmaBase64Png, setFirmaBase64Png] = useState("");
  const [firmaDibujada, setFirmaDibujada] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const [sendingPdf, setSendingPdf] = useState(false);

  const [savingReprog, setSavingReprog] = useState(false);
  const [motivoReprog, setMotivoReprog] = useState("");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [fecha, setFecha] = useState(new Date());
  const [hora, setHora] = useState(new Date());

  const fechaHora = useMemo(() => {
    const d = new Date(fecha);
    d.setHours(hora.getHours());
    d.setMinutes(hora.getMinutes());
    d.setSeconds(0);
    d.setMilliseconds(0);

    return d;
  }, [fecha, hora]);

  const currentUserstatus = safeStr(wo?.Userstatus || wo?.UserStatus || "");
  const currentEstatusCode = safeStr(
    wo?.estatus_code || wo?.EstatusCode || wo?.StatusCode || wo?.Status || "",
  );

  const is0600 = useMemo(() => {
    return isCartaNoMantto(currentUserstatus, currentEstatusCode);
  }, [currentUserstatus, currentEstatusCode]);

  const fetchDireccionesOrden = useCallback(async () => {
    if (!id) {
      return {
        razonSocial: "",
        direccion: "",
        telefono: "",
        rawAddress: null,
      };
    }

    try {
      const url = `${WORKORDER_DETAIL_PATH}('${encodeURIComponent(
        id,
      )}')/ToAddresses`;

      console.log(
        "[CARTA_NO_MANTTO][DIRECCION] ODATA URL =>",
        `${api.defaults.baseURL}${url}`,
      );

      const { data } = await api.get(url, {
        params: {
          $format: "json",
        },
      });

      const results = Array.isArray(data?.d?.results) ? data.d.results : [];

      const selectedAddress =
        results.length >= 2 ? results[1] : results.length === 1 ? results[0] : null;

      const mapped = mapDireccionSap(selectedAddress);

      console.log("[CARTA_NO_MANTTO][DIRECCION] mapped =>", mapped);

      setDatosDireccion(mapped);

      return mapped;
    } catch (e) {
      console.log(
        "[CARTA_NO_MANTTO][DIRECCION] No se pudo cargar ToAddresses:",
        e?.response?.data || e?.message || e,
      );

      const fallback = {
        razonSocial: safeStr(
          wo?.PartnerName || wo?.Name1 || wo?.RazonSocial || "",
        ).trim(),
        direccion: safeStr(
          wo?.PartnerAddress || wo?.Stras || wo?.Ort01 || wo?.Direccion || "",
        ).trim(),
        telefono: "",
        rawAddress: null,
      };

      setDatosDireccion(fallback);

      return fallback;
    }
  }, [id, wo]);

  // ========= DETALLE =========
  const fetchDetalle = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const url = `${WORKORDER_DETAIL_PATH}('${encodeURIComponent(id)}')`;

      console.log(
        "[CARTA_NO_MANTTO DETALLE] ODATA URL =>",
        `${api.defaults.baseURL}${url}`,
      );

      const { data } = await api.get(url, {
        params: {
          $format: "json",
        },
      });

      const d = data?.d || null;
      setWo(d);

      setPdfEnviado(false);
      setCausaConfirmada(false);
      setPdfLocalUri("");
      setPdfFileName("");

      const sd = parseSapDate(d?.StartDate);

      if (sd && !mesAfecto) {
        const months = [
          "Enero",
          "Febrero",
          "Marzo",
          "Abril",
          "Mayo",
          "Junio",
          "Julio",
          "Agosto",
          "Septiembre",
          "Octubre",
          "Noviembre",
          "Diciembre",
        ];

        setMesAfecto(months[sd.getMonth()]);
      }

      try {
        const urlDir = `${WORKORDER_DETAIL_PATH}('${encodeURIComponent(
          id,
        )}')/ToAddresses`;

        const { data: dataDir } = await api.get(urlDir, {
          params: {
            $format: "json",
          },
        });

        const results = Array.isArray(dataDir?.d?.results)
          ? dataDir.d.results
          : [];

        const selectedAddress =
          results.length >= 2
            ? results[1]
            : results.length === 1
              ? results[0]
              : null;

        setDatosDireccion(mapDireccionSap(selectedAddress));
      } catch (dirErr) {
        console.log(
          "[CARTA_NO_MANTTO DETALLE] No se pudo cargar dirección:",
          dirErr?.response?.data || dirErr?.message || dirErr,
        );

        setDatosDireccion({
          razonSocial: safeStr(
            d?.PartnerName || d?.Name1 || d?.RazonSocial || "",
          ).trim(),
          direccion: safeStr(
            d?.PartnerAddress || d?.Stras || d?.Ort01 || d?.Direccion || "",
          ).trim(),
          telefono: "",
          rawAddress: null,
        });
      }
    } catch (e) {
      console.error(
        "Error detalle Carta No Mantto:",
        e?.response?.data || e?.message,
      );

      setWo(null);

      Alert.alert("Error", "No se pudo cargar el detalle de la orden.");
    } finally {
      setLoading(false);
    }
  }, [id, mesAfecto]);

  // ========= CATÁLOGO CAUSAS =========
  const fetchStatusOptions = useCallback(async () => {
    try {
      setLoadingStatus(true);

      const { data } = await api.get(STATUS_CATALOGO_PATH, {
        params: {
          $filter: "Stsma eq 'CS000001'",
          $format: "json",
        },
      });

      const results = Array.isArray(data?.d?.results) ? data.d.results : [];

      const mapped = results
        .map((r) => ({
          code: String(r?.Status1 || "").trim(),
          text: String(r?.Status2 || "").trim(),
          estat: String(r?.Estat || "").trim(),
          stsma: String(r?.Stsma || "").trim(),
        }))
        .filter((x) => isCausaNoManttoCode(x.code))
        .sort((a, b) => Number(a.code) - Number(b.code));

      setStatusOptions(mapped);
    } catch (e) {
      console.error(
        "Error catálogo causas no mantenimiento:",
        e?.response?.data || e?.message,
      );

      setStatusOptions([]);

      Alert.alert("Error", "No se pudo cargar el catálogo de causas.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchDetalle();
  }, [fetchDetalle]);

  const filteredOptions = useMemo(() => {
    const s = q.trim().toLowerCase();

    if (!s) return statusOptions;

    return statusOptions.filter((o) =>
      `${o.code} ${o.text}`.toLowerCase().includes(s),
    );
  }, [q, statusOptions]);

  const openModal = async () => {
    setQ("");
    setModal(true);
    await fetchStatusOptions();
  };

  /**
   * Antes esto mandaba el código 0001–0011 a SAP como status.
   * Nueva lógica:
   * - Solo confirma la causa localmente.
   * - Abre firma/PDF.
   * - NO actualiza SAP.
   */
  const continuarConCausa = async () => {
    if (!selectedStatus?.code) {
      Alert.alert("Falta selección", "Selecciona una causa.");
      return;
    }

    try {
      setSavingStatus(true);

      setModal(false);
      setCausaConfirmada(true);
      setPdfEnviado(false);
      setPdfLocalUri("");
      setPdfFileName("");

      setDescripcionConcreta("");
      setFirmaBase64Png("");
      setFirmaDibujada(false);

      try {
        signatureRef.current?.clearSignature?.();
      } catch {}

      setFirmaModal(true);
    } finally {
      setSavingStatus(false);
    }
  };

  const compartirPdfGenerado = async () => {
    if (!pdfLocalUri) {
      Alert.alert("PDF no disponible", "Primero genera y envía el PDF.");
      return;
    }

    const existe = await FileSystem.getInfoAsync(pdfLocalUri);

    if (!existe?.exists) {
      Alert.alert(
        "PDF no encontrado",
        "El archivo local ya no está disponible. Genera el PDF nuevamente.",
      );
      return;
    }

    const disponible = await Sharing.isAvailableAsync();

    if (!disponible) {
      Alert.alert(
        "No disponible",
        "Tu dispositivo no permite compartir archivos desde esta app.",
      );
      return;
    }

    await Sharing.shareAsync(pdfLocalUri, {
      mimeType: "application/pdf",
      dialogTitle: "Compartir Carta No Mantto",
      UTI: "com.adobe.pdf",
    });
  };

  const verPdfGenerado = async () => {
    if (!pdfLocalUri) {
      Alert.alert("PDF no disponible", "Primero genera y envía el PDF.");
      return;
    }

    const existe = await FileSystem.getInfoAsync(pdfLocalUri);

    if (!existe?.exists) {
      Alert.alert(
        "PDF no encontrado",
        "El archivo local ya no está disponible. Genera el PDF nuevamente.",
      );
      return;
    }

    const disponible = await Sharing.isAvailableAsync();

    if (!disponible) {
      Alert.alert(
        "No disponible",
        "No se pudo abrir el visor de archivos en este dispositivo.",
      );
      return;
    }

    await Sharing.shareAsync(pdfLocalUri, {
      mimeType: "application/pdf",
      dialogTitle: "Ver Carta No Mantto",
      UTI: "com.adobe.pdf",
    });
  };

  // ========= Generar + enviar PDF =========
  const generarYEnviarPdf = useCallback(async () => {
    if (!wo) {
      return Alert.alert("Sin datos", "No hay datos de la orden.");
    }

    if (!id) {
      return Alert.alert("Sin orden", "Falta OrderId.");
    }

    if (!is0600) {
      return Alert.alert(
        "Estatus inválido",
        "Esta orden ya no está marcada como Carta No Mantto.",
      );
    }

    if (!selectedStatus?.code) {
      return Alert.alert("Falta causa", "Selecciona una causa.");
    }

    if (!firmaBase64Png) {
      return Alert.alert("Falta firma", "Primero presiona “Guardar firma”.");
    }

    if (!String(descripcionConcreta || "").trim()) {
      return Alert.alert(
        "Falta descripción",
        "Describe la causa. Este texto es obligatorio.",
      );
    }

    try {
      setSendingPdf(true);

      const addressInfo = await fetchDireccionesOrden();

      const startDate = parseSapDate(wo?.StartDate);
      const finishDate = parseSapDate(wo?.FinishDate);

      const mx = safeStr(
        wo?.DocNumber || wo?.SalesOrd || wo?.SalesOrder || wo?.DocNum || "",
      ).trim();

      const equipo = safeStr(wo?.Equipment || "").trim();

      const fechaProgramada = startDate
        ? formatDateOnly(startDate)
        : finishDate
          ? formatDateOnly(finishDate)
          : "—";

      const razonSocial = safeStr(
        addressInfo?.razonSocial ||
          datosDireccion?.razonSocial ||
          wo?.PartnerName ||
          wo?.Name1 ||
          wo?.RazonSocial ||
          "",
      ).trim();

      const direccion = safeStr(
        addressInfo?.direccion ||
          datosDireccion?.direccion ||
          wo?.PartnerAddress ||
          wo?.Stras ||
          wo?.Ort01 ||
          wo?.Direccion ||
          "",
      ).trim();

      const mecanico = safeStr(
        wo?.Technician || wo?.Mecanico || nombreUsuario,
      ).trim();

      /**
       * La causa ahora es solo documental.
       * Se imprime en PDF, pero NO se manda como estatus SAP.
       */
      const causaPdf = `${String(selectedStatus.code).padStart(4, "0")} - ${
        selectedStatus.text || ""
      }`.trim();

      const html = buildCartaNoMantenimientoHtml({
        orderId: id,
        causaCode: causaPdf,
        razonSocial: razonSocial || "—",
        direccion: direccion || "—",
        equipo: equipo || "—",
        fechaProgramada: fechaProgramada || "—",
        mx: mx || "—",
        mesAfecto: mesAfecto || "—",
        mecanico: mecanico || "—",
        descripcionConcreta: descripcionConcreta || "",
        firmaSupervisorBase64Png: firmaBase64Png,
      });

      // 1) HTML -> PDF temporal
      const file = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const fileName = `carta_no_mantenimiento_${id}.pdf`;
      const finalPdfUri = `${FileSystem.documentDirectory}${fileName}`;

      // 2) Copia a documentDirectory para poder verlo/compartirlo después
      await FileSystem.copyAsync({
        from: file.uri,
        to: finalPdfUri,
      });

      setPdfLocalUri(finalPdfUri);
      setPdfFileName(fileName);

      // 3) PDF local -> Base64 para adjuntarlo a SAP
      const pdfBase64 = await FileSystem.readAsStringAsync(finalPdfUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!pdfBase64 || pdfBase64.length < 200) {
        throw new Error("No se pudo leer el PDF en base64.");
      }

      /**
       * Solo adjuntamos PDF a SAP.
       * NO mandamos WorkOrderUserStatusSet.
       */
      const payload = {
        WorkOrderHeader: {
          Orderid: String(id),
        },
        Attachments: [
          {
            DocId: String(id),
            FileName: fileName,
            MimeType: "application/pdf",
            Base64: String(pdfBase64 || "").trim(),
          },
        ],
        Return: [],
      };

      logPayloadSinBase64("[CARTA_NO_MANTTO][PDF] payload:", payload);

      /**
       * IMPORTANTE:
       * Se agrega sap-client/sap-language y timeout largo.
       */
      const resp = await api.post(
        `${CHANGE_STATUS_PATH}?sap-client=400&sap-language=ES`,
        payload,
        {
          timeout: 300000,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      const sapData = resp?.data?.d || resp?.data;
      const returns = pickSapReturns(sapData);

      console.log(
        "[CARTA_NO_MANTTO][PDF] SAP returns:",
        JSON.stringify(returns, null, 2),
      );

      if (isFatalSapReturn(returns)) {
        throw new Error(
          formatSapMessages(returns) || "SAP regresó error al adjuntar el PDF.",
        );
      }

      const msg = formatSapMessages(returns, 4);

      setPdfEnviado(true);
      setFirmaModal(false);

      Alert.alert(
        "PDF adjuntado",
        msg
          ? `PDF generado y adjuntado a SAP. Ahora puedes ver, descargar o reprogramar la orden.`
          : "PDF generado y adjuntado a SAP. Ahora puedes ver, descargar o reprogramar la orden.",
      );
    } catch (e) {
      console.error(
        "[CARTA_NO_MANTTO][PDF] ERROR:",
        e?.response?.data || e?.message,
      );

      const serverMsg =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.error ||
        "";

      Alert.alert(
        "Error",
        serverMsg || e?.message || "No se pudo generar/enviar el PDF.",
      );
    } finally {
      setSendingPdf(false);
    }
  }, [
    wo,
    id,
    is0600,
    selectedStatus,
    firmaBase64Png,
    descripcionConcreta,
    mesAfecto,
    nombreUsuario,
    datosDireccion,
    fetchDireccionesOrden,
  ]);

  // ========= REPROGRAMACIÓN =========
  const guardarReprogramacion = async () => {
    if (!pdfEnviado) {
      Alert.alert("Aún no", "Primero debes generar y adjuntar el PDF a SAP.");
      return;
    }

    if (!is0600) {
      Alert.alert(
        "Estatus inválido",
        "Esta orden ya no está marcada como Carta No Mantto.",
      );
      return;
    }

    if (!correo) {
      Alert.alert(
        "Sin correo",
        "No se detectó el correo del usuario loggeado.",
      );
      return;
    }

    try {
      setSavingReprog(true);

      const FechaIni = toYYYYMMDD(fechaHora);
      const FechaFin = toYYYYMMDD(fechaHora);

      // 1) RESCHEDULE
      const payloadReschedule = {
        WorkOrderHeader: {
          Supervisor: correo,
        },
        WorkOrderItemsSet: [
          {
            OrderId: String(id),
            OrderItem: "",
            FechaIni,
            FechaFin,
          },
        ],
        ReturnSet: [],
      };

      console.log(
        "[CARTA_NO_MANTTO][REPROGRAMAR] payload RESCHEDULE:",
        JSON.stringify(payloadReschedule, null, 2),
      );

      const respReschedule = await api.post(
        RESCHEDULE_PATH,
        payloadReschedule,
        {
          timeout: 300000,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      {
        const sapData = respReschedule?.data?.d || respReschedule?.data;
        const returns = pickSapReturns(sapData);

        console.log(
          "[CARTA_NO_MANTTO][REPROGRAMAR] RESCHEDULE returns:",
          JSON.stringify(returns, null, 2),
        );

        if (isFatalSapReturn(returns)) {
          throw new Error(
            formatSapMessages(returns) || "SAP regresó error al reprogramar.",
          );
        }
      }

      /**
       * 2) CHANGE WORKORDER
       * Nueva regla:
       * - Solo desactivar 0600.
       * - No activar 0012.
       * - No activar 0011.
       * Resultado esperado: orden sin código activo = Sin empezar.
       */
      const payloadChange = {
        OrderId: String(id),
        WorkOrderHeader: {
          Orderid: String(id),
        },
        WorkOrderUserStatusSet: [
          {
            UserStText: ESTATUS_CARTA_NO_MANTTO,
            Langu: "ES",
            Inactive: "X",
          },
        ],
        Return: [],
      };

      console.log(
        "[CARTA_NO_MANTTO][REPROGRAMAR] payload CHANGE:",
        JSON.stringify(payloadChange, null, 2),
      );

      const respChange = await api.post(
        `${CHANGE_STATUS_PATH}?sap-client=400&sap-language=ES`,
        payloadChange,
        {
          timeout: 300000,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      {
        const sapData = respChange?.data?.d || respChange?.data;
        const returns = pickSapReturns(sapData);

        console.log(
          "[CARTA_NO_MANTTO][REPROGRAMAR] CHANGE returns:",
          JSON.stringify(returns, null, 2),
        );

        if (isFatalSapReturn(returns)) {
          throw new Error(
            formatSapMessages(returns) ||
              "SAP regresó error al quitar Carta No Mantto.",
          );
        }
      }

      Alert.alert(
        "Listo",
        "La orden fue reprogramada y se quitó el estatus Carta No Mantto. Ahora debe aparecer como Sin empezar.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace({
                pathname: "/supervisor/no_mantenimiento",
                params: {
                  refresh: String(Date.now()),
                },
              });
            },
          },
        ],
      );
    } catch (e) {
      console.error(
        "[CARTA_NO_MANTTO][REPROGRAMAR] ERROR:",
        e?.response?.data || e?.message,
      );

      const serverMsg =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.error ||
        "";

      Alert.alert(
        "Error",
        serverMsg || e?.message || "No se pudo guardar la reprogramación.",
      );
    } finally {
      setSavingReprog(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle Carta No Mantto" />

        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />

          <Text style={{ marginTop: 8, color: COLORS.text }}>Cargando…</Text>
        </View>
      </View>
    );
  }

  if (!wo) {
    return (
      <View style={styles.container}>
        <Header title="Detalle Carta No Mantto" />

        <View style={styles.center}>
          <Text style={{ color: COLORS.text }}>No se encontró la orden.</Text>

          <Pressable
            onPress={fetchDetalle}
            style={[styles.btn, { marginTop: 12 }]}
          >
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.btnText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const startDate = parseSapDate(wo?.StartDate);
  const finishDate = parseSapDate(wo?.FinishDate);

  return (
    <View style={styles.container}>
      <Header title={`Orden ${id}`} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        {!is0600 ? (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={20} color={COLORS.warning} />

            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>
                Esta orden ya no está en Carta No Mantto
              </Text>

              <Text style={styles.warningText}>
                Esta vista solo debe usarse para órdenes con estatus Carta No
                Mantto.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.okBox}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color={COLORS.success}
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.okTitle}>{ESTATUS_CARTA_NO_MANTTO_LABEL}</Text>

              <Text style={styles.okText}>
                La causa seleccionada se imprimirá en el PDF.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.h}>Datos</Text>

          <Text style={styles.line}>
            <Text style={styles.b}>OrderId: </Text>
            {id || "—"}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Equipo: </Text>
            {wo?.Equipment || "—"}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Texto: </Text>
            {wo?.ShortText || "—"}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Estatus: </Text>
            {ESTATUS_CARTA_NO_MANTTO_LABEL}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Razón social: </Text>
            {datosDireccion?.razonSocial || "—"}
          </Text>

          <Text style={styles.line}>
            <Text style={styles.b}>Dirección: </Text>
            {datosDireccion?.direccion || "—"}
          </Text>

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>StartDate: </Text>
            {startDate ? startDate.toLocaleString() : "—"}
            {"  ·  "}
            <Text style={styles.b}>FinishDate: </Text>
            {finishDate ? finishDate.toLocaleString() : "—"}
          </Text>

          <Text style={[styles.line, { fontSize: 12, marginTop: 8 }]}>
            <Text style={styles.b}>Supervisor: </Text>
            {correo || "—"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h}>Causa para PDF</Text>

          <Text style={[styles.line, { marginTop: 8 }]}>
            Selecciona una causa. Esta causa aparecerá en el PDF.
          </Text>

          <Pressable
            onPress={openModal}
            disabled={!is0600}
            style={({ pressed }) => [
              styles.btn,
              !is0600 && { opacity: 0.5 },
              pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 },
            ]}
          >
            <Ionicons name="list-outline" size={18} color="#FFF" />
            <Text style={styles.btnText}>Elegir causa</Text>
          </Pressable>

          <Text style={[styles.line, { marginTop: 10 }]}>
            <Text style={styles.b}>Seleccionada: </Text>
            {selectedStatus
              ? `${selectedStatus.code} · ${selectedStatus.text}`
              : "—"}
          </Text>

          {causaConfirmada ? (
            <Text style={styles.successText}>
              Causa confirmada. Ahora genera y adjunta el PDF.
            </Text>
          ) : null}

          {pdfEnviado ? (
            <Text style={styles.successText}>
              PDF adjuntado correctamente. Reprogramación habilitada.
            </Text>
          ) : null}

          {pdfEnviado && pdfLocalUri ? (
            <View style={styles.pdfActionsBox}>
              <Text style={styles.pdfFileName} numberOfLines={1}>
                PDF generado: {pdfFileName || "carta_no_mantenimiento.pdf"}
              </Text>

              <View style={styles.pdfActionsRow}>
                <Pressable style={styles.btnPdfOutline} onPress={verPdfGenerado}>
                  <Ionicons
                    name="eye-outline"
                    size={17}
                    color={COLORS.accent}
                  />
                  <Text style={styles.btnPdfOutlineText}>Ver PDF</Text>
                </Pressable>

                <Pressable
                  style={styles.btnPdfOutline}
                  onPress={compartirPdfGenerado}
                >
                  <Ionicons
                    name="share-social-outline"
                    size={17}
                    color={COLORS.accent}
                  />
                  <Text style={styles.btnPdfOutlineText}>
                    Descargar / compartir
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={[styles.card, !pdfEnviado && styles.cardDisabled]}>
          <Text style={styles.h}>Reprogramación</Text>

          <Text style={[styles.line, { marginTop: 8 }]}>
            La reprogramación se habilita únicamente después de adjuntar el PDF a
            SAP.
          </Text>

          <Text style={[styles.line, { marginTop: 8 }]}>
            <Text style={styles.b}>Nueva fecha/hora: </Text>
            {formatDateTime(fechaHora)}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[
                styles.btnOutline,
                { flex: 1 },
                !pdfEnviado && styles.btnOutlineDisabled,
              ]}
              disabled={!pdfEnviado || savingReprog}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={!pdfEnviado ? COLORS.disabled : COLORS.accent}
              />
              <Text
                style={[
                  styles.btnOutlineText,
                  !pdfEnviado && { color: COLORS.disabled },
                ]}
              >
                Fecha
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={[
                styles.btnOutline,
                { flex: 1 },
                !pdfEnviado && styles.btnOutlineDisabled,
              ]}
              disabled={!pdfEnviado || savingReprog}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={!pdfEnviado ? COLORS.disabled : COLORS.accent}
              />
              <Text
                style={[
                  styles.btnOutlineText,
                  !pdfEnviado && { color: COLORS.disabled },
                ]}
              >
                Hora
              </Text>
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={fecha}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, selectedDate) => {
                if (Platform.OS !== "ios") setShowDatePicker(false);
                if (selectedDate) setFecha(selectedDate);
              }}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={hora}
              mode="time"
              is24Hour
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event, selectedTime) => {
                if (Platform.OS !== "ios") setShowTimePicker(false);
                if (selectedTime) setHora(selectedTime);
              }}
            />
          )}

          <Text style={[styles.line, { marginTop: 10 }]}>
            <Text style={styles.b}>Motivo interno:</Text>
          </Text>

          <TextInput
            value={motivoReprog}
            onChangeText={setMotivoReprog}
            placeholder="(Opcional)"
            placeholderTextColor="#8A96A3"
            style={[
              styles.textArea,
              { marginTop: 8, minHeight: 90 },
              !pdfEnviado && { opacity: 0.75 },
            ]}
            editable={pdfEnviado && !savingReprog}
            multiline
          />

          <Pressable
            onPress={guardarReprogramacion}
            disabled={!pdfEnviado || savingReprog || !is0600}
            style={({ pressed }) => [
              styles.btn,
              (!pdfEnviado || savingReprog || !is0600) && { opacity: 0.6 },
              pressed &&
                pdfEnviado && {
                  transform: [{ scale: 0.99 }],
                  opacity: 0.95,
                },
            ]}
          >
            {savingReprog ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="repeat-outline" size={18} color="#FFF" />
                <Text style={styles.btnText}>
                  Reprogramar y quitar Carta No Mantto
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* ===== MODAL CAUSA ===== */}
      <Modal
        visible={modal}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona la causa de no mantenimiento</Text>

              <Pressable onPress={() => setModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.title} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Ionicons
                name="search"
                size={18}
                color={COLORS.text}
                style={{ marginRight: 6 }}
              />

              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar por código o texto…"
                placeholderTextColor="#8A96A3"
                style={{ flex: 1, color: COLORS.title }}
              />
            </View>

            {loadingStatus ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={COLORS.accent} />

                <Text style={{ marginTop: 8, color: COLORS.text }}>
                  Cargando…
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredOptions}
                keyExtractor={(it) => `${it.code}-${it.estat}`}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const active =
                    String(selectedStatus?.code) === String(item.code);

                  return (
                    <Pressable
                      onPress={() => setSelectedStatus(item)}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontWeight: "900",
                            color: COLORS.title,
                          }}
                        >
                          {item.code} · {item.text}
                        </Text>

                        
                      </View>

                      {active ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={COLORS.accent}
                        />
                      ) : (
                        <Ionicons
                          name="ellipse-outline"
                          size={18}
                          color="#9AA5B1"
                        />
                      )}
                    </Pressable>
                  );
                }}
              />
            )}

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.btnGhost}
                onPress={() => setModal(false)}
                disabled={savingStatus}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btnSave,
                  (!selectedStatus || savingStatus) && { opacity: 0.6 },
                ]}
                disabled={!selectedStatus || savingStatus}
                onPress={continuarConCausa}
              >
                {savingStatus ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.btnSaveText}>Continuar al PDF</Text>
                )}
              </Pressable>
            </View>

            <Text style={{ marginTop: 10, color: COLORS.text, fontSize: 11.5 }}>
              *La causa únicamente se imprimirá en el PDF
            </Text>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL FIRMA ===== */}
      <Modal
        visible={firmaModal}
        transparent
        animationType="fade"
        onRequestClose={() => (sendingPdf ? null : setFirmaModal(false))}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "90%" }]}>
            <ScrollView
              scrollEnabled={!isSigning}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Firma supervisor + descripción
                </Text>

                <Pressable
                  onPress={() => (sendingPdf ? null : setFirmaModal(false))}
                  hitSlop={10}
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={sendingPdf ? "#AAA" : COLORS.title}
                  />
                </Pressable>
              </View>

              <Text style={{ color: COLORS.text, fontSize: 12 }}>
                1) Firma dentro del recuadro{"\n"}
                2) Presiona{" "}
                <Text style={{ fontWeight: "900" }}>Guardar firma</Text>
                {"\n"}
                3) Luego presiona “Generar PDF y enviar”.
              </Text>

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Causa seleccionada:</Text>{" "}
                {selectedStatus?.code || "—"} · {selectedStatus?.text || ""}
              </Text>

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Razón social:</Text>{" "}
                {datosDireccion?.razonSocial || "—"}
              </Text>

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Dirección:</Text>{" "}
                {datosDireccion?.direccion || "—"}
              </Text>

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Mes afecto:</Text>
              </Text>

              <TextInput
                value={mesAfecto}
                onChangeText={setMesAfecto}
                placeholder="Ej: Marzo"
                placeholderTextColor="#8A96A3"
                style={[styles.input, { marginTop: 6 }]}
                editable={!sendingPdf}
              />

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>
                  Descripción concreta obligatoria:
                </Text>
              </Text>

              <TextInput
                value={descripcionConcreta}
                onChangeText={setDescripcionConcreta}
                placeholder="Describe la causa…"
                placeholderTextColor="#8A96A3"
                style={[styles.textArea, { marginTop: 6, minHeight: 90 }]}
                editable={!sendingPdf}
                multiline
              />

              <Text style={[styles.line, { marginTop: 10 }]}>
                <Text style={styles.b}>Firma supervisor:</Text>
              </Text>

              <View style={styles.signatureBox}>
                <Signature
                  ref={signatureRef}
                  onBegin={() => {
                    setIsSigning(true);
                    setFirmaDibujada(true);
                  }}
                  onEnd={() => {
                    setIsSigning(false);
                    setFirmaDibujada(true);
                  }}
                  onOK={(sig) => {
                    const s = String(sig || "");
                    const pure = s.includes("base64,")
                      ? s.split("base64,")[1]
                      : s;

                    const clean = String(pure || "");

                    setFirmaBase64Png(clean);
                    setFirmaDibujada(!!(clean && clean.length > 50));

                    Alert.alert("Listo", "Firma guardada ✅");
                  }}
                  onEmpty={() => {
                    setFirmaBase64Png("");
                    setFirmaDibujada(false);
                  }}
                  descriptionText=""
                  clearText="Limpiar"
                  confirmText="Guardar"
                  webStyle={`
                    * { -webkit-user-select:none; -webkit-touch-callout:none; }
                    html, body { height:100%; width:100%; margin:0; padding:0; background:#fff; overflow:hidden; }
                    .m-signature-pad { box-shadow:none; border:none; height:100%; width:100%; }
                    .m-signature-pad--body { border:none; height:100%; }
                    canvas { width:100% !important; height:100% !important; touch-action:none; }
                    .m-signature-pad--footer { display:none !important; }
                  `}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <Pressable
                  style={[styles.btnGhost, { flex: 1 }]}
                  disabled={sendingPdf}
                  onPress={() => {
                    try {
                      signatureRef.current?.clearSignature?.();
                    } catch {}

                    setFirmaBase64Png("");
                    setFirmaDibujada(false);
                  }}
                >
                  <Text style={styles.btnGhostText}>Limpiar</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.btnSave,
                    { flex: 1, minWidth: 0 },
                    (!firmaDibujada || sendingPdf) && { opacity: 0.6 },
                  ]}
                  disabled={!firmaDibujada || sendingPdf}
                  onPress={() => {
                    try {
                      signatureRef.current?.readSignature?.();
                    } catch {
                      Alert.alert(
                        "No disponible",
                        "Tu firma no soporta readSignature().",
                      );
                    }
                  }}
                >
                  <Text style={styles.btnSaveText}>Guardar firma</Text>
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.btnGhost, sendingPdf && { opacity: 0.6 }]}
                  onPress={() => setFirmaModal(false)}
                  disabled={sendingPdf}
                >
                  <Text style={styles.btnGhostText}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.btnSave,
                    (sendingPdf ||
                      !String(descripcionConcreta || "").trim() ||
                      !firmaBase64Png) && { opacity: 0.6 },
                  ]}
                  disabled={
                    sendingPdf ||
                    !String(descripcionConcreta || "").trim() ||
                    !firmaBase64Png
                  }
                  onPress={generarYEnviarPdf}
                >
                  {sendingPdf ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.btnSaveText}>
                      Generar PDF y enviar
                    </Text>
                  )}
                </Pressable>
              </View>

              <Text style={{ marginTop: 8, color: COLORS.text, fontSize: 11.5 }}>
                *Al enviar, solo se adjunta el PDF. No se modifica el estatus de
                la orden.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  backText: {
    color: COLORS.accent,
    fontWeight: "900",
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cardDisabled: {
    opacity: 0.88,
  },

  h: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.title,
  },

  line: {
    color: COLORS.text,
    marginTop: 6,
    fontSize: 13,
  },

  b: {
    color: COLORS.title,
    fontWeight: "900",
  },

  btn: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },

  btnText: {
    color: "#FFF",
    fontWeight: "900",
  },

  btnOutline: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F2F8FF",
  },

  btnOutlineDisabled: {
    borderColor: COLORS.border,
    backgroundColor: "#F6F7F9",
  },

  btnOutlineText: {
    color: COLORS.accent,
    fontWeight: "900",
  },

  textArea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.title,
    backgroundColor: "#FFF",
    textAlignVertical: "top",
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.title,
    backgroundColor: "#FFF",
  },

  warningBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  warningTitle: {
    color: "#92400E",
    fontWeight: "900",
    fontSize: 13,
  },

  warningText: {
    color: "#92400E",
    fontSize: 12,
    marginTop: 2,
  },

  okBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  okTitle: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 13,
  },

  okText: {
    color: "#166534",
    fontSize: 12,
    marginTop: 2,
  },

  successText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },

  pdfActionsBox: {
    marginTop: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 10,
  },

  pdfFileName: {
    color: COLORS.title,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
  },

  pdfActionsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  btnPdfOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: "#F2F8FF",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },

  btnPdfOutlineText: {
    color: COLORS.accent,
    fontWeight: "900",
    fontSize: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  modalTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.title,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },

  optionActive: {
    borderColor: COLORS.accent,
    backgroundColor: "#F2F8FF",
  },

  modalFooter: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },

  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  btnGhostText: {
    color: COLORS.title,
    fontWeight: "900",
  },

  btnSave: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
  },

  btnSaveText: {
    color: "#FFF",
    fontWeight: "900",
  },

  signatureBox: {
    height: 220,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 8,
    backgroundColor: "#FFF",
  },
});