// src/services/rhEmployees.js
// Consulta de empleados de RR. HH. por numero de personal o correo.
// Usa el cliente Axios existente, que incorpora la URL QAS y el token SSO.

import api from "./api";

const EMPLOYEE_SET = "/api/odata/ZHMC_ATTENDANCE_MONITORING_SRV/EmployeeSet";

/**
 * El numero de personal es Edm.String (longitud maxima de 8) en SAP.
 * Ejemplo: 4281 -> 00004281.
 * Para las pruebas por correo, el metodo ABAP GET_FILTERS acepta Email.
 */
export function prepararBusquedaEmpleadoRH(identificador) {
  const texto = String(identificador ?? "").trim();

  if (!texto) {
    throw new Error("Escribe un numero de empleado o correo electronico.");
  }

  if (/^\d+$/.test(texto)) {
    if (texto.length > 8) {
      throw new Error("El numero de empleado debe tener maximo 8 digitos.");
    }

    return {
      tipo: "numero",
      propiedad: "PersonalNumber",
      valor: texto.padStart(8, "0"),
    };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) && texto.length <= 241) {
    return {
      tipo: "correo",
      propiedad: "Email",
      valor: texto,
    };
  }

  throw new Error("Ingresa un numero de empleado valido o un correo electronico valido.");
}

// Evita que un apostrofe rompa el literal de cadena en OData.
function escaparTextoOData(valor) {
  return String(valor).replace(/'/g, "''");
}

// Mapea solamente los campos definidos en el metadata de EmployeeSet.
function mapearEmpleadoRH(item) {
  const campo = (nombre) => String(item?.[nombre] ?? "").trim();

  return {
    personalNumber: campo("PersonalNumber"),
    fullName: campo("FullName"),
    email: campo("Email"),
    shift: campo("Shift"),
    position: campo("Position"),
    zone: campo("Zone"),
    hourly: campo("Hourly"),
    base: campo("Base"),
    centerOffice: campo("CenterOffice"),
    status: campo("Status"),
    descriptionStatus: campo("DescriptionStatus"),
    registerType: campo("RegisterType"),
    authorisedRegister: campo("AuthorisedRegister"),
  };
}

/**
 * Consulta EmployeeSet en SAP.
 * @param {string|number} identificador - Por ejemplo: "4281" o "correo@empresa.com"
 * @returns {Promise<object|null>} Empleado normalizado, o null si no se encontro.
 *
 * IMPORTANTE: Esta busqueda por numero/correo es solo para pruebas de interfaz.
 * La autorizacion para ver los datos del empleado debe imponerse en backend/SAP.
 */
export async function obtenerEmpleadoRH(identificador) {
  const busqueda = prepararBusquedaEmpleadoRH(identificador);
  const filtro = `${busqueda.propiedad} eq '${escaparTextoOData(busqueda.valor)}'`;

  try {
    const respuesta = await api.get(EMPLOYEE_SET, {
      params: {
        $filter: filtro,
        $format: "json",
      },
    });

    const resultados = respuesta?.data?.d?.results;
    if (!Array.isArray(resultados)) {
      throw new Error("SAP devolvio un formato de respuesta inesperado.");
    }

    // El servicio esta pensado para devolver un empleado por consulta.
    // Si el filtro por numero fuera ignorado, no mostramos otro empleado.
    const encontrado = resultados.find((item) => {
      if (busqueda.tipo === "numero") {
        return String(item?.PersonalNumber ?? "").padStart(8, "0") === busqueda.valor;
      }
      // ABAP busca por PA0105-USRID, pero responde con USRID_LONG.
      // En algunos registros Email puede venir vacio aunque la busqueda sea valida.
      const email = String(item?.Email ?? "").trim();
      if (email) return email.toLowerCase() === busqueda.valor.toLowerCase();
      return resultados.length === 1 && Boolean(item?.PersonalNumber);
    });

    // Fallback temporal SOLO para consultar datos en QAS.
    // El servicio ABAP a veces responde un unico resultado con PersonalNumber vacio.
    // No significa que SAP haya confirmado la identidad de la persona.
    if (!encontrado && busqueda.tipo === "numero" && resultados.length === 1) {
      const item = resultados[0];
      const numeroDevuelto = String(item?.PersonalNumber ?? "").trim();
      const nombreDevuelto = String(item?.FullName ?? "").trim();
      if (!numeroDevuelto && nombreDevuelto) {
        return {
          ...mapearEmpleadoRH(item),
          personalNumber: busqueda.valor,
          numeroConfirmadoEnSAP: false,
        };
      }
    }

    if (!encontrado) return null;
    return {
      ...mapearEmpleadoRH(encontrado),
      numeroConfirmadoEnSAP: true,
    };
  } catch (error) {
    if (!error?.response && error instanceof Error &&
        error.message === "SAP devolvio un formato de respuesta inesperado.") {
      throw error;
    }

    const status = error?.response?.status;
    if (status === 401) {
      throw new Error("Tu sesion expiro. Inicia sesion nuevamente.");
    }
    if (status === 403) {
      throw new Error("No tienes permiso para consultar los datos del empleado.");
    }
    if (status === 404) {
      throw new Error("No se encontro el servicio de empleados en el servidor.");
    }
    if (status && status >= 500) {
      throw new Error("SAP no esta disponible temporalmente. Intenta de nuevo.");
    }
    if (!error?.response && /network error|timeout|connection/i.test(String(error?.message || ""))) {
      throw new Error("No fue posible conectar con SAP. Verifica tu conexion a internet.");
    }
    throw error;
  }
}

export default obtenerEmpleadoRH;