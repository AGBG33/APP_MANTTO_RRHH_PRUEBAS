const safe = (v) => String(v ?? "").trim();

function escapeHtml(value) {
  return safe(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitDateDMY(value = "") {
  const [dd = "", mm = "", yyyy = ""] = safe(value).split("/");
  return { dd, mm, yyyy };
}

function multiline(value) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export function buildReportePendientesHtml(data = {}) {
  const fechaReporte = splitDateDMY(data.fechaReporte);
  const fechaEnteradoSMA = splitDateDMY(data.fechaEnteradoSMA);
  const fechaSolucion = splitDateDMY(data.fechaSolucion);
  const fechaEnteradoMec = splitDateDMY(data.fechaEnteradoMec);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>REPORTE DE PENDIENTES</title>
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
    font-size: 10px;
    background: #fff;
  }

  .page {
    width: 750px;
    min-height: 560px;
    margin: 0 auto;
    padding: 20px 24px;
    border: 1px solid #999;
    position: relative;
  }

  .title {
    text-align: right;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 8px;
  }

  .company {
    text-align: center;
    font-weight: bold;
    margin-bottom: 12px;
  }

  .topGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 18px;
    margin-bottom: 8px;
  }

  .row {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    margin-bottom: 6px;
    min-height: 16px;
  }

  .label {
    font-weight: bold;
    white-space: nowrap;
  }

  .line {
    flex: 1;
    min-height: 14px;
    border-bottom: 1px solid #000;
    padding: 0 4px 1px 4px;
  }

  .dateLine {
    width: 42px;
    display: inline-block;
    border-bottom: 1px solid #000;
    min-height: 14px;
    text-align: center;
    padding-bottom: 1px;
  }

  .box {
    border: 2px solid #000;
    padding: 10px;
    margin-top: 10px;
  }

  .boxGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
    align-items: start;
  }

  .sectionTitle {
    font-size: 12px;
    font-weight: bold;
    margin-top: 8px;
    margin-bottom: 5px;
  }

  .textBox {
    border: 1px solid #000;
    min-height: 120px;
    padding: 8px;
    line-height: 1.45;
  }

  .textBox.large {
    min-height: 140px;
  }

  .smallNote {
    font-size: 8px;
    font-weight: normal;
  }

  .footerCode {
    position: absolute;
    left: 8px;
    bottom: 20px;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 8px;
  }

  .anexo {
    position: absolute;
    left: 65px;
    bottom: 10px;
    font-size: 10px;
  }
</style>
</head>

<body>
  <div class="page">
    <div class="footerCode">TEP-GMA-FRT-013</div>

    <div class="title">REPORTE DE PENDIENTES</div>

    <div class="company">
      MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.
    </div>

    <div class="topGrid">
      <div>
        <div class="row">
          <span class="label">MX:</span>
          <span class="line">${escapeHtml(data.mx)}</span>
        </div>

        <div class="row">
          <span class="label">RAZÓN SOCIAL:</span>
          <span class="line">${escapeHtml(data.razonSocial)}</span>
        </div>

        <div class="row">
          <span class="label">DIRECCIÓN:</span>
          <span class="line">${escapeHtml(data.direccion)}</span>
        </div>
      </div>

      <div>
        <div class="row">
          <span class="label">No. FOLIO MANTTO. PREVENTIVO:</span>
          <span class="line">${escapeHtml(data.folioPreventivo)}</span>
        </div>

        <div class="row">
          <span class="label">No. DE EQUIPO:</span>
          <span class="line">${escapeHtml(data.numeroEquipo)}</span>
        </div>

        <div class="row">
          <span class="label">TIPO DE EQUIPO:</span>
          <span class="line">${escapeHtml(data.tipoEquipo)}</span>
        </div>

        <div class="row">
          <span class="label">TELÉFONO:</span>
          <span class="line">${escapeHtml(data.telefono)}</span>
        </div>
      </div>
    </div>

    <div class="box">
      <div class="boxGrid">
        <div>
          <div class="row">
            <span class="label">FECHA DE REPORTE [Día / Mes / Año]:</span>
            <span class="dateLine">${escapeHtml(fechaReporte.dd)}</span> /
            <span class="dateLine">${escapeHtml(fechaReporte.mm)}</span> /
            <span class="dateLine">${escapeHtml(fechaReporte.yyyy)}</span>
          </div>

          <div class="row">
            <span class="label">MECÁNICO QUE REPORTA:</span>
            <span class="line">${escapeHtml(data.mecanicoReporta)}</span>
          </div>
        </div>

        <div>
          <div class="row">
            <span class="label">FECHA DE ENTERADO SMA:</span>
            <span class="dateLine">${escapeHtml(fechaEnteradoSMA.dd)}</span> /
            <span class="dateLine">${escapeHtml(fechaEnteradoSMA.mm)}</span> /
            <span class="dateLine">${escapeHtml(fechaEnteradoSMA.yyyy)}</span>
          </div>

          <div class="row">
            <span class="label">FIRMA Y SELLO SMA:</span>
            <span class="line">${escapeHtml(data.firmaSelloSMA)}</span>
          </div>
        </div>
      </div>

      <div class="sectionTitle">DESCRIPCIÓN DEL PROBLEMA / PENDIENTE:</div>
      <div class="textBox">${multiline(data.descripcionProblema)}</div>
    </div>

    <div class="box">
      <div class="boxGrid">
        <div>
          <div class="row">
            <span class="label">SEGUIMIENTO DEL SUPERVISOR:</span>
            <span class="line">${escapeHtml(data.seguimientoSupervisor)}</span>
          </div>

          <div class="row">
            <span class="label">FECHA DE SOLUCIÓN:</span>
            <span class="dateLine">${escapeHtml(fechaSolucion.dd)}</span> /
            <span class="dateLine">${escapeHtml(fechaSolucion.mm)}</span> /
            <span class="dateLine">${escapeHtml(fechaSolucion.yyyy)}</span>
          </div>

          <div class="row">
            <span class="label">AUXILIAR:</span>
            <span class="line">${escapeHtml(data.auxiliar)}</span>
          </div>
        </div>

        <div>
          <div class="row">
            <span class="label">
              FECHA DE ENTERADO MEC:<br />
              <span class="smallNote">(Una vez solucionado)</span>
            </span>
            <span class="dateLine">${escapeHtml(fechaEnteradoMec.dd)}</span> /
            <span class="dateLine">${escapeHtml(fechaEnteradoMec.mm)}</span> /
            <span class="dateLine">${escapeHtml(fechaEnteradoMec.yyyy)}</span>
          </div>

          <div class="row">
            <span class="label">FIRMA MEC:</span>
            <span class="line">${escapeHtml(data.firmaMec)}</span>
          </div>
        </div>
      </div>

      <div class="sectionTitle">PROCEDIMIENTO:</div>
      <div class="textBox">${multiline(data.procedimiento)}</div>

      <div class="sectionTitle">SOLUCIÓN DEL PROBLEMA / FECHA DE SOLUCIÓN:</div>
      <div class="textBox large">${multiline(data.solucionProblema)}</div>
    </div>

    <div class="anexo">
      [ Anexado a la carpeta de Pendientes con FOLIO: ${escapeHtml(data.folioPreventivo)} ]
    </div>
  </div>
</body>
</html>
`;
}