// app/supervisor/no_mantenimiento/index.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
};

const ESTATUS_CARTA_NO_MANTTO = "0600";
const ESTATUS_CARTA_NO_MANTTO_LABEL = "Carta No Mantto";

const safeStr = (v) => (v == null ? "" : String(v));

const parseSapDate = (v) => {
  if (!v) return null;

  const m = String(v).match(/\/Date\((\-?\d+)\)\//);
  if (!m) return null;

  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;

  return new Date(ms);
};

function normalizeCode(code) {
  const s = safeStr(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function extractStatusCodes(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return [];

  const matches = s.match(/\d{1,4}/g) || [];

  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));

  return Array.from(new Set(codes));
}

// Nueva regla:
// Carta No Mantto únicamente se identifica con 0600.
function isCartaNoManttoByUserstatus(userstatusRaw, estatusCodeRaw) {
  const codes = extractStatusCodes(userstatusRaw);
  const apiCode = normalizeCode(estatusCodeRaw);

  return (
    codes.includes(ESTATUS_CARTA_NO_MANTTO) ||
    apiCode === ESTATUS_CARTA_NO_MANTTO
  );
}

function formatDateTime(value) {
  const d = parseSapDate(value);
  if (!d) return "—";

  return d.toLocaleString();
}

export default function NoMantenimientoIndex() {
  const { user } = useAuth();

  const correo = useMemo(() => {
    return safeStr(
      user?.email || user?.correo || user?.upn || user?.username,
    ).trim();
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const params = useLocalSearchParams();
  const { refresh } = params;

  const fetchLista = useCallback(async () => {
    try {
      if (!correo) {
        setRows([]);
        setLoading(false);

        Alert.alert(
          "Sin correo",
          "No se detectó el correo del usuario loggeado.",
        );

        return;
      }

      setLoading(true);

      // Rango anual ajustable.
      const from = "2026-01-01T00:00:00";
      const to = "2026-12-31T23:59:59";

      /**
       * Se conserva este filtro porque así estaba tu consulta actual.
       * Después filtramos localmente solo las órdenes con estatus 0600.
       */
      const filter =
        `StartDate ge datetime'${from}' and ` +
        `FinishDate le datetime'${to}' and ` +
        `Userstatus eq '${correo}'`;

      const url =
        `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet` +
        `?$filter=${encodeURIComponent(filter)}` +
        `&$format=json`;

      console.log("[CARTA_NO_MANTTO] correo loggeado =>", correo);
      console.log(
        "[CARTA_NO_MANTTO] ODATA URL =>",
        `${api.defaults.baseURL}${url}`,
      );

      const { data } = await api.get(url);
      const results = Array.isArray(data?.d?.results) ? data.d.results : [];

      const filtradas = results.filter((it) => {
        const us = it?.Userstatus || it?.UserStatus || "";
        const estatusCode =
          it?.estatus_code ||
          it?.EstatusCode ||
          it?.StatusCode ||
          it?.Status ||
          "";

        return isCartaNoManttoByUserstatus(us, estatusCode);
      });

      const s = q.trim().toLowerCase();

      const buscadas = !s
        ? filtradas
        : filtradas.filter((it) => {
            const order = safeStr(
              it?.Orderid || it?.OrderId || it?.OrderID,
            ).toLowerCase();

            const equip = safeStr(
              it?.Equipment || it?.Equipo,
            ).toLowerCase();

            const text = safeStr(
              it?.ShortText || it?.Description || it?.Descripcion,
            ).toLowerCase();

            return (
              order.includes(s) ||
              equip.includes(s) ||
              text.includes(s) ||
              ESTATUS_CARTA_NO_MANTTO_LABEL.toLowerCase().includes(s)
            );
          });

      setRows(buscadas);
    } catch (e) {
      console.error(
        "Error lista Carta No Mantto (ODATA):",
        e?.response?.data || e?.message,
      );

      setRows([]);

      Alert.alert(
        "Error",
        "No se pudo cargar la lista de Carta No Mantto. Revisa la consola.",
      );
    } finally {
      setLoading(false);
    }
  }, [q, correo]);

  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

  useEffect(() => {
    if (refresh) fetchLista();
  }, [refresh, fetchLista]);

  const onPullRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchLista();
    } finally {
      setRefreshing(false);
    }
  };

  const openDetalle = (item) => {
    const orderId = safeStr(
      item?.Orderid || item?.OrderId || item?.OrderID,
    ).trim();

    if (!orderId) {
      Alert.alert("Error", "No se pudo determinar la orden.");
      return;
    }

    router.push({
      pathname: "/supervisor/no_mantenimiento/detalles",
      params: {
        id: orderId,
      },
    });
  };

  const renderItem = ({ item }) => {
    const orderId = safeStr(item?.Orderid || item?.OrderId || item?.OrderID);
    const startDate = formatDateTime(item?.StartDate);
    const finishDate = formatDateTime(item?.FinishDate);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openDetalle(item)}
        activeOpacity={0.75}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.title}>Orden {orderId || "—"}</Text>

          <View style={[styles.pill, styles.pillPending]}>
            <Text style={styles.pillText}>{ESTATUS_CARTA_NO_MANTTO_LABEL}</Text>
          </View>
        </View>

        <Text style={styles.line}>
          <Text style={styles.label}>Equipo: </Text>
          {safeStr(item?.Equipment || item?.Equipo || "—")}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Texto: </Text>
          {safeStr(
            item?.ShortText || item?.Description || item?.Descripcion || "—",
          )}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Estatus: </Text>
          {ESTATUS_CARTA_NO_MANTTO_LABEL}
        </Text>

        <Text style={[styles.line, { marginTop: 6, fontSize: 12 }]}>
          <Text style={styles.label}>Inicio: </Text>
          {startDate}
          {"  ·  "}
          <Text style={styles.label}>Fin: </Text>
          {finishDate}
        </Text>

        <Text style={[styles.line, { marginTop: 6, fontSize: 12 }]}>
          <Text style={styles.label}>Supervisor: </Text>
          {correo || "—"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Carta No Mantto" />

      <View style={styles.content}>
        <View style={styles.searchBox}>
          <Ionicons
            name="search"
            size={18}
            color={COLORS.text}
            style={{ marginRight: 6 }}
          />

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por orden, equipo o texto..."
            placeholderTextColor="#8A96A3"
            style={styles.searchInput}
            onSubmitEditing={fetchLista}
            returnKeyType="search"
            autoCapitalize="none"
          />

          <TouchableOpacity
            onPress={fetchLista}
            style={styles.searchBtn}
            disabled={!correo}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        {!correo ? (
          <Text style={styles.emptyText}>
            No se detectó el correo del usuario loggeado.
          </Text>
        ) : loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ marginTop: 8, color: COLORS.text }}>
              Cargando…
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it, idx) =>
              safeStr(it?.Orderid || it?.OrderId || it?.OrderID || idx)
            }
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 90 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No hay órdenes con estatus Carta No Mantto.
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  content: {
    flex: 1,
    padding: 14,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    color: COLORS.title,
    fontSize: 13,
  },

  searchBtn: {
    backgroundColor: COLORS.accent,
    padding: 8,
    borderRadius: 12,
    marginLeft: 8,
  },

  loadingBox: {
    paddingTop: 24,
    alignItems: "center",
  },

  emptyText: {
    color: COLORS.text,
    textAlign: "center",
    marginTop: 20,
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.title,
    flex: 1,
    paddingRight: 8,
  },

  line: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 13,
  },

  label: {
    fontWeight: "900",
    color: COLORS.title,
  },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  pillPending: {
    backgroundColor: "#FFF3CD",
  },

  pillText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.title,
  },
});