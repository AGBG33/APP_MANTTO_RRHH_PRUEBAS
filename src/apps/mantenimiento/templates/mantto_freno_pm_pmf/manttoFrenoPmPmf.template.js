// src/services/templates/mantto_freno_pm_pmf/manttoFrenoPmPmf.template.js

export const MANTTO_FRENO_PM_PMF_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Registro de Mantenimiento de Freno PM/PMF</title>

  <style>
    * { box-sizing: border-box; }

    @page {
      size: letter;
      margin: 10mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      color: #111;
      background: #fff;
      font-size: 8px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 100%;
      page-break-after: always;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    td, th {
      border: 1px solid #000;
      padding: 4px;
      vertical-align: middle;
      word-break: break-word;
      overflow-wrap: break-word;
      font-size: 8px;
      font-weight: 800;
      text-align: center;
    }

    .headerTable td {
      border: none;
      font-size: 13px;
      font-weight: 900;
      text-align: left;
      text-transform: uppercase;
    }

    .headerTable th {
      width: 110px;
      font-size: 9px;
      font-weight: 900;
      text-align: center;
    }

    .infoTable {
      margin-top: 8px;
      margin-bottom: 6px;
    }

    .infoTable td {
      height: 26px;
      text-align: left;
    }

    .label {
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      color: #333;
      margin-bottom: 2px;
    }

    .value {
      font-size: 9px;
      font-weight: 900;
      color: #000;
    }

    .reportRow th {
      background: #e0e0e0;
      font-size: 8px;
      font-weight: 900;
    }

    .sectionHeader th {
      background: #e0e0e0;
      font-size: 8px;
      font-weight: 900;
    }

    .num {
      width: 34px;
      background: #e0e0e0;
      font-weight: 900;
    }

    .left {
      text-align: left !important;
    }

    .center {
      text-align: center !important;
    }

    .obsGrid {
      display: table;
      width: 100%;
      table-layout: fixed;
      margin-top: 8px;
      border-spacing: 8px 0;
    }

    .obsCell {
      display: table-cell;
      vertical-align: top;
      border: 1px solid #000;
      min-height: 170px;
    }

    .obsTitle {
      background: #e0e0e0;
      border-bottom: 1px solid #000;
      text-align: center;
      font-size: 8px;
      font-weight: 900;
      padding: 4px;
      text-transform: uppercase;
    }

    .obsBody {
      min-height: 160px;
      padding: 6px;
      font-size: 8px;
      font-weight: 800;
      white-space: pre-wrap;
      text-align: left;
    }

    .signTable {
      border-collapse: separate;
      border-spacing: 8px 0;
      margin-top: 10px;
    }

    .signTable td {
      border: 1px solid #000;
      height: 44px;
      font-size: 7px;
      font-weight: 900;
      text-align: center;
      vertical-align: bottom;
      padding: 4px;
    }

    .footer {
      display: table;
      width: 100%;
      margin-top: 8px;
      font-size: 8px;
      font-weight: 800;
    }

    .footer div {
      display: table-cell;
      width: 50%;
    }

    .footer .right {
      text-align: right;
    }
  </style>
</head>

<body>
  <div class="page">
    <table class="headerTable">
      <tr>
        <td>Registro de mantenimiento de freno <span style="font-size: 10px;">(para tipo PM/PMF)</span></td>
        <th>CONFIDENCIAL</th>
      </tr>
    </table>

    <table class="infoTable">
      <tr>
        <td>
          <div class="label">Cliente</div>
          <div class="value">{{CLIENTE}}</div>
        </td>
        <td>
          <div class="label">No. Equipo</div>
          <div class="value">{{EQUIPO}}</div>
        </td>
        <td>
          <div class="label">Nombre del técnico / Nómina</div>
          <div class="value">{{TECNICO}}</div>
        </td>
        <td>
          <div class="label">Fecha</div>
          <div class="value">{{FECHA}}</div>
        </td>
      </tr>

      <tr>
        <td>
          <div class="label">Control</div>
          <div class="value">{{ORDERID}}</div>
        </td>
        <td>
          <div class="label">Tipo de MT</div>
          <div class="value">{{TIPO_MT}}</div>
        </td>
        <td>
          <div class="label">Velocidad nominal</div>
          <div class="value">{{VELOCIDAD_NOMINAL}} [m/min]</div>
        </td>
        <td>
          <div class="label">Capacidad</div>
          <div class="value">{{CAPACIDAD}} [kg]</div>
        </td>
      </tr>

      <tr class="reportRow">
        <th>Reporte</th>
        <td colspan="3" class="left">{{CHK_INSPECCION}} Inspección visual de freno</td>
      </tr>

      <tr>
        <td colspan="4">
          <div class="label">Horario</div>
          <div class="value">{{HORARIO}}</div>
        </td>
      </tr>
    </table>

    <table style="width: 86%; margin: 8px auto;">
      <tr class="sectionHeader">
        <th colspan="2">• Condición de operación de freno</th>
        <th>Posición</th>
        <th>Revisión</th>
      </tr>

      <tr>
        <th class="num">1.-</th>
        <td class="left">Revisión de tornillo de ajuste de torque</td>
        <td>—</td>
        <td>{{TORNILLO_AJUSTE}}</td>
      </tr>

      <tr>
        <th class="num">2.-</th>
        <td class="left">Ruido a la apertura y cierre</td>
        <td>—</td>
        <td>{{RUIDO_APERTURA_CIERRE}}</td>
      </tr>

      <tr>
        <th class="num" rowspan="2">3.-</th>
        <td class="left" rowspan="2">Aceite o grasa en balatas</td>
        <td>Izquierdo</td>
        <td>{{BALATAS_IZQ}}</td>
      </tr>
      <tr>
        <td>Derecho</td>
        <td>{{BALATAS_DER}}</td>
      </tr>

      <tr class="sectionHeader">
        <th class="num">1.-<br/>2.-</th>
        <th>• Condiciones de tambor</th>
        <th></th>
        <th>Revisión</th>
      </tr>

      <tr>
        <th class="num">1.-</th>
        <td class="left">Hay existencia de aceite o grasa</td>
        <td>—</td>
        <td>{{TAMBOR_ACEITE_GRASA}}</td>
      </tr>

      <tr>
        <th class="num">2.-</th>
        <td class="left">Óxido</td>
        <td>—</td>
        <td>{{TAMBOR_OXIDO}}</td>
      </tr>

      <tr class="sectionHeader">
        <th class="num">1.-<br/>2.-</th>
        <th>• Tubos de drenado</th>
        <th></th>
        <th>Revisión</th>
      </tr>

      <tr>
        <th class="num">1.-</th>
        <td class="left">Tubo transparente</td>
        <td>—</td>
        <td>{{TUBO_TRANSPARENTE}}</td>
      </tr>

      <tr>
        <th class="num">2.-</th>
        <td class="left">Tubo negro</td>
        <td>—</td>
        <td>{{TUBO_NEGRO}}</td>
      </tr>

      <tr class="sectionHeader">
        <th class="num">1.-<br/>2.-</th>
        <th>• Micro switch</th>
        <th></th>
        <th>Revisión</th>
      </tr>

      <tr>
        <th class="num" rowspan="2">1.-</th>
        <td class="left" rowspan="2">Condición física</td>
        <td>Izquierdo</td>
        <td rowspan="2">{{MICRO_CONDICION_FISICA}}</td>
      </tr>
      <tr>
        <td>Derecho</td>
      </tr>

      <tr>
        <th class="num" rowspan="2">2.-</th>
        <td class="left" rowspan="2">Conexiones</td>
        <td>Izquierdo</td>
        <td rowspan="2">{{MICRO_CONEXIONES}}</td>
      </tr>
      <tr>
        <td>Derecho</td>
      </tr>

      <tr class="sectionHeader">
        <th class="num">1.-</th>
        <th colspan="2">Condiciones de operación del freno</th>
        <th>Revisión</th>
      </tr>

      <tr>
        <th class="num">1.-</th>
        <td colspan="2" class="left">Prueba de funcionamiento</td>
        <td>{{PRUEBA_FUNCIONAMIENTO}}</td>
      </tr>
    </table>

    <div class="obsGrid">
      <div class="obsCell">
        <div class="obsTitle">Observaciones</div>
        <div class="obsBody">{{OBSERVACIONES}}</div>
      </div>

      <div class="obsCell">
        <div class="obsTitle">Resultado total del trabajo</div>
        <div class="obsBody">
          {{RESULTADO_BIEN}} Bien / La condición es buena<br/>
          {{RESULTADO_SEGUIMIENTO}} Necesidad de seguimiento (ver detalle)<br/><br/>
          <strong>Detalle:</strong><br/>
          {{RESULTADO_DETALLE}}
        </div>
      </div>
    </div>

    <table class="signTable">
      <tr>
        <td>Personal de mantenimiento que elaboró<br/>Firma y fecha</td>
        <td>Aprobación del supervisor de mantenimiento<br/>Firma y fecha</td>
      </tr>
    </table>

    <div class="footer">
      <div>TLA-GMA-FRT-022</div>
      <div class="right">Año de actualización: 2024</div>
    </div>
  </div>
</body>
</html>`;