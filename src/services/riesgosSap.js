import api from "./api";
import {
  buildWorkOrderBulkId,
} from "../utils/workOrderBulkId";

const WORK_ORDER_BULK_ENDPOINT =
  "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

export function buildTbmkyBulkPayload({ orderId, pdfBase64, fileName }) {
  const cleanOrderId = String(orderId || "").trim();
  const cleanBase64 = String(pdfBase64 || "")
    .replace(/^data:application\/pdf;base64,/, "")
    .replace(/\s/g, "")
    .trim();
  const cleanFileName = String(
    fileName || `TBMKY_${cleanOrderId}.pdf`,
  ).trim();

  if (!cleanOrderId) throw new Error("subirPdfOrden: falta orderId");
  if (!cleanBase64 || cleanBase64.length < 200) {
    throw new Error("subirPdfOrden: pdfBase64 vacío o muy corto");
  }

  return {
    BulkId: buildWorkOrderBulkId({
      firstOrderId: cleanOrderId,
    }),
    WorkOrderSet: [
      {
        OrderId: cleanOrderId,
        WorkOrderHeader: { Orderid: cleanOrderId },
        WorkOrderUserStatusSet: [
          { UserStText: "0200", Langu: "ES", Inactive: "" },
          { UserStText: "0100", Langu: "ES", Inactive: "X" },
        ],
        Attachments: [
          {
            DocId: cleanOrderId,
            FileName: cleanFileName,
            MimeType: "application/pdf",
            Base64: cleanBase64,
          },
        ],
        Return: [],
      },
    ],
  };
}


function logBulkPayload(label, payload) {
  try {
    const payloadParaLog = JSON.parse(
      JSON.stringify(payload),
    );

    payloadParaLog.WorkOrderSet?.forEach((order) => {
      order.Attachments?.forEach((attachment) => {
        const base64 = String(attachment.Base64 || "");

        attachment.Base64 =
          `<<BASE64 OMITIDO: ${base64.length} caracteres>>`;
      });
    });

    console.log(label);
    console.log(JSON.stringify(payloadParaLog, null, 2));
  } catch (error) {
    console.log(
      `${label} No se pudo imprimir el payload:`,
      error,
    );
  }
}


export async function subirPdfOrden({
  orderId,
  pdfBase64,
  fileName,
}) {
  const bulkPayload = buildTbmkyBulkPayload({
    orderId,
    pdfBase64,
    fileName,
  });

  console.log(
    "[TBMKY][BULK][URL]",
    WORK_ORDER_BULK_ENDPOINT,
  );

  logBulkPayload(
    "[TBMKY][BULK][PAYLOAD FINAL]",
    bulkPayload,
  );

  try {
    const response = await api.post(
      WORK_ORDER_BULK_ENDPOINT,
      bulkPayload,
      {
        timeout: 300000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log(
      "[TBMKY][BULK][RESPUESTA SAP]",
      JSON.stringify(response?.data, null, 2),
    );

    return {
      ok: true,
      orderId: String(orderId || "").trim(),
      BulkId: bulkPayload.BulkId,
      sap: response?.data ?? null,
    };
  } catch (error) {
    console.log(
      "[TBMKY][BULK][ERROR]",
      JSON.stringify(
        error?.response?.data || {
          message: error?.message,
          code: error?.code,
        },
        null,
        2,
      ),
    );

    throw error;
  }
}