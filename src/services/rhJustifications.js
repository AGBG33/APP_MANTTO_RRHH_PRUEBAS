// src/services/rhJustifications.js
// Registra el motivo de un retardo (P10) o salida anticipada (P20).
// No reintenta automáticamente para evitar duplicados si ocurre un timeout.
import api from "./api";

const ENDPOINT = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/JustificationLogSet";
const RH_QAS_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";

export function prepararJustificacionRH({ personalNumber, enterDate, enterHour,
  registerType, motivo, comentario, idLog = "" }) {
  const numero = String(personalNumber ?? "").trim();
  const fecha = String(enterDate ?? "").trim();
  const hora = String(enterHour ?? "").trim();
  const tipo = String(registerType ?? "").trim().toUpperCase();
  const razon = String(motivo ?? "").trim();
  const texto = String(comentario ?? "").trim();

  if (!/^\d{1,8}$/.test(numero)) throw Error("Número de empleado no válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw Error("Fecha de registro inválida.");
  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(hora)) throw Error("Hora de registro inválida.");
  if (!["P10", "P20"].includes(tipo)) throw Error("Solo se justifican entradas y salidas.");
  if (!["Personal", "Laboral"].includes(razon)) throw Error("Selecciona motivo Personal o Laboral.");
  if (!texto) throw Error("Escribe un comentario para justificar tu registro.");

  // Status y Message son valores de respuesta de SAP; no se inventa una confirmación.
  // Id_log se manda vacío hasta confirmar si el backend lo asigna o exige una referencia.
  return {
    PersonalNumber: numero,
    WorkDate: fecha,
    RegisterHourLate: hora,
    RegisterType: tipo,
    IncidentType: razon,
    ReasonType: razon,
    Comment: texto,
    Id_log: String(idLog ?? "").trim(),
    Status: "",
    Message: "",
  };
}

export async function enviarJustificacionRH(payload) {
  const response = await api.post(ENDPOINT, payload, {
    baseURL: RH_QAS_BASE,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    timeout: 45000,
  });
  const body = response?.data?.d ?? response?.data ?? {};
  const estado = String(body?.Status ?? "").trim().toUpperCase();
  const mensaje = String(body?.Message ?? "").trim();
  if (response.status < 200 || response.status >= 300 || response?.data?.error ||
      (estado !== "" && estado !== "S")) {
    throw Error(mensaje || "No se pudo registrar la justificación.");
  }
  // HTTP 2xx por sí solo no demuestra persistencia en la tabla SAP.
  return {
    httpStatus: response.status,
    status: estado,
    idLog: String(body?.Id_log ?? "").trim(),
    message: mensaje,
  };
}