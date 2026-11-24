// src/offline/bootstrapSync.js

import { isOnline } from "./net";
import { fetchOrdenesSupervisor } from "../services/ordenesSupervisor";

/**
 * Convierte una fecha a formato YYYY-MM-DD.
 */
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

/**
 * Precarga inicial de órdenes para Supervisor.
 *
 * Ventana:
 * - 15 días antes de la fecha actual
 * - 15 días después de la fecha actual
 *
 * Esta precarga solamente obtiene la lista de órdenes del rango.
 * Los periodos fuera de esta ventana se consultan después bajo demanda
 * desde la vista de órdenes del supervisor.
 */
export async function bootstrapPrefetchOrdenesSupervisor() {
  const online = await isOnline();

  if (!online) {
    return {
      ok: false,
      reason: "offline",
    };
  }

  const today = new Date();

  const startDate = new Date(today);
  const endDate = new Date(today);

  // 15 días antes
  startDate.setDate(startDate.getDate() - 15);

  // 15 días después
  endDate.setDate(endDate.getDate() + 15);

  const start = ymd(startDate);
  const end = ymd(endDate);

  try {
    const arr = await fetchOrdenesSupervisor(
      start,
      end,
      "range",
    );

    return {
      ok: true,
      reason: "prefetch_completed",
      start,
      end,
      count: Array.isArray(arr) ? arr.length : 0,
    };
  } catch (error) {
    console.log(
      "[BOOTSTRAP SUPERVISOR ERROR]",
      error?.message || error,
    );

    return {
      ok: false,
      reason: "error",
      start,
      end,
      count: 0,
      error: error?.message || String(error),
    };
  }
}