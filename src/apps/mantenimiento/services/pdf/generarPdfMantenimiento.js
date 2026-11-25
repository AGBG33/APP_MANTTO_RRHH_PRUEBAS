// Generador unico de PDF para el modulo de Mantenimiento.
// Adaptado de Front/Ale-dev: mantiene "Pagina X de Y" y permite devolver solo URI.
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { addPageNumbersToPdfBase64 } from "../../pdf/addPageNumbersToPdf";

export async function generarPdfMantenimiento({ html, incluirBase64 = false } = {}) {
  const contenido = String(html || "");
  if (!contenido.trim()) {
    throw new Error("No hay contenido para el PDF de mantenimiento.");
  }

  const inicio = Date.now();
  // La numeracion mediante pdf-lib requiere Base64 temporalmente.
  // Si la vista solo muestra el archivo, no conservamos ese Base64 en estado.
  const resultado = await Print.printToFileAsync({
    html: contenido,
    base64: true,
  });
  if (!resultado?.uri || !resultado?.base64) {
    throw new Error("No se pudo generar el PDF de mantenimiento.");
  }

  const pdfNumerado = await addPageNumbersToPdfBase64(resultado.base64);
  if (!pdfNumerado || pdfNumerado.length < 200) {
    throw new Error("No se pudo numerar el PDF de mantenimiento.");
  }
  await FileSystem.writeAsStringAsync(resultado.uri, pdfNumerado, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let sizeBytes = 0;
  try {
    const info = await FileSystem.getInfoAsync(resultado.uri);
    if (!info.exists) throw new Error("No se encontro el PDF final.");
    sizeBytes = Number(info.size || 0);
  } catch (error) {
    console.warn("[PDF MANTTO] No se pudo medir el PDF:", error?.message || error);
  }
  console.log("[PDF MANTTO] Documento listo", {
    sizeKB: sizeBytes
      ? Math.round(sizeBytes / 1024)
      : Math.round(pdfNumerado.length * 0.75 / 1024),
    tiempoMs: Date.now() - inicio,
    entregaBase64: !!incluirBase64,
  });

  return {
    uri: resultado.uri,
    base64: incluirBase64 ? pdfNumerado : null,
    sizeBytes,
  };
}
