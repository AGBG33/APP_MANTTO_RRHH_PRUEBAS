// src/services/rhBusinessRules.js
// Interpretacion de estado corporativo y resumen de historial SAP.
// No crea ni modifica registros. Las decisiones finales de asistencia pertenecen a SAP.

import { obtenerTurnoDelDia } from "./rhPolicies";

const texto = valor => String(valor ?? "").trim().toUpperCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const pad = n => String(n).padStart(2, "0");
const fechaISO = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fechaLocal = iso => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export function esRetardoRH(dayStatus) {
  return texto(dayStatus) === "RETARDO";
}
export function esHomeOfficeRH(dayStatus) {
  // SAP QAS puede devolver HOME OFFICE o la forma truncada HOME OFFIC.
  const estado = texto(dayStatus);
  return estado === "HOME OFFICE" || estado === "HOME OFFIC" || estado === "HOME_OFFICE";
}
export function esInasistenciaRH(dayStatus) {
  return ["AUSENTE", "INASISTENCIA", "FALTA"].includes(texto(dayStatus));
}
export function esViajeRH(empleado) {
  const codigo = texto(empleado?.relationJob).split(" ")[0];
  return codigo === "04" || codigo === "4";
}
export function esHomeOfficeEmpleadoRH(empleado) {
  const codigo = texto(empleado?.relationJob).split(" ")[0];
  return codigo === "02" || codigo === "2";
}
export function semanaLaboralRH(fechaJornada) {
  const fecha = fechaLocal(fechaJornada);
  const desplazar = (fecha.getDay() + 6) % 7; // lunes=0, domingo=6
  const inicio = new Date(fecha);
  inicio.setDate(inicio.getDate() - desplazar);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  return { desde: fechaISO(inicio), hasta: fechaISO(fin) };
}
export function mesLaboralRH(fechaJornada) {
  const fecha = fechaLocal(fechaJornada);
  return {
    desde: fechaISO(new Date(fecha.getFullYear(), fecha.getMonth(), 1, 12)),
    hasta: fechaISO(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 12)),
  };
}
export function resumirReglasRH({ jornadasMes = [], jornadasSemana = [], fechaJornada }) {
  const mes = mesLaboralRH(fechaJornada);
  const semana = semanaLaboralRH(fechaJornada);
  const retardos = new Set();
  for (const fila of jornadasMes) {
    if (fila?.date >= mes.desde && fila.date <= mes.hasta && fila.date !== fechaJornada && esRetardoRH(fila.dayStatus)) {
      retardos.add(fila.date);
    }
  }
  const homeOfficePrevios = new Set();
  for (const fila of jornadasSemana) {
    if (fila?.date >= semana.desde && fila.date <= semana.hasta && fila.date !== fechaJornada && esHomeOfficeRH(fila.dayStatus)) {
      homeOfficePrevios.add(fila.date);
    }
  }
  const dia = [...jornadasMes, ...jornadasSemana].find(f => f.date === fechaJornada) || null;
  return {
    retardosPrevios: retardos.size,
    homeOfficeUsadoSemana: homeOfficePrevios.size > 0,
    fechasHomeOffice: [...homeOfficePrevios].sort(),
    jornadaSAP: dia,
    inasistenciaSAP: esInasistenciaRH(dia?.dayStatus),
    homeOfficeHoy: esHomeOfficeRH(dia?.dayStatus),
  };
}

// Convierte los cuatro horarios consolidados en movimientos ya confirmados,
// visibles en cualquier dispositivo y con la fecha real despues de medianoche.
export function movimientosDesdeHistoryRH(jornada, turno) {
  if (!jornada?.date) return [];
  const cruza = turno?.valido && turno?.cruzaMedianoche && turno?.fechaJornada === jornada.date;
  const tipos = [
    ["entrada", "P10", jornada.p10Time],
    ["comida_inicio", "P15", jornada.p15Time],
    ["comida_fin", "P25", jornada.p25Time],
    ["salida", "P20", jornada.p20Time],
  ];
  return tipos.filter(([, , hora]) => /^\d{2}:\d{2}:\d{2}$/.test(hora || "") && hora !== "00:00:00")
    .map(([type, registerType, hour]) => {
      let date = jornada.date;
      if (cruza) {
        // CORRECCION: una entrada 22:53 es valida para un turno 23:00-07:00:
        // se realiza 7 min ANTES del inicio, pero pertenece al dia inicial.
        // La antigua comparacion hour < textoInicio la movia al dia siguiente
        // y provocaba el falso error "la hora del equipo es anterior a tu entrada".
        const [hh, mm, ss] = hour.split(":").map(Number);
        const instanteLocal = fechaLocal(jornada.date);
        instanteLocal.setHours(hh, mm, ss, 0);
        const aperturaTurno = turno.inicioMs - 15 * 60 * 1000;
        if (instanteLocal.getTime() < aperturaTurno) {
          instanteLocal.setDate(instanteLocal.getDate() + 1);
        }
        date = fechaISO(instanteLocal);
      }
      return {
        id: `sap-history:${jornada.personalNumber}:${jornada.date}:${registerType}`,
        personalNumber: jornada.personalNumber,
        jornadaDate: jornada.date, // Fecha de jornada SAP; no depende del dia del reloj.
        date, time: hour.slice(0, 5), registerHour: hour,
        type, registerType, sapState: "accepted", source: "SAP",
        modality: esHomeOfficeRH(jornada.dayStatus) ? "HomeOffice" : "",
        typeSession: esHomeOfficeRH(jornada.dayStatus) ? "HO" : "",
      };
    });
}


// El horario viene del EmployeeSet ya validado. No inferir horario nocturno
// de la hora del teléfono, ni aplicarlo a empleados con jornada diurna.
export function esHorarioNocturnoRH(scheduleDetail) {
  const horario = String(scheduleDetail || "");
  const patron = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g;
  let coincidio;
  while ((coincidio = patron.exec(horario))) {
    const iniH = Number(coincidio[1]);
    const iniM = Number(coincidio[2]);
    const finH = Number(coincidio[3]);
    const finM = Number(coincidio[4]);
    if (iniH > 23 || finH > 23 || iniM > 59 || finM > 59) continue;
    if (finH * 60 + finM < iniH * 60 + iniM) return true;
  }
  return false;
}

const CAMPOS_MARCACION = ["p10Time", "p15Time", "p25Time", "p20Time"];
const HORA_SAP_VALIDA = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
function hayHoraSAP(value) {
  return HORA_SAP_VALIDA.test(String(value || "")) && value !== "00:00:00";
}
function instanteDeMovimiento(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || "")) || !hayHoraSAP(hora)) return null;
  const [h, m, s] = hora.split(":").map(Number);
  const d = fechaLocal(fecha);
  d.setHours(h, m, s, 0);
  return d;
}

/**
 * Une únicamente las MARCACIONES de un turno nocturno. SAP puede devolver
 * P10 en WorkDate 09 y P20 en WorkDate 10 aunque sean una sola jornada.
 * No toca el JSON de SAP, no mezcla identidades y no duplica movimientos.
 *
 * Se ejecuta ANTES de filtrar por el día consultado; el GET debe incluir
 * el día posterior para poder encontrar las salidas tras medianoche.
 */
export function consolidarJornadasNocturnasRH(jornadas = [], scheduleDetail = "") {
  if (!esHorarioNocturnoRH(scheduleDetail) || !Array.isArray(jornadas)) return jornadas;
  const agrupadas = new Map();
  const origen = [...jornadas].filter(j => j && j.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  function crear(dia, fila) {
    const key = `${String(fila.personalNumber || "").replace(/^0+/, "")}|${dia}`;
    if (!agrupadas.has(key)) {
      agrupadas.set(key, {
        id: `${fila.personalNumber}-${dia}`, personalNumber: fila.personalNumber,
        date: dia, dayStatus: "",
        p10Time: "", p15Time: "", p25Time: "", p20Time: "",
      });
    }
    return agrupadas.get(key);
  }

  for (const fila of origen) {
    const camposConHora = CAMPOS_MARCACION.filter(c => hayHoraSAP(fila[c]));
    // Conservar estados sin marcaciones (AUSENTE/RETARDO) bajo su WorkDate.
    if (fila.dayStatus || !camposConHora.length) {
      const base = crear(fila.date, fila);
      if (!base.dayStatus) base.dayStatus = fila.dayStatus || "";
    }
    for (const campo of camposConHora) {
      let fechaJornada = fila.date;
      // Si SAP ya regresó los cuatro tiempos consolidados en una fila,
      // respetar ese WorkDate: la división solo afecta filas separadas.
      if (camposConHora.length === 1) {
        const real = instanteDeMovimiento(fila.date, fila[campo]);
        const turno = real && obtenerTurnoDelDia(scheduleDetail, real);
        if (turno?.valido && turno.cruzaMedianoche &&
            real.getTime() >= turno.inicioMs - 15 * 60000 &&
            real.getTime() <= turno.finMs + 4 * 3600000) {
          fechaJornada = turno.fechaJornada;
        }
      }
      const destino = crear(fechaJornada, fila);
      if (!hayHoraSAP(destino[campo])) destino[campo] = fila[campo];
      if (fechaJornada === fila.date && !destino.dayStatus && fila.dayStatus) {
        destino.dayStatus = fila.dayStatus;
      }
    }
  }
  return [...agrupadas.values()]
    .filter(f => !!f.dayStatus || CAMPOS_MARCACION.some(c => hayHoraSAP(f[c])))
    .sort((a, b) => b.date.localeCompare(a.date));
}