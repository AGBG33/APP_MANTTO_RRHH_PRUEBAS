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

// Guardar SOLO cuando AttendanceHistorySet haya respondido correctamente.
export async function guardarHistorialRHCache({ personalNumber, email, desde, hasta, jornadas }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  validarPeriodo(desde, hasta);
  if (!Array.isArray(jornadas)) {
    throw new Error("RRHH offline: historial no es una lista.");
  }
  const nomina = nominaCanonica(personalNumber);
  const contenido = jornadas.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        nominaCanonica(item.personalNumber) !== nomina ||
        typeof item.date !== "string" || item.date < desde || item.date > hasta) {
      throw new Error("RRHH offline: historial contiene datos de otra identidad o periodo.");
    }
    return copiarCampos(item, JORNADA_PERMITIDA);
  });
  const db = await iniciarBaseRHHOffline();
  const guardadoEn = Date.now();
  await db.runAsync(`
    INSERT INTO rh_historial_cache
      (usuario_clave, fecha_desde, fecha_hasta, contenido_json, guardado_en, version)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(usuario_clave, fecha_desde, fecha_hasta) DO UPDATE SET
      contenido_json = excluded.contenido_json,
      guardado_en = excluded.guardado_en,
      version = excluded.version
  `, [usuario, desde, hasta, JSON.stringify(contenido), guardadoEn, HISTORY_VERSION]);
  return guardadoEn;
}

export async function leerHistorialRHCache({ personalNumber, email, desde, hasta }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  validarPeriodo(desde, hasta);
  const db = await iniciarBaseRHHOffline();
  const fila = await db.getFirstAsync(`
    SELECT contenido_json, guardado_en, version
    FROM rh_historial_cache
    WHERE usuario_clave = ? AND fecha_desde = ? AND fecha_hasta = ?
  `, [usuario, desde, hasta]);
  if (!fila || fila.version !== HISTORY_VERSION) return null;
  let jornadas;
  try { jornadas = JSON.parse(fila.contenido_json); }
  catch (_) { return null; }
  if (!Array.isArray(jornadas)) return null;
  const nomina = nominaCanonica(personalNumber);
  try {
    if (jornadas.some(item => !item || nominaCanonica(item.personalNumber) !== nomina ||
        typeof item.date !== "string" || item.date < desde || item.date > hasta)) return null;
  } catch (_) { return null; }
  return { jornadas, guardadoEn: Number(fila.guardado_en), origen: "cache" };
}

// Util para limpieza al cerrar sesion; NO afecta SQLite de mantenimiento.
export async function limpiarCacheUsuarioRH({ personalNumber, email }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const db = await iniciarBaseRHHOffline();
  await db.runAsync("DELETE FROM rh_perfil_cache WHERE usuario_clave = ?", [usuario]);
  await db.runAsync("DELETE FROM rh_historial_cache WHERE usuario_clave = ?", [usuario]);
}