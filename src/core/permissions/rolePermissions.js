// Autorización de módulos desde EmployeeSet (Position); Azure solo autentica.
import { PERMISSIONS } from "./catalog";

export function puestoSap(empleado) {
  return String(empleado?.position || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export function getUserPermissions(user, employee) {
  if (!user) return [];
  const permissions = new Set([PERMISSIONS.RRHH.ACCEDER]);
  const activo = String(employee?.status || "").trim() === "3";
  if (!activo) return [...permissions];
  const puesto = puestoSap(employee);
  if (puesto === "SUPERVISOR") {
    permissions.add(PERMISSIONS.MANTENIMIENTO.ACCEDER);
    permissions.add(PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER);
  } else if (puesto === "TECNICO") {
    permissions.add(PERMISSIONS.MANTENIMIENTO.ACCEDER);
    permissions.add(PERMISSIONS.MANTENIMIENTO.TECNICO_ACCEDER);
  }
  return [...permissions];
}

export function getMantenimientoRoute(user, employee) {
  if (!user || String(employee?.status || "").trim() !== "3") return null;
  const puesto = puestoSap(employee);
  if (puesto === "SUPERVISOR") return "/supervisor";
  if (puesto === "TECNICO") return "/tecnico";
  return null;
}