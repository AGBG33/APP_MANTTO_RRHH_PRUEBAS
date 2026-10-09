// app/tecnico/rutas/index.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import MapView, {
  Callout,
  Marker,
  PROVIDER_GOOGLE,
  UrlTile,
} from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";
import { useOrdenesTecnico } from "../../../src/context/OrdenesTecnicoContext";
import { loadOrdenTecnicoDetail } from "../../../src/offline/ordenesTecnicoCache";

const FIORI = {
  pageBg: "#F7F7F7",
  panelBg: "#FFFFFF",
  panelSubtle: "#F5F7FA",
  border: "#DDE6F2",
  borderMuted: "#CFD8E3",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  accentDark: "#0854A0",
  accentSoft: "#E3F2FD",
  success: "#188918",
  successSoft: "#E7F5E7",
  warning: "#C35500",
  warningSoft: "#FFF3E8",
  danger: "#BB0000",
};

// Conserva aquí las mismas llaves que ya utiliza el proyecto.
const GOOGLE_API_KEY = "AIzaSyCNzVLTuidfPcwlSWO8113G5H_oy8fqdlU";
const MAPTILER_KEY = "xXsfDizxhemYIlweqX7X";

const ADDRESS_LOOKUP_CONCURRENCY = 3;
const LOCAL_DETAIL_TIMEOUT_MS = 3500;
const NETWORK_TIMEOUT_MS = 10000;
const MAP_PREPARATION_TIMEOUT_MS = 35000;

const toYMD = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

const parseSapDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const numericDate = new Date(value);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate;
  }

  const text = String(value).trim();
  if (!text) return null;

  const sapMatch = text.match(/\/Date\((-?\d+)(?:[+-]\d+)?\)\//);
  if (sapMatch) {
    const milliseconds = Number(sapMatch[1]);
    if (!Number.isFinite(milliseconds)) return null;
    const sapDate = new Date(milliseconds);
    return Number.isNaN(sapDate.getTime()) ? null : sapDate;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const cleanText = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const normalized = text.toLowerCase();
  if (
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "-" ||
    normalized === "—"
  ) {
    return "";
  }

  return text;
};

const firstText = (...values) => {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
};

const getOrderId = (order) =>
  firstText(order?.Orderid, order?.OrderId, order?.order_id, order?.orderId);

const getStartDate = (order) =>
  order?.start_date ||
  order?.StartDate ||
  order?.startDate ||
  order?.BasicStartDate ||
  null;

const getOrderName = (order, orderId) =>
  firstText(
    order?.nombre_orden,
    order?.order_type,
    order?.OrderType,
    order?.ShortText,
    order?.short_text,
    orderId ? "Orden " + orderId : "Orden de servicio",
  );

function withTimeout(promise, milliseconds, fallbackValue) {
  let timeoutId;

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackValue), milliseconds);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const results = new Array(list.length);
  let nextIndex = 0;

  const workerCount = Math.min(
    list.length,
    Math.max(1, Number(concurrency) || 1),
  );

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= list.length) return;

      try {
        results[index] = await mapper(list[index], index);
      } catch (error) {
        console.log("[RUTAS] No se pudo enriquecer una orden:", {
          orderId: getOrderId(list[index]),
          error: error?.message || error,
        });
        results[index] = list[index];
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

function getODataResults(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.d?.results)) return value.d.results;
  if (Array.isArray(value?.value)) return value.value;
  return [];
}

function looksLikeAddressNode(value) {
  return !!(
    value &&
    typeof value === "object" &&
    (value.Street ||
      value.StreetName ||
      value.City1 ||
      value.PostCode1 ||
      value.HouseNum1 ||
      value.Name1)
  );
}

function pickAddressNode(source) {
  if (!source || typeof source !== "object") return null;

  const containers = [
    source?.ToAddresses,
    source?.toAddresses,
    source?.addresses,
    source?.Addresses,
    source?.addressResults,
    source?.data?.ToAddresses,
    source?.data?.toAddresses,
    source?.data?.addresses,
  ];

  for (const container of containers) {
    const results = getODataResults(container);
    if (results.length) return results[0];
    if (looksLikeAddressNode(container)) return container;
  }

  return looksLikeAddressNode(source) ? source : null;
}

function mapAddressNode(address) {
  if (!address) {
    return {
      cliente: "",
      direccion: "",
    };
  }

  const cliente = [cleanText(address?.Name1), cleanText(address?.Name2)]
    .filter(Boolean)
    .join(" ")
    .trim();

  const street = firstText(address?.Street, address?.StreetName);
  const houseNumber = cleanText(address?.HouseNum1);

  const direccion = [
    [street, houseNumber].filter(Boolean).join(" ").trim(),
    cleanText(address?.StrSuppl3),
    cleanText(address?.Location),
    cleanText(address?.City1),
    cleanText(address?.Region),
    cleanText(address?.PostCode1),
    cleanText(address?.Country),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    cliente,
    direccion,
  };
}

function extractAddressData(source) {
  if (!source || typeof source !== "object") {
    return {
      cliente: "",
      direccion: "",
    };
  }

  const embeddedAddress = mapAddressNode(pickAddressNode(source));

  const name1 = firstText(source?.Name1, source?.NAME1, source?.name1);

  const name2 = firstText(source?.Name2, source?.NAME2, source?.name2);

  const directClient = firstText(
    source?.cliente,
    source?.partner_name,
    source?.customer_name,
    [name1, name2].filter(Boolean).join(" "),
  );

  const directAddress = firstText(
    source?.direccion,
    source?.partner_address,
    source?.formatted_address,
    source?.full_address,
    typeof source?.address === "string" ? source.address : "",
  );

  return {
    cliente: directClient || embeddedAddress.cliente,
    direccion: directAddress || embeddedAddress.direccion,
  };
}

function mergeAddressData(...sources) {
  let cliente = "";
  let direccion = "";

  for (const source of sources) {
    const current = extractAddressData(source);
    if (!cliente && current.cliente) cliente = current.cliente;
    if (!direccion && current.direccion) direccion = current.direccion;
    if (cliente && direccion) break;
  }

  return {
    cliente,
    direccion,
  };
}

function toCoordinateNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCoordinates(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const addressNode = pickAddressNode(source);

    const latitude = toCoordinateNumber(
      source?.latitude ??
        source?.Latitude ??
        source?.lat ??
        source?.Lat ??
        addressNode?.latitude ??
        addressNode?.Latitude ??
        addressNode?.lat,
    );

    const longitude = toCoordinateNumber(
      source?.longitude ??
        source?.Longitude ??
        source?.lng ??
        source?.Lng ??
        source?.lon ??
        addressNode?.longitude ??
        addressNode?.Longitude ??
        addressNode?.lng,
    );

    if (
      latitude != null &&
      longitude != null &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      !(latitude === 0 && longitude === 0)
    ) {
      return {
        latitude,
        longitude,
      };
    }
  }

  return null;
}

function hasCoordinates(order) {
  const rawLatitude = order?.latitude;
  const rawLongitude = order?.longitude;

  if (
    rawLatitude == null ||
    rawLongitude == null ||
    rawLatitude === "" ||
    rawLongitude === ""
  ) {
    return false;
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export default function RutasTecnico() {
  const { ensureValidToken } = useAuth();
  const { ordenes: ordenesCompartidas, refresh } = useOrdenesTecnico();

  const [ordenes, setOrdenes] = useState([]);
  const [ubicacion, setUbicacion] = useState(null);
  const [selectedOrden, setSelectedOrden] = useState(null);

  const [mode, setMode] = useState("DRIVING");
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [loadingUbic, setLoadingUbic] = useState(true);
  const [loadingOrdenes, setLoadingOrdenes] = useState(true);
  const [preparingMap, setPreparingMap] = useState(false);

  const [query, setQuery] = useState("");
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const mapRef = useRef(null);
  const markerRefs = useRef({});
  const mountedRef = useRef(true);
  const preparationRunRef = useRef(0);
  const geocodeCacheRef = useRef(new Map());
  const remoteAddressCacheRef = useRef(new Map());
  const remoteAddressAttemptedRef = useRef(new Set());

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      preparationRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void obtenerUbicacion();
  }, []);

  /*
   * La lista compartida ya fue cargada por OrdenesTecnicoContext.
   * No se llama loadLocal() desde este efecto porque loadLocal()
   * vuelve a actualizar la misma lista compartida y provocaba el
   * ciclo que mantenía visible "Cargando rutas...".
   */
  useEffect(() => {
    prepararOrdenesDelDia(
      Array.isArray(ordenesCompartidas) ? ordenesCompartidas : [],
    );
  }, [ordenesCompartidas]);

  useEffect(() => {
    if (!selectedOrden || !ubicacion || !hasCoordinates(selectedOrden)) {
      setLoadingRoute(false);
      return undefined;
    }

    setRouteInfo(null);
    setRouteError("");
    setLoadingRoute(true);

    const timeoutId = setTimeout(() => {
      if (mountedRef.current) setLoadingRoute(false);
    }, 15000);

    return () => clearTimeout(timeoutId);
  }, [
    mode,
    selectedOrden?.order_id,
    selectedOrden?.latitude,
    selectedOrden?.longitude,
    ubicacion?.latitude,
    ubicacion?.longitude,
  ]);

  const obtenerUbicacion = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Permiso de ubicación",
          "No se concedió el permiso de ubicación. Podrás consultar los puntos, pero no calcular una ruta desde tu posición.",
        );
        return;
      }

      const location = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        12000,
        null,
      );

      if (!location?.coords || !mountedRef.current) return;

      setUbicacion(location.coords);

      if (mapRef.current) {
        mapRef.current.animateCamera(
          {
            center: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            },
            zoom: 13,
          },
          { duration: 500 },
        );
      }
    } catch (error) {
      console.log(
        "[RUTAS] No se pudo obtener la ubicación:",
        error?.message || error,
      );
    } finally {
      if (mountedRef.current) setLoadingUbic(false);
    }
  };

  const normalizeBaseOrder = (order, index) => {
    const orderId = getOrderId(order);
    const addressData = mergeAddressData(order);
    const directCoordinates = extractCoordinates(order);

    return {
      ...order,
      order_id: orderId,
      routeIndex: index + 1,
      nombre_orden: getOrderName(order, orderId),
      direccion: addressData.direccion,
      cliente: addressData.cliente,
      latitude: directCoordinates?.latitude ?? null,
      longitude: directCoordinates?.longitude ?? null,
      _viewport: order?._viewport || null,
    };
  };

  const prepararOrdenesDelDia = (sourceList) => {
    const runId = preparationRunRef.current + 1;
    preparationRunRef.current = runId;

    setLoadingOrdenes(true);

    try {
      const today = toYMD(new Date());

      const todaysOrders = (Array.isArray(sourceList) ? sourceList : [])
        .filter((order) => {
          const date = parseSapDate(getStartDate(order));
          return date ? toYMD(date) === today : false;
        })
        .map(normalizeBaseOrder);

      setOrdenes(todaysOrders);
      setSelectedOrden((current) => {
        if (!current) return null;
        return todaysOrders.some((item) => item.order_id === current.order_id)
          ? current
          : null;
      });

      if (todaysOrders.length) {
        setSheetExpanded(true);
        setPreparingMap(true);
      } else {
        setPreparingMap(false);
      }

      /*
       * Las tarjetas ya se muestran. La lectura del detalle, la consulta
       * de direcciones faltantes y la geocodificación continúan aparte.
       * Ninguna petición de mapas bloquea la lista principal.
       */
      const backgroundPreparation = enriquecerDireccionesYPuntos(
        todaysOrders,
        runId,
      );

      void withTimeout(backgroundPreparation, MAP_PREPARATION_TIMEOUT_MS, null)
        .then((completedOrders) => {
          if (completedOrders && preparationRunRef.current === runId) {
            ajustarMapaATodos(completedOrders);
          }
        })
        .finally(() => {
          if (mountedRef.current && preparationRunRef.current === runId) {
            setPreparingMap(false);
          }
        });
    } catch (error) {
      console.log(
        "[RUTAS] No se pudieron preparar las órdenes:",
        error?.message || error,
      );
      setOrdenes([]);
      setPreparingMap(false);
    } finally {
      if (mountedRef.current && preparationRunRef.current === runId) {
        setLoadingOrdenes(false);
      }
    }
  };

  const fetchRemoteAddress = async (orderId) => {
    if (!orderId) {
      return {
        cliente: "",
        direccion: "",
      };
    }

    if (remoteAddressCacheRef.current.has(orderId)) {
      return remoteAddressCacheRef.current.get(orderId);
    }

    if (remoteAddressAttemptedRef.current.has(orderId)) {
      return {
        cliente: "",
        direccion: "",
      };
    }

    remoteAddressAttemptedRef.current.add(orderId);

    try {
      const response = await withTimeout(
        api.get(
          "/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('" +
            orderId +
            "')/ToAddresses?$format=json",
          { timeout: NETWORK_TIMEOUT_MS },
        ),
        NETWORK_TIMEOUT_MS + 1000,
        null,
      );

      const results =
        response?.data?.d?.results ||
        response?.data?.results ||
        response?.data?.value ||
        [];

      const mapped = mapAddressNode(Array.isArray(results) ? results[0] : null);

      if (mapped.cliente || mapped.direccion) {
        remoteAddressCacheRef.current.set(orderId, mapped);
      }

      return mapped;
    } catch (error) {
      console.log("[RUTAS][ToAddresses] No se pudo consultar:", {
        orderId,
        error: error?.response?.data || error?.message || error,
      });

      return {
        cliente: "",
        direccion: "",
      };
    }
  };

  const geocodeDireccion = async (direccion, allowNetwork = true) => {
    const normalizedAddress = cleanText(direccion);
    if (!normalizedAddress) return null;

    if (geocodeCacheRef.current.has(normalizedAddress)) {
      return geocodeCacheRef.current.get(normalizedAddress);
    }

    if (!allowNetwork) return null;

    try {
      const url =
        "https://maps.googleapis.com/maps/api/geocode/json?address=" +
        encodeURIComponent(normalizedAddress) +
        "&components=country:MX&region=mx&key=" +
        GOOGLE_API_KEY;

      const response = await withTimeout(fetch(url), NETWORK_TIMEOUT_MS, null);

      if (!response) {
        return null;
      }

      const data = await withTimeout(response.json(), 4000, null);

      if (data?.status === "OK" && data?.results?.length) {
        const result = data.results[0];
        const location = result?.geometry?.location;
        const viewport = result?.geometry?.viewport;

        if (
          Number.isFinite(Number(location?.lat)) &&
          Number.isFinite(Number(location?.lng))
        ) {
          const value = {
            lat: Number(location.lat),
            lng: Number(location.lng),
            _viewport: viewport
              ? {
                  ne: {
                    lat: Number(viewport.northeast.lat),
                    lng: Number(viewport.northeast.lng),
                  },
                  sw: {
                    lat: Number(viewport.southwest.lat),
                    lng: Number(viewport.southwest.lng),
                  },
                }
              : null,
          };

          geocodeCacheRef.current.set(normalizedAddress, value);
          return value;
        }
      }

      console.log("[RUTAS] Dirección no geocodificada:", {
        direccion: normalizedAddress,
        status: data?.status || "SIN_RESPUESTA",
        error: data?.error_message || "",
      });
    } catch (error) {
      console.log("[RUTAS] Error al geocodificar:", error?.message || error);
    }

    return null;
  };

  const applyEnrichedOrder = (order, runId) => {
    if (!mountedRef.current || preparationRunRef.current !== runId) {
      return;
    }

    setOrdenes((current) =>
      current.map((item) => (item.order_id === order.order_id ? order : item)),
    );

    setSelectedOrden((current) =>
      current?.order_id === order.order_id ? { ...current, ...order } : current,
    );
  };

  const enriquecerDireccionesYPuntos = async (baseOrders, runId) => {
    if (!baseOrders.length) return [];

    const netState = await withTimeout(NetInfo.fetch(), 4000, null);

    const online = !!(
      netState?.isConnected && netState?.isInternetReachable !== false
    );

    let allowRemote = online;

    if (allowRemote && typeof ensureValidToken === "function") {
      const tokenIsValid = await withTimeout(
        Promise.resolve(ensureValidToken()),
        7000,
        false,
      );
      allowRemote = tokenIsValid === true;
    }

    return mapWithConcurrency(
      baseOrders,
      ADDRESS_LOOKUP_CONCURRENCY,
      async (baseOrder) => {
        if (preparationRunRef.current !== runId) return baseOrder;

        let localDetail = null;

        if (baseOrder.order_id) {
          try {
            localDetail = await withTimeout(
              loadOrdenTecnicoDetail(baseOrder.order_id),
              LOCAL_DETAIL_TIMEOUT_MS,
              null,
            );
          } catch (error) {
            console.log("[RUTAS] Detalle local no disponible:", {
              orderId: baseOrder.order_id,
              error: error?.message || error,
            });
          }
        }

        const detail = localDetail?.data || localDetail || null;
        let addressData = mergeAddressData(detail, baseOrder);

        if (!addressData.direccion && allowRemote) {
          const remoteAddress = await fetchRemoteAddress(baseOrder.order_id);

          addressData = {
            cliente: addressData.cliente || remoteAddress.cliente || "",
            direccion: addressData.direccion || remoteAddress.direccion || "",
          };
        }

        const directCoordinates = extractCoordinates(detail, baseOrder);

        let latitude =
          directCoordinates?.latitude ?? baseOrder.latitude ?? null;

        let longitude =
          directCoordinates?.longitude ?? baseOrder.longitude ?? null;

        let viewport = baseOrder?._viewport || null;

        if ((latitude == null || longitude == null) && addressData.direccion) {
          const geocoded = await geocodeDireccion(
            addressData.direccion,
            online,
          );

          latitude = geocoded?.lat ?? null;
          longitude = geocoded?.lng ?? null;
          viewport = geocoded?._viewport ?? null;
        }

        const enrichedOrder = {
          ...baseOrder,
          cliente: addressData.cliente || baseOrder.cliente || "",
          direccion: addressData.direccion || baseOrder.direccion || "",
          latitude,
          longitude,
          _viewport: viewport,
        };

        applyEnrichedOrder(enrichedOrder, runId);
        return enrichedOrder;
      },
    );
  };

  const deltasFromViewport = (viewport) => {
    if (!viewport) {
      return {
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
    }

    const latitudeDelta = Math.abs(viewport.ne.lat - viewport.sw.lat);

    const longitudeDelta = Math.abs(viewport.ne.lng - viewport.sw.lng);

    return {
      latitudeDelta: Math.max(latitudeDelta * 1.2, 0.006),
      longitudeDelta: Math.max(longitudeDelta * 1.2, 0.006),
    };
  };

  const seleccionarOrden = async (order) => {
    if (!order?.direccion && !hasCoordinates(order)) {
      Alert.alert(
        "Dirección no disponible",
        "Esta orden todavía no tiene una dirección utilizable para mostrarla en el mapa.",
      );
      return;
    }

    let latitude = order?.latitude ?? null;
    let longitude = order?.longitude ?? null;
    let viewport = order?._viewport ?? null;

    if ((latitude == null || longitude == null) && order?.direccion) {
      const network = await withTimeout(NetInfo.fetch(), 3000, null);

      const online = !!(
        network?.isConnected && network?.isInternetReachable !== false
      );

      const geocoded = await geocodeDireccion(order.direccion, online);

      latitude = geocoded?.lat ?? null;
      longitude = geocoded?.lng ?? null;
      viewport = geocoded?._viewport ?? null;
    }

    if (latitude == null || longitude == null) {
      Alert.alert(
        "Dirección no encontrada",
        "La dirección ya se muestra en la orden, pero no fue posible convertirla en un punto del mapa. Verifica la conexión e inténtalo nuevamente.",
      );
      return;
    }

    const selected = {
      ...order,
      latitude,
      longitude,
      _viewport: viewport,
    };

    setSelectedOrden(selected);
    setRouteInfo(null);
    setRouteError("");

    setOrdenes((current) =>
      current.map((item) =>
        item.order_id === selected.order_id ? selected : item,
      ),
    );

    const deltas = deltasFromViewport(viewport);

    if (mapRef.current) {
      if (Platform.OS === "android") {
        mapRef.current.animateCamera(
          {
            center: {
              latitude,
              longitude,
            },
            zoom: 16,
          },
          { duration: 500 },
        );
      } else {
        mapRef.current.animateToRegion(
          {
            latitude,
            longitude,
            ...deltas,
          },
          500,
        );
      }
    }

    setTimeout(() => {
      markerRefs.current[selected.order_id]?.showCallout?.();
    }, 550);
  };

  const centrarMiUbicacion = () => {
    if (!ubicacion || !mapRef.current) return;

    mapRef.current.animateCamera(
      {
        center: {
          latitude: ubicacion.latitude,
          longitude: ubicacion.longitude,
        },
        zoom: 16,
      },
      { duration: 500 },
    );
  };

  const ajustarMapaATodos = (sourceOrders = ordenes) => {
    if (!mapRef.current) return;

    const coordinates = (Array.isArray(sourceOrders) ? sourceOrders : [])
      .filter(hasCoordinates)
      .map((order) => ({
        latitude: Number(order.latitude),
        longitude: Number(order.longitude),
      }));

    if (!coordinates.length) {
      centrarMiUbicacion();
      return;
    }

    if (coordinates.length === 1) {
      mapRef.current.animateCamera(
        {
          center: coordinates[0],
          zoom: 15,
        },
        { duration: 500 },
      );
      return;
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 80,
        right: 55,
        bottom: 80,
        left: 55,
      },
      animated: true,
    });
  };

  const recargarOrdenes = async () => {
    if (loadingOrdenes) return;

    setLoadingOrdenes(true);
    remoteAddressAttemptedRef.current.clear();

    try {
      const result = await withTimeout(Promise.resolve(refresh()), 45000, {
        ok: false,
        reason: "timeout",
      });

      const refreshedList = Array.isArray(result?.cached?.data)
        ? result.cached.data
        : Array.isArray(result?.data)
          ? result.data
          : null;

      if (refreshedList) {
        prepararOrdenesDelDia(refreshedList);
      }

      if (result?.reason === "timeout") {
        Alert.alert(
          "Actualización en curso",
          "La sincronización está tardando más de lo esperado. La vista seguirá usando las órdenes que ya tiene cargadas.",
        );
      }
    } catch (error) {
      console.log("[RUTAS] Error al recargar:", error?.message || error);

      Alert.alert(
        "No se pudo actualizar",
        "Se conservarán las rutas que ya estaban visibles.",
      );
    } finally {
      if (mountedRef.current) setLoadingOrdenes(false);
    }
  };

  const filteredOrdenes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return ordenes;

    return ordenes.filter((order) =>
      [
        order?.order_id,
        order?.nombre_orden,
        order?.direccion,
        order?.cliente,
        order?.equipment,
        order?.Equipment,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [ordenes, query]);

  const mappedCount = useMemo(
    () => ordenes.filter(hasCoordinates).length,
    [ordenes],
  );

  const initialRegion = {
    latitude: ubicacion?.latitude || 19.4326,
    longitude: ubicacion?.longitude || -99.1332,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  const modeSafe = ["DRIVING", "WALKING", "BICYCLING", "TRANSIT"].includes(mode)
    ? mode
    : "DRIVING";

  const renderOrdenCard = ({ item }) => {
    const isSelected = selectedOrden?.order_id === item.order_id;

    const isMapped = hasCoordinates(item);

    return (
      <TouchableOpacity
        onPress={() => seleccionarOrden(item)}
        activeOpacity={0.88}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <View style={styles.cardSequence}>
          <Text style={styles.cardSequenceText}>{item.routeIndex}</Text>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={styles.badgeMini}>#{item.order_id || "—"}</Text>

            <Text style={styles.cardType} numberOfLines={1}>
              {item.nombre_orden || "Orden de servicio"}
            </Text>

            <View
              style={[
                styles.mapStatus,
                isMapped ? styles.mapStatusReady : styles.mapStatusPending,
              ]}
            >
              <Ionicons
                name={isMapped ? "checkmark" : "time-outline"}
                size={11}
                color={isMapped ? FIORI.success : FIORI.warning}
              />
              <Text
                style={[
                  styles.mapStatusText,
                  {
                    color: isMapped ? FIORI.success : FIORI.warning,
                  },
                ]}
              >
                {isMapped ? "En mapa" : "Sin ubicar"}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.cardCliente,
              !item?.cliente && styles.cardUnavailable,
            ]}
            numberOfLines={1}
          >
            {item?.cliente || "Cliente no disponible"}
          </Text>

          <View style={styles.cardAddressRow}>
            <View style={styles.addressIcon}>
              <Ionicons
                name="location-outline"
                size={15}
                color={FIORI.accent}
              />
            </View>

            <Text
              style={[
                styles.cardAddress,
                !item?.direccion && styles.cardUnavailable,
              ]}
              numberOfLines={2}
            >
              {item?.direccion || "Dirección no disponible"}
            </Text>

            <View
              style={[
                styles.goBtn,
                !item?.direccion && !isMapped && styles.goBtnDisabled,
              ]}
            >
              <Ionicons name="navigate" size={17} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Rutas asignadas" />

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          mapType="none"
          showsUserLocation
          showsCompass={false}
          showsMyLocationButton={false}
          initialRegion={initialRegion}
        >
          <UrlTile
            urlTemplate={
              "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=" +
              MAPTILER_KEY
            }
            maximumZ={19}
            zIndex={-1}
          />

          {ordenes.map((order) => {
            if (!hasCoordinates(order)) return null;

            const isSelected = selectedOrden?.order_id === order.order_id;

            return (
              <Marker
                key={String(order.order_id) + "-" + String(order.routeIndex)}
                ref={(ref) => {
                  markerRefs.current[order.order_id] = ref;
                }}
                coordinate={{
                  latitude: Number(order.latitude),
                  longitude: Number(order.longitude),
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => seleccionarOrden(order)}
              >
                <View
                  style={[styles.marker, isSelected && styles.markerSelected]}
                >
                  <Text
                    style={[
                      styles.markerText,
                      isSelected && styles.markerTextSelected,
                    ]}
                  >
                    {order.routeIndex}
                  </Text>
                </View>

                <Callout tooltip>
                  <View style={styles.callout}>
                    <Text style={styles.calloutOrder} numberOfLines={1}>
                      #{order.order_id}
                    </Text>
                    <Text style={styles.calloutClient} numberOfLines={1}>
                      {order.cliente || order.nombre_orden}
                    </Text>
                    <Text style={styles.calloutAddress} numberOfLines={2}>
                      {order.direccion}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}

          {selectedOrden &&
            ubicacion &&
            hasCoordinates(selectedOrden) &&
            GOOGLE_API_KEY && (
              <MapViewDirections
                key={selectedOrden.order_id + "-" + modeSafe}
                origin={{
                  latitude: ubicacion.latitude,
                  longitude: ubicacion.longitude,
                }}
                destination={{
                  latitude: Number(selectedOrden.latitude),
                  longitude: Number(selectedOrden.longitude),
                }}
                apikey={GOOGLE_API_KEY}
                strokeWidth={5}
                strokeColor={FIORI.accent}
                mode={modeSafe}
                optimizeWaypoints={false}
                timePrecision="now"
                onStart={() => {
                  setLoadingRoute(true);
                  setRouteError("");
                }}
                onError={(errorMessage) => {
                  console.log("[RUTAS] Directions error:", errorMessage);
                  setLoadingRoute(false);
                  setRouteInfo(null);
                  setRouteError("Ruta no disponible");
                }}
                onReady={(result) => {
                  setLoadingRoute(false);
                  setRouteError("");
                  setRouteInfo({
                    distance: result.distance,
                    duration: result.duration,
                  });

                  if (mapRef.current && result.coordinates?.length) {
                    mapRef.current.fitToCoordinates(result.coordinates, {
                      edgePadding: {
                        top: 95,
                        right: 55,
                        bottom: 90,
                        left: 55,
                      },
                      animated: true,
                    });
                  }
                }}
              />
            )}
        </MapView>

        <View style={styles.mapStatusPill}>
          {loadingOrdenes || preparingMap ? (
            <ActivityIndicator size="small" color={FIORI.accent} />
          ) : (
            <Ionicons name="map-outline" size={16} color={FIORI.accent} />
          )}

          <View>
            <Text style={styles.mapStatusTitle}>
              {loadingOrdenes
                ? "Cargando órdenes..."
                : preparingMap
                  ? "Preparando puntos..."
                  : mappedCount + " de " + ordenes.length + " ubicadas"}
            </Text>

            {!loadingOrdenes && (
              <Text style={styles.mapStatusSubtitle}>
                Rutas asignadas para hoy
              </Text>
            )}
          </View>
        </View>

        <View style={styles.modeContainer}>
          {[
            { key: "DRIVING", icon: "car-outline" },
            { key: "WALKING", icon: "walk-outline" },
            { key: "BICYCLING", icon: "bicycle-outline" },
            { key: "TRANSIT", icon: "bus-outline" },
          ].map((item) => {
            const active = modeSafe === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => setMode(item.key)}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={active ? "#FFFFFF" : FIORI.accent}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={[
            styles.fabStack,
            selectedOrden && styles.fabStackWithSelection,
          ]}
        >
          <TouchableOpacity
            style={[styles.fab, loadingUbic && styles.fabDisabled]}
            onPress={centrarMiUbicacion}
            disabled={loadingUbic || !ubicacion}
          >
            <Ionicons name="locate-outline" size={21} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fab}
            onPress={() => ajustarMapaATodos()}
          >
            <Ionicons name="scan-outline" size={21} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.fab, loadingOrdenes && styles.fabDisabled]}
            onPress={recargarOrdenes}
            disabled={loadingOrdenes}
          >
            {loadingOrdenes ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="refresh-outline" size={21} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {selectedOrden && (
          <View style={styles.selectedCard}>
            <View style={styles.selectedCardIcon}>
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
            </View>

            <View style={styles.selectedCardContent}>
              <Text style={styles.selectedCardOrder} numberOfLines={1}>
                Destino #{selectedOrden.order_id}
              </Text>

              <Text style={styles.selectedCardAddress} numberOfLines={2}>
                {selectedOrden.direccion}
              </Text>

              <View style={styles.routeInfoRow}>
                {loadingRoute ? (
                  <>
                    <ActivityIndicator size="small" color={FIORI.accent} />
                    <Text style={styles.routeInfoText}>Calculando ruta...</Text>
                  </>
                ) : routeInfo ? (
                  <>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={FIORI.accent}
                    />
                    <Text style={styles.routeInfoText}>
                      {Math.round(routeInfo.duration)} min
                      {"  ·  "}
                      {Number(routeInfo.distance).toFixed(1)} km
                    </Text>
                  </>
                ) : routeError ? (
                  <Text style={styles.routeErrorText}>{routeError}</Text>
                ) : !ubicacion ? (
                  <Text style={styles.routeInfoText}>
                    Activa la ubicación para calcular la ruta
                  </Text>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeSelectedBtn}
              onPress={() => {
                setSelectedOrden(null);
                setRouteInfo(null);
                setRouteError("");
              }}
            >
              <Ionicons name="close" size={18} color={FIORI.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View
        style={[
          styles.sheet,
          sheetExpanded ? styles.sheetExpanded : styles.sheetCollapsed,
        ]}
      >
        <TouchableOpacity
          style={styles.sheetHandle}
          activeOpacity={0.8}
          onPress={() => setSheetExpanded((current) => !current)}
        >
          <View style={styles.handleBar} />
          <Ionicons
            name={sheetExpanded ? "chevron-down" : "chevron-up"}
            size={18}
            color={FIORI.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Órdenes de hoy</Text>
            <Text style={styles.sheetSubtitle}>
              {ordenes.length} asignadas · {mappedCount} en mapa
            </Text>
          </View>

          <TouchableOpacity
            style={styles.fitListBtn}
            onPress={() => ajustarMapaATodos()}
          >
            <Ionicons name="map-outline" size={16} color={FIORI.accent} />
            <Text style={styles.fitListBtnText}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={17} color={FIORI.textMuted} />

          <TextInput
            placeholder="Buscar orden, cliente o dirección"
            placeholderTextColor={FIORI.textMuted}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />

          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              style={styles.clearBtn}
            >
              <Ionicons name="close" size={17} color={FIORI.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredOrdenes}
          keyExtractor={(item, index) =>
            (item?.order_id || "orden") + "-" + index
          }
          renderItem={renderOrdenCard}
          contentContainerStyle={[
            styles.listContent,
            !filteredOrdenes.length && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={query ? "search-outline" : "calendar-outline"}
                  size={24}
                  color={FIORI.accent}
                />
              </View>

              <Text style={styles.emptyTitle}>
                {loadingOrdenes
                  ? "Cargando órdenes..."
                  : query
                    ? "No hay coincidencias"
                    : "No hay rutas asignadas para hoy"}
              </Text>

              <Text style={styles.emptyText}>
                {query
                  ? "Prueba con otro número, cliente o dirección."
                  : "Puedes actualizar la vista con el botón del mapa."}
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },
  mapWrapper: {
    flex: 1,
    position: "relative",
    backgroundColor: FIORI.panelSubtle,
  },
  map: {
    width: "100%",
    height: "100%",
  },

  mapStatusPill: {
    position: "absolute",
    top: 12,
    left: 12,
    minHeight: 48,
    maxWidth: "48%",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: FIORI.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...shadow(0.8),
  },
  mapStatusTitle: {
    color: FIORI.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  mapStatusSubtitle: {
    color: FIORI.textMuted,
    fontSize: 10,
    marginTop: 1,
    fontWeight: "600",
  },

  modeContainer: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: FIORI.border,
    ...shadow(0.8),
  },
  modeChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: FIORI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: FIORI.border,
  },
  modeChipActive: {
    backgroundColor: FIORI.accent,
    borderColor: FIORI.accent,
  },

  marker: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 7,
    borderRadius: 15,
    backgroundColor: FIORI.panelBg,
    borderWidth: 3,
    borderColor: FIORI.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow(1),
  },
  markerSelected: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: FIORI.accent,
    borderColor: "#FFFFFF",
  },
  markerText: {
    color: FIORI.accentDark,
    fontSize: 11,
    fontWeight: "900",
  },
  markerTextSelected: {
    color: "#FFFFFF",
    fontSize: 13,
  },

  callout: {
    width: 230,
    backgroundColor: FIORI.panelBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 12,
    ...shadow(1),
  },
  calloutOrder: {
    color: FIORI.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  calloutClient: {
    color: FIORI.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  calloutAddress: {
    color: FIORI.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },

  fabStack: {
    position: "absolute",
    right: 12,
    bottom: 14,
    gap: 9,
  },
  fabStackWithSelection: {
    bottom: 112,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: FIORI.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...shadow(1),
  },
  fabDisabled: {
    opacity: 0.5,
  },

  selectedCard: {
    position: "absolute",
    left: 12,
    right: 66,
    bottom: 12,
    minHeight: 88,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    ...shadow(1),
  },
  selectedCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: FIORI.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCardContent: {
    flex: 1,
  },
  selectedCardOrder: {
    color: FIORI.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  selectedCardAddress: {
    color: FIORI.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  routeInfoRow: {
    minHeight: 18,
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  routeInfoText: {
    color: FIORI.accentDark,
    fontSize: 11,
    fontWeight: "800",
  },
  routeErrorText: {
    color: FIORI.danger,
    fontSize: 11,
    fontWeight: "800",
  },
  closeSelectedBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: FIORI.panelSubtle,
    alignItems: "center",
    justifyContent: "center",
  },

  sheet: {
    backgroundColor: FIORI.panelBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: FIORI.border,
    overflow: "hidden",
    ...shadow(1),
  },
  sheetCollapsed: {
    height: 145,
  },
  sheetExpanded: {
    height: 370,
  },
  sheetHandle: {
    alignItems: "center",
    paddingTop: 7,
    paddingBottom: 2,
  },
  handleBar: {
    width: 38,
    height: 4,
    backgroundColor: FIORI.borderMuted,
    borderRadius: 999,
    marginBottom: 1,
  },
  sheetHeader: {
    minHeight: 45,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: FIORI.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  sheetSubtitle: {
    color: FIORI.textMuted,
    fontSize: 11,
    marginTop: 1,
    fontWeight: "600",
  },
  fitListBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: FIORI.accentSoft,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  fitListBtnText: {
    color: FIORI.accentDark,
    fontSize: 11,
    fontWeight: "800",
  },

  searchRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: FIORI.panelSubtle,
    marginHorizontal: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
    marginBottom: 9,
  },
  searchInput: {
    flex: 1,
    color: FIORI.ink,
    paddingVertical: 7,
    fontSize: 13,
  },
  clearBtn: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FIORI.panelBg,
  },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 18,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listSeparator: {
    height: 9,
  },
  card: {
    minHeight: 102,
    backgroundColor: FIORI.panelBg,
    borderRadius: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    ...shadow(0.35),
  },
  cardSelected: {
    borderColor: FIORI.accent,
    borderWidth: 1.5,
    backgroundColor: "#F5FAFF",
  },
  cardSequence: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: FIORI.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  cardSequenceText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  cardContent: {
    flex: 1,
  },
  cardTopRow: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeMini: {
    color: FIORI.accentDark,
    fontWeight: "900",
    fontSize: 10,
    backgroundColor: FIORI.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    overflow: "hidden",
  },
  cardType: {
    color: FIORI.ink,
    fontWeight: "800",
    fontSize: 12,
    flex: 1,
  },
  mapStatus: {
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  mapStatusReady: {
    backgroundColor: FIORI.successSoft,
  },
  mapStatusPending: {
    backgroundColor: FIORI.warningSoft,
  },
  mapStatusText: {
    fontSize: 9,
    fontWeight: "900",
  },
  cardCliente: {
    color: FIORI.ink,
    fontSize: 12,
    marginTop: 3,
    marginBottom: 6,
    fontWeight: "700",
  },
  cardAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  addressIcon: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: FIORI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAddress: {
    color: FIORI.textMuted,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  cardUnavailable: {
    color: "#8B95A5",
    fontStyle: "italic",
  },
  goBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: FIORI.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  goBtnDisabled: {
    opacity: 0.45,
  },

  emptyState: {
    flex: 1,
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 20,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: FIORI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  emptyTitle: {
    color: FIORI.ink,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: FIORI.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
  },
});

function shadow(multiplier = 1) {
  return Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.08 * multiplier,
      shadowRadius: 7 * multiplier,
      shadowOffset: {
        width: 0,
        height: 3 * multiplier,
      },
    },
    android: {
      elevation: 2 * multiplier,
    },
    default: {},
  });
}