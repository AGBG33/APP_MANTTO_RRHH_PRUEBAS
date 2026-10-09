// src/services/noMantenimientoPdfTemplate.js

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Export principal (named export)
 * La vista usa EXACTAMENTE este nombre:
 * buildCartaNoMantenimientoHtml
 */
export function buildCartaNoMantenimientoHtml({
  orderId,
  causaCode,
  razonSocial,
  direccion,
  equipo,
  fechaProgramada,
  mx,
  mesAfecto,
  mecanico,
  descripcionConcreta,
  firmaSupervisorBase64Png, // base64 puro (sin data:)
}) {
  const firmaImgHtml = firmaSupervisorBase64Png
    ? `<img src="data:image/png;base64,${firmaSupervisorBase64Png}" style="width:250px;height:70px;object-fit:contain;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>CARTA DE NO MANTENIMIENTO</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        box-sizing: border-box;
        padding: 60px;
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
        width: 612px;
        height: 792px;
        margin: 0 auto 40px auto;
        border: 1px solid #999;
      }
      .header-row { display: flex; justify-content: left; margin-bottom: 2px; }
      .header-company { font-weight: bold; text-transform: uppercase; font-size: 12px; }
      .header-address { font-weight: normal; text-transform: none; font-size: 9px; }
      h2 { text-align: center; margin: 50px 0 10px; font-size: 18px; text-transform: uppercase; }
      .maintenance-info { display: flex; justify-content: left; margin: 0 auto 5px auto; text-align: left; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px auto; border: 2px solid #000; }
      th, td { border: 1px solid #000; padding: 1px; text-align: center; font-size: 7px; font-weight: bold; }
      .description-table { padding: 2px; margin-top: 5px; font-size: 12px; width: 100%; box-sizing: border-box; }
      .firm-table { padding: 2px; margin-top: 5px; font-size: 12px; width: 100%; box-sizing: border-box; display: flex; gap: 20px; }
      .fill { font-weight: normal; font-size: 9px; text-align: left; padding: 6px !important; }
      .fillCenter { font-weight: normal; font-size: 9px; text-align: center; padding: 6px !important; }
      .descCell { height: 120px; font-weight: normal; font-size: 10px; text-align: left; padding: 10px !important; vertical-align: top; }
      .sigCell { height: 70px; font-weight: normal; text-align: center; padding: 6px !important; vertical-align: middle; }
    </style>
  </head>
  <body>
    <div class="header-row">
      <strong class="header-company">MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.</strong>
    </div>
    <div class="header-address">
      Mariano Escobedo 69. Col. Zona Industrial, Tlalnepantla Edo. Mexico, C.P. 54030
    </div>

    <h2>CARTA DE NO MANTENIMIENTO</h2>

    <div class="maintenance-info">
      <table>
        <tbody>
          <tr>
            <td style="background-color: #e0e0e0">MX:</td>
            <td class="fillCenter" style="width: 65%">${escapeHtml(mx)}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td style="background-color: #e0e0e0">EQUIPO No:</td>
            <td class="fillCenter" style="width: 40%">${escapeHtml(equipo)}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <th style="background-color: #e0e0e0">
              FECHA <br />PROGRAMADA:<br />
            </th>
            <td class="fillCenter" style="width: 60%">${escapeHtml(fechaProgramada)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="maintenance-info">
      <table>
        <tr>
          <td style="background-color: #e0e0e0; padding: 5px">RAZÓN SOCIAL:</td>
          <td class="fill" style="width: 80%">${escapeHtml(razonSocial)}</td>
        </tr>
      </table>
    </div>

    <div class="maintenance-info">
      <table>
        <tr>
          <td style="background-color: #e0e0e0; padding: 5px">DIRECCIÓN:</td>
          <td class="fill" style="width: 80%">${escapeHtml(direccion)}</td>
        </tr>
      </table>
    </div>

    <div class="maintenance-info">
      <table>
        <tr>
          <td style="background-color: #e0e0e0; padding: 2px">
            CAUSA /S: <br />(CLAVE)<br />
          </td>
          <td class="fillCenter" style="width: 80%">${escapeHtml(causaCode)}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td style="background-color: #e0e0e0; padding: 2px">
            AFECTÓ AL MANTENIMIENTO <br />CORRESPONDIENTE AL DEL MES DE:<br />
          </td>
          <td class="fillCenter" style="width: 35%">${escapeHtml(mesAfecto)}</td>
        </tr>
      </table>
    </div>

    <div class="maintenance-info">
      <table>
        <tr>
          <td style="background-color: #e0e0e0; padding: 2px">
            MECÁNICO A CARGO: <br />[NÓMINA - NOMBRE]<br />
          </td>
          <td class="fill" style="width: 80%">${escapeHtml(mecanico)}</td>
        </tr>
      </table>
    </div>

    <div class="description-table">
      <table>
        <thead>
          <tr style="background-color: #e0e0e0">
            <th>DESCRIPCIÓN CONCRETA DE LA CAUSA:</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="descCell">${escapeHtml(descripcionConcreta)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="firm-table">
      <table>
        <tr style="background-color: #e0e0e0"><th>EMITIÓ:</th></tr>
        <tr><td class="sigCell">${firmaImgHtml}</td></tr>
      </table>

      <table>
        <tr style="background-color: #e0e0e0"><th>VISTO BUENO:</th></tr>
        <tr><td class="sigCell"></td></tr>
      </table>
    </div>
    <div class="firm-table">
      <table><tr><th>SUPERVISOR DE MANTENIMIENTO</th></tr></table>
      <table><tr><th>GERENTE/JEFE DE MANTENIMIENTO</th></tr></table>
    </div>
    <div style="margin-top:10px;font-size:9px;color:#444;">
      Orden: ${escapeHtml(orderId)} &nbsp; | &nbsp; Equipo: ${escapeHtml(equipo)}
    </div>
  </body>
</html>`;
}

/**
 * default export (compatibilidad)
 */
export default buildCartaNoMantenimientoHtml;
