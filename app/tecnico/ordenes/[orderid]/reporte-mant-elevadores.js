// app/tecnico/ordenes/[orderid]/mant-elevadores.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import Header from '../../../../src/components/Header';
import { useLocalSearchParams, router } from 'expo-router';

import FloorSelectModal from '../../../../src/components/FloorSelectModal';
import { generarYCompartirPdf } from "../../../../src/services/pdf";
import { subirPdfMantElevadoresASap } from "../../../../src/services/mantenimientoPdfSap";
import { fetchDatosMantenimiento, guardarMantElevadores } from '../../../../src/services/mantenimiento';


// ✅ PDF / Firma
import Signature from 'react-native-signature-canvas';

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

// ✅ IMPORTA tus imágenes (AJUSTA rutas a tu proyecto)
import logo from '../../../../assets/imgDocs/logo.png';
import elevadorImg from '../../../../assets/imgDocs/elevador.png';

const BLOQUE_TOP = [
  'COND. CUARTO DE MÁQUINA',
  'COND. FUNCIONAMIENTO TOTAL CTO. MAQ.',
  'COND. FUNCIONAMIENTO DE CABINA',
  'BOTÓN E INDICADOR DE CABINA',
  'ILUMINACIÓN Y ACABADO DE CABINA',
  'LUZ DE EMERGENCIA',
  'BOTÓN E INDICADOR DE PISO',
  'INDICADOR DE T/SUPERVISIÓN',
  'CONDICIÓN DE FOSA',
  'INTERLOCK',
  'SW LÍMITE',
  'CONDICIÓN AMBIENTAL EN TECHO CABINA',
];

const SUBCONJUNTOS = [
  {
    titulo: '1.- CUARTO DE MÁQUINA',
    items: [
      '1.1 PANEL DE CONTROL',
      '1.2 FRENO',
      '1.3 MÁQUINA DE TRACCIÓN/MOTOR/TACOGEN.',
      '1.4 POLEA TRACCIÓN/DEFLECTORA',
      '1.5 GOBERNADOR',
    ],
  },
  {
    titulo: '2.- CABINA',
    items: [
      '2.1 ACEITERA',
      '2.2 ZAPATA DE CABINA',
      '2.3 OPERADOR DE PUERTA',
      '2.4 CLUTCH DE CABINA',
      '2.5 S.D.E. E.D.M.',
      '2.6 DESLIZADOR',
      '2.7 SEGURO CONTRA CAÍDA',
    ],
  },
  {
    titulo: '3.- PISOS',
    items: ['3.1 RIEL', '3.2 INTERLOCK', '3.3 DESLIZADOR', '3.4 CABLE ENTREPOLEA'],
  },
  {
    titulo: '4.- CUBO',
    items: [
      '4.1 CAJA DE CONEXIÓN Y 1/2 TIRO',
      '4.2 CABLE VIAJERO',
      '4.3 CABLE DE TRACCIÓN',
      '4.4 RIEL Y SOPORTE',
      '4.5 CONTRAPESO',
      '4.6 SW LÍMITE',
    ],
  },
  {
    titulo: '5.- FOSA',
    items: ['5.1 POLEA DE TENSIÓN', '5.2 AMORTIGUADORES', '5.3 CABLE DE GOBERNADOR'],
  },
];

function BadgeCount({ count }) {
  if (!count) return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>0</Text>
    </View>
  );
  return (
    <View style={[styles.badge, styles.badgeOn]}>
      <Text style={styles.badgeTextOn}>{count}</Text>
    </View>
  );
}

function CardItem({ title, count, onPress }) {
  return (
    <TouchableOpacity style={styles.cardItem} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.cardItemTitle} numberOfLines={2}>{title}</Text>
      <BadgeCount count={count} />
      <Text style={styles.cardItemLink}>Seleccionar pisos</Text>
    </TouchableOpacity>
  );
}

function CollapsibleGroup({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.group}>
      <TouchableOpacity style={styles.groupHeader} onPress={() => setOpen(!open)}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupToggle}>{open ? 'Ocultar' : 'Mostrar'}</Text>
      </TouchableOpacity>
      {open && <View style={{ marginTop: 8 }}>{children}</View>}
    </View>
  );
}

// ================== PDF helpers (FIX imágenes + firma compacta) ==================
function mimeFromUri(uri = '') {
  const u = (uri || '').toLowerCase();
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

async function assetToDataUri(moduleAsset) {
  try {
    const asset = Asset.fromModule(moduleAsset);
    await asset.downloadAsync();

    // 1) intenta localUri (lo correcto para leer en file system)
    let uri = asset.localUri;

    // 2) fallback: si por alguna razón no hay localUri, baja a cache manual
    if (!uri) {
      const filename = asset.name || `asset_${Date.now()}.png`;
      const target = `${FileSystem.cacheDirectory}${filename}`;
      const dl = await FileSystem.downloadAsync(asset.uri, target);
      uri = dl?.uri;
    }

    if (!uri) {
      console.log('[assetToDataUri] Sin uri usable:', asset);
      return '';
    }

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    const mime = mimeFromUri(uri);
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.log('assetToDataUri error:', e);
    return '';
  }
}



function renderFloorCells(selectedFloors = [], pisos = 6, mark = 'X') {
  const set = new Set((selectedFloors || []).map(n => Number(n)));
  const cols = 6;
  let html = '';
  for (let i = 1; i <= cols; i++) {
    const show = i <= Number(pisos || 6);
    const val = show && set.has(i) ? mark : '';
    html += `<td style="text-align:center; font-weight:bold;">${val}</td>`;
  }
  return html;
}

function unionFloorsForItems(map, items) {
  const s = new Set();
  (items || []).forEach(k => {
    (map?.[k] || []).forEach(n => s.add(Number(n)));
  });
  return Array.from(s).sort((a, b) => a - b);
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function labelToHtml(label) {
  return label
    .replace('COND. CUARTO DE MÁQUINA', 'COND. CUARTO DE MAQUINA')
    .replace('COND. FUNCIONAMIENTO TOTAL CTO. MAQ.', 'COND. FUNCIONAMIENTO<br/>TOTAL CUARTO DE MAQ.')
    .replace('COND. FUNCIONAMIENTO DE CABINA', 'COND. FUNCIONAMIENTO<br/>DE CABINA')
    .replace('BOTÓN E INDICADOR DE CABINA', 'BOTÓN E INDICADOR<br/>DE CABINA')
    .replace('ILUMINACIÓN Y ACABADO DE CABINA', 'ILUMINACIÓN Y ACABADO<br/>DE CABINA')
    .replace('BOTÓN E INDICADOR DE PISO', 'BOTÓN E INDICADOR<br/>DE PISO')
    .replace('CONDICIÓN AMBIENTAL EN TECHO CABINA', 'CONDICION AMBIENTAL<br/>EN TECHO CABINA');
}

async function buildPdfHtmlElevadores(payload) {
  const logoDataUri = await assetToDataUri(logo);
  const elevadorDataUri = await assetToDataUri(elevadorImg);

  console.log('[PDF] logoDataUri length:', logoDataUri?.length);
  console.log('[PDF] elevadorDataUri length:', elevadorDataUri?.length);

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
    folio = '',
  } = payload || {};

  const top = bloques?.tablaTop || {};
  const subsel = bloques?.subconjuntos || {};

  const topRows = BLOQUE_TOP.map(label => {
    const selected = top[label] || [];
    return `
      <tr>
        <td>${labelToHtml(label)}</td>
        ${renderFloorCells(selected, pisos, 'X')}
      </tr>
    `;
  }).join('');

  const gruposMarcados = {};
  SUBCONJUNTOS.forEach(g => {
    gruposMarcados[g.titulo] = unionFloorsForItems(subsel, g.items);
  });

  const ref = (refacciones || []).slice(0, 4);
  const refRows = Array.from({ length: 4 }).map((_, i) => {
    const r = ref[i] || {};
    const si = r.conCargo ? 'X' : '';
    const no = r.conCargo ? '' : (r.cantidad || r.descripcion || r.codigo ? 'X' : '');
    return `
      <tr>
        <th style="height: 6px; text-align:left;">${i === 0 ? escapeHtml(detalle_trabajo || '') : ''}</th>
        <th style="text-align:center;">${escapeHtml(r.cantidad || '')}</th>
        <th colspan="2" style="text-align:left;">${escapeHtml(r.descripcion || '')}</th>
        <th style="text-align:center; font-weight:bold;">${si}</th>
        <th style="text-align:center; font-weight:bold;">${no}</th>
        <th style="text-align:left;">${escapeHtml(r.codigo || '')}</th>
      </tr>
    `;
  }).join('');

  const hasFirma = !!(firmaClienteBase64 && String(firmaClienteBase64).startsWith('data:image/'));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>REPORTE DE MANTENIMIENTO DE ELEVADORES</title>
  <style>
    @page { margin: 10mm; }
    body { width: 612px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 8px; color:#000; box-sizing:border-box; border:1px solid #999; padding:18px; }

    .header-row { display:flex; justify-content:center; align-items:center; gap:8px; margin-bottom:6px; width:65%; }
    .header-logo img { width:150px; }
    .image img { width:150px; margin-top:12px; }
    .header-company { text-align:left; font-weight:bold; font-size:12px; display:flex; gap:8px; width:70%; }
    .header-divider { width:2px; height:60px; background-color:black; display:block; }

    table { width:100%; border-collapse:collapse; margin-top:6px; table-layout:fixed; }
    td { border:1px solid #000; padding:2px; text-align:left; font-size:7px; font-weight:normal; }
    th { border:1px solid #000; padding:2px; text-align:center; font-size:7px; font-weight:normal; }
    h1 { text-align:left; font-size:18px; font-weight:normal; margin:6px 0 0 0; }

    /* ✅ Firma compacta: SIN línea, SIN espacio sobrante */
    .sigBox{
      width:170px;
      height:34px;
      border:1px solid #000;
      background:#fff;
      overflow:hidden;
      display:block;
    }
    .sigImg{
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
    }
    .metaRow{
      display:flex;
      gap:6px;
      margin-top:4px;
      align-items:center;
      font-size:7px;
    }
    .metaLabel{ font-weight:normal; }
    .metaValue{ font-weight:bold; }
  </style>
</head>
<body>

  <div class="header-row">
    <div class="header-logo">${logoDataUri ? `<img src="${logoDataUri}" alt="Logo Mitsubishi" />` : ''}</div>
    <div class="header-divider"></div>
    <div class="header-company">MITSUBISHI ELECTRIC <br/>DE MÉXICO, S.A. DE C.V. <br/></div>
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
        <th colspan="7" style="text-align:left;">${escapeHtml(orderid || '')}</th>
      </tr>
    </table>

    <table style="width:30%">
      <tr><th colspan="2">No. DE FOLIO</th></tr>
      <tr>
        <td style="border-right:none">CDMX</td>
        <td style="color:red; font-size:15px; border-left:none">${escapeHtml(folio || '')}</td>
      </tr>
    </table>
  </div>

  <h1>REPORTE DE MANTENIMIENTO DE ELEVADORES</h1>

  <div style="display:flex; gap:5px; width:100%">
    <table style="width:40%"><tr><td style="height:20px; vertical-align:top">CLIENTE<br/><b>${escapeHtml(cliente || '')}</b></td></tr></table>
    <table style="width:40%"><tr><td style="height:20px; vertical-align:top">NOMBRE DE MECÁNICO<br/><b>${escapeHtml(tecnico || '')}</b></td></tr></table>
    <table style="width:20%"><tr><td style="height:20px; vertical-align:top">FECHA<br/><b>${escapeHtml(fecha || '')}</b></td></tr></table>
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
          <td colspan="6" style="text-align:center; font-weight:bold;">${niveles ?? ''}</td>
        </tr>

        <tr><th style="height:32px; border:none"></th></tr>

        <tr><td colspan="7" style="border:none">MECANICO: <b>${escapeHtml(tecnico || '')}</b></td></tr>

        <tr><th colspan="3">HORA DE ENTRADA</th><th colspan="4" style="text-align:left;">${escapeHtml(hora_entrada || '')}</th></tr>
        <tr><th colspan="3">HORA DE SALIDA</th><th colspan="4" style="text-align:left;">${escapeHtml(hora_salida || '')}</th></tr>
      </tbody>
    </table>

    <div class="image">${elevadorDataUri ? `<img src="${elevadorDataUri}" />` : ''}</div>

    <div style="width:33%; display:flex; flex-direction:column">

      <table style="width:100%">
        <tr>
          <td style="width:50%">No. ELEVADOR</td>
          <td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td>
        </tr>
        <tr>
          <td>1.- CUARTO DE MAQUINA</td>
          ${renderFloorCells(gruposMarcados['1.- CUARTO DE MÁQUINA'], pisos, 'X')}
        </tr>
      </table>

      <div style="font-size:5px; margin-top:8px; line-height:1.4">
        1.1 PANEL DE CONTROL<br/>
        1.2 FRENO<br/>
        1.3 MAQUINA DE TRACCIÓN MOTOR Y TACOGENERADOR<br/>
        1.4 POLEA DE TRACCIÓN Y DEFLECTORA<br/>
        1.5 GOBERNADOR
      </div>

      <table style="width:100%">
        <tr>
          <td style="width:50%">2.- CABINA</td>
          ${renderFloorCells(gruposMarcados['2.- CABINA'], pisos, 'X')}
        </tr>
      </table>

      <div style="font-size:5px; margin-top:8px; line-height:1.4">
        2.1 ACEITERA <br/>
        2.2 ZAPATA DE CABINA<br/>
        2.3 OPERADOR DE PUERTA<br/>
        2.4 CLUTCH DE CABINA<br/>
        2.5 S.D.E. E.D.M. <br/>
        2.6 DESLIZADOR<br/>
        2.7 SEGURO CONTRA CAÍDA
      </div>

      <table style="width:100%">
        <tr>
          <td style="width:50%">3.- PISOS</td>
          ${renderFloorCells(gruposMarcados['3.- PISOS'], pisos, 'X')}
        </tr>
      </table>

      <div style="font-size:5px; margin-top:6px; line-height:1.35">
        3.1 RIEL <br/>
        3.2 INTERLOCK <br/>
        3.3 DESLIZADOR <br/>
        3.4 CABLE ENTREPOLEA
      </div>

      <table style="width:100%">
        <tr>
          <td style="width:50%">4.- CUBO</td>
          ${renderFloorCells(gruposMarcados['4.- CUBO'], pisos, 'X')}
        </tr>
      </table>

      <div style="font-size:5px; margin-top:6px; line-height:1.4">
        4.1 CAJA DE CONEXION Y 1/2 TIRO<br/>
        4.2 CABLE VIAJERO<br/>
        4.3 CABLE DE TRACCIÓN<br/>
        4.4 RIEL Y SOPORTE<br/>
        4.5 CONTRAPESO<br/>
        4.6 SW LIMITE
      </div>

      <table style="width:100%">
        <tr>
          <td style="width:50%">5.- FOSA</td>
          ${renderFloorCells(gruposMarcados['5.- FOSA'], pisos, 'X')}
        </tr>
      </table>

      <div style="font-size:5px; margin-top:6px; line-height:1.35">
        5.1 POLEA DE TENSION <br/>
        5.2 AMORTIGUADORES<br/>
        5.3 CABLE DE GOBERNADOR
      </div>

    </div>
  </div>

  <table><tr><td>AVISO AL CLIENTE<br/><b>${escapeHtml(aviso_cliente || '')}</b></td></tr></table>

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

      <!-- ✅ COMPACTO: firma + nombre/cargo SIN líneas -->
      <td colspan="4" style="vertical-align:top;">
        <div class="sigBox">
          ${hasFirma ? `<img src="${firmaClienteBase64}" class="sigImg" />` : ''}
        </div>

        <div class="metaRow">
          <span class="metaLabel">NOMBRE:</span>
          <span class="metaValue">${escapeHtml(nombreClienteFirma || '')}</span>
        </div>

        <div class="metaRow">
          <span class="metaLabel">CARGO:</span>
          <span class="metaValue">${escapeHtml(cargoClienteFirma || '')}</span>
        </div>
      </td>
    </tr>
  </table>

  <p style="font-size:6px; margin-top:6px">TEL-GMA-FRT-003.3</p>
</body>
</html>`;
}



// ================== Pantalla ==================
export default function MantElevadores() {
  const params = useLocalSearchParams();

  const orderidRaw = params?.orderid ?? params?.id;
  const orderid = String(orderidRaw ?? '').trim();

  const [datos, setDatos] = useState(() => ({
    Orderid: params?.orderid ? String(params.orderid) : (params?.id ? String(params.id) : undefined),
    equipment: params?.equipment ? String(params.equipment) : undefined,
    tecnico_nombre: params?.tecnico_nombre ? String(params.tecnico_nombre) : undefined,
    Name1: params?.Name1 ? String(params.Name1) : undefined,
    Name2: params?.Name2 ? String(params.Name2) : undefined,
    cliente: params?.cliente ? String(params.cliente) : undefined,
    direccion: params?.direccion ? String(params.direccion) : undefined,
  }));

  const [loading, setLoading] = useState(false);

  const [pisos, setPisos] = useState(6);
  const [top, setTop] = useState({});
  const [subsel, setSubsel] = useState({});
  const setIn = (setter, map, key, val) => setter({ ...map, [key]: val });

  const fecha = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }, []);

  const horaEntrada = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  const [niveles, setNiveles] = useState('');
  const [avisoCliente, setAvisoCliente] = useState('');
  const [detalleTrabajo, setDetalleTrabajo] = useState('');
  const [notas, setNotas] = useState('');
  const [refacciones, setRefacciones] = useState([{ cantidad: '', descripcion: '', conCargo: false, codigo: '' }]);

  // ✅ Firma cliente
  const [firmaOpen, setFirmaOpen] = useState(false);
  const [firmaClienteBase64, setFirmaClienteBase64] = useState('');
  const [nombreClienteFirma, setNombreClienteFirma] = useState('');
  const [cargoClienteFirma, setCargoClienteFirma] = useState('');

  // ✅ Fetch SOLO si faltan datos
  useEffect(() => {
    let alive = true;

    const tengoDatosMinimos = !!(
      datos?.Orderid &&
      datos?.equipment &&
      (datos?.tecnico_nombre || datos?.Name1 || datos?.Name2)
    );

    if (!orderid || tengoDatosMinimos) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const d = await fetchDatosMantenimiento(orderid);
        if (!alive) return;
        setDatos(prev => ({ ...(prev || {}), ...(d || {}) }));
      } catch (e) {
        const tengoAlgo = !!(datos?.Orderid || datos?.equipment || datos?.tecnico_nombre || datos?.Name1 || datos?.Name2);
        if (!tengoAlgo) {
          Alert.alert('Aviso', 'No se pudo cargar desde servidor. Se mostrará lo disponible.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderid]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState({ type: 'T', name: '' });

  const openModal = (type, name) => { setModalKey({ type, name }); setModalOpen(true); };

  const applyModal = (vals) => {
    if (modalKey.type === 'T') setIn(setTop, top, modalKey.name, vals);
    else setIn(setSubsel, subsel, modalKey.name, vals);
  };

  const onGuardar = async () => {
  if (!datos?.Orderid) {
    Alert.alert('Error', 'No hay Orderid para guardar.');
    return;
  }

  const d = new Date();
  const horaSalida = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const payload = {
    orderid: datos.Orderid,
    equipment: datos.equipment,
    tecnico: datos.tecnico_nombre,
    cliente: `${datos.Name1 ?? ''} ${datos.Name2 ?? ''}`.trim(),
    fecha,
    hora_entrada: horaEntrada,
    hora_salida: horaSalida,
    pisos,
    bloques: { tablaTop: top, subconjuntos: subsel },
    niveles: niveles ? Number(niveles) : null,
    aviso_cliente: avisoCliente,
    detalle_trabajo: detalleTrabajo,
    notas,
    refacciones: refacciones.filter(r => r.cantidad || r.descripcion || r.codigo),
  };

  try {
  
    // 🟢 2) Construye el HTML del PDF
    const html = await buildPdfHtmlElevadores({
      ...payload,
      firmaClienteBase64,
      nombreClienteFirma,
      cargoClienteFirma,
    });

    // 🟢 3) Genera el PDF y abre para ver/guardar/compartir
    const pdfUri = await generarYCompartirPdf(
      html,
      "mantenimiento_elevadores.pdf"
    );

    // 🟢 4) Envía el PDF a SAP como adjunto
    await subirPdfMantElevadoresASap({
      orderid: datos.Orderid,
      pdfUri,
    });

    Alert.alert(
      "Listo",
      `PDF generado, visible para el usuario y enviado a SAP (orden ${datos.Orderid}).`,
      [{ text: "OK", onPress: () => router.back() }]
    );

  } catch (e) {
    console.error(e);
    Alert.alert('Error', 'No se pudo guardar / generar el PDF / enviar a SAP.');
  }
};


  if (loading && !datos?.Orderid) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!datos) return <View style={styles.center}><Text>No hay datos.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Mantenimiento de Elevadores" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 220 }}>
        <View style={styles.card}>
          <Text style={styles.h1}>{`${datos.Name1 ?? ''} ${datos.Name2 ?? ''}`.trim()}</Text>

          <View style={styles.pillsRow}>
            <View style={styles.pill}><Text style={styles.pillText}>MX: {datos.Orderid ?? '—'}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Equipo: {datos.equipment ?? '—'}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Técnico: {datos.tecnico_nombre ?? '—'}</Text></View>
          </View>

          <View style={styles.pillsRow}>
            <View style={styles.pill}><Text style={styles.pillText}>Fecha: {fecha}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Entrada: {horaEntrada}</Text></View>

            <View style={styles.pill}>
              <Text style={styles.pillText}>Pisos:</Text>
              <TextInput style={styles.pillInput} keyboardType="numeric" value={String(pisos)} editable={false} />
            </View>

            <View style={styles.pill}>
              <Text style={styles.pillText}>Niveles:</Text>
              <TextInput style={styles.pillInput} keyboardType="numeric" value={niveles} onChangeText={setNiveles} />
            </View>
          </View>
        </View>

        <Text style={styles.section}>Bloque superior</Text>
        <View style={styles.card}>
          <View style={styles.grid2}>
            {BLOQUE_TOP.map(a => (
              <CardItem key={a} title={a} count={(top[a] || []).length} onPress={() => openModal('T', a)} />
            ))}
          </View>
        </View>

        <Text style={styles.section}>Subconjuntos</Text>
        <View style={styles.card}>
          {SUBCONJUNTOS.map(group => (
            <CollapsibleGroup key={group.titulo} title={group.titulo}>
              <View style={styles.grid2}>
                {group.items.map(it => (
                  <CardItem key={it} title={it} count={(subsel[it] || []).length} onPress={() => openModal('S', it)} />
                ))}
              </View>
            </CollapsibleGroup>
          ))}
        </View>

        <Text style={styles.section}>Aviso al cliente</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, styles.tarea]}
            placeholder="Escribe el aviso..."
            value={avisoCliente}
            onChangeText={setAvisoCliente}
            multiline
          />
        </View>

        <Text style={styles.section}>Detalle de trabajo</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, styles.tarea]}
            placeholder="Describe el trabajo realizado..."
            value={detalleTrabajo}
            onChangeText={setDetalleTrabajo}
            multiline
          />
        </View>

        <Text style={styles.section}>Refacciones</Text>
        <View style={styles.card}>
          {refacciones.map((r, i) => (
            <View key={`ref-${i}`} style={{ marginTop: i ? 10 : 0 }}>
              <View style={styles.rowGap}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Cantidad</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={r.cantidad}
                    onChangeText={(v) => patchArr(setRefacciones, refacciones, i, { cantidad: v })}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.smallLabel}>Descripción</Text>
                  <TextInput
                    style={styles.input}
                    value={r.descripcion}
                    onChangeText={(v) => patchArr(setRefacciones, refacciones, i, { descripcion: v })}
                  />
                </View>
              </View>

              <View style={[styles.rowGap, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Con cargo al cliente (SI/NO)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="SI o NO"
                    value={r.conCargo ? 'SI' : 'NO'}
                    onChangeText={(v) =>
                      patchArr(setRefacciones, refacciones, i, {
                        conCargo: (v || '').trim().toUpperCase() === 'SI',
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Código interno</Text>
                  <TextInput
                    style={styles.input}
                    value={r.codigo}
                    onChangeText={(v) => patchArr(setRefacciones, refacciones, i, { codigo: v })}
                  />
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity
            onPress={() => setRefacciones([...refacciones, { cantidad: '', descripcion: '', conCargo: false, codigo: '' }])}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+ Agregar refacción</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Notas</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, styles.tarea]}
            placeholder="Notas adicionales..."
            value={notas}
            onChangeText={setNotas}
            multiline
          />
        </View>

        {/* ✅ Firma del cliente */}
        <Text style={styles.section}>Firma del cliente</Text>
        <View style={styles.card}>
          <Text style={styles.smallHint}>Captura la firma del cliente antes de generar el PDF.</Text>

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Juan Pérez"
            value={nombreClienteFirma}
            onChangeText={setNombreClienteFirma}
          />

          <Text style={[styles.smallLabel, { marginTop: 10 }]}>Cargo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Encargado de mantenimiento"
            value={cargoClienteFirma}
            onChangeText={setCargoClienteFirma}
          />

          <Pressable
            onPress={() => setFirmaOpen(true)}
            style={({ pressed }) => [
              styles.signCard,
              pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.signIconCircle}>
                <Text style={{ fontSize: 16 }}>✍️</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.signTitle}>
                  {firmaClienteBase64 ? 'Firma capturada' : 'Firma aquí'}
                </Text>

                <Text style={styles.signSubtitle}>
                  {firmaClienteBase64
                    ? 'Toca para ver o volver a firmar.'
                    : 'Toca para abrir el recuadro y firmar con el dedo.'}
                </Text>
              </View>

              <Text style={styles.signAction}>
                {firmaClienteBase64 ? 'Re-firmar' : 'Firmar'}
              </Text>
            </View>

            {firmaClienteBase64 ? (
              <View style={styles.signaturePreviewBox}>
                <Text style={styles.previewLabel}>Vista previa:</Text>
                <View style={styles.previewCanvas}>
                  <Image
                    source={{ uri: firmaClienteBase64 }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.signTip}>💡 Tip: Si te equivocas, dentro del recuadro presiona “Limpiar”.</Text>
            )}
          </Pressable>

          {firmaClienteBase64 ? (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Quitar firma', '¿Quieres borrar la firma capturada?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Borrar', style: 'destructive', onPress: () => setFirmaClienteBase64('') },
                ]);
              }}
              style={styles.clearSignatureBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.clearSignatureText}>🧽 Quitar firma</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.warnText}>* Si no capturas firma, el PDF saldrá sin firma.</Text>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={onGuardar}>
        <Text style={styles.fabText}>Guardar + PDF</Text>
      </TouchableOpacity>

      <FloorSelectModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        floors={pisos}
        value={modalKey.type === 'T' ? (top[modalKey.name] || []) : (subsel[modalKey.name] || [])}
        onChange={applyModal}
      />

      {/* ✅ Modal Firma */}
      <Modal visible={firmaOpen} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.signModalHeader}>
            <TouchableOpacity onPress={() => setFirmaOpen(false)} activeOpacity={0.8}>
              <Text style={styles.signModalLink}>Cerrar</Text>
            </TouchableOpacity>

            <View style={{ alignItems: 'center' }}>
              <Text style={styles.signModalTitle}>Firma del cliente</Text>
              <Text style={styles.signModalSubtitle}>Firma dentro del recuadro</Text>
            </View>

            <Text style={[styles.signModalLink, { opacity: 0 }]}>Cerrar</Text>
          </View>

          <View style={styles.signInstructions}>
            <Text style={styles.signInstructionText}>1) Firma con el dedo ✍️</Text>
            <Text style={styles.signInstructionText}>2) Si te equivocas, presiona “Limpiar”</Text>
            <Text style={styles.signInstructionText}>3) Presiona “Guardar firma” para continuar ✅</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Signature
              onOK={(sig) => {
                setFirmaClienteBase64(sig); // data:image/png;base64,...
                setFirmaOpen(false);
              }}
              onEmpty={() => Alert.alert('Aviso', 'Firma vacía. Firma dentro del recuadro.')}
              descriptionText="✍️ Firma aquí (dentro del recuadro)"
              clearText="Limpiar"
              confirmText="Guardar firma"
              webStyle={`
                .m-signature-pad { box-shadow: none; border: none; }
                .m-signature-pad--body { border: 2px dashed #0A84FF; border-radius: 12px; }
                .m-signature-pad--footer { display:flex; gap: 12px; justify-content: space-between; padding: 12px; }
                button { font-size: 16px !important; padding: 10px 14px !important; border-radius: 10px !important; }
              `}
            />
          </View>

          <View style={styles.signFooterHelp}>
            <Text style={styles.signFooterHelpText}>
              Tip: Firma lo más centrado posible para que se vea bien en el PDF.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function patchArr(setter, arr, index, patch) {
  const next = [...arr];
  next[index] = { ...next[index], ...patch };
  setter(next);
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 6 },
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F5F7FB',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pillText: { color: '#111827', fontWeight: '700' },
  pillInput: {
    minWidth: 60,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    color: '#111827',
  },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cardItem: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  cardItemTitle: { fontWeight: '800', color: '#111827', minHeight: 40 },
  cardItemLink: { color: '#0A84FF', fontWeight: '900', marginTop: 8 },
  badge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  badgeOn: { backgroundColor: '#111827' },
  badgeText: { color: '#111827', fontWeight: '900' },
  badgeTextOn: { color: '#fff', fontWeight: '900' },
  group: { marginBottom: 8 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  groupTitle: { fontWeight: '900', color: '#111827' },
  groupToggle: { color: '#0A84FF', fontWeight: '900' },
  rowGap: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#111827',
  },
  smallLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  addBtn: { marginTop: 10 },
  addBtnText: { color: '#0A84FF', fontWeight: '800' },
  tarea: { height: 110, textAlignVertical: 'top' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 92,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  // ===== Firma UX =====
  smallHint: { color: '#6b7280', fontSize: 12, lineHeight: 16 },
  warnText: { marginTop: 10, color: '#6b7280', fontSize: 12 },

  signCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
  },
  signIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signTitle: { fontSize: 14, fontWeight: '900', color: '#111827' },
  signSubtitle: { marginTop: 2, fontSize: 12, color: '#374151' },
  signAction: { color: '#0A84FF', fontWeight: '900' },
  signTip: { marginTop: 10, color: '#4b5563', fontSize: 12, lineHeight: 16 },

  signaturePreviewBox: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewLabel: { fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: '800' },
  previewCanvas: {
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    overflow: 'hidden',
  },

  clearSignatureBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff1f2',
    alignItems: 'center',
  },
  clearSignatureText: { color: '#b91c1c', fontWeight: '900' },

  signModalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  signModalTitle: { fontWeight: '900', fontSize: 16, color: '#111827' },
  signModalSubtitle: { marginTop: 2, fontSize: 12, color: '#6b7280', fontWeight: '700' },
  signModalLink: { color: '#0A84FF', fontWeight: '900', fontSize: 14 },

  signInstructions: { padding: 12, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  signInstructionText: { fontSize: 12, color: '#374151', fontWeight: '700', marginBottom: 4 },

  signFooterHelp: { padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  signFooterHelpText: { fontSize: 12, color: '#6b7280', textAlign: 'center', fontWeight: '700' },
});
