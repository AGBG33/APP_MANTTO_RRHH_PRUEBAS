// src/services/rhPolicies.js
// Reglas de asistencia para las pruebas QAS. NO reemplazan validaciones ABAP.
// Códigos confirmados visualmente en SAP ZHCM_REGISTROS: PR, HO, VN.
// PR: presencial; HO: home office; VN: viaje de negocios.
export const CODIGOS_MODALIDAD_RH = Object.freeze({
  Presencial: "PR",
  HomeOffice: "HO",
  "Viaje de negocios": "VN",
});

export const TIPOS_RH = Object.freeze({
  entrada: "P10",
  comida_inicio: "P15",
  comida_fin: "P25",
  salida: "P20",
});

const DAY_NUMBER = { D: 0, L: 1, M: 2, MI: 3, J: 4, V: 5, S: 6 };
const NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DAY_TOKENS = ["MI", "L", "M", "J", "V", "S", "D"];
const pad = n => String(n).padStart(2, "0");

export function minutosReloj(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}
export function hoyISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function horaCorta(minutos) {
  if (!Number.isFinite(minutos)) return "--:--";
  const m = Math.round(minutos);
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}
function minutosHHMM(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
function listaDias(etiqueta) {
  const limpio = String(etiqueta).toUpperCase().replace(/\s/g, "");
  const m = /^(MI|L|M|J|V|S|D)(?:-(MI|L|M|J|V|S|D))?$/.exec(limpio);
  if (!m) return [];
  const inicio = DAY_NUMBER[m[1]];
  const fin = m[2] ? DAY_NUMBER[m[2]] : inicio;
  const out = [inicio];
  while (out[out.length - 1] !== fin && out.length < 7) {
    out.push((out[out.length - 1] + 1) % 7);
  }
  return out;
}

/**
 * Reconoce ejemplos SAP:
 *  - L-J 07:30-17:30 · V 07:30-14:30
 *  - L-V 08:00-17:30
 *  - L-V 08:00-17:30 / S 08:00-13:00
 * Debe ampliarse si SAP entrega formatos diferentes.
 */
export function obtenerTurnoDelDia(scheduleDetail, fecha = new Date()) {
  const original = String(scheduleDetail || "").trim();
  const weekday = fecha.getDay();
  if (!original) return { valido: false, sinHorario: true, razon: "SAP no devolvió ScheduleDetail." };
  const parts = original.split(/\s*[·;,|/]\s*/);
  const matches = [];
  for (const part of parts) {
    const m = /^\s*(MI|L|M|J|V|S|D)(?:\s*-\s*(MI|L|M|J|V|S|D))?\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$/i.exec(part);
    if (!m) return { valido: false, razon: `Formato de horario no reconocido: ${part}` };
    const inicio = minutosHHMM(m[3]);
    const fin = minutosHHMM(m[4]);
    if (inicio === null || fin === null || fin <= inicio) {
      return { valido: false, razon: "El turno debe tener inicio y fin válidos dentro del mismo día." };
    }
    const dias = listaDias(m[1] + (m[2] ? `-${m[2]}` : ""));
    if (!dias.length) return { valido: false, razon: `Días del horario inválidos: ${part}` };
    matches.push({ inicio, fin, dias });
  }
  const actual = matches.find(x => x.dias.includes(weekday));
  if (!actual) return { valido: false, sinJornada: true, razon: `No hay turno programado para ${NAMES[weekday]}.` };
  return { valido: true, inicio: actual.inicio, fin: actual.fin,
    textoInicio: horaCorta(actual.inicio), textoFin: horaCorta(actual.fin), descripcion: original };
}

export function clasificarEmpleadoRH(empleado) {
  const activo = String(empleado?.status ?? "").trim() === "3";
  const grupo = String(empleado?.groupPerson || "").trim().toUpperCase();
  const confianza = grupo === "X";
  const sindicalizado = grupo === "Y";
  const canal = String(empleado?.authorisedRegister || "").trim().toUpperCase();
  const canalApp = ["APP", "AMBOS"].includes(canal);
  const soloBtp = canal === "BTP";
  let razon = "";
  if (!activo) razon = `Empleado no activo: ${empleado?.descriptionStatus || empleado?.status || "sin estatus"}.`;
  else if (!confianza && !sindicalizado) razon = "SAP no devolvió GroupPerson X o Y para este empleado.";
  else if (soloBtp) razon = "Tu asistencia se registra mediante el monitor BTP; puedes consultar aquí tus datos e historial.";
  else if (!canalApp) razon = "SAP no autorizó el registro de asistencia desde la aplicación. Consulta con Recursos Humanos.";
  return { habilitado: activo && (confianza || sindicalizado) && canalApp,
    activo, grupo, confianza, sindicalizado, canal, canalApp, soloBtp, razon };
}
export function modalidadesPermitidasRH(empleado) {
  const p = clasificarEmpleadoRH(empleado);
  return p.confianza ? ["Presencial", "HomeOffice", "Viaje de negocios"] : ["Presencial"];
}
export function codigoModalidadRH(modalidad) {
  const codigo = CODIGOS_MODALIDAD_RH[modalidad];
  if (!codigo) throw new Error(`Falta confirmar en SAP el código TypeSession para ${modalidad}. No se enviará un código inventado.`);
  return codigo;
}

function minutoDeRegistro(registro) {
  const h = String(registro?.time || "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function primerRegistroHoy(registros, tipo, dia) {
  return (registros || []).filter(r => r.date === dia && r.type === tipo &&
    ["accepted", "sending", "uncertain"].includes(r.sapState))
    .sort((a,b) => String(a.time).localeCompare(String(b.time)))[0] || null;
}

/** Responde {permitido, mensaje, aviso, retardo, motivo}. No hace POST. */
export function evaluarMarcacionRH({ empleado, tipo, registros = [], ahora = new Date(), modalidad = "Presencial" }) {
  const p = clasificarEmpleadoRH(empleado);
  if (!p.habilitado) return { permitido: false, mensaje: p.razon };
  if (!TIPOS_RH[tipo]) return { permitido: false, mensaje: "Tipo de registro desconocido." };
  if (!modalidad) {
    return { permitido: false, mensaje: "Primero selecciona y guarda la modalidad de trabajo antes de registrar la entrada." };
  }
  if (!modalidadesPermitidasRH(empleado).includes(modalidad)) {
    return { permitido: false, mensaje: "Esta modalidad no corresponde al grupo de personal." };
  }
  // En caso de que haya marcaciones anteriores HO/PR/VN, no cambiar la modalidad
  // aunque falte el dato de selección en el teléfono.
  const codigosHoy = new Set((registros || [])
    .filter(r => r.date === hoyISO(ahora) && ["accepted", "sending", "uncertain"].includes(r.sapState))
    .map(r => r.typeSession || (r.modality && CODIGOS_MODALIDAD_RH[r.modality]))
    .filter(Boolean));
  const codigoSeleccionado = CODIGOS_MODALIDAD_RH[modalidad];
  if (codigosHoy.size > 1 || (codigosHoy.size === 1 && !codigosHoy.has(codigoSeleccionado))) {
    return { permitido: false, mensaje: "La modalidad seleccionada no coincide con los registros realizados hoy. Revisa el historial antes de continuar." };
  }
  try { codigoModalidadRH(modalidad); }
  catch (e) { return { permitido: false, mensaje: e.message }; }

  const dia = hoyISO(ahora);
  const hora = minutosReloj(ahora);
  const turno = obtenerTurnoDelDia(empleado?.scheduleDetail, ahora);
  const entrada = primerRegistroHoy(registros, "entrada", dia);
  const inicioComida = primerRegistroHoy(registros, "comida_inicio", dia);
  const regresoComida = primerRegistroHoy(registros, "comida_fin", dia);
  const salida = primerRegistroHoy(registros, "salida", dia);
  if (registros.some(r => r.date === dia && r.type === tipo &&
      ["accepted", "sending", "uncertain"].includes(r.sapState))) {
    return { permitido: false, mensaje: "Este registro ya fue enviado o sigue pendiente de verificar." };
  }
  if (registros.some(r => r.date === dia && ["sending", "uncertain"].includes(r.sapState))) {
    return { permitido: false, mensaje: "Hay una marcación sin confirmar. Revisa SAP antes de continuar." };
  }

  if (tipo === "entrada") {
    if (!turno.valido) return { permitido: false, mensaje: turno.razon };
    if (hora >= turno.fin) return { permitido: false, mensaje: `Tu horario de labores terminó a las ${turno.textoFin}. Ya no puedes registrar entrada fuera de tu jornada.` };
    const habilita = turno.inicio - 10;
    if (hora < habilita) {
      return { permitido: false, mensaje: `La entrada se habilita a las ${horaCorta(habilita)} (10 minutos antes del turno).` };
    }
    const retardo = hora > turno.inicio;
    return { permitido: true, retardo, turno,
      aviso: retardo ? `Tu horario inició a las ${turno.textoInicio}. Esta entrada se considera retardo.`
        : `Entrada dentro del horario permitido. Tu jornada inicia a las ${turno.textoInicio}.` };
  }
  if (!entrada) return { permitido: false, mensaje: "Registra primero la entrada de la jornada." };
  if (salida) return { permitido: false, mensaje: "La jornada ya tiene una salida registrada." };

  if (tipo === "comida_inicio") {
    if (inicioComida) return { permitido: false, mensaje: "Ya registraste inicio de comida hoy." };
    if (p.confianza && (hora < 720 || hora > 780)) {
      return { permitido: false, mensaje: "Confianza: inicia la comida de 12:00 a 13:00 para completar 1 hora y regresar antes de las 14:00." };
    }
    return { permitido: true, aviso: p.confianza
      ? "Comida de confianza: podrás registrar el regreso tras 60 minutos y hasta las 14:00."
      : "Comida sindicalizada: horario libre, con una hora mínima antes del regreso." };
  }
  if (tipo === "comida_fin") {
    if (!inicioComida) return { permitido: false, mensaje: "Primero registra el inicio de comida." };
    if (regresoComida) return { permitido: false, mensaje: "Ya registraste el regreso de comida." };
    const inicio = minutoDeRegistro(inicioComida);
    if (inicio === null) return { permitido: false, mensaje: "No se pudo comprobar la hora de inicio de comida." };
    // Se tolera el minuto exacto del registro, sin segundos en el acuse local.
    if (hora < inicio + 60) {
      return { permitido: false, mensaje: `Aún no transcurre la hora de comida. Regresa a partir de las ${horaCorta(inicio + 60)}.` };
    }
    if (p.confianza && hora > 840) {
      return { permitido: false, mensaje: "Terminó la ventana de comida de confianza a las 14:00. No puedes registrar P25 fuera de esa ventana." };
    }
    return { permitido: true, aviso: hora > inicio + 60
      ? "Ya pasó más de una hora desde el inicio de comida. Se registrará la hora real del regreso."
      : "Regreso de comida después de una hora." };
  }
  if (tipo === "salida") {
    // No bloquear salida por una comida que quedó sin regreso: se informa al empleado.
    const despues = turno.valido && hora > turno.fin;
    const antes = turno.valido && hora < turno.fin;
    let aviso = despues ? `Tu jornada programada terminó a las ${turno.textoFin}. La salida se registrará a la hora actual.`
      : antes ? `Estás saliendo antes de las ${turno.textoFin}. Confirma si es una salida anticipada.`
      : "Se registrará la salida con la hora actual.";
    if (inicioComida && !regresoComida) aviso += " No se encontró registro de regreso de comida.";
    return { permitido: true, salidaAnticipada: antes, turno, aviso };
  }
  return { permitido: false, mensaje: "Marcación no contemplada." };
}