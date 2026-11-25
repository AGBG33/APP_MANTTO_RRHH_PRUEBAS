import api from "../../../core/api/index";
import {
  buildWorkOrderBulkId,
} from "../../../utils/workOrderBulkId";

const WORK_ORDER_BULK_ENDPOINT =
  "/api/odata/ZCS_CHANGE_WORKORDER_SRV/WorkOrderBulkSet";

// Trabajadores[0] es el técnico principal. Solo se envían auxiliares capturados.
function buildWorkOrderRepSet(trabajadores = []) {
  if (!Array.isArray(trabajadores)) return [];
  return trabajadores.slice(1)
    .map(t => ({
      NumNomina: String(t?.nomina ?? '').trim(),
      Nombre: String(t?.nombre ?? '').trim(),
    }))
    .filter(t => t.NumNomina && t.Nombre);
}

export function buildTbmkyBulkPayload({
  orderId,
  pdfBase64,
  pdfLocalRef = null,
  fileName,
  trabajadores = [],
}) {
  const cleanOrderId = String(orderId || '').trim();
  const isOfflineFile = pdfLocalRef?.__sapQueueLocalFileV1 === true &&
    typeof pdfLocalRef.uri === 'string' && pdfLocalRef.uri.startsWith('file://');

  const originalBase64 = typeof pdfBase64 === 'string' ? pdfBase64 : '';
  const withoutPrefix = originalBase64.startsWith('data:application/pdf;base64,')
    ? originalBase64.slice('data:application/pdf;base64,'.length) : originalBase64;
  const cleanBase64 = /\s/.test(withoutPrefix) ? withoutPrefix.replace(/\s/g, '') : withoutPrefix;
  const cleanFileName = String(fileName || ('TBMKY_' + cleanOrderId + '.pdf')).trim();

  if (!cleanOrderId) throw Error('subirPdfOrden: falta orderId');
  if (!isOfflineFile && (!cleanBase64 || cleanBase64.length < 200)) {
    throw Error('subirPdfOrden: PDF Base64 vacío o demasiado corto');
  }

  return {
    BulkId: buildWorkOrderBulkId({ firstOrderId: cleanOrderId }),
    WorkOrderSet: [{
      OrderId: cleanOrderId,
      WorkOrderHeader: { Orderid: cleanOrderId },
      WorkOrderUserStatusSet: [
        { UserStText: '0200', Langu: 'ES', Inactive: '' },
        { UserStText: '0100', Langu: 'ES', Inactive: 'X' },
      ],
      Attachments: [{
        DocId: cleanOrderId,
        FileName: cleanFileName,
        MimeType: 'application/pdf',
        Base64: isOfflineFile ? pdfLocalRef : cleanBase64,
      }],
      Return: [],
      WorkOrderRepSet: buildWorkOrderRepSet(trabajadores),
    }],
  };
}

// Registrar metadatos sin duplicar los PDF completos en memoria.
function logBulkPayload(label, payload) {
  try {
    const ordenes = (payload?.WorkOrderSet || []).map(orden => ({
      OrderId: orden?.OrderId,
      estatus: (orden?.WorkOrderUserStatusSet || []).map(x => x.UserStText),
      cantidadAuxiliares: orden?.WorkOrderRepSet?.length || 0,
      archivos: (orden?.Attachments || []).map(a => ({
        FileName: a?.FileName,
        MimeType: a?.MimeType,
        caracteresBase64: typeof a?.Base64 === 'string' ? a.Base64.length : null,
        desdeArchivoLocal: a?.Base64?.__sapQueueLocalFileV1 === true,
      })),
    }));
    console.log(label, { BulkId: payload?.BulkId, ordenes });
  } catch (error) {
    console.warn('[TBMKY] Resumen no disponible:', error?.message);
  }
}

export async function subirPdfOrden({
  orderId,
  pdfBase64,
  fileName,
  trabajadores = [],
}) {
  const bulkPayload = buildTbmkyBulkPayload({
    orderId,
    pdfBase64,
    fileName,
    trabajadores,
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