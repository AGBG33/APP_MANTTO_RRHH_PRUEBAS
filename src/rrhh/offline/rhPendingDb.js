// src/rrhh/offline/rhPendingDb.js
// PASO 5 - Estructura de pendientes de RRHH (sin enviar nada a SAP).
// Usa exclusivamente rrhh_offline.db a traves de rhOfflineDb.js.
// NO usa src/offline/db.js, sapQueue, outbox ni OfflineProvider de mantenimiento.
//
// AUN NO CONECTAR ESTE MODULO A LA PANTALLA DE ASISTENCIA.
// El campo payload_protegido se reserva para una carga cifrada; la fase de
// cifrado/captura se implementara y probara ANTES de guardar datos reales.
// SQLite normal NO cifra automaticamente esta base.

import { iniciarBaseRHHOffline, claveUsuarioRH } from "./rhOfflineDb";

const TIPOS = new Set(["P10", "P15", "P25", "P20"]);
const ESTADOS = new Set([
  "pendiente", "enviando", "incierto", "confirmado", "rechazado", "revision",
]);

// No reintentar automaticamente un envio incierto: puede haber llegado a SAP.
const TRANSICIONES = {
  pendiente: new Set(["enviando", "revision", "confirmado"]),
  enviando: new Set(["confirmado", "incierto", "rechazado", "revision"]),
  incierto: new Set(["confirmado", "revision"]),
  revision: new Set(["confirmado", "rechazado"]),
  rechazado: new Set(["revision", "confirmado"]),
  confirmado: new Set(),
};

let tablaPromise = null;

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() + 1 === mes &&
    f.getUTCDate() === dia;
}

function horaValida(valor) {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(String(valor || ""));
}

function tipoValido(tipo) {
  const valor = String(tipo || "").toUpperCase();
  if (!TIPOS.has(valor)) throw Error("RRHH offline: tipo de marcacion invalido.");
  return valor;
}

function idMarcacion(usuario, fechaJornada, tipo) {
  // Una sola marcacion del mismo tipo por jornada y empleado.
  // Es una clave LOCAL anti-duplicados; SAP/BTP requieren su propia idempotencia.
  return `${usuario}|${fechaJornada}|${tipo}`;
}

function parsearFila(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    fechaJornada: fila.fecha_jornada,
    fechaMarcacion: fila.fecha_marcacion,
    horaMarcacion: fila.hora_marcacion,
    tipo: fila.tipo,
    estado: fila.estado,
    intentos: Number(fila.intentos) || 0,
    creadoEn: Number(fila.creado_en),
    actualizadoEn: Number(fila.actualizado_en),
    ultimoError: fila.ultimo_error || "",
    // Deliberadamente no devolvemos el payload cifrado en listados de UI.
  };
}

export async function iniciarColaPendientesRH() {
  if (!tablaPromise) {
    tablaPromise = (async () => {
      const db = await iniciarBaseRHHOffline();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS rh_marcaciones_pendientes (
          id TEXT PRIMARY KEY NOT NULL,
          usuario_clave TEXT NOT NULL,
          fecha_jornada TEXT NOT NULL,
          fecha_marcacion TEXT NOT NULL,
          hora_marcacion TEXT NOT NULL,
          tipo TEXT NOT NULL,
          payload_protegido TEXT NOT NULL,
          estado TEXT NOT NULL,
          intentos INTEGER NOT NULL DEFAULT 0,
          creado_en INTEGER NOT NULL,
          actualizado_en INTEGER NOT NULL,
          ultimo_error TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_rh_pendientes_usuario_estado
          ON rh_marcaciones_pendientes (usuario_clave, estado, creado_en);
      `);
      return db;
    })().catch(e => {
      tablaPromise = null;
      throw e;
    });
  }
  return tablaPromise;
}

/**
 * Uso FUTURO, despues de incorporar cifrado y captura GPS offline.
 * payloadProtegido debera contener el payload ORIGINAL cifrado (fecha/hora,
 * ubicacion y datos de SAP), no JSON en texto claro.
 *
 * La funcion no envia nada; INSERT OR IGNORE evita sobrescribir una marcacion
 * previa. No llamar aun desde asistencia.js.
 */
export async function guardarMarcacionPendienteRH({
  personalNumber, email, fechaJornada, fechaMarcacion, horaMarcacion,
  registerType, payloadProtegido,
}) {
  const usuario = claveUsuarioRH(personalNumber, email);
  if (!fechaValida(fechaJornada) || !fechaValida(fechaMarcacion) ||
      !horaValida(horaMarcacion)) {
    throw Error("RRHH offline: fecha u hora original invalida.");
  }
  const tipo = tipoValido(registerType);
  if (typeof payloadProtegido !== "string" || !payloadProtegido.startsWith("enc:v1:") ||
      payloadProtegido.length <= "enc:v1:".length) {
    throw Error("RRHH offline: falta el payload cifrado; no se guardara informacion sensible en claro.");
  }
  const db = await iniciarColaPendientesRH();
  const id = idMarcacion(usuario, fechaJornada, tipo);
  const ahora = Date.now();
  const resultado = await db.runAsync(`
    INSERT OR IGNORE INTO rh_marcaciones_pendientes
      (id, usuario_clave, fecha_jornada, fecha_marcacion, hora_marcacion,
       tipo, payload_protegido, estado, intentos, creado_en, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', 0, ?, ?)
  `, [id, usuario, fechaJornada, fechaMarcacion, horaMarcacion,
      tipo, payloadProtegido, ahora, ahora]);

  // No afirmar un nuevo guardado si ya existe: nunca cambiar el payload original.
  const fila = await db.getFirstAsync(`
    SELECT * FROM rh_marcaciones_pendientes WHERE id = ? AND usuario_clave = ?
  `, [id, usuario]);
  if (!fila) throw Error("RRHH offline: no se pudo comprobar el guardado.");
  return { ...parsearFila(fila), yaExistia: resultado.changes === 0 };
}

export async function listarMarcacionesPendientesRH({ personalNumber, email }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const db = await iniciarColaPendientesRH();
  const filas = await db.getAllAsync(`
    SELECT id, fecha_jornada, fecha_marcacion, hora_marcacion, tipo,
           estado, intentos, creado_en, actualizado_en, ultimo_error
    FROM rh_marcaciones_pendientes
    WHERE usuario_clave = ?
    ORDER BY fecha_jornada ASC, hora_marcacion ASC
  `, [usuario]);
  return filas.map(parsearFila);
}

// La lectura del payload protegido quedara reservada al futuro servicio
// de sincronizacion, que debera descifrarlo en memoria y validar identidad.
export async function leerMarcacionProtegidaRH({ personalNumber, email, id }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const db = await iniciarColaPendientesRH();
  const fila = await db.getFirstAsync(`
    SELECT * FROM rh_marcaciones_pendientes WHERE id = ? AND usuario_clave = ?
  `, [String(id || ""), usuario]);
  if (!fila) return null;
  return { ...parsearFila(fila), payloadProtegido: fila.payload_protegido };
}

/**
 * FUTURO: la sincronizacion cambiara estados solo despues de verificar SAP.
 * "incierto" NUNCA regresa a "pendiente" automaticamente.
 */
export async function cambiarEstadoMarcacionRH({
  personalNumber, email, id, nuevoEstado, error = "",
}) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const destino = String(nuevoEstado || "");
  if (!ESTADOS.has(destino)) throw Error("RRHH offline: estado invalido.");
  const db = await iniciarColaPendientesRH();
  const fila = await db.getFirstAsync(`
    SELECT estado FROM rh_marcaciones_pendientes WHERE id = ? AND usuario_clave = ?
  `, [String(id || ""), usuario]);
  if (!fila) throw Error("RRHH offline: marcacion no encontrada para el usuario.");
  if (!TRANSICIONES[fila.estado]?.has(destino)) {
    throw Error(`RRHH offline: transicion no permitida: ${fila.estado} -> ${destino}.`);
  }
  const resultado = await db.runAsync(`
    UPDATE rh_marcaciones_pendientes
    SET estado = ?, actualizado_en = ?, ultimo_error = ?,
        intentos = intentos + CASE WHEN ? = 'enviando' THEN 1 ELSE 0 END
    WHERE id = ? AND usuario_clave = ? AND estado = ?
  `, [destino, Date.now(), String(error || "").slice(0, 350), destino,
      String(id || ""), usuario, fila.estado]);
  if (resultado.changes !== 1) {
    throw Error("RRHH offline: otra operacion actualizo la marcacion; volver a consultar.");
  }
  return true;
}

// Tras reiniciar la app, una fila en "enviando" se considera "incierta":
// la peticion pudo haber llegado a SAP antes del cierre. No se reenvia sola.
export async function marcarEnviosInterrumpidosComoInciertosRH({ personalNumber, email }) {
  const usuario = claveUsuarioRH(personalNumber, email);
  const db = await iniciarColaPendientesRH();
  const resultado = await db.runAsync(`
    UPDATE rh_marcaciones_pendientes
    SET estado = 'incierto', actualizado_en = ?,
        ultimo_error = 'Envio interrumpido: requiere conciliacion previa con SAP.'
    WHERE usuario_clave = ? AND estado = 'enviando'
  `, [Date.now(), usuario]);
  return resultado.changes;
}