export const MANTTO_FRENO_EM_EH_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Registro de Mantenimiento de Freno EM/EH y otros</title>
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

    .obsGrid {
      display: table;
      width: 100%;
      table-layout: fixed;
      margin-top: 6px;
      border-spacing: 5px 0;
    }

    .obsCell {
      display: table-cell;
      vertical-align: top;
      border: 1px solid #000;
      min-height: 70px;
    }

    .obsTitle {
      background: #E0E0E0;
      border-bottom: 1px solid #000;
      text-align: center;
      font-size: 8px;
      font-weight: 900;
      padding: 3px;
    }

    .obsBody {
      min-height: 56px;
      padding: 5px;
      font-size: 8px;
      font-weight: 800;
      white-space: pre-wrap;
    }

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

    .footerCode { margin-top: 8px; font-size: 8px; font-weight: 800; }
    .footerYear { text-align: right; font-size: 8px; font-weight: 800; }

    .photoTitle {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      border: none !important;
    }

    .photoBox {
      height: 135px;
      background: #fff;
      vertical-align: middle !important;
      text-align: center !important;
      color: #999;
      font-weight: 800;
    }

    .photoImg {
      max-width: 100%;
      max-height: 130px;
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
        <td>Registro de mantenimiento de freno <span class="small">(para los tipos EM, EH y otros)</span></td>
        <th>CONFIDENCIAL</th>
      </tr>
    </table>

    <table class="infoTable">
      <tr>
        <td><div class="label">Cliente</div><div class="value">{{CLIENTE}}</div></td>
        <td><div class="label">No. Equipo</div><div class="value">{{EQUIPO}}</div></td>
        <td><div class="label">Nombre del técnico</div><div class="value">{{TECNICO}}</div></td>
        <td><div class="label">Fecha</div><div class="value">{{FECHA}}</div></td>
      </tr>
      <tr>
        <td><div class="label">Control</div><div class="value">{{ORDERID}}</div></td>
        <td><div class="label">Tipo de MT</div><div class="value">{{TIPO_MT}}</div></td>
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
        <td colspan="7" class="left">
          {{CHK_OVERHAUL}} Revisión de freno (Overhaul)
          &nbsp;&nbsp;&nbsp;&nbsp;
          {{CHK_AJUSTE}} Ajuste, reparación y sustitución del freno
        </td>
      </tr>

      <tr class="sectionHeader">
        <th colspan="3">Elementos</th>
        <th colspan="4">Detalles de trabajo</th>
        <th>Revisión</th>
      </tr>

      <tr class="subHeader"><th colspan="3">1. Pines y levas de freno</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{PINES_ROWS}}

      <tr class="subHeader"><th colspan="3">2. Par de torsión [Torque]</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{TORQUE_ROWS}}

      <tr class="subHeader"><th colspan="3">3. Resorte de freno</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{RESORTE_ROWS}}

      <tr class="subHeader"><th colspan="3">4. Condiciones del émbolo</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{EMBOLO_ROWS}}

      <tr class="subHeader"><th colspan="3">5. Contacto de freno</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{CONTACTO_ROWS}}

      <tr class="subHeader"><th colspan="3">6. Brazo, palanca y perno</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{BRAZO_ROWS}}

      <tr class="subHeader"><th colspan="3">7. Condiciones de tambor</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{TAMBOR_ROWS}}

      <tr class="subHeader"><th colspan="3">8. Revestimiento / Balatas</th><th>Valor</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{BALATAS_ROWS}}

      <tr class="subHeader"><th colspan="4">9. Operación del freno</th><th>Antes</th><th>Después</th><th>Revisado</th><th>Revisión SMA</th></tr>
      {{OPERACION_ROWS}}
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
          {{RESULTADO_SEGUIMIENTO}} Necesidad de seguimiento<br/><br/>
          <strong>Detalle:</strong><br/>
          {{RESULTADO_DETALLE}}
        </div>
      </div>
    </div>

    <table class="signTable">
      <tr>
        <td>Personal de mantenimiento que elaboró<br/>Firma y fecha</td>
        <td>Aprobación del supervisor de mantenimiento<br/>Firma y fecha</td>
        <td>Aprobación del gerente de mantenimiento<br/>Firma y fecha</td>
      </tr>
    </table>

    <div class="footerCode">TEP-GMA-FRT-012.1</div>
    <div class="footerYear">Año de actualización: 2021</div>
  </div>

  <div class="page">
    <table class="headerTable">
      <tr>
        <td class="photoTitle">Hoja de fotos del mantenimiento de freno</td>
        <th>CONFIDENCIAL</th>
      </tr>
    </table>

    <table class="infoTable">
      <tr>
        <td><div class="label">Cliente</div><div class="value">{{CLIENTE}}</div></td>
        <td><div class="label">No. Equipo</div><div class="value">{{EQUIPO}}</div></td>
        <td><div class="label">Nombre del técnico</div><div class="value">{{TECNICO}}</div></td>
        <td><div class="label">Fecha</div><div class="value">{{FECHA}}</div></td>
      </tr>
      <tr>
        <td><div class="label">Control</div><div class="value">{{ORDERID}}</div></td>
        <td><div class="label">Tipo de MT</div><div class="value">{{TIPO_MT}}</div></td>
        <td><div class="label">Velocidad nominal</div><div class="value">{{VELOCIDAD_NOMINAL}} [m/min]</div></td>
        <td><div class="label">Capacidad</div><div class="value">{{CAPACIDAD}} [kg]</div></td>
      </tr>
    </table>

    <table>
      <tr><th colspan="2">Émbolo del freno</th><th colspan="2">Revestimiento del freno</th></tr>
      <tr><th>Antes</th><th>Después</th><th>Lado izquierdo</th><th>Lado derecho</th></tr>
      <tr>
        <td class="photoBox">{{FOTO_EMBOLO_ANTES}}</td>
        <td class="photoBox">{{FOTO_EMBOLO_DESPUES}}</td>
        <td class="photoBox">{{FOTO_REV_IZQ}}</td>
        <td class="photoBox">{{FOTO_REV_DER}}</td>
      </tr>

      <tr><th colspan="2">Brazo, palanca y pernos del freno (lado izquierdo)</th><th colspan="2">Brazo, palanca y pernos del freno (lado derecho)</th></tr>
      <tr><th>Antes</th><th>Después</th><th>Antes</th><th>Después</th></tr>
      <tr>
        <td class="photoBox">{{FOTO_BRAZO_IZQ_ANTES}}</td>
        <td class="photoBox">{{FOTO_BRAZO_IZQ_DESPUES}}</td>
        <td class="photoBox">{{FOTO_BRAZO_DER_ANTES}}</td>
        <td class="photoBox">{{FOTO_BRAZO_DER_DESPUES}}</td>
      </tr>

      <tr><th colspan="2">Otro: {{OTRO_1_TITULO}}</th><th colspan="2">Otro: {{OTRO_2_TITULO}}</th></tr>
      <tr><th>Antes</th><th>Después</th><th>Antes</th><th>Después</th></tr>
      <tr>
        <td class="photoBox">{{FOTO_OTRO_1_ANTES}}</td>
        <td class="photoBox">{{FOTO_OTRO_1_DESPUES}}</td>
        <td class="photoBox">{{FOTO_OTRO_2_ANTES}}</td>
        <td class="photoBox">{{FOTO_OTRO_2_DESPUES}}</td>
      </tr>
    </table>

    <div class="footerCode">TEP-GMA-FRT-012.1</div>
  </div>
</body>
</html>`;