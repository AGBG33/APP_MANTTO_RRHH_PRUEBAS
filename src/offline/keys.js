// src/offline/keys.js
export const cacheKeys = {
  ordenesSupervisor: ({ userKey, start, end, mode }) =>
    `cache:ordenesSupervisor:${userKey}:${start}:${end}:${mode}`,

  ordenDetalle: (orderid) => `cache:ordenDetalle:${orderid}`,
  operaciones: (orderid) => `cache:operaciones:${orderid}`,
  componentes: (orderid, activity) => `cache:componentes:${orderid}:${activity}`,
};
