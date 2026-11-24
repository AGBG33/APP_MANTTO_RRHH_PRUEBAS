// src/services/templates/solicitud_prestamo_refacciones/buildSolicitudPrestamoRefaccionesHtml.js

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

function mark(value, expected) {
  return safe(value).toLowerCase() === safe(expected).toLowerCase() ? "X" : "";
}

function renderRefacciones(refacciones = []) {
  const rows = Array.isArray(refacciones) ? refacciones : [];
  const total = Math.max(12, rows.length);

  return Array.from({ length: total })
    .map((_, index) => {
      const r = rows[index] || {};

      return `
        <tr>
          <td class="center code">${escapeHtml(r.codigo)}</td>
          <td class="center qty">${escapeHtml(r.cantidad)}</td>
          <td>${escapeHtml(r.nombreRef)}</td>
          <td class="center date">${escapeHtml(r.fechaDevolucionDMY)}</td>
          <td class="center date warehouse">${escapeHtml(r.fechaRealDMY)}</td>
        </tr>
      `;
    })
    .join("");
}

export function buildSolicitudPrestamoRefaccionesHtml(data = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SOLICITUD DE PRÉSTAMO DE REFACCIONES</title>

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
    background: #fff;
    font-size: 8px;
  }

  .page {
    width: 576px;
    margin: 0 auto;
    padding: 18px;
  }

  .company {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 13px;
    margin-bottom: 2px;
  }

  .address {
    font-size: 8px;
    line-height: 1.35;
    margin-bottom: 12px;
  }

  .title {
    font-size: 15px;
    font-weight: 700;
    text-align: center;
    margin: 8px 0 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th,
  td {
    border: 1px solid #000;
    padding: 3px;
    font-size: 8px;
    vertical-align: middle;
  }

  th {
    text-align: center;
    font-weight: 700;
  }

  td {
    font-weight: 400;
  }

  .gray {
    background: #e7e7e7;
    font-weight: 700;
  }

  .center {
    text-align: center;
  }

  .date-table {
    width: 55%;
    margin-left: auto;
    margin-bottom: 10px;
  }

  .meta {
    margin-bottom: 10px;
  }

  .requester {
    margin-bottom: 10px;
  }

  .materials {
    margin-bottom: 4px;
  }

  .materials td {
    height: 22px;
  }

  .code {
    width: 14%;
  }

  .qty {
    width: 12%;
  }

  .date {
    width: 17%;
  }

  .warehouse {
    background: #fafafa;
  }

  .note {
    font-size: 7.5px;
    margin: 4px 0 10px;
  }

  .motive-title {
    background: #e7e7e7;
    text-align: center;
    font-weight: 700;
  }

  .motive {
    min-height: 62px;
    vertical-align: top;
    line-height: 1.4;
    padding: 6px;
  }

  .commitment {
    margin-top: 10px;
  }

  .commitment td {
    background: #eadfdf;
    padding: 7px;
    line-height: 1.45;
    font-size: 7.5px;
  }

  .check {
    display: inline-flex;
    width: 12px;
    height: 12px;
    border: 1px solid #000;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
    margin: 0 4px 0 2px;
  }

  .signatures {
    margin-top: 10px;
  }

  .signatures .sign-space {
    height: 64px;
    vertical-align: bottom;
    text-align: center;
    font-size: 8px;
  }

  .signatures .sign-title {
    background: #e7e7e7;
    font-weight: 700;
    text-align: center;
    height: 34px;
  }

  .footer {
    font-size: 8px;
    font-weight: 700;
    margin-top: 6px;
  }
</style>
</head>

<body>
  <div class="page">
    <div class="company">MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.</div>
    <div class="address">
      Mariano Escobedo 69. Col. Zona Industrial, Tlalnepantla Edo. México, C.P. 54030
    </div>

    <div class="title">SOLICITUD DE PRÉSTAMO DE REFACCIONES</div>

    <table class="date-table">
      <tr>
        <th class="gray" style="width:25%;">FECHA</th>
        <td class="center">${escapeHtml(data.fechaTexto || data.fechaDMY)}</td>
      </tr>
    </table>

    <table class="meta">
      <tr>
        <th class="gray" style="width:20%;">DEPARTAMENTO:</th>
        <td style="width:28%;">${escapeHtml(data.departamento)}</td>
        <th class="gray" style="width:17%;">EQUIPO/S:<br />[MX-No]</th>
        <td>${escapeHtml(data.equipoMx)}</td>
      </tr>
      <tr>
        <th class="gray">RAZÓN<br />SOCIAL:</th>
        <td>${escapeHtml(data.razonSocial)}</td>
        <th class="gray">DIRECCIÓN:</th>
        <td>${escapeHtml(data.direccion)}</td>
      </tr>
      <tr>
        <th class="gray">ESTADO DEL EQUIPO:</th>
        <td colspan="3">
          <span class="check">${mark(data.estadoEquipo, "Detenido")}</span> DETENIDO
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="check">${mark(data.estadoEquipo, "Operando con deficiencias")}</span> OPERANDO CON DEFICIENCIAS
        </td>
      </tr>
    </table>

    <table class="requester">
      <tr>
        <th class="gray" style="width:20%;">SOLICITANTE:<br />[NÓMINA-NOMBRE]</th>
        <td>${escapeHtml(data.solicitante)}</td>
        <th class="gray" style="width:16%;">PUESTO:</th>
        <td style="width:28%;">${escapeHtml(data.puesto)}</td>
      </tr>
    </table>

    <table class="materials">
      <tr>
        <th class="gray">CÓDIGO:</th>
        <th class="gray">CANTIDAD:</th>
        <th class="gray">NOMBRE DE REFACCIÓN:</th>
        <th class="gray">FECHA DE<br />DEVOLUCIÓN:</th>
        <th class="gray">FECHA<br />REAL*:</th>
      </tr>

      ${renderRefacciones(data.refacciones)}
    </table>

    <div class="note">* COLUMNA DE LLENADO EXCLUSIVO POR ALMACÉN</div>

    <table>
      <tr>
        <th class="motive-title">MOTIVO DE LA SOLICITUD:</th>
      </tr>
      <tr>
        <td class="motive">${multiline(data.motivo)}</td>
      </tr>
    </table>

    <table class="commitment">
      <tr>
        <td>
          EL SOLICITANTE SE COMPROMETE A CERRAR EL PRÉSTAMO DE LAS REFACCIONES DESCRITAS EN UN LAPSO NO MAYOR A 30 DÍAS HÁBILES CON LOS SIGUIENTES DOCUMENTOS:<br /><br />
          • MEMORÁNDUM DE DEVOLUCIÓN CON [No AVISO, No RESERVA, No DIARIO]<br />
          • SALIDA ORIGINAL DE ALMACÉN<br />
          • PIEZA/S EN BUEN ESTADO
        </td>
      </tr>
    </table>

    <table class="signatures">
      <tr>
        <td class="sign-space">${multiline(data.firmaSolicitante)}</td>
        <td class="sign-space">${multiline(data.firmaJefatura)}</td>
        <td class="sign-space">${multiline(data.firmaAutorizacion)}</td>
      </tr>
      <tr>
        <th class="sign-title">FIRMA Y SELLO DEL SOLICITANTE</th>
        <th class="sign-title">FIRMA Y SELLO DE JEFATURA</th>
        <th class="sign-title">AUTORIZACIÓN:<br />DIRECCIÓN / SUBDIRECCIÓN / GERENCIA</th>
      </tr>
    </table>

    <div class="footer">TLA-GMA-FRT-017.0</div>
  </div>
</body>
</html>
`;
}