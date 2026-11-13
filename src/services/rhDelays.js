// src/services/rhDelays.js
// Total mensual oficial de retardos desde ProcessingDelaysSet (SAP QAS).
// NO cuenta DayStatus de AttendanceHistorySet ni genera marcaciones.
// Si SAP responde HTTP 2xx con una lista de resultados VACÍA, el total del mes es 0.
// No confundir una lista vacía con errores de SAP ni con datos de otra persona.
import api from "./api";

const ENDPOINT = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/ProcessingDelaysSet";
const QAS_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";
const soloNumeros = valor => String(valor ?? "").trim();
const nominaCanonica = valor => {
  const n = soloNumeros(valor);
  if (!/^\d{1,8}$/.test(n)) throw Error("RRHH retardos: número de nómina inválido.");
  return n.padStart(8, "0");
};

export function periodoRetardosRH(fechaJornada) {
  const fecha = String(fechaJornada ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw Error("RRHH retardos: fecha de jornada inválida.");
  }
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const fechaReal = new Date(Date.UTC(anio, mes - 1, dia));
  if (fechaReal.getUTCFullYear() !== anio || fechaReal.getUTCMonth() !== mes - 1 ||
      fechaReal.getUTCDate() !== dia) {
    throw Error("RRHH retardos: fecha de jornada inexistente.");
  }
  const ultDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const yyyymm = `${anio}${String(mes).padStart(2, "0")}`;
  return {
    periodo: yyyymm,
    desdeSAP: `${yyyymm}01`,
    hastaSAP: `${yyyymm}${String(ultDia).padStart(2, "0")}`,
    desde: `${anio}-${String(mes).padStart(2, "0")}-01`,
    hasta: `${anio}-${String(mes).padStart(2, "0")}-${String(ultDia).padStart(2, "0")}`,
  };
}

function enteroSAP(valor, nombre) {
  const t = String(valor ?? "").trim();
  if (!/^\d{1,6}$/.test(t)) throw Error(`ProcessingDelaysSet: ${nombre} inválido.`);
  const numero = Number(t);
  if (!Number.isSafeInteger(numero) || numero < 0) {
    throw Error(`ProcessingDelaysSet: ${nombre} inválido.`);
  }
  return numero;
}

// El 4.º, 8.º, 12.º... generan una nueva inasistencia.
// Si el acumulado previo es 5, la próxima entrada tardía será la 6.ª (normal).
export function cicloRetardosRH(totalDelays) {
  if (!Number.isSafeInteger(totalDelays) || totalDelays < 0) {
    throw Error("RRHH retardos: total mensual inválido.");
  }
  const retardosCiclo = totalDelays % 4;
  return {
    totalDelays,
    retardosCiclo,
    siguienteRetardo: totalDelays + 1,
    cuartoEnSiguienteEntrada: retardosCiclo === 3,
  };
}

export async function consultarRetardosRH({ personalNumber, fechaJornada, signal } = {}) {
  const numero = nominaCanonica(personalNumber);
  const periodo = periodoRetardosRH(fechaJornada);
  // Usar la nómina autenticada, nunca una nómina introducida manualmente.
  const sinCeros = String(Number(numero));
  const filter = `DateFrom eq '${periodo.desdeSAP}' and DateTo eq '${periodo.hastaSAP}' and PersonalNumber eq '${sinCeros}'`;

  // Axios rechaza los códigos HTTP distintos de 2xx; no se transforman en cero.
  const response = await api.get(ENDPOINT, {
    baseURL: QAS_BASE,
    params: { $filter: filter, $format: "json" },
    signal,
    timeout: 45000,
  });

  // Las respuestas OData pueden llegar en formato V2 (d.results) o V4 (value).
  const datos = response?.data;
  if (datos?.error || datos?.d?.error) {
    throw Error("ProcessingDelaysSet devolvió un error de SAP.");
  }
  const body = datos?.d ?? datos;
  const rows = Array.isArray(body?.results) ? body.results :
    (Array.isArray(body?.value) ? body.value :
      (Array.isArray(body) ? body : null));
  if (!rows) throw Error("ProcessingDelaysSet devolvió un JSON inesperado.");

  // CORRECCIÓN: sin registros de ProcessingDelaysSet significa que SAP aún no
  // tiene un resumen de retardos para el mes. No se debe bloquear la jornada.
  // Es distinto de un fallo de red o de un JSON erróneo, que sí producen error.
  if (rows.length === 0) {
    if (__DEV__) {
      console.log("[RRHH][RETARDOS] ProcessingDelaysSet sin registros para el mes. Conteo inicial: 0.");
    }
    return {
      personalNumber: numero,
      periodo: periodo.periodo,
      totalDelays: 0,
      totalAbsences: 0,
      lastUpdate: "",
      lastHourUpdate: "",
    };
  }

  // No usar datos de otra nómina ni de otro mes aunque SAP los devuelva.
  const matching = rows.filter(row => {
    try {
      return nominaCanonica(row?.PersonalNumber) === numero &&
        String(row?.Period ?? "").trim() === periodo.periodo;
    } catch (_) {
      return false;
    }
  });
  if (matching.length !== 1) {
    // Diagnóstico sin imprimir nombres, nóminas, correos ni respuesta personal.
    if (__DEV__) {
      console.warn("[RRHH][RETARDOS] Respuesta no conciliable:", {
        registrosRecibidos: rows.length,
        registrosDelEmpleadoYMes: matching.length,
      });
    }
    throw Error("SAP devolvió registros de retardos que no corresponden de forma única al empleado y mes consultados.");
  }

  const item = matching[0];
  return {
    personalNumber: numero,
    periodo: periodo.periodo,
    totalDelays: enteroSAP(item.TotalDelays, "TotalDelays"),
    totalAbsences: enteroSAP(item.TotalAbsences, "TotalAbsences"),
    lastUpdate: String(item.LastUpdate ?? "").trim(),
    lastHourUpdate: String(item.LastHourUpdate ?? "").trim(),
  };
}