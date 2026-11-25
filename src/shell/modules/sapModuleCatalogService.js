// Consultas a los dos catalogos OData, con el mismo cliente autenticado de EmployeeSet.
import api from "../../core/api/index";
import { moduleRegistry } from "./moduleRegistry";
import { resolverModulosSAP } from "./sapModuleRules";

const SAP_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";
const ODATA = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV";

// Nunca seguimos una URL absoluta de __next de SAP: puede referir a un host interno.
// Solo se reutilizan los parametros de paginacion contra el BTP ya configurado.
function parametrosDeSiguiente(next) {
  const texto = String(next ?? "");
  const pos = texto.indexOf("?");
  if (pos < 0) throw new Error("Paginacion OData sin parametros");
  const query = texto.slice(pos + 1);
  const params = { $format: "json" };
  for (const parte of query.split("&")) {
    if (!parte) continue;
    const indice = parte.indexOf("=");
    const clave = decodeURIComponent((indice < 0 ? parte : parte.slice(0, indice)).replace(/\+/g, " "));
    const valor = decodeURIComponent((indice < 0 ? "" : parte.slice(indice + 1)).replace(/\+/g, " "));
    if (clave) params[clave] = valor;
  }
  return params;
}

async function leerColeccionSAP(nombre) {
  const registros = [];
  let params = { $format: "json" };
  const paginas = new Set();
  for (let pagina = 0; pagina < 30; pagina++) {
    const clave = JSON.stringify(params);
    if (paginas.has(clave)) throw new Error("Paginacion SAP repetida en " + nombre);
    paginas.add(clave);
    const respuesta = await api.get(ODATA + "/" + nombre, {
      baseURL: SAP_BASE,
      params,
      timeout: 45000,
    });
    const data = respuesta?.data?.d;
    if (!data || !Array.isArray(data.results)) {
      throw new Error("SAP devolvio un formato invalido para " + nombre);
    }
    registros.push(...data.results);
    if (registros.length > 10000) throw new Error("Catalogo SAP demasiado grande");
    const siguiente = data.__next;
    if (!siguiente) return registros;
    params = parametrosDeSiguiente(siguiente);
  }
  throw new Error("Exceso de paginas en catalogo SAP " + nombre);
}

export async function consultarModulosAutorizadosSAP(empleado) {
  const [catalogo, asignaciones] = await Promise.all([
    leerColeccionSAP("CatalogAppSet"),
    leerColeccionSAP("CatalogAppTableSet"),
  ]);
  return resolverModulosSAP(
    empleado,
    catalogo,
    asignaciones,
    moduleRegistry.map(x => x.sapCode),
  );
}
