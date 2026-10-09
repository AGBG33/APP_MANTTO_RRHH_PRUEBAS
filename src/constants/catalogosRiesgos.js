// src/constants/catalogosRiesgos.js

export const AREAS_TRABAJO = [
  { id: 1, label: "Cuarto de máquinas" },
  { id: 2, label: "Fosa" },
  { id: 3, label: "Cabina" },
  { id: 4, label: "Pasillo" },
  { id: 5, label: "Acceso edificio" },
  { id: 6, label: "Cuarto de control" },
  { id: 7, label: "Vestíbulo" },
  { id: 8, label: "Área pública" },
  { id: 9, label: "Cubo" },
];

// ✅ Riesgos “Round 1” (los que aparecen en tu formato)
// Puedes agregar/quitar los que quieras, pero estos ya cubren el PDF.
export const RIESGOS_POSIBLES = [
  { id: 1, riesgo: "CAIDAS AL MISMO NIVEL" },
  { id: 2, riesgo: "CAIDAS A DISTINTO NIVEL" },
  { id: 3, riesgo: "CAIDAS OBJETOS MANIPULACION/DESPLOME" },
  { id: 4, riesgo: "DESPLOME DE MATERIALES/CARGAS" },
  { id: 5, riesgo: "CONTACTO CON SUPERFICIE CORTANTE" },
  { id: 6, riesgo: "CONTACTO CON SUSTANCIAS QUIMICAS" },
  { id: 7, riesgo: "ELECTROCUCION" },
  { id: 8, riesgo: "OTROS" },

  { id: 9, riesgo: "PROYECCION DE PARTICULAS QUIMICAS" },
  { id: 10, riesgo: "PROYECCION DE PARTICULAS INCANDECENTES" },
  { id: 11, riesgo: "PROYECCION PARTICULAS SOLIDAS" },
  { id: 12, riesgo: "ATROPELLAMIENTO POR VEHICULOS" },
  { id: 13, riesgo: "ATRAPAMIENTO POR MAQUINARIA" },
  { id: 14, riesgo: "MOVIMIENTOS REPENTINOS DE MAQUINARIA" },
  { id: 15, riesgo: "SOBRE ESFUERZO" },

  { id: 16, riesgo: "SOBRE EXPOSICION AL RUIDO" },
  { id: 17, riesgo: "GOLPES,CORTES CON OBJETO MOVIL" },
  { id: 18, riesgo: "GOLPES,CORTES CON OBJETO INMOVIL" },
  { id: 19, riesgo: "TRANSMISION MICROORGANISMOS COVID" },
  { id: 20, riesgo: "PERDIDA DEL EQUILIBRIO" },
  { id: 21, riesgo: "GOLPE DE CALOR / DESMAYOS" },
  { id: 22, riesgo: "PICADURAS DE INSECTO" },

  { id: 23, riesgo: "POSTURAS INADECUADAS" },
  { id: 24, riesgo: "DESLUBRAMIENTO/POCA ILUMINACIÓN" },
  { id: 25, riesgo: "HORARIOS LARGOS / TRABAJO NOCTURNO" },
  { id: 26, riesgo: "FATIGA MOVIMIENTOS REPETITIVOS" },
  { id: 27, riesgo: "GASES Y VAPORES TOXICOS" },
  { id: 28, riesgo: "SOBREXPOSICION RADIACION IONIZANTE" },
  { id: 29, riesgo: "CONDICIONES CLIMATICAS" },
];
