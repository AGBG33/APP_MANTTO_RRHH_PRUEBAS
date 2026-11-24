// src/offline/syncEngine.js
import { outboxList, outboxMarkSending, outboxMarkSent, outboxMarkError, outboxDeleteSent } from "./db";
import { isOnline } from "./net";

// apiInstance = tu axios (src/services/api)
export async function runOutboxSync(apiInstance, { limit = 20 } = {}) {
  const online = await isOnline();
  if (!online) return { ok: false, reason: "offline" };

  const items = await outboxList(limit);
  if (!items.length) return { ok: true, processed: 0 };

  let processed = 0;

  for (const item of items) {
    const req = item.request;
    if (!req?.method || !req?.url) {
      await outboxMarkError(item.id, "request inválido");
      continue;
    }

    try {
      await outboxMarkSending(item.id);

      const method = String(req.method).toLowerCase();
      const config = {
        url: req.url,
        method,
        data: req.body ?? undefined,
        params: req.params ?? undefined,
        headers: req.headers ?? undefined,
      };

      await apiInstance.request(config);

      await outboxMarkSent(item.id);
      processed += 1;
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      const msg = status ? `HTTP ${status} ${JSON.stringify(data).slice(0, 300)}` : (e?.message || "error");
      await outboxMarkError(item.id, msg);
    }
  }

  await outboxDeleteSent();
  return { ok: true, processed };
}
