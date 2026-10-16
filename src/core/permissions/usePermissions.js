// src/core/permissions/usePermissions.js

import { useMemo } from "react";

import { useAuth } from "../../context/AuthContext";
import { resolveAccess } from "./resolveAccess";
import {
  getUserPermissions,
  getMantenimientoRoute,
} from "./rolePermissions";

export function usePermissions() {
  const { user, loading } = useAuth();

  return useMemo(() => {
    const access = resolveAccess(
      loading ? [] : getUserPermissions(user)
    );

    return {
      ...access,
      loading,
      isAuthenticated: !loading && Boolean(user),
      mantenimientoRoute:
        !loading && user
          ? getMantenimientoRoute(user)
          : null,
    };
  }, [user, loading]);
}