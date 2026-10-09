// app/tecnico/averias/[averiaid]/detalles.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import {
  saveAveriaDetailCache,
  loadAveriaDetailCache,
} from "../../../../src/offline/averiasCache";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  chipBg: "#EAF3FF",
};

const isOnlineNow = async () => {
  const st = await NetInfo.fetch();
  return !!st?.isConnected && st?.isInternetReachable !== false;
};

const formatSapCalendarDate = (value) => {
  if (!value) return "—";

  const text = String(value).trim();
  const sapMatch = text.match(/\/Date\((-?\d+)(?:[+-]\d{4})?\)\//);

  if (sapMatch?.[1]) {
    const milliseconds = Number(sapMatch[1]);
    if (!Number.isFinite(milliseconds)) return "—";

    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return "—";

    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  const calendarMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (calendarMatch) {
    const [, year, month, day] = calendarMatch;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

export default function DetallesAveriaTecnico() {
  const { averiaid } = useLocalSearchParams();

  const [header, setHeader] = useState(null);
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMsg, setOfflineMsg] = useState("");

  const fetchDetalle = async () => {
    try {
      setLoading(true);
      setOfflineMsg("");

      const id = String(averiaid || "").trim();
      if (!id || id === "undefined" || id === "null") {
        setHeader(null);
        setItem(null);
        return;
      }

      const online = await isOnlineNow();

      if (!online) {
        const cached = await loadAveriaDetailCache({ averiaid: id });
        if (cached?.header || cached?.item) {
          setHeader(cached.header ?? null);
          setItem(cached.item ?? null);
          setOfflineMsg(
            `Mostrando detalle offline (guardado: ${new Date(cached.savedAt).toLocaleString()})`,
          );
        } else {
          setHeader(null);
          setItem(null);
          Alert.alert("Sin conexión", "No hay cache para este aviso todavía.");
        }
        return;
      }

      const resHdr = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet('${encodeURIComponent(id)}')`,
        { params: { $format: "json" } },
      );
      const hdr = resHdr?.data?.d ?? resHdr?.data ?? null;

      const resItems = await api.get(
        `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet('${encodeURIComponent(id)}')/NotificationItemsSet`,
        { params: { $format: "json" } },
      );

      const itemsRaw = resItems?.data;
      const items = itemsRaw?.d?.results ?? itemsRaw?.value ?? [];
      const first = items?.[0] ?? null;

      setHeader(hdr);
      setItem(first);

      await saveAveriaDetailCache({
        averiaid: id,
        header: hdr,
        item: first,
        codigos: null,
      });
    } catch (err) {
      console.error("Error detalle técnico:", err?.response?.data || err);

      try {
        const id = String(averiaid || "").trim();
        const cached = await loadAveriaDetailCache({ averiaid: id });
        if (cached?.header || cached?.item) {
          setHeader(cached.header ?? null);
          setItem(cached.item ?? null);
          setOfflineMsg(
            `Mostrando último cache guardado (guardado: ${new Date(cached.savedAt).toLocaleString()})`,
          );
        } else {
          Alert.alert("Error", "No se pudo cargar el detalle del aviso.");
          setHeader(null);
          setItem(null);
        }
      } catch {
        Alert.alert("Error", "No se pudo cargar el detalle del aviso.");
        setHeader(null);
        setItem(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (averiaid) fetchDetalle();
  }, [averiaid]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Cargando detalle…</Text>
        </View>
      </View>
    );
  }

  if (!header) {
    return (
      <View style={styles.container}>
        <Header title="Detalle de avería" />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            No se encontró información para el aviso #{String(averiaid || "")}
          </Text>

          <TouchableOpacity
            onPress={fetchDetalle}
            style={[styles.btnSecondary, styles.retryButton]}
          >
            <Text style={styles.btnSecondaryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const notifNo = header?.NotifNo || averiaid;
  const shortText = header?.ShortText || "";
  const equipment = header?.Equipment || "";
  const materialLong = header?.MaterialLong || "";
  const notifDate = header?.NotifDate || header?.CreatedOn || null;

  const descript = item?.Descript || "";
  const damage = {
    DCatTyp: item?.DCatTyp,
    DCodegrp: item?.DCodegrp,
    DCode: item?.DCode,
  };
  const part = {
    DlCatTyp: item?.DlCatTyp,
    DlCodegrp: item?.DlCodegrp,
    DlCode: item?.DlCode,
  };

  return (
    <View style={styles.container}>
      <Header title={`Aviso ${notifNo}`} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!!offlineMsg && (
          <View style={styles.offlineBox}>
            <Text style={styles.offlineText}>{offlineMsg}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver a la lista</Text>
        </TouchableOpacity>

        <View style={styles.cardHighlight}>
          <View style={styles.primaryDataRow}>
            <View style={styles.primaryDataItem}>
              <Text style={styles.infoLabel}>Equipo</Text>
              <View style={styles.valueWithIcon}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={16}
                  color={COLORS.accent}
                />
                <Text style={styles.primaryValue}>{equipment || "—"}</Text>
              </View>
            </View>

            <View style={styles.primaryDataItem}>
              <Text style={styles.infoLabel}>Fecha</Text>
              <View style={styles.valueWithIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={COLORS.accent}
                />
                <Text style={styles.primaryValue}>
                  {formatSapCalendarDate(notifDate)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.descriptionBlock}>
            <Text style={styles.infoLabel}>Descripción breve</Text>
            <Text style={styles.mainTitle}>
              {shortText || "Sin descripción"}
            </Text>
          </View>

          {materialLong ? (
            <View style={styles.chip}>
              <Ionicons
                name="pin-outline"
                size={14}
                color={COLORS.accent}
                style={styles.chipIcon}
              />
              <Text style={styles.chipText} numberOfLines={2}>
                {materialLong}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Detalle del aviso</Text>

          {descript ? (
            <View style={styles.detailDescription}>
              <Text style={styles.infoLabel}>Descripción</Text>
              <Text style={styles.infoValue}>{descript}</Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>Sin ítems / sin descripción.</Text>
          )}

          <View style={styles.detailGroup}>
            <Text style={styles.infoLabel}>Daño</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Tipo: {damage.DCatTyp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Grupo: {damage.DCodegrp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Código: {damage.DCode || "—"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.partGroup}>
            <Text style={styles.infoLabel}>Parte dañada</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Tipo: {part.DlCatTyp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Grupo: {part.DlCodegrp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Código: {part.DlCode || "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 24 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, color: COLORS.text, fontSize: 13 },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  emptyText: { color: COLORS.text, textAlign: "center" },
  retryButton: { marginTop: 14 },

  offlineBox: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFFBEA",
    borderWidth: 1,
    borderColor: "#F7E7A3",
  },
  offlineText: { color: "#6B4F00", fontWeight: "800" },

  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 4,
  },
  backText: {
    marginLeft: 4,
    color: COLORS.accent,
    fontWeight: "600",
    fontSize: 13,
  },

  cardHighlight: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  primaryDataRow: {
    flexDirection: "row",
    marginHorizontal: -5,
  },
  primaryDataItem: {
    flex: 1,
    marginHorizontal: 5,
  },
  valueWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  primaryValue: {
    marginLeft: 6,
    fontSize: 14,
    color: COLORS.title,
    fontWeight: "700",
  },
  descriptionBlock: {
    marginTop: 14,
    marginBottom: 10,
  },
  mainTitle: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.title,
    lineHeight: 21,
  },

  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  chipIcon: { marginRight: 4 },
  chipText: { fontSize: 11, color: COLORS.title },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.text,
    opacity: 0.8,
    marginBottom: 2,
  },
  infoValue: { fontSize: 14, color: COLORS.title, fontWeight: "600" },
  detailDescription: { marginBottom: 10 },
  noDataText: { color: COLORS.text },
  detailGroup: { marginTop: 6 },
  partGroup: { marginTop: 10 },

  btnSecondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  btnSecondaryText: { color: COLORS.accent, fontWeight: "800", fontSize: 13 },
  bottomSpace: { height: 16 },
});