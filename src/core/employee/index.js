
/**
 * Acceso central a la información del empleado.
 *
 * Durante la migración, el proveedor de perfil
 * SAP continúa utilizando su implementación actual.
 */

export {
  SapEmployeeProvider,
  useSapEmployee,
} from "./SapEmployeeContext";

export {
  obtenerCorreoAutenticado,
  correoAutenticadoRH,
} from "./identity";
