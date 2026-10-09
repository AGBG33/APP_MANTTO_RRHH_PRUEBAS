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

function checked(value) {
  return value ? "X" : "";
}

function checkedValue(value, expected) {
  return safe(value).toLowerCase() === safe(expected).toLowerCase() ? "X" : "";
}

function renderPartes(items = [], minRows = 10) {
  const rows = Array.isArray(items) ? items : [];
  const total = Math.max(minRows, rows.length);

  return Array.from({ length: total })
    .map((_, index) => {
      const r = rows[index] || {};
      return `
        <tr>
          <td class="center rowNum">${index + 1}</td>
          <td colspan="2">${escapeHtml(r.concepto)}</td>
          <td colspan="2">${escapeHtml(r.numeroPartePlano)}</td>
          <td class="center">${escapeHtml(r.cantidad)}</td>
          <td class="center">${escapeHtml(r.horas)}</td>
          <td class="center">${escapeHtml(r.personas)}</td>
          <td class="center">${escapeHtml(r.dias)}</td>
          <td colspan="2">${escapeHtml(r.comentarios)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderFotos(fotos = []) {
  const list = Array.isArray(fotos)
    ? fotos.filter((f) => safe(f?.uri || f?.dataUri))
    : [];

  if (!list.length) {
    return `<div class="photoEmpty">ESPACIO PARA FOTOGRAFÍAS</div>`;
  }

  return `
    <div class="photoGrid">
      ${list
        .map((f, index) => {
          const src = safe(f?.dataUri || f?.uri);
          return `
            <div class="photoCard">
              <div class="photoTitle">${escapeHtml(f?.titulo || `Fotografía ${index + 1}`)}</div>
              <img src="${src}" alt="Fotografía ${index + 1}" />
              ${safe(f?.descripcion) ? `<div class="photoDesc">${multiline(f.descripcion)}</div>` : ""}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

export function buildSolicitudCotizacionHtml(data = {}) {
  const ubicacion = data.ubicacion || {};
  const software = data.software || {};
  const kaba = data.kaba || {};

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>SOLICITUD DE COTIZACIÓN</title>
<style>
  @page { size: letter; margin: 16px; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    font-size: 8px;
  }
  .page {
    width: 580px;
    margin: 0 auto;
    padding: 12px;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td {
    border: 1px solid #000;
    padding: 2px 3px;
    font-size: 7.4px;
    vertical-align: middle;
  }
  th { font-weight: bold; text-align: center; }
  td { text-align: left; }
  .headerTable td, .headerTable th { border: none; }
  .headerSmall { font-size: 6px; width: 22%; }
  .headerTitle { text-align: center; font-size: 8px; line-height: 1.35; }
  .section { background: #9c9c9c; font-weight: bold; text-align: center; }
  .label { background: #e0e0e0; font-weight: bold; text-align: center; }
  .center { text-align: center; }
  .rowNum { width: 16px; }
  .tall { height: 42px; vertical-align: top; }
  .analysis { height: 48px; vertical-align: top; }
  .softwareBox { min-height: 44px; vertical-align: top; }
  .signSpace { height: 45px; }
  .note { font-size: 6px; line-height: 1.35; margin-top: 10px; }
  .footerCode { font-size: 6px; margin-top: 8px; }
  .photoInstructions {
    background: #9c9c9c;
    border: 1px solid #000;
    font-weight: bold;
    text-align: center;
    padding: 5px;
    line-height: 1.35;
  }
  .photoEmpty {
    border: 1px solid #000;
    min-height: 600px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #777;
    font-size: 11px;
  }
  .photoGrid {
    border: 1px solid #000;
    min-height: 600px;
    padding: 8px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-content: start;
  }
  .photoCard {
    border: 1px solid #777;
    padding: 4px;
    break-inside: avoid;
  }
  .photoTitle { font-size: 8px; font-weight: bold; margin-bottom: 4px; }
  .photoCard img { width: 100%; max-height: 235px; object-fit: contain; display: block; }
  .photoDesc { font-size: 7px; margin-top: 4px; line-height: 1.3; }
</style>
</head>
<body>
  <div class="page">
    <table class="headerTable">
      <tr>
        <td class="headerSmall">HOJA No. 1</td>
        <th class="headerTitle">
          MITSUBISHI ELECTRIC DE MÉXICO, S.A DE C.V<br />
          <br />SOLICITUD DE COTIZACIÓN
        </th>
        <td class="headerSmall" style="text-align:right;">ANEXO 8</td>
      </tr>
    </table>

    <table style="margin:8px auto; width:42%;">
      <tr><th class="label">FECHA</th><th>${escapeHtml(data.fecha)}</th></tr>
    </table>

    <table>
      <tr><th colspan="11" class="section">DATOS DEL CLIENTE</th></tr>
      <tr>
        <th colspan="2" class="label">RAZÓN SOCIAL</th>
        <td colspan="4">${escapeHtml(data.razonSocial)}</td>
        <th class="label">MX</th>
        <td>${escapeHtml(data.mx)}</td>
        <th class="label">CM</th>
        <td colspan="2">${escapeHtml(data.cm)}</td>
      </tr>
      <tr><th colspan="2" class="label">DIRECCIÓN</th><td colspan="9">${escapeHtml(data.direccion)}</td></tr>
      <tr>
        <th colspan="2" class="label">SOLICITANTE</th><td colspan="4">${escapeHtml(data.solicitante)}</td>
        <th colspan="2" class="label">PUESTO</th><td colspan="3">${escapeHtml(data.puesto)}</td>
      </tr>
      <tr>
        <th colspan="2" class="label">EMAIL</th><td colspan="4">${escapeHtml(data.email)}</td>
        <th colspan="2" class="label">TELÉFONO</th><td colspan="3">${escapeHtml(data.telefono)}</td>
      </tr>
      <tr>
        <th colspan="2" class="label">CONTRATO</th>
        <th class="label">VIGENTE</th><td class="center">${checkedValue(data.contrato, "Vigente")}</td>
        <th class="label">POST VENTA</th><td class="center">${checkedValue(data.contrato, "Post venta")}</td>
        <th colspan="2" class="label">RECUPERACIÓN</th><td class="center">${checkedValue(data.contrato, "Recuperación")}</td>
        <th class="label">COBERTURA</th><td>${escapeHtml(data.cobertura)}</td>
      </tr>

      <tr><th colspan="11" class="section">DATOS DEL EQUIPO</th></tr>
      <tr>
        <th colspan="2" class="label">TIPO DE EQUIPO</th><td colspan="2">${escapeHtml(data.tipoEquipo)}</td>
        <th colspan="2" class="label">MÁQUINA</th><td colspan="2">${escapeHtml(data.maquina)}</td>
        <th class="label">CONTROL</th><td colspan="2">${escapeHtml(data.control)}</td>
      </tr>
      <tr>
        <th colspan="2" class="label">CAPACIDAD</th><td colspan="2">${escapeHtml(data.capacidad)}</td>
        <th colspan="2" class="label">VELOCIDAD</th><td colspan="2">${escapeHtml(data.velocidad)}</td>
        <th class="label">VOLTAJE</th><td colspan="2">${escapeHtml(data.voltaje)}</td>
      </tr>
      <tr>
        <th colspan="2" class="label">PISOS DE SERVICIO</th><td colspan="2">${escapeHtml(data.pisosServicio)}</td>
        <th colspan="2" class="label">MODELO</th><td colspan="2">${escapeHtml(data.modelo)}</td>
        <th class="label">No. DE EQUIPO</th><td colspan="2">${escapeHtml(data.numeroEquipo)}</td>
      </tr>
      <tr>
        <th colspan="2" class="label">UBICACIÓN</th>
        <th class="label">CUARTO DE MÁQUINAS</th><td class="center">${checked(ubicacion.cuartoMaquinas)}</td>
        <th class="label">CUBO</th><td class="center">${checked(ubicacion.cubo)}</td>
        <th class="label">CABINA</th><td class="center">${checked(ubicacion.cabina)}</td>
        <th class="label">FOSA</th><td colspan="2" class="center">${checked(ubicacion.fosa)}</td>
      </tr>

      <tr><th colspan="11" class="section">DATOS DEL REPORTE / ESPECIFICACIONES DE FALLA</th></tr>
      <tr>
        <th colspan="2" rowspan="2" class="label">OBSERVACIONES</th>
        <td rowspan="2" colspan="7" class="tall">${multiline(data.observaciones)}</td>
        <th colspan="2" class="label">FUNCIONANDO</th>
      </tr>
      <tr><th class="center">SÍ<br/>${checkedValue(data.funcionando, "Sí")}</th><th class="center">NO<br/>${checkedValue(data.funcionando, "No")}</th></tr>

      <tr><th colspan="11" class="section">PARTES ELECTRÓNICAS Y/O ELÉCTRICAS</th></tr>
      <tr>
        <th rowspan="2" colspan="3" class="label">CONCEPTO</th>
        <th rowspan="2" colspan="2" class="label">No. DE PARTE-PLANO</th>
        <th rowspan="2" class="label">CANTIDAD</th>
        <th colspan="3" class="label">MANO DE OBRA CONSIDERADA</th>
        <th rowspan="2" colspan="2" class="label">COMENTARIOS</th>
      </tr>
      <tr><th class="label">HORAS</th><th class="label">PERSONAS</th><th class="label">DÍAS</th></tr>
      ${renderPartes(data.partesElectricas, 10)}
      <tr><th colspan="3" class="label">CÓMO DETERMINÓ CAMBIO DE PARTES<br />(ANÁLISIS DE FALLA)</th><td colspan="8" class="analysis">${multiline(data.analisisCambioPartes)}</td></tr>

      <tr><th colspan="11" class="section">PARTES MECÁNICAS Y/O REPARACIÓN MAYOR</th></tr>
      <tr>
        <th rowspan="2" colspan="3" class="label">CONCEPTO</th>
        <th rowspan="2" colspan="2" class="label">No. DE PARTE-PLANO</th>
        <th rowspan="2" class="label">CANTIDAD</th>
        <th colspan="3" class="label">MANO DE OBRA CONSIDERADA</th>
        <th rowspan="2" colspan="2" class="label">COMENTARIOS</th>
      </tr>
      <tr><th class="label">HORAS</th><th class="label">PERSONAS</th><th class="label">DÍAS</th></tr>
      ${renderPartes(data.partesMecanicas, 10)}

      <tr><th colspan="11" class="section">MODIFICACIÓN DE SOFTWARE</th></tr>
      <tr>
        <th rowspan="2" colspan="2" class="label">CAMBIOS QUE SE REQUIEREN</th>
        <th rowspan="2" colspan="2" class="label">CONCEPTO</th>
        <th colspan="3" class="label">MANO DE OBRA CONSIDERADA</th>
        <th colspan="2" class="label">ACTUAL</th>
        <th colspan="2" class="label">REQUERIDO</th>
      </tr>
      <tr><th class="label">HORAS</th><th class="label">PERSONAS</th><th class="label">DÍAS</th><td colspan="2">${multiline(software.actual)}</td><td colspan="2">${multiline(software.requerido)}</td></tr>
      <tr>
        <td colspan="2" class="softwareBox">${multiline(software.cambiosRequeridos)}</td>
        <td colspan="2" class="softwareBox">${multiline(software.concepto)}</td>
        <td class="center">${escapeHtml(software.horas)}</td>
        <td class="center">${escapeHtml(software.personas)}</td>
        <td class="center">${escapeHtml(software.dias)}</td>
        <td colspan="4"></td>
      </tr>
      <tr>
        <th colspan="5" class="label">¿DEPARTAMENTO DE MANTENIMIENTO CUENTA CON LA PC PARA REALIZARLO?</th>
        <th class="center">SÍ<br/>${checkedValue(software.cuentaPc, "Sí")}</th>
        <th class="center">NO<br/>${checkedValue(software.cuentaPc, "No")}</th>
        <td colspan="4"></td>
      </tr>

      <tr><th colspan="11" class="section">CHAPAS TIPO KABA</th></tr>
      <tr><th colspan="4" class="label">NUEVA INSTALACIÓN</th><th colspan="4" class="label">CAMBIO FÍSICO</th><th colspan="3" class="label">LLAVES KABA</th></tr>
      <tr>
        <td class="center">${checked(kaba.enCabina)}</td><th>EN CABINA</th><th>CANTIDAD</th><td>${escapeHtml(kaba.nuevaCantidad)}</td>
        <th colspan="2">NUEVA COMBINACIÓN</th><td colspan="2">${escapeHtml(kaba.nuevaCombinacion)}</td>
        <th>COMBINACIÓN</th><td colspan="2">${escapeHtml(kaba.llavesCombinacion)}</td>
      </tr>
      <tr>
        <td class="center">${checked(kaba.juntoBotonPiso)}</td><th>JUNTO A BOTÓN DE PISO</th><th rowspan="2">No. DE PISO Y DEPARTAMENTO</th><td rowspan="2">${escapeHtml(kaba.nuevaPisoDepto)}</td>
        <th colspan="2">COMBINACIÓN ACTUAL</th><td colspan="2">${escapeHtml(kaba.combinacionActual)}</td>
        <th>CANTIDAD</th><td colspan="2">${escapeHtml(kaba.llavesCantidad)}</td>
      </tr>
      <tr>
        <td class="center">${checked(kaba.instalacionEspecial)}</td><th>INSTALACIÓN ESPECIAL</th>
        <th colspan="2">CANTIDAD</th><td colspan="2">${escapeHtml(kaba.cambioCantidad)}</td>
        <th rowspan="2">No. DE PISO Y DEPARTAMENTO</th><td colspan="2" rowspan="2">${escapeHtml(kaba.llavesPisoDepto)}</td>
      </tr>
      <tr>
        <th colspan="2">DESCRIPCIÓN DE INSTALACIÓN</th><td colspan="2">${multiline(kaba.descripcionInstalacion)}</td>
        <th colspan="2">No. DE PISO Y DEPARTAMENTO</th><td colspan="2">${escapeHtml(kaba.cambioPisoDepto)}</td>
      </tr>
    </table>

    <table style="margin-top:34px;">
      <tr><td class="signSpace">${escapeHtml(data.voboJefatura)}</td><td style="border:none"></td><td style="border:none;text-align:center;font-weight:bold;">ELABORÓ</td><td style="border:none"></td></tr>
      <tr><th style="border:none">Vo.Bo. JEFATURA</th><td style="border:none"></td><td style="border:none;border-top:1px solid #000;">${escapeHtml(data.supervisor)}<br/>SUPERVISOR</td><td style="border:none"></td></tr>
    </table>

    <div class="note">NOTA: PARA LOS TRABAJOS DE POLEAS, CABLES DE TRACCIÓN Y GOBERNADOR, SE DEBE ANEXAR EL REPORTE DE INSPECCIÓN Y/O DICTAMEN TÉCNICO EN LO POSIBLE FIRMADO POR EL CLIENTE.</div>
    <div class="footerCode">TLA-GMA-FRT-004</div>
    <div class="footerCode" style="text-align:right;">HOJA No. 2 PARA FOTOGRAFÍAS</div>
  </div>

  <div class="page">
    <table class="headerTable">
      <tr>
        <td class="headerSmall">HOJA No. 2</td>
        <th class="headerTitle">MITSUBISHI ELECTRIC DE MÉXICO, S.A DE C.V<br/><br/>SOLICITUD DE COTIZACIÓN</th>
        <td class="headerSmall" style="text-align:right;">ANEXO 8</td>
      </tr>
    </table>

    <table style="margin:8px auto; width:42%;"><tr><th class="label">FECHA</th><th>${escapeHtml(data.fecha)}</th></tr></table>

    <div class="photoInstructions">IMÁGENES</div>
    <div class="photoInstructions" style="background:#fff;">EN CASO DE ANEXAR FOTOGRAFÍAS, ESTAS TENDRÁN QUE SER VISIBLES Y SE TENDRÁ QUE SEÑALAR LA PARTE QUE SE REQUIERE; EN CASO DE QUE LO SOLICITADO TENGA MEDIDAS ESPECÍFICAS, SE TENDRÁ QUE SEÑALAR EN LA MISMA CON ALGUNA REFERENCIA.</div>

    ${renderFotos(data.fotos)}

    <div class="footerCode" style="margin-top:22px;">TLA-GMA-FRT-004</div>
    <div class="note" style="text-align:right;">NOTA: LAS FOTOGRAFÍAS ANEXADAS SERÁN COMPLEMENTO A LA INFORMACIÓN, NO LA REFERENCIA PARA IDENTIFICAR LO REQUERIDO.</div>
  </div>
</body>
</html>
`;
}