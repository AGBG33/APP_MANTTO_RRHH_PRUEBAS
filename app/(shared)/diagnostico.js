// app/(shared)/diagnostico.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";
import * as Application from "expo-application";
import * as Network from "expo-network";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import Header from "../../src/components/Header";

const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  danger: "#EB5757",
  ok: "#2FBF71",
  warn: "#F59E0B",
};

const MIN_RAM_GB = 6;
const MIN_FREE_STORAGE_GB = 5;
const MIN_ANDROID_API = 30;

const MAX_LOCAL_MB_MEDIO = 15;
const MAX_LOCAL_MB_ALTO = 25;
const MAX_BASE64_MEDIO = 5;
const MAX_BASE64_ALTO = 10;

function bytesToGB(bytes) {
  if (bytes === null || bytes === undefined) return "No disponible";
  return `${(Number(bytes) / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function bytesToMB(bytes) {
  if (bytes === null || bytes === undefined) return "No disponible";
  return `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`;
}

function safeStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

function medirBytesTexto(texto) {
  const value = safeStr(texto);

  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(value).length;
    }
  } catch {}

  return value.length * 2;
}

function traducirTipoRed(type) {
  switch (String(type || "").toLowerCase()) {
    case "wifi":
      return "WiFi";
    case "cellular":
      return "Datos móviles";
    case "ethernet":
      return "Ethernet";
    case "bluetooth":
      return "Bluetooth";
    case "vpn":
      return "VPN";
    case "none":
      return "Sin conexión";
    case "unknown":
      return "Desconocida";
    default:
      return type || "No disponible";
  }
}

function traducirGeneracionCelular(generation) {
  switch (generation) {
    case "2g":
      return "2G";
    case "3g":
      return "3G";
    case "4g":
      return "4G / LTE";
    case "5g":
      return "5G";
    default:
      return "No disponible";
  }
}

function limpiarValorTxt(value) {
  if (value === null || value === undefined || value === "") {
    return "No disponible";
  }

  return String(value)
    .replace(/\t/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function agregarLineaTxt(lineas, seccion, campo, valor) {
  lineas.push(
    `${limpiarValorTxt(seccion)}\t${limpiarValorTxt(campo)}\t${limpiarValorTxt(
      valor,
    )}`,
  );
}

function ocultarNombreKey(key) {
  const text = String(key || "");

  if (text.length <= 8) return "key_oculta";

  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function contarDatosMitsu(parsed, valueLower, keyLower) {
  let ordenes = 0;
  let pdfs = 0;
  let base64 = 0;

  if (
    keyLower.includes("orden") ||
    keyLower.includes("order") ||
    keyLower.includes("workorder") ||
    valueLower.includes("orderid") ||
    valueLower.includes("workorder") ||
    valueLower.includes("orden")
  ) {
    ordenes++;
  }

  if (
    keyLower.includes("pdf") ||
    valueLower.includes(".pdf") ||
    valueLower.includes("application/pdf") ||
    valueLower.includes("attachment")
  ) {
    pdfs++;
  }

  if (
    valueLower.includes("base64") ||
    valueLower.includes("data:application/pdf") ||
    valueLower.includes("jvberi0") ||
    valueLower.includes("jvber")
  ) {
    base64++;
  }

  const recorrido = recorrerJsonMitsu(parsed);

  return {
    ordenes: ordenes + recorrido.ordenes,
    pdfs: pdfs + recorrido.pdfs,
    base64: base64 + recorrido.base64,
  };
}

function recorrerJsonMitsu(data) {
  const result = {
    ordenes: 0,
    pdfs: 0,
    base64: 0,
  };

  const visitar = (value, depth = 0) => {
    if (depth > 8) return;

    if (Array.isArray(value)) {
      value.forEach((item) => visitar(item, depth + 1));
      return;
    }

    if (value && typeof value === "object") {
      const keys = Object.keys(value);

      if (
        keys.some((key) => {
          const lower = key.toLowerCase();
          return (
            lower === "orderid" ||
            lower === "order_id" ||
            lower === "orden" ||
            lower.includes("workorder")
          );
        })
      ) {
        result.ordenes++;
      }

      if (
        keys.some((key) => {
          const lower = key.toLowerCase();
          return (
            lower.includes("pdf") ||
            lower.includes("attachment") ||
            lower.includes("evidencia")
          );
        })
      ) {
        result.pdfs++;
      }

      if (
        keys.some((key) => {
          const lower = key.toLowerCase();
          return lower.includes("base64");
        })
      ) {
        result.base64++;
      }

      keys.forEach((key) => visitar(value[key], depth + 1));
      return;
    }

    if (typeof value === "string") {
      const lower = value.toLowerCase();

      if (
        lower.includes(".pdf") ||
        lower.includes("application/pdf") ||
        lower.includes("attachment")
      ) {
        result.pdfs++;
      }

      if (
        lower.includes("base64") ||
        lower.includes("data:application/pdf") ||
        lower.includes("jvberi0") ||
        lower.includes("jvber")
      ) {
        result.base64++;
      }
    }
  };

  visitar(data);

  return result;
}

export default function DiagnosticoScreen() {
  const [info, setInfo] = useState(null);
  const [performanceTest, setPerformanceTest] = useState(null);
  const [mitsuLoadTest, setMitsuLoadTest] = useState(null);
  const [appsUsageTest, setAppsUsageTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    cargarDiagnostico();
  }, []);

  const cargarDiagnostico = async () => {
    try {
      setLoading(true);

      let totalStorage = null;
      let freeStorage = null;
      let maxMemory = null;

      try {
        totalStorage = await FileSystem.getTotalDiskCapacityAsync();
      } catch {}

      try {
        freeStorage = await FileSystem.getFreeDiskStorageAsync();
      } catch {}

      if (Platform.OS === "android") {
        try {
          maxMemory = await Device.getMaxMemoryAsync();
        } catch {}
      }

      const totalMemory = Device.totalMemory || null;
      const ramGB = totalMemory ? totalMemory / 1024 / 1024 / 1024 : null;
      const freeStorageGB = freeStorage ? freeStorage / 1024 / 1024 / 1024 : null;
      const androidApi = Device.platformApiLevel || null;

      const networkState = await Network.getNetworkStateAsync().catch(() => null);
      const netInfoState = await NetInfo.fetch().catch(() => null);

      const isConnected = networkState?.isConnected === true;
      const isInternetReachable =
        networkState?.isInternetReachable === null ||
        networkState?.isInternetReachable === undefined
          ? isConnected
          : networkState?.isInternetReachable === true;

      const cellularGeneration =
        netInfoState?.details?.cellularGeneration || null;

      const carrier = netInfoState?.details?.carrier || null;

      const diagnostico = {
        appName: Application.applicationName || "Mitsu App",
        appVersion: Application.nativeApplicationVersion || "No disponible",
        buildVersion: Application.nativeBuildVersion || "No disponible",

        brand: Device.brand || "No disponible",
        manufacturer: Device.manufacturer || "No disponible",
        modelName: Device.modelName || "No disponible",
        productName: Device.productName || "No disponible",

        osName: Device.osName || Platform.OS,
        osVersion: Device.osVersion || "No disponible",
        androidApi,

        totalMemory,
        maxMemory,

        totalStorage,
        freeStorage,

        cpuArchitectures: Device.supportedCpuArchitectures || [],

        isDevice: Device.isDevice ? "Dispositivo físico" : "Emulador",

        networkType: networkState?.type || "No disponible",
        isConnected,
        isInternetReachable,
        cellularGeneration,
        carrier,

        cumpleRam: ramGB !== null ? ramGB >= MIN_RAM_GB : false,
        cumpleStorage:
          freeStorageGB !== null ? freeStorageGB >= MIN_FREE_STORAGE_GB : false,
        cumpleAndroid:
          Platform.OS === "android"
            ? androidApi !== null && androidApi >= MIN_ANDROID_API
            : true,
        cumpleRed: isConnected && isInternetReachable,
      };

      setInfo(diagnostico);
      return diagnostico;
    } catch (error) {
      console.log("Error diagnóstico:", error);

      Alert.alert(
        "Error",
        `No se pudo cargar el diagnóstico.\n\nDetalle: ${
          error?.message || "Error desconocido"
        }`,
      );

      return null;
    } finally {
      setLoading(false);
    }
  };

  const medirRendimientoTelefono = async () => {
    try {
      const muestras = [];
      const intervaloEsperado = 100;
      const duracionMedicion = 3000;

      let ultimoTiempo = Date.now();
      const inicioMedicion = Date.now();

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          const ahora = Date.now();
          const diferencia = ahora - ultimoTiempo;
          const retraso = Math.max(0, diferencia - intervaloEsperado);

          muestras.push(retraso);
          ultimoTiempo = ahora;

          if (ahora - inicioMedicion >= duracionMedicion) {
            clearInterval(interval);
            resolve();
          }
        }, intervaloEsperado);
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const inicioCpu = Date.now();

      let acumulado = 0;

      for (let i = 0; i < 850000; i++) {
        acumulado += Math.sqrt(i);
      }

      const tiempoCpu = Date.now() - inicioCpu;

      const retrasoPromedio =
        muestras.length > 0
          ? Math.round(muestras.reduce((a, b) => a + b, 0) / muestras.length)
          : null;

      const retrasoMaximo = muestras.length > 0 ? Math.max(...muestras) : null;

      let fluidez = "Buena";
      let conclusion = "El teléfono responde correctamente durante la prueba.";

      if (
        tiempoCpu > 1200 ||
        (retrasoPromedio !== null && retrasoPromedio > 120) ||
        (retrasoMaximo !== null && retrasoMaximo > 450)
      ) {
        fluidez = "Mala";
        conclusion =
          "El teléfono puede estar lento. Se recomienda cerrar apps abiertas, reiniciar el equipo o revisar almacenamiento.";
      } else if (
        tiempoCpu > 700 ||
        (retrasoPromedio !== null && retrasoPromedio > 70) ||
        (retrasoMaximo !== null && retrasoMaximo > 250)
      ) {
        fluidez = "Regular";
        conclusion =
          "El teléfono responde, pero puede presentar lentitud en algunos momentos.";
      }

      const resultado = {
        fluidez,
        tiempoCpu,
        retrasoPromedio,
        retrasoMaximo,
        muestras: muestras.length,
        conclusion,
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setPerformanceTest(resultado);
      return resultado;
    } catch (error) {
      const resultado = {
        fluidez: "No disponible",
        tiempoCpu: null,
        retrasoPromedio: null,
        retrasoMaximo: null,
        muestras: 0,
        conclusion: "No se pudo completar la prueba de rendimiento.",
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setPerformanceTest(resultado);
      return resultado;
    }
  };

  const medirUsoOtrasApps = async (performanceResult = null) => {
    const rendimiento = performanceResult || performanceTest;

    let posibleAfectacion = "Baja";
    let conclusion =
      "No se detecta afectación evidente por carga externa durante la prueba.";

    if (rendimiento?.fluidez === "Mala") {
      posibleAfectacion = "Alta";
      conclusion =
        "El dispositivo presentó lentitud. Puede deberse a apps abiertas, video, red, almacenamiento bajo o carga local pesada.";
    } else if (rendimiento?.fluidez === "Regular") {
      posibleAfectacion = "Media";
      conclusion =
        "El rendimiento fue regular. Se recomienda cerrar YouTube, mapas, cámara, redes sociales o apps pesadas antes de usar Mitsu App.";
    }

    const resultado = {
      deteccionDirectaApps: "No disponible por permisos del sistema",
      youtubeDetectado: "No disponible por permisos del sistema",
      appsAbiertasDetectadas: "No disponible por permisos del sistema",
      numeroAppsAbiertas: "No disponible por permisos del sistema",
      posibleAfectacion,
      metodo:
        "Expo/React Native no permite consultar directamente otras apps abiertas sin módulo nativo y permisos especiales.",
      recomendacion:
        "Antes de usar Mitsu App se recomienda cerrar YouTube, redes sociales, cámara, mapas, juegos o cualquier app pesada.",
      conclusion,
      fechaPrueba: new Date().toLocaleString("es-MX"),
    };

    setAppsUsageTest(resultado);
    return resultado;
  };

  const medirCargaRealMitsu = async () => {
    const inicioTotal = Date.now();

    try {
      const keys = await AsyncStorage.getAllKeys();

      const palabrasMitsu = [
        "orden",
        "order",
        "workorder",
        "work_order",
        "pendiente",
        "firma",
        "offline",
        "queue",
        "cola",
        "pdf",
        "attachment",
        "evidencia",
        "base64",
        "mitsu",
      ];

      const keysMitsu = keys.filter((key) => {
        const keyLower = String(key).toLowerCase();
        return palabrasMitsu.some((word) => keyLower.includes(word));
      });

      const pares =
        keysMitsu.length > 0 ? await AsyncStorage.multiGet(keysMitsu) : [];

      let totalBytes = 0;
      let posiblesOrdenes = 0;
      let posiblesPdfs = 0;
      let posiblesBase64 = 0;
      let registrosLocales = 0;
      let registrosConErrorParseo = 0;

      const resumenKeys = [];

      const inicioParseo = Date.now();

      for (const [key, value] of pares) {
        const sizeBytes = medirBytesTexto(value || "");
        totalBytes += sizeBytes;
        registrosLocales++;

        const keyLower = String(key || "").toLowerCase();
        const valueLower = String(value || "").toLowerCase();

        let parsed = null;

        try {
          parsed = value ? JSON.parse(value) : null;
        } catch {
          registrosConErrorParseo++;
        }

        const conteo = contarDatosMitsu(parsed, valueLower, keyLower);

        posiblesOrdenes += conteo.ordenes;
        posiblesPdfs += conteo.pdfs;
        posiblesBase64 += conteo.base64;

        resumenKeys.push({
          key: ocultarNombreKey(key),
          sizeBytes,
          ordenes: conteo.ordenes,
          pdfs: conteo.pdfs,
          base64: conteo.base64,
        });
      }

      const tiempoLecturaParseo = Date.now() - inicioParseo;

      const payloadDiagnostico = {
        fecha: new Date().toISOString(),
        totalKeysEncontradas: keys.length,
        keysMitsu: keysMitsu.length,
        registrosLocales,
        posiblesOrdenes,
        posiblesPdfs,
        posiblesBase64,
        totalBytes,
        resumenKeys,
      };

      const inicioArmadoJson = Date.now();
      const jsonFinal = JSON.stringify(payloadDiagnostico);
      const tiempoArmadoJson = Date.now() - inicioArmadoJson;
      const jsonFinalBytes = medirBytesTexto(jsonFinal);
      const tiempoTotal = Date.now() - inicioTotal;

      let riesgoCarga = "Bajo";
      let conclusion =
        "La carga local encontrada no parece pesada. Si el error continúa, revisar app, API, backend, SAP, OData o Cloud Connector.";

      const totalMB = totalBytes / 1024 / 1024;

      if (registrosLocales === 0) {
        riesgoCarga = "Sin carga local detectada";
        conclusion =
          "No se detectaron registros locales relacionados con órdenes, PDFs o cola offline en AsyncStorage.";
      } else if (
        totalMB >= MAX_LOCAL_MB_ALTO ||
        posiblesBase64 >= MAX_BASE64_ALTO
      ) {
        riesgoCarga = "Alto";
        conclusion =
          "Se detectó carga local pesada. Puede estar relacionada con PDFs/base64, órdenes pendientes o cola offline.";
      } else if (
        totalMB >= MAX_LOCAL_MB_MEDIO ||
        posiblesBase64 >= MAX_BASE64_MEDIO
      ) {
        riesgoCarga = "Medio";
        conclusion =
          "La carga local es considerable. Conviene revisar peso de PDFs, cantidad de órdenes pendientes y base64 guardados.";
      }

      const resultado = {
        totalKeysAsyncStorage: keys.length,
        keysMitsu: keysMitsu.length,
        registrosLocales,
        registrosConErrorParseo,
        posiblesOrdenes,
        posiblesPdfs,
        posiblesBase64,
        totalBytes,
        jsonFinalBytes,
        tiempoLecturaParseo,
        tiempoArmadoJson,
        tiempoTotal,
        riesgoCarga,
        conclusion,
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setMitsuLoadTest(resultado);
      return resultado;
    } catch (error) {
      const resultado = {
        totalKeysAsyncStorage: 0,
        keysMitsu: 0,
        registrosLocales: 0,
        registrosConErrorParseo: 0,
        posiblesOrdenes: 0,
        posiblesPdfs: 0,
        posiblesBase64: 0,
        totalBytes: 0,
        jsonFinalBytes: 0,
        tiempoLecturaParseo: null,
        tiempoArmadoJson: null,
        tiempoTotal: Date.now() - inicioTotal,
        riesgoCarga: "No disponible",
        conclusion:
          "No se pudo medir la carga local Mitsu. Revisar almacenamiento local o estructura de datos offline.",
        fechaPrueba: new Date().toLocaleString("es-MX"),
      };

      setMitsuLoadTest(resultado);
      return resultado;
    }
  };

  const obtenerConclusionGeneral = (
    infoBase = info,
    performanceBase = performanceTest,
    mitsuBase = mitsuLoadTest,
    appsBase = appsUsageTest,
  ) => {
    if (!infoBase) return "Sin información suficiente.";

    const problemas = [];

    if (!infoBase.cumpleAndroid) problemas.push("Android menor al recomendado");
    if (!infoBase.cumpleRam) problemas.push("RAM menor a la recomendada");
    if (!infoBase.cumpleStorage) problemas.push("almacenamiento libre bajo");
    if (!infoBase.cumpleRed) problemas.push("red o internet no disponible");

    if (performanceBase?.fluidez === "Mala") {
      problemas.push("teléfono lento o trabándose");
    }

    if (performanceBase?.fluidez === "Regular") {
      problemas.push("rendimiento regular");
    }

    if (mitsuBase?.riesgoCarga === "Alto") {
      problemas.push("carga local Mitsu pesada");
    }

    if (mitsuBase?.riesgoCarga === "Medio") {
      problemas.push("carga local Mitsu considerable");
    }

    if (appsBase?.posibleAfectacion === "Alta") {
      problemas.push("posible afectación alta por apps abiertas");
    }

    if (appsBase?.posibleAfectacion === "Media") {
      problemas.push("posible afectación media por apps abiertas");
    }

    if (!problemas.length) {
      return "El dispositivo, red, almacenamiento, rendimiento y carga local no muestran un problema evidente.";
    }

    return `Se detectaron posibles puntos a revisar: ${problemas.join(", ")}.`;
  };

  const generarContenidoTxt = ({
    diagnostico,
    rendimiento,
    cargaMitsu,
    apps,
    conclusionGeneral,
  }) => {
    const lineas = [];

    agregarLineaTxt(lineas, "Sección", "Campo", "Valor");
    agregarLineaTxt(lineas, "Reporte", "Generado", new Date().toLocaleString("es-MX"));
    agregarLineaTxt(lineas, "Reporte", "Formato", "TXT separado por tabulaciones");
    agregarLineaTxt(lineas, "Reporte", "Uso recomendado", "Abrir en Excel");

    agregarLineaTxt(lineas, "Aplicación", "Nombre", diagnostico?.appName);
    agregarLineaTxt(lineas, "Aplicación", "Versión", diagnostico?.appVersion);
    agregarLineaTxt(lineas, "Aplicación", "Build", diagnostico?.buildVersion);

    agregarLineaTxt(lineas, "Dispositivo", "Marca", diagnostico?.brand);
    agregarLineaTxt(lineas, "Dispositivo", "Fabricante", diagnostico?.manufacturer);
    agregarLineaTxt(lineas, "Dispositivo", "Modelo", diagnostico?.modelName);
    agregarLineaTxt(lineas, "Dispositivo", "Producto", diagnostico?.productName);
    agregarLineaTxt(lineas, "Dispositivo", "Tipo", diagnostico?.isDevice);

    agregarLineaTxt(lineas, "Sistema operativo", "Sistema", diagnostico?.osName);
    agregarLineaTxt(lineas, "Sistema operativo", "Versión", diagnostico?.osVersion);
    agregarLineaTxt(lineas, "Sistema operativo", "Android API", diagnostico?.androidApi);
    agregarLineaTxt(lineas, "Sistema operativo", "Validación", diagnostico?.cumpleAndroid ? "Correcto" : "Revisar");

    agregarLineaTxt(lineas, "Memoria", "RAM total", bytesToGB(diagnostico?.totalMemory));
    agregarLineaTxt(lineas, "Memoria", "Memoria máxima app", bytesToGB(diagnostico?.maxMemory));
    agregarLineaTxt(lineas, "Memoria", "Validación RAM", diagnostico?.cumpleRam ? "Correcto" : "Revisar");

    agregarLineaTxt(lineas, "Almacenamiento", "Almacenamiento total", bytesToGB(diagnostico?.totalStorage));
    agregarLineaTxt(lineas, "Almacenamiento", "Almacenamiento libre", bytesToGB(diagnostico?.freeStorage));
    agregarLineaTxt(lineas, "Almacenamiento", "Validación almacenamiento", diagnostico?.cumpleStorage ? "Correcto" : "Revisar");

    agregarLineaTxt(
      lineas,
      "Procesador",
      "Arquitectura CPU",
      diagnostico?.cpuArchitectures?.length
        ? diagnostico.cpuArchitectures.join(", ")
        : "No disponible",
    );

    agregarLineaTxt(lineas, "Red", "Conectado", diagnostico?.isConnected ? "Sí" : "No");
    agregarLineaTxt(lineas, "Red", "Internet disponible", diagnostico?.isInternetReachable ? "Sí" : "No");
    agregarLineaTxt(lineas, "Red", "Tipo de conexión", traducirTipoRed(diagnostico?.networkType));
    agregarLineaTxt(lineas, "Red", "Red móvil", traducirGeneracionCelular(diagnostico?.cellularGeneration));
    agregarLineaTxt(lineas, "Red", "Compañía", diagnostico?.carrier);
    agregarLineaTxt(lineas, "Red", "Validación red", diagnostico?.cumpleRed ? "Correcto" : "Revisar");

    agregarLineaTxt(lineas, "Rendimiento", "Fluidez", rendimiento?.fluidez);
    agregarLineaTxt(lineas, "Rendimiento", "Tiempo CPU", rendimiento?.tiempoCpu != null ? `${rendimiento.tiempoCpu} ms` : "Sin prueba");
    agregarLineaTxt(lineas, "Rendimiento", "Retraso promedio", rendimiento?.retrasoPromedio != null ? `${rendimiento.retrasoPromedio} ms` : "Sin prueba");
    agregarLineaTxt(lineas, "Rendimiento", "Retraso máximo", rendimiento?.retrasoMaximo != null ? `${rendimiento.retrasoMaximo} ms` : "Sin prueba");
    agregarLineaTxt(lineas, "Rendimiento", "Conclusión", rendimiento?.conclusion || "Sin prueba");

    agregarLineaTxt(lineas, "Apps en segundo plano", "Detección directa", apps?.deteccionDirectaApps);
    agregarLineaTxt(lineas, "Apps en segundo plano", "Posible afectación", apps?.posibleAfectacion);
    agregarLineaTxt(lineas, "Apps en segundo plano", "Método", apps?.metodo);
    agregarLineaTxt(lineas, "Apps en segundo plano", "Recomendación", apps?.recomendacion);
    agregarLineaTxt(lineas, "Apps en segundo plano", "Conclusión", apps?.conclusion);

    agregarLineaTxt(lineas, "Carga Mitsu", "Total keys AsyncStorage", cargaMitsu?.totalKeysAsyncStorage);
    agregarLineaTxt(lineas, "Carga Mitsu", "Keys Mitsu", cargaMitsu?.keysMitsu);
    agregarLineaTxt(lineas, "Carga Mitsu", "Registros locales", cargaMitsu?.registrosLocales);
    agregarLineaTxt(lineas, "Carga Mitsu", "Registros con error parseo", cargaMitsu?.registrosConErrorParseo);
    agregarLineaTxt(lineas, "Carga Mitsu", "Posibles órdenes", cargaMitsu?.posiblesOrdenes);
    agregarLineaTxt(lineas, "Carga Mitsu", "Posibles PDFs", cargaMitsu?.posiblesPdfs);
    agregarLineaTxt(lineas, "Carga Mitsu", "Posibles base64", cargaMitsu?.posiblesBase64);
    agregarLineaTxt(lineas, "Carga Mitsu", "Peso local aproximado", bytesToMB(cargaMitsu?.totalBytes));
    agregarLineaTxt(lineas, "Carga Mitsu", "Peso reporte JSON", bytesToMB(cargaMitsu?.jsonFinalBytes));
    agregarLineaTxt(lineas, "Carga Mitsu", "Tiempo lectura/parseo", cargaMitsu?.tiempoLecturaParseo != null ? `${cargaMitsu.tiempoLecturaParseo} ms` : "Sin prueba");
    agregarLineaTxt(lineas, "Carga Mitsu", "Tiempo armado JSON", cargaMitsu?.tiempoArmadoJson != null ? `${cargaMitsu.tiempoArmadoJson} ms` : "Sin prueba");
    agregarLineaTxt(lineas, "Carga Mitsu", "Tiempo total prueba", cargaMitsu?.tiempoTotal != null ? `${cargaMitsu.tiempoTotal} ms` : "Sin prueba");
    agregarLineaTxt(lineas, "Carga Mitsu", "Riesgo", cargaMitsu?.riesgoCarga);
    agregarLineaTxt(lineas, "Carga Mitsu", "Conclusión", cargaMitsu?.conclusion);

    agregarLineaTxt(lineas, "Conclusión general", "Resultado", conclusionGeneral);
    agregarLineaTxt(lineas, "Seguridad", "Nota", "No se incluyen IP, URL de API ni contenido real de órdenes/PDFs.");

    return `\ufeff${lineas.join("\n")}`;
  };

  const crearArchivoTxt = async (contenido) => {
    const fecha = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);

    const fileName = `diagnostico_mitsu_${fecha}.txt`;
    const uri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(uri, contenido, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return uri;
  };

  const correrPruebas = async () => {
    try {
      setTesting(true);

      const diagnostico = await cargarDiagnostico();
      const rendimiento = await medirRendimientoTelefono();
      const cargaMitsu = await medirCargaRealMitsu();
      const apps = await medirUsoOtrasApps(rendimiento);

      const conclusionGeneral = obtenerConclusionGeneral(
        diagnostico,
        rendimiento,
        cargaMitsu,
        apps,
      );

      Alert.alert("Diagnóstico completo", conclusionGeneral);
    } finally {
      setTesting(false);
    }
  };

  const compartirReporte = async () => {
    try {
      setSharing(true);

      const diagnostico = await cargarDiagnostico();
      const rendimiento = performanceTest || (await medirRendimientoTelefono());
      const cargaMitsu = mitsuLoadTest || (await medirCargaRealMitsu());
      const apps = appsUsageTest || (await medirUsoOtrasApps(rendimiento));

      const conclusionGeneral = obtenerConclusionGeneral(
        diagnostico,
        rendimiento,
        cargaMitsu,
        apps,
      );

      const contenidoTxt = generarContenidoTxt({
        diagnostico,
        rendimiento,
        cargaMitsu,
        apps,
        conclusionGeneral,
      });

      const uri = await crearArchivoTxt(contenidoTxt);

      const disponible = await Sharing.isAvailableAsync();

      if (!disponible) {
        Alert.alert(
          "No disponible",
          "Este dispositivo no permite compartir archivos en este momento.",
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "text/plain",
        dialogTitle: "Compartir diagnóstico Mitsu",
        UTI: "public.plain-text",
      });
    } catch (error) {
      Alert.alert(
        "Error",
        `No se pudo compartir el reporte.\n\nDetalle: ${
          error?.message || "Error desconocido"
        }`,
      );
    } finally {
      setSharing(false);
    }
  };

  const estadoGeneral =
    info &&
    info.cumpleRam &&
    info.cumpleStorage &&
    info.cumpleAndroid &&
    info.cumpleRed &&
    (!appsUsageTest || appsUsageTest.posibleAfectacion !== "Alta") &&
    (!mitsuLoadTest ||
      !["Alto", "No disponible"].includes(mitsuLoadTest.riesgoCarga));

  return (
    <View style={styles.container}>
      <Header title="Diagnóstico" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={74} color={FIORI.accent} />
          </View>

          <Text style={styles.title}>Diagnóstico del dispositivo</Text>

          <Text style={styles.description}>
            Revisa datos del teléfono, versión de app, red, almacenamiento,
            rendimiento y carga local relacionada con órdenes, PDFs o cola offline.
          </Text>

          {loading && !info ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={FIORI.accent} />
              <Text style={styles.loadingText}>Cargando información...</Text>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.statusBox,
                  estadoGeneral ? styles.statusOk : styles.statusWarning,
                ]}
              >
                <Ionicons
                  name={estadoGeneral ? "checkmark-circle-outline" : "warning-outline"}
                  size={22}
                  color={estadoGeneral ? "#15803D" : "#B45309"}
                />

                <Text
                  style={[
                    styles.statusText,
                    {
                      color: estadoGeneral ? "#15803D" : "#B45309",
                    },
                  ]}
                >
                  {estadoGeneral
                    ? "El dispositivo cumple con lo recomendado."
                    : "El dispositivo puede presentar puntos a revisar."}
                </Text>
              </View>

              <Section title="Aplicación">
                <InfoRow label="Nombre" value={info?.appName} />
                <InfoRow label="Versión" value={info?.appVersion} />
                <InfoRow label="Build" value={info?.buildVersion} />
              </Section>

              <Section title="Dispositivo">
                <InfoRow label="Marca" value={info?.brand} />
                <InfoRow label="Fabricante" value={info?.manufacturer} />
                <InfoRow label="Modelo" value={info?.modelName} />
                <InfoRow label="Producto" value={info?.productName} />
                <InfoRow label="Tipo" value={info?.isDevice} />
              </Section>

              <Section title="Sistema operativo">
                <InfoRow label="Sistema" value={info?.osName} />
                <InfoRow label="Versión" value={info?.osVersion} />
                <InfoRow label="Android API" value={info?.androidApi} />
                <InfoRow
                  label="Validación"
                  value={info?.cumpleAndroid ? "Correcto" : "Revisar"}
                  danger={!info?.cumpleAndroid}
                />
              </Section>

              <Section title="Memoria y almacenamiento">
                <InfoRow
                  label="RAM total"
                  value={bytesToGB(info?.totalMemory)}
                  danger={!info?.cumpleRam}
                />
                <InfoRow
                  label="Memoria máxima app"
                  value={bytesToGB(info?.maxMemory)}
                />
                <InfoRow
                  label="Almacenamiento total"
                  value={bytesToGB(info?.totalStorage)}
                />
                <InfoRow
                  label="Almacenamiento libre"
                  value={bytesToGB(info?.freeStorage)}
                  danger={!info?.cumpleStorage}
                />
              </Section>

              <Section title="Red">
                <InfoRow
                  label="Conectado"
                  value={info?.isConnected ? "Sí" : "No"}
                  danger={!info?.isConnected}
                />
                <InfoRow
                  label="Internet"
                  value={info?.isInternetReachable ? "Sí" : "No"}
                  danger={!info?.isInternetReachable}
                />
                <InfoRow
                  label="Tipo"
                  value={traducirTipoRed(info?.networkType)}
                />
                <InfoRow
                  label="Red móvil"
                  value={traducirGeneracionCelular(info?.cellularGeneration)}
                />
                <InfoRow label="Compañía" value={info?.carrier} />
              </Section>

              {performanceTest && (
                <Section title="Rendimiento">
                  <InfoRow
                    label="Fluidez"
                    value={performanceTest.fluidez}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                  <InfoRow
                    label="Tiempo CPU"
                    value={`${performanceTest.tiempoCpu} ms`}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                  <InfoRow
                    label="Retraso promedio"
                    value={`${performanceTest.retrasoPromedio} ms`}
                  />
                  <InfoRow
                    label="Retraso máximo"
                    value={`${performanceTest.retrasoMaximo} ms`}
                  />
                  <InfoRow
                    label="Conclusión"
                    value={performanceTest.conclusion}
                    danger={performanceTest.fluidez === "Mala"}
                  />
                </Section>
              )}

              {appsUsageTest && (
                <Section title="Apps en segundo plano">
                  <InfoRow
                    label="Detección directa"
                    value={appsUsageTest.deteccionDirectaApps}
                  />
                  <InfoRow
                    label="Posible afectación"
                    value={appsUsageTest.posibleAfectacion}
                    danger={appsUsageTest.posibleAfectacion === "Alta"}
                  />
                  <InfoRow
                    label="Conclusión"
                    value={appsUsageTest.conclusion}
                  />
                </Section>
              )}

              {mitsuLoadTest && (
                <Section title="Carga local Mitsu">
                  <InfoRow
                    label="Keys Mitsu"
                    value={String(mitsuLoadTest.keysMitsu)}
                  />
                  <InfoRow
                    label="Registros locales"
                    value={String(mitsuLoadTest.registrosLocales)}
                  />
                  <InfoRow
                    label="Posibles órdenes"
                    value={String(mitsuLoadTest.posiblesOrdenes)}
                  />
                  <InfoRow
                    label="Posibles PDFs"
                    value={String(mitsuLoadTest.posiblesPdfs)}
                  />
                  <InfoRow
                    label="Posibles base64"
                    value={String(mitsuLoadTest.posiblesBase64)}
                  />
                  <InfoRow
                    label="Peso local"
                    value={bytesToMB(mitsuLoadTest.totalBytes)}
                  />
                  <InfoRow
                    label="Riesgo"
                    value={mitsuLoadTest.riesgoCarga}
                    danger={mitsuLoadTest.riesgoCarga === "Alto"}
                  />
                  <InfoRow
                    label="Conclusión"
                    value={mitsuLoadTest.conclusion}
                    danger={mitsuLoadTest.riesgoCarga === "Alto"}
                  />
                </Section>
              )}

              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.8}
                onPress={correrPruebas}
                disabled={testing || sharing}
              >
                {testing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="analytics-outline" size={20} color="#fff" />
                )}

                <Text style={styles.buttonText}>
                  {testing ? "Corriendo pruebas..." : "Correr diagnóstico completo"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.8}
                onPress={compartirReporte}
                disabled={testing || sharing}
              >
                {sharing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="document-text-outline" size={20} color="#fff" />
                )}

                <Text style={styles.buttonText}>
                  {sharing ? "Preparando TXT..." : "Compartir reporte TXT"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.lightButton}
                activeOpacity={0.8}
                onPress={cargarDiagnostico}
                disabled={testing || sharing}
              >
                <Ionicons name="refresh-outline" size={19} color={FIORI.ink} />
                <Text style={styles.lightButtonText}>Actualizar información</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, danger }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={[styles.value, danger && styles.danger]}>
        {value === null || value === undefined || value === ""
          ? "No disponible"
          : String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },

  scroll: {
    padding: 16,
    paddingBottom: 100,
  },

  card: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF4FF",
    borderWidth: 1,
    borderColor: "#CFE7FF",
    marginBottom: 14,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: FIORI.ink,
    textAlign: "center",
  },

  description: {
    marginTop: 8,
    color: FIORI.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 16,
  },

  loadingBox: {
    paddingVertical: 30,
    alignItems: "center",
  },

  loadingText: {
    marginTop: 10,
    color: FIORI.textMuted,
    fontWeight: "700",
  },

  statusBox: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },

  statusOk: {
    backgroundColor: "#DCFCE7",
  },

  statusWarning: {
    backgroundColor: "#FEF3C7",
  },

  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
  },

  section: {
    marginTop: 12,
  },

  sectionTitle: {
    color: FIORI.ink,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
  },

  row: {
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  label: {
    flex: 1,
    color: FIORI.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },

  value: {
    flex: 1.2,
    color: FIORI.ink,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },

  danger: {
    color: FIORI.danger,
  },

  primaryButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: FIORI.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  secondaryButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0B8457",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  lightButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: FIORI.cardSubtle,
    borderWidth: 1,
    borderColor: FIORI.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },

  lightButtonText: {
    color: FIORI.ink,
    fontSize: 14,
    fontWeight: "900",
  },
});