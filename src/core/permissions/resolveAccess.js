// src/core/permissions/resolveAccess.js

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return [
    ...new Set(
      permissions.filter(
        (permission) =>
          typeof permission === "string" &&
          permission.length > 0
      )
    ),
  ];
}

export function resolveAccess(permissions = []) {
  const granted = new Set(normalizePermissions(permissions));

  const can = (permission) =>
    typeof permission === "string" &&
    granted.has(permission);

  const canAny = (required = []) =>
    Array.isArray(required) &&
    required.some((permission) => can(permission));

  const canAll = (required = []) =>
    Array.isArray(required) &&
    required.length > 0 &&
    required.every((permission) => can(permission));

  return {
    permissions: [...granted],
    can,
    canAny,
    canAll,
  };
}