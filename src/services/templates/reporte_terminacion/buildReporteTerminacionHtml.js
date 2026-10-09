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

function multiline(value) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function checked(value, expected) {
  return safe(value).toLowerCase() === safe(expected).toLowerCase() ? "X" : "";
}

function renderMecanicos(mecanicos = []) {
  const rows = Array.isArray(mecanicos) ? mecanicos : [];
  const clean = rows.map((m) => safe(m?.nombre || m)).filter(Boolean);
  const finalRows = clean.length ? clean : [""];

  return finalRows
    .map(
      (nombre) => `
        <div class="miniLine">${escapeHtml(nombre)}</div>
      `,
    )
    .join("");
}

function renderRefacciones(refacciones = []) {
  const rows = Array.isArray(refacciones) ? refacciones : [];
  const minRows = 6;
  const total = Math.max(minRows, rows.length);

  let html = "";

  for (let i = 0; i < total; i++) {
    const r = rows[i] || {};
    html += `
      <tr>
        <td class="center">${escapeHtml(r.cantidad)}</td>
        <td>${escapeHtml(r.descripcion)}</td>
        <td>${escapeHtml(r.codigoInterno)}</td>
      </tr>
    `;
  }

  return html;
}

export function buildReporteTerminacionHtml(data = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>REPORTE DE TERMINACIÓN Y CONFORMIDAD DE SERVICIOS REALIZADOS</title>

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
    padding: 12px;
  }

  .top {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .brand {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo {
    width: 145px;
    height: auto;
  }

  .divider {
    width: 2px;
    height: 52px;
    background: #000;
  }

  .company {
    font-weight: 800;
    font-size: 12px;
    line-height: 1.1;
  }

  .folioBox {
    width: 185px;
    border: 1px solid #000;
    border-radius: 7px;
    overflow: hidden;
    text-align: center;
  }

  .folioTitle {
    padding: 5px;
    font-size: 9px;
    font-weight: 700;
    border-bottom: 1px solid #000;
    line-height: 1.25;
  }

  .folio {
    color: #c62828;
    font-size: 18px;
    letter-spacing: 1px;
    padding: 6px 0;
  }

  .phones {
    margin-top: 8px;
    font-size: 7px;
    line-height: 1.35;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 8px;
  }

  td, th {
    border: 1px solid #000;
    padding: 3px;
    font-size: 8.5px;
    font-weight: normal;
    vertical-align: top;
  }

  th {
    text-align: center;
  }

  .center {
    text-align: center;
    vertical-align: middle;
  }

  .twoCol {
    display: flex;
    gap: 10px;
    width: 100%;
  }

  .left70 {
    width: 70%;
  }

  .right30 {
    width: 30%;
  }

  .lineRow {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    margin: 3px 0;
  }

  .label {
    font-weight: 700;
    white-space: nowrap;
  }

  .line {
    flex: 1;
    border-bottom: 1px solid #000;
    min-height: 12px;
    padding: 0 3px 1px 3px;
  }

  .miniLine {
    min-height: 14px;
    border-bottom: 1px solid #000;
    padding: 2px 4px;
  }

  .miniLine:last-child {
    border-bottom: none;
  }

  .textBox {
    min-height: 58px;
    line-height: 1.35;
    text-align: left;
  }

  .notesBox {
    min-height: 28px;
    line-height: 1.35;
    text-align: left;
  }

  .checkBox {
    width: 35px;
    height: 18px;
    border: 1px solid #000;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
  }

  .legal {
    font-size: 7px;
    line-height: 1.3;
    text-align: justify;
  }

  .footerCode {
    margin-top: 5px;
    font-size: 8px;
  }
</style>
</head>

<body>
  <div class="page">
    <div class="top">
      <div class="brand">
        <img class="logo" src="${LOGO_DATA_URI}" />
        <div class="divider"></div>
        <div class="company">
          MITSUBISHI ELECTRIC<br />
          DE MÉXICO, S.A. DE C.V.
        </div>
      </div>

      <div class="folioBox">
        <div class="folioTitle">
          REPORTE DE TERMINACIÓN Y<br />
          CONFORMIDAD DE SERVICIOS<br />
          REALIZADOS.
        </div>
        <div class="folio">${escapeHtml(data.folioReporte || "")}</div>
      </div>
    </div>

    <div class="phones">
      TELÉFONOS DE EMERGENCIA 24HRS. Y ATENCIÓN A CLIENTES (CALL CENTER), EN<br />
      ZONA METROPOLITANA E INTERIOR DEL PAÍS:<br />
      800-926-3526 &nbsp;&nbsp;&nbsp;&nbsp; 800-926-3563
    </div>

    <table style="width:70%;">
      <tr>
        <th style="width:20%;">FECHA</th>
        <th>${escapeHtml(data.fecha || "")}</th>
      </tr>
    </table>

    <div class="twoCol">
      <table class="left70">
        <tr>
          <th>MANTENIMIENTO CORRECTIVO EFECTUADO EN</th>
        </tr>
        <tr>
          <td>
            <div class="lineRow">
              <span class="label">MX:</span>
              <span class="line">${escapeHtml(data.mx)}</span>
              <span class="label">N° DE COTIZACIÓN:</span>
              <span class="line">${escapeHtml(data.numeroCotizacion)}</span>
            </div>
            <div class="lineRow">
              <span class="label">NOMBRE:</span>
              <span class="line">${escapeHtml(data.nombreCliente)}</span>
            </div>
            <div class="lineRow">
              <span class="label">DIRECCIÓN:</span>
              <span class="line">${escapeHtml(data.direccion)}</span>
            </div>
            <div class="lineRow">
              <span class="label">N° ELEVADOR:</span>
              <span class="line">${escapeHtml(data.numeroElevador)}</span>
            </div>
          </td>
        </tr>
      </table>

      <table class="right30">
        <tr><th colspan="2">HORARIO</th></tr>
        <tr>
          <th>ENTRADA</th>
          <td class="center">${escapeHtml(data.horaEntrada)} HRS</td>
        </tr>
        <tr>
          <th>SALIDA</th>
          <td class="center">${escapeHtml(data.horaSalida)} HRS</td>
        </tr>
      </table>
    </div>

    <div class="twoCol">
      <table class="left70">
        <tr>
          <th style="width:70px;">MECÁNICOS</th>
          <td style="padding:0;">${renderMecanicos(data.mecanicos)}</td>
        </tr>
      </table>

      <table class="right30">
        <tr><th>CHAPAS Y LLAVES KABA</th></tr>
        <tr>
          <td>
            <div class="lineRow">
              <span class="label">N° DEPTO:</span>
              <span class="line">${escapeHtml(data.numeroDepto)}</span>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <table>
      <tr>
        <th>
          <div class="textBox">
            <span class="label">DESCRIPCIÓN GENERAL DEL TRABAJO:</span><br />
            ${multiline(data.descripcionTrabajo)}
          </div>
        </th>
      </tr>
    </table>

    <table>
      <tr>
        <th colspan="3">REFACCIONES UTILIZADAS:</th>
      </tr>
      <tr>
        <th style="width:18%;">CANTIDAD</th>
        <th>DESCRIPCIÓN</th>
        <th style="width:28%;">CÓDIGO INTERNO</th>
      </tr>
      ${renderRefacciones(data.refacciones)}
    </table>

    <table>
      <tr>
        <th style="width:70px;">NOTAS:</th>
        <td class="notesBox">${multiline(data.notas)}</td>
      </tr>
    </table>

    <p style="font-size:9px; margin: 10px 0 4px 0;">
      FIRMA DE CONFORMIDAD Y ACEPTACIÓN DEL CLIENTE
    </p>

    <table>
      <tr>
        <th colspan="2" style="border-bottom:none;">
          LAS REFACCIONES DAÑADAS LE FUERON ENTREGADAS
        </th>
        <td rowspan="2" style="width:50%;">
          <div class="lineRow">
            <span class="label">NOMBRE:</span>
            <span class="line">${escapeHtml(data.nombreFirmaCliente)}</span>
          </div>
          <div class="lineRow">
            <span class="label">PUESTO:</span>
            <span class="line">${escapeHtml(data.puestoCliente)}</span>
          </div>
          <div class="lineRow">
            <span class="label">FIRMA:</span>
            <span class="line">${escapeHtml(data.firmaCliente)}</span>
          </div>
        </td>
      </tr>
      <tr>
        <th style="border-right:none; border-top:none;">
          SI <span class="checkBox">${checked(data.refaccionesEntregadas, "Sí")}</span>
        </th>
        <th style="border-left:none; border-top:none;">
          NO <span class="checkBox">${checked(data.refaccionesEntregadas, "No")}</span>
        </th>
      </tr>
      <tr>
        <th colspan="3" class="legal">
          Si persona diversa a EL CLIENTE o su REPRESENTANTE LEGAL firma el presente documento,
          EL CLIENTE quedará obligado en los términos que se precisan en el presente instrumento,
          renunciando a cualquier derecho que pudiera tener para impugnar posteriormente dicha personalidad,
          por lo que no podrán invocar o hacer valer ninguna acción, excepción o defensa en contrario,
          para todos los efectos legales a que haya lugar.
        </th>
      </tr>
    </table>

    <div class="footerCode">TEP-CTZ-FRT-003E</div>
  </div>
</body>
</html>
`;
}