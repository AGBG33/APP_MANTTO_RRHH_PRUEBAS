
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
   if (!original) return { error: "No hay un horario laboral disponible para este empleado.", sinHorario: true };
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

 // Los valores vienen de EmployeeSet de SAP.
 // Los códigos 01 a 07 tienen reglas especiales en RRHH.
 // BA, CO y EV no provocan bloqueo por RelationJob.
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

     // 02 mantiene sus checks Home Office.
     // 04 BLOQUEA cuando SAP ya lo asignó al empleado.
     // Si RelationJob está vacío, confianza todavía puede SELECCIONAR
     // Viaje de negocios y registrar su primera entrada P10.
     bloqueado: ["01", "03", "04", "05", "06", "07"].includes(codigo),
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
   } else if (sindicalizado && (relacion.homeOffice || relacion.viaje)) {
     // SAP asignó un estatus incompatible con las modalidades del grupo Y.
     // No cambiar de forma artificial a PR para evadir ese estatus especial.
     razon = `El personal sindicalizado solo registra asistencia presencial (entrada y salida). Tu estatus es ${relacion.descripcion}; solicita su revisión a Recursos Humanos.`;
   } else if (!activo) razon = `Empleado no activo: ${empleado?.descriptionStatus || empleado?.status || "sin estatus"}.`;
   else if (!confianza && !sindicalizado) razon = "No pudimos identificar tu tipo de personal. Consulta con Recursos Humanos.";
   else if (soloBtp) razon = "Tu asistencia se registra por otro medio. Puedes consultar aquí tus datos e historial.";
   else if (!canalApp) razon = "No tienes habilitado el registro de asistencia desde la aplicación. Consulta con Recursos Humanos.";
   return { habilitado: !razon && activo && (confianza || sindicalizado) && canalApp,
     activo, grupo, confianza, sindicalizado, canal, canalApp, soloBtp, relacion, razon };
 }
 export function modalidadesPermitidasRH(empleado) {
   const p = clasificarEmpleadoRH(empleado);
   if (!p.habilitado) return [];
   // Grupo Y: exclusivamente Presencial. Nunca ofrece Home Office ni Viaje.
   if (p.sindicalizado) return ["Presencial"];
   // Grupo X con RelationJob 02: Home Office con los cuatro movimientos.
   if (p.relacion.homeOffice) return ["HomeOffice"];
   // RelationJob 04 ya queda bloqueado en clasificarEmpleadoRH.
   // Con RelationJob vacío, confianza conserva las tres modalidades.
   return p.confianza ? ["Presencial", "HomeOffice", "Viaje de negocios"] : ["Presencial"];
 }
 export function codigoModalidadRH(modalidad) {
   const codigo = CODIGOS_MODALIDAD_RH[modalidad];
   if (!codigo) throw new Error(`No pudimos confirmar los datos de la modalidad ${modalidad}. Consulta con Recursos Humanos antes de registrar.`);
   return codigo;
 }

 /**
  * Lee el horario de comida de EmployeeSet.
  * SAP define exclusivamente la ventana autorizada (TimeFoodSchedule).
  * TimeFood es una duración de REFERENCIA para informar y comparar después,
  * jamás un máximo para impedir P25 antes o después del tiempo asignado.
  * Ejemplos: TimeFoodSchedule = "13:00:00 - 14:00:00"
  *           TimeFood = " 1-hrs / 0-min"
  * Solo un TimeFoodSchedule ausente o inválido bloquea los checks de comida.
  * TimeFood vacío/no interpretable NO bloquea P15/P25; P10/P20 se mantienen.
  */
 export function obtenerHorarioComidaRH(empleado) {
   const horarioRaw = String(empleado?.timeFoodSchedule ?? "").trim();
   const tiempoRaw = String(empleado?.timeFood ?? "").trim();
   const noDisponible = (detalle) => ({ valido: false,
     mensaje: `No pudimos validar tu horario de comida (${detalle}). Contacta a Recursos Humanos.` });

   if (!horarioRaw) return noDisponible("falta TimeFoodSchedule");
   const rango = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*[-–—]\s*(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(horarioRaw);
   if (!rango) return noDisponible("TimeFoodSchedule no tiene formato HH:MM:SS - HH:MM:SS");
   const inicioHora = Number(rango[1]);
   const finHora = Number(rango[4]);
   if (inicioHora > 23 || finHora > 23) return noDisponible("hora fuera de rango");
   const inicioMin = inicioHora * 60 + Number(rango[2]);
   const finMin = finHora * 60 + Number(rango[5]);
   const inicioSeg = inicioMin * 60 + Number(rango[3] || 0);
   const finSeg = finMin * 60 + Number(rango[6] || 0);
   // No inferir un turno de comida nocturno sin un contrato explícito de SAP.
   if (finSeg <= inicioSeg) return noDisponible("el horario final debe ser posterior al inicial");

   // TimeFood es informativo: su ausencia o formato inválido nunca inhabilita
   // las marcaciones, siempre que TimeFoodSchedule esté validado.
   const tiempo = /^(\d{1,3})\s*[- ]\s*hrs?\s*\/\s*(\d{1,2})\s*[- ]\s*mins?$/i.exec(tiempoRaw);
   const horas = tiempo ? Number(tiempo[1]) : null;
   const minutos = tiempo ? Number(tiempo[2]) : null;
   const duracionMin = tiempo && minutos <= 59 && horas * 60 + minutos > 0 &&
     horas * 60 + minutos <= 24 * 60 ? horas * 60 + minutos : null;
   return {
     valido: true,
     inicioSeg, finSeg,
     duracionMin, // Referencia SAP, NO restricción para registrar regreso de comida.
     textoInicio: horaCorta(inicioMin),
     textoFin: horaCorta(finMin),
     descripcion: `${horaCorta(inicioMin)} a ${horaCorta(finMin)}`,
     textoDuracion: duracionMin === null ? "No especificado" : horas > 0
       ? `${horas} h${minutos > 0 ? ` ${minutos} min` : ""}`
       : `${minutos} min`,
   };
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
  * P15 y P25 obedecen únicamente TimeFoodSchedule de EmployeeSet.
  * TimeFood informa la duración asignada, sin limitar el regreso de comida;
  * las horas reales P15 y P25 se conservan para conocer el tiempo utilizado.
  */
 export function evaluarMarcacionRH({ empleado, tipo, registros = [], ahora = new Date(), modalidad = "Presencial" }) {
   const p = clasificarEmpleadoRH(empleado);
   if (!p.habilitado) return { permitido: false, mensaje: p.razon };
   if (!TIPOS_RH[tipo]) return { permitido: false, mensaje: "Tipo de registro desconocido." };
   // El personal sindicalizado nunca registra comida ni modalidades HO / VN.
   // Esta validación aplica tanto online como al motor de captura offline.
   if (p.sindicalizado && modalidad !== "Presencial") {
     return { permitido: false, mensaje: "El personal sindicalizado únicamente registra en modalidad Presencial." };
   }
   if (p.sindicalizado && (tipo === "comida_inicio" || tipo === "comida_fin")) {
     return { permitido: false, mensaje: "El personal sindicalizado únicamente registra entrada y salida." };
   }
   // No permitir cambiar de modalidad para eludir el estatus del EmployeeSet.
   if (p.relacion.homeOffice && modalidad !== "HomeOffice") {
     return { permitido: false, mensaje: "Tu estatus es HOME OFFICE. Registra entrada, inicio y fin de comida y salida en esa modalidad." };
   }
   // RelationJob 04 se bloqueó arriba con clasificarEmpleadoRH.
   // La selección de un viaje NUEVO sigue permitida con RelationJob vacío.
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
   // El personal de confianza en Home Office puede realizar P10, P15, P25 y P20.
   // Un viaje NUEVO permite únicamente P10.
   if (modalidad === "Viaje de negocios" && tipo !== "entrada") {
     return { permitido: false, mensaje: "El viaje de negocios sólo requiere la marcación inicial." };
   }
   if (codigos.size > 1 || (codigos.size === 1 && !codigos.has(codigoSeleccionado))) {
     return { permitido: false, mensaje: "La modalidad seleccionada no coincide con los registros de esta jornada. Revisa el historial antes de continuar." };
   }
   try { codigoModalidadRH(modalidad); }
   catch (e) { return { permitido: false, mensaje: e.message }; }

   const momento = ahora.getTime();
   // Todas las comparaciones de horario de comida usan el horario local y
   // los segundos de SAP; no se aplica ningún rango fijo en el código.
   const horaSeg = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();
   const entrada = primerRegistro(jornada, "entrada");
   const inicioComida = primerRegistro(jornada, "comida_inicio");
   const regresoComida = primerRegistro(jornada, "comida_fin");
   const salida = primerRegistro(jornada, "salida");
   if (confirmables.some(r => r.type === tipo)) {
     return { permitido: false, mensaje: "Este registro ya fue enviado o sigue pendiente de verificar." };
   }
   if (confirmables.some(r => ["sending", "uncertain"].includes(r.sapState))) {
     return { permitido: false, mensaje: "Hay una marcación pendiente de confirmación. Verifica su estado antes de continuar." };
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

   if (tipo === "comida_inicio" || tipo === "comida_fin") {
     // Sindicalizados y viaje ya fueron rechazados arriba. El dato SAP se
     // valida justo antes del marcaje (incluida la captura offline).
     const comida = obtenerHorarioComidaRH(empleado);
     if (!comida.valido) return { permitido: false, mensaje: comida.mensaje };

     if (tipo === "comida_inicio") {
       if (inicioComida) return { permitido: false,
         mensaje: "Ya registraste inicio de comida en esta jornada." };
       if (horaSeg < comida.inicioSeg || horaSeg > comida.finSeg) {
         return { permitido: false, fueraDeVentanaComida: horaSeg > comida.finSeg,
           mensaje: `El inicio de comida solo está permitido de ${comida.descripcion}, según tu horario laboral.` };
       }
       return { permitido: true,
         aviso: `Inicio de comida dentro de tu horario laboral (${comida.descripcion}). Tiempo asignado de referencia: ${comida.textoDuracion}.` };
     }

     if (!inicioComida) return { permitido: false,
       mensaje: "Primero registra el inicio de comida." };
     if (regresoComida) return { permitido: false,
       mensaje: "Ya registraste el regreso de comida." };
     const inicioMs = fechaHoraRegistroRH(inicioComida);
     if (inicioMs === null) return { permitido: false,
       mensaje: "No se pudo comprobar la hora de inicio de comida." };
     if (momento < inicioMs) return { permitido: false,
       mensaje: "El inicio de comida todavía no ha ocurrido." };
     if (horaSeg < comida.inicioSeg) return { permitido: false,
       mensaje: `El regreso de comida se habilita a las ${comida.textoInicio}, según tu horario laboral.` };
     if (horaSeg > comida.finSeg) return { permitido: false, fueraDeVentanaComida: true,
       mensaje: `El horario de comida terminó a las ${comida.textoFin}, según tu horario laboral. Solo puedes registrar la salida.` };
     // TimeFood NO es un límite. Se permite regresar antes o después de esa
     // duración mientras el reloj siga dentro de TimeFoodSchedule.
     // Preservar P15/P25 con sus horas originales para medir el tiempo real.
     const duracionRealMin = Math.max(0, Math.floor((momento - inicioMs) / MINUTO));
     return { permitido: true, duracionRealMin,
       aviso: `Regreso de comida dentro de tu horario laboral (${comida.descripcion}). Tiempo transcurrido: ${duracionRealMin} min. Tiempo asignado de referencia: ${comida.textoDuracion}.` };
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
