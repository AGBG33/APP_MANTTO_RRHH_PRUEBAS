// src/services/avisoAveriaSap.js
import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const PREFIX = "@mitsu:avisoAveria:";
const keyMeta = (orderid) => `${PREFIX}meta:${String(orderid || "").trim()}`;
const keyCatalog = (catalogo) =>
  `${PREFIX}catalog:${String(catalogo || "").trim().toUpperCase()}`;

const jsonParse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

async function isOnlineNow() {
  const st = await NetInfo.fetch();
  return !!st?.isConnected && st?.isInternetReachable !== false;
}

export async function fetchMetaAviso(orderid, token) {
  if (!orderid || orderid === "undefined" || orderid === "null") {
    throw new Error("orderid inválido al cargar meta de aviso");
  }

  const k = keyMeta(orderid);

  const cachedRaw = await AsyncStorage.getItem(k);
  const cached = cachedRaw ? jsonParse(cachedRaw, null) : null;

  const online = await isOnlineNow();
  if (!online) {
    if (cached?.data) return cached.data;
    throw new Error("Sin conexión y no hay datos cacheados de la meta del aviso.");
  }

  try {
    const res = await api.get(`/api/aviso-averia/meta/${encodeURIComponent(orderid)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    const payload = { savedAt: Date.now(), data: res.data };
    await AsyncStorage.setItem(k, JSON.stringify(payload));
    return res.data;
  } catch (e) {
    if (cached?.data) return cached.data;
    throw e;
  }
}

export async function fetchCatalogoCircunstancia(catalogo, token) {
  const cat = String(catalogo || "").trim().toUpperCase();
  const k = keyCatalog(cat);

  const cachedRaw = await AsyncStorage.getItem(k);
  const cached = cachedRaw ? jsonParse(cachedRaw, null) : null;

  const online = await isOnlineNow();
  if (!online) {
    if (cached?.data) return cached.data;
    return [];
  }

  try {
    const res = await api.get(`/api/aviso-averia/catalogos/circunstancia`, {
      params: { catalogo: cat },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    const payload = { savedAt: Date.now(), data: res.data };
    await AsyncStorage.setItem(k, JSON.stringify(payload));
    return res.data;
  } catch (e) {
    if (cached?.data) return cached.data;
    throw e;
  }
}

export async function crearAvisoAveriaSap(payload, token) {
  try {
    const res = await api.post(`/api/aviso-averia/create`, payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return res.data;
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("timeout")) {
      throw new Error(
        "Sin conexión: no se puede crear el aviso en este momento. Se recomienda guardar offline desde la vista."
      );
    }
    throw e;
  }
}

/**
 * Precarga en segundo plano los catálogos que usa el aviso de avería.
 * Esto permite que después se muestren daños, localizaciones y causas
 * aunque el técnico abra el formulario sin internet.
 */
export async function preloadAvisoAveriaCatalogos(token) {
  const online = await isOnlineNow();

  if (!online) {
    console.log("[AVISO-AVERIA][PRELOAD] Sin conexión, no se precargan catálogos.");
    return {
      ok: false,
      offline: true,
      results: {},
    };
  }

  const catalogos = ["R", "S", "T"];
  const results = {};

  await Promise.all(
    catalogos.map(async (cat) => {
      try {
        const data = await fetchCatalogoCircunstancia(cat, token);
        results[cat] = Array.isArray(data) ? data.length : 0;

        console.log("[AVISO-AVERIA][PRELOAD] Catálogo cargado:", {
          catalogo: cat,
          total: results[cat],
        });
      } catch (e) {
        results[cat] = 0;

        console.log("[AVISO-AVERIA][PRELOAD] Error cargando catálogo:", {
          catalogo: cat,
          error: e?.message || String(e),
        });
      }
    }),
  );

  return {
    ok: true,
    offline: false,
    results,
  };
}
