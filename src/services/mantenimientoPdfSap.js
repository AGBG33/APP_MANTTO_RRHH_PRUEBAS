// src/services/mantenimientoPdfSap.js
import api from "./api";
import * as FileSystem from "expo-file-system/legacy";

export async function subirPdfMantenimientoASap({
  orderid,
  pdfUri,
  fileName = "reporte_mantenimiento.pdf",
  token, // ✅ si tu api NO inyecta token automáticamente
}) {
  if (!orderid) throw new Error("orderid requerido");
  if (!pdfUri) throw new Error("pdfUri requerido");

  // Lee el PDF generado (file://...) a base64 (SIN prefijo data:)
  const base64 = await FileSystem.readAsStringAsync(pdfUri, { encoding: "base64" });

  const body = {
    WorkOrderHeader: { Orderid: String(orderid) },
    Attachments: [
      {
        DocId: String(orderid),
        FileName: fileName,
        MimeType: "pdf",
        Base64: base64,
      },
    ],
    Return: [],
  };

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const { data } = await api.post(
    "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderSet",
    body,
    { headers }
  );

  return data;
}
