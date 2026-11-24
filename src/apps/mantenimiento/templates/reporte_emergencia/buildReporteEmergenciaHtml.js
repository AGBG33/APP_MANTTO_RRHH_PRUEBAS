import { LOGO_DATA_URI } from "../logoBase64";

const safe = (v) => String(v ?? "").trim();

function escapeHtml(value) {
  return safe(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function checked(value, expected) {
  return String(value || "").toLowerCase() === String(expected || "").toLowerCase()
    ? "X"
    : "";
}

function lineText(value) {
  return escapeHtml(value || "");
}

function renderMecanicos(mecanicos = []) {
  const rows = Array.isArray(mecanicos) ? mecanicos : [];
  const clean = rows.map((m) => safe(m?.nombre || m)).filter(Boolean);

  const finalRows = clean.length ? clean : [""];

  return finalRows
    .map(
      (nombre) => `
      <div class="line-row">
        <span>${escapeHtml(nombre)}</span>
      </div>
    `,
    )
    .join("");
}

function renderRefacciones(refacciones = []) {
  const rows = Array.isArray(refacciones) ? refacciones : [];
  const visibles = rows.length ? rows : [];

  const minRows = 4;
  const totalRows = Math.max(minRows, visibles.length);

  let html = "";

  for (let i = 0; i < totalRows; i++) {
    const r = visibles[i] || {};
    html += `
      <tr>
        <td class="center">${escapeHtml(r.cantidad || "")}</td>
        <td>${escapeHtml(r.descripcion || "")}</td>
        <td class="center">${checked(r.cargoCliente, "Sí")}</td>
        <td class="center">${checked(r.cargoCliente, "No")}</td>
        <td>${escapeHtml(r.codigoInterno || "")}</td>
      </tr>
    `;
  }

  return html;
}

export function buildReporteEmergenciaHtml(data = {}) {
  const fecha = data?.fechaDMY || "";
  const numeroReporte = data?.numeroReporte || data?.orderid || "";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>REPORTE DE EMERGENCIA</title>
<style>
  @page {
    size: letter;
    margin: 18px;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 8px;
    background: #fff;
  }

  .page {
    width: 576px;
    margin: 0 auto;
    padding: 10px;
  }

  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo {
    width: 135px;
    height: auto;
  }

  .divider {
    width: 2px;
    height: 45px;
    background: #000;
  }

  .company-title {
    font-weight: 800;
    font-size: 12px;
    line-height: 1.05;
  }

  .report-box {
    width: 115px;
    border: 1px solid #000;
    border-radius: 8px;
    overflow: hidden;
    text-align: center;
  }

  .report-box-title {
    font-size: 8px;
    padding: 3px;
    border-bottom: 1px solid #000;
  }

  .report-number {
    color: #c62828;
    font-size: 18px;
    letter-spacing: 2px;
    padding: 4px 0;
  }

  .address {
    width: 390px;
    font-size: 7.5px;
    line-height: 1.2;
    margin-top: -2px;
    margin-bottom: 3px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td, th {
    border: 1px solid #000;
    padding: 2px 3px;
    font-size: 8px;
    font-weight: normal;
    vertical-align: top;
  }

  th {
    text-align: center;
  }

  .date-box {
    width: 360px;
    margin: 3px 0 5px 70px;
  }

  .two-col {
    display: flex;
    gap: 8px;
    margin-bottom: 5px;
  }

  .left {
    width: 64%;
  }

  .right {
    width: 36%;
  }

  .rounded {
    border: 1px solid #000;
    border-radius: 7px;
    overflow: hidden;
  }

  .box-title {
    text-align: center;
    border-bottom: 1px solid #000;
    padding: 2px;
    font-size: 7.5px;
    font-weight: 700;
  }

  .box-content {
    padding: 4px 5px;
    min-height: 48px;
    line-height: 1.45;
  }

  .line-row {
    min-height: 13px;
    border-bottom: 1px solid #000;
    padding: 2px 4px;
  }

  .line-row:last-child {
    border-bottom: none;
  }

  .time-table th,
  .time-table td {
    height: 22px;
    vertical-align: middle;
  }

  .label {
    font-weight: 700;
  }

  .main-line {
    border-bottom: 1px solid #000;
    min-height: 17px;
    padding: 3px 4px;
    line-height: 1.25;
  }

  .big-section {
    border: 1px solid #000;
    margin-top: 5px;
  }

  .big-row {
    border-bottom: 1px solid #000;
    min-height: 34px;
    padding: 4px;
    line-height: 1.3;
  }

  .big-row.tall {
    min-height: 45px;
  }

  .big-row:last-child {
    border-bottom: none;
  }

  .ref-title {
    text-align: center;
    font-weight: 700;
    font-size: 10px;
    padding: 2px;
  }

  .center {
    text-align: center;
    vertical-align: middle;
  }

  .cliente-box {
    margin-top: 8px;
    border: 1px solid #000;
    border-radius: 8px;
    overflow: hidden;
  }

  .cliente-title {
    font-weight: 800;
    font-size: 11px;
    padding: 4px;
    border-bottom: 1px solid #000;
  }

  .footer-grid {
    display: grid;
    grid-template-columns: 45% 55%;
  }

  .instructions {
    border-right: 1px solid #000;
    padding: 6px;
    line-height: 1.25;
  }

  .signature {
    padding: 8px;
    line-height: 2.05;
  }

  .footer-code {
    margin-top: 4px;
    font-size: 7px;
  }

  .small {
    font-size: 7px;
  }
</style>
</head>

<body>
  <div class="page">
    <div class="top">
      <div>
        <div class="brand">
          <img class="logo" src="${LOGO_DATA_URI}" />
          <div class="divider"></div>
          <div class="company-title">
            MITSUBISHI ELECTRIC<br />
            DE MÉXICO, S.A. DE C.V.
          </div>
        </div>

        <div class="address">
          <strong>MITSUBISHI ELECTRIC DE MEXICO, S.A. DE C.V.</strong><br />
          MARIANO ESCOBEDO No 69 ZONA INDUSTRIAL<br />
          TLALNEPANTLA, EDO. DE MEX. C.P 54030<br />
          TELÉFONOS DE EMERGENCIA 24 HRS. Y ATENCIÓN A CLIENTES<br />
          800-926-3526 &nbsp;&nbsp; 800-926-3563 &nbsp;&nbsp; 55 5341-8512
        </div>
      </div>

      <div class="report-box">
        <div class="report-box-title">REPORTE DE<br />EMERGENCIA</div>
        <div class="report-number">${escapeHtml(numeroReporte)}</div>
      </div>
    </div>

    <table class="date-box">
      <tr>
        <td class="center">FECHA &nbsp;&nbsp; ${escapeHtml(fecha)}</td>
      </tr>
    </table>

    <div class="two-col">
      <div class="left rounded">
        <div class="box-title">SERVICIO DE EMERGENCIA EFECTUADO EN</div>
        <div class="box-content">
          <span class="label">MX:</span> ${lineText(data.mx)}<br />
          <span class="label">RAZÓN SOCIAL:</span> ${lineText(data.razonSocial)}<br />
          <span class="label">DIRECCIÓN:</span> ${lineText(data.direccion)}
        </div>
      </div>

      <div class="right rounded">
        <table class="time-table">
          <tr><th colspan="2">MECÁNICO/SUPERVISOR</th></tr>
          <tr>
            <th>ENTRADA</th>
            <td class="center">${escapeHtml(data.horaEntrada || "")} HS</td>
          </tr>
          <tr>
            <th>SALIDA</th>
            <td class="center">${escapeHtml(data.horaSalida || "")} HS</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="two-col">
      <div class="left rounded">
        <table>
          <tr>
            <td style="width:70px;" class="center">MECÁNICOS</td>
            <td style="padding:0;">${renderMecanicos(data.mecanicos)}</td>
          </tr>
        </table>
      </div>

      <div class="right rounded">
        <table>
          <tr><th>HORA DE LLAMADA</th></tr>
          <tr><td class="center">${escapeHtml(data.horaLlamada || "")}</td></tr>
        </table>
      </div>
    </div>

    <div class="two-col">
      <div class="left rounded">
        <table>
          <tr>
            <td style="width:70px;" class="center">SUPERVISOR</td>
            <td>${escapeHtml(data.supervisor || "")}</td>
          </tr>
        </table>
      </div>

      <div class="right rounded">
        <table>
          <tr>
            <th style="width:50px;">CT</th>
            <td>${escapeHtml(data.ct || "")}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="main-line">
      <span class="label">REPORTE:</span> ${lineText(data.reporte)}
    </div>

    <div class="big-section">
      <div class="big-row">
        <span class="label">ESTADO DE EQUIPO:</span><br />
        ${lineText(data.estadoEquipo)}
      </div>

      <div class="big-row tall">
        <span class="label">ANÁLISIS DE FALLA:</span><br />
        ${lineText(data.analisisFalla)}
      </div>

      <div class="big-row tall">
        <span class="label">FORMAS DE CORRECCIÓN:</span><br />
        ${lineText(data.formasCorreccion)}
      </div>

      <div class="big-row">
        <span class="label">NOTAS:</span><br />
        ${lineText(data.notas)}
      </div>
    </div>

    <table>
      <tr>
        <th colspan="5" class="ref-title">REFACCIONES UTILIZADAS</th>
      </tr>
      <tr>
        <th rowspan="2">CANTIDAD</th>
        <th rowspan="2">DESCRIPCIÓN</th>
        <th colspan="2">CON CARGO<br />AL CLIENTE</th>
        <th rowspan="2">CÓDIGO<br />INTERNO</th>
      </tr>
      <tr>
        <th>SI</th>
        <th>NO</th>
      </tr>
      ${renderRefacciones(data.refacciones)}
    </table>

    <div class="cliente-box">
      <div class="cliente-title">ESTIMADO CLIENTE:</div>

      <table>
        <tr>
          <th style="width:78%;">
            ¿LE FUERON ENTREGADAS LAS REFACCIONES UTILIZADAS O DAÑADAS?
          </th>
          <th style="width:11%;">SI<br />${checked(data.entregoRefUsadas, "Sí")}</th>
          <th style="width:11%;">NO<br />${checked(data.entregoRefUsadas, "No")}</th>
        </tr>
      </table>

      <div class="footer-grid">
        <div class="instructions">
          1.- FAVOR DE VERIFICAR LA HORA DE ENTRADA Y SALIDA DEL MECÁNICO/SUPERVISOR QUE ATENDIÓ.<br /><br />
          2.- CUANDO HAYA CAMBIO DE REFACCIONES EXIJA LE ENTREGUEN LAS USADAS DAÑADAS.<br /><br />
          3.- FAVOR DE FIRMAR ESTE REPORTE DESPUÉS QUE HAYAN ATENDIDO SU EQUIPO.
        </div>

        <div class="signature">
          FIRMA: ${escapeHtml(data.firmaCliente || "")}<br />
          NOMBRE: ${escapeHtml(data.nombreCliente || "")}<br />
          PUESTO: ${escapeHtml(data.puestoCliente || "")}
        </div>
      </div>
    </div>

    <div class="footer-code">TEP-GMA-FRT-005.3</div>
  </div>
</body>
</html>
`;
}