// RRHH - planificación PURA de avisos locales, sin consultar SAP ni hacer POST.
// Los avisos son únicos por fecha y hora; NO hay un trigger repetitivo.
// EmployeeSet define el turno y los horarios de comida.
import {
  clasificarEmpleadoRH,
  obtenerTurnoDelDia,
  obtenerHorarioComidaRH,
  hoyISO,
} from "../services/rhPolicies.js"

export const RH_DIAS_PROGRAMADOS = 7;
export const RH_ANTICIPACION_MINUTOS = Object.freeze({ P10: 15, P15: 10, P25: 15, P20: 10 });

const MINUTO = 60 * 1000;
const MARGEN_PROGRAMACION = 2 * MINUTO;
const pad = n => String(n).padStart(2, '0');
const hora = ms => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const marca = (fecha, tipo) => `${fecha}|${tipo}`;

// No inventar ventanas: el intervalo debe quedar íntegramente dentro del turno.
// En jornadas nocturnas la ventana puede estar al día siguiente.
function ventanaComidaEnTurno(turno, comida) {
  if (!turno?.valido || !comida?.valido) return null;
  const inicioDia = new Date(turno.inicioMs);
  inicioDia.setHours(0, 0, 0, 0);
  for (const incremento of [0, 1]) {
    const d = new Date(inicioDia);
    d.setDate(d.getDate() + incremento);
    const inicio = d.getTime() + comida.inicioSeg * 1000;
    const fin = d.getTime() + comida.finSeg * 1000;
    if (inicio >= turno.inicioMs && fin <= turno.finMs && fin > inicio) return { inicio, fin };
  }
  return null;
}

/**
 * Marcaciones: Set con claves YYYY-MM-DD|P10/P15/P25/P20 (SAP, cola o acuse local).
 * Inicio real de comida: Map<YYYY-MM-DD, timestamp en milisegundos>.
 * El mapa solo se llena tras guardar efectivamente P15; NUNCA se anticipa su hora.
 */
export function crearPlanRecordatoriosRH({
  empleado,
  ahora = new Date(),
  marcacionesExistentes = new Set(),
  inicioComidaPorJornada = new Map(),
  diasNoLaborablesSAP = new Set(),
  diasSoloEntrada = new Set(),
  dias = RH_DIAS_PROGRAMADOS,
} = {}) {
  if (!(ahora instanceof Date) || !Number.isFinite(ahora.getTime())) return [];
  if (!empleado || empleado.numeroConfirmadoEnSAP !== true) return [];
  const p = clasificarEmpleadoRH(empleado);
  if (!p.habilitado || !empleado.scheduleDetail) return [];
  if (!Number.isInteger(dias) || dias < 1 || dias > RH_DIAS_PROGRAMADOS) return [];

  const comida = p.confianza ? obtenerHorarioComidaRH(empleado) : null;
  const registros = [];
  const vistos = new Set();
  const umbral = ahora.getTime() + MARGEN_PROGRAMACION;

  function agregar(fecha, tipo, cuandoMs, titulo, mensaje) {
    if (marcacionesExistentes.has(marca(fecha, tipo))) return;
    if (!Number.isFinite(cuandoMs) || cuandoMs <= umbral) return;
    const clave = `${fecha}|${tipo}|${Math.round(cuandoMs)}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    registros.push({ fechaJornada: fecha, tipo, cuando: new Date(cuandoMs), titulo, mensaje });
  }

  for (let n = 0; n < dias; n++) {
    const fechaBase = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + n, 12);
    const fecha = hoyISO(fechaBase);
    if (diasNoLaborablesSAP.has(fecha)) continue;
    const turno = obtenerTurnoDelDia(empleado.scheduleDetail, fechaBase);
    if (!turno?.valido || turno.fechaJornada !== fecha) continue;

    // P10: 15 antes, a la entrada y 5 min después (5 antes del fin de tolerancia).
    for (const [desfase, etiqueta] of [
      [-15, '15 minutos antes'], [0, 'hora de entrada'], [5, 'últimos 5 minutos de tolerancia'],
    ]) {
      agregar(fecha, 'P10', turno.inicioMs + desfase * MINUTO,
        'Recordatorio de entrada',
        `Tu entrada es a las ${hora(turno.inicioMs)} (${etiqueta}). Si no has registrado P10, realiza tu check.`);
    }

    if (p.relacion?.viaje || diasSoloEntrada.has(fecha)) continue;

    if (p.confianza) {
      const ventana = ventanaComidaEnTurno(turno, comida);
      if (ventana) {
        // P15: uno antes y tres DENTRO de la ventana. No se programan a intervalos infinitos.
        const duracion = ventana.fin - ventana.inicio;
        const posiciones = [-10 * MINUTO, 0, duracion / 3, 2 * duracion / 3];
        for (let i = 0; i < posiciones.length; i++) {
          const cuando = ventana.inicio + posiciones[i];
          if (i > 0 && cuando > ventana.fin - MINUTO) continue;
          agregar(fecha, 'P15', cuando, 'Recordatorio de inicio de comida',
            `Tu horario de comida es ${hora(ventana.inicio)}–${hora(ventana.fin)}. Si aún no lo hiciste, registra tu inicio de comida.`);
        }

        // P25 solo DESPUÉS de registrar realmente P15, no al comienzo del día.
        if (marcacionesExistentes.has(marca(fecha, 'P15')) &&
            !marcacionesExistentes.has(marca(fecha, 'P25'))) {
          const inicioReal = Number(inicioComidaPorJornada.get(fecha));
          if (Number.isFinite(inicioReal) && inicioReal >= ventana.inicio && inicioReal <= ventana.fin) {
            // TimeFood es REFERENCIA para avisos, NUNCA un bloqueo del check P25.
            // Sin TimeFood válido, usar únicamente el fin de la ventana SAP.
            const conDuracion = Number.isFinite(comida.duracionMin) && comida.duracionMin > 0;
            const finOrientativo = conDuracion ? inicioReal + comida.duracionMin * MINUTO : ventana.fin;
            const objetivo = Math.min(finOrientativo, ventana.fin);
            if (objetivo > inicioReal) {
              for (const antes of [15, 5, 0]) {
                const cuando = objetivo - antes * MINUTO;
                if (cuando <= inicioReal || cuando < ventana.inicio || cuando > ventana.fin) continue;
                agregar(fecha, 'P25', cuando, 'Recordatorio de regreso de comida',
                  conDuracion && finOrientativo <= ventana.fin
                    ? `Tu tiempo de comida de referencia termina a las ${hora(objetivo)}. Si no has registrado P25, realiza tu regreso.`
                    : `Tu horario de comida termina a las ${hora(ventana.fin)}. Si aún no lo hiciste, registra tu regreso de comida.`);
              }
            }
          }
        }
      }
    }

    // P20: 10 antes, al final del turno y 10 después; una salida anticipada cancela los tres.
    for (const minutos of [-10, 0, 10]) {
      agregar(fecha, 'P20', turno.finMs + minutos * MINUTO,
        'Recordatorio de salida',
        `Tu salida programada es a las ${hora(turno.finMs)}. Si no registraste P20 (normal o anticipada), realiza tu check.`);
    }
  }

  return registros.sort((a, b) => a.cuando - b.cuando || a.tipo.localeCompare(b.tipo));
}