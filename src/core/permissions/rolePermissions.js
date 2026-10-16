// src/core/permissions/rolePermissions.js

import { PERMISSIONS } from "./catalog";

export function getAzureRoles(user) {
  if (!Array.isArray(user?.azure_roles)) {
    return [];
  }

  return [
    ...new Set(
      user.azure_roles
        .filter((role) => typeof role === "string")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function getUserPermissions(user) {
  if (!user) {
    return [];
  }

  const roles = getAzureRoles(user);

  const permissions = new Set([
    PERMISSIONS.RRHH.ACCEDER,
  ]);

  if (roles.includes("tecnico")) {
    permissions.add(PERMISSIONS.MANTENIMIENTO.ACCEDER);
    permissions.add(PERMISSIONS.MANTENIMIENTO.TECNICO_ACCEDER);
  }

  if (roles.includes("supervisor")) {
    permissions.add(PERMISSIONS.MANTENIMIENTO.ACCEDER);
    permissions.add(
      PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER
    );
  }

  return [...permissions];
}

export function getMantenimientoRoute(user) {
  const roles = getAzureRoles(user);

  if (roles.includes("supervisor")) {
    return "/supervisor";
  }

  if (roles.includes("tecnico")) {
    return "/tecnico";
  }

  return null;
}