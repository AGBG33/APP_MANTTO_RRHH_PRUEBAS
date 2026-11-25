// Permisos de navegacion: modulos concedidos por SAP, no por azure_roles.
import { useMemo } from "react";
import { useAuth } from "../../core/auth/index";
import { useSapEmployee } from "../../apps/rrhh/context/SapEmployeeContext";
import { useSapModuleAccess } from "../modules/SapModuleAccessContext";
import { resolveAccess } from "../../core/permissions/resolveAccess";
import { getUserPermissions, getMantenimientoRoute } from "../../core/permissions/rolePermissions";

export function usePermissions() {
  const { user, loading: authLoading } = useAuth();
  const { employee, loading: employeeLoading } = useSapEmployee();
  const { moduleCodes, loading: moduleLoading, error: moduleError, source: moduleSource, refresh: refreshModules } = useSapModuleAccess();
  return useMemo(() => {
    const loading = authLoading || (Boolean(user) && (employeeLoading || moduleLoading));
    const ready = !loading && Boolean(user) && Boolean(employee) && !moduleError;
    const access = resolveAccess(ready ? getUserPermissions(user, employee, moduleCodes) : []);
    return {
      ...access,
      loading,
      isAuthenticated: !authLoading && Boolean(user),
      mantenimientoRoute: ready ? getMantenimientoRoute(user, employee, moduleCodes) : null,
      moduleError,
      moduleSource,
      refreshModules,
    };
  }, [user, employee, moduleCodes, authLoading, employeeLoading, moduleLoading, moduleError, moduleSource, refreshModules]);
}
