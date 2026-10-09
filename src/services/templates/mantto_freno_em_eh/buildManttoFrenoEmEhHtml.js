import { MANTTO_FRENO_EM_EH_TEMPLATE } from "./manttoFrenoEmEh.template";
import {
  escapeHtml,
  fmtDateLocal,
  fmtValue,
  check,
  fmtSiNo,
  fmtBienMal,
  fmtMm,
  fmtPct,
} from "./manttoFrenoEmEh.utils";

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

function boolCell(value) {
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

function renderPinesRows(p = {}) {
  return `
    <tr>
      <th rowspan="2">1a</th>
      <td colspan="2" rowspan="2" class="left">Kit con lubricación<br/><span class="small">Debe actualizarse libre de lubricación</span></td>
      <td>Óxido</td>
      <td>${boolCell(p?.kitLubricacion?.oxido_antes)}</td>
      <td>${boolCell(p?.kitLubricacion?.oxido_despues)}</td>
      <td rowspan="4">${boolCell(p?.revisado)}</td>
      <td rowspan="4">${escapeHtml(fmtValue(p?.revision_sma))}</td>
    </tr>
    <tr>
      <td>Lubricación</td>
      <td>${bienMalCell(p?.kitLubricacion?.lubricacion_antes)}</td>
      <td>${bienMalCell(p?.kitLubricacion?.lubricacion_despues)}</td>
    </tr>
    <tr>
      <th rowspan="2">1b</th>
      <td colspan="2" rowspan="2" class="left">Kit libre de lubricación</td>
      <td>Giro libre</td>
      <td>${bienMalCell(p?.kitLibre?.giro_antes)}</td>
      <td>${bienMalCell(p?.kitLibre?.giro_despues)}</td>
    </tr>
    <tr>
      <td>Cubierta</td>
      <td>${boolCell(p?.kitLibre?.cubierta_antes)}</td>
      <td>${boolCell(p?.kitLibre?.cubierta_despues)}</td>
    </tr>
  `;
}

function renderTorqueRows(t = {}) {
  return `
    <tr>
      <th rowspan="5">2</th>
      <td colspan="2" rowspan="5" class="left">Comprobar tres veces<br/>Estándar: REF 1</td>
      <td>1.</td>
      <td>${escapeHtml(fmtValue(t?.medicion1_antes))}</td>
      <td>${escapeHtml(fmtValue(t?.medicion1_despues))}</td>
      <td rowspan="5">${boolCell(t?.revisado)}</td>
      <td rowspan="5">${escapeHtml(fmtValue(t?.revision_sma))}</td>
    </tr>
    <tr><td>2.</td><td>${escapeHtml(fmtValue(t?.medicion2_antes))}</td><td>${escapeHtml(fmtValue(t?.medicion2_despues))}</td></tr>
    <tr><td>3.</td><td>${escapeHtml(fmtValue(t?.medicion3_antes))}</td><td>${escapeHtml(fmtValue(t?.medicion3_despues))}</td></tr>
    <tr><td>Promedio</td><td>${escapeHtml(fmtValue(t?.promedio_antes))}</td><td>${escapeHtml(fmtValue(t?.promedio_despues))}</td></tr>
    <tr><td>Estado</td><td>${bienMalCell(t?.estado_antes)}</td><td>${bienMalCell(t?.estado_despues)}</td></tr>
  `;
}

function renderResorteRows(r = {}) {
  return `
    <tr>
      <th rowspan="3">3</th>
      <td colspan="2" rowspan="3" class="left">Longitud</td>
      <td>Izquierdo</td>
      <td>${escapeHtml(fmtMm(r?.izq_mm_antes))} (${escapeHtml(fmtPct(r?.izq_pct_antes))})</td>
      <td>${escapeHtml(fmtMm(r?.izq_mm_despues))} (${escapeHtml(fmtPct(r?.izq_pct_despues))})</td>
      <td rowspan="3">${boolCell(r?.revisado)}</td>
      <td rowspan="3">${escapeHtml(fmtValue(r?.revision_sma))}</td>
    </tr>
    <tr>
      <td>Derecho</td>
      <td>${escapeHtml(fmtMm(r?.der_mm_antes))} (${escapeHtml(fmtPct(r?.der_pct_antes))})</td>
      <td>${escapeHtml(fmtMm(r?.der_mm_despues))} (${escapeHtml(fmtPct(r?.der_pct_despues))})</td>
    </tr>
    <tr><td>Estado</td><td>${bienMalCell(r?.estado_antes)}</td><td>${bienMalCell(r?.estado_despues)}</td></tr>
  `;
}

function renderEmboloRows(e = {}) {
  return `
    <tr>
      <th rowspan="6">4</th>
      <td colspan="2" rowspan="2" class="left">Recorrido / carrera del émbolo<br/>Estándar: REF 2</td>
      <td>Izquierdo</td>
      <td>${escapeHtml(fmtMm(e?.recorrido_izq_antes))}</td>
      <td>${escapeHtml(fmtMm(e?.recorrido_izq_despues))}</td>
      <td rowspan="6">${boolCell(e?.revisado)}</td>
      <td rowspan="6">${escapeHtml(fmtValue(e?.revision_sma))}</td>
    </tr>
    <tr><td>Derecho</td><td>${escapeHtml(fmtMm(e?.recorrido_der_antes))}</td><td>${escapeHtml(fmtMm(e?.recorrido_der_despues))}</td></tr>
    <tr><td colspan="2">Desgaste</td><td>¿Tiene?</td><td>${boolCell(e?.desgaste_antes)}</td><td>${boolCell(e?.desgaste_despues)}</td></tr>
    <tr><td colspan="2">Óxido</td><td>¿Tiene?</td><td>${boolCell(e?.oxido_antes)}</td><td>${boolCell(e?.oxido_despues)}</td></tr>
    <tr><td colspan="2">Lubricación</td><td>¿Tiene?</td><td>${bienMalCell(e?.lubricacion_antes)}</td><td>${bienMalCell(e?.lubricacion_despues)}</td></tr>
    <tr><td colspan="2">Espesor de arandela</td><td>Grosor</td><td>${escapeHtml(fmtMm(e?.arandela_antes))}</td><td>${escapeHtml(fmtMm(e?.arandela_despues))}</td></tr>
  `;
}

function renderContactoRows(c = {}) {
  return `
    <tr>
      <th rowspan="3">5</th>
      <td colspan="2" rowspan="2" class="left">Separación de contacto<br/>Estándar: REF 3</td>
      <td>Izquierdo</td>
      <td>${escapeHtml(fmtMm(c?.izq_antes))}</td>
      <td>${escapeHtml(fmtMm(c?.izq_despues))}</td>
      <td rowspan="3">${boolCell(c?.revisado)}</td>
      <td rowspan="3">${escapeHtml(fmtValue(c?.revision_sma))}</td>
    </tr>
    <tr><td>Derecho</td><td>${escapeHtml(fmtMm(c?.der_antes))}</td><td>${escapeHtml(fmtMm(c?.der_despues))}</td></tr>
    <tr><td colspan="3">Punto de contacto, cable y tuercas</td><td>${bienMalCell(c?.punto_antes)}</td><td>${bienMalCell(c?.punto_despues)}</td></tr>
  `;
}

function renderBoolRows({ number, title, data = {}, campos = [] }) {
  return campos
    .map((c, idx) => {
      const first = idx === 0;
      return `
        <tr>
          ${first ? `<th rowspan="${campos.length}">${number}</th><td colspan="2" rowspan="${campos.length}" class="left">${title}</td>` : ""}
          <td>${c.label}</td>
          <td>${c.type === "bienmal" ? bienMalCell(data?.[`${c.key}_antes`]) : boolCell(data?.[`${c.key}_antes`])}</td>
          <td>${c.type === "bienmal" ? bienMalCell(data?.[`${c.key}_despues`]) : boolCell(data?.[`${c.key}_despues`])}</td>
          ${first ? `<td rowspan="${campos.length}">${boolCell(data?.revisado)}</td><td rowspan="${campos.length}">${escapeHtml(fmtValue(data?.revision_sma))}</td>` : ""}
        </tr>
      `;
    })
    .join("");
}

function renderOperacionRows(o = {}) {
  return `
    <tr>
      <th>9</th>
      <td colspan="3" class="left">Prueba de funcionamiento</td>
      <td>${bienMalCell(o?.antes)}</td>
      <td>${bienMalCell(o?.despues)}</td>
      <td>${boolCell(o?.revisado)}</td>
      <td>${escapeHtml(fmtValue(o?.revision_sma))}</td>
    </tr>
  `;
}

export function buildManttoFrenoEmEhHtml({ orden, form, user } = {}) {
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

    CHK_OVERHAUL: check(form?.tipo_reporte === "overhaul"),
    CHK_AJUSTE: check(form?.tipo_reporte === "ajuste_reparacion_sustitucion"),

    PINES_ROWS: renderPinesRows(form?.pines_levas || {}),
    TORQUE_ROWS: renderTorqueRows(form?.torque || {}),
    RESORTE_ROWS: renderResorteRows(form?.resorte || {}),
    EMBOLO_ROWS: renderEmboloRows(form?.embolo || {}),
    CONTACTO_ROWS: renderContactoRows(form?.contacto || {}),
    BRAZO_ROWS: renderBoolRows({
      number: 6,
      title: "Brazo, palanca y perno",
      data: form?.brazo || {},
      campos: [
        { key: "desgaste_izq", label: "Desgaste izquierdo" },
        { key: "desgaste_der", label: "Desgaste derecho" },
        { key: "oxido_izq", label: "Óxido izquierdo" },
        { key: "oxido_der", label: "Óxido derecho" },
        { key: "lubricacion_izq", label: "Lubricación izquierdo", type: "bienmal" },
        { key: "lubricacion_der", label: "Lubricación derecho", type: "bienmal" },
      ],
    }),
    TAMBOR_ROWS: renderBoolRows({
      number: 7,
      title: "Condiciones de tambor",
      data: form?.tambor || {},
      campos: [
        { key: "desgaste", label: "Desgaste" },
        { key: "aceite", label: "Aceite" },
        { key: "oxido", label: "Óxido" },
      ],
    }),
    BALATAS_ROWS: renderBoolRows({
      number: 8,
      title: "¿Presentan desgaste, fisuras o aceite?",
      data: form?.balatas || {},
      campos: [
        { key: "izquierdo", label: "Izquierdo" },
        { key: "derecho", label: "Derecho" },
      ],
    }),
    OPERACION_ROWS: renderOperacionRows(form?.operacion || {}),

    OBSERVACIONES: escapeHtml(fmtValue(form?.observaciones, "")),
    RESULTADO_BIEN: check(form?.resultado_total?.bien),
    RESULTADO_SEGUIMIENTO: check(form?.resultado_total?.seguimiento),
    RESULTADO_DETALLE: escapeHtml(fmtValue(form?.resultado_total?.detalle, "")),

    FOTO_EMBOLO_ANTES: photoHtml(form?.fotos?.embolo_antes),
    FOTO_EMBOLO_DESPUES: photoHtml(form?.fotos?.embolo_despues),
    FOTO_REV_IZQ: photoHtml(form?.fotos?.revestimiento_izq),
    FOTO_REV_DER: photoHtml(form?.fotos?.revestimiento_der),
    FOTO_BRAZO_IZQ_ANTES: photoHtml(form?.fotos?.brazo_izq_antes),
    FOTO_BRAZO_IZQ_DESPUES: photoHtml(form?.fotos?.brazo_izq_despues),
    FOTO_BRAZO_DER_ANTES: photoHtml(form?.fotos?.brazo_der_antes),
    FOTO_BRAZO_DER_DESPUES: photoHtml(form?.fotos?.brazo_der_despues),
    OTRO_1_TITULO: escapeHtml(fmtValue(form?.fotos?.otro_1_titulo, "")),
    OTRO_2_TITULO: escapeHtml(fmtValue(form?.fotos?.otro_2_titulo, "")),
    FOTO_OTRO_1_ANTES: photoHtml(form?.fotos?.otro_1_antes),
    FOTO_OTRO_1_DESPUES: photoHtml(form?.fotos?.otro_1_despues),
    FOTO_OTRO_2_ANTES: photoHtml(form?.fotos?.otro_2_antes),
    FOTO_OTRO_2_DESPUES: photoHtml(form?.fotos?.otro_2_despues),
  };

  return replaceAllVars(MANTTO_FRENO_EM_EH_TEMPLATE, vars);
}

export default buildManttoFrenoEmEhHtml;