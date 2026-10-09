import { Platform } from "react-native";
import * as Device from "expo-device";

export function sanitizeBulkPart(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getDeviceModelForBulkId() {
  const rawModel =
    Device.modelName ||
    Device.productName ||
    Device.manufacturer ||
    Device.brand ||
    Platform.OS ||
    "DISPOSITIVO";

  return sanitizeBulkPart(rawModel).slice(0, 24) || "DISPOSITIVO";
}

export function buildWorkOrderBulkId({
  firstOrderId,
  timestampMs = Date.now(),
} = {}) {
  const cleanTimestamp = String(
    Number.isFinite(Number(timestampMs))
      ? Math.trunc(Number(timestampMs))
      : Date.now(),
  );

  const cleanOrderId =
    sanitizeBulkPart(firstOrderId || "SIN_ORDEN") || "SIN_ORDEN";

  const cleanDeviceModel = getDeviceModelForBulkId();

  return `PAQUETE_${cleanTimestamp}_${cleanOrderId}_${cleanDeviceModel}`;
}