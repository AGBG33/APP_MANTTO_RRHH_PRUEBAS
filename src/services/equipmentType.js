import api from "./api";

export const EQUIPMENT_TYPE = {
  ELEVATOR: "elevador",
  ESCALATOR: "escalera",
};

/**
 * Convierte diferentes valores recibidos o guardados
 * al formato único utilizado por la aplicación.
 *
 * Devuelve:
 * - "elevador"
 * - "escalera"
 * - null cuando no puede identificarlo
 */
export function normalizeEquipmentType(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) {
    return null;
  }

  if (
    raw.includes("ESCAL") ||
    raw === "ESCALERA" ||
    raw === "ESCALERAS"
  ) {
    return EQUIPMENT_TYPE.ESCALATOR;
  }

  if (
    raw.includes("ELEV") ||
    raw === "ELEVADOR" ||
    raw === "ELEVADORES"
  ) {
    return EQUIPMENT_TYPE.ELEVATOR;
  }

  return null;
}

/**
 * Busca primero el tipo en los datos que ya tiene la orden.
 *
 * Importante:
 * Si no encuentra el tipo, devuelve null.
 * Ya no supone automáticamente que es elevador.
 */
export function getEquipmentTypeFromOrder(order) {
  if (!order) {
    return null;
  }

  const possibleValues = [
    order?.tipo_equipo,
    order?.equipmentType,
    order?.EquipmentType,
    order?.equipment_type,
    order?.equipo_tipo,
    order?.Eqart,
    order?.eqart,
    order?.tipo,
    order?.Type,
    order?.DescripcionEquipo,
    order?.description,
  ];

  for (const value of possibleValues) {
    const type = normalizeEquipmentType(value);

    if (type) {
      return type;
    }
  }

  return null;
}

/**
 * Obtiene el tipo directamente desde EquipmentHeaderSet.
 *
 * Usa el api configurado para el ambiente actual.
 * No deja fija la dirección de QAS dentro del archivo.
 */
export async function fetchEquipmentType(equipmentNumber) {
  const equipment = String(equipmentNumber ?? "").trim();

  if (!equipment) {
    return {
      type: null,
      eqart: "",
      equipment: "",
      found: false,
      reason: "missing-equipment",
    };
  }

  // Forma correcta de escapar comillas simples en una clave OData.
  const safeEquipment = equipment.replace(/'/g, "''");

  const endpoint =
    `/api/odata/ZCS_GET_EQUIPMENT_SRV/` +
    `EquipmentHeaderSet('${safeEquipment}')?$format=json`;

  try {
    const response = await api.get(endpoint);

    const equipmentData =
      response?.data?.d ??
      response?.data?.value?.[0] ??
      response?.data ??
      {};

    const eqart = String(
      equipmentData?.Eqart ??
      equipmentData?.EQART ??
      equipmentData?.eqart ??
      "",
    ).trim();

    const type = normalizeEquipmentType(eqart);

    return {
      type,
      eqart,
      equipment,
      found: Boolean(type),
      reason: type
        ? "sap"
        : eqart
          ? "unknown-eqart"
          : "empty-eqart",
      raw: equipmentData,
    };
  } catch (error) {
    console.log(
      "[EquipmentType] Error consultando tipo:",
      equipment,
      error?.response?.status,
      error?.message,
    );

    return {
      type: null,
      eqart: "",
      equipment,
      found: false,
      reason: "request-error",
      error,
    };
  }
}

/**
 * Convierte el valor normalizado al utilizado actualmente por TBMK.
 */
export function getTbmkyEquipmentType(type) {
  const normalized = normalizeEquipmentType(type);

  if (normalized === EQUIPMENT_TYPE.ESCALATOR) {
    return {
      tipo: "escaleras",
      label: "ESCALERAS",
    };
  }

  if (normalized === EQUIPMENT_TYPE.ELEVATOR) {
    return {
      tipo: "elevadores",
      label: "ELEVADORES",
    };
  }

  return {
    tipo: null,
    label: "",
  };
}

/**
 * Texto para mostrar en pantalla.
 */
export function getEquipmentTypeLabel(type) {
  const normalized = normalizeEquipmentType(type);

  if (normalized === EQUIPMENT_TYPE.ESCALATOR) {
    return "Escalera";
  }

  if (normalized === EQUIPMENT_TYPE.ELEVATOR) {
    return "Elevador";
  }

  return "Sin identificar";
}