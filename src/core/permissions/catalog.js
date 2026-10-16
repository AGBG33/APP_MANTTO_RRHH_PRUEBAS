// src/core/permissions/catalog.js

export const MODULES = {
  MANTENIMIENTO: "mantenimiento",
  RRHH: "rrhh",
};

export const PERMISSIONS = {
  MANTENIMIENTO: {
    ACCEDER: "mantenimiento.acceder",
    TECNICO_ACCEDER: "mantenimiento.tecnico.acceder",
    SUPERVISOR_ACCEDER: "mantenimiento.supervisor.acceder",
    ORDENES_VER_PROPIAS: "mantenimiento.ordenes.ver_propias",
    ORDENES_VER_EQUIPO: "mantenimiento.ordenes.ver_equipo",
    ORDENES_REGISTRAR: "mantenimiento.ordenes.registrar",
    ORDENES_FINALIZAR: "mantenimiento.ordenes.finalizar",
    ORDENES_REPROGRAMAR: "mantenimiento.ordenes.reprogramar",
    EQUIPOS_VER: "mantenimiento.equipos.ver",
    MONITOREO_VER: "mantenimiento.monitoreo.ver",
  },

  RRHH: {
    ACCEDER: "rrhh.acceder",
    ASISTENCIA_REGISTRAR: "rrhh.asistencia.registrar",
    HISTORIAL_VER_PROPIO: "rrhh.historial.ver_propio",
    HISTORIAL_VER_EQUIPO: "rrhh.historial.ver_equipo",
    INCIDENCIAS_REGISTRAR: "rrhh.incidencias.registrar",
    INCIDENCIAS_AUTORIZAR: "rrhh.incidencias.autorizar",
    REPORTES_VER: "rrhh.reportes.ver",
    POLITICAS_ADMINISTRAR: "rrhh.politicas.administrar",
  },
};