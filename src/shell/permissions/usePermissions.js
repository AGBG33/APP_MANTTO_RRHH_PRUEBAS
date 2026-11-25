// Se habilita Mantenimiento por SAP Position; nunca por azure_roles.
import { useMemo } from "react";
import { useAuth } from "../../core/auth/index";
import { useSapEmployee } from "../../apps/rrhh/context/SapEmployeeContext";
import { resolveAccess } from "../../core/permissions/resolveAccess";
import { getUserPermissions, getMantenimientoRoute } from "../../core/permissions/rolePermissions";

export function usePermissions() {
  const { user, loading: authLoading } = useAuth();
  const { employee, loading: sapLoading } = useSapEmployee();
  return useMemo(() => {
    const loading = authLoading || (Boolean(user) && sapLoading);
    const access = resolveAccess(loading ? [] : getUserPermissions(user, employee));
    return { ...access, loading, isAuthenticated: !authLoading && Boolean(user),
      mantenimientoRoute: !loading ? getMantenimientoRoute(user, employee) : null };
  }, [user, employee, authLoading, sapLoading]);
}