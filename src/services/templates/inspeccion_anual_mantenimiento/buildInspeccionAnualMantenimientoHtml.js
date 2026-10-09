const safe = (v) => String(v ?? "").trim();

function escapeHtml(value) {
  return safe(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function multiline(value) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function num(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function avg(values = []) {
  const nums = values.map(num).filter((v) => v !== null);
  if (!nums.length) return "";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

function display(value, suffix = "") {
  const text = safe(value);
  return text ? `${escapeHtml(text)}${suffix}` : "";
}

function renderSimpleInspection(items, values = {}) {
  return `
    <table class="grid small">
      <tr>
        ${items.map((item) => `<th>${escapeHtml(item.label)}</th>`).join("")}
      </tr>
      <tr>
        ${items
          .map(
            (item) => `
              <td>
                <span class="code">${escapeHtml(item.code)}</span>
                <div class="value">${escapeHtml(values?.[item.key])}</div>
              </td>
            `
          )
          .join("")}
      </tr>
    </table>
  `;
}

function renderPolea(polea = {}) {
  const cables = Array.isArray(polea.cables) ? polea.cables : [];
  const total = Math.max(8, cables.length);
  const rows = Array.from({ length: total }).map((_, i) => cables[i] || {});

  const cellRow = (label, field) => `
    <tr>
      <th colspan="2" class="rowLabel">${label}</th>
      ${rows.map((c) => `<td>${escapeHtml(c?.[field])}</td>`).join("")}
    </tr>
  `;

  return `
    <table class="grid small">
      <tr>
        <th colspan="2">MEDICIÓN POLEA TRACTORA</th>
        ${rows.map((_, i) => `<th>CABLE ${i + 1}</th>`).join("")}
      </tr>
      <tr>
        <th rowspan="4">A: DISTANCIA CABLE / BORDE</th>
        <th>0°</th>
        ${rows.map((c) => `<td>${escapeHtml(c.a0)}</td>`).join("")}
      </tr>
      <tr>
        <th>90°</th>
        ${rows.map((c) => `<td>${escapeHtml(c.a90)}</td>`).join("")}
      </tr>
      <tr>
        <th>180°</th>
        ${rows.map((c) => `<td>${escapeHtml(c.a180)}</td>`).join("")}
      </tr>
      <tr>
        <th>270°</th>
        ${rows.map((c) => `<td>${escapeHtml(c.a270)}</td>`).join("")}
      </tr>
      ${cellRow("PROMEDIO A", "promedioA")}
      ${cellRow("B - A", "bMenosA")}
      ${cellRow("DESLIZAMIENTO (mm)", "deslizamiento")}
      <tr>
        <th colspan="2">B: DIST. GARGANTA / BORDE</th>
        <td colspan="2">${escapeHtml(polea.b)}</td>
        <th colspan="2">RECORRIDO TR (m)</th>
        <td colspan="2">${escapeHtml(polea.recorrido)}</td>
        <th>ROPING</th>
        <td>${escapeHtml(polea.roping)}</td>
      </tr>
      <tr>
        <th colspan="2">PD PROMEDIO DESLIZAMIENTO</th>
        <td colspan="3">${escapeHtml(polea.pd)}</td>
        <th colspan="2">ÍNDICE R = PD / TR × Rp</th>
        <td colspan="3">${escapeHtml(polea.indiceR)}</td>
      </tr>
    </table>
  `;
}

function renderCables(cablesData = {}) {
  const cables = Array.isArray(cablesData.cables) ? cablesData.cables : [];
  const total = Math.max(8, cables.length);
  const rows = Array.from({ length: total }).map((_, i) => cables[i] || {});

  const row = (label, field) => `
    <tr>
      <th colspan="5" class="rowLabel">${label}</th>
      ${rows.map((c) => `<td>${escapeHtml(c?.[field])}</td>`).join("")}
    </tr>
  `;

  return `
    <table class="grid tiny">
      <tr>
        <th colspan="2">DIÁMETRO NOMINAL</th>
        <td>${escapeHtml(cablesData.diametroNominal)}</td>
        <th>NÚMERO DE CABLES</th>
        <td>${escapeHtml(cablesData.numeroCables)}</td>
        ${rows.map((_, i) => `<th>CABLE ${i + 1}</th>`).join("")}
      </tr>
      ${row("EN ZONA DE NO USO / RODAMIENTO (mm)", "zonaNoUso")}
      ${row("MÁS DELGADO (mm)", "masDelgado")}
      ${row("PORCENTAJE", "porcentaje")}
      ${row("OXIDACIÓN O RESEQUEDAD", "oxidacion")}
      ${row("DEFORMACIONES", "deformaciones")}
      ${row("FRACTURAS", "fracturas")}
      ${row("TENSIÓN DE CABLE", "tension")}
      ${row("ANCLA CABINA", "anclaCabina")}
      ${row("ANCLA CWT", "anclaCwt")}
    </table>
  `;
}

function renderPuertas(puertas = []) {
  const rows = Array.isArray(puertas) ? puertas : [];
  const total = Math.max(8, rows.length);

  return `
    <table class="grid tiny">
      <tr>
        <th>PISO</th>
        <th>FIJACIÓN</th>
        <th>INTERLOCK</th>
        <th>SW I/L</th>
        <th>CIERRE</th>
        <th>CABLE ENTRE POLEAS</th>
        <th>CHAVETA</th>
        <th>RODAJAS / EXCÉNTRICOS</th>
        <th>RIEL LIMP / LUB</th>
        <th>DESLIZADOR</th>
        <th>RESQUICIO</th>
      </tr>
      ${Array.from({ length: total })
        .map((_, i) => {
          const r = rows[i] || {};
          return `
            <tr>
              <td>${escapeHtml(r.nomenclatura)}</td>
              <td>${escapeHtml(r.condicionFijacion)}</td>
              <td>${escapeHtml(r.interlock)}</td>
              <td>${escapeHtml(r.swInterlock)}</td>
              <td>${escapeHtml(r.cierre)}</td>
              <td>${escapeHtml(r.cablePoleas)}</td>
              <td>${escapeHtml(r.chaveta)}</td>
              <td>${escapeHtml(r.rodajasExcentricos)}</td>
              <td>${escapeHtml(r.rielLimpLub)}</td>
              <td>${escapeHtml(r.deslizador)}</td>
              <td>${escapeHtml(r.resquicioPuerta)}</td>
            </tr>
          `;
        })
        .join("")}
    </table>
  `;
}

function renderEvaluacion(evaluacion = {}) {
  const items = [
    ["Limpieza", "limpieza"],
    ["Lubricación", "lubricacion"],
    ["Apriete de tornillería", "aprieteTornilleria"],
    ["Colocación y fijación de tapas", "colocacionTapas"],
    ["Confort de viaje y nivelación", "confortViaje"],
    ["Cambio de partes según cobertura", "cambioPartes"],
  ];

  return `
    <table class="grid small">
      <tr>
        <th colspan="8">9. EVALUACIÓN DEL SUPERVISOR</th>
      </tr>
      <tr>
        <th>CRITERIO</th>
        ${items.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}
        <th>TOTAL</th>
      </tr>
      <tr>
        <th>EVALUACIÓN</th>
        ${items
          .map(([, key]) => `<td class="center">${escapeHtml(evaluacion?.[key])}</td>`)
          .join("")}
        <td class="center strong">${escapeHtml(evaluacion.total)}</td>
      </tr>
      <tr>
        <td colspan="8" class="legend">4 = Excelente &nbsp;&nbsp; 3 = Bien &nbsp;&nbsp; 2 = Regular &nbsp;&nbsp; 1 = Malo</td>
      </tr>
    </table>
  `;
}

export function buildInspeccionAnualMantenimientoHtml(data = {}) {
  const general = data.general || {};
  const seccion1 = data.seccion1 || {};
  const seccion2 = data.seccion2 || {};
  const seccion4 = data.seccion4 || {};
  const seccion6 = data.seccion6 || {};
  const seccion7 = data.seccion7 || {};

  const s1Items = [
    { code: "101", key: "cerraduraCuarto", label: "CERRADURA DE CUARTO" },
    { code: "102", key: "goteras", label: "GOTERAS" },
    { code: "103", key: "equipoRescate", label: "EQUIPO DE RESCATE" },
    { code: "104", key: "numeracionInterruptor", label: "NUM. INTERRUPTOR" },
    { code: "105", key: "numeracionTablero", label: "NUM. TABLERO" },
    { code: "106", key: "numeracionMaquina", label: "NUM. MÁQUINA" },
    { code: "107", key: "rs", label: "R-S" },
    { code: "108", key: "st", label: "S-T" },
    { code: "109", key: "rt", label: "R-T" },
    { code: "110", key: "l1l2", label: "L1-L2" },
    { code: "111", key: "voltaje7900", label: "79-00 (420-400)" },
    { code: "112", key: "bascula", label: "BÁSCULA" },
  ];

  const s2Items = [
    { code: "201", key: "pernoLeva", label: "PERNO DE LEVA" },
    { code: "202", key: "contactoLevaEmbolo", label: "CONTACTO LEVA / ÉMBOLO" },
    { code: "203", key: "tambor", label: "TAMBOR" },
    { code: "204", key: "balata", label: "BALATA" },
    { code: "205", key: "espesorBalata", label: "ESPESOR BALATA" },
    { code: "206", key: "lubricacionEmbolo", label: "LUBRICACIÓN ÉMBOLO" },
    { code: "207", key: "desplazamientoEmbolo", label: "DESPLAZAMIENTO ÉMBOLO" },
    { code: "208", key: "espesorArandelaCuero", label: "ESPESOR ARANDELA" },
    { code: "209", key: "aperturaContactoBk", label: "APERTURA CONTACTO BK" },
    { code: "210", key: "torque", label: "TORQUE" },
    { code: "211", key: "fugaAceiteLeten", label: "FUGA DE ACEITE" },
    { code: "212", key: "nivelAceite", label: "NIVEL DE ACEITE" },
  ];

  const s4Items = [
    { code: "401", key: "diametroCableGob", label: "DIÁMETRO CABLE GOB." },
    { code: "402", key: "condicionCableGob", label: "CONDICIÓN CABLE GOB." },
    { code: "403", key: "contactoGob", label: "CONTACTO GOB." },
    { code: "404", key: "lubricacionPernos", label: "LUBRICACIÓN PERNOS" },
    { code: "405", key: "distanciaFrenado", label: "DISTANCIA FRENADO" },
    { code: "406", key: "inclinacionCabina", label: "INCLINACIÓN CABINA" },
    { code: "407", key: "contactoSaf", label: "CONTACTO SAF" },
    { code: "408", key: "nudoArriba", label: "NUDO ARRIBA" },
    { code: "409", key: "nudoAbajo", label: "NUDO ABAJO" },
  ];

  const s6Items = [
    { code: "601", key: "barandal", label: "BARANDAL" },
    { code: "602", key: "limpiezaArriba", label: "LIMPIEZA ARRIBA" },
    { code: "603", key: "gateSw", label: "GATE SW" },
    { code: "604", key: "bandaCadena", label: "BANDA / CADENA" },
    { code: "605", key: "rielLimpLub", label: "RIEL LIMP / LUB" },
    { code: "606", key: "deslizador", label: "DESLIZADOR" },
    { code: "607", key: "resquicioPuerta", label: "RESQUICIO PUERTA" },
    { code: "608", key: "sdeMbs", label: "SDE / MBS" },
    { code: "609", key: "iluminacion", label: "ILUMINACIÓN" },
    { code: "610", key: "ventilador", label: "VENTILADOR" },
    { code: "611", key: "cuadroMandoCop", label: "CUADRO MANDO COP" },
    { code: "612", key: "tornilloCop", label: "TORNILLO COP" },
  ];

  const s7Items = [
    { code: "701", key: "escaleraMarina", label: "ESCALERA MARINA" },
    { code: "702", key: "pitSw", label: "PIT SW" },
    { code: "703", key: "lampara", label: "LÁMPARA" },
    { code: "704", key: "limpieza", label: "LIMPIEZA" },
    { code: "705", key: "agua", label: "AGUA" },
    { code: "706", key: "oxidacion", label: "OXIDACIÓN" },
    { code: "707", key: "runbyCwt", label: "RUNBY CWT" },
    { code: "708", key: "distanciaCompensacion", label: "DIST. COMPENSACIÓN" },
    { code: "709", key: "distanciaPoleaTension", label: "DIST. POLEA TENSIÓN" },
    { code: "710", key: "swLimiteDot", label: "SW LÍMITE DOT" },
    { code: "711", key: "swLimiteOut", label: "SW LÍMITE OUT" },
  ];

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>INSPECCIÓN ANUAL DE MANTENIMIENTO</title>
<style>
  @page { size: letter landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 7px; }
  .page { width: 100%; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .topline { display: flex; justify-content: space-between; align-items: center; font-size: 7px; margin-bottom: 2px; }
  .title { font-size: 15px; font-weight: 800; margin: 3px 0 7px; }
  .sectionTitle { font-size: 9px; font-weight: 800; margin: 6px 0 3px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #111; padding: 2px 3px; vertical-align: middle; word-break: break-word; }
  th { background: #e5e7eb; font-weight: 700; text-align: center; }
  td { text-align: center; }
  .left { text-align: left; }
  .center { text-align: center; }
  .strong { font-weight: 800; }
  .grid.small th, .grid.small td { font-size: 6px; }
  .grid.tiny th, .grid.tiny td { font-size: 5.6px; padding: 1.8px; }
  .general th { width: 11%; }
  .general td { font-size: 7px; }
  .code { display: block; font-size: 5px; color: #444; text-align: left; }
  .value { font-size: 6.4px; font-weight: 700; text-align: center; min-height: 12px; display: flex; align-items: center; justify-content: center; }
  .rowLabel { text-align: left; background: #f3f4f6; }
  .legend { text-align: left; background: #f8fafc; font-size: 6px; }
  .commentBox { min-height: 70px; text-align: left; vertical-align: top; padding: 5px; }
  .subtle { background: #f8fafc; }
  .footer { display: flex; justify-content: space-between; margin-top: 6px; font-size: 6px; }
</style>
</head>
<body>
  <div class="page">
    <div class="topline">
      <span>VER-3</span>
      <span class="strong">5. INSPECCIÓN ANUAL (TEL-GMA-FRT-013.0)</span>
    </div>
    <div class="title">INSPECCIÓN ANUAL DE MANTENIMIENTO</div>

    <table class="general">
      <tr>
        <th>Fecha inspección</th><td>${escapeHtml(general.fechaInspeccion)}</td>
        <th>MX-ORDEN</th><td>${escapeHtml(general.mxOrden)}</td>
        <th>NO. EQP</th><td>${escapeHtml(general.noEqp)}</td>
        <th>Fecha entrega</th><td>${escapeHtml(general.fechaEntrega)}</td>
        <th>Tipo contrato</th><td>${escapeHtml(general.tipoContrato)}</td>
        <th>Inspector</th><td>${escapeHtml(general.inspector)}</td>
      </tr>
      <tr>
        <th>Razón social</th><td colspan="3">${escapeHtml(general.razonSocial)}</td>
        <th>Dirección cliente</th><td colspan="7" class="left">${escapeHtml(general.direccionCliente)}</td>
      </tr>
      <tr>
        <th>Tipo control</th><td>${escapeHtml(general.tipoControl)}</td>
        <th>Velocidad</th><td>${escapeHtml(general.velocidad)}</td>
        <th>Tipo máquina</th><td>${escapeHtml(general.tipoMaquina)}</td>
        <th>Recorrido (m)</th><td>${escapeHtml(general.recorridoM)}</td>
        <th>Cant. arranques</th><td>${escapeHtml(general.cantidadArranques)}</td>
        <th>Fecha ref.</th><td>${escapeHtml(general.fechaReferencia)}</td>
      </tr>
    </table>

    <div class="sectionTitle">INDICACIONES: VISUAL · ACCIONAR · MEDICIÓN</div>

    <div class="sectionTitle">1. INSPECCIÓN DE AMBIENTE DE CUARTO DE MÁQUINAS Y TABLERO DE CONTROL</div>
    ${renderSimpleInspection(s1Items, seccion1)}

    <div class="sectionTitle">2. INSPECCIÓN DE FRENO Y CAJA DE CORONA</div>
    ${renderSimpleInspection(s2Items, seccion2)}

    <div class="sectionTitle">3. INSPECCIÓN DE DESGASTE DE POLEA DE TRACCIÓN</div>
    ${renderPolea(data.seccion3 || {})}

    <div class="sectionTitle">4. INSPECCIÓN DE GOBERNADOR Y SEGURO CONTRA CAÍDA</div>
    ${renderSimpleInspection(s4Items, seccion4)}

    <div class="sectionTitle">5. INSPECCIÓN DE CABLE DE TRACCIÓN</div>
    ${renderCables(data.seccion5 || {})}

    <div class="footer"><span>TEL-GMA-FRT-013.0</span><span>Hoja 1 de 2</span></div>
  </div>

  <div class="page">
    <div class="topline">
      <span>VER-3</span>
      <span class="strong">5. INSPECCIÓN ANUAL (TEL-GMA-FRT-013.0)</span>
    </div>
    <div class="title">INSPECCIÓN ANUAL DE MANTENIMIENTO</div>

    <div class="sectionTitle">6. INSPECCIÓN DE CABINA</div>
    ${renderSimpleInspection(s6Items, seccion6)}

    <div class="sectionTitle">7. INSPECCIÓN DE FOSA (PIT) Y SW LÍMITE</div>
    ${renderSimpleInspection(s7Items, seccion7)}

    <div class="sectionTitle">8. INSPECCIÓN DE PUERTA DE PISO Y SW LÍMITE</div>
    ${renderPuertas(data.seccion8 || [])}

    <div class="sectionTitle">9. EVALUACIÓN DEL SUPERVISOR</div>
    ${renderEvaluacion(data.evaluacion || {})}

    <div class="sectionTitle">10. COMENTARIO DEL CLIENTE O S/V</div>
    <table class="grid">
      <tr><td class="commentBox">${multiline(data.comentarioCliente)}</td></tr>
    </table>

    <div class="footer"><span>TEL-GMA-FRT-013.0</span><span>Hoja 2 de 2</span></div>
  </div>
</body>
</html>
`;
}