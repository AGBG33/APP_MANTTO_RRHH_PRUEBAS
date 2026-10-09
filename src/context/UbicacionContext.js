// src/context/UbicacionContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { Alert, AppState, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";
import api from "../services/api";

// ✅ Offline
import { isOnline } from "../offline/net";
import { outboxAdd } from "../offline/db";

const UbicacionContext = createContext();

const msToSapDate = (ms) => `/Date(${ms})/`;
const SEND_EVERY_MS = 30000;
const SAME_EPS = 0.00001;

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * ✅ Equipo activo (Equipment) guardado por la vista de órdenes
 * app/tecnico/ordenes/index.js debe guardar:
 *   key: activeEquipment:<correo>
 *   value: <equipment>
 */
const ACTIVE_EQUIP_KEY = (userEmail) =>
  `activeEquipment:${String(userEmail || "anon").toLowerCase().trim()}`;

async function loadActiveEquipment(userEmail) {
  try {
    const key = ACTIVE_EQUIP_KEY(userEmail);
    const v = await AsyncStorage.getItem(key);
    return String(v || "").trim();
  } catch {
    return "";
  }
}

export const UbicacionProvider = ({ children }) => {
  const { user } = useAuth();

  const [permisosOtorgados, setPermisosOtorgados] = useState(false);
  const [servicesEnabled, setServicesEnabled] = useState(true);

  // Para UI / control
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [locationBlockReason, setLocationBlockReason] = useState(""); // "gps_off" | "permission_denied"

  const watchSubRef = useRef(null);
  const sendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const lastCoordsRef = useRef({ lat: null, lon: null });
  const appStateRef = useRef(AppState.currentState);
  const showingAlertRef = useRef(false);

  // =========================
  // Helpers: abrir settings correctos
  // =========================
  const openLocationServicesSettings = async () => {
    try {
      if (Platform.OS === "android") {
        // ✅ pantalla de "Ubicación" del sistema (GPS)
        await Linking.sendIntent?.("android.settings.LOCATION_SOURCE_SETTINGS");
        // sendIntent no siempre existe -> fallback:
        if (!Linking.sendIntent) await Linking.openSettings();
      } else {
        // iOS: no hay pantalla directa de GPS, abrimos settings de la app
        await Linking.openSettings();
      }
    } catch (e) {
      console.log("[GEO] openLocationServicesSettings error:", e?.message || e);
      try {
        await Linking.openSettings();
      } catch {}
    }
  };

  const openAppSettings = async () => {
    try {
      await Linking.openSettings(); // ✅ abre permisos de la app para elegir "Mientras se usa" / "Siempre"
    } catch (e) {
      console.log("[GEO] openAppSettings error:", e?.message || e);
    }
  };

  const showBlockingAlertOnce = (title, message, actions) => {
    if (showingAlertRef.current) return;
    showingAlertRef.current = true;

    Alert.alert(
      title,
      message,
      actions.map((a) => ({
        text: a.text,
        style: a.style,
        onPress: async () => {
          showingAlertRef.current = false;
          try {
            await a.onPress?.();
          } catch {}
        },
      })),
      { cancelable: false }
    );
  };

  // =========================
  // 1) Permisos + GPS
  // =========================
  const checkPermisosYServicios = async ({ promptUser = false } = {}) => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      setServicesEnabled(enabled);
      console.log("[GEO] servicesEnabled:", enabled);

      if (!enabled) {
        setPermisosOtorgados(false);
        setLocationBlocked(true);
        setLocationBlockReason("gps_off");

        if (promptUser) {
          showBlockingAlertOnce(
            "Activa la ubicación",
            "Para continuar y enviar tu ubicación, activa el GPS en Configuración.",
            [{ text: "Abrir configuración", onPress: openLocationServicesSettings }]
          );
        }
        return false;
      }

      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      console.log("[GEO] getForegroundPermissionsAsync:", { status, canAskAgain });

      if (status !== "granted") {
        // Si podemos pedirlo, mostramos el diálogo nativo
        if (canAskAgain) {
          if (promptUser) {
            const req = await Location.requestForegroundPermissionsAsync();
            console.log("[GEO] requestForegroundPermissionsAsync:", req?.status);

            if (req?.status === "granted") {
              setPermisosOtorgados(true);
              setLocationBlocked(false);
              setLocationBlockReason("");
              return true;
            }
          }
        }

        // Si ya no podemos pedirlo o el usuario lo negó -> settings
        setPermisosOtorgados(false);
        setLocationBlocked(true);
        setLocationBlockReason("permission_denied");

        if (promptUser) {
          showBlockingAlertOnce(
            "Permiso de ubicación requerido",
            "Activa el permiso de ubicación (ideal: “Mientras la app está en uso”).",
            [{ text: "Abrir permisos", onPress: openAppSettings }]
          );
        }
        return false;
      }

      // Todo OK
      setPermisosOtorgados(true);
      setLocationBlocked(false);
      setLocationBlockReason("");
      return true;
    } catch (e) {
      console.log("[GEO] Error check permisos/servicios:", e?.message || e);
      return false;
    }
  };

  // ✅ al montar provider: pide permisos
  useEffect(() => {
    checkPermisosYServicios({ promptUser: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ cuando vuelve a foreground, re-check
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === "active") {
        console.log("[GEO] Foreground -> re-check permisos/servicios");
        await checkPermisosYServicios({ promptUser: true });
      }
    });
    return () => sub?.remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================
  // 2) Enviar o guardar ubicación (✅ incluye EQUIPO activo)
  // =========================
  const postUbicacion = async (lat, lon) => {
    const now = Date.now();
    if (now - lastSentAtRef.current < SEND_EVERY_MS) return;
    if (sendingRef.current) return;

    const correo = user?.correo || user?.email || user?.preferred_username || "";
    if (!correo) return;

    // ✅ leer equipo activo (guardado desde la lista de órdenes)
    const equipoActivo = await loadActiveEquipment(correo);

    const payload = {
      Id: "1",
      Usuario: String(correo),
      Latitud: String(lat),
      Longitud: String(lon),
      Timestamp: msToSapDate(Date.now()),
      Orden: equipoActivo || "", // ✅ AQUÍ VA EL EQUIPO
    };

    const request = {
      method: "POST",
      url: "/api/odata/ZCS_GEOLOZACION_SRV/GeoLocalizacionSet",
      body: payload,
    };

    const minuteBucket = Math.floor(Date.now() / 60000);
    const dedupeKey = `geo:${String(correo)}:${minuteBucket}`;

    try {
      sendingRef.current = true;

      const online = await isOnline();

      if (!online) {
        await outboxAdd({ id: makeId(), type: "POST_UBICACION", request, dedupeKey });
        lastSentAtRef.current = Date.now();
        console.log("[GEO] Offline: guardado en outbox", { dedupeKey, Orden: payload.Orden });
        return;
      }

      console.log("[GEO] Online: enviando ubicación...", { Orden: payload.Orden });
      const res = await api.post(request.url, request.body);
      lastSentAtRef.current = Date.now();
      console.log("[GEO] OK:", res?.status);
    } catch (err) {
      console.log("[GEO] ERROR:", err?.message || err);

      // fallback outbox
      try {
        await outboxAdd({ id: makeId(), type: "POST_UBICACION", request, dedupeKey });
        lastSentAtRef.current = Date.now();
        console.log("[GEO] Fallback: guardado en outbox tras error", { Orden: payload.Orden });
      } catch {}
    } finally {
      sendingRef.current = false;
    }
  };

  // =========================
  // 3) Watcher (solo si permisos + gps + user)
  // =========================
  useEffect(() => {
    const start = async () => {
      // limpia watcher previo
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }

      // Si está bloqueado, NO iniciamos
      if (!permisosOtorgados || !servicesEnabled || !user || locationBlocked) {
        console.log("[GEO] No inicia watch:", {
          permisosOtorgados,
          servicesEnabled,
          user: !!user,
          locationBlocked,
          reason: locationBlockReason,
        });
        return;
      }

      console.log("[GEO] Iniciando watchPositionAsync...");

      try {
        watchSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
            mayShowUserSettingsDialog: true,
          },
          async (loc) => {
            // 🔥 Si el GPS se apaga mientras estaba corriendo, detecta y bloquea
            const enabledNow = await Location.hasServicesEnabledAsync();
            if (!enabledNow) {
              setServicesEnabled(false);
              setLocationBlocked(true);
              setLocationBlockReason("gps_off");

              showBlockingAlertOnce(
                "Activa la ubicación",
                "Se desactivó el GPS. Actívalo para continuar enviando ubicación.",
                [{ text: "Abrir configuración", onPress: openLocationServicesSettings }]
              );

              // apaga watcher
              if (watchSubRef.current) {
                watchSubRef.current.remove();
                watchSubRef.current = null;
              }
              return;
            }

            const lat = loc?.coords?.latitude;
            const lon = loc?.coords?.longitude;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

            const prev = lastCoordsRef.current;
            const same =
              prev.lat != null &&
              prev.lon != null &&
              Math.abs(prev.lat - lat) < SAME_EPS &&
              Math.abs(prev.lon - lon) < SAME_EPS;

            lastCoordsRef.current = { lat, lon };

            console.log("[GEO] coords:", lat, lon, same ? "(same-ish)" : "");
            await postUbicacion(lat, lon);
          }
        );
      } catch (e) {
        console.log("[GEO] Error iniciando watchPositionAsync:", e?.message || e);
      }
    };

    start();

    return () => {
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
    };
  }, [permisosOtorgados, servicesEnabled, user, locationBlocked, locationBlockReason]);

  // Manual: forzar re-check (por si quieres botón en UI)
  const recheckUbicacion = async () => {
    await checkPermisosYServicios({ promptUser: true });
  };

  return (
    <UbicacionContext.Provider
      value={{
        permisosOtorgados,
        servicesEnabled,
        locationBlocked,
        locationBlockReason,
        recheckUbicacion,
      }}
    >
      {children}
    </UbicacionContext.Provider>
  );
};

export const useUbicacion = () => useContext(UbicacionContext);