// src/services/mantenimientoPdfElevadores.js
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";



/**
 * Convierte un require(...) de asset a data URI (base64) para <img src="..."> en expo-print.
 * Funciona en DEV y en BUILDS (Android/iOS) porque:
 * - si no hay localUri, usa asset.uri
 * - si asset.uri es http(s), lo descarga al cache y lee de ahí
 */
function mimeFromUri(uri = "") {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function isHttp(uri = "") {
  const u = String(uri || "");
  return u.startsWith("http://") || u.startsWith("https://");
}

async function ensureLocalFile(uri) {
  // Si ya es file:// lo regresamos
  if (!uri) return "";
  if (!isHttp(uri)) return uri;

  // Si es http(s), lo bajamos al cache
  const ext = uri.toLowerCase().includes(".jpg") || uri.toLowerCase().includes(".jpeg")
    ? ".jpg"
    : uri.toLowerCase().includes(".webp")
    ? ".webp"
    : ".png";

  const target = `${FileSystem.cacheDirectory}asset_${Date.now()}${ext}`;
  try {
    await FileSystem.downloadAsync(uri, target);
    return target;
  } catch (e) {
    console.log("[ensureLocalFile] downloadAsync failed:", e?.message || e);
    return "";
  }
}

async function assetToDataUri(moduleAsset) {
  try {
    if (!moduleAsset) return "";

    const asset = Asset.fromModule(moduleAsset);
    await asset.downloadAsync();

    const uri = asset.localUri || asset.uri;
    if (!uri) {
      console.log("[assetToDataUri] sin uri");
      return "";
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64, // ✅ aquí SÍ existe
    });

    const mime =
      uri.endsWith(".jpg") || uri.endsWith(".jpeg")
        ? "image/jpeg"
        : uri.endsWith(".webp")
        ? "image/webp"
        : "image/png";

    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.log("[assetToDataUri] error:", e);
    return "";
  }
}


function renderFloorCells(selectedFloors = [], pisos = 6, mark = "X") {
  const set = new Set((selectedFloors || []).map((n) => Number(n)));
  const cols = 6;

  let html = "";
  for (let i = 1; i <= cols; i++) {
    const show = i <= Number(pisos || 6);
    const val = show && set.has(i) ? mark : "";
    html += `<td style="text-align:center; font-weight:bold;">${val}</td>`;
  }
  return html;
}

function unionFloorsForItems(map, items) {
  const s = new Set();
  (items || []).forEach((k) => {
    (map?.[k] || []).forEach((n) => s.add(Number(n)));
  });
  return Array.from(s).sort((a, b) => a - b);
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function labelToHtml(label) {
  return String(label)
    .replace("COND. CUARTO DE MÁQUINA", "COND. CUARTO DE MAQUINA")
    .replace(
      "COND. FUNCIONAMIENTO TOTAL CTO. MAQ.",
      "COND. FUNCIONAMIENTO<br/>TOTAL CUARTO DE MAQ."
    )
    .replace("COND. FUNCIONAMIENTO DE CABINA", "COND. FUNCIONAMIENTO<br/>DE CABINA")
    .replace("BOTÓN E INDICADOR DE CABINA", "BOTÓN E INDICADOR<br/>DE CABINA")
    .replace(
      "ILUMINACIÓN Y ACABADO DE CABINA",
      "ILUMINACIÓN Y ACABADO<br/>DE CABINA"
    )
    .replace("BOTÓN E INDICADOR DE PISO", "BOTÓN E INDICADOR<br/>DE PISO")
    .replace(
      "CONDICIÓN AMBIENTAL EN TECHO CABINA",
      "CONDICION AMBIENTAL<br/>EN TECHO CABINA"
    );
}

export async function buildPdfHtmlElevadores(payload, opts) {
  const { logoModule, elevadorModule } = opts || {};

  const logoDataUri = logoModule ? await assetToDataUri(logoModule) : "";
  const elevadorDataUri = elevadorModule ? await assetToDataUri(elevadorModule) : "";

  // 🔎 Debug rápido (déjalo 1 prueba y luego lo quitas)
  // console.log("logoDataUri?", logoDataUri?.slice(0, 30), "len:", logoDataUri?.length);
  // console.log("elevadorDataUri?", elevadorDataUri?.slice(0, 30), "len:", elevadorDataUri?.length);

  const {
    orderid,
    cliente,
    tecnico,
    fecha,
    hora_entrada,
    hora_salida,
    pisos,
    niveles,
    aviso_cliente,
    detalle_trabajo,
    refacciones,
    bloques,
    firmaClienteBase64,
    nombreClienteFirma,
    cargoClienteFirma,
    folio = "",
  } = payload || {};

  const top = bloques?.tablaTop || {};
  const subsel = bloques?.subconjuntos || {};

  const BLOQUE_TOP = [
    "COND. CUARTO DE MÁQUINA",
    "COND. FUNCIONAMIENTO TOTAL CTO. MAQ.",
    "COND. FUNCIONAMIENTO DE CABINA",
    "BOTÓN E INDICADOR DE CABINA",
    "ILUMINACIÓN Y ACABADO DE CABINA",
    "LUZ DE EMERGENCIA",
    "BOTÓN E INDICADOR DE PISO",
    "INDICADOR DE T/SUPERVISIÓN",
    "CONDICIÓN DE FOSA",
    "INTERLOCK",
    "SW LÍMITE",
    "CONDICIÓN AMBIENTAL EN TECHO CABINA",
  ];

  const SUBCONJUNTOS = [
    {
      titulo: "1.- CUARTO DE MAQUINA",
      items: [
        "1.1 PANEL DE CONTROL",
        "1.2 FRENO",
        "1.3 MÁQUINA DE TRACCIÓN/MOTOR/TACOGEN.",
        "1.4 POLEA TRACCIÓN/DEFLECTORA",
        "1.5 GOBERNADOR",
      ],
    },
    {
      titulo: "2.- CABINA",
      items: [
        "2.1 ACEITERA",
        "2.2 ZAPATA DE CABINA",
        "2.3 OPERADOR DE PUERTA",
        "2.4 CLUTCH DE CABINA",
        "2.5 S.D.E. E.D.M.",
        "2.6 DESLIZADOR",
        "2.7 SEGURO CONTRA CAÍDA",
      ],
    },
    {
      titulo: "3.- PISOS",
      items: ["3.1 RIEL", "3.2 INTERLOCK", "3.3 DESLIZADOR", "3.4 CABLE ENTREPOLEA"],
    },
    {
      titulo: "4.- CUBO",
      items: [
        "4.1 CAJA DE CONEXIÓN Y 1/2 TIRO",
        "4.2 CABLE VIAJERO",
        "4.3 CABLE DE TRACCIÓN",
        "4.4 RIEL Y SOPORTE",
        "4.5 CONTRAPESO",
        "4.6 SW LÍMITE",
      ],
    },
    {
      titulo: "5.- FOSA",
      items: ["5.1 POLEA DE TENSIÓN", "5.2 AMORTIGUADORES", "5.3 CABLE DE GOBERNADOR"],
    },
  ];

  const topRows = BLOQUE_TOP.map((label) => {
    const selected = top[label] || [];
    return `
      <tr>
        <td>${labelToHtml(label)}</td>
        ${renderFloorCells(selected, pisos, "X")}
      </tr>
    `;
  }).join("");

  const gruposMarcados = {};
  SUBCONJUNTOS.forEach((g) => {
    gruposMarcados[g.titulo] = unionFloorsForItems(subsel, g.items);
  });

  const ref = (refacciones || []).slice(0, 4);
  const refRows = Array.from({ length: 4 })
    .map((_, i) => {
      const r = ref[i] || {};
      const si = r.conCargo ? "X" : "";
      const no = r.conCargo ? "" : r.cantidad || r.descripcion || r.codigo ? "X" : "";
      return `
      <tr>
        <th style="height: 6px; text-align:left;">${
          i === 0 ? escapeHtml(detalle_trabajo || "") : ""
        }</th>
        <th style="text-align:center;">${escapeHtml(r.cantidad || "")}</th>
        <th colspan="2" style="text-align:left;">${escapeHtml(r.descripcion || "")}</th>
        <th style="text-align:center; font-weight:bold;">${si}</th>
        <th style="text-align:center; font-weight:bold;">${no}</th>
        <th style="text-align:left;">${escapeHtml(r.codigo || "")}</th>
      </tr>
    `;
    })
    .join("");

  const hasFirma =
    !!firmaClienteBase64 && String(firmaClienteBase64).startsWith("data:image/");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>REPORTE DE MANTENIMIENTO DE ELEVADORES</title>
  <style>
    @page { margin: 10mm; }
    body {
      width: 612px;
      margin: 0 auto;
      font-family: Arial, sans-serif;
      font-size: 8px;
      color: #000;
      box-sizing: border-box;
      border: 1px solid #999;
      padding: 18px;
    }

    .header-row { display:flex; justify-content:center; align-items:center; gap:8px; margin-bottom:6px; width:65%; }
    .header-logo img { width:150px; }
    .image img { width:150px; margin-top:12px; }

    .header-company { text-align:left; font-weight:bold; font-size:12px; display:flex; gap:8px; width:70%; }
    .header-divider { width:2px; height:60px; background-color:black; display:block; }

    table { width:100%; border-collapse:collapse; margin-top:6px; table-layout:fixed; }
    td { border:1px solid #000; padding:2px; text-align:left; font-size:7px; font-weight:normal; }
    th { border:1px solid #000; padding:2px; text-align:center; font-size:7px; font-weight:normal; }

    h1 { text-align:left; font-size:18px; font-weight:normal; margin:6px 0 0 0; }

    .sigBox{ width:170px; height:34px; border:1px solid #000; background:#fff; overflow:hidden; display:block; }
    .sigImg{ width:100%; height:100%; object-fit:contain; display:block; }
    .metaRow{ display:flex; gap:8px; margin-top:6px; align-items:center; font-size:7px; }
    .metaValue{ font-weight:bold; }
  </style>
</head>

<body>
  <div class="header-row">
    <div class="header-logo">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Logo Mitsubishi" />` : ""}
    </div>
    <div class="header-divider"></div>
    <div class="header-company">
      MITSUBISHI ELECTRIC <br/>DE MÉXICO, S.A. DE C.V. <br/>
    </div>
  </div>

  <div style="display:flex; gap:5px; width:100%">
    <table style="width:40%">
      <tr><td style="border:none; font-size:6px">
        TELEFONOS DE EMERGENCIA 25HRS. Y ATENCIÓN A CLIENTES (CALL CENTER),
        EN ZONA METROPOLITANA E INTERIOR DEL PAIS:<br/>
        800-926-3526&nbsp;&nbsp; 800-926-3563 &nbsp;&nbsp;(01-55) 5341-8512
      </td></tr>
    </table>

    <table style="width:15%">
      <tr><th colspan="3">CONTRATO</th></tr>
      <tr><th style="height:15px"></th><th></th><th></th></tr>
    </table>

    <table style="width:35%">
      <tr><th colspan="8">ORDEN</th></tr>
      <tr>
        <td>MX</td>
        <th colspan="7" style="text-align:left;">${escapeHtml(orderid || "")}</th>
      </tr>
    </table>

    <table style="width:30%">
      <tr><th colspan="2">No. DE FOLIO</th></tr>
      <tr>
        <td style="border-right:none">CDMX</td>
        <td style="color:red; font-size:15px; border-left:none">${escapeHtml(folio || "")}</td>
      </tr>
    </table>
  </div>

  <h1>REPORTE DE MANTENIMIENTO DE ELEVADORES</h1>

  <div style="display:flex; gap:5px; width:100%">
    <table style="width:40%"><tr><td style="height:20px; vertical-align:top">CLIENTE<br/><b>${escapeHtml(cliente || "")}</b></td></tr></table>
    <table style="width:40%"><tr><td style="height:20px; vertical-align:top">NOMBRE DE MECÁNICO<br/><b>${escapeHtml(tecnico || "")}</b></td></tr></table>
    <table style="width:20%"><tr><td style="height:20px; vertical-align:top">FECHA<br/><b>${escapeHtml(fecha || "")}</b></td></tr></table>
  </div>

  <div style="display:flex; gap:5px; width:100%">

    <table style="width:35%">
      <thead>
        <tr>
          <th style="width:50%">No. ELEVADOR</th>
          <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
        </tr>
      </thead>
      <tbody>
        ${topRows}

        <tr><td style="height:6px"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td style="height:6px"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

        <tr>
          <td>No. DE NIVELES</td>
          <td colspan="6" style="text-align:center; font-weight:bold;">${escapeHtml(niveles ?? "")}</td>
        </tr>

        <tr><th style="height:32px; border:none"></th></tr>

        <tr><td colspan="7" style="border:none">MECANICO: <b>${escapeHtml(tecnico || "")}</b></td></tr>

        <tr><th colspan="3">HORA DE ENTRADA</th><th colspan="4" style="text-align:left;">${escapeHtml(hora_entrada || "")}</th></tr>
        <tr><th colspan="3">HORA DE SALIDA</th><th colspan="4" style="text-align:left;">${escapeHtml(hora_salida || "")}</th></tr>
      </tbody>
    </table>

    <div class="image">
      ${elevadorDataUri ? `<img src="${elevadorDataUri}" />` : ""}
    </div>

    <div style="width:33%; display:flex; flex-direction:column">
      <table style="width:100%">
        <tr>
          <td style="width:50%">No. ELEVADOR</td>
          <td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td>
        </tr>
        <tr>
          <td>1.- CUARTO DE MAQUINA</td>
          ${renderFloorCells(gruposMarcados["1.- CUARTO DE MAQUINA"], pisos, "X")}
        </tr>
      </table>

      <div style="font-size:5px; margin-top:8px; line-height:1.4">
        1.1 PANEL DE CONTROL<br/>1.2 FRENO<br/>1.3 MAQUINA DE TRACCIÓN MOTOR Y TACOGENERADOR<br/>
        1.4 POLEA DE TRACCIÓN Y DEFLECTORA<br/>1.5 GOBERNADOR
      </div>

      <table style="width:100%"><tr><td style="width:50%">2.- CABINA</td>${renderFloorCells(gruposMarcados["2.- CABINA"], pisos, "X")}</tr></table>
      <div style="font-size:5px; margin-top:8px; line-height:1.4">
        2.1 ACEITERA <br/>2.2 ZAPATA DE CABINA<br/>2.3 OPERADOR DE PUERTA<br/>2.4 CLUTCH DE CABINA<br/>
        2.5 S.D.E. E.D.M. <br/>2.6 DESLIZADOR<br/>2.7 SEGURO CONTRA CAÍDA
      </div>

      <table style="width:100%"><tr><td style="width:50%">3.- PISOS</td>${renderFloorCells(gruposMarcados["3.- PISOS"], pisos, "X")}</tr></table>
      <div style="font-size:5px; margin-top:6px; line-height:1.35">
        3.1 RIEL <br/>3.2 INTERLOCK <br/>3.3 DESLIZADOR <br/>3.4 CABLE ENTREPOLEA
      </div>

      <table style="width:100%"><tr><td style="width:50%">4.- CUBO</td>${renderFloorCells(gruposMarcados["4.- CUBO"], pisos, "X")}</tr></table>
      <div style="font-size:5px; margin-top:6px; line-height:1.4">
        4.1 CAJA DE CONEXION Y 1/2 TIRO<br/>4.2 CABLE VIAJERO<br/>4.3 CABLE DE TRACCIÓN<br/>
        4.4 RIEL Y SOPORTE<br/>4.5 CONTRAPESO<br/>4.6 SW LIMITE
      </div>

      <table style="width:100%"><tr><td style="width:50%">5.- FOSA</td>${renderFloorCells(gruposMarcados["5.- FOSA"], pisos, "X")}</tr></table>
      <div style="font-size:5px; margin-top:6px; line-height:1.35">
        5.1 POLEA DE TENSION <br/>5.2 AMORTIGUADORES<br/>5.3 CABLE DE GOBERNADOR
      </div>
    </div>
  </div>

  <table><tr><td>AVISO AL CLIENTE<br/><b>${escapeHtml(aviso_cliente || "")}</b></td></tr></table>

  <table>
    <tr>
      <th style="width:35%">DETALLE DE TRABAJO</th>
      <th colspan="3" style="width:35%">REFACCIONES UTILIZADAS</th>
      <th colspan="2">CON CARGO <br/>AL CLIENTE</th>
      <th rowspan="2">CODIGO <br/>INTERNO</th>
    </tr>
    <tr>
      <th></th>
      <th>CANTIDAD</th>
      <th colspan="2">DESCRIPCIÓN</th>
      <th>SI</th>
      <th>NO</th>
    </tr>

    ${refRows}

    <tr><th colspan="6" style="border:none">ESTIMADO CLIENTE</th></tr>

    <tr>
      <td colspan="3">
        1.-POR FAVOR VERIFIQUE TODOS LOS TRABAJOS REALIZADOS POR EL MECANICO
        DE MANTENIMIENTO Y SI ESTA DE ACUERDO, POR FAVOR FIRME ESTE REPORTE DE
        CONFORMIDAD <br/>
        2.- TAMBIEN VERIFIQUE LA HORA DE ENTRADA Y DE SALIDA DEL MECANICO Y
        CUANDO HAYA CAMBIO DE REFACCIONES, EXIJA LE ENTREGUEN LAS USADAS
        (DAÑADAS).
      </td>

      <td colspan="4" style="vertical-align:top;">
        <div class="sigBox">
          ${hasFirma ? `<img src="${firmaClienteBase64}" class="sigImg" />` : ""}
        </div>

        <div class="metaRow">
          <span>NOMBRE:</span>
          <span class="metaValue">${escapeHtml(nombreClienteFirma || "")}</span>
        </div>

        <div class="metaRow" style="margin-top:3px;">
          <span>CARGO:</span>
          <span class="metaValue">${escapeHtml(cargoClienteFirma || "")}</span>
        </div>
      </td>
    </tr>
  </table>

  <p style="font-size:6px; margin-top:6px;">TEL-GMA-FRT-003.3</p>
</body>
</html>`;
}
