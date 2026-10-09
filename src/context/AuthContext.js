// src/context/AuthContext.js
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { router } from "expo-router";
import api from "../services/api";

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";

import { authGet, authSet, authDel } from "../offline/db";
import { isOnline } from "../offline/net";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

/*
  Días permitidos para entrar a la app sin internet
  después de haber iniciado sesión correctamente al menos una vez.
*/
const LOCAL_SESSION_DAYS = 15;

/*
  PKCE / SSO:
  - El verifier sólo vive durante el intento de login.
  - Se conserva aunque falle un refresh de la sesión anterior.
  - Se limpia al iniciar un login nuevo o cuando el intercambio termina bien.
*/
const SSO_VERIFIER_KEY = "sso_code_verifier";
const SSO_STARTED_AT_KEY = "sso_started_at";
const SSO_MAX_AGE_MS = 15 * 60 * 1000;

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

function getLocalSessionUntilMs() {
  return Date.now() + LOCAL_SESSION_DAYS * 24 * 60 * 60 * 1000;
}

function isLocalSessionValid(localSessionUntil) {
  if (!localSessionUntil) return false;

  const value = Number(localSessionUntil);

  if (Number.isNaN(value)) return false;

  return Date.now() <= value;
}

/* =========================
   PKCE helpers
   ========================= */

function base64UrlEncodeFromBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makeCodeVerifier() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return base64UrlEncodeFromBytes(bytes);
}

async function makeCodeChallenge(verifier) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isExpired(expiresAtMs, skewSeconds = 60) {
  if (!expiresAtMs) return true;
  return Date.now() >= Number(expiresAtMs) - skewSeconds * 1000;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  const extra = Constants.expoConfig?.extra || {};
  const AZURE_TENANT_ID = extra.AZURE_TENANT_ID;
  const AZURE_CLIENT_ID = extra.AZURE_CLIENT_ID;
  const AZURE_API_SCOPE = extra.AZURE_API_SCOPE || "";
  const AZURE_GRAPH_SCOPE = extra.AZURE_GRAPH_SCOPE || "User.Read";

  const ISSUER = useMemo(() => {
    if (!AZURE_TENANT_ID) return "";
    return `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`;
  }, [AZURE_TENANT_ID]);

  const REDIRECT_URI = useMemo(() => {
    return AuthSession.makeRedirectUri({
      scheme: "mitsuapp",
      path: "auth",
      useProxy: false,
    });
  }, []);

  const refreshTimerRef = useRef(null);
  const ssoInProgressRef = useRef(false);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  /* =========================
     HELPERS SSO SEGUROS
     ========================= */

  const clearSsoAttempt = async (reason = "manual") => {
    try {
      await AsyncStorage.multiRemove([
        SSO_VERIFIER_KEY,
        SSO_STARTED_AT_KEY,
      ]);

      ssoInProgressRef.current = false;

      console.log("[SSO] Intento PKCE limpiado:", reason);
    } catch (e) {
      console.log("[SSO] Error limpiando intento PKCE:", e?.message || e);
    }
  };

  const getSsoAttemptState = async () => {
    try {
      const [verifier, startedAtRaw] = await Promise.all([
        AsyncStorage.getItem(SSO_VERIFIER_KEY),
        AsyncStorage.getItem(SSO_STARTED_AT_KEY),
      ]);

      const startedAt = Number(startedAtRaw || 0);
      const ageMs =
        Number.isFinite(startedAt) && startedAt > 0
          ? Date.now() - startedAt
          : null;

      const fresh =
        !!verifier &&
        ageMs !== null &&
        ageMs >= 0 &&
        ageMs <= SSO_MAX_AGE_MS;

      if (!verifier) {
        ssoInProgressRef.current = false;
      } else if (fresh) {
        ssoInProgressRef.current = true;
      }

      return {
        verifier: verifier || "",
        startedAt: startedAt || 0,
        ageMs,
        fresh,
      };
    } catch (e) {
      console.log("[SSO] Error leyendo estado PKCE:", e?.message || e);

      return {
        verifier: "",
        startedAt: 0,
        ageMs: null,
        fresh: false,
      };
    }
  };

  const hasActiveSsoAttempt = async () => {
    const state = await getSsoAttemptState();

    if (state.verifier && !state.fresh) {
      console.log("[SSO] Se encontró un verifier viejo; se limpiará.");
      await clearSsoAttempt("expired_attempt");
      return false;
    }

    return !!state.fresh;
  };

  /*
    IMPORTANTE:
    La limpieza NORMAL de sesión ya NO borra sso_code_verifier.

    Eso evita que un refresh fallido, un 401 o una restauración de sesión
    eliminen el PKCE mientras Microsoft está devolviendo el callback.

    Sólo se borra el SSO cuando explícitamente se pide preserveSso=false,
    o desde clearSsoAttempt().
  */
  async function clearSessionLocal({ preserveSso = true } = {}) {
    clearRefreshTimer();

    await AsyncStorage.multiRemove([
      "user",
      "token",
      "token_expires_at",
      "local_session_until",
    ]);

    await authDel([
      "access_token",
      "refresh_token",
      "expires_at",
      "user_json",
      "local_session_until",
    ]);

    if (!preserveSso) {
      await clearSsoAttempt("clear_session");
    }
  }

  const buildApiScopes = () => {
    return uniq([
      "openid",
      "profile",
      "email",
      "offline_access",
      AZURE_API_SCOPE,
    ]);
  };

  const buildGraphScopes = () => {
    return uniq([
      "openid",
      "profile",
      "email",
      "offline_access",
      AZURE_GRAPH_SCOPE,
    ]);
  };

  const buildLoginScopes = () => {
    return uniq([
      "openid",
      "profile",
      "email",
      "offline_access",
      AZURE_API_SCOPE,
      AZURE_GRAPH_SCOPE,
    ]);
  };

  const scheduleRefresh = async () => {
    clearRefreshTimer();

    const expAt =
      (await authGet("expires_at")) ||
      (await AsyncStorage.getItem("token_expires_at"));

    if (!expAt) return;

    const msUntil = Math.max(5000, Number(expAt) - Date.now() - 120000);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const online = await isOnline();

        if (!online) {
          console.log("[AUTH] No se refresca token porque no hay internet");
          return;
        }

        /*
          Si justo hay un login SSO en curso, no mezclamos el refresh
          de la sesión anterior con el PKCE actual.
        */
        if (await hasActiveSsoAttempt()) {
          console.log(
            "[AUTH] Refresh timer omitido porque hay un SSO en curso"
          );
          return;
        }

        const r = await refreshAccessToken();

        if (r?.ok) {
          await scheduleRefresh();
        }
      } catch (e) {
        console.log("[AUTH REFRESH TIMER ERROR]", e?.message || e);
      }
    }, msUntil);
  };

  /* =========================
     REFRESH TOKEN
     ========================= */

  const refreshAccessToken = async () => {
    const online = await isOnline();

    if (!online) {
      return { ok: false, reason: "offline" };
    }

    const refreshToken = await authGet("refresh_token");

    if (!refreshToken) {
      return { ok: false, reason: "no_refresh_token" };
    }

    if (!ISSUER || !AZURE_CLIENT_ID) {
      return { ok: false, reason: "missing_azure_config" };
    }

    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

      const tokenResult = await AuthSession.refreshAsync(
        {
          clientId: AZURE_CLIENT_ID,
          refreshToken,
          scopes: buildApiScopes(),
        },
        discovery
      );

      const accessToken = tokenResult?.accessToken;
      const expiresIn = tokenResult?.expiresIn;

      if (!accessToken) {
        return { ok: false, reason: "no_access_token_in_refresh" };
      }

      const expAt =
        Date.now() +
        (typeof expiresIn === "number" ? expiresIn : 50 * 60) * 1000;

      setToken(accessToken);
      setOfflineMode(false);

      await AsyncStorage.setItem("token", accessToken);
      await AsyncStorage.setItem("token_expires_at", String(expAt));

      await authSet("access_token", accessToken);
      await authSet("expires_at", String(expAt));

      if (tokenResult?.refreshToken) {
        await authSet("refresh_token", tokenResult.refreshToken);
      }

      /*
        Renovamos también la sesión local porque hubo una validación online exitosa.
      */
      const localSessionUntil = getLocalSessionUntilMs();

      await AsyncStorage.setItem(
        "local_session_until",
        String(localSessionUntil)
      );

      await authSet("local_session_until", String(localSessionUntil));

      return { ok: true, accessToken, expiresAt: expAt };
    } catch (e) {
      console.log("[REFRESH TOKEN ERROR]", e?.message || e);
      return { ok: false, reason: e?.message || "refresh_failed" };
    }
  };

  /* =========================
     TOKEN GRAPH
     ========================= */

  const acquireGraphAccessToken = async () => {
    const online = await isOnline();
    if (!online) return null;

    const refreshToken = await authGet("refresh_token");
    if (!refreshToken) return null;

    if (!ISSUER || !AZURE_CLIENT_ID) return null;

    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

      const tokenResult = await AuthSession.refreshAsync(
        {
          clientId: AZURE_CLIENT_ID,
          refreshToken,
          scopes: buildGraphScopes(),
        },
        discovery
      );

      const graphAccessToken = tokenResult?.accessToken;

      if (!graphAccessToken) return null;

      if (tokenResult?.refreshToken) {
        await authSet("refresh_token", tokenResult.refreshToken);
      }

      return graphAccessToken;
    } catch (e) {
      console.log("[GRAPH TOKEN ERROR]", e?.message || e);
      return null;
    }
  };

  const fetchMicrosoftProfilePhoto = async (preferredToken = null) => {
    try {
      const graphToken = preferredToken || (await acquireGraphAccessToken());

      console.log("[GRAPH TOKEN EXISTS]", !!graphToken);

      if (!graphToken) return null;

      const res = await fetch(
        "https://graph.microsoft.com/v1.0/me/photo/$value",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${graphToken}`,
          },
        }
      );

      console.log("[GRAPH PHOTO STATUS]", res.status);

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        return null;
      }

      const buffer = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      return `data:image/jpeg;base64,${base64}`;
    } catch (e) {
      console.log("[GRAPH PHOTO ERROR]", e?.message || e);
      return null;
    }
  };

  /* =========================
     LOAD STORAGE
     ========================= */

  useEffect(() => {
    const loadStorage = async () => {
      try {
        const storedToken =
          (await authGet("access_token")) ||
          (await AsyncStorage.getItem("token"));

        const storedExp =
          (await authGet("expires_at")) ||
          (await AsyncStorage.getItem("token_expires_at"));

        const storedUser =
          (await authGet("user_json")) ||
          (await AsyncStorage.getItem("user"));

        const localSessionUntil =
          (await authGet("local_session_until")) ||
          (await AsyncStorage.getItem("local_session_until"));

        const online = await isOnline();

        if (!storedUser) {
          console.log("[AUTH] No hay usuario local guardado");
          setToken(null);
          setUser(null);
          setOfflineMode(false);
          return;
        }

        const parsedUser = JSON.parse(storedUser);

        /*
          Caso 1:
          Hay token y todavía no venció.
          Entramos normal.
        */
        if (storedToken && storedExp && !isExpired(storedExp, 60)) {
          console.log("[AUTH] Sesión online/local válida");

          setToken(storedToken);
          setUser(parsedUser);
          setOfflineMode(false);

          /*
            Si el usuario ya existía antes de implementar local_session_until,
            creamos esa vigencia local para que pueda entrar offline después.
          */
          if (!localSessionUntil) {
            const newLocalSessionUntil = getLocalSessionUntilMs();

            await AsyncStorage.setItem(
              "local_session_until",
              String(newLocalSessionUntil)
            );

            await authSet(
              "local_session_until",
              String(newLocalSessionUntil)
            );

            console.log(
              "[AUTH] Se creó local_session_until para usuario existente"
            );
          }

          await scheduleRefresh();
          return;
        }

        /*
          Caso 2:
          El token venció, pero sí hay internet.
          Intentamos refresh.
        */
        if (online) {
          /*
            Si estamos regresando de Microsoft con un PKCE activo,
            NO intentamos refrescar la sesión vieja.
            El callback /auth se encargará de completar el login nuevo.
          */
          if (await hasActiveSsoAttempt()) {
            console.log(
              "[AUTH] Hay un SSO en curso; se omite refresh de sesión anterior"
            );

            setToken(storedToken || null);
            setUser(parsedUser);
            setOfflineMode(false);
            return;
          }

          console.log("[AUTH] Token vencido. Intentando refresh online...");

          const refreshed = await refreshAccessToken();

          if (refreshed?.ok) {
            const finalToken =
              refreshed?.accessToken ||
              (await authGet("access_token")) ||
              (await AsyncStorage.getItem("token"));

            setToken(finalToken);
            setUser(parsedUser);
            setOfflineMode(false);

            await scheduleRefresh();
            return;
          }

          /*
            Si hay internet y aun así no se pudo refrescar,
            cerramos la sesión anterior, PERO conservamos un posible
            verifier PKCE que pertenezca al login que está regresando.
          */
          console.log(
            "[AUTH] Refresh falló online. Limpiando sesión anterior sin tocar PKCE."
          );

          await clearSessionLocal({ preserveSso: true });

          setToken(null);
          setUser(null);
          setOfflineMode(false);
          return;
        }

        /*
          Caso 3:
          No hay internet.
          Aunque el access token esté vencido, permitimos entrar
          si existe usuario local y la sesión local sigue dentro del límite.

          También cubrimos el caso donde local_session_until aún no existe
          porque el usuario inició sesión antes de agregar esta mejora.
        */
        if (!online && storedUser) {
          let finalLocalSessionUntil = localSessionUntil;

          if (!finalLocalSessionUntil) {
            finalLocalSessionUntil = getLocalSessionUntilMs();

            await AsyncStorage.setItem(
              "local_session_until",
              String(finalLocalSessionUntil)
            );

            await authSet(
              "local_session_until",
              String(finalLocalSessionUntil)
            );

            console.log(
              "[AUTH] Se creó local_session_until para usuario existente en modo offline"
            );
          }

          if (isLocalSessionValid(finalLocalSessionUntil)) {
            console.log("[AUTH] Entrando en modo offline con sesión local");

            setToken(storedToken || null);
            setUser(parsedUser);
            setOfflineMode(true);
            return;
          }
        }

        /*
          Caso 4:
          No hay internet y no existe sesión local vigente.
          No borramos por fuerza, pero no damos acceso.
        */
        console.log("[AUTH] Sin internet y sin sesión local vigente");

        setToken(null);
        setUser(null);
        setOfflineMode(false);
      } catch (e) {
        console.log("[LOAD STORAGE ERROR]", e?.message || e);
        setToken(null);
        setUser(null);
        setOfflineMode(false);
      } finally {
        setLoading(false);
      }
    };

    loadStorage();
  }, []);

  /* =========================
     SSO INICIAR
     ========================= */

  const loginSSO = async () => {
    const online = await isOnline();

    if (!online) {
      throw new Error(
        "No hay conexión a internet. Para iniciar sesión con Microsoft necesitas internet. Si ya habías iniciado sesión antes, la app intentará entrar automáticamente en modo offline al abrirse."
      );
    }

    if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
      throw new Error("Faltan AZURE_TENANT_ID o AZURE_CLIENT_ID en expo.extra");
    }

    if (!ISSUER) {
      throw new Error("ISSUER vacío. Revisa AZURE_TENANT_ID");
    }

    /*
      Antes de iniciar un login NUEVO sí limpiamos cualquier verifier viejo.
      De esta forma nunca reutilizamos un PKCE de otro intento.
    */
    await clearSsoAttempt("before_new_login");

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);
    const scopes = buildLoginScopes();

    const codeVerifier = await makeCodeVerifier();
    const codeChallenge = await makeCodeChallenge(codeVerifier);
    const startedAt = Date.now();

    await AsyncStorage.multiSet([
      [SSO_VERIFIER_KEY, codeVerifier],
      [SSO_STARTED_AT_KEY, String(startedAt)],
    ]);

    ssoInProgressRef.current = true;

    /*
      Verificación inmediata de persistencia.
      NO imprimimos el verifier real por seguridad.
    */
    const verifierGuardado = await AsyncStorage.getItem(SSO_VERIFIER_KEY);

    console.log("[SSO] PKCE guardado antes de abrir Microsoft:", {
      exists: !!verifierGuardado,
      length: verifierGuardado?.length || 0,
      redirectUri: REDIRECT_URI,
    });

    if (!verifierGuardado) {
      ssoInProgressRef.current = false;
      throw new Error(
        "No se pudo guardar el verificador de seguridad del SSO. Intenta nuevamente."
      );
    }

    const authUrl =
      `${discovery.authorizationEndpoint}` +
      `?client_id=${encodeURIComponent(AZURE_CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_mode=query` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256` +
      `&prompt=select_account`;

    console.log("[SSO] Abriendo Microsoft...", {
      redirectUri: REDIRECT_URI,
      scopes: scopes.length,
    });

    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      REDIRECT_URI
    );

    console.log("[SSO] Resultado navegador:", {
      type: result?.type || "unknown",
      hasUrl: !!result?.url,
    });

    /*
      IMPORTANTE:
      Ya NO borramos sso_code_verifier aquí si Android devuelve
      dismiss/cancel.

      En algunos dispositivos el navegador y el deep-link pueden resolverse
      casi al mismo tiempo. Borrarlo aquí puede competir con app/auth.js.

      Si de verdad fue una cancelación, el verifier sobrante es inocuo y se
      elimina automáticamente antes del siguiente login.
    */
    if (result.type === "dismiss" || result.type === "cancel") {
      ssoInProgressRef.current = false;

      /*
        Damos un margen antes de borrar el PKCE.
        En algunos Android el deep-link puede competir con el cierre
        del navegador. Si el callback ya tomó el verifier, esta limpieza
        tardía no le afecta; si fue una cancelación real, no dejamos
        el intento SSO vivo indefinidamente.
      */
      setTimeout(async () => {
        try {
          const currentVerifier =
            await AsyncStorage.getItem(SSO_VERIFIER_KEY);

          if (currentVerifier === codeVerifier) {
            await clearSsoAttempt("browser_cancel_grace_timeout");
          }
        } catch (e) {
          console.log(
            "[SSO] Error en limpieza tardía tras cancelación:",
            e?.message || e
          );
        }
      }, 15000);

      return {
        ok: false,
        cancelled: true,
        type: result.type,
      };
    }

    if (result.type !== "success") {
      ssoInProgressRef.current = false;

      setTimeout(async () => {
        try {
          const currentVerifier =
            await AsyncStorage.getItem(SSO_VERIFIER_KEY);

          if (currentVerifier === codeVerifier) {
            await clearSsoAttempt("browser_non_success_grace_timeout");
          }
        } catch {}
      }, 15000);

      return {
        ok: false,
        cancelled: false,
        type: result.type,
      };
    }

    return { ok: true };
  };

  /* =========================
     SSO FINALIZAR
     ========================= */

  const finishSSO = async (params) => {
    ssoInProgressRef.current = true;

    const code = params?.code;
    const error = params?.error;
    const errorDescription = params?.error_description;

    console.log("[SSO] Callback recibido:", {
      hasCode: !!code,
      error: error || null,
      hasErrorDescription: !!errorDescription,
      redirectUri: REDIRECT_URI,
    });

    if (error === "access_denied" && !code) {
      await clearSsoAttempt("access_denied");
      router.replace("/(auth)/login");
      return { ok: false, cancelled: true };
    }

    if (error) {
      await clearSsoAttempt(`azure_error:${String(error)}`);

      throw new Error(
        `SSO error: ${String(error)}${
          errorDescription ? ` - ${String(errorDescription)}` : ""
        }`
      );
    }

    if (!code) {
      await clearSsoAttempt("callback_without_code");
      throw new Error('No llegó "code" en callback');
    }

    const ssoState = await getSsoAttemptState();

    console.log("[SSO] Estado PKCE al recibir callback:", {
      exists: !!ssoState.verifier,
      length: ssoState.verifier?.length || 0,
      ageMs: ssoState.ageMs,
      fresh: ssoState.fresh,
    });

    if (!ssoState.verifier) {
      ssoInProgressRef.current = false;

      throw new Error(
        "Falta sso_code_verifier. El intento de inicio de sesión perdió su estado local; vuelve a intentar el acceso con Microsoft."
      );
    }

    if (!ssoState.fresh) {
      await clearSsoAttempt("expired_on_callback");

      throw new Error(
        "El intento de inicio de sesión expiró. Vuelve a iniciar sesión con Microsoft."
      );
    }

    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    let tokenResult;

    try {
      tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: AZURE_CLIENT_ID,
          code,
          redirectUri: REDIRECT_URI,
          extraParams: {
            code_verifier: ssoState.verifier,
          },
        },
        discovery
      );
    } catch (e) {
      /*
        No limpiamos antes de registrar el error.
        El próximo login lo limpiará de todas formas.
      */
      console.log("[SSO] Error intercambiando authorization code:", {
        message: e?.message || String(e),
      });

      ssoInProgressRef.current = false;
      throw e;
    }

    const accessToken = tokenResult?.accessToken;
    const expiresIn = tokenResult?.expiresIn;
    const refreshToken = tokenResult?.refreshToken;

    if (!accessToken) {
      ssoInProgressRef.current = false;
      throw new Error("No llegó accessToken. Revisa scopes/consent de Azure.");
    }

    /*
      En este punto el authorization code ya fue intercambiado con éxito.
      El verifier ya cumplió su función y ahora sí se puede borrar sin riesgo.
    */
    await clearSsoAttempt("token_exchange_ok");

    const expAt =
      Date.now() +
      (typeof expiresIn === "number" ? expiresIn : 50 * 60) * 1000;

    await AsyncStorage.setItem("token", accessToken);
    await AsyncStorage.setItem("token_expires_at", String(expAt));

    await authSet("access_token", accessToken);
    await authSet("expires_at", String(expAt));

    if (refreshToken) {
      await authSet("refresh_token", refreshToken);
    }

    let meRes;

    try {
      meRes = await api.get("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (e) {
      const status = e?.response?.status;
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data ||
        e?.message;

      throw new Error(
        `No pude validar en /api/auth/me (${status || "sin status"}): ${String(
          detail
        )}`
      );
    }

    const u = meRes?.data?.user;

    if (!u) {
      throw new Error("Respuesta inválida de /api/auth/me (no viene user)");
    }

    let finalUser = {
      ...u,
      photo: null,
    };

    try {
      let photo = await fetchMicrosoftProfilePhoto(accessToken);

      if (!photo) {
        photo = await fetchMicrosoftProfilePhoto();
      }

      console.log(
        "[GRAPH PHOTO RESULT]",
        photo ? "SI LLEGO FOTO" : "NO LLEGO FOTO"
      );

      if (photo) {
        finalUser.photo = photo;
      }
    } catch (e) {
      console.log("[GRAPH INIT PHOTO ERROR]", e?.message || e);
    }

    setUser(finalUser);
    setToken(accessToken);
    setOfflineMode(false);

    await AsyncStorage.setItem(
      "user",
      JSON.stringify(finalUser)
    );

    await authSet(
      "user_json",
      JSON.stringify(finalUser)
    );

    /*
      Guardamos vigencia de sesión local.
      Esto es lo que permitirá entrar offline después.
    */
    const localSessionUntil = getLocalSessionUntilMs();

    await AsyncStorage.setItem(
      "local_session_until",
      String(localSessionUntil)
    );

    await authSet(
      "local_session_until",
      String(localSessionUntil)
    );

    await scheduleRefresh();

    router.replace(
      pickHomeByRole(finalUser.rol_id)
    );

    return { ok: true };
  };

  /* =========================
     Ensure token
     ========================= */

  const ensureValidToken = async () => {
    const online = await isOnline();

    const expAt =
      (await authGet("expires_at")) ||
      (await AsyncStorage.getItem("token_expires_at"));

    const tok =
      (await authGet("access_token")) ||
      (await AsyncStorage.getItem("token"));

    const storedUser =
      (await authGet("user_json")) ||
      (await AsyncStorage.getItem("user"));

    let localSessionUntil =
      (await authGet("local_session_until")) ||
      (await AsyncStorage.getItem("local_session_until"));

    if (!storedUser) return false;

    /*
      Si no hay internet, no intentamos refrescar ni cerramos sesión.
      Permitimos continuar si la sesión local sigue vigente.

      Si local_session_until no existe, lo creamos para usuarios que ya
      habían iniciado sesión antes de esta mejora.
    */
    if (!online) {
      if (!localSessionUntil) {
        localSessionUntil = getLocalSessionUntilMs();

        await AsyncStorage.setItem(
          "local_session_until",
          String(localSessionUntil)
        );

        await authSet(
          "local_session_until",
          String(localSessionUntil)
        );
      }

      const validLocal = isLocalSessionValid(localSessionUntil);

      if (validLocal) {
        setOfflineMode(true);
      }

      return validLocal;
    }

    /*
      Si hay un SSO activo, NO intentamos refrescar la sesión anterior.
      El login nuevo está a punto de reemplazar el token.
    */
    if (await hasActiveSsoAttempt()) {
      console.log(
        "[AUTH] ensureValidToken omitido temporalmente por SSO en curso"
      );
      return false;
    }

    /*
      Si hay internet, necesitamos token.
    */
    if (!tok || !expAt) return false;

    if (!isExpired(expAt, 60)) {
      setOfflineMode(false);
      return true;
    }

    const r = await refreshAccessToken();

    if (r?.ok) {
      await scheduleRefresh();
      setOfflineMode(false);
      return true;
    }

    return false;
  };

  /* =========================
     LOGOUT
     ========================= */

  const logout = async () => {
    /*
      Si un 401 dispara logout justo mientras Microsoft está devolviendo
      el callback, limpiamos la sesión VIEJA pero NO:
      - borramos el verifier,
      - cerramos el navegador,
      - ni navegamos al login.

      De esa forma app/auth.js puede terminar el SSO nuevo.
    */
    const ssoActive = await hasActiveSsoAttempt();

    if (ssoActive) {
      console.log(
        "[AUTH] Logout solicitado durante SSO; se limpia sólo la sesión anterior"
      );

      await clearSessionLocal({
        preserveSso: true,
      });

      setUser(null);
      setToken(null);
      setOfflineMode(false);
      return;
    }

    /*
      Logout normal: aquí sí limpiamos sesión y cualquier intento PKCE viejo.
    */
    await clearSessionLocal({
      preserveSso: false,
    });

    setUser(null);
    setToken(null);
    setOfflineMode(false);

    try {
      await WebBrowser.clearBrowserSessionAsync();
    } catch {}

    router.replace("/(auth)/login");
  };

  /* =========================
     Foreground refresh
     ========================= */

  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      async (state) => {
        if (state !== "active") return;

        try {
          /*
            Al regresar del navegador de Microsoft Android pone la app
            nuevamente en "active". Si hay PKCE en curso, NO tocamos
            la sesión vieja hasta que app/auth.js termine finishSSO().
          */
          if (await hasActiveSsoAttempt()) {
            console.log(
              "[AUTH] App volvió a foreground con SSO en curso; no se refresca sesión anterior"
            );
            return;
          }

          if (!user) return;

          const online = await isOnline();

          if (!online) {
            console.log(
              "[AUTH] App activa sin internet. Se mantiene sesión local."
            );
            setOfflineMode(true);
            return;
          }

          const ok = await ensureValidToken();

          /*
            No forzamos logout aquí directamente.
            El interceptor de api.js se encargará de cerrar sesión
            si recibe 401 real.
          */
          if (!ok) {
            console.log(
              "[AUTH] No se pudo asegurar token al volver a foreground"
            );
          }
        } catch (e) {
          console.log(
            "[AUTH FOREGROUND ERROR]",
            e?.message || e
          );
        }
      }
    );

    return () => sub?.remove?.();
  }, [user]);

  /* =========================
     Exponer auth a api.js
     ========================= */

  useEffect(() => {
    globalThis.__AUTH__ = {
      ensureValidToken,
      logout,
    };
  }, [ensureValidToken, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        offlineMode,
        loginSSO,
        finishSSO,
        logout,
        ensureValidToken,
        refreshAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);