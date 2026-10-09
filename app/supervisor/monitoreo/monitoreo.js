// app/supervisor/monitoreo/index.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

import api from "../../../src/services/api";
import Header from "../../../src/components/Header";
import { useAuth } from "../../../src/context/AuthContext";

const BG = "#F4F6F9";
const SAP_BLUE = "#0A6ED1";
const SAP_RED = "#E74C3C";
const CARD = "#FFFFFF";

const DEFAULT_REGION_MX = {
  latitude: 23.6345,
  longitude: -102.5528,
  latitudeDelta: 15,
  longitudeDelta: 15,
};

const sapDateToDate = (val) => {
  if (!val) return null;
  const s = String(val);
  const m = s.match(/\/Date\((\d+)\)\//);
  if (m?.[1]) {
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

const safeStr = (v) => String(v ?? "").trim();

// ✅ Para mostrar fecha bonita sin romper si viene null
const formatTs = (d) => {
  if (!d) return "—";
  try {
    return d.toLocaleString();
  } catch {
    return "—";
  }
};

export default function Monitoreo() {
  const { user } = useAuth();

  const [tecnicos, setTecnicos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const mapRef = useRef(null);

  const correoSupervisor =
    user?.correo || user?.email || user?.preferred_username || "";

  const cargarUbicaciones = async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      if (!correoSupervisor) {
        setTecnicos([]);
        setErrorMsg("No se encontró el correo del usuario logueado.");
        return;
      }

      const res = await api.get(
        "/api/odata/ZCS_GEOLOZACION_SRV/GeoLocalizacionSet",
        {
          params: {
            $filter: `Usuario eq '${correoSupervisor}'`,
            $format: "json",
          },
        }
      );

      const rows = res?.data?.d?.results || [];

      const sane = rows
        .map((r, idx) => {
          const lat = parseFloat(r?.Latitud);
          const lon = parseFloat(r?.Longitud);
          const tsDate = sapDateToDate(r?.Timestamp);

          // En tu servicio de ejemplo:
          // Usuario = tecnico2@...
          // Orden = MX00...
          const correo = safeStr(r?.Correo || r?.Usuario || "");
          const nombre = safeStr(r?.Nombre || correo || "Técnico");

          // ✅ ORDEN ACTIVA (lo que ya viene)
          const orden = safeStr(r?.Orden || "");

          // ✅ “Equipo” (si en el futuro lo agregas al servicio)
          const equipo = safeStr(r?.Equipo || r?.Equipment || "");

          return {
            usuario_id: safeStr(r?.Id || `${correo}-${idx}`),
            nombre,
            correo,
            latitud: lat,
            longitud: lon,
            timestamp: tsDate,
            timestampRaw: r?.Timestamp,
            orden,
            equipo,
          };
        })
        .filter((t) => Number.isFinite(t.latitud) && Number.isFinite(t.longitud));

      setTecnicos(sane);
      setLastUpdated(new Date());
    } catch (error) {
      setTecnicos([]);
      setErrorMsg("No se pudo cargar la geolocalización. Intenta de nuevo.");
      console.log("Error al cargar ubicaciones:", error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUbicaciones();
    const interval = setInterval(cargarUbicaciones, 30000);
    return () => clearInterval(interval);
  }, [correoSupervisor]);

  // Ajusta el mapa a todos los técnicos
  useEffect(() => {
    if (mapRef.current && tecnicos.length > 0) {
      const coords = tecnicos.map((t) => ({
        latitude: t.latitud,
        longitude: t.longitud,
      }));

      requestAnimationFrame(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: {
            top: 90,
            right: 50,
            bottom: sheetExpanded ? 240 : 145,
            left: 50,
          },
          animated: true,
        });
      });
    }
  }, [tecnicos, sheetExpanded]);

  const tecnicosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return tecnicos;
    return tecnicos.filter((t) => {
      const nom = (t.nombre || "").toLowerCase();
      const cor = (t.correo || "").toLowerCase();
      const ord = (t.orden || "").toLowerCase();
      const eq = (t.equipo || "").toLowerCase();
      return nom.includes(q) || cor.includes(q) || ord.includes(q) || eq.includes(q);
    });
  }, [tecnicos, busqueda]);

  const enfocarTecnico = (tecnico) => {
    if (!tecnico || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: tecnico.latitud,
        longitude: tecnico.longitud,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      800
    );
  };

  const initialRegion =
    tecnicos.length > 0
      ? {
          latitude: tecnicos[0].latitud,
          longitude: tecnicos[0].longitud,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }
      : DEFAULT_REGION_MX;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Monitoreo en tiempo real" />

      {/* MAPA */}
      <View style={{ flex: 1, position: "relative" }}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          loadingEnabled
          mapPadding={{
            top: 90,
            right: 10,
            bottom: sheetExpanded ? 240 : 145,
            left: 10,
          }}
        >
          {tecnicos.map((t) => {
            // ✅ título y descripción incluyendo ORDEN / EQUIPO
            const ordenTxt = t.orden ? `Orden: ${t.orden}` : "Sin orden activa";
            const equipoTxt = t.equipo ? `Equipo: ${t.equipo}` : null;

            const descParts = [
              t.correo || "",
              ordenTxt,
              equipoTxt,
              t.timestamp ? `Último: ${formatTs(t.timestamp)}` : null,
            ].filter(Boolean);

            return (
              <Marker
                key={t.usuario_id}
                coordinate={{ latitude: t.latitud, longitude: t.longitud }}
                title={t.nombre}
                description={descParts.join("\n")}
                pinColor={SAP_RED}
              >
                {/* ✅ Callout bonito (opcional pero se ve mejor que el description default) */}
                <Callout tooltip>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle} numberOfLines={1}>
                      {t.nombre}
                    </Text>
                    {!!t.correo && (
                      <Text style={styles.calloutSub} numberOfLines={1}>
                        {t.correo}
                      </Text>
                    )}

                    <View style={styles.calloutRow}>
                      <Ionicons name="document-text-outline" size={14} color={SAP_BLUE} />
                      <Text style={styles.calloutText} numberOfLines={1}>
                        {t.orden ? `Orden: ${t.orden}` : "Sin orden activa"}
                      </Text>
                    </View>

                    {!!t.equipo && (
                      <View style={styles.calloutRow}>
                        <Ionicons name="cog-outline" size={14} color={SAP_BLUE} />
                        <Text style={styles.calloutText} numberOfLines={1}>
                          Equipo: {t.equipo}
                        </Text>
                      </View>
                    )}

                    <View style={styles.calloutRow}>
                      <Ionicons name="time-outline" size={14} color="#6F7380" />
                      <Text style={[styles.calloutText, { color: "#6F7380" }]} numberOfLines={1}>
                        {t.timestamp ? `Último: ${formatTs(t.timestamp)}` : "Último: —"}
                      </Text>
                    </View>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>

        {/* BARRA SUPERIOR */}
        <View style={styles.topPanel}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#8390A6" />
            <TextInput
              placeholder="Buscar técnico / correo / orden / equipo…"
              placeholderTextColor="#98A4B6"
              value={busqueda}
              onChangeText={setBusqueda}
              style={styles.searchInput}
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => setBusqueda("")} style={styles.clearBtn}>
                <Ionicons name="close-outline" size={16} color="#8390A6" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.infoPill}>
            <View style={styles.statusDot} />
            <Text style={styles.infoText}>{tecnicos.length} en línea</Text>
          </View>

          <TouchableOpacity
            onPress={cargarUbicaciones}
            disabled={loading}
            style={[styles.refreshBtn, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="refresh" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Pill: última actualización */}
        <View style={styles.statusPill}>
          <Ionicons name="time-outline" size={13} color="#6F7380" />
          <Text style={styles.statusText}>
            {loading
              ? "Actualizando…"
              : lastUpdated
              ? `Actualizado: ${lastUpdated.toLocaleTimeString()}`
              : "Sin actualización"}
          </Text>
        </View>
      </View>

      {/* BOTTOM SHEET */}
      <View style={[styles.sheet, sheetExpanded ? styles.sheetExpanded : styles.sheetCollapsed]}>
        <TouchableOpacity
          style={styles.sheetHandle}
          activeOpacity={0.8}
          onPress={() => setSheetExpanded((v) => !v)}
        >
          <View style={styles.handleBar} />
          <Ionicons
            name={sheetExpanded ? "chevron-down" : "chevron-up"}
            size={18}
            color="#8A8FA6"
          />
        </TouchableOpacity>

        {!!errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

        {tecnicos.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No se encontraron ubicaciones</Text>
            <Text style={styles.emptySub}>Puedes reintentar la carga.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={cargarUbicaciones} disabled={loading}>
              <Text style={styles.retryText}>{loading ? "Cargando…" : "Reintentar"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={tecnicosFiltrados}
            keyExtractor={(item) => item.usuario_id}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => enfocarTecnico(item)}
                style={styles.resultItem}
                activeOpacity={0.7}
              >
                <View style={styles.avatar}>
                  <Ionicons name="person-outline" size={18} color={SAP_BLUE} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.nombre}
                  </Text>

                  {!!item.correo && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.correo}
                    </Text>
                  )}

                  {/* ✅ ORDEN / EQUIPO visible en la lista */}
                  <Text style={styles.subOrder} numberOfLines={1}>
                    {item.orden ? `Equipo: ${item.orden}` : "Equipo: No hay equipo para mostrar"}
                    {item.equipo ? `  ·  Equipo: ${item.equipo}` : ""}
                  </Text>

                  {item.timestamp ? (
                    <Text style={styles.sub2} numberOfLines={1}>
                      Último: {formatTs(item.timestamp)}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.coordBox}>
                  <Text style={styles.coords}>
                    {item.latitud.toFixed(4)}, {item.longitud.toFixed(4)}
                  </Text>
                  <Ionicons name="locate-outline" size={16} color={SAP_BLUE} />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyFilter}>No hay coincidencias con “{busqueda}”.</Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: "100%" },

  topPanel: {
    position: "absolute",
    top: 12,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E4F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: { flex: 1, marginLeft: 5, color: "#2F3349", fontSize: 13, paddingVertical: 0 },
  clearBtn: { width: 24, height: 24, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#E5E9F5",
    gap: 5,
  },
  statusDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#4CAF50" },
  infoText: { fontSize: 12, color: "#43516A", fontWeight: "500" },
  refreshBtn: { backgroundColor: SAP_BLUE, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },

  statusPill: {
    position: "absolute",
    top: 60,
    right: 10,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#E9ECF3",
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  statusText: { color: "#2F3349", fontSize: 11.5 },

  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: "#E1E4F0",
  },
  sheetCollapsed: { height: 145 },
  sheetExpanded: { height: 240 },

  sheetHandle: { alignItems: "center", paddingTop: 8, paddingBottom: 6 },
  handleBar: { width: 32, height: 3, backgroundColor: "#D5D8E6", borderRadius: 999, marginBottom: 4 },

  resultItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  separator: { height: 1, backgroundColor: "#EEF1F5" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EAF2FB",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 14.5, fontWeight: "700", color: "#2F3349" },
  sub: { color: "#687187", marginTop: 2, fontSize: 11.5 },

  // ✅ NUEVO: orden/equipo en lista
  subOrder: { color: "#445063", marginTop: 3, fontSize: 11.5, fontWeight: "700" },

  sub2: { color: "#8B95A7", marginTop: 2, fontSize: 11 },
  coordBox: { alignItems: "flex-end", gap: 3 },
  coords: { color: "#4B5563", fontSize: 11 },

  emptyBox: {
    borderWidth: 1,
    borderColor: "#FCE0E0",
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginHorizontal: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  emptyTitle: { fontWeight: "700", color: "#7a0000", marginBottom: 4 },
  emptySub: { color: "#7a0000", marginBottom: 10, textAlign: "center" },
  retryBtn: { backgroundColor: SAP_BLUE, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  retryText: { color: "#fff", fontWeight: "700" },
  emptyFilter: { textAlign: "center", color: "#666", paddingVertical: 10 },
  error: { color: "#a10000", marginBottom: 6, fontSize: 12, textAlign: "center" },

  // ✅ Callout (bonito)
  callout: {
    width: 240,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E6EAF4",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  calloutTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  calloutSub: { fontSize: 11.5, color: "#667085", marginTop: 2 },
  calloutRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  calloutText: { fontSize: 12, color: "#1F2937", flex: 1 },
});