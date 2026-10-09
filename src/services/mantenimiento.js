// src/services/mantenimiento.js
import api from './api';

export async function fetchDatosMantenimiento(orderid) {
  const { data } = await api.get(`/api/mantenimiento/datos/${encodeURIComponent(orderid)}`);
  return data;
}

export async function guardarMantElevadores(payload) {
  const { data } = await api.post(`/api/mantenimiento/elevadores`, payload);
  return data;
}
