// src/offline/prefetchOrdenesTecnico.js

import api from "../services/api";
import {
  fetchEquipmentType,
  getEquipmentTypeFromOrder,
  normalizeEquipmentType,
} from "../services/equipmentType";

import {
  saveOrdenTecnicoDetail,
  loadOrdenTecnicoDetail,
  shouldCacheDetailByOrder,
  buildOfflineWindow,
  isCacheFresh,
  ORDENES_CACHE_TTL_MS,
  MAX_DETAIL_CACHE_ITEMS,
  MAX_DETAIL_CACHE_BYTES,
  getOrdenesTecnicoDetailCacheUsage,
  areOrdenTecnicoDetailWritesBlocked,
} from "./ordenesTecnicoCache";

/*
 * Evita que varias partes de la aplicación ejecuten
 * simultáneamente la misma precarga.
 */
let activePrefetchPromise = null;
let activePrefetchIds = new Set();
let activePrefetchForce = false;

function normalizeStatusCode(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const matches = text.match(/(?:^|\D)(0?[1-6]00)(?=\D|$)/g);
  if (matches?.length) {
    const last = matches[matches.length - 1].match(/0?[1-6]00/);
    if (last?.[0]) return last[0].padStart(4, "0");
  }

  const number = Number.parseInt(text, 10);
  return Number.isNaN(number) ? text : String(number).padStart(4, "0");
}

function resolveStatusLabel(code, fallback = "") {
  const labels = {
    "0100": "PENDIENTE",
    "0200": "EN PROCESO",
    "0300": "FINALIZADA",
    "0400": "PENDIENTE DE FIRMA",
    "0500": "FINALIZADA C/PENDIENTES",
    "0600": "Carta No Mantto",
  };

  return labels[code] || String(fallback || "").trim() || code || null;
}

function applyAuthoritativeListStatus(detail, statusHint) {
  if (!statusHint || typeof statusHint !== "object") {
    return detail;
  }

  /*
   * Si estatus_code existe, incluso vacío, es el resultado
   * autoritativo de la lista.
   */
  const hasEffectiveCode =
    Object.prototype.hasOwnProperty.call(statusHint, "estatus_code");

  const code = normalizeStatusCode(
    hasEffectiveCode
      ? statusHint.estatus_code
      : statusHint?.userstatus ??
          statusHint?.Userstatus ??
          statusHint?.UserStatus ??
          statusHint?.UserStText ??
          "",
  );

  const isSinEmpezar = code === "";

  return {
    ...(detail || {}),

    estatus_code: code,
    userstatus: code,
    Userstatus: code,
    UserStatus: code,
    UserStText: code,

    estatus_label: isSinEmpezar
      ? "Sin empezar"
      : resolveStatusLabel(code, statusHint?.estatus_label),

    isPendingSignature: code === "0400",

    isFinal: ["0300", "0500", "0600"].includes(code),

    checkin_done: [
      "0100",
      "0200",
      "0300",
      "0301",
      "0400",
      "0500",
      "0600",
    ].includes(code),
  };
}

function isPrefetchedDetailUsable(detail) {
  if (!detail || typeof detail !== "object") {
    return false;
  }

  const orderId = String(
    detail?.Orderid ||
      detail?.OrderId ||
      detail?.orderid ||
      "",
  ).trim();

  const operationsWereFetched =
    detail?._prefetch_status?.operaciones === true;

  return (
    !!orderId &&
    operationsWereFetched &&
    Array.isArray(detail?.operaciones)
  );
}

function pickFirstAddress(results = []) {
  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return null;
  }

  return results[0];
}

function mapDireccionLikeBackend(address) {
  if (!address) {
    return {
      cliente: "",
      direccion: "",
    };
  }

  const Name1 = address.Name1 ?? "";
  const Name2 = address.Name2 ?? "";
  const Street =
    address.Street ??
    address.StreetName ??
    "";

  const HouseNum1 =
    address.HouseNum1 ?? "";

  const StrSuppl3 =
    address.StrSuppl3 ?? "";

  const Location =
    address.Location ?? "";

  const City1 =
    address.City1 ?? "";

  const Region =
    address.Region ?? "";

  const PostCode1 =
    address.PostCode1 ?? "";

  const Country =
    address.Country ?? "";

  const cliente = [
    Name1,
    Name2,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const direccion = [
    `${Street} ${HouseNum1}`.trim(),
    StrSuppl3,
    Location,
    City1,
    Region,
    PostCode1,
    Country,
  ]
    .filter(
      (value) =>
        value &&
        String(value).trim().length > 0,
    )
    .join(", ");

  return {
    cliente,
    direccion,
  };
}

function normalizeOpsFromBackend(
  operations = [],
) {
  if (!Array.isArray(operations)) {
    return [];
  }

  return operations.map((operation) => {
    const Activity =
      operation.Activity ||
      operation.activity ||
      operation.Vornr ||
      "";

    const Description =
      operation.Description ||
      operation.description ||
      operation.Ltxa1 ||
      "";

    const StandardTextKey =
      operation.StandardTextKey ||
      operation.standardTextKey ||
      "";

    return {
      ...operation,

      id: operation.id,

      activity:
        String(Activity || ""),

      description:
        String(Description || ""),

      standardTextKey:
        String(StandardTextKey || ""),

      Activity:
        String(Activity || ""),

      Description:
        String(Description || ""),

      StandardTextKey:
        String(StandardTextKey || ""),
    };
  });
}

/**
 * Identificador estable para operaciones.
 */
const opKey = (
  orderId,
  operation,
  index,
) => {
  const activity = String(
    operation.activity ||
      operation.Activity ||
      "",
  ).trim();

  const usr02 = String(
    operation.Usr02 ||
      operation.usr02 ||
      "SIN UBICACIÓN",
  ).trim();

  const description = String(
    operation.description ||
      operation.Description ||
      "",
  ).trim();

  const standardTextKey = String(
    operation.standardTextKey ||
      operation.StandardTextKey ||
      "",
  ).trim();

  return [
    orderId,
    activity,
    usr02,
    description,
    standardTextKey,
    index,
  ].join("-");
};

function odataResults(response) {
  const results =
    response?.data?.d?.results ||
    response?.data?.results ||
    [];

  return Array.isArray(results)
    ? results
    : [];
}

function odataEntity(response) {
  return (
    response?.data?.d ||
    response?.data ||
    {}
  );
}

function detectCoberturaFromShortText(
  shortText,
) {
  const value = String(
    shortText || "",
  ).toUpperCase();

  const index =
    value.indexOf("COBERTURA");

  if (index < 0) return null;

  const tail = value.slice(index);

  if (
    tail.includes("COBERTURABASICA") ||
    tail.includes("COBERTURA BASICA") ||
    tail.includes("COBERTURA BÁSICA")
  ) {
    return "BASICA";
  }

  if (
    tail.includes("COBERTURAMEDIA") ||
    tail.includes("COBERTURA MEDIA")
  ) {
    return "MEDIA";
  }

  if (
    tail.includes("COBERTURASEMI") ||
    tail.includes("COBERTURA SEMI")
  ) {
    return "SEMI";
  }

  return null;
}

function pickStartDate(baseOrder) {
  return (
    baseOrder?.start_date ||
    baseOrder?.StartDate ||
    baseOrder?.BasicStartDate ||
    baseOrder?.BasicStart ||
    null
  );
}

function pickFinishDate(baseOrder) {
  return (
    baseOrder?.finish_date ||
    baseOrder?.FinishDate ||
    baseOrder?.BasicFinDate ||
    baseOrder?.BasicFinish ||
    null
  );
}

async function fetchHeaderDetalle(
  orderId,
) {
  const response = await api.get(
    `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')?$format=json`,
  );

  return odataEntity(response);
}

async function fetchAddresses(
  orderId,
) {
  try {
    const response = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToAddresses?$format=json`,
    );

    const results =
      odataResults(response);

    const selectedAddress =
      pickFirstAddress(results);

    const mapped =
      mapDireccionLikeBackend(
        selectedAddress,
      );

    return {
      ok: true,
      cliente:
        mapped.cliente || "",
      direccion:
        mapped.direccion || "",
    };
  } catch (error) {
    console.log(
      "[prefetch][addresses] no se pudieron cargar:",
      orderId,
      error?.response?.data ||
        error?.message ||
        error,
    );

    return {
      ok: false,
      cliente: "",
      direccion: "",
    };
  }
}

async function fetchPartners(
  orderId,
) {
  try {
    const response = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToPartners?$format=json`,
    );

    const partners =
      odataResults(response);

    const rePartner =
      partners.find(
        (partner) =>
          String(
            partner?.PartnRoleOld ||
              partner?.PartnRole ||
              "",
          ).trim() === "RE",
      );

    const emailFromPartners =
      String(
        rePartner?.Mail1 ||
          rePartner?.Mail2 ||
          "",
      ).trim();

    return {
      ok: true,
      partners,
      emailFromPartners,
    };
  } catch (error) {
    console.log(
      "[prefetch][partners] no se pudieron cargar:",
      orderId,
      error?.response?.data ||
        error?.message ||
        error,
    );

    return {
      ok: false,
      partners: [],
      emailFromPartners: "",
    };
  }
}

async function fetchOperaciones(
  orderId,
) {
  try {
    /*
     * Primero se utiliza el mismo endpoint
     * de la pantalla de detalle.
     */
    const response = await api.get(
      `/api/operaciones/sap/${String(
        orderId,
      )}`,
    );

    const rawOperations =
      response?.data?.d?.results ||
      response?.data?.results ||
      response?.data?.operaciones ||
      response?.data ||
      [];

    const operations =
      normalizeOpsFromBackend(
        Array.isArray(rawOperations)
          ? rawOperations
          : [],
      ).map(
        (operation, index) => ({
          ...operation,

          id:
            operation.id ||
            opKey(
              orderId,
              operation,
              index,
            ),
        }),
      );

    console.log(
      "[prefetch][ops] cargadas desde /api/operaciones/sap:",
      {
        orderId,
        count: operations.length,
      },
    );

    return {
      ok: true,
      operations,
      source: "api_operaciones",
    };
  } catch (firstError) {
    console.log(
      "[prefetch][ops] falló /api/operaciones/sap, intentando ToOperations:",
      orderId,
      firstError?.response?.data ||
        firstError?.message ||
        firstError,
    );
  }

  try {
    /*
     * Respaldo directo en OData.
     */
    const response = await api.get(
      `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${orderId}')/ToOperations?$format=json`,
    );

    const rawOperations =
      odataResults(response);

    const operations =
      normalizeOpsFromBackend(
        rawOperations,
      ).map(
        (operation, index) => ({
          ...operation,

          id:
            operation.id ||
            opKey(
              orderId,
              operation,
              index,
            ),
        }),
      );

    console.log(
      "[prefetch][ops] cargadas desde ToOperations:",
      {
        orderId,
        count: operations.length,
      },
    );

    return {
      ok: true,
      operations,
      source: "odata_operations",
    };
  } catch (secondError) {
    console.log(
      "[prefetch][ops] no se pudieron cargar operaciones:",
      orderId,
      secondError?.response?.data ||
        secondError?.message ||
        secondError,
    );

    return {
      ok: false,
      operations: [],
      source: "none",
    };
  }
}

async function fetchEquipmentInfo(equipment, baseOrder, cachedDetail) {
  const cachedType = normalizeEquipmentType(
    cachedDetail?.tipo_equipo ||
      cachedDetail?.equipment_type ||
      getEquipmentTypeFromOrder(cachedDetail),
  );
  const cachedSource = String(
    cachedDetail?.tipo_equipo_source ||
      cachedDetail?.equipment_type_source ||
      "",
  ).trim();

  if (cachedType && cachedSource === "manual") {
    return {
      ok: true,
      type: cachedType,
      eqart: cachedDetail?.Eqart || cachedDetail?.eqart || "",
      source: "manual",
    };
  }

  const orderType = normalizeEquipmentType(
    getEquipmentTypeFromOrder(baseOrder),
  );

  if (orderType) {
    return {
      ok: true,
      type: orderType,
      eqart: baseOrder?.Eqart || baseOrder?.eqart || "",
      source: "order",
    };
  }

  const equipmentId = String(equipment || "").trim();

  if (!equipmentId) {
    return {
      ok: false,
      type: cachedType || null,
      eqart: cachedDetail?.Eqart || cachedDetail?.eqart || "",
      source: cachedType ? cachedSource || "cache" : "missing_equipment",
    };
  }

  try {
    const info = await fetchEquipmentType(equipmentId);
    const type = normalizeEquipmentType(info?.type);

    return {
      ok: !!type,
      type: type || cachedType || null,
      eqart:
        info?.eqart ||
        cachedDetail?.Eqart ||
        cachedDetail?.eqart ||
        "",
      source: type
        ? "sap"
        : cachedType
          ? cachedSource || "cache"
          : "not_identified",
    };
  } catch (error) {
    console.log(
      "[prefetch][equipment] no se pudo identificar:",
      equipmentId,
      error?.message || error,
    );

    return {
      ok: false,
      type: cachedType || null,
      eqart: cachedDetail?.Eqart || cachedDetail?.eqart || "",
      source: cachedType ? cachedSource || "cache" : "error",
    };
  }
}

/**
 * Ejecución interna de la precarga.
 */
async function runPrefetchOrdenesTecnicoDetalles({
  orderIds = [],
  statusByOrderId = {},
  concurrency = 3,
  force = false,
  ttlMs = ORDENES_CACHE_TTL_MS,
}) {
  const requestedIds = [
    ...new Set(
      (
        Array.isArray(orderIds)
          ? orderIds
          : []
      )
        .map((value) =>
          String(value || "").trim(),
        )
        .filter(Boolean),
    ),
  ];

  if (!requestedIds.length) {
    return {
      ok: 0,
      fresh: 0,
      skip: 0,
      partial: 0,
      fail: 0,
      total: 0,
      requestedTotal: 0,
      limited: 0,
      stoppedByStorage: false,
    };
  }

  /*
   * La lista puede contener cientos o miles de órdenes, pero sus
   * detalles son mucho más pesados. Antes de iniciar peticiones se
   * calcula un presupuesto estable usando lo que ya existe.
   *
   * Los detalles existentes sí pueden revisarse. Los detalles nuevos
   * solamente entran mientras haya espacio dentro de ambos límites.
   * No se elimina ningún detalle que todavía pertenezca a la ventana.
   */
  const cacheUsage =
    await getOrdenesTecnicoDetailCacheUsage();

  if (areOrdenTecnicoDetailWritesBlocked()) {
    return {
      ok: 0,
      fresh: 0,
      skip: 0,
      partial: 0,
      fail: 0,
      total: 0,
      requestedTotal: requestedIds.length,
      limited: requestedIds.length,
      stoppedByStorage: true,
    };
  }

  const cachedIds = new Set(
    Array.isArray(cacheUsage?.orderIds)
      ? cacheUsage.orderIds.map((id) => String(id || "").trim())
      : [],
  );

  let reservedItems = Number(cacheUsage?.count || 0);
  let reservedBytes = Number(cacheUsage?.estimatedBytes || 0);

  const averageDetailBytes =
    reservedItems > 0 && reservedBytes > 0
      ? Math.ceil(reservedBytes / reservedItems)
      : 60_000;

  const estimatedNewDetailBytes = Math.min(
    350_000,
    Math.max(25_000, averageDetailBytes),
  );

  const ids = [];

  requestedIds.forEach((orderId) => {
    if (cachedIds.has(orderId)) {
      ids.push(orderId);
      return;
    }

    const hasItemSlot =
      reservedItems < MAX_DETAIL_CACHE_ITEMS;

    const hasByteBudget =
      reservedBytes + estimatedNewDetailBytes <=
      MAX_DETAIL_CACHE_BYTES;

    if (hasItemSlot && hasByteBudget) {
      ids.push(orderId);
      reservedItems += 1;
      reservedBytes += estimatedNewDetailBytes;
    }
  });

  const limited = Math.max(
    0,
    requestedIds.length - ids.length,
  );

  if (!ids.length) {
    console.log(
      "[prefetch] Sin presupuesto para nuevos detalles:",
      {
        requested: requestedIds.length,
        cachedDetails: cacheUsage?.count || 0,
        estimatedBytes: cacheUsage?.estimatedBytes || 0,
      },
    );

    return {
      ok: 0,
      fresh: 0,
      skip: 0,
      partial: 0,
      fail: 0,
      total: 0,
      requestedTotal: requestedIds.length,
      limited,
      stoppedByStorage: false,
    };
  }

  const window =
    buildOfflineWindow(new Date());

  let ok = 0;
  let fresh = 0;
  let skip = 0;
  let partial = 0;
  let fail = 0;
  let stoppedByStorage = false;

  let currentIndex = 0;

  async function worker() {
    while (
      currentIndex < ids.length &&
      !areOrdenTecnicoDetailWritesBlocked()
    ) {
      const index = currentIndex;
      currentIndex += 1;

      const orderId = ids[index];

      try {
        const cachedBeforeFetch =
          await loadOrdenTecnicoDetail(orderId);

        /*
         * Si el detalle está vigente y completo,
         * no se descarga otra vez.
         */
        if (!force) {
          const cached = cachedBeforeFetch;

          const hasCachedDetail =
            cached &&
            cached.data &&
            typeof cached.data ===
              "object";

          const cachedIsFresh =
            isCacheFresh(
              cached?.updatedAt,
              ttlMs,
            );

          const cachedIsUsable =
            isPrefetchedDetailUsable(cached?.data);

          if (
            hasCachedDetail &&
            cachedIsFresh &&
            cachedIsUsable
          ) {
            const statusHint =
              statusByOrderId?.[orderId];

            const detailWithCurrentStatus =
              applyAuthoritativeListStatus(
                cached.data,
                statusHint,
              );

            const previousStatus = normalizeStatusCode(
              cached?.data?.estatus_code ??
                cached?.data?.userstatus ??
                "",
            );

            const nextStatus = normalizeStatusCode(
              detailWithCurrentStatus?.estatus_code ??
                detailWithCurrentStatus?.userstatus ??
                "",
            );

            /*
            * Aunque el detalle no se descargue nuevamente, se actualiza
            * su estado cuando la lista central tiene un estado diferente.
            */
            if (
              statusHint &&
              previousStatus !== nextStatus
            ) {
              const statusSaved = await saveOrdenTecnicoDetail(
                orderId,
                detailWithCurrentStatus,
              );

              if (
                statusSaved !== true &&
                areOrdenTecnicoDetailWritesBlocked()
              ) {
                stoppedByStorage = true;
                break;
              }
            }

            console.log(
              "[prefetch][detalle vigente y utilizable]",
              {
                orderId,
                updatedAt: cached.updatedAt,
                complete:
                  cached?.data?._prefetch_complete === true,
                previousStatus,
                nextStatus,
              },
            );

            fresh++;
            continue;
          }
        }

        /*
         * El detalle no existe, venció o
         * anteriormente quedó incompleto.
         */
        const baseOrder =
          await fetchHeaderDetalle(
            orderId,
          );

        const realOrderId = String(
          baseOrder?.Orderid ||
            baseOrder?.OrderId ||
            orderId,
        ).trim();

        if (!realOrderId) {
          throw new Error(
            `No se pudo resolver la orden ${orderId}`,
          );
        }

        const startDate =
          pickStartDate(baseOrder);

        const finishDate =
          pickFinishDate(baseOrder);

        const orderForWindow = {
          Orderid: realOrderId,
          start_date: startDate,
        };

        if (
          !shouldCacheDetailByOrder(
            orderForWindow,
            new Date(),
          )
        ) {
          console.log(
            "[prefetch][skip fuera ventana]",
            {
              orderId: realOrderId,
              start_date: startDate,
            },
          );

          skip++;
          continue;
        }

        const shortTextValue =
          baseOrder?.ShortText ??
          baseOrder?.shorttext ??
          baseOrder?.Shorttext ??
          baseOrder?.shortText ??
          "";

        const coverage =
          detectCoberturaFromShortText(
            shortTextValue,
          );

        /*
         * Estas consultas se mantienen secuenciales
         * para no saturar una conexión lenta.
         */
        const addressResult =
          await fetchAddresses(
            realOrderId,
          );

        const partnersResult =
          await fetchPartners(
            realOrderId,
          );

        const operationsResult =
          await fetchOperaciones(
            realOrderId,
          );

        const equipment =
          baseOrder?.equipment ||
          baseOrder?.Equipment ||
          null;

        const equipmentResult =
          await fetchEquipmentInfo(
            equipment,
            baseOrder,
            cachedBeforeFetch?.data,
          );

        const rawUserStatus = String(
          baseOrder?.Userstatus ??
            baseOrder?.userstatus ??
            baseOrder?.UserSt ??
            baseOrder?.userSt ??
            "",
        ).trim();

        const rawStatusCode = String(
          baseOrder?.estatus_code ??
            baseOrder?.EstatusCode ??
            baseOrder?.StatusCode ??
            "",
        ).trim();

        const rawStatusLabel = String(
          baseOrder?.estatus_label ??
            baseOrder?.EstatusLabel ??
            baseOrder?.StatusText ??
            "",
        ).trim();

        const prefetchComplete =
          addressResult.ok &&
          partnersResult.ok &&
          operationsResult.ok &&
          equipmentResult.ok;

        const detailFromSap = {
          Orderid: realOrderId,

          order_type:
            baseOrder?.order_type ||
            baseOrder?.OrderType ||
            baseOrder?.OrderTypeTxt ||
            null,

          equipment,

          tipo_equipo:
            equipmentResult.type ||
            null,

          tipo_equipo_source:
            equipmentResult.source ||
            null,

          Eqart:
            equipmentResult.eqart ||
            null,

          eqart:
            equipmentResult.eqart ||
            null,

          plant:
            baseOrder?.plant ||
            baseOrder?.Plant ||
            null,

          start_date:
            startDate,

          finish_date:
            finishDate,

          ShortText:
            shortTextValue || null,

          short_text:
            shortTextValue || null,

          cobertura_tipo:
            coverage || null,

          userstatus:
            rawUserStatus || null,

          estatus_code:
            rawStatusCode ||
            rawUserStatus ||
            null,

          estatus_label:
            rawStatusLabel || null,

          estatus_tipo:
            baseOrder?.estatus_tipo ??
            null,

          checkin_done:
            !!baseOrder?.checkin_done,

          cliente:
            addressResult.cliente ||
            "",

          direccion:
            addressResult.direccion ||
            "",

          cliente_email:
            partnersResult
              .emailFromPartners ||
            "",

          partners:
            Array.isArray(
              partnersResult.partners,
            )
              ? partnersResult.partners
              : [],

          operaciones:
            Array.isArray(
              operationsResult.operations,
            )
              ? operationsResult.operations
              : [],

          _prefetch_complete:
            prefetchComplete,

          _prefetch_status: {
            header: true,
            addresses:
              addressResult.ok,
            partners:
              partnersResult.ok,
            operaciones:
              operationsResult.ok,

            equipment:
              equipmentResult.ok,
          },

          _prefetch_updated_at:
            Date.now(),
        };

        /*
         * La lista recién sincronizada es la fuente autoritativa del
         * estatus durante esta precarga. El endpoint de detalle puede ir
         * retrasado y no debe volver a guardar un código anterior.
         */
        const detail = applyAuthoritativeListStatus(
          detailFromSap,
          statusByOrderId?.[realOrderId] ?? statusByOrderId?.[orderId],
        );

        const saved =
          await saveOrdenTecnicoDetail(
            realOrderId,
            detail,
          );

        console.log(
          "[prefetch][detail saved]",
          {
            orderId: realOrderId,
            saved,
            complete:
              prefetchComplete,

            operaciones:
              detail.operaciones.length,

            start_date:
              detail.start_date,

            finish_date:
              detail.finish_date,
          },
        );

        if (saved === true) {
          if (prefetchComplete) {
            ok++;
          } else {
            partial++;

            console.log(
              "[prefetch][detalle parcial]",
              {
                orderId:
                  realOrderId,

                status:
                  detail
                    ._prefetch_status,
              },
            );
          }
        } else {
          fail++;

          console.log(
            "[prefetch][detail NOT saved]",
            {
              orderId:
                realOrderId,

              reason:
                "saveOrdenTecnicoDetail returned false",
            },
          );

          if (areOrdenTecnicoDetailWritesBlocked()) {
            stoppedByStorage = true;
            break;
          }
        }
      } catch (error) {
        console.log(
          "[prefetch] fail order:",
          orderId,
          error?.response?.data ||
            error?.message ||
            error,
        );

        fail++;
      }
    }
  }

  const safeConcurrency = Math.min(
    3,
    Math.max(
      1,
      Number(concurrency) || 1,
    ),
  );

  const workers = Array.from(
    {
      length: Math.min(
        safeConcurrency,
        ids.length,
      ),
    },
    () => worker(),
  );

  await Promise.all(workers);

  return {
    ok,
    fresh,
    skip,
    partial,
    fail,
    total: ids.length,
    requestedTotal: requestedIds.length,
    limited,
    stoppedByStorage:
      stoppedByStorage ||
      areOrdenTecnicoDetailWritesBlocked(),
    window,
  };
}

/**
 * Esta es la función pública que importa bootstrapSyncTecnico.js.
 */
export function prefetchOrdenesTecnicoDetalles(
  options = {},
) {
  const allRequestedIds = [
    ...new Set(
      (
        Array.isArray(options?.orderIds)
          ? options.orderIds
          : []
      )
        .map((id) =>
          String(id || "").trim(),
        )
        .filter(Boolean),
    ),
  ];

  /*
   * Defensa adicional para cualquier llamada futura que no pase por
   * bootstrapSyncTecnico. El orden recibido se conserva y solamente
   * se toma la cantidad máxima permitida para detalles pesados.
   */
  const requestedIds = allRequestedIds.slice(
    0,
    MAX_DETAIL_CACHE_ITEMS,
  );

  const normalizedOptions = {
    ...options,
    orderIds: requestedIds,
  };

  if (activePrefetchPromise) {
    /*
     * Una recarga manual no debe reutilizar como resultado final
     * una precarga normal que comenzó con force=false.
     * Esperamos a que termine y después ejecutamos la forzada.
     */
    const missingIds =
      requestedIds.filter(
        (id) =>
          !activePrefetchIds.has(id),
      );

    const needsForcedRun =
      normalizedOptions?.force === true &&
      !activePrefetchForce;

    if (
      needsForcedRun ||
      missingIds.length > 0
    ) {
      return activePrefetchPromise
        .catch(() => null)
        .then(() =>
          prefetchOrdenesTecnicoDetalles({
            ...normalizedOptions,
            orderIds: needsForcedRun
              ? requestedIds
              : missingIds,
            force:
              needsForcedRun ||
              normalizedOptions?.force === true,
          }),
        );
    }

    console.log(
      "[prefetch] Ya existe una precarga activa. Se reutiliza.",
    );

    return activePrefetchPromise;
  }

  activePrefetchIds =
    new Set(requestedIds);

  activePrefetchForce =
    normalizedOptions?.force === true;

  activePrefetchPromise =
    runPrefetchOrdenesTecnicoDetalles(
      normalizedOptions,
    )
      .then((result) => {
        console.log(
          "[prefetch] Precarga terminada:",
          result,
        );

        return result;
      })
      .catch((error) => {
        console.log(
          "[prefetch] Error general:",
          error?.message || error,
        );

        throw error;
      })
      .finally(() => {
        activePrefetchPromise = null;
        activePrefetchIds =
          new Set();
        activePrefetchForce =
          false;
      });

  return activePrefetchPromise;
}