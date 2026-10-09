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

function mark(value) {
  return value ? "X" : "";
}

function checked(value, expected) {
  return safe(value).toLowerCase() === safe(expected).toLowerCase() ? "X" : "";
}

function renderRefacciones(refacciones = []) {
  const rows = Array.isArray(refacciones) ? refacciones : [];
  const total = Math.max(7, rows.length);

  return Array.from({ length: total })
    .map((_, index) => {
      const row = rows[index] || {};
      return `
        <tr>
          <td>${escapeHtml(row.nombre)}</td>
          <td>${escapeHtml(row.noDibujo)}</td>
          <td class="center">${escapeHtml(row.cantidad)}</td>
          <td class="right">${escapeHtml(row.costo)}</td>
        </tr>
      `;
    })
    .join("");
}

function checkLine(label, checkedValue) {
  return `
    <div class="check-line">
      <span>${escapeHtml(label)}</span>
      <span class="box">${mark(checkedValue)}</span>
    </div>
  `;
}

export function buildReporteAveriaMantenimientoHtml(data = {}) {
  const implementadas = data.medidasImplementadas || {};
  const requeridas = data.medidasRequeridasCC || {};
  const respuesta = data.respuestaCC || {};

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>REPORTE DE AVERÍA EN MANTENIMIENTO</title>
<style>
  @page {
    size: letter;
    margin: 14px;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    font-size: 7px;
  }

  .page {
    width: 584px;
    margin: 0 auto;
    padding: 10px 12px;
    background: #fff;
    page-break-after: always;
  }

  .page:last-child {
    page-break-after: auto;
  }

  h1 {
    text-align: center;
    font-size: 13px;
    margin: 2px 0 3px;
  }

  h2 {
    text-align: center;
    font-size: 10px;
    margin: 0 0 8px;
    font-weight: normal;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th,
  td {
    border: 1px solid #000;
    padding: 2px 3px;
    font-size: 7px;
    font-weight: bold;
    vertical-align: middle;
  }

  th {
    text-align: center;
  }

  td {
    text-align: left;
  }

  .gray {
    background: #e0e0e0;
  }

  .center {
    text-align: center;
  }

  .right {
    text-align: right;
  }

  .top {
    vertical-align: top;
  }

  .flex-row {
    display: flex;
    gap: 8px;
    margin: 7px 0;
  }

  .flex-row > div {
    min-width: 0;
  }

  .w33 { width: 33.333%; }
  .w50 { width: 50%; }
  .w58 { width: 58%; }
  .w42 { width: 42%; }

  .value-cell {
    min-height: 18px;
  }

  .text-box {
    height: 56px;
    vertical-align: top;
    font-weight: normal;
    line-height: 1.35;
  }

  .detail-box {
    height: 48px;
    vertical-align: top;
    font-weight: normal;
    line-height: 1.35;
  }

  .signature-box {
    height: 44px;
    vertical-align: top;
    text-align: center;
    font-weight: normal;
  }

  .box {
    display: inline-flex;
    width: 12px;
    height: 12px;
    border: 1px solid #000;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: bold;
    line-height: 1;
  }

  .check-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-height: 17px;
    border-bottom: 1px solid #ddd;
    padding: 2px 0;
    font-weight: normal;
  }

  .check-line:last-child {
    border-bottom: none;
  }

  .check-panel {
    border: 1px solid #000;
    padding: 4px 5px;
    min-height: 98px;
  }

  .detail-panel {
    border: 1px solid #000;
    border-left: 0;
    padding: 4px 5px;
    min-height: 98px;
    font-weight: normal;
    line-height: 1.35;
  }

  .section-caption {
    border: 1px solid #000;
    background: #e0e0e0;
    text-align: center;
    font-weight: bold;
    padding: 3px;
  }

  .annex-box {
    border: 1px solid #000;
    height: 690px;
    padding: 8px;
    vertical-align: top;
    font-size: 8px;
    line-height: 1.45;
  }
</style>
</head>
<body>
  <div class="page">
    <h1>MITSUBISHI ELECTRIC DE MÉXICO, S. A. DE C. V.</h1>
    <h2>REPORTE DE AVERÍA EN MANTENIMIENTO [R.A.M.]</h2>

    <div class="flex-row">
      <div class="w33">
        <table>
          <tr>
            <th class="gray" style="width:35%">PARA:</th>
            <td>${escapeHtml(data.para || "CONTROL DE CALIDAD")}</td>
          </tr>
          <tr>
            <th class="gray">DE:</th>
            <td>${escapeHtml(data.de)}</td>
          </tr>
        </table>
      </div>

      <div class="w33">
        <table>
          <tr><th class="gray">FECHA DE EMISIÓN</th></tr>
          <tr><td class="center value-cell">${escapeHtml(data.fechaEmision)}</td></tr>
        </table>
      </div>

      <div class="w33">
        <table>
          <tr>
            <th class="gray">FOLIO DE RAM<br />[POR C.C.]</th>
            <td style="width:45%">${escapeHtml(data.folioRam)}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="flex-row">
      <div class="w58">
        <table>
          <tr>
            <th class="gray" style="width:28%">RAZÓN SOCIAL:</th>
            <td>${escapeHtml(data.razonSocial)}</td>
          </tr>
          <tr>
            <th class="gray">DIRECCIÓN:</th>
            <td>${escapeHtml(data.direccion)}</td>
          </tr>
          <tr>
            <th class="gray">TIPO DE CONTROL:</th>
            <td>${escapeHtml(data.tipoControl)}</td>
          </tr>
          <tr>
            <th class="gray">FECHA DE PRODUCCIÓN:</th>
            <td>${escapeHtml(data.fechaProduccion)}</td>
          </tr>
          <tr>
            <th class="gray">ESTADO DE CONTRATO:</th>
            <td>
              <span class="box">${checked(data.estadoContrato, "Postventa")}</span>
              POSTVENTA POR ${escapeHtml(data.postventaMeses)} MESES
              &nbsp;&nbsp;
              <span class="box">${checked(data.estadoContrato, "Contrato")}</span>
              CONTRATO POR ${escapeHtml(data.contratoAnios)} AÑOS
            </td>
          </tr>
        </table>
      </div>

      <div class="w42">
        <table>
          <tr>
            <th class="gray" style="width:58%">No ORDEN MX:</th>
            <td>${escapeHtml(data.noOrdenMx)}</td>
          </tr>
          <tr>
            <th class="gray">No ORDEN DE PLANTA:</th>
            <td>${escapeHtml(data.noOrdenPlanta)}</td>
          </tr>
          <tr>
            <th class="gray">NÚMERO DE EQUIPO:</th>
            <td>${escapeHtml(data.numeroEquipo)}</td>
          </tr>
          <tr>
            <td colspan="2" class="center">
              ELEVADOR <span class="box">${checked(data.tipoEquipo, "Elevador")}</span>
              &nbsp;&nbsp;&nbsp;
              ESCALERA <span class="box">${checked(data.tipoEquipo, "Escalera")}</span>
            </td>
          </tr>
          <tr>
            <th class="gray">MODELO:</th>
            <td>${escapeHtml(data.modelo)}</td>
          </tr>
          <tr>
            <th class="gray">FECHA DE ENTREGA AL CLIENTE:</th>
            <td>${escapeHtml(data.fechaEntregaCliente)}</td>
          </tr>
          <tr>
            <th class="gray">MESES DE GARANTÍA:</th>
            <td>${escapeHtml(data.mesesGarantia)}</td>
          </tr>
        </table>
      </div>
    </div>

    <table style="margin-top:7px">
      <tr><th class="gray">DESCRIPCIÓN DEL PROBLEMA:</th></tr>
      <tr><td class="text-box">${multiline(data.descripcionProblema)}</td></tr>
    </table>

    <table style="margin-top:7px">
      <tr><th class="gray">CAUSA DEL PROBLEMA:</th></tr>
      <tr><td class="text-box">${multiline(data.causaProblema)}</td></tr>
    </table>

    <div class="flex-row">
      <div class="w58">
        <table>
          <tr><th colspan="4" class="gray">REFACCIONES INVOLUCRADAS:</th></tr>
          <tr>
            <th class="gray">NOMBRE:</th>
            <th class="gray">No DE DIBUJO:</th>
            <th class="gray" style="width:16%">CANTIDAD:</th>
            <th class="gray" style="width:18%">COSTO:</th>
          </tr>
          ${renderRefacciones(data.refacciones)}
        </table>
      </div>

      <div class="w42">
        <table>
          <tr><th colspan="2" class="gray">ESTADO EN QUE QUEDA EL EQUIPO:</th></tr>
          <tr>
            <th>OPERANDO</th>
            <td class="center" style="width:24%"><span class="box">${checked(data.estadoEquipo, "Operando")}</span></td>
          </tr>
          <tr>
            <th>DETENIDO</th>
            <td class="center"><span class="box">${checked(data.estadoEquipo, "Detenido")}</span></td>
          </tr>
          <tr><th colspan="2" class="gray">DETALLES:</th></tr>
          <tr><td colspan="2" class="detail-box">${multiline(data.estadoEquipoDetalles)}</td></tr>
        </table>
      </div>
    </div>

    <div style="margin-top:7px">
      <div class="section-caption">MEDIDAS IMPLEMENTADAS:</div>
      <div style="display:flex">
        <div class="check-panel" style="width:55%">
          ${checkLine("1. SE HIZO UN ARREGLO PROVISIONAL", implementadas.arregloProvisional)}
          ${checkLine("2. PARTES TOMADAS DE OTRA ORDEN", implementadas.partesOtraOrden)}
          ${checkLine("3. ESPERANDO PARTES", implementadas.esperandoPartes)}
          ${checkLine("4. ESPERANDO OPINIÓN DE C.C.", implementadas.esperandoOpinionCC)}
          ${checkLine("5. VER HOJAS ANEXAS", implementadas.hojasAnexas)}
          ${checkLine("6. OTRAS", implementadas.otras)}
        </div>
        <div class="detail-panel" style="width:45%">${multiline(implementadas.detalle)}</div>
      </div>
    </div>

    <div style="margin-top:7px">
      <div class="section-caption">MEDIDAS REQUERIDAS POR CONTROL DE CALIDAD:</div>
      <div style="display:flex">
        <div class="check-panel" style="width:55%">
          ${checkLine("1. INVESTIGAR DIRECTAMENTE LAS CAUSAS DEL PROBLEMA", requeridas.investigarCausas)}
          ${checkLine("2. PROPORCIONAR INFORMACIÓN O ASESORÍA TÉCNICA", requeridas.asesoriaTecnica)}
          ${checkLine("3. INFORMAR OPINIÓN DE CONTROL DE CALIDAD", requeridas.opinionCC)}
          ${checkLine("4. ANÁLISIS PARA EFECTUAR CAMBIO POR GARANTÍA", requeridas.cambioGarantia)}
          ${checkLine("5. SOLICITAR PARTES A JAPÓN", requeridas.partesJapon)}
          ${checkLine("6. OTRAS", requeridas.otras)}
        </div>
        <div class="detail-panel" style="width:45%">${multiline(requeridas.detalle)}</div>
      </div>
    </div>

    <div style="margin-top:7px">
      <div class="section-caption">RESPUESTA POR PARTE DE CONTROL DE CALIDAD Y CONTRAMEDIDAS ESTABLECIDAS:</div>
      <div style="display:flex">
        <div class="check-panel" style="width:55%">
          ${checkLine("1. SE INVESTIGARÁN DIRECTAMENTE LAS CAUSAS DEL PROBLEMA", respuesta.investigarCausas)}
          ${checkLine("2. SE PROPORCIONARÁ ASESORÍA TÉCNICA", respuesta.asesoriaTecnica)}
          ${checkLine("3. SE ENVIARÁ REPORTE DE AVERÍA A JAPÓN", respuesta.reporteJapon)}
          ${checkLine("4. SE REALIZARÁ LA CONTRAMEDIDA POR CONTROL DE CALIDAD", respuesta.contramedidaCC)}
          ${checkLine("5. SE ANALIZARÁN LOS DATOS", respuesta.analizarDatos)}
          ${checkLine("6. OTRAS", respuesta.otras)}
        </div>
        <div class="detail-panel" style="width:45%">${multiline(respuesta.detalle)}</div>
      </div>
    </div>

    <table style="margin-top:7px">
      <tr>
        <th class="gray">REPORTADO POR:</th>
        <th class="gray">REVISÓ EN MANTENIMIENTO:<br />GERENCIA / SUBDIRECCIÓN / DIRECCIÓN</th>
        <th class="gray">REVISÓ EN CONTROL DE CALIDAD:<br />GERENCIA / SUBDIRECCIÓN / DIRECCIÓN</th>
      </tr>
      <tr>
        <td class="signature-box">${escapeHtml(data.reportadoPor)}</td>
        <td class="signature-box">${escapeHtml(data.revisoMantenimiento)}</td>
        <td class="signature-box">${escapeHtml(data.revisoControlCalidad)}</td>
      </tr>
      <tr>
        <th>FIRMA Y SELLO</th>
        <th>FIRMA Y SELLO</th>
        <th>FIRMA Y SELLO</th>
      </tr>
    </table>
  </div>

  <div class="page">
    <h1>MITSUBISHI ELECTRIC DE MÉXICO, S. A. DE C. V.</h1>
    <h2>REPORTE DE AVERÍA EN MANTENIMIENTO [R.A.M.]</h2>

    <div class="flex-row">
      <div class="w33">
        <table>
          <tr>
            <th class="gray" style="width:35%">PARA:</th>
            <td>${escapeHtml(data.para || "CONTROL DE CALIDAD")}</td>
          </tr>
          <tr>
            <th class="gray">DE:</th>
            <td>${escapeHtml(data.de)}</td>
          </tr>
        </table>
      </div>
      <div class="w33">
        <table>
          <tr><th class="gray">FECHA DE EMISIÓN</th></tr>
          <tr><td class="center value-cell">${escapeHtml(data.fechaEmision)}</td></tr>
        </table>
      </div>
      <div class="w33">
        <table>
          <tr>
            <th class="gray">FOLIO DE RAM<br />[POR C.C.]</th>
            <td style="width:45%">${escapeHtml(data.folioRam)}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="annex-box">${multiline(data.anexo)}</div>
  </div>
</body>
</html>
`;
}