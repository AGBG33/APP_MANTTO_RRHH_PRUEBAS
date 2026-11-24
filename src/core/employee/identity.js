
/**
 * Identificación del usuario autenticado.
 *
 * Obtiene el correo de la sesión de Azure.
 * Esta función podrá ser utilizada por todos
 * los módulos de la aplicación.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function obtenerCorreoAutenticado(user) {
  if (!user) return "";

  const opciones = [
    user.correo,
    user.email,
    user.mail,
    user.preferred_username,
    user.userPrincipalName,
    user.upn,
    user.username,
  ];

  const value = opciones.find(
    x => typeof x === "string" &&
      EMAIL_REGEX.test(x.trim())
  );

  return String(value || "").trim().toLowerCase();
}

// Nombre anterior para conservar compatibilidad
// con los componentes existentes de RRHH.
export const correoAutenticadoRH = obtenerCorreoAutenticado;
