// Reglas puras: el area y el puesto deben coincidir exactamente por CODIGO.
export const normalizarCodigoSAP = value => String(value ?? "").trim().toUpperCase();

export function resolverModulosSAP(empleado, catalogoApps, catalogoAsignaciones, codigosLocales) {
  const area = normalizarCodigoSAP(empleado?.personalArea);
  const puesto = normalizarCodigoSAP(empleado?.positionCode);
  if (!area || !puesto) return [];
  if (!Array.isArray(catalogoApps) || !Array.isArray(catalogoAsignaciones) || !Array.isArray(codigosLocales)) {
    throw new Error("Catalogos SAP con formato invalido");
  }
  const disponibles = new Set(catalogoApps.map(x => normalizarCodigoSAP(x?.Modulo_App)).filter(Boolean));
  const instalados = new Set(codigosLocales.map(normalizarCodigoSAP).filter(Boolean));
  const permisos = new Set();
  for (const fila of catalogoAsignaciones) {
    if (normalizarCodigoSAP(fila?.Area) !== area || normalizarCodigoSAP(fila?.Puesto) !== puesto) continue;
    const modulo = normalizarCodigoSAP(fila?.Modulo);
    if (modulo && disponibles.has(modulo) && instalados.has(modulo)) permisos.add(modulo);
  }
  return [...permisos];
}
