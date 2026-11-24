// src/offline/avisoAveriaOutbox.js
import { outboxAdd } from "./db";

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ✅ clave para evitar duplicados EXACTOS del mismo aviso
function buildDedupeKey(payload) {
  const orderKey =
    String(payload?.docNumber || "") +
    "|" +
    String(payload?.itmNumber || "") +
    "|" +
    String(payload?.equipment || "");
  const short = String(payload?.shortText || "").slice(0, 40);
  return `avisoAveria:${orderKey}:${short}`;
}

/**
 * Encola creación de aviso para mandarse cuando vuelva internet.
 * OJO: la ruta correcta del backend es /api/aviso-averia/create
 */
export async function enqueueCrearAvisoAveria({ payload }) {
  try {
    const job = {
      id: uid(),
      type: "AVISO_AVERIA_CREATE",
      dedupeKey: buildDedupeKey(payload),
      request: {
        method: "POST",
        url: "/api/aviso-averia/create", // ✅ ESTA ES LA BUENA
        body: payload,
        headers: { "Content-Type": "application/json" },
      },
    };

    const insertedId = await outboxAdd(job);

    // si dedupe evitó inserción, insertedId regresa null
    return { ok: true, queued: !!insertedId, id: insertedId || null };
  } catch (e) {
    console.log("[enqueueCrearAvisoAveria] error:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
