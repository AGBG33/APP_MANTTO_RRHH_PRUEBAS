// src/rrhh/offline/rhDelaysCache.js
// Cache mensual de ProcessingDelaysSet + bloqueo local del 4.º retardo.
// Solo totales y metadatos, sin GPS, tokens ni justificantes.
// Usa exclusivamente rrhh_offline.db. La cola SAP se mantiene separada.
import { iniciarBaseRHHOffline, claveUsuarioRH } from "./rhOfflineDb";
import { periodoRetardosRH } from "../../services/rhDelays";

const MAX_EDAD_MS = 24 * 60 * 60 * 1000;
const TOLERANCIA_RELOJ_MS = __DEV__ ? 72 * 60 * 60 * 1000 : 5 * 60 * 1000;
let tablasPromise = null;

async function tablas() {
  if (!tablasPromise) {
    tablasPromise = (async () => {
      const db = await iniciarBaseRHHOffline();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS rh_retardos_mes (
          usuario_clave TEXT NOT NULL,
          periodo TEXT NOT NULL,
          total_retardos INTEGER NOT NULL,
          total_inasistencias INTEGER NOT NULL,
          ultima_fecha_sap TEXT NOT NULL DEFAULT '',
          ultima_hora_sap TEXT NOT NULL DEFAULT '',
          guardado_en INTEGER NOT NULL,
          PRIMARY KEY (usuario_clave, periodo)
        );
        CREATE TABLE IF NOT EXISTS rh_cuarto_retardo_jornada (
          usuario_clave TEXT NOT NULL,
          fecha_jornada TEXT NOT NULL,
          total_previo INTEGER NOT NULL,
          creado_en INTEGER NOT NULL,
          PRIMARY KEY (usuario_clave, fecha_jornada)
        );
      `);
      return db;
    })().catch(err => { tablasPromise = null; throw err; });
  }
  return tablasPromise;
}

export async function guardarRetardosRHCache({ personalNumber, email, fechaJornada, resumen }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const { periodo } = periodoRetardosRH(fechaJornada);
  if (resumen?.periodo !== periodo ||
      !Number.isSafeInteger(resumen?.totalDelays) || resumen.totalDelays < 0 ||
      !Number.isSafeInteger(resumen?.totalAbsences) || resumen.totalAbsences < 0) {
    throw Error("RRHH offline: el total mensual no coincide con el período consultado.");
  }
  const db = await tablas();
  const guardadoEn = Date.now();
  await db.runAsync(`
    INSERT INTO rh_retardos_mes (usuario_clave, periodo, total_retardos,
      total_inasistencias, ultima_fecha_sap, ultima_hora_sap, guardado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(usuario_clave, periodo) DO UPDATE SET
      total_retardos = excluded.total_retardos,
      total_inasistencias = excluded.total_inasistencias,
      ultima_fecha_sap = excluded.ultima_fecha_sap,
      ultima_hora_sap = excluded.ultima_hora_sap,
      guardado_en = excluded.guardado_en
    WHERE excluded.guardado_en >= rh_retardos_mes.guardado_en
  `, [usuario, periodo, resumen.totalDelays, resumen.totalAbsences,
      resumen.lastUpdate || "", resumen.lastHourUpdate || "", guardadoEn]);
  return guardadoEn;
}

export async function leerRetardosRHCache({ personalNumber, email, fechaJornada }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const { periodo } = periodoRetardosRH(fechaJornada);
  const db = await tablas();
  const fila = await db.getFirstAsync(`
    SELECT periodo, total_retardos, total_inasistencias, ultima_fecha_sap,
      ultima_hora_sap, guardado_en
    FROM rh_retardos_mes WHERE usuario_clave = ? AND periodo = ?
  `, [usuario, periodo]);
  if (!fila) return null;
  const totalDelays = Number(fila.total_retardos);
  const totalAbsences = Number(fila.total_inasistencias);
  const guardadoEn = Number(fila.guardado_en);
  const antiguedad = Date.now() - guardadoEn;
  return {
    periodo, totalDelays, totalAbsences, guardadoEn,
    lastUpdate: fila.ultima_fecha_sap, lastHourUpdate: fila.ultima_hora_sap,
    vigente: Number.isSafeInteger(totalDelays) && totalDelays >= 0 &&
      Number.isSafeInteger(totalAbsences) && totalAbsences >= 0 &&
      antiguedad >= -TOLERANCIA_RELOJ_MS && antiguedad <= MAX_EDAD_MS,
  };
}

export async function guardarCuartoRetardoRH({ personalNumber, email, fechaJornada, totalPrevio }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  periodoRetardosRH(fechaJornada);
  if (!Number.isSafeInteger(totalPrevio) || totalPrevio < 0 || totalPrevio % 4 !== 3) {
    throw Error("RRHH offline: intento de bloqueo sin un tercer retardo del ciclo.");
  }
  const db = await tablas();
  await db.runAsync(`
    INSERT OR IGNORE INTO rh_cuarto_retardo_jornada
      (usuario_clave, fecha_jornada, total_previo, creado_en)
    VALUES (?, ?, ?, ?)
  `, [usuario, fechaJornada, totalPrevio, Date.now()]);
  return true;
}

export async function leerCuartoRetardoRH({ personalNumber, email, fechaJornada }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  periodoRetardosRH(fechaJornada);
  const db = await tablas();
  const fila = await db.getFirstAsync(`
    SELECT total_previo, creado_en FROM rh_cuarto_retardo_jornada
    WHERE usuario_clave = ? AND fecha_jornada = ?
  `, [usuario, fechaJornada]);
  return fila ? { cuartoRetardo: true, totalPrevio: Number(fila.total_previo),
    guardadoEn: Number(fila.creado_en) } : null;
}