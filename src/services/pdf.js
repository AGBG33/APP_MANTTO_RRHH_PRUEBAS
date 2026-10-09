// src/services/pdf.js
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

// Genera PDF y abre el menú para ver/guardar/compartir (esto es tu "descargar")
export async function generarYCompartirPdf(
  html,
  fileName = "reporte_mantenimiento_elevadores.pdf"
) {
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
  }
  return uri;
}

// ✅ Lee un archivo (PDF) a Base64 (SIN prefijo data:)
export async function leerArchivoComoBase64(uri) {
  if (!uri) throw new Error("Falta uri para leer base64");
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}
