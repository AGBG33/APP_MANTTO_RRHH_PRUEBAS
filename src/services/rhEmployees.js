
/**
 * Compatibilidad temporal durante la migración.
 *
 * El servicio de consulta del empleado SAP
 * ahora pertenece al núcleo compartido.
 */

export * from "../core/employee/employeeService";

export { default } from "../core/employee/employeeService";
