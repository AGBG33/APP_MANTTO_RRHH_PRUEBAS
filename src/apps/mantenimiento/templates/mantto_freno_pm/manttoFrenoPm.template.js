// src/services/templates/mantto_freno_pm/manttoFrenoPm.template.js

export const MANTTO_FRENO_PM_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Registro de Mantenimiento de Freno PM</title>

  <style>
    * { box-sizing: border-box; }

    @page { size: letter; margin: 9mm; }

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

    .page { width: 100%; page-break-after: always; }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    td, th {
      border: 1px solid #000;
      padding: 3px;
      vertical-align: middle;
      word-break: break-word;
      overflow-wrap: break-word;
      font-size: 7px;
      font-weight: 800;
      text-align: center;
    }

    .headerTable td {
      border: none;
      font-size: 12px;
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

    .infoTable { margin-top: 8px; margin-bottom: 5px; }

    .infoTable td {
      height: 24px;
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

    .reportRow th,
    .sectionHeader th {
      background: #999;
      color: #000;
      font-weight: 900;
      text-align: center;
      font-size: 8px;
    }

    .subHeader th {
      background: #E0E0E0;
      font-weight: 900;
      font-size: 7px;
      text-align: center;
    }

    .left { text-align: left !important; }
    .muted { color: #555; }
    .small { font-size: 6px; }

    .signTable {
      border-collapse: separate;
      border-spacing: 6px 0;
      margin-top: 8px;
    }

    .signTable td {
      border: 1px solid #000;
      height: 42px;
      font-size: 7px;
      font-weight: 900;
      text-align: center;
      vertical-align: bottom;
      padding: 4px;
    }

    .photoTitle {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      border: none !important;
    }

    .photoBox {
      height: 300px;
      background: #fff;
      vertical-align: middle !important;
      text-align: center !important;
      color: #999;
      font-weight: 800;
    }

    .photoImg {
      max-width: 100%;
      max-height: 292px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>

<body>
  <div class="page">
    <table class="headerTable">
      <tr>
        <td>Registro de mantenimiento de freno <span class="small">(para máquinas tipo PM)</span></td>
        <th>CONFIDENCIAL</th>
      </tr>
    </table>

    <table class="infoTable">
      <tr>
        <td><div class="label">MX / Cliente</div><div class="value">{{CLIENTE}}</div></td>
        <td><div class="label">No. Equipo</div><div class="value">{{EQUIPO}}</div></td>
        <td><div class="label">Nombre del técnico</div><div class="value">{{TECNICO}}</div></td>
        <td><div class="label">Fecha</div><div class="value">{{FECHA}}</div></td>
      </tr>
      <tr>
        <td><div class="label">Control</div><div class="value">{{ORDERID}}</div></td>
        <td><div class="label">Tipo de máquina</div><div class="value">PM-{{TIPO_MAQUINA}}</div></td>
        <td><div class="label">Velocidad nominal</div><div class="value">{{VELOCIDAD_NOMINAL}} [m/min]</div></td>
        <td><div class="label">Capacidad</div><div class="value">{{CAPACIDAD}} [kg]</div></td>
      </tr>
      <tr>
        <td colspan="4"><div class="label">Horario</div><div class="value">{{HORARIO}}</div></td>
      </tr>
    </table>

    <table>
      <tr class="reportRow">
        <th style="width:16%;">Reporte</th>
        <td colspan="10" class="left">
          {{CHK_REVISION}} Revisión de freno
          &nbsp;&nbsp;&nbsp;&nbsp;
          {{CHK_OVERHAUL}} Ajuste, reparación y sustitución del freno (Overhaul)
        </td>
      </tr>

      <tr class="sectionHeader">
        <th colspan="3">Elementos</th>
        <th colspan="7">Detalles de trabajo</th>
        <th>Revisión</th>
      </tr>

      <tr class="subHeader"><th colspan="3">1. Torque estático</th><th>Valor</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{TORQUE_ESTATICO_ROWS}}

      <tr class="subHeader"><th colspan="3">2. Torque dinámico</th><th>Valor</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{TORQUE_DINAMICO_ROWS}}

      <tr class="subHeader"><th colspan="3">3. Tornillo de ajuste del torque</th><th>Tornillo</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{TORNILLO_ROWS}}

      <tr class="subHeader"><th colspan="3">4. Recorrido de bobina</th><th>Bobina</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{BOBINA_ROWS}}

      <tr class="subHeader"><th colspan="3">5. Recorrido del micro switch de freno</th><th>Valor</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{MICRO_RECORRIDO_ROWS}}

      <tr class="subHeader"><th colspan="3">6. Revisar funcionamiento de micro switch</th><th>Valor</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{MICRO_FUNCION_ROWS}}

      <tr class="subHeader"><th colspan="3">7. Condiciones de tambor</th><th>Valor</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{TAMBOR_ROWS}}

      <tr class="subHeader"><th colspan="3">8. Tubo de plástico para drenado</th><th>Lado</th><th colspan="2">Antes</th><th colspan="2">Después</th><th>Revisado</th><th>Ajuste</th><th>Revisión SMA</th></tr>
      {{TUBO_ROWS}}

      <tr class="subHeader"><th colspan="3">9. Condición de operación del freno</th><th colspan="3">Revisión</th><th colspan="2">Condición</th><th>Revisado</th><th colspan="2">Revisión SMA</th></tr>
      {{OPERACION_ROWS}}

      <tr class="subHeader">
        <th>10</th>
        <td colspan="10" class="left">Resultado de la revisión</td>
      </tr>
      <tr><td colspan="11" class="left">{{RESULTADO_BIEN}} Bien / La condición es buena</td></tr>
      <tr><td colspan="11" class="left">{{RESULTADO_SEGUIMIENTO}} Necesidad de seguimiento / solicitar cotización</td></tr>
      <tr><td colspan="11" class="left" style="height: 42px; vertical-align: top;"><strong>Detalle:</strong><br/>{{RESULTADO_DETALLE}}</td></tr>
    </table>

    <table class="signTable">
      <tr>
        <td>Mecánico<br/>Firma y fecha</td>
        <td>Aprobación del supervisor de mantenimiento<br/>Firma y fecha</td>
        <td>Aprobación del gerente de mantenimiento<br/>Firma y fecha</td>
      </tr>
    </table>
  </div>

  <div class="page">
    <table class="headerTable">
      <tr>
        <td class="photoTitle">Registro de mantenimiento de freno <span class="small">(para máquinas tipo PM)</span></td>
        <th>CONFIDENCIAL</th>
      </tr>
    </table>

    <table class="infoTable">
      <tr>
        <td><div class="label">MX / Cliente</div><div class="value">{{CLIENTE}}</div></td>
        <td><div class="label">No. Equipo</div><div class="value">{{EQUIPO}}</div></td>
        <td><div class="label">Nombre del técnico</div><div class="value">{{TECNICO}}</div></td>
        <td><div class="label">Fecha</div><div class="value">{{FECHA}}</div></td>
      </tr>
      <tr>
        <td><div class="label">Control</div><div class="value">{{ORDERID}}</div></td>
        <td><div class="label">Tipo de máquina</div><div class="value">PM-{{TIPO_MAQUINA}}</div></td>
        <td><div class="label">Velocidad nominal</div><div class="value">{{VELOCIDAD_NOMINAL}} [m/min]</div></td>
        <td><div class="label">Capacidad</div><div class="value">{{CAPACIDAD}} [kg]</div></td>
      </tr>
    </table>

    <table>
      <tr><th colspan="2">Vista completa del freno</th></tr>
      <tr><th>Lado izquierdo</th><th>Lado derecho</th></tr>
      <tr>
        <td class="photoBox">{{FOTO_LADO_IZQUIERDO}}</td>
        <td class="photoBox">{{FOTO_LADO_DERECHO}}</td>
      </tr>
      <tr><th>Otro: {{OTRO_1_TITULO}}</th><th>Otro: {{OTRO_2_TITULO}}</th></tr>
      <tr>
        <td class="photoBox">{{FOTO_OTRO_1}}</td>
        <td class="photoBox">{{FOTO_OTRO_2}}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;