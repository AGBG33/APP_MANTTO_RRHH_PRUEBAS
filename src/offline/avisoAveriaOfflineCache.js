// src/offline/avisoAveriaOfflineCache.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@mitsu:avisoAveria:";
const safe = (v) => (v == null ? "" : String(v));

const jsonParse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

// ---- META POR ORDEN ----
const keyMeta = (orderid) => `${PREFIX}meta:${safe(orderid).trim()}`;

export async function saveAvisoMetaCache({ orderid, meta }) {
  const k = keyMeta(orderid);
  const payload = {
    savedAt: Date.now(),
    orderid: safe(orderid).trim(),
    meta: meta ?? null,
  };
  await AsyncStorage.setItem(k, JSON.stringify(payload));
  return k;
}

export async function loadAvisoMetaCache({ orderid }) {
  const raw = await AsyncStorage.getItem(keyMeta(orderid));
  if (!raw) return null;
  return jsonParse(raw, null);
}

// ---- CATALOGO R/S/T ----
const keyCatalog = (tipo) => `${PREFIX}catalog:${safe(tipo).trim().toUpperCase()}`;

export async function saveAvisoCatalogCache({ tipo, items }) {
  const k = keyCatalog(tipo);
  const payload = {
    savedAt: Date.now(),
    tipo: safe(tipo).trim().toUpperCase(),
    items: Array.isArray(items) ? items : [],
  };
  await AsyncStorage.setItem(k, JSON.stringify(payload));
  return k;
}

export async function loadAvisoCatalogCache({ tipo }) {
  const raw = await AsyncStorage.getItem(keyCatalog(tipo));
  if (!raw) return null;
  return jsonParse(raw, null);
}

// ---- (Opcional) borrador por orden ----
const keyDraft = (orderid) => `${PREFIX}draft:${safe(orderid).trim()}`;

export async function saveAvisoDraftCache({ orderid, draft }) {
  const payload = { savedAt: Date.now(), orderid: safe(orderid).trim(), draft: draft ?? null };
  await AsyncStorage.setItem(keyDraft(orderid), JSON.stringify(payload));
}
export async function loadAvisoDraftCache({ orderid }) {
  const raw = await AsyncStorage.getItem(keyDraft(orderid));
  if (!raw) return null;
  return jsonParse(raw, null);
}
