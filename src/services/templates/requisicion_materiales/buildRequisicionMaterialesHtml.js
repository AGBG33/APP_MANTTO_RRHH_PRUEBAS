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
  return safe(value).toLowerCase() === safe(expected).toLowerCase()
    ? "X"
    : "";
}

function renderMateriales(materiales = []) {
  const rows = Array.isArray(materiales) ? materiales : [];
  const total = Math.max(8, rows.length);

  return Array.from({ length: total })
    .map((_, i) => {
      const r = rows[i] || {};
      return `
        <tr>
          <td>${escapeHtml(r.codigoDynamics)}</td>
          <td>${escapeHtml(r.codigoMrp)}</td>
          <td colspan="2">${escapeHtml(r.descripcion)}</td>
          <td class="center">${escapeHtml(r.cantidad)}</td>
          <td class="center">${escapeHtml(r.um)}</td>
          <td>${escapeHtml(r.observaciones)}</td>
        </tr>
      `;
    })
    .join("");
}

export function buildRequisicionMaterialesHtml(data = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>REQUISICIÓN DE MATERIALES</title>

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
    font-size: 9px;
  }

  .page {
    width: 576px;
    margin: 0 auto;
    padding: 18px;
  }

  .company {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 16px;
    text-align: left;
  }

  .address {
    font-size: 8px;
    text-align: center;
    line-height: 1.3;
    margin-bottom: 10px;
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
    font-weight: normal;
    vertical-align: middle;
  }

  th {
    text-align: center;
    font-weight: bold;
  }

  .center {
    text-align: center;
  }

  .titleBox {
    height: 88px;
    vertical-align: top;
    text-align: center;
    font-weight: bold;
    font-size: 10px;
  }

  .entregarBox {
    height: 88px;
    vertical-align: top;
    font-size: 8px;
  }

  .mxBox {
    height: 44px;
    vertical-align: top;
    font-size: 8px;
  }

  .dirBox {
    height: 44px;
    vertical-align: top;
    font-size: 8px;
  }

  .lineRow {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    margin-top: 8px;
  }

  .label {
    white-space: nowrap;
    font-weight: bold;
  }

  .line {
    flex: 1;
    border-bottom: 1px solid #000;
    min-height: 12px;
    padding: 0 3px 1px 3px;
  }

  .signatureCell {
    height: 56px;
    vertical-align: top;
    font-size: 8px;
  }

  .incidencias {
    height: 120px;
    vertical-align: top;
    font-size: 8px;
    line-height: 1.6;
  }

  .boxCheck {
    display: inline-flex;
    width: 13px;
    height: 13px;
    border: 1px solid #000;
    align-items: center;
    justify-content: center;
    margin-left: 6px;
    font-size: 9px;
    font-weight: bold;
  }

  .causas {
    height: 120px;
    vertical-align: top;
    line-height: 1.4;
  }

  .causaText {
    margin-top: 5px;
    border-top: 1px solid #000;
    min-height: 88px;
    padding-top: 4px;
  }

  .footer {
    margin-top: 5px;
    font-size: 8px;
    font-weight: bold;
  }
</style>
</head>

<body>
  <div class="page">
    <div class="company">MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.</div>

    <div class="address">
      Mariano Escobedo 69. Col. Zona Industrial, Tlalnepantla Edo. México, C.P. 54030<br />
      Tel: 9171-7600 &nbsp;&nbsp;&nbsp;&nbsp; Call Center: 01 800-926-35-63 / 26
    </div>

    <table>
      <tr>
        <th rowspan="2" colspan="3" class="titleBox">
          REQUISICIÓN DE MATERIALES<br /><br /><br />
          <div class="lineRow">
            <span class="label">AL ALMACÉN</span>
            <span class="line">${escapeHtml(data.almacen)}</span>
          </div>
        </th>

        <th rowspan="2" colspan="3" class="entregarBox">
          ENTREGAR A:<br />
          <div class="lineRow">
            <span class="label">DEPTO</span>
            <span class="line">${escapeHtml(data.depto)}</span>
          </div>
          <div class="lineRow">
            <span class="label">SECCIÓN</span>
            <span class="line">${escapeHtml(data.seccion)}</span>
          </div>
          <div class="lineRow">
            <span class="label">EL DÍA</span>
            <span class="line">${escapeHtml(data.elDia)}</span>
          </div>
        </th>

        <th class="mxBox">
          <div class="lineRow">
            <span class="label">MX</span>
            <span class="line">${escapeHtml(data.mx)}</span>
          </div>
        </th>
      </tr>

      <tr>
        <th class="dirBox">
          DIRECCIÓN / RAZÓN SOCIAL<br />
          ${escapeHtml(data.direccionRazonSocial)}
        </th>
      </tr>

      <tr>
        <th>CODIGO<br />DYNAMICS</th>
        <th>CODIGO MRP</th>
        <th colspan="2">DESCRIPCIÓN</th>
        <th>CANTIDAD</th>
        <th>U / M</th>
        <th>OBSERVACIONES</th>
      </tr>

      ${renderMateriales(data.materiales)}

      <tr>
        <td colspan="2" class="signatureCell">
          EMITIDA POR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; FECHA<br />
          ${escapeHtml(data.emitidaPorFecha)}<br /><br />
          ${escapeHtml(data.emitidaPor)}<br />
          NOMBRE Y FIRMA
        </td>

        <td class="signatureCell">
          SURTIDA POR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; FECHA<br />
          ${escapeHtml(data.surtidaPorFecha)}<br /><br />
          ${escapeHtml(data.surtidaPor)}<br />
          NOMBRE Y FIRMA
        </td>

        <td colspan="3" class="signatureCell">
          RECIBIDA POR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; FECHA<br />
          ${escapeHtml(data.recibidaPorFecha)}<br /><br />
          ${escapeHtml(data.recibidaPor)}<br />
          NOMBRE Y FIRMA
        </td>

        <td class="signatureCell"></td>
      </tr>

      <tr>
        <td colspan="3" class="incidencias" style="border-right:none;">
          <strong>INCIDENCIAS</strong><br /><br />

          1.- SOLICITUD NUEVA
          <span class="boxCheck">${checked(data.incidencia, "Solicitud nueva")}</span><br />

          2.- REPOSICIÓN POR DAÑO
          <span class="boxCheck">${checked(data.incidencia, "Reposición por daño")}</span><br />

          3.- REPOSICIÓN POR EXTRAVÍO
          <span class="boxCheck">${checked(data.incidencia, "Reposición por extravío")}</span><br />

          4.- REPOSICIÓN POR ROBO
          <span class="boxCheck">${checked(data.incidencia, "Reposición por robo")}</span>
        </td>

        <td colspan="4" class="causas" style="border-left:none;">
          <strong>CAUSAS:</strong>
          <div class="causaText">${multiline(data.causas)}</div>
        </td>
      </tr>
    </table>

    <div class="footer">TEP-CRI-FRT-007.2</div>
  </div>
</body>
</html>
`;
}