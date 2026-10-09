// src/offline/OfflineProvider.js
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";

import { initDb, outboxReplaceRequestUrl } from "./db";
import { logStorageDiagnostics } from "./storageDiagnostics";
import { subscribeOnline } from "./net";
import { runOutboxSync } from "./syncEngine";
import { processSapQueue } from "./sapQueue";
import api from "../services/api";

const OfflineContext = createContext(null);

export function OfflineProvider({ children, ensureValidToken }) {
  const [dbReady, setDbReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const syncLockRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await initDb();

        await outboxReplaceRequestUrl(
          "/api/aviso-averia/sap",
          "/api/aviso-averia/create"
        );

        // ===========================================
        // DIAGNÓSTICO TEMPORAL DE ALMACENAMIENTO
        // NO BORRA NI MODIFICA INFORMACIÓN
        // ===========================================
        try {
          await logStorageDiagnostics();
        } catch (storageError) {
          console.log(
            "[STORAGE][DIAG] Error ejecutando diagnóstico:",
            storageError?.message || storageError
          );
        }

        if (mounted) setDbReady(true);
      } catch (e) {
        console.log("[OFFLINE] initDb error:", e?.message || e);
        if (mounted) setDbReady(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const syncAll = useCallback(async () => {
    if (!dbReady) return { ok: false, reason: "db_not_ready" };
    if (syncLockRef.current) return { ok: false, reason: "already_syncing" };

    syncLockRef.current = true;
    setSyncing(true);

    try {
      // 1) ✅ Sync del outbox SQLite (tu backend)
      const r1 = await runOutboxSync(api, { limit: 30 });

      // 2) ✅ Sync de SAP queue (evidencias/pdf/status)
      const r2 = await processSapQueue({
        ensureValidToken,
        apiInstance: api,
      });

      const ok = !!(r1?.ok !== false && r2?.ok !== false);
      if (ok) setLastSync(Date.now());

      return { ok, outbox: r1, sap: r2 };
    } catch (e) {
      console.log("[OFFLINE] syncAll error:", e?.message || e);
      return { ok: false, error: e?.message || String(e) };
    } finally {
      syncLockRef.current = false;
      setSyncing(false);
    }
  }, [dbReady, ensureValidToken]);

  useEffect(() => {
    const unsub = subscribeOnline(async (isOn) => {
      setOnline(isOn);

      // ✅ Cuando vuelve a online y ya hay DB, intenta sincronizar todo
      if (isOn && dbReady) {
        await syncAll();
      }
    });

    return () => unsub && unsub();
  }, [dbReady, syncAll]);

  const value = useMemo(
    () => ({
      dbReady,
      online,
      lastSync,
      syncing,
      syncNow: syncAll, // ✅ por si lo quieres disparar manual
    }),
    [dbReady, online, lastSync, syncing, syncAll]
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
