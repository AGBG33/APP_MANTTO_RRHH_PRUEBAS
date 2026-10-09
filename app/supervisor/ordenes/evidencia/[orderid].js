// app/supervisor/ordenes/evidencia/[orderid].js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { fetchOperacionesSupervisor } from "../../../../src/services/operacionesSupervisor";
import * as ImageManipulator from "expo-image-manipulator";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  muted: "#63718B",
  accent: "#0A6ED1",
  success: "#27AE60",
  danger: "#E76565",
};

/* =========================
   Helpers de prorrateo / SAP
   ========================= */
function sapDateFromMs(ms) {
  const d = new Date(ms);
  const midnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();

  return `/Date(${midnight})/`;
}

function sapTimePTFromMs(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();

  return `PT${h}H${m}M${s}S`;
}

function prorateMinutes(totalMin, n) {
  const base = Math.floor(totalMin / n);
  const rem = totalMin % n;
  const arr = Array(n).fill(base);

  for (let i = 0; i < rem; i++) {
    arr[i] += 1;
  }

  return arr;
}

function buildSequentialWindows(startMs, mins) {
  let cursor = startMs;

  return mins.map((m) => {
    const end = cursor + m * 60000;
    const win = { start: cursor, end };
    cursor = end;
    return win;
  });
}

function normalizeSupervisorOps(ops = []) {
  if (!Array.isArray(ops)) return [];

  return ops
    .map((op) => {
      const activity = String(
        op?.activity || op?.Activity || op?.Vornr || "",
      ).trim();

      //CAMBIOS MIGUEL 03/06/2026 quitando el campo de SubActivity
      /*
      const subactivity = String(
        op?.subactivity || op?.SubActivity || op?.Uvorn || "",
      ).trim();

      return {
        ...op,
        activity,
        subactivity,
      };
      */
      return {
        ...op,
        activity,
      };
    })
    .filter((op) => !!op.activity);
}

function getOpId(orderId, op, index) {
  const activity = String(op?.activity || op?.Activity || "").trim();
  //cambios agregados para quitar lo del campo del subactivit
  /*
  const subactivity = String(op?.subactivity || op?.SubActivity || "").trim();

  return (
    `${orderId}-${activity}${subactivity ? `-${subactivity}` : ""}` ||
    `op-${index}`
  );
*/

  return `${orderId}-${activity}-${index}`;
}
function getOpText(op) {
  const activity = String(op?.activity || op?.Activity || "").trim();
  const desc = String(op?.description || op?.Description || "").trim();
  //cambios agregados para quitar lo del campo del subactivit
  /* 
  const subactivity = String(op?.subactivity || op?.SubActivity || "").trim();
  const desc = String(op?.description || op?.Description || "").trim();

  return `${activity}${subactivity ? `-${subactivity}` : ""}${
    desc ? ` · ${desc}` : ""
  }`;

*/
  return `${activity}${desc ? ` · ${desc}` : ""}`;
}

function buildSupervisorConfirmationPayload({
  orderId,
  opsAll,
  durationMinutes,
  selectedIds,
}) {
  const selectedOps = normalizeSupervisorOps(
    (opsAll || []).filter((op, index) => {
      const id = getOpId(orderId, op, index);
      return !!selectedIds?.[id];
    }),
  );

  if (!selectedOps.length) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const finishMs = Date.now();
  const startMs = finishMs - durationMinutes * 60000;

  const minsArr = prorateMinutes(durationMinutes, selectedOps.length);
  const windows = buildSequentialWindows(startMs, minsArr);

  return {
    Order: "S1",
    ConfirmationOrderSet: selectedOps.map((op, idx) => {
      const actRaw = String(op.activity || "").trim();
      //const subRaw = String(op.subactivity || "").trim();
      /*
      const subRaw = String(op.subactivity || "").trim();

      const Operation = actRaw.padStart(4, "0");
      const SubActivity = subRaw ? subRaw.padStart(4, "0") : "";

      */
      const Operation = actRaw.padStart(4, "0");
      const w = windows[idx];

      const row = {
        ConfNo: "",
        Orderid: String(orderId || "").trim(),
        Operation,
        PostgDate: sapDateFromMs(finishMs),
        ActWork: String(minsArr[idx]),
        UnWork: "min",
        ExecStartDate: sapDateFromMs(w.start),
        ExecFinDate: sapDateFromMs(w.end),
        ExecStartTime: sapTimePTFromMs(w.start),
        ExecFinTime: sapTimePTFromMs(w.end),
        FinConf: "X",
      };
      // se elimino el if por lo del campo del SubActivity cambios Miguel Anel 03/06/2026
      // if (SubActivity) row.SubActivity = SubActivity;

      return row;
    }),
    ConfirmationMaterialSet: [],
    Return: [],
  };
}

function getBackendMessage(err, fallback) {
  return (
    err?.response?.data?.error?.message?.value ||
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.response?.data?.d?.message ||
    err?.message ||
    fallback
  );
}

/* =========================
   Estatus de orden
   ========================= */
function normalizeStatusCode(value) {
  const s = String(value || "").trim();
  if (!s) return "";

  const matches = s.match(/\d{1,4}/g) || [];
  const codes = matches.map((x) => x.padStart(4, "0"));

  // Nueva regla:
  // 0600 = Carta No Mantto. Tiene prioridad para bloquear acciones.
  if (codes.includes("0600")) return "0600";
  if (codes.includes("0400")) return "0400";
  if (codes.includes("0300")) return "0300";
  if (codes.includes("0200")) return "0200";
  if (codes.includes("0100")) return "0100";

  return codes[0] || "";
}

function getCurrentOrderStatusFor0300(orden) {
  const candidates = [
    orden?.estatus_code,
    orden?.userstatus,
    orden?.UserStatus,
    orden?.Userstatus,
    orden?.UserStText,
    orden?.status_code,
    orden?.estatus,
    orden?.status,
  ];

  for (const item of candidates) {
    const code = normalizeStatusCode(item);
    if (code) return code;
  }

  return "";
}

function buildPayloadFinalizacion0300SinStatus({ orderId }) {
  const cleanOrderId = String(orderId || "").trim();

  return {
    OrderId: cleanOrderId,
    WorkOrderHeader: {
      Orderid: cleanOrderId,
    },
    WorkOrderUserStatusSet: [
      {
        UserStText: "0301",
        Langu: "ES",
        Inactive: "",
      },
    ],
    Return: [],
  };
}

function buildPayloadFinalizacion0300ConStatus({ orderId, currentStatusCode }) {
  const cleanOrderId = String(orderId || "").trim();
  const current = normalizeStatusCode(currentStatusCode);

  return {
    OrderId: cleanOrderId,
    WorkOrderHeader: {
      Orderid: cleanOrderId,
    },
    WorkOrderUserStatusSet: [
      {
        UserStText: "0301",
        Langu: "ES",
        Inactive: "",
      },
      {
        UserStText: current,
        Langu: "ES",
        Inactive: "X",
      },
    ],
    Return: [],
  };
}

function buildPayloadFinalizacion0300({ orderId, currentStatusCode }) {
  const current = normalizeStatusCode(currentStatusCode);

  if (!current) {
    return buildPayloadFinalizacion0300SinStatus({ orderId });
  }

  return buildPayloadFinalizacion0300ConStatus({
    orderId,
    currentStatusCode: current,
  });
}

/* =========================
   Validación respuesta SAP
   ========================= */
async function validarErroresSapEnRespuesta(response) {
  const returns =
    response?.data?.d?.Return?.results ||
    response?.data?.Return?.results ||
    response?.data?.Return ||
    [];

  const lista = Array.isArray(returns) ? returns : [];

  const errores = lista.filter(
    (item) => String(item?.Type || "").toUpperCase() === "E",
  );

  if (errores.length > 0) {
    const mensaje = errores
      .map((item) => `• ${item?.Message || "Error SAP"}`)
      .join("\n");

    throw new Error(mensaje || "SAP devolvió error.");
  }
}

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

export default function EvidenciaOrden() {
  const { orderid } = useLocalSearchParams();

  const [archivos, setArchivos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [tipoEnvio, setTipoEnvio] = useState("TBM");

  const [operaciones, setOperaciones] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [checkedMap, setCheckedMap] = useState({});
  const [loadingOperaciones, setLoadingOperaciones] = useState(true);
  const [ordenDetalle, setOrdenDetalle] = useState(null);

  const [horasEjecucion, setHorasEjecucion] = useState("");
  const [minutosEjecucion, setMinutosEjecucion] = useState("");

  const orderIdLimpio = useMemo(() => {
    return String(orderid || "").trim();
  }, [orderid]);

  const statusOrden = useMemo(() => {
    return getCurrentOrderStatusFor0300(ordenDetalle);
  }, [ordenDetalle]);

  const esCartaNoMantto0600 = statusOrden === "0600";
  const esFinalizada0300 = statusOrden === "0300";
  const esPendienteFirma0400 = statusOrden === "0400";
  const esProceso0200 = statusOrden === "0200";

  const isLockedByStatus = esFinalizada0300 || esCartaNoMantto0600;

  useEffect(() => {
    if (esPendienteFirma0400) {
      setTipoEnvio("FINALIZACION");
    }
  }, [esPendienteFirma0400]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!orderIdLimpio) {
        if (mounted) {
          setOperaciones([]);
          setLoadingOperaciones(false);
        }
        return;
      }

      try {
        setLoadingOperaciones(true);

        const ops = await fetchOperacionesSupervisor(orderIdLimpio);

        if (mounted) {
          setOperaciones(Array.isArray(ops) ? ops : []);

          try {
            const resOrden = await api.get(`/api/ordenes/sap/${orderIdLimpio}`);

            if (mounted) {
              setOrdenDetalle(resOrden?.data || null);
            }
          } catch (e) {
            console.log(
              "[EVIDENCIA] No se pudo cargar detalle de orden:",
              e?.response?.data || e?.message || e,
            );
          }
        }
      } catch (error) {
        console.log("[EVIDENCIA] Error cargando operaciones:", error);

        if (mounted) {
          setOperaciones([]);
        }
      } finally {
        if (mounted) {
          setLoadingOperaciones(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [orderIdLimpio]);

  const formatearTamano = (bytes) => {
    if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
      return "Tamaño no disponible";
    }

    const size = Number(bytes);

    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getExtensionFromName = (fileName) => {
    const safeName = String(fileName || "").trim();
    if (!safeName.includes(".")) return "bin";
    return safeName.split(".").pop().toLowerCase();
  };

  const formatearFechaArchivo = (date = new Date()) => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());

    return `${dd}${mm}${yyyy}`;
  };

  const construirNombreArchivo = (file) => {
    const extension = getExtensionFromName(file?.name);
    const fecha = formatearFechaArchivo(new Date());
    const tipoArchivo = file?.tipoEnvio || "TBM";

    if (tipoArchivo === "TBM") {
      return `TBMKY_${orderIdLimpio}_${fecha}.${extension}`;
    }

    return `MANTENIMIENTO_${orderIdLimpio}_${fecha}.${extension}`;
  };

  const seleccionarArchivo = async () => {
    if (isLockedByStatus) {
      Alert.alert(
        esCartaNoMantto0600 ? "Carta No Mantto" : "Orden finalizada",
        esCartaNoMantto0600
          ? "Esta orden está marcada como Carta No Mantto. No se puede cargar evidencia."
          : "Esta orden ya está finalizada. No se puede cargar evidencia.",
      );
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const assets = Array.isArray(result.assets) ? result.assets : [];
      if (!assets.length) return;

      const archivosValidos = [];

      for (const file of assets) {
        const info = await FileSystem.getInfoAsync(file.uri);
        const sizeReal = Number(info?.size || file?.size || 0);
        const sizeMB = sizeReal / (1024 * 1024);

        console.log(
          `[EVIDENCIA] Archivo seleccionado: ${file.name} - ${sizeMB.toFixed(
            2,
          )} MB`,
        );

        const mime = String(file?.mimeType || "").toLowerCase();
        const name = String(file?.name || "").toLowerCase();
        const esPdf = mime.includes("pdf") || name.endsWith(".pdf");

        if (esPdf && sizeReal > MAX_PDF_BYTES) {
          Alert.alert(
            "PDF demasiado grande",
            `El PDF "${file.name}" pesa ${sizeMB.toFixed(
              1,
            )} MB. Para enviarlo correctamente debe pesar máximo ${MAX_PDF_MB} MB, porque al convertirlo a Base64 aumenta de tamaño.`,
          );
          continue;
        }

        archivosValidos.push({
          ...file,
          size: sizeReal,
          tipoEnvio: esPendienteFirma0400 ? "FINALIZACION" : tipoEnvio,
        });
      }

      if (!archivosValidos.length) return;

      setArchivos((prev) => {
        const existentes = new Set(
          prev.map((f) => `${f.name}-${f.size}-${f.uri}-${f.tipoEnvio}`),
        );

        const nuevos = archivosValidos.filter(
          (f) => !existentes.has(`${f.name}-${f.size}-${f.uri}-${f.tipoEnvio}`),
        );

        return [...prev, ...nuevos];
      });
    } catch (error) {
      console.log("[EVIDENCIA] Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  const tomarFoto = async () => {
    if (isLockedByStatus) {
      Alert.alert(
        esCartaNoMantto0600 ? "Carta No Mantto" : "Orden finalizada",
        esCartaNoMantto0600
          ? "Esta orden está marcada como Carta No Mantto. No se puede tomar evidencia."
          : "Esta orden ya está finalizada. No se puede tomar evidencia.",
      );
      return;
    }

    try {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();

      if (!permiso.granted) {
        Alert.alert(
          "Permiso requerido",
          "Necesitas permitir el acceso a la cámara para tomar fotos.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.6,
        allowsEditing: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const foto = {
        uri: asset.uri,
        name: `foto_${orderIdLimpio}_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        size: asset.fileSize || 0,
        tipoEnvio: esPendienteFirma0400 ? "FINALIZACION" : tipoEnvio,
      };

      setArchivos((prev) => [...prev, foto]);
    } catch (error) {
      console.log("[EVIDENCIA] Error tomando foto:", error);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const eliminarArchivo = (uri) => {
    setArchivos((prev) => prev.filter((file) => file.uri !== uri));
  };

  const cambiarTipoArchivo = (uri, nuevoTipo) => {
    if (isLockedByStatus) return;

    setArchivos((prev) =>
      prev.map((file) =>
        file.uri === uri ? { ...file, tipoEnvio: nuevoTipo } : file,
      ),
    );
  };

  const MAX_SIZE_MB = 3;

  // Para imágenes comprimidas
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  // Para PDF, usamos menos porque Base64 aumenta el tamaño
  const MAX_PDF_MB = 10;
  const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

  const comprimirImagenSiAplica = async (file) => {
    const mime = String(file?.mimeType || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();

    const esImagen =
      mime.startsWith("image/") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png");

    if (!esImagen) return file;

    let calidad = 0.7;
    let width = 1280;
    let result = null;

    for (let i = 0; i < 5; i++) {
      result = await ImageManipulator.manipulateAsync(
        file.uri,
        [{ resize: { width } }],
        {
          compress: calidad,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      const info = await FileSystem.getInfoAsync(result.uri);
      const sizeMB = info.size / (1024 * 1024);

      console.log(`📸 Intento ${i + 1}: ${sizeMB.toFixed(2)} MB`);

      if (sizeMB <= MAX_SIZE_MB) {
        return {
          ...file,
          uri: result.uri,
          name:
            file.name?.replace(/\.(png|jpg|jpeg)$/i, ".jpg") ||
            `imagen_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          size: info.size,
        };
      }

      calidad -= 0.15;
      width -= 200;
    }

    throw new Error(
      `No se pudo comprimir la imagen ${file.name} a menos de 3 MB`,
    );
  };

  const validarPesoArchivo = async (file) => {
    const info = await FileSystem.getInfoAsync(file.uri);
    const sizeMB = info.size / (1024 * 1024);

    console.log(`📄 Archivo ${file.name}: ${sizeMB.toFixed(2)} MB`);

    const mime = String(file?.mimeType || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    const esPdf = mime.includes("pdf") || name.endsWith(".pdf");

    const limiteMB = esPdf ? MAX_PDF_MB : MAX_SIZE_MB;
    const limiteBytes = esPdf ? MAX_PDF_BYTES : MAX_SIZE_BYTES;

    if (!esPdf && info.size > limiteBytes) {
      throw new Error(
        `El archivo ${file.name} pesa ${sizeMB.toFixed(
          1,
        )} MB. Debe ser menor a ${limiteMB} MB.`,
      );
    }

    return {
      ...file,
      size: info.size,
    };
  };

  const convertirArchivoABase64 = async (file) => {
    try {
      const info = await FileSystem.getInfoAsync(file.uri);
      const sizeReal = Number(info?.size || file?.size || 0);
      const sizeMB = sizeReal / (1024 * 1024);

      if (
        !file.name.toLowerCase().endsWith(".pdf") &&
        sizeReal > MAX_SIZE_BYTES
      ) {
        throw new Error(
          `El archivo ${file?.name || ""} pesa ${sizeMB.toFixed(
            1,
          )} MB. Usa archivos menores a ${MAX_SIZE_MB} MB.`,
        );
      }

      console.log(
        `[EVIDENCIA] Convirtiendo a Base64: ${file?.name} - ${sizeMB.toFixed(
          2,
        )} MB`,
      );

      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return base64;
    } catch (error) {
      console.log(
        "[EVIDENCIA] Error convirtiendo a base64:",
        file?.name,
        error,
      );
      throw error;
    }
  };

  const construirAttachments = async () => {
    const attachments = [];

    for (const file of archivos) {
      let fileProcesado = file;

      fileProcesado = await comprimirImagenSiAplica(fileProcesado);
      fileProcesado = await validarPesoArchivo(fileProcesado);

      const base64 = await convertirArchivoABase64(fileProcesado);

      const extension = getExtensionFromName(fileProcesado?.name);

      attachments.push({
        DocId: orderIdLimpio,
        FileName: construirNombreArchivo(fileProcesado),
        MimeType: extension,
        Base64: String(base64 || "").trim(),
      });
    }

    return attachments;
  };

  const getDurationMinutes = () => {
    const h = parseInt(String(horasEjecucion || "0").trim(), 10);
    const m = parseInt(String(minutosEjecucion || "0").trim(), 10);

    const hh = Number.isFinite(h) && h >= 0 ? h : 0;
    const mm = Number.isFinite(m) && m >= 0 ? m : 0;

    return hh * 60 + mm;
  };

  const tieneArchivoFinalizacion = () => {
    return archivos.some((file) => {
      const tipo = String(file?.tipoEnvio || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

      return tipo === "FINALIZACION";
    });
  };

  const enviarFinalizacion0300ConEvidencias = async (attachments) => {
    const currentStatusCode = getCurrentOrderStatusFor0300(ordenDetalle);

    if (currentStatusCode === "0600") {
      throw new Error(
        "La orden está marcada como Carta No Mantto. No se puede finalizar como 0300.",
      );
    }

    console.log("========================================");
    console.log("[DEBUG] ORDEN DETALLE COMPLETO:");
    console.log(JSON.stringify(ordenDetalle, null, 2));
    console.log("[DEBUG] STATUS DETECTADO:", currentStatusCode);
    console.log("========================================");

    const payloadBase = buildPayloadFinalizacion0300({
      orderId: orderIdLimpio,
      currentStatusCode,
    });

    const payloadFinalizacionConEvidencias = {
      ...payloadBase,
      Attachments: Array.isArray(attachments) ? attachments : [],
    };

    logPayloadSinBase64(
      "[EVIDENCIA] JSON FINALIZACION 0300 + ATTACHMENTS:",
      payloadFinalizacionConEvidencias,
    );

    const responseFinalizacion = await api.post(
      "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
      payloadFinalizacionConEvidencias,
      { timeout: 300000 },
    );

    console.log(
      "[EVIDENCIA] RESPONSE FINALIZACION 0300 + ATTACHMENTS:",
      responseFinalizacion?.data,
    );

    await validarErroresSapEnRespuesta(responseFinalizacion);

    return true;
  };

  const enviarEvidencia = async () => {
    if (!orderIdLimpio) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    if (esCartaNoMantto0600) {
      Alert.alert(
        "Carta No Mantto",
        "Esta orden está marcada como Carta No Mantto. No se puede enviar evidencia, tiempos ni actividades.",
      );
      return;
    }

    if (esFinalizada0300) {
      Alert.alert(
        "Orden finalizada",
        "Esta orden ya está finalizada. No se puede enviar evidencia, tiempos ni actividades.",
      );
      return;
    }

    if (!archivos.length) {
      Alert.alert("Validación", "Debes seleccionar al menos un archivo.");
      return;
    }

    const hayFinalizacion = tieneArchivoFinalizacion();

    if (!hayFinalizacion) {
      Alert.alert(
        "Validación",
        "Debes marcar al menos un archivo como Finalización.",
      );
      return;
    }

    const operacionesSeleccionadas = Object.keys(checkedMap || {}).length;
    const durationMinutes = getDurationMinutes();

    if (!esPendienteFirma0400) {
      if (operacionesSeleccionadas === 0) {
        Alert.alert(
          "Validación",
          "Debes marcar al menos una actividad realizada.",
        );
        return;
      }

      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        Alert.alert(
          "Validación",
          "Debes capturar un tiempo de ejecución válido en horas y/o minutos.",
        );
        return;
      }
    }

    try {
      setGuardando(true);

      const attachments = await construirAttachments();

      if (!attachments.length) {
        throw new Error("No se pudieron construir los archivos adjuntos.");
      }

      logPayloadSinBase64("[EVIDENCIA] ATTACHMENTS A ENVIAR:", {
        WorkOrderHeader: { Orderid: orderIdLimpio },
        Attachments: attachments,
        Return: [],
      });

      if (!esPendienteFirma0400) {
        const payloadConfirmaciones = buildSupervisorConfirmationPayload({
          orderId: orderIdLimpio,
          opsAll: operaciones,
          durationMinutes,
          selectedIds: checkedMap,
        });

        if (!payloadConfirmaciones) {
          throw new Error(
            "No se pudo construir el payload de confirmaciones de operaciones.",
          );
        }

        console.log("========================================");
        console.log("[EVIDENCIA] JSON CONFIRMATIONS:");
        console.log(JSON.stringify(payloadConfirmaciones, null, 2));
        console.log("========================================");

        const responseConfirm = await api.post(
          "/api/odata/ZCS_CREATE_CONFIRMATION_SRV/ConfirmationHeaderSet",
          payloadConfirmaciones,
          { timeout: 300000 },
        );

        await validarErroresSapEnRespuesta(responseConfirm);

        console.log(
          "[EVIDENCIA] RESPONSE CONFIRMATIONS:",
          responseConfirm?.data,
        );
      } else {
        console.log(
          "[EVIDENCIA] Orden 0400 detectada: NO se mandan tiempos ni confirmaciones. Solo archivo de finalización.",
        );
      }

      await enviarFinalizacion0300ConEvidencias(attachments);

      Alert.alert(
        "Éxito",
        esPendienteFirma0400
          ? "El archivo de finalización se envió correctamente."
          : "Las confirmaciones, evidencias y finalización de la orden se enviaron correctamente.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace("/supervisor/ordenes");
            },
          },
        ],
      );
    } catch (error) {
      console.log(
        "[EVIDENCIA] Error completo:",
        error?.response?.data || error,
      );

      const mensaje = getBackendMessage(
        error,
        "No se pudo enviar la información.",
      );

      Alert.alert("Error al enviar", String(mensaje));
    } finally {
      setGuardando(false);
    }
  };

  const operacionesAgrupadas = useMemo(() => {
    return operaciones.reduce((acc, op, index) => {
      const grupo = String(
        op?.Usr02 ||
          op?.usr02 ||
          op?.ubicacion ||
          op?.Ubicacion ||
          op?.workcenter ||
          op?.WorkCntr ||
          "SIN UBICACIÓN",
      )
        .trim()
        .toUpperCase();

      if (!acc[grupo]) acc[grupo] = [];

      acc[grupo].push({
        ...op,
        __index: index,
      });

      return acc;
    }, {});
  }, [operaciones]);

  return (
    <View style={styles.container}>
      <Header title={`Evidencia Orden ${orderIdLimpio}`} />

      <ScrollView contentContainerStyle={styles.content}>
        {esCartaNoMantto0600 ? (
          <View style={styles.lockedBox}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color={COLORS.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedTitle}>Carta No Mantto</Text>
              <Text style={styles.lockedText}>
                Esta orden tiene estatus Carta No Mantto. No se puede cargar
                evidencia, capturar tiempos, marcar actividades ni finalizar.
              </Text>
            </View>
          </View>
        ) : null}

        {esFinalizada0300 ? (
          <View style={styles.lockedBox}>
            <Ionicons
              name="checkmark-done-outline"
              size={20}
              color={COLORS.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedTitle}>Orden finalizada</Text>
              <Text style={styles.lockedText}>
                Esta orden ya está finalizada. No se puede cargar evidencia,
                tiempos ni actividades.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Carga de evidencia</Text>
          <Text style={styles.subtitle}>
            Selecciona archivos desde tu teléfono para esta orden.
          </Text>

          {!esPendienteFirma0400 && !isLockedByStatus && (
            <>
              <Text style={styles.label}>
                Tiempo total de ejecución de la orden
              </Text>

              <View style={styles.timeRow}>
                <View style={styles.timeInputWrap}>
                  <Text style={styles.smallLabel}>Horas</Text>
                  <TextInput
                    value={horasEjecucion}
                    onChangeText={setHorasEjecucion}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.muted}
                    style={styles.timeInput}
                    editable={!isLockedByStatus}
                  />
                </View>

                <View style={styles.timeInputWrap}>
                  <Text style={styles.smallLabel}>Minutos</Text>
                  <TextInput
                    value={minutosEjecucion}
                    onChangeText={setMinutosEjecucion}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.muted}
                    style={styles.timeInput}
                    editable={!isLockedByStatus}
                  />
                </View>
              </View>
            </>
          )}

          <View style={styles.opsInfoBox}>
            <Text style={styles.opsInfoTitle}>Operaciones a confirmar</Text>

            {loadingOperaciones ? (
              <View style={styles.opsLoadingRow}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.opsInfoText}>Cargando operaciones…</Text>
              </View>
            ) : isLockedByStatus ? (
              <Text style={styles.opsInfoText}>
                Esta orden está bloqueada por estatus. Total disponibles:{" "}
                <Text style={styles.opsInfoCount}>{operaciones.length}</Text>
              </Text>
            ) : (
              <Text style={styles.opsInfoText}>
                Marca las operaciones realizadas. Total disponibles:{" "}
                <Text style={styles.opsInfoCount}>{operaciones.length}</Text>
              </Text>
            )}
          </View>

          {!esPendienteFirma0400 && !isLockedByStatus ? (
            <>
              <Text style={styles.label}>
                Tipo que se asignará al seleccionar
              </Text>

              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    tipoEnvio === "TBM" && styles.typeBtnActive,
                  ]}
                  onPress={() => {
                    if (isLockedByStatus) return;
                    setTipoEnvio("TBM");
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      tipoEnvio === "TBM" && styles.typeBtnTextActive,
                    ]}
                  >
                    TBM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    tipoEnvio === "FINALIZACION" && styles.typeBtnActive,
                  ]}
                  onPress={() => {
                    if (isLockedByStatus) return;
                    setTipoEnvio("FINALIZACION");
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      tipoEnvio === "FINALIZACION" && styles.typeBtnTextActive,
                    ]}
                  >
                    Finalización
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : esPendienteFirma0400 && !isLockedByStatus ? (
            <View style={styles.onlyFinalizacionBox}>
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={COLORS.accent}
              />
              <Text style={styles.onlyFinalizacionText}>
                Orden pendiente de firma: solo se permite cargar archivo de
                finalización.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.pickBtn,
              isLockedByStatus && { backgroundColor: "#ccc" },
            ]}
            onPress={seleccionarArchivo}
            disabled={isLockedByStatus}
          >
            <Ionicons name="document-attach-outline" size={18} color="#fff" />
            <Text style={styles.pickBtnText}>Seleccionar archivo</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.pickBtn,
            { marginTop: 10, backgroundColor: COLORS.success },
            isLockedByStatus && { backgroundColor: "#ccc" },
          ]}
          onPress={tomarFoto}
          activeOpacity={0.85}
          disabled={isLockedByStatus}
        >
          <Ionicons name="camera-outline" size={18} color="#fff" />
          <Text style={styles.pickBtnText}>Tomar foto</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Archivos seleccionados ({archivos.length})
          </Text>

          {!archivos.length ? (
            <Text style={styles.emptyText}>
              No has seleccionado archivos todavía.
            </Text>
          ) : (
            archivos.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={styles.fileItem}>
                <View style={styles.fileIconWrap}>
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color={COLORS.accent}
                  />
                </View>

                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.name || `Archivo ${index + 1}`}
                  </Text>

                  <Text style={styles.fileMeta} numberOfLines={1}>
                    Tipo asignado:{" "}
                    {file.tipoEnvio === "TBM" ? "TBM" : "Finalización"}
                  </Text>

                  <Text style={styles.fileMeta} numberOfLines={1}>
                    Nombre a enviar: {construirNombreArchivo(file)}
                  </Text>

                  <Text style={styles.fileMeta}>
                    MimeType: {getExtensionFromName(file?.name)}
                  </Text>

                  <Text style={styles.fileMeta}>
                    Tamaño: {formatearTamano(file.size)}
                  </Text>

                  {!esPendienteFirma0400 && !isLockedByStatus && (
                    <View style={styles.inlineTypeRow}>
                      <TouchableOpacity
                        style={[
                          styles.smallTypeBtn,
                          file.tipoEnvio === "TBM" && styles.smallTypeBtnActive,
                        ]}
                        onPress={() => cambiarTipoArchivo(file.uri, "TBM")}
                      >
                        <Text
                          style={[
                            styles.smallTypeBtnText,
                            file.tipoEnvio === "TBM" &&
                              styles.smallTypeBtnTextActive,
                          ]}
                        >
                          TBM
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.smallTypeBtn,
                          file.tipoEnvio === "FINALIZACION" &&
                            styles.smallTypeBtnActive,
                        ]}
                        onPress={() =>
                          cambiarTipoArchivo(file.uri, "FINALIZACION")
                        }
                      >
                        <Text
                          style={[
                            styles.smallTypeBtnText,
                            file.tipoEnvio === "FINALIZACION" &&
                              styles.smallTypeBtnTextActive,
                          ]}
                        >
                          Finalización
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {!isLockedByStatus ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => eliminarArchivo(file.uri)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.finalizeBox}>
          <View style={styles.finalizeHeader}>
            <Ionicons name="checkbox-outline" size={18} color={COLORS.accent} />
            <Text style={styles.finalizeTitle}>
              Marca las actividades realizadas
            </Text>
          </View>

          {loadingOperaciones ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : operaciones.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay operaciones para mostrar.
            </Text>
          ) : (
            Object.entries(operacionesAgrupadas).map(([grupo, opsGrupo]) => {
              const isOpen = !!expandedGroups[grupo];

              return (
                <View key={grupo} style={styles.groupBox}>
                  <TouchableOpacity
                    style={styles.groupHeader}
                    activeOpacity={0.85}
                    onPress={() => {
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [grupo]: !prev[grupo],
                      }));
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>{grupo}</Text>
                      <Text style={styles.groupSubtitle}>
                        {opsGrupo.length} operación
                        {opsGrupo.length === 1 ? "" : "es"}
                      </Text>
                    </View>

                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.groupContent}>
                      {opsGrupo.map((op) => {
                        const index = op.__index;
                        const opId = getOpId(orderIdLimpio, op, index);
                        const checked = !!checkedMap[opId];

                        return (
                          <TouchableOpacity
                            key={opId}
                            style={[
                              styles.opCheckItem,
                              checked && styles.opCheckItemActive,
                              isLockedByStatus && styles.opCheckItemDisabled,
                            ]}
                            activeOpacity={0.85}
                            onPress={() => {
                              if (
                                esPendienteFirma0400 ||
                                esFinalizada0300 ||
                                esCartaNoMantto0600
                              ) {
                                return;
                              }

                              setCheckedMap((prev) => {
                                const next = { ...(prev || {}) };

                                if (next[opId]) delete next[opId];
                                else next[opId] = true;

                                return next;
                              });
                            }}
                          >
                            {!esPendienteFirma0400 && !isLockedByStatus && (
                              <Ionicons
                                name={checked ? "checkbox" : "square-outline"}
                                size={22}
                                color={checked ? COLORS.accent : COLORS.muted}
                              />
                            )}

                            <View style={{ flex: 1 }}>
                              <Text style={styles.opCheckText}>
                                {getOpText(op)}
                              </Text>

                              {esPendienteFirma0400 && (
                                <Text style={styles.opStatusText}>
                                  Estatus: pendiente de firma
                                </Text>
                              )}

                              {esCartaNoMantto0600 && (
                                <Text style={styles.opStatusText}>
                                  Estatus: Carta No Mantto
                                </Text>
                              )}

                              {esFinalizada0300 && (
                                <Text style={styles.opStatusText}>
                                  Estatus: finalizada
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            (guardando || isLockedByStatus) && styles.saveBtnDisabled,
          ]}
          disabled={guardando || isLockedByStatus}
          onPress={enviarEvidencia}
          activeOpacity={0.9}
        >
          {guardando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>
              {esCartaNoMantto0600
                ? "Orden Carta No Mantto"
                : esFinalizada0300
                  ? "Orden finalizada"
                  : esPendienteFirma0400
                    ? "Enviar archivo de finalización"
                    : "Enviar Evidencias y Finalizar"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  content: {
    padding: 16,
    paddingBottom: 30,
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 8,
  },

  smallLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 6,
  },

  timeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  timeInputWrap: {
    flex: 1,
  },

  timeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.title,
    fontWeight: "700",
  },

  opsInfoBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },

  opsInfoTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 4,
  },

  opsInfoText: {
    fontSize: 12,
    color: COLORS.text,
  },

  opsInfoCount: {
    fontWeight: "800",
    color: COLORS.title,
  },

  opsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  typeBtnActive: {
    backgroundColor: "#EAF4FF",
    borderColor: COLORS.accent,
  },

  typeBtnText: {
    color: COLORS.title,
    fontSize: 13,
    fontWeight: "700",
  },

  typeBtnTextActive: {
    color: COLORS.accent,
  },

  pickBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  pickBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    fontStyle: "italic",
  },

  fileItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  fileIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  fileInfo: {
    flex: 1,
    paddingRight: 10,
  },

  fileName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 2,
  },

  fileMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 2,
  },

  inlineTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },

  smallTypeBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },

  smallTypeBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: "#EAF4FF",
  },

  smallTypeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.title,
  },

  smallTypeBtnTextActive: {
    color: COLORS.accent,
  },

  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
  },

  saveBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  saveBtnDisabled: {
    opacity: 0.7,
  },

  saveText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },

  finalizeBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },

  finalizeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  finalizeTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.title,
  },

  groupBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
  },

  groupTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.title,
  },

  groupSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
  },

  groupContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  opCheckItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },

  opCheckItemActive: {
    borderColor: COLORS.accent,
    backgroundColor: "#EAF4FF",
  },

  opCheckItemDisabled: {
    opacity: 0.75,
    backgroundColor: "#F3F4F6",
  },

  opCheckText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.title,
  },

  onlyFinalizacionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EAF4FF",
    borderWidth: 1,
    borderColor: "#8EC5FF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },

  onlyFinalizacionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.title,
  },

  opStatusText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.accent,
  },

  lockedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F1F3F5",
    borderWidth: 1,
    borderColor: "#C9CED6",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },

  lockedTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.title,
    marginBottom: 2,
  },

  lockedText: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 17,
  },
});
