import AsyncStorage from "@react-native-async-storage/async-storage";

const CONSUMIBLES_CACHE_KEY = "consumiblesCatalogo:v1";

function safeStr(v) {
  return String(v ?? "").trim();
}

function pairKey(agr1, agr2) {
  return `${safeStr(agr1).toUpperCase()}__${safeStr(agr2).toUpperCase()}`;
}

function normalizeMaterialRow(r, agr1Fallback, agr2Fallback) {
  const Agrupador1 = safeStr(r?.Agrupador1 || agr1Fallback).toUpperCase();
  const Agrupador2 = safeStr(r?.Agrupador2 || agr2Fallback).toUpperCase();

  return {
    Id: safeStr(r?.Id),
    Material: safeStr(r?.Material),
    Agrupador1,
    Agrupador2,
    Descripcion: safeStr(r?.Descripcion || r?.Description),
    Unidad: safeStr(r?.Unidad).toUpperCase(),
  };
}

function uniqBy(arr, keyFn) {
  const map = new Map();
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!map.has(k)) map.set(k, x);
  }
  return Array.from(map.values());
}

function normalizeMaterialsList(rows = [], agr1Fallback, agr2Fallback) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((r) => normalizeMaterialRow(r, agr1Fallback, agr2Fallback))
    .filter((x) => !!x.Material);

  return uniqBy(
    normalized,
    (x) =>
      `${x.Material}__${x.Descripcion}__${x.Agrupador1}__${x.Agrupador2}__${x.Unidad}`
  );
}

export async function loadConsumiblesCatalogo() {
  try {
    const raw = await AsyncStorage.getItem(CONSUMIBLES_CACHE_KEY);
    return raw ? JSON.parse(raw) : { updatedAt: null, data: {} };
  } catch {
    return { updatedAt: null, data: {} };
  }
}

export async function saveConsumiblesCatalogo(data) {
  const payload = {
    updatedAt: Date.now(),
    data: data && typeof data === "object" ? data : {},
  };

  await AsyncStorage.setItem(CONSUMIBLES_CACHE_KEY, JSON.stringify(payload));
  return payload;
}

export async function mergeConsumiblesPair({
  coverageKey,
  agr1,
  agr2,
  materials,
}) {
  const cov = safeStr(coverageKey).toUpperCase();
  const a1 = safeStr(agr1).toUpperCase();
  const a2 = safeStr(agr2).toUpperCase();

  if (!cov || !a1 || !a2) return false;

  const pk = pairKey(a1, a2);
  const current = await loadConsumiblesCatalogo();

  const nextData = {
    ...(current?.data || {}),
    [cov]: {
      ...((current?.data || {})[cov] || {}),
      [pk]: normalizeMaterialsList(materials, a1, a2),
    },
  };

  await saveConsumiblesCatalogo(nextData);
  return true;
}

export async function getConsumiblesByPair({ coverageKey, agr1, agr2 }) {
  try {
    const cov = safeStr(coverageKey).toUpperCase();
    const a1 = safeStr(agr1).toUpperCase();
    const a2 = safeStr(agr2).toUpperCase();
    const pk = pairKey(a1, a2);

    const cached = await loadConsumiblesCatalogo();
    const arr = cached?.data?.[cov]?.[pk];

    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function getConsumiblesCatalogMeta() {
  try {
    const cached = await loadConsumiblesCatalogo();
    return {
      updatedAt: cached?.updatedAt ?? null,
      coverages: Object.keys(cached?.data || {}),
    };
  } catch {
    return {
      updatedAt: null,
      coverages: [],
    };
  }
}

export function buildConsumiblePairKey(agr1, agr2) {
  return pairKey(agr1, agr2);
}