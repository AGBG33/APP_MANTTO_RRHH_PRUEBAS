// src/services/templates/tbmkyPdfTemplate.js

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// ✅ X roja dentro de cuadrito
const xBox = (cond) =>
  cond ? `<span class="xb selected">X</span>` : `<span class="xb"></span>`;

// ✅ X roja para Round 1 / marcas sin cuadrito
const xMark = (cond) => (cond ? `<span class="redMark">X</span>` : "");

// ✅ Respeta el tipo que venga desde la app
const equipoChecks = (equipoId) => {
  const v = String(equipoId || "").toLowerCase().trim();

  return {
    elevadores: v.includes("elevador"),
    escaleras: v.includes("escalera"),
    oficinas: v.includes("oficina"),
    almacen:
      v.includes("almacen") ||
      v.includes("almacén") ||
      v.includes("herramientas"),
  };
};

const EPP_ORDER = [
  "UNIFORME",
  "CASCO",
  "BARBIQUEJO",
  "LAMPARA",
  "POLVO",
  "LENTES",
  "BOTAS",
  "TAPONES",
  "SIST. ANTICAIDAS",
  "SOLDAR",
  "ANTICORTE",
  "NYLON",
  "NITRILO",
  "CARNAZA",
  "FAJA",
  "MOSQUETON",
  "BLOCK STOP",
  "L. VIDA VERTICAL",
];

const SINTOMAS_FORMATO = [
  "Dolor de cabeza",
  "Vértigo, zumbidos en la oreja",
  "Manos o pies temblorosos",
  "Fiebre",
  "Somnolencia",
  "Indigestión/diarrea",
];

function eppMark(eppSeleccionado, key, col) {
  const v = eppSeleccionado?.[key];
  return !!v?.[col];
}

function getTrabajadoresVisibles(payload) {
  const trabajadores = Array.isArray(payload.trabajadores)
    ? payload.trabajadores
    : [];

  const principal = trabajadores[0] || {};

  const auxiliares = trabajadores
    .slice(1)
    .filter((t) => {
      return (
        String(t?.nombre || "").trim() ||
        String(t?.cargo || "").trim() ||
        String(t?.nomina || "").trim()
      );
    })
    .slice(0, 5);

  return { principal, auxiliares };
}

function renderTrabajadoresRows(payload) {
  const { principal, auxiliares } = getTrabajadoresVisibles(payload);

  const rows = [];

  rows.push(`
    <tr>
      <th class="left">1.- ${esc(principal.nombre || "")}</th>
      <th>${esc(principal.cargo || "")}</th>
      <th>${esc(payload.nominaTecnico || principal.nomina || "")}</th>
    </tr>
  `);

  auxiliares.forEach((aux, idx) => {
    rows.push(`
      <tr>
        <th class="left">${idx + 2}.- ${esc(aux.nombre || "")}</th>
        <th>${esc(aux.cargo || "")}</th>
        <th>${esc(aux.nomina || "")}</th>
      </tr>
    `);
  });

  // ✅ Si no hay auxiliares, deja una fila vacía como formato base
  if (auxiliares.length === 0) {
    rows.push(`
      <tr>
        <th class="left">2.- </th>
        <th></th>
        <th></th>
      </tr>
    `);
  }

  return rows.join("");
}

function renderEppBlock(eppSel) {
  const first = EPP_ORDER.slice(0, 9);
  const second = EPP_ORDER.slice(9);

  const renderCell = (idx, key) => {
    const num = idx + 1;

    return `
      <div class="eppItemPdf">
        <table class="eppMiniTable">
          <tr>
            <th class="eppHead">M</th>
            <th class="eppHead">A</th>
          </tr>
          <tr>
            <th class="eppMark">
              ${eppMark(eppSel, key, "M") ? `<span class="redMark">X</span>` : ""}
            </th>
            <th class="eppMark">
              ${eppMark(eppSel, key, "A") ? `<span class="redMark">X</span>` : ""}
            </th>
          </tr>
        </table>

        <div class="eppName">
          ${num}. ${esc(key)}
        </div>
      </div>
    `;
  };

  return `
    <div class="eppRowAligned">
      ${first.map((k, i) => renderCell(i, k)).join("")}
    </div>

    <div class="eppRowAligned second">
      ${second.map((k, i) => renderCell(i + 9, k)).join("")}
    </div>
  `;
}

function renderRound1(hasRiesgo) {
  const row = (a, b, c, d) => `
    <tr>
      <th class="riskMark">${xMark(hasRiesgo(a))}</th>
      <th class="gray left">${esc(a)}</th>

      <th class="riskMark">${xMark(hasRiesgo(b))}</th>
      <th class="gray left">${esc(b)}</th>

      <th class="riskMark">${xMark(hasRiesgo(c))}</th>
      <th class="gray left">${esc(c)}</th>

      <th class="riskMark">${xMark(hasRiesgo(d))}</th>
      <th class="gray left">${esc(d)}</th>
    </tr>
  `;

  return `
    ${row("CAIDAS AL MISMO NIVEL", "PROYECCION DE PARTICULAS QUIMICAS", "SOBRE EXPOSICION AL RUIDO", "POSTURAS INADECUADAS")}
    ${row("CAIDAS A DISTINTO NIVEL", "PROYECCION DE PARTICULAS INCANDECENTES", "GOLPES,CORTES CON OBJETO MOVIL", "DESLUBRAMIENTO/POCA ILUMINACIÓN")}
    ${row("CAIDAS OBJETOS MANIPULACION/DESPLOME", "PROYECCION PARTICULAS SOLIDAS", "GOLPES,CORTES CON OBJETO INMOVIL", "HORARIOS LARGOS / TRABAJO NOCTURNO")}
    ${row("DESPLOME DE MATERIALES/CARGAS", "ATROPELLAMIENTO POR VEHICULOS", "TRANSMISION MICROORGANISMOS COVID", "FATIGA MOVIMIENTOS REPETITIVOS")}
    ${row("CONTACTO CON SUPERFICIE CORTANTE", "ATRAPAMIENTO POR MAQUINARIA", "PERDIDA DEL EQUILIBRIO", "GASES Y VAPORES TOXICOS")}
    ${row("CONTACTO CON SUSTANCIAS QUIMICAS", "MOVIMIENTOS REPENTINOS DE MAQUINARIA", "GOLPE DE CALOR / DESMAYOS", "SOBREXPOSICION RADIACION IONIZANTE")}
    ${row("ELECTROCUCION", "SOBRE ESFUERZO", "PICADURAS DE INSECTO", "CONDICIONES CLIMATICAS")}
    <tr>
      <th class="riskMark">${xMark(hasRiesgo("OTROS"))}</th>
      <th colspan="7" class="left">OTROS:</th>
    </tr>
  `;
}

function renderRound2(topR, causas) {
  const rows = [0, 1, 2, 3].map((i) => {
    const riesgo = topR?.[i] || "";
    const causa = causas?.[i] || "";

    return `
      <tr>
        <th class="round2Top">
          ${i < 3 && riesgo ? `<span class="redMark">${i + 1}</span>` : ""}
        </th>
        <th class="left round2Risk">${esc(riesgo)}</th>
        <th class="left round2Cause">${esc(causa)}</th>
      </tr>
    `;
  });

  return rows.join("");
}

function renderMedidasAcciones(medidas, acciones) {
  const m = (i, j) => esc((medidas?.[i]?.[j] ?? "").toString());
  const a = (i) => esc((acciones?.[i] ?? "").toString());

  const block = (idx) => `
    <tr>
      <th rowspan="3" class="medidaNo">${idx + 1}</th>
      <th colspan="2" class="left medidaText">${m(idx, 0)}</th>
      <th rowspan="3" class="left accionText">${a(idx)}</th>
    </tr>
    <tr>
      <th colspan="2" class="left medidaText">${m(idx, 1)}</th>
    </tr>
    <tr>
      <th colspan="2" class="left medidaText">${m(idx, 2)}</th>
    </tr>
  `;

  return `${block(0)}${block(1)}${block(2)}`;
}

function renderNuevosRiesgos(nuevosRiesgos) {
  const rows = [];

  for (let i = 0; i < 6; i += 1) {
    const row = nuevosRiesgos?.[i] || {};

    rows.push(`
      <tr>
        <th class="left nuevoRiesgoCell">${esc(row.riesgo || "")}</th>
        <th class="left nuevoRiesgoCell">${esc(row.medida || "")}</th>
      </tr>
    `);
  }

  return rows.join("");
}

export function buildTbmkyHtml(payload = {}) {
  const orderid = esc(payload.orderid);
  const fecha = esc(payload.fecha);

  const equipment = esc(
    payload.equipment ||
      payload.Equipment ||
      payload.equipo ||
      payload.numeroEquipo ||
      ""
  );

  const areaRaw = Array.isArray(payload.selectedAreasLabels)
    ? payload.selectedAreasLabels.join(", ")
    : payload.selectedAreaLabel || "";

  const area = esc(areaRaw);
  const jefe = esc(payload.jefeInmediato || "");
  const actividadDia = esc(payload.actividadDia || "");
  const herramientas = esc(payload.herramientas || "");

  const equipoId =
    payload.equipoId || payload.equipoSeleccionado || payload.equipoLabel || "";

  const eq = equipoChecks(equipoId);

  const rutinaria = !!payload.rutinaria;
  const noRutinaria = !rutinaria;

  const sintomas = Array.isArray(payload.sintomas) ? payload.sintomas : [];
  const eppSel = payload.eppSeleccionado || {};

  const topR = payload.riesgosTopText || ["", "", ""];
  const causas = payload.causasTop || ["", "", ""];

  const medidas = payload.medidasTop || [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ];

  const acciones = payload.acciones || ["", "", ""];

  const firmaTecnico = payload.firmaTecnico ? String(payload.firmaTecnico) : "";

  const nuevosRiesgos = Array.isArray(payload.nuevosRiesgos)
    ? payload.nuevosRiesgos
    : [];

  const riesgosSeleccionadosIds = Array.isArray(payload.riesgosSeleccionadosIds)
    ? payload.riesgosSeleccionadosIds
    : [];

  const riesgosBD = Array.isArray(payload.riesgosBD) ? payload.riesgosBD : [];

  const selectedRiesgosText = new Set(
    riesgosBD
      .filter((r) => riesgosSeleccionadosIds.includes(r.id))
      .map((r) => String(r.riesgo || "").toUpperCase().trim())
  );

  const hasRiesgo = (txt) =>
    selectedRiesgosText.has(String(txt).toUpperCase().trim());

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>TBM/KY Predicción de Riesgos</title>

  <style>
    @page {
      size: letter;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, sans-serif;
    }

    /*
      ✅ Hoja carta real para expo-print:
      8.5 x 11 pulgadas aprox en 96dpi = 816 x 1056 px.
      El contenido interno conserva 612px para que tu formato no se haga gigante.
    */
    body {
      width: 816px;
      margin: 0 auto;
    }

    .pagina {
      width: 816px;
      height: 1056px;
      margin: 0 auto;
      padding: 0;
      background: #fff;
      position: relative;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }

    .pagina:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    /*
      ✅ Área interna del formato.
      Aquí vive el formato completo.
      El footer va fuera para que no se empalme.
    */
    .pageContent {
      width: 612px;
      margin: 0 auto;
      padding: 18px 20px 0 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    tr,
    td,
    th {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    td {
      border: 1px solid #000;
      text-align: center;
      padding: 1px 2px;
      font-size: 9.2px;
      font-weight: bold;
      line-height: 1.12;
      vertical-align: middle;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    th {
      border: 1px solid #000;
      padding: 1px 2px;
      text-align: center;
      font-size: 7.2px;
      font-weight: bold;
      line-height: 1.12;
      vertical-align: middle;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .black {
      background-color: #000;
      color: #fff;
    }

    .gray {
      background-color: #c4bfbf;
    }

    .left {
      text-align: left !important;
    }

    .center {
      text-align: center !important;
    }

    .redMark {
      color: #d40000;
      font-weight: 900;
      font-size: 9px;
    }

    .xb {
      display: inline-flex;
      width: 12px;
      height: 12px;
      border: 1px solid #000;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 900;
      line-height: 1;
      vertical-align: middle;
      color: #000;
    }

    .xb.selected {
      color: #d40000;
      font-weight: 900;
    }

    .section {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .instructivo {
      font-size: 7px;
      line-height: 1.12;
    }

    .titleCell {
      font-size: 9px;
      line-height: 1.15;
    }

    .areaText {
      font-size: 6.8px;
      line-height: 1.08;
      height: 21px;
      max-height: 21px;
      overflow: hidden;
    }

    .activityText {
      font-size: 6.8px;
      line-height: 1.08;
      height: 22px;
      max-height: 22px;
      overflow: hidden;
    }

    .twoCols {
      display: flex;
      gap: 5px;
      width: 100%;
    }

    .equiposRow {
      display: flex;
      gap: 5px;
      margin: 4px 0;
    }

    .equiposRow table {
      flex: 1;
    }

    .workerTable {
      width: 60%;
    }

    .workInfoTable {
      width: 40%;
    }

    .healthWrap {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .healthLeft {
      width: 59%;
    }

    .healthRight {
      width: 41%;
    }

    .symptomText {
      font-size: 8.6px;
      line-height: 1.25;
      font-weight: bold;
    }

    .rememberImgCell {
      height: 76px;
      width: 48%;
    }

    .rememberText {
      font-size: 7.5px;
      line-height: 1.15;
    }

    .eppRowAligned {
      display: grid;
      grid-template-columns: repeat(9, 1fr);
      gap: 3px;
      width: 100%;
      margin-top: 3px;
      align-items: start;
    }

    .eppRowAligned.second {
      grid-template-columns: repeat(9, 1fr);
      margin-top: 2px;
    }

    .eppItemPdf {
      width: 100%;
      min-width: 0;
      text-align: center;
    }

    .eppMiniTable {
      width: 22px;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 0 auto;
    }

    .eppMiniTable th {
      font-size: 5.8px;
      padding: 0;
      line-height: 1;
      height: 9px;
      text-align: center;
      vertical-align: middle;
    }

    .eppHead {
      width: 11px;
      height: 8px;
    }

    .eppMark {
      width: 11px;
      height: 9px;
    }

    .eppName {
      width: 100%;
      text-align: center;
      font-size: 5.2px;
      line-height: 1;
      font-weight: bold;
      margin-top: 2px;
      min-height: 14px;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .toolCell {
      height: 32px;
      vertical-align: top;
      font-size: 7px;
      line-height: 1.1;
    }

    .riskMark {
      width: 13px;
      font-size: 7px;
    }

    .round1Table th {
      font-size: 6.2px;
      line-height: 1.05;
      height: 12px;
      padding: 1px;
    }

    .round2Top {
      width: 34px;
    }

    .round2Risk {
      width: 40%;
      height: 22px;
      font-size: 7.3px;
    }

    .round2Cause {
      width: auto;
      height: 22px;
      font-size: 7.3px;
    }

    .medidaNo {
      width: 28px;
      font-size: 8px;
    }

    .medidaText {
      height: 21px;
      font-size: 7.2px;
      line-height: 1.1;
    }

    .accionText {
      width: 28%;
      font-size: 7.2px;
      line-height: 1.1;
    }

    .round4Table {
      margin-top: 8px;
    }

    .round4Table th,
    .round4Table td {
      height: 15px;
    }

    .firmaCell {
      width: 34%;
      height: 64px !important;
    }

    .sig {
      width: 100%;
      height: 62px;
      object-fit: contain;
      display: block;
    }

    .noteRound4 {
      width: 58%;
      margin: 8px 0 22px 18px;
    }

    .noteRound4 th {
      font-size: 5.8px;
      height: 14px;
    }

    .nuevoRiesgoTable {
      margin-top: 0;
    }

    .nuevoRiesgoCell {
      height: 16px;
      font-size: 7px;
      line-height: 1.08;
    }

    .phrase {
      margin-top: 34px;
    }

    .phrase th {
      font-size: 11px;
      line-height: 1.25;
      padding: 6px;
    }

    /*
      ✅ Footer fijo hasta abajo de toda la hoja.
      Ya no pertenece al contenido del formato.
    */
    .pageFooter {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 18px;
      height: 18px;
      font-size: 8px;
      font-weight: bold;
      color: #000;
      z-index: 50;
    }

    .pageNumber {
      position: absolute;
      left: 0;
      right: 0;
      text-align: center;
    }

    .pdfCode {
      position: absolute;
      right: 28px;
      text-align: right;
    }
  </style>
</head>

<body>
  <!-- ==================== PÁGINA 1 ==================== -->
  <div class="pagina">
    <div class="pageContent">
      <table>
        <tr>
          <th colspan="2" class="left instructivo">
            <strong>INSTRUCTIVO:</strong><br />
            1. Todo el personal que realice TBM-KY, debe ser previamente capacitado por el Departamento de Seguridad e Higiene respecto a su llenado.<br />
            2. Este documento es de carácter obligatorio para la identificación y prevención de riesgos, este deberá ser llenado ANTES de realizar cualquier actividad rutinaria y / o no rutinaria.<br />
            3. Cuando hay cambios en las condiciones de trabajo, rotación de personal u otro riesgo no identificado en la ejecución de la tarea, se debe suspender la actividad reevaluando los riesgos y definiendo las contramedidas adicionales a implementar.<br />
            4. Es indispensable y obligatorio que la realización de este documento se haga directamente en el lugar de trabajo en el cual va a ejecutar sus funciones, evaluando, identificando y analizando las condiciones de su entorno cercano.<br />
            5. Si en el lugar de trabajo usted encuentra RIESGOS INMINENTES, pare actividad y avise inmediatamente a su jefe inmediato o al siguiente correo: AllSeguridad@melco.com.mx.
          </th>
        </tr>

        <tr>
          <td rowspan="2" class="titleCell">
            MITSUBISHI ELECTRIC DE MEXICO S.A. DE C.V.<br />
            TBM/KY PREDICCION DE RIESGOS (TLA-SHO-FRT-004.1)
          </td>
          <th style="width: 20%">FECHA:</th>
        </tr>

        <tr>
          <th style="height: 14px">${fecha}</th>
        </tr>

        <tr>
          <td colspan="2" class="black">
            IDENTIFICACION DEL AREA DE TRABAJO
          </td>
        </tr>
      </table>

      <div class="equiposRow">
        <table>
          <tr>
            <th>ELEVADORES</th>
            <th style="width: 32%">${xBox(eq.elevadores)}</th>
          </tr>
        </table>

        <table>
          <tr>
            <th>ESCALERAS</th>
            <th style="width: 32%">${xBox(eq.escaleras)}</th>
          </tr>
        </table>

        <table>
          <tr>
            <th>OFICINAS</th>
            <th style="width: 32%">${xBox(eq.oficinas)}</th>
          </tr>
        </table>

        <table>
          <tr>
            <th>ALMACEN / C. HERRAMIENTAS</th>
            <th style="width: 24%">${xBox(eq.almacen)}</th>
          </tr>
        </table>
      </div>

      <div class="twoCols">
        <table class="workerTable">
          <tr>
            <th>NOMBRE COMPLETO DE QUIEN REALIZA TBM-KY</th>
            <th style="width: 22%">CARGO</th>
            <th style="width: 18%">NÓMINA</th>
          </tr>

          ${renderTrabajadoresRows(payload)}
        </table>

        <table class="workInfoTable">
          <tr>
            <th style="width: 48%">NÚMERO DE EQUIPO:</th>
            <th class="left">${equipment}</th>
          </tr>

          <tr>
            <th>ÁREA DE TRABAJO:</th>
            <th class="left areaText">${area}</th>
          </tr>

          <tr>
            <th>JEFE INMEDIATO:</th>
            <th class="left">${jefe}</th>
          </tr>
        </table>
      </div>

      <table style="margin-top: 4px">
        <tr>
          <th>
            <strong>INDICA SI TU ACTIVIDAD ES RUTINARIA O NO RUTINARIA</strong>
            (Rutinaria: plan de trabajo mensual, No Rutinaria: fuera del plan mensual (Fallas, solicitud de cliente))
          </th>
        </tr>
      </table>

      <div class="equiposRow">
        <table style="width: 32%; margin-left: auto">
          <tr>
            <th style="height: 15px">RUTINARIA</th>
            <th style="width: 42%">${xBox(rutinaria)}</th>
          </tr>
        </table>

        <table style="width: 32%; margin-right: auto">
          <tr>
            <th>NO RUTINARIA</th>
            <th style="width: 42%">${xBox(noRutinaria)}</th>
          </tr>
        </table>
      </div>

      <table>
        <tr>
          <th style="width: 18%">ACTIVIDAD DEL DIA:</th>
          <th class="left activityText">${actividadDia}</th>
        </tr>

        <tr>
          <th colspan="2" class="left">
            NOTA: Si tu actividad cambia de RUTINARIA a NO RUTINARIA, avisa a tu jefe inmediato para evaluar las condiciones y el trabajo a realizar.
          </th>
        </tr>

        <tr>
          <td colspan="2" class="black">CHEQUEO INDIVIDUAL DE SALUD</td>
        </tr>
      </table>

      <div style="display: flex; margin-top: 3px">
        <table style="width: 58%">
          <tr>
            <th>Si usted o sus compañeros tienen alguno de los siguientes sintomas marque con una (X)</th>
          </tr>
        </table>
      </div>

      <div class="healthWrap">
        <table class="healthLeft">
          <tr>
            <td class="left symptomText">
              <strong>Auto chequeo individual:</strong><br /><br />
              ${xBox(sintomas.includes(SINTOMAS_FORMATO[0]))} ${esc(SINTOMAS_FORMATO[0])}.<br />
              ${xBox(sintomas.includes(SINTOMAS_FORMATO[1]))} ${esc(SINTOMAS_FORMATO[1])}.<br />
              ${xBox(sintomas.includes(SINTOMAS_FORMATO[2]))} ${esc(SINTOMAS_FORMATO[2])}.<br />
              ${xBox(sintomas.includes(SINTOMAS_FORMATO[3]))} ${esc(SINTOMAS_FORMATO[3])}.<br />
              ${xBox(sintomas.includes(SINTOMAS_FORMATO[4]))} ${esc(SINTOMAS_FORMATO[4])}.<br />
              ${xBox(sintomas.includes(SINTOMAS_FORMATO[5]))} Indigestión / diarrea.
            </td>
          </tr>
        </table>

        <table class="healthRight">
          <tr>
            <th colspan="2">RECORDEMOS QUE</th>
          </tr>

          <tr>
            <th class="rememberImgCell"></th>
            <td class="left rememberText">
              <strong>PELIGRO</strong><br />
              Trabajo en alturas.<br /><br />

              <strong>RIESGO</strong><br />
              Caída a distinto nivel.<br />
              Caída de objetos.<br />
              Contactos eléctricos.
            </td>
          </tr>
        </table>
      </div>

      <div class="twoCols" style="margin-top: 4px">
        <table style="width: 58%">
          <tr>
            <th>
              NOTA: En caso de presentar algun sintoma notifica a jefe inmediato y servicio medico para tu valoración y seguimiento.
            </th>
          </tr>
        </table>

        <table style="width: 42%">
          <tr>
            <td>PELIGRO: CAUSA &nbsp;&nbsp;&nbsp;&nbsp; RIESGO: CONSECUENCIA</td>
          </tr>
        </table>
      </div>

      <table style="margin-top: 3px">
        <tr>
          <td class="black">
            EQUIPO DE PROTECCION PERSONAL: SELECCIONE LOS NECESARIOS PARA LA ACTIVIDAD
          </td>
        </tr>
      </table>

      ${renderEppBlock(eppSel)}

      <table style="margin-top: 3px">
        <tr>
          <td colspan="8" class="toolCell">
            ¿LA ACTIVIDAD REQUIERE ALGUNA HERRAMIENTA ESPECIAL O EQUIPO DE TRABAJO ESPECÍFICO?<br />
            <span style="font-size: 6.8px; font-weight: normal">${herramientas}</span>
          </td>
        </tr>

        <tr>
          <td colspan="8" class="black">
            ROUND 1&nbsp;&nbsp; (IDENTIFICACION DE TODOS LOS RIESGOS POSIBLES)
          </td>
        </tr>
      </table>

      <table class="round1Table">
        ${renderRound1(hasRiesgo)}
      </table>
    </div>

    <div class="pageFooter">
      <span class="pageNumber">1/2</span>
      <span class="pdfCode">TLA-SHO-FRT-004.1</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 2 ==================== -->
  <div class="pagina">
    <div class="pageContent">
      <table class="round2Table">
        <tr>
          <td colspan="3" class="black">
            ROUND 2&nbsp;&nbsp; (ESTUDIO DEL NUCLEO: RIESGOS MAS IMPORTANTES IDENTIFIQUE Y MARQUE TOP 3)
          </td>
        </tr>

        <tr>
          <th colspan="3" class="left">
            Identifica los 4 riesgos a los que estarás más expuesto durante tus actividades. (Es obligatorio llenar las 4 filas con un riesgo diferente)
          </th>
        </tr>

        <tr>
          <th class="round2Top">TOP</th>
          <th>RIESGOS</th>
          <th>¿POR QUE PUEDE PASAR?</th>
        </tr>

        ${renderRound2(topR, causas)}

        <tr>
          <th colspan="3" class="left">
            En la columna TOP enumera del 1 al 3 los riesgos más importantes en orden de más gravedad o probabilidad de que ocurra.
          </th>
        </tr>
      </table>

      <table style="margin-top: 4px">
        <tr>
          <td colspan="4" class="black">
            ROUND 3&nbsp;&nbsp; (MEDIDAS DE CONTROL: SUGIERA MEDIDAS CONCRETAS)
          </td>
        </tr>

        <tr>
          <th colspan="4" class="left">
            De los tres riesgos enumerados en la columna TOP coloque las medidas de control necesarias para cada uno.
          </th>
        </tr>

        <tr>
          <th>No.</th>
          <th colspan="2">MEDIDAS DE CONTROL A IMPLEMENTAR</th>
          <th>(ACCION A REALIZAR)</th>
        </tr>

        ${renderMedidasAcciones(medidas, acciones)}
      </table>

      <table class="round4Table">
        <tr>
          <td colspan="2" class="black" style="width: 52%">
            ROUND 4 (ACCIONES A REALIZAR, SEÑALAR Y LLAMAR)
          </td>

          <th rowspan="4" style="width: 8%"></th>

          <td colspan="2" class="black">
            FIRMA TECNICO
          </td>
        </tr>

        <tr>
          <th style="width: 5%">1</th>
          <th class="left">${esc(acciones?.[0] || "")}</th>

          <th colspan="2" rowspan="3" class="firmaCell">
            ${
              firmaTecnico
                ? `<img class="sig" src="data:image/png;base64,${firmaTecnico}" />`
                : ``
            }
          </th>
        </tr>

        <tr>
          <th>2</th>
          <th class="left">${esc(acciones?.[1] || "")}</th>
        </tr>

        <tr>
          <th>3</th>
          <th class="left">${esc(acciones?.[2] || "")}</th>
        </tr>
      </table>

      <table class="noteRound4">
        <tr>
          <th>
            NOTA: DEBERAS REALIZAR EL SEÑALAR Y LLAMAR EN LAS ACCIONES ENLISTADAS EN EL ROUND 4
          </th>
        </tr>
      </table>

      <table class="nuevoRiesgoTable">
        <tr>
          <th colspan="2">
            EN CASO DE CAMBIO DE CONDICIONES DE TRABAJO INDIQUE EN ESTE ESPACIO LOS NUEVOS RIESGOS Y MEDIDAS ADICIONALES A IMPLEMENTAR.
          </th>
        </tr>

        <tr>
          <th class="gray">NUEVO RIESGO</th>
          <th class="gray">MEDIDA DE CONTROL</th>
        </tr>

        ${renderNuevosRiesgos(nuevosRiesgos)}

        <tr>
          <th colspan="2" style="height: 28px"></th>
        </tr>
      </table>

      <table class="phrase">
        <tr>
          <th>
            Es mejor perder un minuto en la vida que la vida en un minuto, priorizar la seguridad sobre la prisa puede marcar la diferencia entre realizar tus actividades sano y regresar a casa o sufrir un accidente.
          </th>
        </tr>
      </table>
    </div>

    <div class="pageFooter">
      <span class="pageNumber">2/2</span>
      <span class="pdfCode">TLA-SHO-FRT-004.1</span>
    </div>
  </div>
</body>
</html>`;
}