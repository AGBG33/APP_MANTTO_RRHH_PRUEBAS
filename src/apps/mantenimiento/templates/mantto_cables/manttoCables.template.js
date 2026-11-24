// src/services/templates/mantto_cables/manttoCables.template.js

export const MANTTO_CABLES_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Registro de Mantenimiento de Cables</title>

  <style>
    * { box-sizing: border-box; }

    @page {
      size: letter;
      margin: 10mm;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: 9px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 100%;
      page-break-after: always;
    }

    .header {
      border: 1px solid #111;
      padding: 8px;
      margin-bottom: 8px;
    }

    .title {
      font-size: 16px;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .conf {
      text-align: center;
      font-size: 8px;
      font-weight: 900;
      color: #555;
    }

    .grid {
      width: 100%;
      border-collapse: separate;
      border-spacing: 4px;
      margin-bottom: 6px;
    }

    .grid td {
      border: 1px solid #111;
      border-radius: 4px;
      padding: 5px;
      vertical-align: top;
    }

    .label {
      font-size: 7px;
      font-weight: 900;
      color: #555;
      text-transform: uppercase;
      margin-bottom: 2px;
    }

    .value {
      font-size: 10px;
      font-weight: 800;
      color: #111;
      word-break: break-word;
    }

    .sectionTitle {
      background: #111827;
      color: #fff;
      font-weight: 900;
      font-size: 10px;
      padding: 5px 7px;
      border-radius: 4px;
      margin: 8px 0 4px;
      text-transform: uppercase;
    }

    table.data {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }

    table.data th,
    table.data td {
      border: 1px solid #111;
      padding: 4px;
      font-size: 8px;
      vertical-align: middle;
      text-align: center;
    }

    table.data th {
      background: #e5e7eb;
      font-weight: 900;
    }

    .left { text-align: left !important; }

    .note {
      border: 1px solid #111;
      border-radius: 4px;
      padding: 6px;
      font-size: 8px;
      line-height: 1.35;
      margin-bottom: 6px;
    }

    .resultBox {
      border: 1px solid #111;
      border-radius: 4px;
      padding: 7px;
      margin-top: 6px;
    }

    .resultLine {
      font-size: 9px;
      font-weight: 900;
      margin-bottom: 3px;
    }

    .signatureGrid {
      width: 100%;
      border-collapse: separate;
      border-spacing: 6px;
      margin-top: 8px;
    }

    .signatureGrid td {
      border: 1px solid #111;
      height: 58px;
      vertical-align: bottom;
      text-align: center;
      font-size: 7px;
      font-weight: 900;
      padding: 5px;
    }

    .referenceBox {
      border: 1px solid #111;
      min-height: 75px;
      padding: 8px;
      margin-bottom: 10px;
    }

    .referenceTitle {
      background: #e5e7eb;
      padding: 5px;
      font-weight: 900;
      font-size: 10px;
      margin-bottom: 6px;
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="header">
      <div class="title">Reporte de Mantenimiento de Cables</div>
      <div class="conf">CONFIDENCIAL</div>
    </div>

    <table class="grid">
      <tr>
        <td>
          <div class="label">Orden / Control</div>
          <div class="value">{{ORDERID}}</div>
        </td>
        <td>
          <div class="label">Cliente</div>
          <div class="value">{{CLIENTE}}</div>
        </td>
        <td>
          <div class="label">Equipo</div>
          <div class="value">{{EQUIPO}}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="label">Nombre del técnico</div>
          <div class="value">{{TECNICO}}</div>
        </td>
        <td>
          <div class="label">Fecha</div>
          <div class="value">{{FECHA}}</div>
        </td>
        <td>
          <div class="label">Horario</div>
          <div class="value">{{HORARIO}}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="label">Tiempo de uso de cables</div>
          <div class="value">{{TIEMPO_USO_CABLES}}</div>
        </td>
        <td>
          <div class="label">Diámetro estándar</div>
          <div class="value">{{DIAMETRO_ESTANDAR}}</div>
        </td>
        <td>
          <div class="label">Cantidad de cables</div>
          <div class="value">{{CANTIDAD_CABLES}}</div>
        </td>
      </tr>
    </table>

    <table class="data">
      <tr>
        <th style="width: 24%;">Reporte</th>
        <td class="left">{{CHK_OVERHAUL}} Revisión de freno / Overhaul</td>
        <td class="left">{{CHK_AJUSTE}} Ajuste, reparación y sustitución de cables</td>
      </tr>
    </table>

    <div class="sectionTitle">1. Diámetro del cable / desgaste</div>
    <div class="note">
      Compare entre partes con desgaste e intactas. En caso de valores críticos, avisar al supervisor.
      Fórmula: % desgaste = Parte desgaste / Parte intacta * 100.
    </div>

    <table class="data">
      <thead>
        <tr>
          <th>Cable No.</th>
          <th>Ø mm</th>
          <th>Parte desgaste</th>
          <th>Parte intacta</th>
          <th>% desgaste</th>
          <th>Peor cable</th>
        </tr>
      </thead>
      <tbody>
        {{DIAMETROS_ROWS}}
      </tbody>
    </table>

    <div class="sectionTitle">2. Ruptura de alambres</div>
    <table class="data">
      <thead>
        <tr>
          <th>Cable No.</th>
          <th>¿Hay?</th>
          <th>Rupturas por paso</th>
          <th>Posición cabina</th>
          <th>Cambio / OK</th>
        </tr>
      </thead>
      <tbody>
        {{RUPTURAS_ROWS}}
      </tbody>
    </table>

    <div class="sectionTitle">3. Longitud de desgaste</div>
    <table class="data">
      <tr>
        <th>¿Se encontró?</th>
        <th>Cable No.</th>
        <th>Posición cabina</th>
        <th>Longitud desgaste</th>
      </tr>
      <tr>
        <td>{{LONGITUD_ENCONTRADO}}</td>
        <td>{{LONGITUD_CABLE}}</td>
        <td>{{LONGITUD_POSICION}}</td>
        <td>{{LONGITUD_MM}}</td>
      </tr>
    </table>

    <div class="sectionTitle">4. Óxido</div>
    <table class="data">
      <tr>
        <th>¿Se encontró?</th>
        <th>Alcance</th>
        <th>Cable No.</th>
        <th>Posición cabina</th>
      </tr>
      <tr>
        <td>{{OXIDO_ENCONTRADO}}</td>
        <td>{{OXIDO_ALCANCE}}</td>
        <td>{{OXIDO_CABLE}}</td>
        <td>{{OXIDO_POSICION}}</td>
      </tr>
    </table>

    <div class="sectionTitle">5. Tensión de cables</div>
    <table class="data">
      <tr>
        <th>Resultado</th>
      </tr>
      <tr>
        <td class="left">{{TENSION_ESTADO}}</td>
      </tr>
    </table>

    <div class="sectionTitle">6. Dobleces o deformaciones</div>
    <table class="data">
      <tr>
        <th>¿Se encontró?</th>
        <th>Cable No.</th>
        <th>Posición cabina</th>
        <th>Problema</th>
      </tr>
      <tr>
        <td>{{DEF_ENCONTRADO}}</td>
        <td>{{DEF_CABLE}}</td>
        <td>{{DEF_POSICION}}</td>
        <td>{{DEF_PROBLEMA}}</td>
      </tr>
    </table>

    <div class="sectionTitle">7. Terminales de los cables</div>
    <table class="data">
      <tr>
        <th>Resultado</th>
      </tr>
      <tr>
        <td class="left">{{TERMINALES_ESTADO}}</td>
      </tr>
    </table>

    <div class="resultBox">
      <div class="resultLine">Resultado total del trabajo</div>
      <div>{{RESULTADO_TOTAL}}</div>
      <div style="margin-top: 5px;"><strong>Tipos de problema:</strong> {{TIPOS_PROBLEMA}}</div>
      <div style="margin-top: 5px;"><strong>Detalle:</strong> {{DETALLE_RESULTADO}}</div>
    </div>

    <table class="signatureGrid">
      <tr>
        <td>PERSONAL DE MANTENIMIENTO QUE ELABORÓ<br/>FIRMA Y FECHA</td>
        <td>APROBACIÓN DEL SUPERVISOR DE MANTTO<br/>FIRMA Y FECHA</td>
        <td>APROBACIÓN DEL GERENTE DE MANTTO<br/>FIRMA Y FECHA</td>
        <td>APROBACIÓN DEL GERENTE DE COTIZACIONES<br/>FIRMA Y FECHA</td>
      </tr>
    </table>
  </div>

  <div class="page">
    <div class="header">
      <div class="title">Referencias de Revisión</div>
      <div class="conf">Mantenimiento de cables</div>
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">1. Diámetro del cable</div>
      Método de medida y posición a medir.
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">2. Ruptura de alambres</div>
      Tipos de ruptura de alambres.
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">3. Longitud de desgaste</div>
      Posición a medir.
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">4. Óxido</div>
      Cerca de tracción máquina / polvo de óxido. Superficie roja o marrón entre los surcos.
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">5. Tensión</div>
      Posición a medir.
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">6. Dobleces o deformaciones</div>
      Tipos de dobleces o deformaciones.
    </div>

    <div class="referenceBox">
      <div class="referenceTitle">7. Terminales de los cables</div>
      Posición a checar y tipos de problemas de terminales.
    </div>
  </div>
</body>
</html>`;