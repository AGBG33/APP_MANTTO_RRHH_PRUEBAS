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

function renderRefacciones(rows = []) {
  const arr = Array.isArray(rows) ? rows : [];
  const total = Math.max(4, arr.length);

  return Array.from({ length: total })
    .map((_, i) => {
      const r = arr[i] || {};
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.codigo)}</td>
          <td>${escapeHtml(r.nombre)}</td>
          <td>${escapeHtml(r.horasHombre)}</td>
          <td>${escapeHtml(r.costoManoObra)}</td>
          <td>${escapeHtml(r.costoMateriales)}</td>
          <td>${escapeHtml(r.costoTransporte)}</td>
          <td>${escapeHtml(r.costoTotal)}</td>
        </tr>
      `;
    })
    .join("");
}

export function buildAutorizacionGastosHtml(data = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>FORMATO DE AUTORIZACIÓN DE GASTOS</title>
<style>
  @page {
    size: letter landscape;
    margin: 18px;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 8px;
    background: #fff;
  }

  .page {
    width: 750px;
    min-height: 560px;
    margin: 0 auto;
    padding: 12px;
    page-break-after: always;
  }

  .page:last-child {
    page-break-after: auto;
  }

  .company {
    font-size: 13px;
    font-weight: bold;
  }

  .address {
    font-size: 8px;
    margin-bottom: 10px;
  }

  .title {
    text-align: center;
    font-size: 15px;
    font-weight: bold;
    margin: 10px 0 12px;
    text-transform: uppercase;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th, td {
    border: 1px solid #000;
    padding: 3px;
    text-align: center;
    vertical-align: middle;
    font-size: 8px;
  }

  .gray {
    background: #e0e0e0;
    font-weight: bold;
  }

  .section-title {
    background: #e0e0e0;
    font-weight: bold;
    text-align: center;
  }

  .text-box {
    min-height: 72px;
    text-align: justify;
    line-height: 1.35;
    padding: 6px;
  }

  .text-box.big {
    min-height: 95px;
  }

  .sign-space {
    height: 44px;
  }

  .footer-code {
    font-size: 9px;
    font-weight: bold;
    margin-top: 8px;
  }
</style>
</head>

<body>
  <div class="page">
    <div class="company">MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.</div>
    <div class="address">
      Mariano Escobedo 69. Col. Zona Industrial, Tlalnepantla Edo. México, C.P. 54030
    </div>

    <div class="title">
      FORMATO DE AUTORIZACIÓN DE GASTOS POR ERROR HUMANO, CASO FORTUITO O VICIO OCULTO
    </div>

    <table>
      <tr>
        <td class="gray">MX:</td>
        <td>${escapeHtml(data.mx)}</td>
        <td class="gray">DIRECCIÓN:</td>
        <td>${escapeHtml(data.direccion)}</td>
        <td class="gray" rowspan="2">FECHA DE EMISIÓN:</td>
        <td rowspan="2">${escapeHtml(data.fechaEmision)}</td>
      </tr>
      <tr>
        <td class="gray">No EQUIPO:</td>
        <td>${escapeHtml(data.noEquipo)}</td>
        <td class="gray">RAZÓN SOCIAL:</td>
        <td>${escapeHtml(data.razonSocial)}</td>
      </tr>
      <tr>
        <td class="gray">TIPO DE CONTROL:</td>
        <td>${escapeHtml(data.tipoControl)}</td>
        <td class="gray">FECHA DE ENTREGA DEL EQUIPO:</td>
        <td>${escapeHtml(data.fechaEntregaEquipo)}</td>
        <td class="gray">FECHA DE ACONTECIMIENTOS:</td>
        <td>${escapeHtml(data.fechaAcontecimientos)}</td>
      </tr>
    </table>

    <table style="margin-top:8px;">
      <tr>
        <th class="section-title">DESCRIPCIÓN DEL PROBLEMA</th>
      </tr>
      <tr>
        <td class="text-box big">${multiline(data.descripcionProblema)}</td>
      </tr>
    </table>

    <table style="margin-top:8px;">
      <tr>
        <th class="section-title">ACCIÓN INMEDIATA</th>
      </tr>
      <tr>
        <td class="text-box">${multiline(data.accionInmediata)}</td>
      </tr>
    </table>

    <table style="margin-top:8px;">
      <tr class="gray">
        <th style="width:7%;">No REF:</th>
        <th style="width:18%;">CÓDIGO DE REFACCIÓN:</th>
        <th style="width:25%;">NOMBRE DE REFACCIÓN:</th>
        <th>HORAS HOMBRE NECESARIAS:</th>
        <th>COSTO DE MANO DE OBRA:</th>
        <th>COSTO DE MATERIALES:</th>
        <th>COSTO DE TRANSPORTE:</th>
        <th>COSTO TOTAL DE REPARACIÓN:</th>
      </tr>
      ${renderRefacciones(data.refacciones)}
    </table>

    <table style="margin-top:8px;">
      <tr>
        <th class="section-title">RESULTADO FINAL Y CONTRAMEDIDA PREVENTIVA / CORRECTIVA</th>
      </tr>
      <tr>
        <td class="text-box big">${multiline(data.resultadoFinal)}</td>
      </tr>
    </table>
  </div>

  <div class="page">
    <div class="company">MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.</div>
    <div class="address">
      Mariano Escobedo 69. Col. Zona Industrial, Tlalnepantla Edo. México, C.P. 54030
    </div>

    <table style="margin-top:35px;">
      <tr>
        <td class="sign-space"></td>
        <td class="sign-space"></td>
        <td class="sign-space"></td>
        <td class="sign-space"></td>
      </tr>
      <tr class="gray">
        <td>EMITIÓ:<br />${escapeHtml(data.emitio)}</td>
        <td>VISTO BUENO DE DIRECTOR / SUBDIRECTOR / GERENTE DE MANTENIMIENTO<br />${escapeHtml(data.voboMantenimiento)}</td>
        <td>VISTO BUENO DE DIRECTOR DE FINANZAS<br />${escapeHtml(data.voboFinanzas)}</td>
        <td>ENTERADO DIRECTOR GENERAL<br />${escapeHtml(data.enteradoDirector)}</td>
      </tr>
    </table>

    <div class="footer-code">TLA-GMA-FRT-016.0</div>
  </div>
</body>
</html>
`;
}