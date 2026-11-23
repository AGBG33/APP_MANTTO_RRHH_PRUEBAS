
/**
 * Registro central de módulos.
 *
 * Aquí se registran los módulos instalados
 * en la aplicación.
 *
 * Las autorizaciones provendrán de SAP.
 */

import { mantenimientoModule } from
  "../../apps/mantenimiento/module";

import { rrhhModule } from
  "../../apps/rrhh/module";

// Módulos disponibles en la aplicación.
export const moduleRegistry = [
  mantenimientoModule,
  rrhhModule,
];

/**
 * Buscar un módulo por su código SAP.
 */
export function getModuleBySapCode(sapCode) {
  const code = String(sapCode ?? "")
    .trim()
    .toUpperCase();

  return moduleRegistry.find(
    (modulo) => modulo.sapCode === code
  ) ?? null;
}

/**
 * Obtener únicamente los módulos
 * autorizados por SAP.
 *
 * Ejemplo de entrada:
 * ["Z001", "Z002"]
 */
export function getAuthorizedModules(sapCodes = []) {
  const codes = new Set(
    (Array.isArray(sapCodes) ? sapCodes : [])
      .map((code) =>
        String(code ?? "").trim().toUpperCase()
      )
  );

  return moduleRegistry.filter(
    (modulo) => codes.has(modulo.sapCode)
  );
}
