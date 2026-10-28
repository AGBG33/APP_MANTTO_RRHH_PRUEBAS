// src/services/rhEmployees.js
// Consulta de EmployeeSet en SAP QAS mediante api.js (token Azure de la app).
import api from "./api";
const EMPLOYEE_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/EmployeeSet";
const RH_QAS_BASE = "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";

export function prepararBusquedaEmpleadoRH(identificador) {
  const texto = String(identificador ?? "").trim();
  if (!texto) throw Error("Ingresa un número de empleado o correo.");
  if (/^\d{1,8}$/.test(texto)) return { tipo: "numero", propiedad: "PersonalNumber", valor: texto.padStart(8, "0") };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) && texto.length <= 241)
    return { tipo: "correo", propiedad: "Email", valor: texto };
  throw Error("Ingresa una nómina de hasta 8 dígitos o un correo válido.");
}
const escapar = s => String(s).replace(/'/g, "''");
const str = (item, key) => String(item?.[key] ?? "").trim();

export function mapearEmpleadoRH(item) {
  return {
    personalNumber: str(item, "PersonalNumber"),
    fullName: str(item, "FullName"),
    email: str(item, "Email"),
    shift: str(item, "Shift"),
    position: str(item, "Position"),
    zone: str(item, "Zone"),
    hourly: str(item, "Hourly"),
    base: str(item, "Base"),
    centerOffice: str(item, "CenterOffice"),
    status: str(item, "Status"),
    descriptionStatus: str(item, "DescriptionStatus"),
    registerType: str(item, "RegisterType"),
    authorisedRegister: str(item, "AuthorisedRegister"),
    centerCode: str(item, "CenterCode"),
    scheduleCode: str(item, "ScheduleCode"),
    scheduleDetail: str(item, "ScheduleDetail"),
    role: str(item, "Role"),
    groupPerson: str(item, "GroupPerson"),
    groupPersonDescription: str(item, "GroupPersonDescription"),
  };
}

export async function obtenerEmpleadoRH(identificador) {
  const filtro = prepararBusquedaEmpleadoRH(identificador);
  try {
    const response = await api.get(EMPLOYEE_SET, {
      baseURL: RH_QAS_BASE, // Garantizar QAS sin tocar el cliente global de mantenimiento.
      params: { $filter: `${filtro.propiedad} eq '${escapar(filtro.valor)}'`, $format: "json" },
      timeout: 45000,
    });
    const items = response?.data?.d?.results;
    if (!Array.isArray(items)) throw Error("SAP devolvió un formato distinto de d.results.");
    const match = items.find(item => {
      if (filtro.tipo === "numero") return str(item, "PersonalNumber").padStart(8, "0") === filtro.valor;
      const email = str(item, "Email");
      return email && email.toLowerCase() === filtro.valor.toLowerCase();
    });
    // No permitimos el fallback de nómina vacía al aplicar políticas de jornada.
    if (!match) return null;
    return { ...mapearEmpleadoRH(match), numeroConfirmadoEnSAP: true };
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401) throw Error("Tu sesión expiró. Inicia sesión nuevamente.");
    if (status === 403) throw Error("SAP rechazó la consulta del empleado por permisos.");
    if (status === 404) throw Error("No se encontró EmployeeSet en QAS.");
    if (status >= 500) throw Error("SAP QAS devolvió un error. Inténtalo después.");
    throw error;
  }
}
export default obtenerEmpleadoRH;