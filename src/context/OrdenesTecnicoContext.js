// src/context/OrdenesTecnicoContext.js

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppState } from "react-native";

import { useAuth } from "./AuthContext";
import { useOffline } from "../offline/OfflineProvider";

import {
  loadOrdenesTecnicoList,
  ORDENES_CACHE_TTL_MS,
  isCacheFresh,
} from "../offline/ordenesTecnicoCache";

import {
  getLocalStatusPatch,
  applyStatusPatchToOrdenes,
} from "../offline/ordenesTecnicoLocalPatch";

import { bootstrapPrefetchOrdenesTecnico } from "../offline/bootstrapSyncTecnico";

const OrdenesTecnicoContext = createContext(null);

function getUserEmail(user) {
  return String(
    user?.email ||
      user?.correo ||
      user?.upn ||
      user?.username ||
      "",
  )
    .trim()
    .toLowerCase();
}

export function OrdenesTecnicoProvider({ children }) {
  const { user } = useAuth();
  const { online } = useOffline() || {};

  const userEmail = useMemo(() => getUserEmail(user), [user]);

  const [ordenes, setOrdenes] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingBackground, setSyncingBackground] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  const syncLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Carga la lista local y después aplica los cambios
   * de estatus guardados localmente.
   *
   * El estatus local tiene prioridad sobre una respuesta
   * atrasada de SAP.
   */
  const loadLocal = useCallback(async () => {
    if (!userEmail) {
      if (mountedRef.current) {
        setOrdenes([]);
        setLastUpdatedAt(null);
      }

      return null;
    }

    try {
      const [cached, patchMap] = await Promise.all([
        loadOrdenesTecnicoList(userEmail),
        getLocalStatusPatch(userEmail),
      ]);

      const cachedData = Array.isArray(cached?.data)
        ? cached.data
        : [];

      const effectiveData = applyStatusPatchToOrdenes(
        cachedData,
        patchMap,
      );

      if (mountedRef.current) {
        setOrdenes(effectiveData);
        setLastUpdatedAt(cached?.updatedAt || null);
      }

      if (cached) {
        return {
          ...cached,
          data: effectiveData,
        };
      }

      return {
        updatedAt: null,
        window: null,
        data: effectiveData,
      };
    } catch (error) {
      console.log(
        "[OrdenesTecnicoContext] Error aplicando estatus locales:",
        error?.message || error,
      );

      const cached = await loadOrdenesTecnicoList(userEmail);

      const cachedData = Array.isArray(cached?.data)
        ? cached.data
        : [];

      if (mountedRef.current) {
        setOrdenes(cachedData);
        setLastUpdatedAt(cached?.updatedAt || null);
      }

      return cached;
    }
  }, [userEmail]);

  /**
   * Permite que otras pantallas vuelvan a leer inmediatamente
   * los cambios locales sin consultar nuevamente SAP.
   */
  const reloadLocalStatus = useCallback(async () => {
    return loadLocal();
  }, [loadLocal]);

  /**
   * Sincroniza la lista principal y comienza/reanuda la
   * precarga de detalles en segundo plano.
   */
  const synchronize = useCallback(
    async ({ force = false, manual = false } = {}) => {
      if (!userEmail) {
        return {
          ok: false,
          reason: "missing_user",
        };
      }

      if (syncLockRef.current) {
        return {
          ok: false,
          reason: "already_syncing",
        };
      }

      syncLockRef.current = true;

      if (mountedRef.current) {
        setLastError(null);

        if (manual) {
          setRefreshing(true);
        } else {
          setSyncingBackground(true);
        }
      }

      try {
        const result = await bootstrapPrefetchOrdenesTecnico(
          userEmail,
          {
            force,
            prefetchDetails: true,
            ttlMs: ORDENES_CACHE_TTL_MS,
          },
        );

        /*
         * Si SAP respondió correctamente, usamos directamente la lista
         * que bootstrap acaba de reconciliar y guardar. Así una recarga
         * manual no vuelve a cubrir la respuesta nueva con una lectura
         * anterior del caché.
         *
         * Si se trabajó sin conexión o falló SAP, conservamos la carga local.
         */
        let cached = null;

        if (
          result?.ok &&
          result?.source === "sap" &&
          Array.isArray(result?.data)
        ) {
          cached = {
            updatedAt: result?.updatedAt || Date.now(),
            window: result?.window || null,
            data: result.data,
          };

          if (mountedRef.current) {
            setOrdenes(result.data);
            setLastUpdatedAt(cached.updatedAt);
          }
        } else {
          cached = await loadLocal();
        }

        if (mountedRef.current && result?.error) {
          setLastError(result.error);
        }

        return {
          ...result,
          cached,
        };
      } catch (error) {
        console.error(
          "[OrdenesTecnicoContext] Error sincronizando órdenes:",
          error,
        );

        if (mountedRef.current) {
          setLastError(error);
        }

        /*
         * Si SAP o la conexión fallan, conservamos visible
         * la información guardada localmente.
         */
        const cached = await loadLocal();

        return {
          ok: false,
          reason: "sync_error",
          error,
          cached,
        };
      } finally {
        syncLockRef.current = false;

        if (mountedRef.current) {
          setRefreshing(false);
          setSyncingBackground(false);
        }
      }
    },
    [loadLocal, userEmail],
  );

  /**
   * Actualización manual.
   *
   * force=true obliga a consultar nuevamente la lista de SAP.
   */
  const refresh = useCallback(async () => {
    return synchronize({
      force: true,
      manual: true,
    });
  }, [synchronize]);

  /**
   * Revisa la lista y la precarga.
   *
   * Si la lista está vigente:
   * - No se descarga nuevamente desde SAP.
   * - Sí se revisan y precargan los detalles faltantes.
   *
   * Si la lista está vencida:
   * - Se actualiza desde SAP.
   * - Después se revisan los detalles.
   */
  const refreshIfNeeded = useCallback(async () => {
    if (!userEmail) {
      return {
        ok: false,
        reason: "missing_user",
      };
    }

    const cached = await loadLocal();

    const cacheIsFresh = isCacheFresh(
      cached?.updatedAt,
      ORDENES_CACHE_TTL_MS,
    );

    /*
     * Sin internet solamente mostramos la información local.
     * No intentamos ejecutar la precarga.
     */
    if (online === false) {
      return {
        ok: true,
        source: "cache",
        fresh: cacheIsFresh,
        offline: true,
        data: cached?.data || [],
      };
    }

    /*
     * Siempre ejecutamos bootstrap si existe conexión:
     *
     * - Si cacheIsFresh=true, bootstrap utiliza la lista local
     *   y solamente revisa los detalles.
     *
     * - Si cacheIsFresh=false, bootstrap consulta la lista SAP
     *   y después revisa los detalles.
     */
    return synchronize({
      force: false,
      manual: false,
    });
  }, [loadLocal, online, synchronize, userEmail]);

  /*
   * Carga inicial:
   *
   * 1. Muestra primero la información local.
   * 2. Aplica los estatus locales pendientes.
   * 3. Revisa si la lista todavía está vigente.
   * 4. Si hay internet, inicia o reanuda la sincronización.
   * 5. La interfaz no espera a que termine la precarga.
   */
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!userEmail) {
        if (!cancelled && mountedRef.current) {
          setOrdenes([]);
          setLastUpdatedAt(null);
          setLoadingInitial(false);
        }

        return;
      }

      try {
        const cached = await loadLocal();

        if (!cancelled && mountedRef.current) {
          setLoadingInitial(false);
        }

        const cacheIsFresh = isCacheFresh(
          cached?.updatedAt,
          ORDENES_CACHE_TTL_MS,
        );

        console.log(
          "[OrdenesTecnicoContext] Estado de caché inicial:",
          {
            cacheIsFresh,
            online,
            totalOrdenes: Array.isArray(cached?.data)
              ? cached.data.length
              : 0,
          },
        );

        /*
         * Si existe conexión, siempre ejecutamos bootstrap:
         *
         * - Lista vencida: consulta SAP y precarga detalles.
         * - Lista vigente: no consulta la lista SAP; solamente
         *   revisa y completa los detalles que falten.
         *
         * No usamos await para mostrar inmediatamente la interfaz.
         */
        if (online !== false) {
          synchronize({
            force: false,
            manual: false,
          }).catch((error) => {
            console.log(
              "[OrdenesTecnicoContext] Error iniciando sincronización:",
              error?.message || error,
            );
          });
        }
      } catch (error) {
        console.error(
          "[OrdenesTecnicoContext] Error cargando caché inicial:",
          error,
        );

        if (!cancelled && mountedRef.current) {
          setLastError(error);
          setLoadingInitial(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [loadLocal, online, synchronize, userEmail]);

  /*
   * Cuando vuelve la conexión, revisa la lista y reanuda
   * la precarga de detalles.
   */
  useEffect(() => {
    if (!userEmail || online !== true) {
      return;
    }

    refreshIfNeeded().catch((error) => {
      console.log(
        "[OrdenesTecnicoContext] Error al regresar la conexión:",
        error?.message || error,
      );
    });
  }, [online, refreshIfNeeded, userEmail]);

  /*
   * Cuando la aplicación vuelve desde segundo plano:
   *
   * - Vuelve a leer los parches locales.
   * - Revisa si la lista necesita actualizarse.
   * - Reanuda los detalles faltantes.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          refreshIfNeeded().catch((error) => {
            console.log(
              "[OrdenesTecnicoContext] Error al volver a la app:",
              error?.message || error,
            );
          });
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [refreshIfNeeded]);

  const value = useMemo(
    () => ({
      ordenes,
      loadingInitial,
      refreshing,
      syncingBackground,
      lastUpdatedAt,
      lastError,
      userEmail,
      online,

      loadLocal,
      reloadLocalStatus,
      synchronize,
      refresh,
      refreshIfNeeded,
    }),
    [
      ordenes,
      loadingInitial,
      refreshing,
      syncingBackground,
      lastUpdatedAt,
      lastError,
      userEmail,
      online,
      loadLocal,
      reloadLocalStatus,
      synchronize,
      refresh,
      refreshIfNeeded,
    ],
  );

  return (
    <OrdenesTecnicoContext.Provider value={value}>
      {children}
    </OrdenesTecnicoContext.Provider>
  );
}

export function useOrdenesTecnico() {
  const context = useContext(OrdenesTecnicoContext);

  if (!context) {
    throw new Error(
      "useOrdenesTecnico debe usarse dentro de OrdenesTecnicoProvider",
    );
  }

  return context;
}