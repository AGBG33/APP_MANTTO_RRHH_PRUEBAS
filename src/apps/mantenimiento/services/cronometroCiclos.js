import AsyncStorage from "@react-native-async-storage/async-storage";

// Mismas claves de compatibilidad con Front/Ale-dev.
export const TBMK_TIMER_RESET_KEY = (id) =>
  `orderTimerPendingNewTbmk:${String(id || "").trim()}`;
export const ORDER_TIMER_RESET_KEY = (id) => `orderTimerResetAt:${id}`;
export const ORDER_START_KEY = (id) => `orderStart:${id}`;
export const ORDER_FINISH_KEY = (id) => `orderFinish:${id}`;
export const ORDER_ELAPSED_KEY = (id) => `orderElapsed:${id}`;
export const PENDING_SIGN_KEY = (id) => `pendingSign:${id}`;

function aliases(orderId) {
  const id = String(orderId || "").trim();
  if (!id) return [];
  const stripped = /^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, "") : "";
  return [...new Set([id, stripped].filter(Boolean))];
}

export async function marcarNuevoCicloCronometroTbmk(orderId) {
  const ids = aliases(orderId);
  if (!ids.length) throw Error("No se identificó la orden del TBMK.");
  const eventId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  // Guardar el evento en la clave canónica, compartida por ID con/sin ceros.
  await AsyncStorage.setItem(TBMK_TIMER_RESET_KEY(ids[ids.length - 1]), eventId);
}

export async function leerLimiteCronometro(orderId) {
  const ids = aliases(orderId);
  if (!ids.length) return 0;
  const vals = await AsyncStorage.multiGet(ids.map(ORDER_TIMER_RESET_KEY));
  return vals.reduce((max, [, raw]) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.max(max, n) : max;
  }, 0);
}

export async function existeReinicioTbmkPendiente(orderId) {
  const ids = aliases(orderId);
  if (!ids.length) return false;
  const marks = await AsyncStorage.multiGet(ids.map(TBMK_TIMER_RESET_KEY));
  return marks.some(([, v]) => !!v);
}

export async function leerInicioCronometroValido(orderId, { incluirPendiente = false } = {}) {
  const ids = aliases(orderId);
  if (!ids.length || await existeReinicioTbmkPendiente(orderId)) return null;
  const resetAt = await leerLimiteCronometro(orderId);
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(ORDER_START_KEY(id));
    const n = Number(raw);
    if (raw && Number.isFinite(n) && n > resetAt && n <= Date.now() + 60000) return n;
  }
  if (incluirPendiente) {
    for (const id of ids) {
      const raw = await AsyncStorage.getItem(PENDING_SIGN_KEY(id));
      if (!raw) continue;
      try {
        const pending = JSON.parse(raw);
        const n = Number(pending?.orderStartedAtMs);
        if (pending?.orderStartedAtMs != null && Number.isFinite(n) && n > resetAt && n <= Date.now() + 60000) {
          return n;
        }
      } catch { /* Respaldo anterior inválido, se ignora. */ }
    }
  }
  return null;
}

// Confirma que el almacenamiento realmente aceptó la marca antes de habilitar Finalizar.
export async function guardarInicioCronometroConfirmado(orderId, timestamp) {
  const ids = aliases(orderId);
  const requested = Number(timestamp);
  const limit = await leerLimiteCronometro(orderId);
  // Si el usuario inicia en el mismo milisegundo del reset, desplazar 1 ms.
  const ts = Math.max(requested, limit + 1);
  if (!ids.length || !Number.isFinite(requested) || requested <= 0 || ts > Date.now() + 60000) {
    throw Error("Orden u hora de inicio inválidas.");
  }
  if (await existeReinicioTbmkPendiente(orderId)) {
    throw Error("Hay un reinicio del TBMK pendiente de aplicar.");
  }
  await AsyncStorage.multiSet(ids.map(id => [ORDER_START_KEY(id), String(ts)]));
  if (await leerInicioCronometroValido(orderId) !== ts) {
    throw Error("No se pudo confirmar el inicio del cronómetro en almacenamiento.");
  }
  return ts;
}

// La marca de reset se escribe ANTES de borrar fechas antiguas. Si algo falla,
// el evento TBMK queda pendiente para reintento y las fechas viejas no se validan.
export async function aplicarReinicioCronometroTbmk(orderId) {
  const ids = aliases(orderId);
  if (!ids.length) return { reiniciado: false, resetAt: 0 };
  if (!(await existeReinicioTbmkPendiente(orderId))) {
    return { reiniciado: false, resetAt: await leerLimiteCronometro(orderId) };
  }
  const resetAt = Math.max(Date.now(), (await leerLimiteCronometro(orderId)) + 1);
  await AsyncStorage.multiSet(ids.map(id => [ORDER_TIMER_RESET_KEY(id), String(resetAt)]));
  for (const id of ids) {
    const key = PENDING_SIGN_KEY(id);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const pending = JSON.parse(raw);
      if (pending && typeof pending === "object") {
        await AsyncStorage.setItem(key, JSON.stringify({
          ...pending,
          orderStartedAtMs: null,
          orderFinishedAtMs: null,
          orderElapsedMs: null,
        }));
      }
    } catch (error) {
      // No ocultamos fallas de escritura. Solo JSON viejo inválido se ignora.
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  await AsyncStorage.multiRemove(ids.flatMap(id => [
    ORDER_START_KEY(id), ORDER_FINISH_KEY(id), ORDER_ELAPSED_KEY(id),
  ]));
  await AsyncStorage.multiRemove(ids.map(TBMK_TIMER_RESET_KEY));
  return { reiniciado: true, resetAt };
}
