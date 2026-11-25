// CatalogAppTableSet concede Z001 segun Area + Puesto.
// Una vez autorizado Z001, PositionCode decide la vista operativa.
// Las rutas internas siguen siendo /tecnico y /supervisor por compatibilidad.
// Azure autentica; sus roles no conceden acceso.
import { PERMISSIONS } from "./catalog";

export const PUESTOS_MANTENIMIENTO = Object.freeze({
  SUPERVISOR: "50000933",
  TECNICO: "50001003",
  MECANICO: "50001007",
});

// Se conserva la funcion antigua para otros posibles consumidores.
// NO se usa para conceder acceso a los modulos ni para elegir vistas.
export function puestoSap(empleado) {
  return String(empleado?.position || "").trim().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").toUpperCase();
}

export function codigoPuestoSap(empleado) {
  return String(empleado?.positionCode ?? "").trim();
}

export function getUserPermissions(user, employee, moduleCodes = []) {
  if (!user || employee?.numeroConfirmadoEnSAP !== true ||
      String(employee?.status || "").trim() !== "3") return [];
  const codes = new Set(Array.isArray(moduleCodes) ? moduleCodes : []);
  const permissions = new Set();

  if (codes.has("Z002")) permissions.add(PERMISSIONS.RRHH.ACCEDER);

  if (codes.has("Z001")) {
    permissions.add(PERMISSIONS.MANTENIMIENTO.ACCEDER);
    const puesto = codigoPuestoSap(employee);
    if (puesto === PUESTOS_MANTENIMIENTO.SUPERVISOR) {
      permissions.add(PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER);
    } else if (
      puesto === PUESTOS_MANTENIMIENTO.TECNICO ||
      puesto === PUESTOS_MANTENIMIENTO.MECANICO
    ) {
      // MECANICO y TECNICO usan la MISMA vista existente /tecnico.
      permissions.add(PERMISSIONS.MANTENIMIENTO.TECNICO_ACCEDER);
    }
  }
  return [...permissions];
}

export function getMantenimientoRoute(user, employee, moduleCodes = []) {
  const permissions = getUserPermissions(user, employee, moduleCodes);
  if (!permissions.includes(PERMISSIONS.MANTENIMIENTO.ACCEDER)) return null;
  if (permissions.includes(PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER)) return "/supervisor";
  if (permissions.includes(PERMISSIONS.MANTENIMIENTO.TECNICO_ACCEDER)) return "/tecnico";
  return null;
}
