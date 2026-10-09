// src/services/templates/mantto_cables/buildManttoCablesHtml.js

import { MANTTO_CABLES_TEMPLATE } from "./manttoCables.template";
import {
  escapeHtml,
  fmtDateLocal,
  fmtTimeLocal,
  fmtValue,
  numberOrDash,
  check,
} from "./manttoCables.utils";

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

function renderDiametrosRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    return `<tr><td colspan="6">Sin datos capturados.</td></tr>`;
  }

  return list
    .map((r) => {
      return `
        <tr>
          <td>${escapeHtml(r?.cable_no || "")}</td>
          <td>${escapeHtml(numberOrDash(r?.diametro_mm, " mm"))}</td>
          <td>${escapeHtml(numberOrDash(r?.parte_desgaste_mm, " mm"))}</td>
          <td>${escapeHtml(numberOrDash(r?.parte_intacta_mm, " mm"))}</td>
          <td>${escapeHtml(numberOrDash(r?.desgaste_pct, "%"))}</td>
          <td>${r?.peor ? "Sí" : "No"}</td>
        </tr>
      `;
    })
    .join("");
}

function renderRupturasRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    return `<tr><td colspan="5">Sin datos capturados.</td></tr>`;
  }

  return list
    .map((r) => {
      return `
        <tr>
          <td>${escapeHtml(r?.cable_no || "")}</td>
          <td>${r?.hay ? "Sí" : "No"}</td>
          <td>${escapeHtml(fmtValue(r?.rupturas_por_paso))}</td>
          <td>${escapeHtml(fmtValue(r?.posicion_cabina))}</td>
          <td>${r?.cambio ? "Cambio" : "OK"}</td>
        </tr>
      `;
    })
    .join("");
}

function labelTension(value) {
  if (value === "bien") return "☑ La tensión de los cables se encuentra bien";
  if (value === "pendiente_corregir")
    return "☑ La tensión se encuentra mal, pendiente de corregir";
  if (value === "corregido")
    return "☑ La tensión se encuentra mal, pero se corrige";
  return "—";
}

function labelTerminales(value) {
  if (value === "grietas") return "☑ Presenta grietas / daños";
  if (value === "grasa")
    return "☑ Hay presencia de grasa negra sobre el Metal Babbit";
  if (value === "sin_anomalias") return "☑ No se encuentran anomalías";
  return "—";
}

function renderResultadoTotal(resultado = {}) {
  const parts = [];

  if (resultado?.bien) parts.push("☑ Bien / La condición es buena");
  if (resultado?.cambio_inmediato) parts.push("☑ Cambio inmediato");
  if (resultado?.programar_cambio) parts.push("☑ Programar cambio");

  return parts.length ? parts.join("<br/>") : "—";
}

export function buildManttoCablesHtml({ orden, form, user } = {}) {
  const orderid =
    getOrdenValue(orden, ["Orderid", "OrderId, orderid"]) || form?.orderid;

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
    user?.nombre ||
    user?.name ||
    user?.fullName ||
    user?.displayName ||
    user?.username ||
    getOrdenValue(orden, ["tecnico_nombre", "tecnico"]) ||
    "";

  const fechaBase =
    form?.fecha ||
    getOrdenValue(orden, ["start_date", "StartDate", "fecha"]) ||
    new Date();

  const horaInicio = form?.hora_inicio || fmtTimeLocal(form?.startMs);
  const horaFin = form?.hora_fin || fmtTimeLocal(form?.finishMs);

  const vars = {
    ORDERID: escapeHtml(fmtValue(orderid)),
    CLIENTE: escapeHtml(fmtValue(cliente)),
    EQUIPO: escapeHtml(fmtValue(equipo)),
    TECNICO: escapeHtml(fmtValue(tecnico)),
    FECHA: escapeHtml(fmtDateLocal(fechaBase)),
    HORARIO: escapeHtml(
      horaInicio !== "—" || horaFin !== "—"
        ? `${horaInicio} - ${horaFin}`
        : "—"
    ),

    TIEMPO_USO_CABLES: escapeHtml(fmtValue(form?.tiempo_uso_cables)),
    DIAMETRO_ESTANDAR: escapeHtml(
      numberOrDash(form?.diametro_estandar_mm, " mm")
    ),
    CANTIDAD_CABLES: escapeHtml(fmtValue(form?.cantidad_cables || 8)),

    CHK_OVERHAUL: check(form?.tipo_reporte === "overhaul"),
    CHK_AJUSTE: check(form?.tipo_reporte === "ajuste_reparacion_sustitucion"),

    DIAMETROS_ROWS: renderDiametrosRows(form?.seccion_diametros || []),
    RUPTURAS_ROWS: renderRupturasRows(form?.seccion_rupturas || []),

    LONGITUD_ENCONTRADO: form?.seccion_longitud?.encontrado ? "Sí" : "No",
    LONGITUD_CABLE: escapeHtml(fmtValue(form?.seccion_longitud?.cable_no)),
    LONGITUD_POSICION: escapeHtml(
      fmtValue(form?.seccion_longitud?.posicion_cabina)
    ),
    LONGITUD_MM: escapeHtml(
      numberOrDash(form?.seccion_longitud?.longitud_mm, " mm")
    ),

    OXIDO_ENCONTRADO: form?.seccion_oxido?.encontrado ? "Sí" : "No",
    OXIDO_ALCANCE: escapeHtml(fmtValue(form?.seccion_oxido?.alcance)),
    OXIDO_CABLE: escapeHtml(fmtValue(form?.seccion_oxido?.cable_no)),
    OXIDO_POSICION: escapeHtml(
      fmtValue(form?.seccion_oxido?.posicion_cabina)
    ),

    TENSION_ESTADO: escapeHtml(labelTension(form?.seccion_tension?.estado)),

    DEF_ENCONTRADO: form?.seccion_deformaciones?.encontrado ? "Sí" : "No",
    DEF_CABLE: escapeHtml(fmtValue(form?.seccion_deformaciones?.cable_no)),
    DEF_POSICION: escapeHtml(
      fmtValue(form?.seccion_deformaciones?.posicion_cabina)
    ),
    DEF_PROBLEMA: escapeHtml(
      fmtValue(form?.seccion_deformaciones?.problema)
    ),

    TERMINALES_ESTADO: escapeHtml(
      labelTerminales(form?.seccion_terminales?.estado)
    ),

    RESULTADO_TOTAL: renderResultadoTotal(form?.resultado_total || {}),
    TIPOS_PROBLEMA: escapeHtml(
      Array.isArray(form?.resultado_total?.tipos_problema)
        ? form.resultado_total.tipos_problema.join(", ")
        : "—"
    ),
    DETALLE_RESULTADO: escapeHtml(fmtValue(form?.resultado_total?.detalle)),
  };

  return replaceAllVars(MANTTO_CABLES_TEMPLATE, vars);
}

export default buildManttoCablesHtml;