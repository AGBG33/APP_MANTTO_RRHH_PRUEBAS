
/**
 * Punto de acceso central a la autenticación.
 *
 * Reutiliza AuthContext durante la migración
 * a la nueva arquitectura modular.
 */

export {
  AuthProvider,
  useAuth,
} from "./AuthContext";
