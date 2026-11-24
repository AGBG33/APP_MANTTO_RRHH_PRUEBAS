export const HTML_ELEVADORES = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte de Mantenimiento - Elevadores</title>
  <style>
    * { box-sizing: border-box; }

    @page {
      size: letter;
      margin: 12mm 10mm 16mm 10mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      color: #111;
      font-size: 10px;
      line-height: 1.2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      background: #fff;
    }

    .pagina {
      width: 100%;
      padding-bottom: 8mm;
    }

    .header {
      width: 100%;
      display: table;
      table-layout: fixed;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .headerLogo,
    .headerDivider,
    .headerText {
      display: table-cell;
      vertical-align: middle;
    }

    .headerLogo {
      width: 86px;
    }

    .headerLogo img {
      width: 78px;
      height: auto;
      display: block;
      object-fit: contain;
    }

    .headerDivider {
      width: 8px;
      border-left: 1.5px solid #000;
    }

    .headerText {
      padding-left: 8px;
    }

    .empresa {
      font-size: 8px;
      font-weight: 700;
      line-height: 1.1;
    }

    .titulo {
      font-size: 14px;
      font-weight: 900;
      margin-top: 2px;
      line-height: 1.05;
    }

    .subtitulo {
      font-size: 9px;
      color: #444;
      font-weight: 700;
      margin-top: 1px;
      letter-spacing: 0.2px;
    }

    .divider {
      height: 1px;
      background: #000;
      margin: 4px 0 6px 0;
    }

    .coberturaBar {
      border: 1px solid #000;
      border-radius: 5px;
      padding: 4px 8px;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 6px;
      text-align: center;
      background: #F7F7F7;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .table2,
    .table3 {
      width: 100%;
      border-collapse: separate;
      border-spacing: 4px 4px;
      margin: 0 -4px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .table2 td {
      width: 50%;
      vertical-align: top;
    }

    .table3 td {
      width: 33.3333%;
      vertical-align: top;
    }

    .field {
      border: 1px solid #000;
      border-radius: 5px;
      padding: 5px 6px;
      min-height: 34px;
      width: 100%;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .field.tight {
      min-height: 30px;
    }

    .label {
      font-size: 8px;
      font-weight: 900;
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.1px;
    }

    .value {
      font-size: 10px;
      font-weight: 700;
      color: #111;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .muted {
      color: #555;
      font-weight: 700;
    }

    .sectionTitle {
      font-size: 10px;
      font-weight: 900;
      margin: 7px 0 4px 0;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      page-break-after: avoid;
      break-after: avoid;
    }

    .box {
      border: 1px solid #000;
      border-radius: 5px;
      padding: 6px;
      background: #fff;
      page-break-inside: auto;
      break-inside: auto;
    }

    .operationsBox {
      border: 0;
      border-radius: 0;
      padding: 0;
      overflow: visible;
    }

    .opsWrap {
      display: block;
      width: 100%;
    }

    .opsEmpty {
      color: #63718B;
      font-weight: 800;
      font-size: 9px;
    }

    .ubicCard {
      border: 0;
      border-radius: 0;
      padding: 0;
      margin-bottom: 7px;
      background: #fff;
      page-break-inside: auto;
      break-inside: auto;
    }

    .ubicCard:last-child {
      margin-bottom: 0;
    }

    .ubicTitle {
      font-size: 9px;
      font-weight: 900;
      margin-bottom: 0;
      padding: 5px 6px;
      text-transform: uppercase;
      color: #111;
      background: #F5F7FA;
      border: 1px solid #D0D0D0;
      border-radius: 5px 5px 0 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    .ubicGrid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .opRow {
      page-break-inside: avoid;
      break-inside: avoid-page;
    }

    .opCell {
      width: 50%;
      vertical-align: top;
      padding: 5px 6px;
      border: 1px solid #D0D0D0;
    }

    .opCellEmpty {
      background: #FAFAFA;
    }

    .opsCol {
      display: block;
      width: 100%;
    }

    .opItem {
      width: 100%;
      display: table;
      table-layout: fixed;
      margin: 0;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: auto;
    }

    .opItem:last-child {
      margin-bottom: 0;
    }

    .cbWrap,
    .opBody {
      display: table-cell;
      vertical-align: top;
    }

    .cbWrap {
      width: 16px;
    }

    .cb {
      font-size: 11px;
      line-height: 1;
      display: inline-block;
      margin-top: 1px;
    }

    .opBody {
      padding-left: 2px;
    }

    .opCode {
      font-size: 9px;
      font-weight: 900;
      color: #111;
      line-height: 1.1;
    }

    .opDesc {
      font-size: 8px;
      color: #222;
      margin-top: 1px;
      line-height: 1.15;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .opDescEmpty {
      color: #777;
      font-style: italic;
    }

    .opStk {
      font-size: 8px;
      color: #333;
      margin-top: 1px;
      line-height: 1.1;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .commentBlock {
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
      min-height: 18px;
      line-height: 1.3;
    }

    .commentSpacer {
      height: 5px;
    }

    .consumiblesBox {
      overflow: visible;
      page-break-inside: auto;
      break-inside: auto;
    }

    .consumiblesBox table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 8px;
    }

    .consumiblesBox th,
    .consumiblesBox td {
      border: 1px solid #DDE6F2;
      padding: 4px 4px;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .consumiblesBox th {
      background: #F5F7FA;
      text-align: center;
      font-weight: 900;
    }

    thead {
      display: table-header-group;
    }

    tfoot {
      display: table-footer-group;
    }

    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .firmaWrap {
      width: 100%;
      display: table;
      table-layout: fixed;
      border-spacing: 0;
      margin-top: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .firmaCol {
      display: table-cell;
      vertical-align: top;
      width: 50%;
    }

    .firmaCol.left {
      padding-right: 4px;
    }

    .firmaCol.right {
      padding-left: 4px;
    }

    .firmaBox {
      border: 1px solid #000;
      border-radius: 5px;
      padding: 6px;
      min-height: 72px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .firmaLabel {
      font-size: 8px;
      font-weight: 900;
      margin-bottom: 5px;
      text-transform: uppercase;
    }

    .firmaImg {
      width: 100%;
      height: 34px;
      object-fit: contain;
      border-top: 1px dashed #999;
      padding-top: 4px;
      display: block;
    }

    .firmaEmpty {
      font-size: 9px;
      color: #666;
      border-top: 1px dashed #999;
      padding-top: 5px;
    }

    .firmaDataLine {
      font-size: 8px;
      margin-bottom: 3px;
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.15;
    }

    .firmaDataLine strong {
      font-weight: 900;
    }

    .footerNote {
      margin-top: 5px;
      font-size: 7px;
      color: #777;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="pagina">
    <div class="header">
      <div class="headerLogo">
        <img src="{{LOGO_DATA_URI}}" alt="Logo Mitsubishi" />
      </div>
      <div class="headerDivider"></div>
      <div class="headerText">
        <div class="empresa">MITSUBISHI ELECTRIC DE MÉXICO, S.A. DE C.V.</div>
        <div class="titulo">REPORTE DE MANTENIMIENTO</div>
        <div class="subtitulo">ELEVADORES</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="coberturaBar">Cobertura: {{COBERTURA_TIPO}}</div>

    <table class="table2">
      <tr>
        <td>
          <div class="field">
            <div class="label">Orden</div>
            <div class="value">{{ORDERID}}</div>
          </div>
        </td>
        <td>
          <div class="field">
            <div class="label">Equipo</div>
            <div class="value">{{EQUIPMENT}}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="field">
            <div class="label">Cliente / Empresa</div>
            <div class="value">{{CLIENTE}}</div>
          </div>
        </td>
        <td>
          <div class="field">
            <div class="label">Nombre del técnico</div>
            <div class="value">{{TECNICO}}</div>
          </div>
        </td>
      </tr>
    </table>

    <table class="table3">
      <tr>
        <td>
          <div class="field tight">
            <div class="label">Fecha</div>
            <div class="value">{{FECHA}}</div>
          </div>
        </td>
        <td>
          <div class="field tight">
            <div class="label">Hora inicio</div>
            <div class="value">{{HORA_INICIO}}</div>
          </div>
        </td>
        <td>
          <div class="field tight">
            <div class="label">Hora fin</div>
            <div class="value">{{HORA_FIN}}</div>
          </div>
        </td>
      </tr>
    </table>

    <div class="field tight" style="margin-top: 4px;">
      <div class="label">Tiempo total</div>
      <div class="value">{{TIEMPO_TOTAL}}</div>
    </div>

    <div class="sectionTitle">Operaciones realizadas</div>
    <div class="box operationsBox">
      {{OPERACIONES_HTML}}
    </div>

    <div class="sectionTitle">Comentarios</div>
    <div class="box">
      <div class="label">Comentario del cliente</div>
      <div class="value muted commentBlock">{{AVISO_CLIENTE}}</div>

      <div class="commentSpacer"></div>

      <div class="label">Actividades / descripción del técnico</div>
      <div class="value muted commentBlock">{{NOTA_TECNICO}}</div>
    </div>

    <div class="sectionTitle">Consumibles</div>
    <div class="box consumiblesBox">
      {{CONSUMIBLES_HTML}}
    </div>

    <div class="firmaWrap">
      <div class="firmaCol left">
        <div class="firmaBox">
          <div class="firmaLabel">Firma del cliente</div>
          {{FIRMA_CLIENTE_HTML}}
        </div>
      </div>

      <div class="firmaCol right">
        <div class="firmaBox">
          <div class="firmaLabel">Datos de conformidad</div>
          <div class="firmaDataLine"><strong>Nombre:</strong> {{CLIENTE_NOMBRE}}</div>
          <div class="firmaDataLine"><strong>Cargo:</strong> {{CLIENTE_CARGO}}</div>
          <div class="firmaDataLine"><strong>Correo:</strong> {{CLIENTE_EMAIL}}</div>
        </div>
      </div>
    </div>

  </div>
</body>
</html>`;