
 // RRHH - planificación pura de recordatorios. NO consulta SAP ni envía checks.
 // Se basa EXCLUSIVAMENTE en el perfil previamente validado por EmployeeSet.
 import {
   clasificarEmpleadoRH,
   obtenerTurnoDelDia,
   obtenerHorarioComidaRH,
   hoyISO,
 } from '../../services/rhPolicies';

 export const RH_DIAS_PROGRAMADOS = 7;
 export const RH_ANTICIPACION_MINUTOS = Object.freeze({ P10: 15, P15: 10, P25: 10, P20: 10 });
 const MINUTO = 60000;
 const MARGEN_PROGRAMACION = 2 * MINUTO;
 const PAD = n => String(n).padStart(2, '0');
 const horaTexto = ms => {
   const f = new Date(ms);
   return `${PAD(f.getHours())}:${PAD(f.getMinutes())}`;
 };
 const marca = (fechaJornada, tipo) => `${fechaJornada}|${tipo}`;

 // No usar horarios fijos ni asumir un rango de comida si SAP no lo devolvió.
 // Para turnos nocturnos, buscar la comida en el día de inicio o el siguiente.
 function ventanaComidaEnTurno(turno, comida) {
   if (!turno?.valido || !comida?.valido) return null;
   const base = new Date(turno.inicioMs);
   base.setHours(0, 0, 0, 0);
   for (const adicional of [0, 1]) {
     const dia = new Date(base);
     dia.setDate(dia.getDate() + adicional);
     const inicio = dia.getTime() + comida.inicioSeg * 1000;
     const fin = dia.getTime() + comida.finSeg * 1000;
     if (inicio >= turno.inicioMs && fin <= turno.finMs && fin > inicio) {
       return { inicio, fin };
     }
   }
   return null;
 }

 /**
  * @param {object} params
  * @param {object} params.empleado - EmployeeSet validado para la sesión.
  * @param {Date} params.ahora - Reloj LOCAL del teléfono.
  * @param {Set<string>} params.marcacionesExistentes - Claves 'YYYY-MM-DD|P10/P15/P25/P20'.
  * @param {Set<string>} params.diasNoLaborablesSAP - Fechas que SAP ya marcó AUSENTE/FALTA/INASISTENCIA.
  * @returns {Array<{fechaJornada:string,tipo:string,cuando:Date,titulo:string,mensaje:string}>}
  */
 export function crearPlanRecordatoriosRH({
   empleado,
   ahora = new Date(),
   marcacionesExistentes = new Set(),
   diasNoLaborablesSAP = new Set(),
   diasSoloEntrada = new Set(),
   dias = RH_DIAS_PROGRAMADOS,
 } = {}) {
   if (!(ahora instanceof Date) || !Number.isFinite(ahora.getTime())) return [];
   if (!empleado || empleado.numeroConfirmadoEnSAP !== true) return [];
   const policy = clasificarEmpleadoRH(empleado);
   if (!policy.habilitado) return [];
   if (!String(empleado.scheduleDetail || '').trim()) return [];
   if (!Number.isInteger(dias) || dias < 1 || dias > 7) return [];
   const viajePerfil = !!policy.relacion?.viaje;
   const comida = policy.confianza && !viajePerfil
     ? obtenerHorarioComidaRH(empleado)
     : null;
   const resultados = [];
   const umbral = ahora.getTime() + MARGEN_PROGRAMACION;

   function agregar(fechaJornada, tipo, eventoMs, descripcion, texto) {
     if (marcacionesExistentes.has(marca(fechaJornada, tipo))) return;
     const cuando = eventoMs - RH_ANTICIPACION_MINUTOS[tipo] * MINUTO;
     if (cuando <= umbral) return;
     resultados.push({
       fechaJornada, tipo, cuando: new Date(cuando),
       titulo: descripcion, mensaje: texto,
     });
   }
   for (let n = 0; n < dias; n++) {
     const fechaBase = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + n, 12);
     const fechaJornada = hoyISO(fechaBase);
     if (diasNoLaborablesSAP.has(fechaJornada)) continue;
     const soloEntradaViaje = viajePerfil || diasSoloEntrada.has(fechaJornada);
     const turno = obtenerTurnoDelDia(empleado.scheduleDetail, fechaBase);
     // Nunca asumir jornada si el parser falló o devolvió un turno del día anterior.
     if (!turno?.valido || turno.fechaJornada !== fechaJornada) continue;
     agregar(fechaJornada, 'P10', turno.inicioMs,
       'Recordatorio de entrada',
       `Tu jornada inicia a las ${horaTexto(turno.inicioMs)}. Si aún no registraste entrada, revisa tu asistencia.`);
     if (soloEntradaViaje) continue;

     if (policy.confianza) {
       const ventana = ventanaComidaEnTurno(turno, comida);
       if (ventana) {
         agregar(fechaJornada, 'P15', ventana.inicio,
           'Recordatorio de inicio de comida',
           `Tu horario de comida comienza a las ${horaTexto(ventana.inicio)}. Si corresponde, registra el inicio de comida.`);
         agregar(fechaJornada, 'P25', ventana.fin,
           'Recordatorio de regreso de comida',
           `Tu ventana de comida finaliza a las ${horaTexto(ventana.fin)}. Si iniciaste comida, revisa tu check de regreso.`);
       }
     }
     // Grupo Y: únicamente P10/P20. Grupo X: P20 incluso sin comida configurada.
     agregar(fechaJornada, 'P20', turno.finMs,
       'Recordatorio de salida',
       `Tu turno termina a las ${horaTexto(turno.finMs)}. Si aún no registraste salida, revisa tu asistencia.`);
   }
   return resultados.sort((a, b) => a.cuando - b.cuando || a.tipo.localeCompare(b.tipo));
 }
