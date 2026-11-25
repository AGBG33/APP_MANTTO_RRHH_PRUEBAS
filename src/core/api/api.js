// src/services/api.js
import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOnline } from "../offline/net";

const extra = Constants.expoConfig?.extra || {};

// UNA SOLA BASE (BTP QAS)
export const API_URL =
  extra.API_BASE_URL_PROD ||
  "https://my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com";

const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
});

// ✅ Request interceptor
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const method = (config.method || "GET").toUpperCase();
    console.log("[API]", method, `${config.baseURL}${config.url}`);

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Response error log + manejo seguro de 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    const original = err?.config;

    console.log("[API ERROR]", {
      message: err?.message,
      url: err?.config?.url,
      baseURL: err?.config?.baseURL,
      status,
      data: err?.response?.data,
    });

    const online = await isOnline();

    /*
      Si no hay internet, NO cerramos sesión.
      Dejamos que la pantalla o servicio maneje el error offline.
    */
    if (!online) {
      console.log("[API ERROR] Sin internet. No se cierra sesión.");
      return Promise.reject(err);
    }

    /*
      Si hay internet y el backend responde 401:
      intentamos refrescar token una sola vez.
    */
    if (status === 401 && original && !original._retry) {
      original._retry = true;

      try {
        const auth = globalThis.__AUTH__;
        const ok = await auth?.ensureValidToken?.();

        if (ok) {
          const newToken = await AsyncStorage.getItem("token");

          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
          }

          return api(original);
        }

        /*
          Solo cerramos sesión si:
          - hay internet
          - hubo 401 real del backend
          - no se pudo renovar token
        */
        await auth?.logout?.();
      } catch (e) {
        console.log("[API 401 HANDLER ERROR]", e?.message || e);
      }
    }

    return Promise.reject(err);
  }
);

export default api;