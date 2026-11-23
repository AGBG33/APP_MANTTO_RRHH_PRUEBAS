
/**
 * Acceso central al perfil del empleado SAP.
 *
 * Durante la migración reutilizamos el
 * SapEmployeeContext existente.
 *
 * Posteriormente separaremos los datos
 * generales del empleado de la lógica
 * específica de Recursos Humanos.
 */

export {
  SapEmployeeProvider,
  useSapEmployee,
  correoAutenticadoRH,
} from "../../context/SapEmployeeContext";
