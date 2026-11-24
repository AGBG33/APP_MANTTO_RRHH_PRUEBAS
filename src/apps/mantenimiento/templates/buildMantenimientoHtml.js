import { LOGO_DATA_URI } from "./logoBase64";
import { HTML_ELEVADORES } from "./mantenimiento_elevadores.template";
import { HTML_ESCALERAS } from "./mantenimiento_escaleras.template";
import { renderOperacionesAgrupadasHtml } from "./renderOperacionesHtml";

const safeStr = (v) => String(v ?? "").trim();

function escapeHtml(str) {
  return safeStr(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeImgSrc(maybeDataUri) {
  const s = safeStr(maybeDataUri);
  if (!s) return "";

  if (s.startsWith("data:image/")) return s;

  // si te llega "base64 puro" de signature-canvas
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 100) {
    return `data:image/png;base64,${s}`;
  }

  return s;
}

function formatDMY(dateOrSap) {
  if (!dateOrSap) return "—";

  // Fecha SAP: /Date(1784764800000)/
  // Se interpreta con UTC para conservar el día enviado por SAP.
  if (
    typeof dateOrSap === "string" &&
    dateOrSap.startsWith("/Date(")
  ) {
    const match = dateOrSap.match(/\/Date\((-?\d+)/);
    const ms = match ? Number(match[1]) : NaN;

    if (!Number.isNaN(ms)) {
      const d = new Date(ms);

      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yy = d.getUTCFullYear();

      return `${dd}/${mm}/${yy}`;
    }
  }

  // Fecha sin hora: YYYY-MM-DD
  // Se toman directamente sus componentes para evitar zonas horarias.
  if (
    typeof dateOrSap === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateOrSap.trim())
  ) {
    const [yy, mm, dd] = dateOrSap.trim().split("-");
    return `${dd}/${mm}/${yy}`;
  }

  // Timestamps reales, por ejemplo la hora del check-in:
  // se mantienen en la hora local del dispositivo.
  const d = new Date(dateOrSap);

  if (Number.isNaN(d.getTime())) return "—";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();

  return `${dd}/${mm}/${yy}`;
}

function formatHM(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatElapsed(ms) {
  const n = Number(ms || 0);
  if (!n || n <= 0) return "—";

  const totalMin = Math.round(n / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function joinClienteNameFromAddress(addr) {
  const parts = [addr?.Name1, addr?.Name2, addr?.Name3, addr?.Name4]
    .map((x) => safeStr(x))
    .filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildFirmaHtml(signatureData) {
  const src = normalizeImgSrc(signatureData);

  if (!src) {
    return `<div class="firmaEmpty">Sin firma capturada</div>`;
  }

  return `<img class="firmaImg" src="${src}" alt="Firma del cliente" />`;
}

function buildConsumiblesHtml(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div style="color:#63718B;font-weight:800;">Sin consumibles</div>`;
  }

  const safe = (v) => escapeHtml(String(v ?? ""));

  const tr = rows
    .map((r, idx) => {
      const material = safe(r.Material || r.material || "");
      const descripcion = safe(
        r.Descripcion || r.descripcion || r.Description || r.texto || ""
      );
      const cantidad = safe(r.Cantidad ?? r.cantidad ?? r.qty ?? "");
      const unidad = safe(r.Unidad || r.unidad || r.uom || "");

      return `
        <tr>
          <td style="padding:6px;border:1px solid #DDE6F2;">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;">${material}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;">${descripcion}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;text-align:right;">${cantidad}</td>
          <td style="padding:6px;border:1px solid #DDE6F2;">${unidad}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">
      <thead>
        <tr>
          <th style="width:7%;padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">#</th>
          <th style="width:22%;padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">Material</th>
          <th style="width:43%;padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">Descripción</th>
          <th style="width:14%;padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">Cant.</th>
          <th style="width:14%;padding:6px;border:1px solid #DDE6F2;background:#F5F7FA;">U.M.</th>
        </tr>
      </thead>
      <tbody>${tr}</tbody>
    </table>
  `;
}

function resolveCliente(orden = {}, address = null) {
  const clienteFromAddr = address ? joinClienteNameFromAddress(address) : "";

  return safeStr(
    clienteFromAddr ||
      orden?.cliente ||
      orden?.razon_social ||
      orden?.partner_name ||
      orden?.PartnerName ||
      [orden?.Name1, orden?.Name2].filter(Boolean).join(" ")
  );
}

function resolveTecnico(orden = {}, tecnicoNombre = "") {
  return safeStr(
    tecnicoNombre ||
      orden?.tecnico ||
      orden?.Tecnico ||
      orden?.tecnico_nombre ||
      orden?.nombre_tecnico ||
      orden?.nombre ||
      orden?.name ||
      ""
  );
}

function resolveFecha(orden = {}, startMs = null, horaInicioMs = null) {
  return formatDMY(
    orden?.start_date ||
      orden?.StartDate ||
      orden?.fecha ||
      orden?.Fecha ||
      startMs ||
      horaInicioMs
  );
}

/**
 * buildMantenimientoHtml(args)
 * - orden: { Orderid, Equipment, start_date, finish_date, ... }
 * - address: objeto de ToAddresses (Name1..Name4)
 */
export async function buildMantenimientoHtml(args = {}) {
  const {
    tipo = "elevador",
    orden = {},
    address = null,

    operaciones = [],
    checkedMap = {},
    signatureData = null,

    // datos cliente capturados
    clienteEmail = "",
    clienteNombre = "",
    clienteCargo = "",

    // datos técnico
    tecnicoNombre = "",

    // textos
    avisoCliente = "",
    notaTecnico = "",

    // cobertura / consumibles
    coberturaTipo = "",
    consumibles = [],

    // tiempos (ms) - soporta ambos nombres
    horaInicioMs = null,
    horaFinMs = null,
    tiempoTotalMs = null,
    startMs = null,
    finishMs = null,
    elapsedMs = null,
  } = args;

  const logoDataUri = LOGO_DATA_URI;

  const isEsc = String(tipo).toLowerCase().includes("escal");
  let html = isEsc ? HTML_ESCALERAS : HTML_ELEVADORES;

  const orderid = safeStr(orden?.Orderid || orden?.OrderId || orden?.orderid || "");
  const equipment = safeStr(orden?.Equipment || orden?.equipment || "");

  const cliente = resolveCliente(orden, address);
  const tecnico = resolveTecnico(orden, tecnicoNombre);
  const fecha = resolveFecha(orden, startMs, horaInicioMs);

  const opsHtml = renderOperacionesAgrupadasHtml({
    orderid,
    operaciones,
    checkedMap,
  });

  const firmaHtml = buildFirmaHtml(signatureData);
  const consHtml = buildConsumiblesHtml(Array.isArray(consumibles) ? consumibles : []);

  const inicioReal = startMs ?? horaInicioMs ?? null;
  const finReal = finishMs ?? horaFinMs ?? null;
  const totalReal =
    elapsedMs ?? tiempoTotalMs ?? (inicioReal && finReal ? finReal - inicioReal : 0);

  const hIni = formatHM(inicioReal);
  const hFin = formatHM(finReal);
  const elapsed = formatElapsed(totalReal);

  html = html.replaceAll("{{LOGO_DATA_URI}}", logoDataUri);
  html = html.replaceAll("{{COBERTURA_TIPO}}", escapeHtml(coberturaTipo || "—"));

  html = html.replaceAll("{{ORDERID}}", escapeHtml(orderid || "—"));
  html = html.replaceAll("{{EQUIPMENT}}", escapeHtml(equipment || "—"));
  html = html.replaceAll("{{CLIENTE}}", escapeHtml(cliente || "—"));
  html = html.replaceAll("{{TECNICO}}", escapeHtml(tecnico || "—"));
  html = html.replaceAll("{{FECHA}}", escapeHtml(fecha || "—"));

  html = html.replaceAll("{{HORA_INICIO}}", escapeHtml(hIni));
  html = html.replaceAll("{{HORA_FIN}}", escapeHtml(hFin));
  html = html.replaceAll("{{TIEMPO_TOTAL}}", escapeHtml(elapsed));

  html = html.replaceAll("{{OPERACIONES_HTML}}", opsHtml);

  html = html.replaceAll("{{AVISO_CLIENTE}}", escapeHtml(avisoCliente || ""));
  html = html.replaceAll("{{NOTA_TECNICO}}", escapeHtml(notaTecnico || ""));

  html = html.replaceAll("{{CONSUMIBLES_HTML}}", consHtml);

  html = html.replaceAll("{{FIRMA_CLIENTE_HTML}}", firmaHtml);

  html = html.replaceAll("{{CLIENTE_EMAIL}}", escapeHtml(clienteEmail || ""));
  html = html.replaceAll("{{CLIENTE_NOMBRE}}", escapeHtml(clienteNombre || ""));
  html = html.replaceAll("{{CLIENTE_CARGO}}", escapeHtml(clienteCargo || ""));

  return html;
}