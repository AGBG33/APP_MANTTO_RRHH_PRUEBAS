// app/supervisor/equipos/[equipo].js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

const BG = "#F7F7F7";
const CARD = "#FFFFFF";
const BORDER = "#DDE6F2";
const TEXT = "#0B1F3B";
const MUTED = "#5B6B7C";
const SAP_BLUE = "#0A6ED1";

const safeStr = (v) => String(v ?? "").trim();

function normalizeTipo(tipo) {
  const t = safeStr(tipo).toUpperCase();
  if (t.includes("ESCAL")) return "ESCALERA";
  if (t.includes("ELEV")) return "ELEVADOR";
  return t || "SIN TIPO";
}

function odataResults(payload) {
  const arr = payload?.d?.results;
  return Array.isArray(arr) ? arr : [];
}

function Field({ label, value }) {
  const v = safeStr(value);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{v || "-"}</Text>
    </View>
  );
}

export default function EquipoDetailScreen() {
  const { equipo } = useLocalSearchParams();
  const equipoId = safeStr(equipo);

  const { user } = useAuth();
  const email = useMemo(() => {
    return (
      safeStr(user?.correo) ||
      safeStr(user?.email) ||
      safeStr(user?.preferred_username) ||
      ""
    );
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);
  const [error, setError] = useState("");

  const fetchDetail = useCallback(async () => {
    if (!equipoId) {
      setError("Falta el parámetro de equipo.");
      setLoading(false);
      return;
    }

    if (!email) {
      setError("No se pudo determinar el correo del supervisor desde la sesión.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ✅ IMPORTANTE:
      // SAP Gateway no soporta GET por clave (('MX...')) -> 501
      // Entonces leemos por $filter (lo que sí funciona)
      const emailSafe = email.replace(/'/g, "''");
      const eqSafe = equipoId.replace(/'/g, "''");
      const filter = `Mail eq '${emailSafe}' and Equipo eq '${eqSafe}'`;

      const resp = await api.get("/api/odata/ZSD_CATALOGOS_SRV/EquipmentByRespSet", {
        params: { $filter: filter },
      });

      const results = odataResults(resp?.data);
      const entity = results[0] || null;

      if (!entity) {
        setRow(null);
        setError("SAP no regresó datos para ese equipo (no encontrado o no asignado).");
      } else {
        setRow(entity);
      }
    } catch (e) {
      // intenta mostrar el mensaje real de SAP
      const sapMsg =
        e?.response?.data?.error?.message?.value ||
        e?.response?.data?.error?.message ||
        e?.response?.data?.detail ||
        e?.message ||
        String(e);

      setError(String(sapMsg));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [equipoId, email]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle del equipo" />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Cargando detalle…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Header title="Detalle del equipo" />
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle" size={22} color="#B00020" />
          <Text style={styles.errorText}>{error}</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable onPress={() => router.back()} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>Volver</Text>
            </Pressable>
            <Pressable onPress={fetchDetail} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>Reintentar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.container}>
        <Header title="Detalle del equipo" />
        <View style={styles.errorWrap}>
          <Ionicons name="cube-outline" size={24} color={MUTED} />
          <Text style={styles.muted}>No hay datos para este equipo.</Text>
          <Pressable onPress={() => router.back()} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>Volver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const tipo = normalizeTipo(row.Tipo);

  return (
    <View style={styles.container}>
      <Header title="Detalle del equipo" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.tipoPill}>
              <Text style={styles.tipoText}>{tipo}</Text>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={20} color={MUTED} />
            </Pressable>
          </View>

          <Text style={styles.heroEquipo}>{safeStr(row.Equipo) || equipoId}</Text>
          {!!safeStr(row.Descripcion) && (
            <Text style={styles.heroDesc}>{safeStr(row.Descripcion)}</Text>
          )}
          {!!safeStr(row.Ubicacion) && (
            <Text style={styles.heroSub}>{safeStr(row.Ubicacion)}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Datos del equipo</Text>
          <Field label="Equipo" value={row.Equipo} />
          <Field label="Tipo" value={row.Tipo} />
          <Field label="Tipo de control" value={row.TipoControl} />
          <Field label="Serie" value={row.Serie} />
          <Field label="Días de servicio" value={row.DiasServicio} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Datos del personal</Text>
          <Field label="Mecánico" value={row.Mecanico} />
          <Field label="Nómina Mecánico" value={row.NominaMec} />
          <Field label="Ayudante" value={row.Ayudante} />
          <Field label="Nómina Ayudante" value={row.NominaAyu} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ubicación</Text>
          <Field label="Ubicación" value={row.Ubicacion} />
          <Field label="Descripción" value={row.Descripcion} />
          <Field label="Mail" value={row.Mail} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: MUTED },

  heroCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
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
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tipoPill: {
    backgroundColor: "#E9F2FE",
    borderColor: "#CFE3FD",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tipoText: { color: SAP_BLUE, fontWeight: "800", fontSize: 12 },
  heroEquipo: { marginTop: 10, fontSize: 18, fontWeight: "900", color: TEXT },
  heroDesc: { marginTop: 6, color: TEXT, fontSize: 14, fontWeight: "700" },
  heroSub: { marginTop: 4, color: MUTED, fontSize: 13 },

  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: TEXT, fontWeight: "900", marginBottom: 10, fontSize: 14 },

  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  fieldLabel: { color: MUTED, fontWeight: "800", fontSize: 12, flex: 1 },
  fieldValue: { color: TEXT, fontWeight: "800", fontSize: 12, flex: 1, textAlign: "right" },

  errorWrap: {
    margin: 16,
    backgroundColor: "#FDECEC",
    borderColor: "#F5C2C7",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  errorText: { color: "#B00020", fontWeight: "800", textAlign: "center", marginTop: 8 },

  btnPrimary: {
    backgroundColor: SAP_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 14,
  },
  btnPrimaryText: { color: "#FFF", fontWeight: "900" },

  btnGhost: {
    backgroundColor: "#EFF4F9",
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 14,
  },
  btnGhostText: { color: TEXT, fontWeight: "900" },
});