// SAP autoriza modulos con Area + Puesto + CatalogAppTableSet.
// Position sigue definiendo SOLO la vista interna de Mantenimiento.
// Azure autentica; azure_roles no concede acceso.
import { PERMISSIONS } from "./catalog";

export function puestoSap(empleado) {
  return String(empleado?.position || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export function getUserPermissions(user, employee, moduleCodes = []) {
  if (!user || employee?.numeroConfirmadoEnSAP !== true ||
      String(employee?.status || "").trim() !== "3") return [];
  const codes = new Set(Array.isArray(moduleCodes) ? moduleCodes : []);
  const permissions = new Set();
  if (codes.has("Z002")) permissions.add(PERMISSIONS.RRHH.ACCEDER);
  if (codes.has("Z001")) {
    permissions.add(PERMISSIONS.MANTENIMIENTO.ACCEDER);
    const puesto = puestoSap(employee);
    if (puesto === "SUPERVISOR") {
      permissions.add(PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER);
    } else if (puesto === "TECNICO") {
      permissions.add(PERMISSIONS.MANTENIMIENTO.TECNICO_ACCEDER);
    }
  }
  return [...permissions];
}

export function getMantenimientoRoute(user, employee, moduleCodes = []) {
  if (!getUserPermissions(user, employee, moduleCodes).includes(PERMISSIONS.MANTENIMIENTO.ACCEDER)) return null;
  const puesto = puestoSap(employee);
  if (puesto === "SUPERVISOR") return "/supervisor";
  if (puesto === "TECNICO") return "/tecnico";
  // No conceder por defecto vistas de supervisor/tecnico a puestos no mapeados.
  return null;
}
