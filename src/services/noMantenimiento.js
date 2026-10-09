// src/services/noMantenimiento.js
import api from "./api";

export const ESTATUS_CARTA_NO_MANTTO = "0600";

export async function fetchDatosNoMantenimiento(orderid) {
  const id = String(orderid || "").trim();

  if (!id) {
    throw new Error("Falta orderid para consultar datos de no mantenimiento.");
  }

  const res = await api.get(`/api/carta-no-mantenimiento/datos/${id}`);
  return res.data;
}

export async function guardarCartaNoMantenimiento(payload = {}) {
  const orderid = String(payload?.orderid || payload?.Orderid || "").trim();

  if (!orderid) {
    throw new Error("Falta orderid para guardar la carta de no mantenimiento.");
  }

  const body = {
    ...payload,

    orderid,
    Orderid: orderid,

    // Nueva regla:
    // Carta No Mantto únicamente se identifica con 0600.
    estatus_code: ESTATUS_CARTA_NO_MANTTO,
    userstatus: ESTATUS_CARTA_NO_MANTTO,
    causa_code: ESTATUS_CARTA_NO_MANTTO,
  };

  const res = await api.post("/api/carta-no-mantenimiento", body);
  return res.data;
}