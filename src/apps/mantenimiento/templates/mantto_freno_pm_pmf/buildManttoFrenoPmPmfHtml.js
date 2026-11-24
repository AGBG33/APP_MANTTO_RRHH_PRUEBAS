// src/services/templates/mantto_freno_pm_pmf/buildManttoFrenoPmPmfHtml.js

import { MANTTO_FRENO_PM_PMF_TEMPLATE } from "./manttoFrenoPmPmf.template";
import {
  escapeHtml,
  fmtDateLocal,
  fmtValue,
  check,
  fmtBienMal,
} from "./manttoFrenoPmPmf.utils";

function replaceAllVars(template, vars) {
  let html = String(template || "");
  Object.entries(vars || {}).forEach(([key, value]) => {
    html = html.replaceAll(`{{${key}}}`, String(value ?? ""));
  });
  return html;
}

function getOrdenValue(orden, keys = []) {
  for (const key of keys) {
    const value = orden?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function userName(user) {
  return (
    user?.nombre ||
    user?.name ||
    user?.fullName ||
    user?.displayName ||
    user?.username ||
    user?.correo ||
    user?.email ||
    ""
  );
}

function bienMalCell(value) {
  return escapeHtml(fmtBienMal(value));
}

export function buildManttoFrenoPmPmfHtml({ orden, form, user } = {}) {
  const orderid =
    getOrdenValue(orden, ["Orderid", "OrderId", "orderid"]) || form?.orderid;

  const cliente = getOrdenValue(orden, [
    "cliente",
    "Client",
    "Name1",
    "nombre_cliente",
  ]);

  const equipo = getOrdenValue(orden, [
    "equipment",
    "Equipment",
    "equipo",
    "Equnr",
  ]);

  const tecnico =
    userName(user) || getOrdenValue(orden, ["tecnico_nombre", "tecnico"]);

  const fechaBase =
    form?.fecha ||
    getOrdenValue(orden, ["start_date", "StartDate", "fecha"]) ||
    new Date();

  const vars = {
    ORDERID: escapeHtml(fmtValue(orderid)),
    CLIENTE: escapeHtml(fmtValue(cliente)),
    EQUIPO: escapeHtml(fmtValue(equipo)),
    TECNICO: escapeHtml(fmtValue(tecnico)),
    FECHA: escapeHtml(fmtDateLocal(fechaBase)),
    HORARIO: escapeHtml(
      fmtValue(form?.horario || `${form?.hora_inicio || "—"} - ${form?.hora_fin || "—"}`)
    ),

    TIPO_MT: escapeHtml(fmtValue(form?.tipo_mt)),
    VELOCIDAD_NOMINAL: escapeHtml(fmtValue(form?.velocidad_nominal)),
    CAPACIDAD: escapeHtml(fmtValue(form?.capacidad)),

    CHK_INSPECCION: check(true),

    TORNILLO_AJUSTE: bienMalCell(form?.operacion_freno?.tornillo_ajuste),
    RUIDO_APERTURA_CIERRE: bienMalCell(form?.operacion_freno?.ruido_apertura_cierre),
    BALATAS_IZQ: bienMalCell(form?.operacion_freno?.balatas_izq),
    BALATAS_DER: bienMalCell(form?.operacion_freno?.balatas_der),

    TAMBOR_ACEITE_GRASA: bienMalCell(form?.tambor?.aceite_grasa),
    TAMBOR_OXIDO: bienMalCell(form?.tambor?.oxido),

    TUBO_TRANSPARENTE: bienMalCell(form?.tubos_drenado?.tubo_transparente),
    TUBO_NEGRO: bienMalCell(form?.tubos_drenado?.tubo_negro),

    MICRO_CONDICION_FISICA: bienMalCell(form?.micro_switch?.condicion_fisica),
    MICRO_CONEXIONES: bienMalCell(form?.micro_switch?.conexiones),

    PRUEBA_FUNCIONAMIENTO: bienMalCell(form?.condicion_operacion?.prueba_funcionamiento),

    OBSERVACIONES: escapeHtml(fmtValue(form?.observaciones, "")),
    RESULTADO_BIEN: check(form?.resultado_total?.bien),
    RESULTADO_SEGUIMIENTO: check(form?.resultado_total?.seguimiento),
    RESULTADO_DETALLE: escapeHtml(fmtValue(form?.resultado_total?.detalle, "")),
  };

  return replaceAllVars(MANTTO_FRENO_PM_PMF_TEMPLATE, vars);
}

export default buildManttoFrenoPmPmfHtml;