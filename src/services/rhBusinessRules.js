// src/services/rhBusinessRules.js
// Interpretacion de estado corporativo y resumen de historial SAP.
// No crea ni modifica registros. Las decisiones finales de asistencia pertenecen a SAP.

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
    if (fila?.date >= mes.desde && fila?.date <= mes.hasta && fila.date !== fechaJornada && esRetardoRH(fila.dayStatus)) {
      retardos.add(fila.date);
    }
  }
  const homeOfficePrevios = new Set();
  for (const fila of jornadasSemana) {
    if (fila?.date >= semana.desde && fila?.date <= semana.hasta && fila.date !== fechaJornada && esHomeOfficeRH(fila.dayStatus)) {
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
// visibles en cualquier dispositivo y con la fecha real después de medianoche.
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
      if (cruza && hour.slice(0, 5) < turno.textoInicio) {
        const siguiente = fechaLocal(jornada.date);
        siguiente.setDate(siguiente.getDate() + 1);
        date = fechaISO(siguiente);
      }
      return {
        id: `sap-history:${jornada.personalNumber}:${jornada.date}:${registerType}`,
        personalNumber: jornada.personalNumber,
        jornadaDate: jornada.date, // Fecha de jornada SAP; no depende del día del reloj.
        date, time: hour.slice(0, 5), registerHour: hour,
        type, registerType, sapState: "accepted", source: "SAP",
        modality: esHomeOfficeRH(jornada.dayStatus) ? "HomeOffice" : "",
        typeSession: esHomeOfficeRH(jornada.dayStatus) ? "HO" : "",
      };
    });
}