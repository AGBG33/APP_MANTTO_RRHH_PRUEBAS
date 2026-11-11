// src/rrhh/offline/rhOfflineDb.js
// PASO 1 - Base SQLite independiente para consultas offline de RRHH.
// No se conecta a la cola de mantenimiento ni envia marcaciones a SAP.
// IMPORTANTE: SQLite no cifra este contenido por defecto. No guardar tokens,
// contrasenas, coordenadas GPS ni justificantes en estas tablas.

import * as SQLite from "expo-sqlite";

const DB_NAME = "rrhh_offline.db";
const PROFILE_VERSION = 1;
const HISTORY_VERSION = 1;
const PROFILE_RECENT_MS = 24 * 60 * 60 * 1000;

let dbPromise = null;
// Los tickets ordenan consultas simultaneas DENTRO del mismo proceso.
// No se comparan relojes del emulador, que pueden cambiar en pruebas nocturnas.
let siguienteConsulta = 0;
let escrituraEnCola = Promise.resolve();
const ultimaConsultaPorDia = new Map();
const ultimaConsultaPorRango = new Map();

export function iniciarConsultaHistorialRH() {
  siguienteConsulta += 1;
  return siguienteConsulta;
}

function fechasDelPeriodo(desde, hasta) {
  const resultado = [];
  const d = new Date(`${desde}T12:00:00.000Z`);
  const fin = new Date(`${hasta}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(fin.getTime())) {
    throw Error("RRHH offline: fechas invalidas.");
  }
  while (d <= fin && resultado.length <= 366) {
    resultado.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (!resultado.length || resultado.length > 366 || resultado[resultado.length - 1] !== hasta) {
    throw Error("RRHH offline: periodo excede 366 dias o es invalido.");
  }
  return resultado;
}


const PERFIL_PERMITIDO = [
  "personalNumber", "fullName", "email", "shift", "position", "zone",
  "hourly", "base", "centerOffice", "status", "descriptionStatus",
  "registerType", "authorisedRegister", "centerCode", "scheduleCode",
  "scheduleDetail", "role", "groupPerson", "groupPersonDescription",
  "relationJob", "relationJobDescription", "numeroConfirmadoEnSAP",
];

const JORNADA_PERMITIDA = [
  "id", "personalNumber", "date", "dayStatus", "p10Time",
  "p15Time", "p25Time", "p20Time",
];

function nominaCanonica(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,8}$/.test(raw)) {
    throw new Error("RRHH offline: numero de nomina invalido.");
  }
  return raw.padStart(8, "0");
}

function correoCanonico(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 241) {
    throw new Error("RRHH offline: correo de usuario invalido.");
  }
  return raw;
}

// La identidad debe proceder de la sesion validada, nunca de un campo libre.
export function claveUsuarioRH(personalNumber, email) {
  return `${nominaCanonica(personalNumber)}|${correoCanonico(email)}`;
}

function validarPeriodo(desde, hasta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde || "")) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(hasta || "")) || desde > hasta) {
    throw new Error("RRHH offline: periodo de historial invalido.");
  }
}

function copiarCampos(entrada, campos) {
  const resultado = {};
  for (const campo of campos) {
    if (Object.prototype.hasOwnProperty.call(entrada, campo)) {
      resultado[campo] = entrada[campo];
    }
  }
  return resultado;
}

export async function iniciarBaseRHHOffline() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS rh_perfil_cache (
          usuario_clave TEXT PRIMARY KEY NOT NULL,
          contenido_json TEXT NOT NULL,
          guardado_en INTEGER NOT NULL,
          version INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rh_historial_cache (
          usuario_clave TEXT NOT NULL,
          fecha_desde TEXT NOT NULL,
          fecha_hasta TEXT NOT NULL,
          contenido_json TEXT NOT NULL,
          guardado_en INTEGER NOT NULL,
          version INTEGER NOT NULL,
          PRIMARY KEY (usuario_clave, fecha_desde, fecha_hasta)
        );

        -- Una fila por DIA (incluso cuando SAP indica que no hubo registros).
        -- Un GET de un dia actualiza la misma fuente que se leera offline por mes.
        CREATE TABLE IF NOT EXISTS rh_historial_dias (
          usuario_clave TEXT NOT NULL,
          fecha_jornada TEXT NOT NULL,
          contenido_json TEXT NOT NULL,
          guardado_en INTEGER NOT NULL,
          PRIMARY KEY (usuario_clave, fecha_jornada)
        );
      `);
      return db;
    })().catch(error => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

// Guardar SOLO despues de una respuesta satisfactoria de EmployeeSet.
export async function guardarPerfilRHCache({ personalNumber, email, perfil }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  if (!perfil || typeof perfil !== "object" || Array.isArray(perfil)) {
    throw new Error("RRHH offline: perfil invalido.");
  }
  if (nominaCanonica(perfil.personalNumber) !== nominaCanonica(personalNumber) ||
      correoCanonico(perfil.email) !== correoCanonico(email) ||
      perfil.numeroConfirmadoEnSAP !== true) {
    throw new Error("RRHH offline: perfil no confirmado para esta identidad SAP.");
  }
  const db = await iniciarBaseRHHOffline();
  const guardadoEn = Date.now();
  const contenido = JSON.stringify(copiarCampos(perfil, PERFIL_PERMITIDO));
  await db.runAsync(`
    INSERT INTO rh_perfil_cache (usuario_clave, contenido_json, guardado_en, version)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(usuario_clave) DO UPDATE SET
      contenido_json = excluded.contenido_json,
      guardado_en = excluded.guardado_en,
      version = excluded.version
  `, [usuario, contenido, guardadoEn, PROFILE_VERSION]);
  return guardadoEn;
}

export async function leerPerfilRHCache({ personalNumber, email }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const db = await iniciarBaseRHHOffline();
  const fila = await db.getFirstAsync(
    "SELECT contenido_json, guardado_en, version FROM rh_perfil_cache WHERE usuario_clave = ?",
    [usuario]
  );
  if (!fila || fila.version !== PROFILE_VERSION) return null;
  let perfil;
  try { perfil = JSON.parse(fila.contenido_json); }
  catch (_) { return null; }
  if (!perfil || nominaCanonica(perfil.personalNumber) !== nominaCanonica(personalNumber) ||
      correoCanonico(perfil.email) !== correoCanonico(email)) return null;
  const guardadoEn = Number(fila.guardado_en);
  return {
    perfil,
    guardadoEn,
    antiguedadMs: Math.max(0, Date.now() - guardadoEn),
    reciente: Date.now() - guardadoEn <= PROFILE_RECENT_MS,
    // Un cache reciente NO equivale a una verificacion online de SAP.
  };
}

// Al iniciar offline, Azure puede proporcionar correo pero aun no la nomina.
// Esta consulta NO toma un perfil arbitrario: exige un solo resultado para
// el correo autenticado. Despues comprobaremos el vinculo de sesion.
export async function leerPerfilRHCachePorCorreo(email) {
  const correo = correoCanonico(email);
  const db = await iniciarBaseRHHOffline();
  const filas = await db.getAllAsync(`
    SELECT usuario_clave, contenido_json, guardado_en, version
    FROM rh_perfil_cache
    WHERE substr(usuario_clave, instr(usuario_clave, '|') + 1) = ?
  `, [correo]);
  if (filas.length !== 1 || filas[0].version !== PROFILE_VERSION) return null;
  const fila = filas[0];
  let perfil;
  try { perfil = JSON.parse(fila.contenido_json); }
  catch (_) { return null; }
  if (!perfil || correoCanonico(perfil.email) !== correo ||
      fila.usuario_clave !== claveUsuarioRH(perfil.personalNumber, perfil.email)) return null;
  const guardadoEn = Number(fila.guardado_en);
  return {
    perfil,
    guardadoEn,
    antiguedadMs: Math.max(0, Date.now() - guardadoEn),
    reciente: Date.now() - guardadoEn <= PROFILE_RECENT_MS,
    origen: 'cache',
  };
}

// Una respuesta SAP correcta (incluso cero jornadas) REEMPLAZA lo que se
// sabia para CADA DIA de su rango. Nunca guardar resultados parciales/errores.
// Mantenemos la tabla por rango para comprobar que se consulto TODO el mes;
// la tabla por dia es la fuente canonica de las horas, tambien en el offline.
export async function guardarHistorialRHCache({
  personalNumber, email, desde, hasta, jornadas, ticketConsulta,
}) {
  const usuario = claveUsuarioRH(personalNumber, email);
  validarPeriodo(desde, hasta);
  if (!Array.isArray(jornadas)) throw Error("RRHH offline: historial no es una lista.");
  const nomina = nominaCanonica(personalNumber);
  const fechas = fechasDelPeriodo(desde, hasta);
  const porDia = new Map();
  for (const fila of jornadas) {
    if (!fila || typeof fila !== "object" || Array.isArray(fila) ||
        nominaCanonica(fila.personalNumber) !== nomina ||
        typeof fila.date !== "string" || fila.date < desde || fila.date > hasta ||
        porDia.has(fila.date)) {
      throw Error("RRHH offline: jornada duplicada o de otro periodo/empleado.");
    }
    porDia.set(fila.date, copiarCampos(fila, JORNADA_PERMITIDA));
  }
  const ticket = Number.isSafeInteger(ticketConsulta) && ticketConsulta > 0
    ? ticketConsulta : iniciarConsultaHistorialRH();
  const guardadoEn = Date.now();
  const claveRango = `${usuario}|${desde}|${hasta}`;
  const tarea = async () => {
    const db = await iniciarBaseRHHOffline();
    const filasAplicables = fechas.filter(fecha =>
      ticket >= (ultimaConsultaPorDia.get(`${usuario}|${fecha}`) || 0));
    const escribirRango = ticket >= (ultimaConsultaPorRango.get(claveRango) || 0);
    if (!filasAplicables.length && !escribirRango) return guardadoEn;
    // Transaccion unica: los datos mensuales nunca quedan a medio guardar.
    await db.withExclusiveTransactionAsync(async tx => {
      if (escribirRango) {
        await tx.runAsync(`
          INSERT INTO rh_historial_cache
            (usuario_clave, fecha_desde, fecha_hasta, contenido_json, guardado_en, version)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(usuario_clave, fecha_desde, fecha_hasta) DO UPDATE SET
            contenido_json=excluded.contenido_json,
            guardado_en=excluded.guardado_en, version=excluded.version
        `, [usuario, desde, hasta, JSON.stringify([...porDia.values()]), guardadoEn, HISTORY_VERSION]);
      }
      for (const fecha of filasAplicables) {
        // 'null' significa "SAP consultado y sin marcacion", no "no consultado".
        await tx.runAsync(`
          INSERT INTO rh_historial_dias
            (usuario_clave, fecha_jornada, contenido_json, guardado_en)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(usuario_clave, fecha_jornada) DO UPDATE SET
            contenido_json=excluded.contenido_json,
            guardado_en=excluded.guardado_en
        `, [usuario, fecha, JSON.stringify(porDia.get(fecha) || null), guardadoEn]);
      }
    });
    if (escribirRango) ultimaConsultaPorRango.set(claveRango, ticket);
    for (const fecha of filasAplicables) ultimaConsultaPorDia.set(`${usuario}|${fecha}`, ticket);
    return guardadoEn;
  };
  // Serializar escrituras evita colisiones SQLite al guardar simultaneamente
  // desde inicio de sesion, asistencia e historial. Un fallo no bloquea las demas.
  const actual = escrituraEnCola.catch(() => {}).then(tarea);
  escrituraEnCola = actual.catch(() => {});
  return actual;
}

export async function leerHistorialRHCache({ personalNumber, email, desde, hasta }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  validarPeriodo(desde, hasta);
  const db = await iniciarBaseRHHOffline();
  // Solo lectura si existe una consulta que cubre TODO el periodo solicitado.
  // Un dato del dia no se puede presentar como mes completo.
  const base = await db.getFirstAsync(`
    SELECT contenido_json, guardado_en, version, fecha_desde, fecha_hasta
    FROM rh_historial_cache
    WHERE usuario_clave = ? AND fecha_desde <= ? AND fecha_hasta >= ?
      AND version = ?
    ORDER BY guardado_en DESC, fecha_desde DESC, fecha_hasta ASC LIMIT 1
  `, [usuario, desde, hasta, HISTORY_VERSION]);
  if (!base) return null;
  let originales;
  try { originales = JSON.parse(base.contenido_json); }
  catch (_) { return null; }
  if (!Array.isArray(originales)) return null;
  const nomina = nominaCanonica(personalNumber);
  const jornadas = new Map();
  for (const fila of originales) {
    if (!fila || nominaCanonica(fila.personalNumber) !== nomina ||
        typeof fila.date !== "string" ||
        fila.date < base.fecha_desde || fila.date > base.fecha_hasta) return null;
    if (fila.date >= desde && fila.date <= hasta) jornadas.set(fila.date, fila);
  }
  // Incluye los dias vacios: elimina de la copia mensual una salida borrada
  // que SAP ya no devuelve en una consulta posterior por dia o mes.
  const actualizadas = await db.getAllAsync(`
    SELECT fecha_jornada, contenido_json, guardado_en
    FROM rh_historial_dias
    WHERE usuario_clave = ? AND fecha_jornada >= ? AND fecha_jornada <= ?
  `, [usuario, desde, hasta]);
  for (const dia of actualizadas) {
    // La tabla diaria es canonica cuando ya existe una consulta mas reciente.
    // No comparar relojes: el usuario puede cambiar la hora del emulador.
    let fila;
    try { fila = JSON.parse(dia.contenido_json); }
    catch (_) { return null; }
    if (fila && (nominaCanonica(fila.personalNumber) !== nomina || fila.date !== dia.fecha_jornada)) return null;
    if (fila) jornadas.set(dia.fecha_jornada, fila);
    else jornadas.delete(dia.fecha_jornada);
  }
  return {
    jornadas: [...jornadas.values()].sort((a, b) => b.date.localeCompare(a.date)),
    guardadoEn: Number(base.guardado_en),
    origen: "cache",
    subrango: base.fecha_desde !== desde || base.fecha_hasta !== hasta,
  };
}

// Util para limpieza al cerrar sesion; NO afecta SQLite de mantenimiento.
export async function limpiarCacheUsuarioRH({ personalNumber, email }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const db = await iniciarBaseRHHOffline();
  await db.runAsync("DELETE FROM rh_perfil_cache WHERE usuario_clave = ?", [usuario]);
  await db.runAsync("DELETE FROM rh_historial_cache WHERE usuario_clave = ?", [usuario]);
  await db.runAsync("DELETE FROM rh_historial_dias WHERE usuario_clave = ?", [usuario]);
}