// src/services/templates/mantto_freno_pm/buildManttoFrenoPmHtml.js

import { MANTTO_FRENO_PM_TEMPLATE } from "./manttoFrenoPm.template";
import {
  escapeHtml,
  fmtDateLocal,
  fmtValue,
  check,
  fmtSiNo,
  fmtBienMal,
  fmtMm,
} from "./manttoFrenoPm.utils";

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

function siNoCell(value) {
  return escapeHtml(fmtSiNo(value));
}

function bienMalCell(value) {
  return escapeHtml(fmtBienMal(value));
}

function photoHtml(src) {
  const s = String(src || "").trim();
  if (!s) return `<span class="muted">Sin foto</span>`;
  if (s.startsWith("data:image/")) return `<img src="${s}" class="photoImg" />`;
  return `<span class="muted">Foto capturada</span>`;
}

function renderTorqueRows(number, label, data = {}, nota = "") {
  return `
    <tr>
      <th rowspan="5">${number}</th>
      <td colspan="2" rowspan="5" class="left">
        Compruebe tres veces<br/>
        ${escapeHtml(nota)}
      </td>
      <td>Dato #1</td>
      <td colspan="2">${escapeHtml(fmtValue(data?.dato1_antes))}</td>
      <td colspan="2">${escapeHtml(fmtValue(data?.dato1_despues))}</td>
      <td rowspan="5">${siNoCell(data?.revisado)}</td>
      <td rowspan="5">${siNoCell(data?.ajuste)}</td>
      <td rowspan="5">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr><td>Dato #2</td><td colspan="2">${escapeHtml(fmtValue(data?.dato2_antes))}</td><td colspan="2">${escapeHtml(fmtValue(data?.dato2_despues))}</td></tr>
    <tr><td>Dato #3</td><td colspan="2">${escapeHtml(fmtValue(data?.dato3_antes))}</td><td colspan="2">${escapeHtml(fmtValue(data?.dato3_despues))}</td></tr>
    <tr><td>Promedio</td><td colspan="2">${escapeHtml(fmtValue(data?.promedio_antes))}</td><td colspan="2">${escapeHtml(fmtValue(data?.promedio_despues))}</td></tr>
    <tr><td>Estado</td><td colspan="2">${bienMalCell(data?.estado_antes)}</td><td colspan="2">${bienMalCell(data?.estado_despues)}</td></tr>
  `;
}

function renderTornilloRows(data = {}) {
  return `
    <tr>
      <th rowspan="2">3</th>
      <td colspan="2" rowspan="2" class="left">
        Revisar con la mano si está completamente apretado.
      </td>
      <td>Lado izquierdo</td>
      <td colspan="2">${bienMalCell(data?.izq_antes)}</td>
      <td colspan="2">${bienMalCell(data?.izq_despues)}</td>
      <td rowspan="2">${siNoCell(data?.revisado)}</td>
      <td rowspan="2">${siNoCell(data?.ajuste)}</td>
      <td rowspan="2">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr>
      <td>Lado derecho</td>
      <td colspan="2">${bienMalCell(data?.der_antes)}</td>
      <td colspan="2">${bienMalCell(data?.der_despues)}</td>
    </tr>
  `;
}

function renderBobinaRows(data = {}) {
  return `
    <tr>
      <th rowspan="2">4</th>
      <td colspan="2" rowspan="2" class="left">Recorrido de bobina.</td>
      <td>Lado izquierdo</td>
      <td colspan="2">${escapeHtml(fmtMm(data?.izq_antes))}</td>
      <td colspan="2">${escapeHtml(fmtMm(data?.izq_despues))}</td>
      <td rowspan="2">${siNoCell(data?.revisado)}</td>
      <td rowspan="2">${siNoCell(data?.ajuste)}</td>
      <td rowspan="2">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr>
      <td>Lado derecho</td>
      <td colspan="2">${escapeHtml(fmtMm(data?.der_antes))}</td>
      <td colspan="2">${escapeHtml(fmtMm(data?.der_despues))}</td>
    </tr>
  `;
}

function renderMicroRecorridoRows(data = {}) {
  return `
    <tr>
      <th rowspan="4">5</th>
      <td colspan="2" rowspan="4" class="left">Recorrido del micro switch de freno.</td>
      <td rowspan="2">Izquierdo</td>
      <td>Sup. antes</td><td>Inf. antes</td><td>Sup. después</td><td>Inf. después</td>
      <td rowspan="4">${siNoCell(data?.revisado)}</td>
      <td rowspan="4">${siNoCell(data?.ajuste)}</td>
      <td rowspan="4">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr>
      <td>${bienMalCell(data?.izq_sup_antes)}</td>
      <td>${bienMalCell(data?.izq_inf_antes)}</td>
      <td>${bienMalCell(data?.izq_sup_despues)}</td>
      <td>${bienMalCell(data?.izq_inf_despues)}</td>
    </tr>
    <tr>
      <td rowspan="2">Derecho</td>
      <td>Sup. antes</td><td>Inf. antes</td><td>Sup. después</td><td>Inf. después</td>
    </tr>
    <tr>
      <td>${bienMalCell(data?.der_sup_antes)}</td>
      <td>${bienMalCell(data?.der_inf_antes)}</td>
      <td>${bienMalCell(data?.der_sup_despues)}</td>
      <td>${bienMalCell(data?.der_inf_despues)}</td>
    </tr>
  `;
}

function renderMicroFuncionRows(data = {}) {
  return `
    <tr>
      <th rowspan="2">6</th>
      <td colspan="2" rowspan="2" class="left">Freno 1 / Freno 2</td>
      <td>Izquierdo freno #1</td>
      <td colspan="2">${bienMalCell(data?.izq_antes)}</td>
      <td colspan="2">${bienMalCell(data?.izq_despues)}</td>
      <td rowspan="2">${siNoCell(data?.revisado)}</td>
      <td rowspan="2">${siNoCell(data?.ajuste)}</td>
      <td rowspan="2">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr>
      <td>Derecho freno #2</td>
      <td colspan="2">${bienMalCell(data?.der_antes)}</td>
      <td colspan="2">${bienMalCell(data?.der_despues)}</td>
    </tr>
  `;
}

function renderTamborRows(data = {}) {
  return `
    <tr>
      <th rowspan="2">7</th>
      <td colspan="2">¿Existe lubricante/plástico?</td>
      <td>¿Tiene?</td>
      <td colspan="2">${siNoCell(data?.lubricante_antes)}</td>
      <td colspan="2">${siNoCell(data?.lubricante_despues)}</td>
      <td rowspan="2">${siNoCell(data?.revisado)}</td>
      <td rowspan="2">${siNoCell(data?.ajuste)}</td>
      <td rowspan="2">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr>
      <td colspan="2">¿Existe óxido?</td>
      <td>¿Tiene?</td>
      <td colspan="2">${siNoCell(data?.oxido_antes)}</td>
      <td colspan="2">${siNoCell(data?.oxido_despues)}</td>
    </tr>
  `;
}

function renderTuboRows(data = {}) {
  return `
    <tr>
      <th rowspan="2">8</th>
      <td colspan="2" rowspan="2">¿Condición?</td>
      <td>Conexión</td>
      <td colspan="2">${siNoCell(data?.conexion_antes)}</td>
      <td colspan="2">${siNoCell(data?.conexion_despues)}</td>
      <td rowspan="2">${siNoCell(data?.revisado)}</td>
      <td rowspan="2">${siNoCell(data?.ajuste)}</td>
      <td rowspan="2">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    <tr>
      <td>Depósito</td>
      <td colspan="2">${siNoCell(data?.deposito_antes)}</td>
      <td colspan="2">${siNoCell(data?.deposito_despues)}</td>
    </tr>
  `;
}

function renderOperacionRows(data = {}) {
  const row = (label, key) => `
    <tr>
      <td colspan="3">${escapeHtml(label)}</td>
      <td colspan="2">${bienMalCell(data?.[key])}</td>
    </tr>
  `;

  return `
    <tr>
      <th rowspan="5">9</th>
      <td colspan="2" rowspan="5" class="left">Prueba de funcionamiento</td>
      <td colspan="3">Revisión</td>
      <td colspan="2">Condición</td>
      <td rowspan="5">${siNoCell(data?.revisado)}</td>
      <td colspan="2" rowspan="5">${escapeHtml(fmtValue(data?.revision_sma))}</td>
    </tr>
    ${row("Ruido entre zapata y tambor", "ruido_zapata_tambor")}
    ${row("Ruido entre cubierta y cables", "ruido_cubierta_cables")}
    ${row("Ruido entre cubiertas y polea", "ruido_cubiertas_polea")}
    ${row("Ruido excesivo en frenos", "ruido_excesivo")}
  `;
}

export function buildManttoFrenoPmHtml({ orden, form, user } = {}) {
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

    TIPO_MAQUINA: escapeHtml(fmtValue(form?.tipo_maquina, "")),
    VELOCIDAD_NOMINAL: escapeHtml(fmtValue(form?.velocidad_nominal)),
    CAPACIDAD: escapeHtml(fmtValue(form?.capacidad)),

    CHK_REVISION: check(form?.tipo_reporte === "revision"),
    CHK_OVERHAUL: check(form?.tipo_reporte === "overhaul"),

    TORQUE_ESTATICO_ROWS: renderTorqueRows(
      1,
      "Torque estático",
      form?.torque_estatico || {},
      "SET 1=0 / SET0=1. SW1"
    ),
    TORQUE_DINAMICO_ROWS: renderTorqueRows(
      2,
      "Torque dinámico",
      form?.torque_dinamico || {},
      "SET 1=0 / SET0=B. SW1"
    ),
    TORNILLO_ROWS: renderTornilloRows(form?.tornillo || {}),
    BOBINA_ROWS: renderBobinaRows(form?.bobina || {}),
    MICRO_RECORRIDO_ROWS: renderMicroRecorridoRows(form?.micro_recorrido || {}),
    MICRO_FUNCION_ROWS: renderMicroFuncionRows(form?.micro_funcion || {}),
    TAMBOR_ROWS: renderTamborRows(form?.tambor || {}),
    TUBO_ROWS: renderTuboRows(form?.tubo || {}),
    OPERACION_ROWS: renderOperacionRows(form?.operacion || {}),

    RESULTADO_BIEN: check(form?.resultado_total?.bien),
    RESULTADO_SEGUIMIENTO: check(form?.resultado_total?.seguimiento),
    RESULTADO_DETALLE: escapeHtml(fmtValue(form?.resultado_total?.detalle, "")),

    FOTO_LADO_IZQUIERDO: photoHtml(form?.fotos?.lado_izquierdo),
    FOTO_LADO_DERECHO: photoHtml(form?.fotos?.lado_derecho),
    OTRO_1_TITULO: escapeHtml(fmtValue(form?.fotos?.otro_1_titulo, "")),
    OTRO_2_TITULO: escapeHtml(fmtValue(form?.fotos?.otro_2_titulo, "")),
    FOTO_OTRO_1: photoHtml(form?.fotos?.otro_1),
    FOTO_OTRO_2: photoHtml(form?.fotos?.otro_2),
  };

  return replaceAllVars(MANTTO_FRENO_PM_TEMPLATE, vars);
}

export default buildManttoFrenoPmHtml;