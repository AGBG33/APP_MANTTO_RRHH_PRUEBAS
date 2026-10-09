// app/supervisor/averia/[averiaid]/detalles.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  FlatList,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";

import {
  loadAveriaDetailCache,
  saveAveriaDetailCache,
  loadCatalogCache,
  saveCatalogCache,
} from "../../../../src/offline/averiasCache";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
  chipBg: "#EAF3FF",
  danger: "#E74C3C",
};

const parseSapDate = (value) => {
  if (!value) return null;
  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = parseInt(value.replace("/Date(", "").replace(")/", ""), 10);
    if (!Number.isNaN(ms)) return new Date(ms);
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = parseSapDate(value);
  if (!d) return "—";
  return d.toLocaleDateString();
};

export default function DetallesAveriaSupervisor() {
  const { averiaid } = useLocalSearchParams();

  const [header, setHeader] = useState(null);
  const [codigos, setCodigos] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cacheInfo, setCacheInfo] = useState(null); // {savedAt}

  // ======= Causa (P) =======
  const [modalCausa, setModalCausa] = useState(false);
  const [loadingCausas, setLoadingCausas] = useState(false);
  const [savingCausa, setSavingCausa] = useState(false);
  const [causas, setCausas] = useState([]);
  const [searchCausa, setSearchCausa] = useState("");
  const [selectedCausa, setSelectedCausa] = useState(null);

  const fetchDetalleOnline = async () => {
    // Header
    const resHdr = await api.get(
      `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet('${encodeURIComponent(averiaid)}')`,
      { params: { $format: "json" } },
    );
    const hdr = resHdr?.data?.d ?? resHdr?.data ?? null;

    // Items
    const resItems = await api.get(
      `/api/odata/ZCS_GET_NOTIFICATION_SRV/NotificationHeaderSet('${encodeURIComponent(averiaid)}')/NotificationItemsSet`,
      { params: { $format: "json" } },
    );

    const itemsRaw = resItems?.data;
    const items = itemsRaw?.d?.results ?? itemsRaw?.value ?? [];
    const it = items[0] || {};

    const codes = {
      Descript: it.Descript || "",
      DCatTyp: it.DCatTyp || "",
      DCodegrp: it.DCodegrp || "",
      DCode: it.DCode || "",
      DlCatTyp: it.DlCatTyp || "",
      DlCodegrp: it.DlCodegrp || "",
      DlCode: it.DlCode || "",
    };

    // normaliza
    const codeGroup =
      hdr?.CodeGroup ??
      hdr?.Codegroup ??
      hdr?.CODEGROUP ??
      hdr?.codeGroup ??
      null;
    const coding = hdr?.Coding ?? hdr?.CODING ?? hdr?.coding ?? null;

    const hdrFixed = { ...(hdr || {}), CodeGroup: codeGroup, Coding: coding };

    return { hdrFixed, codes };
  };

  const fetchDetalle = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      // ✅ intenta online
      const { hdrFixed, codes } = await fetchDetalleOnline();

      setHeader(hdrFixed);
      setCodigos(codes);
      setCacheInfo(null);

      if (codeGroupAndCoding(hdrFixed)) {
        setSelectedCausa({
          GrupoCodigo: hdrFixed.CodeGroup,
          Codigo: hdrFixed.Coding,
          Descripcion: "",
        });
      }

      // ✅ guarda cache
      await saveAveriaDetailCache({
        averiaid,
        header: hdrFixed,
        codigos: codes,
      });
    } catch (err) {
      console.error(
        "Error al cargar detalle de avería:",
        err?.response?.data || err,
      );

      // ✅ fallback cache
      const cached = await loadAveriaDetailCache({ averiaid });
      if (cached?.header) {
        setHeader(cached.header);
        setCodigos(cached.codigos || null);
        setCacheInfo({ savedAt: cached.savedAt });

        if (codeGroupAndCoding(cached.header)) {
          setSelectedCausa({
            GrupoCodigo: cached.header.CodeGroup,
            Codigo: cached.header.Coding,
            Descripcion: "",
          });
        }

        if (!silent)
          Alert.alert("Sin conexión", "Mostrando detalle guardado (offline).");
      } else {
        Alert.alert(
          "Error",
          "No se pudo cargar el detalle del aviso y no hay cache guardado.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  function codeGroupAndCoding(h) {
    return !!(h?.CodeGroup && h?.Coding);
  }

  // ======= Catálogo causas ======= //pro-01 //qas-01
  const CATALOGOS_P_URL =
    "https://qas-mitsu-ti2dye4u.launchpad.cfapps.us10.hana.ondemand.com/94971020-c396-427a-97c1-57aa50753fd3.comtelluscustomerservice.comtelluscustomerservice/sap/opu/odata/sap/ZSD_CATALOGOS_SRV/CircunstanciaSet?$filter=Catalogo%20eq%20%27P%27";

  const fetchCatalogoCausas = async () => {
    try {
      setLoadingCausas(true);
      setSearchCausa("");

      // ✅ 0) primero cache
      const cached = await loadCatalogCache({ catalogo: "P" });
      if (cached?.items?.length) setCausas(cached.items);

      // ✅ 1) intenta por tu API (mejor)
      try {
        const { data } = await api.get(
          "/api/aviso-averia/catalogos/circunstancia",
          {
            params: { catalogo: "P" },
          },
        );

        if (Array.isArray(data) && data.length) {
          setCausas(data);
          await saveCatalogCache({ catalogo: "P", items: data });
          return;
        }
      } catch (e1) {
        console.log("[CATALOGO] No disponible en API, fallback a Launchpad");
      }

      // ✅ 2) fallback launchpad (puede fallar sin SSO)
      const resp = await fetch(CATALOGOS_P_URL, {
        headers: { Accept: "application/json" },
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt?.slice(0, 200));
      }

      const json = await resp.json();
      const results = json?.d?.results ?? json?.value ?? [];

      const mapped = results.map((r) => ({
        Catalogo: r.Catalogo,
        GrupoCodigo: r.GrupoCodigo,
        Codigo: r.Codigo,
        Descripcion: r.Descripcion,
      }));

      setCausas(mapped);
      await saveCatalogCache({ catalogo: "P", items: mapped });
    } catch (e) {
      console.error("Error catálogo causas:", e?.message || e);

      const cached = await loadCatalogCache({ catalogo: "P" });
      if (cached?.items?.length) {
        setCausas(cached.items);
        Alert.alert("Sin conexión", "Mostrando catálogo guardado (offline).");
      } else {
        Alert.alert("Error", "No se pudo cargar el catálogo de causas.");
      }
    } finally {
      setLoadingCausas(false);
    }
  };

  const openModalCausa = async () => {
    setModalCausa(true);
    await fetchCatalogoCausas();
  };

  // ✅ asignar causa: SOLO online (si falla, no lo encolamos aquí)
  const asignarCausa = async () => {
    if (!selectedCausa?.GrupoCodigo || !selectedCausa?.Codigo) {
      Alert.alert("Falta selección", "Selecciona una causa para asignarla.");
      return;
    }

    const notifNoToUse = String(header?.NotifNo || averiaid || "").trim();
    if (!notifNoToUse) {
      Alert.alert(
        "Error",
        "No se pudo determinar el número de aviso (NotifNo).",
      );
      return;
    }

    try {
      setSavingCausa(true);

      const payload = {
        Orderid: notifNoToUse,
        NotifHeader: {
          Refobjecttype: notifNoToUse,
          CodeGroup: selectedCausa.GrupoCodigo,
          Coding: selectedCausa.Codigo,
        },
        Return: [],
      };

      const { data } = await api.post(
        "/api/odata/ZCS_CHANGE_AVISO_SRV/NotificationHeaderSet",
        payload,
        { params: { "sap-client": "400", "sap-language": "ES" } },
      );

      if (!data) throw new Error("Respuesta vacía de SAP");

      // ✅ refleja y guarda cache actualizado
      const nextHeader = {
        ...(header || {}),
        CodeGroup: selectedCausa.GrupoCodigo,
        Coding: selectedCausa.Codigo,
      };
      setHeader(nextHeader);

      await saveAveriaDetailCache({ averiaid, header: nextHeader, codigos });

      setModalCausa(false);
      Alert.alert(
        "Listo",
        `Causa asignada: ${selectedCausa.Descripcion || selectedCausa.Codigo}`,
      );
    } catch (e) {
      console.error(
        "Error asignar causa:",
        e?.response?.data || e.message || e,
      );
      Alert.alert(
        "Error",
        "No se pudo asignar la causa. (Si estás offline, necesitas conexión para guardar en SAP).",
      );
    } finally {
      setSavingCausa(false);
    }
  };

  useEffect(() => {
    if (averiaid) {
      (async () => {
        // ✅ primero cache, luego intenta actualizar
        const cached = await loadAveriaDetailCache({ averiaid });
        if (cached?.header) {
          setHeader(cached.header);
          setCodigos(cached.codigos || null);
          setCacheInfo({ savedAt: cached.savedAt });
          setLoading(false);
        }
        await fetchDetalle({ silent: true });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [averiaid]);

  const goBack = () => router.back();

  const causasFiltradas = useMemo(() => {
    const q = searchCausa.trim().toLowerCase();
    if (!q) return causas;
    return causas.filter((c) => {
      const t =
        `${c?.Descripcion || ""} ${c?.GrupoCodigo || ""} ${c?.Codigo || ""}`.toLowerCase();
      return t.includes(q);
    });
  }, [causas, searchCausa]);

  const causaAsignada = !!(header?.CodeGroup && header?.Coding);

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
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: COLORS.text }}>
            No se encontró información para el aviso #{averiaid}
          </Text>
        </View>
      </View>
    );
  }

  const notifNo = header.NotifNo;
  const notifType = header.NotifType;
  const shortText = header.ShortText;
  const reportedBy = header.Reportedby;
  const codeGroup = header.CodeGroup;
  const coding = header.Coding;
  const equipment = header.Equipment;
  const MaterialLong = header.MaterialLong;
  const notifDate = header.NotifDate;
  const desstDate = header.Desstdate;
  const createdOn = header.CreatedOn;

  return (
    <View style={styles.container}>
      <Header title={`Aviso ${notifNo || averiaid}`} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={goBack}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={styles.backText}>Volver a la lista</Text>
        </TouchableOpacity>

        {!!cacheInfo?.savedAt && (
          <View style={styles.offlineBadge}>
            <Ionicons
              name="cloud-offline-outline"
              size={14}
              color={COLORS.title}
            />
            <Text style={styles.offlineBadgeText}>
              Offline · Guardado: {new Date(cacheInfo.savedAt).toLocaleString()}
            </Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.refreshInline,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => fetchDetalle()}
        >
          <Ionicons name="refresh-outline" size={16} color={COLORS.accent} />
          <Text style={styles.refreshInlineText}>Actualizar detalle</Text>
        </Pressable>

        <View style={styles.cardHighlight}>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={COLORS.accent}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.chipText}>{notifType || "Sin tipo"}</Text>
            </View>

            {equipment ? (
              <View style={styles.chip}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={14}
                  color={COLORS.accent}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.chipText}>{equipment}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.mainTitle}>{shortText || "Sin descripción"}</Text>

          {reportedBy ? (
            <Text style={styles.subtitle}>
              Reportado por{" "}
              <Text style={{ fontWeight: "700", color: COLORS.title }}>
                {reportedBy}
              </Text>
            </Text>
          ) : null}

          <View style={{ marginTop: 10 }}>
            <Text style={styles.infoLabel}>Causa asignada</Text>
            <Text style={styles.infoValue}>
              {codeGroup && coding ? `${codeGroup} / ${coding}` : "No asignada"}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.btnSecondary,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            onPress={openModalCausa}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="list-outline"
                size={18}
                color={COLORS.accent}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.btnSecondaryText}>
                Asignar causa de la avería
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos generales</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Número de aviso</Text>
              <Text style={styles.infoValue}>{notifNo || "—"}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Tipo de aviso</Text>
              <Text style={styles.infoValue}>{notifType || "—"}</Text>
            </View>

            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Ubicación funcional</Text>
              <Text style={styles.infoValue}>{MaterialLong || "—"}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha de notificación</Text>
              <Text style={styles.infoValue}>{formatDate(notifDate)}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha deseada inicio</Text>
              <Text style={styles.infoValue}>{formatDate(desstDate)}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Creado el</Text>
              <Text style={styles.infoValue}>{formatDate(createdOn)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Códigos del aviso</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Grupo de código</Text>
              <Text style={styles.infoValue}>{codeGroup || "—"}</Text>
            </View>

            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Código</Text>
              <Text style={styles.infoValue}>{coding || "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Detalle de daño / parte / causa
          </Text>

          {codigos?.Descript ? (
            <View style={styles.block}>
              <Text style={styles.infoLabel}>Descripción del ítem</Text>
              <Text style={styles.infoValue}>{codigos.Descript}</Text>
            </View>
          ) : null}

          <View style={styles.chipBlock}>
            <Text style={styles.infoLabel}>Daño</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Tipo: {codigos?.DCatTyp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Grupo: {codigos?.DCodegrp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Código: {codigos?.DCode || "—"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.chipBlock}>
            <Text style={styles.infoLabel}>Parte dañada</Text>
            <View style={styles.chipRowWrap}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Tipo: {codigos?.DlCatTyp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Grupo: {codigos?.DlCodegrp || "—"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  Código: {codigos?.DlCode || "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 16 }} />

        <Pressable
          android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          style={({ pressed }) => [
            styles.btnPrimary,
            (!causaAsignada || savingCausa) && styles.btnDisabled,
            pressed &&
              causaAsignada &&
              !savingCausa &&
              styles.btnPrimaryPressed,
          ]}
          disabled={!causaAsignada || savingCausa}
          onPress={() =>
            router.push({
              pathname: "/supervisor/ordenes/crear/crearOrden",
              params: {
                averiaid,
                notifNo: String(notifNo || ""),
                equipment: String(equipment || ""),
                MaterialLong: String(MaterialLong || ""),
                shortText: String(shortText || ""),
              },
            })
          }
        >
          <View style={styles.btnPrimaryContent}>
            <Ionicons
              name="construct-outline"
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.btnPrimaryText}>
              {causaAsignada
                ? "Crear orden de mantenimiento"
                : "Asigna la causa para continuar"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </View>
        </Pressable>
      </ScrollView>

      {/* ================= MODAL CAUSA ================= */}
      <Modal
        visible={modalCausa}
        transparent
        animationType="fade"
        onRequestClose={() => setModalCausa(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Asignar causa (Catálogo P)</Text>
              <Pressable onPress={() => setModalCausa(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.title} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Ionicons
                name="search"
                size={18}
                color={COLORS.text}
                style={{ marginRight: 6 }}
              />
              <TextInput
                value={searchCausa}
                onChangeText={setSearchCausa}
                placeholder="Buscar por descripción…"
                placeholderTextColor="#8A96A3"
                style={styles.searchInput}
              />
            </View>

            {loadingCausas ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text
                  style={{ marginTop: 8, color: COLORS.text, fontSize: 12 }}
                >
                  Cargando catálogo…
                </Text>
              </View>
            ) : (
              <FlatList
                data={causasFiltradas}
                keyExtractor={(item, idx) =>
                  `${item?.GrupoCodigo || "X"}-${item?.Codigo || idx}`
                }
                style={{ maxHeight: 340 }}
                renderItem={({ item }) => {
                  const active =
                    selectedCausa?.Codigo === item?.Codigo &&
                    selectedCausa?.GrupoCodigo === item?.GrupoCodigo;

                  return (
                    <Pressable
                      onPress={() =>
                        setSelectedCausa({
                          GrupoCodigo: item.GrupoCodigo,
                          Codigo: item.Codigo,
                          Descripcion: item.Descripcion,
                        })
                      }
                      style={[
                        styles.optionRow,
                        active && styles.optionRowActive,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionText}>
                          {item?.Descripcion || "—"}
                        </Text>
                        <Text style={styles.optionSub}>
                          {item?.GrupoCodigo} / {item?.Codigo}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={COLORS.accent}
                        />
                      ) : (
                        <Ionicons
                          name="ellipse-outline"
                          size={18}
                          color="#9AA5B1"
                        />
                      )}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 12,
                      paddingVertical: 10,
                    }}
                  >
                    No hay resultados.
                  </Text>
                }
              />
            )}

            <View style={styles.modalFooter}>
              <Pressable
                style={({ pressed }) => [
                  styles.btnGhost,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setModalCausa(false)}
                disabled={savingCausa}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.btnSave,
                  (!selectedCausa || savingCausa) && styles.btnSaveDisabled,
                  pressed &&
                    selectedCausa &&
                    !savingCausa && {
                      opacity: 0.95,
                      transform: [{ scale: 0.99 }],
                    },
                ]}
                disabled={!selectedCausa || savingCausa}
                onPress={asignarCausa}
              >
                {savingCausa ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.btnSaveText}>Guardar causa</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },
  scrollContent: { padding: 16, paddingBottom: 90 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, color: COLORS.text, fontSize: 13 },
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

  offlineBadge: {
    marginBottom: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
  },
  offlineBadgeText: { fontSize: 12, fontWeight: "700", color: COLORS.title },

  refreshInline: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  refreshInlineText: { color: COLORS.title, fontWeight: "900", fontSize: 12 },

  cardHighlight: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
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
  mainTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 4,
  },
  subtitle: { fontSize: 13, color: COLORS.text },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8, gap: 6 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.chipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipText: { fontSize: 16, color: COLORS.title },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
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
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  infoItem: { width: "48%" },
  infoItemFull: { width: "100%" },
  infoLabel: {
    fontSize: 11,
    color: COLORS.text,
    opacity: 0.8,
    marginBottom: 2,
  },
  infoValue: { fontSize: 14, color: COLORS.title, fontWeight: "600" },
  block: { marginBottom: 10 },
  chipBlock: { marginTop: 6 },

  btnSecondary: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  btnSecondaryText: { color: COLORS.accent, fontWeight: "800", fontSize: 13 },

  btnPrimary: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  btnDisabled: { opacity: 0.55 },
  btnPrimaryPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.05,
    elevation: 1,
    opacity: 0.9,
  },
  btnPrimaryContent: { flexDirection: "row", alignItems: "center" },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
    marginHorizontal: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: "800", color: COLORS.title },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: COLORS.title, fontSize: 13 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  optionRowActive: { borderColor: COLORS.accent, backgroundColor: "#F2F8FF" },
  optionText: { color: COLORS.title, fontWeight: "800", fontSize: 13 },
  optionSub: { marginTop: 2, color: COLORS.text, fontSize: 11 },

  modalFooter: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFF",
  },
  btnGhostText: { color: COLORS.title, fontWeight: "800" },

  btnSave: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  btnSaveDisabled: { opacity: 0.6 },
  btnSaveText: { color: "#FFF", fontWeight: "900" },
});
