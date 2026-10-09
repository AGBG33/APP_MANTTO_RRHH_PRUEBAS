// app/supervisor/equipos/index.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

const BG = "#F7F7F7";
const CARD = "#FFFFFF";
const BORDER = "#DDE6F2";
const TEXT = "#0B1F3B";
const MUTED = "#5B6B7C";
const SAP_BLUE = "#0A6ED1";

function safeStr(v) {
  return String(v ?? "").trim();
}

function odataResults(payload) {
  // SAP OData v2: { d: { results: [] } }
  const arr = payload?.d?.results;
  return Array.isArray(arr) ? arr : [];
}

function normalizeTipo(tipo) {
  const t = safeStr(tipo).toUpperCase();
  if (t.includes("ESCAL")) return "ESCALERA";
  if (t.includes("ELEV")) return "ELEVADOR";
  return t || "SIN TIPO";
}

function EquipoRow({ item, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "#d7e3f3" }}
      style={({ pressed }) => [
        styles.card,
        pressed && Platform.OS === "ios" ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={styles.rowTop}>
        <View style={styles.tipoPill}>
          <Text style={styles.tipoText}>{normalizeTipo(item.Tipo)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={MUTED} />
      </View>

      <Text style={styles.equipo} numberOfLines={1}>
        {safeStr(item.Equipo) || "SIN EQUIPO"}
      </Text>

      {/* opcional: una línea chiquita para contexto (puedes quitarla) */}
      {!!safeStr(item.Descripcion) && (
        <Text style={styles.desc} numberOfLines={1}>
          {safeStr(item.Descripcion)}
        </Text>
      )}
    </Pressable>
  );
}

export default function EquiposSupervisorScreen() {
  const { user } = useAuth();

  const email =
    safeStr(user?.correo) ||
    safeStr(user?.email) ||
    safeStr(user?.preferred_username) ||
    "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("TODOS"); // TODOS | ELEVADOR | ESCALERA
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const fetchEquipos = useCallback(async () => {
    if (!email) {
      setError("No se pudo determinar el correo del supervisor desde la sesión.");
      setRows([]);
      setLoading(false);
      return;
    }

    setError("");
    try {
      // ✅ OData filter: Mail eq 'email'
      // OJO: escapamos comillas simples por si el correo trae algo raro (normalmente no)
      const emailSafe = email.replace(/'/g, "''");
      const filter = `Mail eq '${emailSafe}'`;

      const resp = await api.get(
        "/api/odata/ZSD_CATALOGOS_SRV/EquipmentByRespSet",
        {
          params: { $filter: filter },
        }
      );

      const list = odataResults(resp?.data);

      // normaliza campos principales
      const normalized = list.map((x) => ({
        ...x,
        Equipo: safeStr(x.Equipo),
        Tipo: normalizeTipo(x.Tipo),
      }));

      // orden: Tipo, Equipo
      normalized.sort((a, b) => {
        const t = safeStr(a.Tipo).localeCompare(safeStr(b.Tipo));
        if (t !== 0) return t;
        return safeStr(a.Equipo).localeCompare(safeStr(b.Equipo));
      });

      setRows(normalized);
    } catch (e) {
      const detail =
        e?.response?.data?.error ||
        e?.response?.data?.detail ||
        e?.message ||
        String(e);

      setError(String(detail));
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [email]);

  useEffect(() => {
    setLoading(true);
    fetchEquipos();
  }, [fetchEquipos]);

  const filtered = useMemo(() => {
    const q = safeStr(query).toLowerCase();

    return rows.filter((r) => {
      const tipoOk =
        tipoFilter === "TODOS" ? true : safeStr(r.Tipo) === tipoFilter;

      if (!tipoOk) return false;

      if (!q) return true;

      const equipo = safeStr(r.Equipo).toLowerCase();
      const tipo = safeStr(r.Tipo).toLowerCase();
      const desc = safeStr(r.Descripcion).toLowerCase();
      const ubic = safeStr(r.Ubicacion).toLowerCase();

      return (
        equipo.includes(q) ||
        tipo.includes(q) ||
        desc.includes(q) ||
        ubic.includes(q)
      );
    });
  }, [rows, query, tipoFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEquipos();
  }, [fetchEquipos]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Equipos a cargo" />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Cargando equipos…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Equipos a cargo" />

      {/* Buscador */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por equipo, tipo, ubicación…"
          placeholderTextColor="#93A1B1"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={MUTED} />
          </Pressable>
        )}
      </View>

      {/* Filtros por tipo */}
      <View style={styles.tabs}>
        {["TODOS", "ELEVADOR", "ESCALERA"].map((t) => {
          const active = tipoFilter === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTipoFilter(t)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color="#B00020" />
          <Text style={styles.errorText} numberOfLines={3}>
            {error}
          </Text>
          <Pressable onPress={fetchEquipos} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item, idx) => safeStr(item.Equipo) || String(idx)}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={34} color={MUTED} />
            <Text style={styles.emptyTitle}>Sin equipos</Text>
            <Text style={styles.emptyText}>
              No se encontraron equipos asignados a tu usuario.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <EquipoRow
            item={item}
            onPress={() =>
              router.push({
                pathname: "/supervisor/equipos/[equipo]",
                params: { equipo: safeStr(item.Equipo) },
              })
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: MUTED },

  searchWrap: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
  },

  tabs: {
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    backgroundColor: "#EFF4F9",
    borderColor: BORDER,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  tabActive: {
    borderColor: SAP_BLUE,
    backgroundColor: "#E9F2FE",
  },
  tabText: { color: MUTED, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: SAP_BLUE },

  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tipoPill: {
    backgroundColor: "#E9F2FE",
    borderColor: "#CFE3FD",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tipoText: { color: SAP_BLUE, fontWeight: "800", fontSize: 12 },
  equipo: { marginTop: 10, fontSize: 16, fontWeight: "800", color: TEXT },
  desc: { marginTop: 6, color: MUTED, fontSize: 13 },

  errorBox: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: "#FDECEC",
    borderColor: "#F5C2C7",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorText: { flex: 1, color: "#B00020", fontWeight: "700", fontSize: 12 },
  retryBtn: {
    backgroundColor: "#B00020",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryText: { color: "#FFF", fontWeight: "800", fontSize: 12 },

  empty: { marginTop: 40, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: TEXT, marginTop: 4 },
  emptyText: { color: MUTED, textAlign: "center", paddingHorizontal: 32 },
});