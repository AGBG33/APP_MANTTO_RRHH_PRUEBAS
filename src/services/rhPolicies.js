// src/services/rhPolicies.js
// Políticas RRHH QAS. El backend SAP/ABAP debe volver a validar estas reglas.
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

const DAY_NUMBER = { D: 0, L: 1, M: 2, X: 3, MI: 3, J: 4, V: 5, S: 6 };
const NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const TOKEN = "(MI|X|L|M|J|V|S|D)";
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const COMIDA_DESDE_MIN = 12 * 60;
const COMIDA_HASTA_MIN = 14 * 60 + 30;
const pad = n => String(n).padStart(2, "0");

export function minutosReloj(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}
export function hoyISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function horaCorta(minutos) {
  if (!Number.isFinite(minutos)) return "--:--";
  const m = ((Math.floor(minutos) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function minutosHHMM(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
function listaDias(etiqueta) {
  const limpio = String(etiqueta).toUpperCase().replace(/\s/g, "");
  const m = new RegExp(`^${TOKEN}(?:-${TOKEN})?$`).exec(limpio);
  if (!m) return [];
  const inicio = DAY_NUMBER[m[1]];
  const fin = m[2] ? DAY_NUMBER[m[2]] : inicio;
  const dias = [inicio];
  while (dias[dias.length - 1] !== fin && dias.length < 7) {
    dias.push((dias[dias.length - 1] + 1) % 7);
  }
  return dias;
}
function obtenerPatrones(scheduleDetail) {
  const original = String(scheduleDetail || "").trim();
  if (!original) return { error: "SAP no devolvió ScheduleDetail.", sinHorario: true };
  const patrones = [];
  const expresion = new RegExp(`^\\s*${TOKEN}(?:\\s*-\\s*${TOKEN})?\\s+(\\d{1,2}:\\d{2})\\s*[-–—]\\s*(\\d{1,2}:\\d{2})\\s*$`, "i");
  for (const parte of original.split(/\s*[·;,|/]\s*/)) {
    const m = expresion.exec(parte);
    if (!m) return { error: `Formato de horario no reconocido: ${parte}` };
    const inicio = minutosHHMM(m[3]);
    const fin = minutosHHMM(m[4]);
    if (inicio === null || fin === null || inicio === fin) {
      return { error: `Inicio y fin del turno inválidos: ${parte}` };
    }
    const dias = listaDias(m[1] + (m[2] ? `-${m[2]}` : ""));
    if (!dias.length) return { error: `Días del horario inválidos: ${parte}` };
    patrones.push({ dias, inicio, fin, cruzaMedianoche: fin < inicio });
  }
  return { patrones, descripcion: original };
}
function turnoParaFecha(patrones, dia, descripcion) {
  const patron = patrones.find(x => x.dias.includes(dia.getDay()));
  if (!patron) return null;
  const inicioDate = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(),
    Math.floor(patron.inicio / 60), patron.inicio % 60, 0, 0);
  const finDate = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(),
    Math.floor(patron.fin / 60), patron.fin % 60, 0, 0);
  if (patron.cruzaMedianoche) finDate.setDate(finDate.getDate() + 1);
  return {
    valido: true,
    inicio: patron.inicio,
    fin: patron.fin,
    textoInicio: horaCorta(patron.inicio),
    textoFin: horaCorta(patron.fin),
    inicioMs: inicioDate.getTime(),
    finMs: finDate.getTime(),
    fechaJornada: hoyISO(dia),
    cruzaMedianoche: patron.cruzaMedianoche,
    descripcion,
  };
}
/**
 * Acepta L-X, M-X, MI, L-V y turnos nocturnos como S 21:00-08:00.
 * Antes de finalizar un turno nocturno, mantiene la jornada del día previo.
 */
export function obtenerTurnoDelDia(scheduleDetail, fecha = new Date()) {
  const parsed = obtenerPatrones(scheduleDetail);
  if (parsed.error) return { valido: false, razon: parsed.error, sinHorario: !!parsed.sinHorario };
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const ayer = new Date(dia);
  ayer.setDate(ayer.getDate() - 1);
  const anterior = turnoParaFecha(parsed.patrones, ayer, parsed.descripcion);
  const hoy = turnoParaFecha(parsed.patrones, dia, parsed.descripcion);
  const manana = new Date(dia);
  manana.setDate(manana.getDate() + 1);
  const siguiente = turnoParaFecha(parsed.patrones, manana, parsed.descripcion);
  const momento = fecha.getTime();
  // Mantener el turno previo durante su finalización y hasta cuatro horas extra.
  if (anterior?.cruzaMedianoche && momento >= anterior.inicioMs &&
      momento < anterior.finMs + 4 * HORA &&
      (!hoy || momento < hoy.inicioMs - 15 * MINUTO)) return anterior;
  // Si un turno empieza justo después de medianoche, P10 abre el día anterior.
  if (siguiente && momento >= siguiente.inicioMs - 15 * MINUTO &&
      momento < siguiente.inicioMs && (!hoy || momento >= hoy.finMs)) return siguiente;
  return hoy || { valido: false, sinJornada: true,
    razon: `No hay turno programado para ${NAMES[fecha.getDay()]}.` };
}

// Los valores se reciben del EmployeeSet. Solo los códigos 01 a 07 tienen
// reglas especiales en RRHH. Otros códigos (incluidos BA, CO y EV) no
// provocan bloqueo por RelationJob; continúan las reglas normales de la app.
const DESCRIPCIONES_RELACION_RH = Object.freeze({
  "01": "VACACIONES",
  "02": "HOME OFFICE",
  "03": "INCAPACIDAD",
  "04": "VIAJE DE NEGOCIOS",
  "05": "CUMPLEAÑOS",
  "06": "SANCIONADO",
  "07": "BAJA",
});

export function obtenerRelacionLaboralRH(empleado) {
  const original = String(empleado?.relationJob ?? "").trim().toUpperCase().split(/\s+/)[0];
  const codigo = /^\d$/.test(original) ? `0${original}` : original;
  const descripcionSAP = String(empleado?.relationJobDescription ?? "").trim();
  const descripcion = descripcionSAP || DESCRIPCIONES_RELACION_RH[codigo] || codigo;
  return {
    codigo,
    descripcion,
    homeOffice: codigo === "02",
    viaje: codigo === "04",
    // 02 (HO) y 04 (VN) tienen sus flujos propios; solo 01,03,05,06,07 bloquean.
    bloqueado: ["01", "03", "05", "06", "07"].includes(codigo),
  };
}

export function clasificarEmpleadoRH(empleado) {
  const activo = String(empleado?.status ?? "").trim() === "3";
  const grupo = String(empleado?.groupPerson || "").trim().toUpperCase();
  const confianza = grupo === "X";
  const sindicalizado = grupo === "Y";
  const canal = String(empleado?.authorisedRegister || "").trim().toUpperCase();
  const canalApp = ["APP", "AMBOS"].includes(canal);
  const soloBtp = canal === "BTP";
  const relacion = obtenerRelacionLaboralRH(empleado);
  let razon = "";
  if (relacion.bloqueado) {
    razon = `No puedes registrar asistencia. Estatus laboral: ${relacion.descripcion}.`;
  } else if (!activo) razon = `Empleado no activo: ${empleado?.descriptionStatus || empleado?.status || "sin estatus"}.`;
  else if (!confianza && !sindicalizado) razon = "SAP no devolvió GroupPerson X o Y para este empleado.";
  else if (soloBtp) razon = "Tu asistencia se registra mediante el monitor BTP; puedes consultar aquí tus datos e historial.";
  else if (!canalApp) razon = "SAP no autorizó el registro de asistencia desde la aplicación. Consulta con Recursos Humanos.";
  return { habilitado: !razon && activo && (confianza || sindicalizado) && canalApp,
    activo, grupo, confianza, sindicalizado, canal, canalApp, soloBtp, relacion, razon };
}
export function modalidadesPermitidasRH(empleado) {
  const p = clasificarEmpleadoRH(empleado);
  if (!p.habilitado) return [];
  // RelationJob 02: se marca únicamente entrada y salida, sin comida.
  if (p.relacion.homeOffice) return ["HomeOffice"];
  // RelationJob 04: seleccionar período y registrar únicamente P10.
  if (p.relacion.viaje) return ["Viaje de negocios"];
  return p.confianza ? ["Presencial", "HomeOffice", "Viaje de negocios"] : ["Presencial"];
}
export function codigoModalidadRH(modalidad) {
  const codigo = CODIGOS_MODALIDAD_RH[modalidad];
  if (!codigo) throw new Error(`Falta confirmar en SAP el código TypeSession para ${modalidad}. No se enviará un código inventado.`);
  return codigo;
}

// Interpretar las fechas locales sin conversión UTC (crucial en jornadas nocturnas).
export function fechaHoraRegistroRH(registro) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(registro?.date || ""));
  const hora = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(registro?.registerHour || registro?.time || ""));
  if (!date || !hora) return null;
  const y = Number(date[1]); const mes = Number(date[2]); const d = Number(date[3]);
  const h = Number(hora[1]); const m = Number(hora[2]); const seg = Number(hora[3] || 0);
  if (h > 23 || m > 59 || seg > 59) return null;
  const local = new Date(y, mes - 1, d, h, m, seg);
  if (local.getFullYear() !== y || local.getMonth() + 1 !== mes || local.getDate() !== d) return null;
  return local.getTime();
}
export function registrosDeJornadaRH(registros = [], turno, ahora = new Date()) {
  if (!turno?.valido) return registros.filter(r => r.date === hoyISO(ahora));
  // Los P10 pueden realizarse hasta 15 minutos antes de comenzar el turno.
  const desde = turno.inicioMs - 15 * MINUTO;
  return registros.filter(r => {
    // El historial SAP consolida por WorkDate. Si ya existe el movimiento de
    // esa jornada, cuenta incluso cuando fue registrado fuera de la ventana
    // calculada por la app (ej. terminal BTP, otra jornada o cambio de horario).
    if (r.source === "SAP" && r.jornadaDate === turno.fechaJornada) return true;
    const instante = fechaHoraRegistroRH(r);
    return instante !== null && instante >= desde && instante <= turno.finMs + 4 * HORA;
  });
}
function primerRegistro(registros, tipo) {
  return registros.filter(r => r.type === tipo &&
    ["accepted", "sending", "uncertain"].includes(r.sapState))
    .sort((a, b) => (fechaHoraRegistroRH(a) || 0) - (fechaHoraRegistroRH(b) || 0))[0] || null;
}

/**
 * Tolerancias: P10 desde -15 minutos; retardo después de +10 minutos.
 * P15 y P25 disponibles entre las 12:00 y las 14:30, sin límite de duración de comida.
 */
export function evaluarMarcacionRH({ empleado, tipo, registros = [], ahora = new Date(), modalidad = "Presencial" }) {
  const p = clasificarEmpleadoRH(empleado);
  if (!p.habilitado) return { permitido: false, mensaje: p.razon };
  if (!TIPOS_RH[tipo]) return { permitido: false, mensaje: "Tipo de registro desconocido." };
  // No permitir cambiar de modalidad para eludir el estatus del EmployeeSet.
  if (p.relacion.homeOffice && modalidad !== "HomeOffice") {
    return { permitido: false, mensaje: "Tu estatus es HOME OFFICE. Registra únicamente entrada y salida en esa modalidad." };
  }
  if (p.relacion.viaje && (modalidad !== "Viaje de negocios" || tipo !== "entrada")) {
    return { permitido: false, mensaje: "Tu estatus es VIAJE DE NEGOCIOS. Selecciona el período y registra únicamente la entrada inicial." };
  }
  if (p.sindicalizado && (tipo === "comida_inicio" || tipo === "comida_fin")) {
    return { permitido: false, mensaje: "El personal sindicalizado únicamente registra entrada y salida." };
  }
  if (!modalidad) return { permitido: false, mensaje: "Primero selecciona y guarda la modalidad de trabajo antes de registrar la entrada." };
  if (!modalidadesPermitidasRH(empleado).includes(modalidad)) {
    return { permitido: false, mensaje: "Esta modalidad no corresponde al grupo de personal." };
  }
  const turno = obtenerTurnoDelDia(empleado?.scheduleDetail, ahora);
  const jornada = registrosDeJornadaRH(registros, turno, ahora);
  const confirmables = jornada.filter(r => ["accepted", "sending", "uncertain"].includes(r.sapState));
  const codigos = new Set(confirmables.map(r =>
    r.typeSession || (r.modality && CODIGOS_MODALIDAD_RH[r.modality])).filter(Boolean));
  const codigoSeleccionado = CODIGOS_MODALIDAD_RH[modalidad];
  // Home Office no permite marcaciones de comida. En viaje sólo se hace P10.
  if (modalidad === "HomeOffice" && (tipo === "comida_inicio" || tipo === "comida_fin")) {
    return { permitido: false, mensaje: "En Home Office sólo registras entrada y salida." };
  }
  if (modalidad === "Viaje de negocios" && tipo !== "entrada") {
    return { permitido: false, mensaje: "El viaje de negocios sólo requiere la marcación inicial." };
  }
  if (codigos.size > 1 || (codigos.size === 1 && !codigos.has(codigoSeleccionado))) {
    return { permitido: false, mensaje: "La modalidad seleccionada no coincide con los registros de esta jornada. Revisa el historial antes de continuar." };
  }
  try { codigoModalidadRH(modalidad); }
  catch (e) { return { permitido: false, mensaje: e.message }; }

  const momento = ahora.getTime();
  // Se evalúa por minuto: 14:30:59 sigue permitido; 14:31:00 ya no.
  const hora = Math.floor(minutosReloj(ahora));
  const entrada = primerRegistro(jornada, "entrada");
  const inicioComida = primerRegistro(jornada, "comida_inicio");
  const regresoComida = primerRegistro(jornada, "comida_fin");
  const salida = primerRegistro(jornada, "salida");
  if (confirmables.some(r => r.type === tipo)) {
    return { permitido: false, mensaje: "Este registro ya fue enviado o sigue pendiente de verificar." };
  }
  if (confirmables.some(r => ["sending", "uncertain"].includes(r.sapState))) {
    return { permitido: false, mensaje: "Hay una marcación sin confirmar. Revisa SAP antes de continuar." };
  }

  if (tipo === "entrada") {
    if (!turno.valido) return { permitido: false, mensaje: turno.razon };
    if (momento >= turno.finMs) return { permitido: false,
      mensaje: `Tu horario de labores terminó a las ${turno.textoFin}. Ya no puedes registrar entrada fuera de tu jornada.` };
    const habilita = turno.inicioMs - 15 * MINUTO;
    if (momento < habilita) return { permitido: false,
      mensaje: `La entrada se habilita a las ${horaCorta(turno.inicio - 15)} (15 minutos antes del turno).` };
    const retardo = momento > turno.inicioMs + 10 * MINUTO;
    return { permitido: true, retardo, turno,
      aviso: retardo
        ? `La tolerancia terminó 10 minutos después de las ${turno.textoInicio}. Esta entrada se considera retardo.`
        : `Entrada dentro del horario permitido. Tienes tolerancia hasta las ${horaCorta(turno.inicio + 10)}.` };
  }
  if (!entrada) return { permitido: false, mensaje: "Registra primero la entrada de la jornada." };
  if (salida) return { permitido: false, mensaje: "La jornada ya tiene una salida registrada." };

  if (tipo === "comida_inicio") {
    if (inicioComida) return { permitido: false, mensaje: "Ya registraste inicio de comida en esta jornada." };
    // P15 puede registrarse en cualquier minuto de la ventana de comida.
    if (p.confianza && (hora < COMIDA_DESDE_MIN || hora > COMIDA_HASTA_MIN)) {
      return { permitido: false, mensaje: "El inicio de comida se permite de 12:00 a 14:30." };
    }
    return { permitido: true,
      aviso: "El regreso de comida estará disponible después de este registro y hasta las 14:30." };
  }
  if (tipo === "comida_fin") {
    if (!inicioComida) return { permitido: false, mensaje: "Primero registra el inicio de comida." };
    if (regresoComida) return { permitido: false, mensaje: "Ya registraste el regreso de comida." };
    const inicioMs = fechaHoraRegistroRH(inicioComida);
    if (inicioMs === null) return { permitido: false, mensaje: "No se pudo comprobar la hora de inicio de comida." };
    if (momento < inicioMs) return { permitido: false, mensaje: "El inicio de comida todavía no ha ocurrido." };
    // No hay máximo de 60 minutos desde P15. La única fecha/hora límite
    // es la ventana de comida, con independencia de cuándo se inició P15.
    if (p.confianza && hora < COMIDA_DESDE_MIN) return { permitido: false,
      mensaje: "El regreso de comida se habilita a las 12:00." };
    if (p.confianza && hora > COMIDA_HASTA_MIN) return { permitido: false, fueraDeVentanaComida: true,
      mensaje: "Terminó la ventana de comida a las 14:30. Solo puedes registrar la salida." };
    return { permitido: true, aviso: "Regreso de comida dentro del horario permitido de 12:00 a 14:30." };
  }
  if (tipo === "salida") {
    const despues = turno.valido && momento > turno.finMs;
    const antes = turno.valido && momento < turno.finMs;
    let aviso = despues
      ? `Tu jornada programada terminó a las ${turno.textoFin}. La salida se registrará a la hora actual.`
      : antes ? `Estás saliendo antes de las ${turno.textoFin}. Confirma si es una salida anticipada.`
      : "Se registrará la salida con la hora actual.";
    if (inicioComida && !regresoComida) aviso += " No se encontró registro de regreso de comida.";
    return { permitido: true, salidaAnticipada: antes, turno, aviso };
  }
  return { permitido: false, mensaje: "Marcación no contemplada." };
}