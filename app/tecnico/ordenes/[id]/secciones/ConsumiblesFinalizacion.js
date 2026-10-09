import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import api from "../../../../../src/services/api";
import {
  getConsumiblesByPair,
  mergeConsumiblesPair,
} from "../../../../../src/offline/consumiblesCatalogoCache";
import consumiblesFallback from "../../[id]/json.json";

/**
 * Cobertura -> pares (Agrupador1, Agrupador2)
 */
const COVERAGE_PAIRS = {
  BASICA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },
  ],
  MEDIA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },

    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "DESLIZADOR" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "PLAST_CABI" },
    { Agr1: "MEDIO", Agr2: "PLAST_CONT" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },
    { Agr1: "MEDIO", Agr2: "MICROSWICH" },
    { Agr1: "MEDIO", Agr2: "CABLE_ELEC" },
  ],
  SEMI: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },

    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "DESLIZADOR" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "PLAST_CABI" },
    { Agr1: "MEDIO", Agr2: "PLAST_CONT" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },
    { Agr1: "MEDIO", Agr2: "MICROSWICH" },
    { Agr1: "MEDIO", Agr2: "CABLE_ELEC" },

    { Agr1: "SEMIFULL", Agr2: "EXEN_COLGA" },
    { Agr1: "SEMIFULL", Agr2: "VENTI_CABIN" },
    { Agr1: "SEMIFULL", Agr2: "ACEITERAS" },
    { Agr1: "SEMIFULL", Agr2: "BALASTRAS" },
    { Agr1: "SEMIFULL", Agr2: "MICRO_SEGU" },
    { Agr1: "SEMIFULL", Agr2: "INTERLOCK" },
    { Agr1: "SEMIFULL", Agr2: "BAND_MOTOR" },
    { Agr1: "SEMIFULL", Agr2: "GOMA_CABI" },
    { Agr1: "SEMIFULL", Agr2: "GOMA_TOPE" },
    { Agr1: "SEMIFULL", Agr2: "CABLE_ACER" },
    { Agr1: "SEMIFULL", Agr2: "RETEN_ACEI" },
    { Agr1: "SEMIFULL", Agr2: "TRANF_ENER" },
  ],
};

const uniqBy = (arr, keyFn) => {
  const map = new Map();

  for (const x of arr || []) {
    const k = keyFn(x);
    if (!map.has(k)) map.set(k, x);
  }

  return Array.from(map.values());
};

const safeUpper = (v) =>
  String(v || "")
    .trim()
    .toUpperCase();

const pairId = (p) => `${safeUpper(p?.Agr1)}__${safeUpper(p?.Agr2)}`;

const pairLabel = (p) => `${safeUpper(p?.Agr1)} · ${safeUpper(p?.Agr2)}`;

function stableRowsString(rows) {
  try {
    return JSON.stringify(
      (Array.isArray(rows) ? rows : []).map((r) => ({
        Material: String(r?.Material || "").trim(),
        Descripcion: String(r?.Descripcion || "").trim(),
        Agrupador1: safeUpper(r?.Agrupador1),
        Agrupador2: safeUpper(r?.Agrupador2),
        Cantidad: String(r?.Cantidad || "").trim(),
        Unidad: safeUpper(r?.Unidad),
        Centro: String(r?.Centro || "").trim(),
      })),
    );
  } catch {
    return "[]";
  }
}

function normalizeMaterialRows(rows = [], a1, a2) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      Id: String(r?.Id || "").trim(),
      Material: String(r?.Material || "").trim(),
      Agrupador1: safeUpper(r?.Agrupador1 || a1),
      Agrupador2: safeUpper(r?.Agrupador2 || a2),
      Descripcion: String(r?.Descripcion || r?.Description || "").trim(),
      Unidad: safeUpper(r?.Unidad) || "PZA",
    }))
    .filter((x) => !!x.Material);

  return uniqBy(
    normalized,
    (x) =>
      `${x.Material}__${x.Descripcion}__${x.Agrupador1}__${x.Agrupador2}__${x.Unidad}`,
  );
}
function getFallbackConsumiblesByPair(a1, a2) {
  const rows =
    consumiblesFallback?.d?.results ||
    consumiblesFallback?.results ||
    consumiblesFallback ||
    [];

  return normalizeMaterialRows(
    rows.filter(
      (x) =>
        safeUpper(x?.Agrupador1) === safeUpper(a1) &&
        safeUpper(x?.Agrupador2) === safeUpper(a2),
    ),
    a1,
    a2,
  );
}

export default function ConsumiblesFinalizacion({
  plant,
  coberturaTipo,
  stylesGlobal,
  FIORI,
  initialRows = [],
  onChange,
}) {
  const s = stylesGlobal || localStyles;
  const P = FIORI || {};

  /**
   * CLAVE:
   * Si coberturaTipo viene vacío, de todos modos usamos BASICA.
   * Antes se mostraban categorías BASICA, pero el cache se buscaba con coverageKey="".
   */
  const coverageKey = safeUpper(coberturaTipo);
const effectiveCoverageKey = ["BASICA", "MEDIA", "SEMI"].includes(coverageKey)
  ? coverageKey
  : "Sin cobertura";

  const pairsForCoverage = useMemo(() => {
    if (effectiveCoverageKey === "MEDIA") return COVERAGE_PAIRS.MEDIA;
    if (effectiveCoverageKey === "SEMI") return COVERAGE_PAIRS.SEMI;
    return COVERAGE_PAIRS.BASICA;
  }, [effectiveCoverageKey]);

  const [selected, setSelected] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedPairId, setSelectedPairId] = useState("");
  const [pairPickerOpen, setPairPickerOpen] = useState(false);

  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState(null);

  const [qtyDraft, setQtyDraft] = useState("1");
  const [unitDraft, setUnitDraft] = useState("PZA");

  const [editingKey, setEditingKey] = useState(null);

  const loadIdRef = useRef(0);

  // banderas para evitar ciclo infinito padre <-> hijo
  const skipNextOnChangeRef = useRef(false);
  const lastHydratedRef = useRef("");
  const lastEmittedRef = useRef("");

  // hidrata SOLO cuando initialRows cambió de verdad
  useEffect(() => {
    const incomingKey = stableRowsString(initialRows);

    if (incomingKey !== lastHydratedRef.current) {
      lastHydratedRef.current = incomingKey;
      skipNextOnChangeRef.current = true;
      setSelected(Array.isArray(initialRows) ? initialRows : []);
    }
  }, [initialRows]);

  // emite al padre solo cuando el cambio fue del usuario
  useEffect(() => {
    const selectedKey = stableRowsString(selected);

    if (skipNextOnChangeRef.current) {
      skipNextOnChangeRef.current = false;
      lastEmittedRef.current = selectedKey;
      return;
    }

    if (selectedKey === lastEmittedRef.current) return;

    lastEmittedRef.current = selectedKey;
    onChange?.(selected);
  }, [selected, onChange]);

  useEffect(() => {
    setSelectedPairId("");
    setMaterials([]);
    setSelectedMaterial(null);
    setMaterialSearch("");
    setQtyDraft("1");
    setUnitDraft("PZA");
    setPairPickerOpen(false);
    setMaterialPickerOpen(false);
  }, [effectiveCoverageKey]);

  const selectedPair = useMemo(() => {
    return pairsForCoverage.find((p) => pairId(p) === selectedPairId) || null;
  }, [pairsForCoverage, selectedPairId]);

  useEffect(() => {
    let mounted = true;
    const myLoadId = ++loadIdRef.current;

    async function loadMaterialsForPair() {
      setMaterials([]);
      setSelectedMaterial(null);

      if (!selectedPair) return;

      setLoadingMaterials(true);

      const a1 = safeUpper(selectedPair.Agr1);
      const a2 = safeUpper(selectedPair.Agr2);
      const cov = effectiveCoverageKey;

      try {
        /**
         * 1) Primero intenta leer del cache offline.
         */
        const offlineRows = await getConsumiblesByPair({
          coverageKey: cov,
          agr1: a1,
          agr2: a2,
        });

        if (mounted && myLoadId === loadIdRef.current) {
          if (Array.isArray(offlineRows) && offlineRows.length > 0) {
            console.log("[CONSUMIBLES][CACHE HIT]", {
              coverageKey: cov,
              Agr1: a1,
              Agr2: a2,
              count: offlineRows.length,
            });

            setMaterials(normalizeMaterialRows(offlineRows, a1, a2));
          } else {
            console.log("[CONSUMIBLES][CACHE EMPTY]", {
              coverageKey: cov,
              Agr1: a1,
              Agr2: a2,
            });
          }
        }

        /**
         * 2) Revisa red.
         */
        const net = await NetInfo.fetch();
        const isOnline = !!(
          net?.isConnected && net?.isInternetReachable !== false
        );

        /**
         * Si no hay red, se queda con lo que encontró en cache.
         */
        /**
         * cambios miguel se modifico if (!isOnline) {}
         */
        /*
        if (!isOnline) {
          console.log("[CONSUMIBLES][OFFLINE]", {
            coverageKey: cov,
            Agr1: a1,
            Agr2: a2,
            offlineCount: Array.isArray(offlineRows) ? offlineRows.length : 0,
          });

          if (
            mounted &&
            myLoadId === loadIdRef.current &&
            (!Array.isArray(offlineRows) || offlineRows.length === 0)
          ) {
            setMaterials([]);
          }

          return;
        }
*/
        /*nuevo codigo  Miguel Angel 19/05/2026*/
        if (!isOnline) {
          const hasOfflineCache =
            Array.isArray(offlineRows) && offlineRows.length > 0;

          const fallbackRows = hasOfflineCache
            ? normalizeMaterialRows(offlineRows, a1, a2)
            : getFallbackConsumiblesByPair(a1, a2);

          if (!hasOfflineCache) {
            console.log("[CONSUMIBLES][JSON FALLBACK OFFLINE ACTIVADO]", {
              motivo: "Sin cache offline disponible",
              coverageKey: cov,
              Agr1: a1,
              Agr2: a2,
              jsonCount: fallbackRows.length,
              archivo: "json.json",
            });
          } else {
            console.log("[CONSUMIBLES][CACHE OFFLINE UTILIZADO]", {
              coverageKey: cov,
              Agr1: a1,
              Agr2: a2,
              cacheCount: fallbackRows.length,
            });
          }

          if (mounted && myLoadId === loadIdRef.current) {
            setMaterials(fallbackRows);
          }

          return;
        }

        /**
         * 3) Si hay red, refresca desde SAP/backend y guarda offline.
         */
        const url =
          `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet` +
          `?$filter=Agrupador1 eq '${a1}' and Agrupador2 eq '${a2}'`;

        const res = await api.get(url);

        if (!mounted || myLoadId !== loadIdRef.current) return;

        const rows = res?.data?.d?.results || res?.data?.results || [];
        const deduped = normalizeMaterialRows(rows, a1, a2);

        await mergeConsumiblesPair({
          coverageKey: cov,
          agr1: a1,
          agr2: a2,
          materials: deduped,
        });

        console.log("[CONSUMIBLES][SAP SAVED CACHE]", {
          coverageKey: cov,
          Agr1: a1,
          Agr2: a2,
          count: deduped.length,
        });

        if (mounted && myLoadId === loadIdRef.current) {
          setMaterials(deduped);
        }
        /* cambios en la parte del catch Miguel Angel 19/05/2026
      } catch (e) {
        console.log(
          "[CONSUMIBLES][ERROR] Falló SAP, usando cache:",
          e?.response?.data || e?.message || e,
        );

        try {
          const fallbackRows = await getConsumiblesByPair({
            coverageKey: cov,
            agr1: a1,
            agr2: a2,
          });

          const normalizedFallback = normalizeMaterialRows(
            fallbackRows,
            a1,
            a2,
          );

          if (mounted && myLoadId === loadIdRef.current) {
            setMaterials(normalizedFallback);
          }
        } catch {
          if (mounted && myLoadId === loadIdRef.current) {
            setMaterials([]);
          }
        }
      }
      */
      } catch (e) {
        const fallbackRows = getFallbackConsumiblesByPair(a1, a2);

        console.log("[CONSUMIBLES][JSON FALLBACK ERROR ACTIVADO]", {
          motivo: "Falló SAP o lectura de cache",
          coverageKey: cov,
          Agr1: a1,
          Agr2: a2,
          jsonCount: fallbackRows.length,
          error: e?.response?.data || e?.message || String(e),
          archivo: "json.json",
        });

        if (mounted && myLoadId === loadIdRef.current) {
          setMaterials(fallbackRows);
        }
      } finally {
        if (mounted && myLoadId === loadIdRef.current) {
          setLoadingMaterials(false);
        }
      }
    }

    loadMaterialsForPair();

    return () => {
      mounted = false;
    };
  }, [selectedPair, effectiveCoverageKey]);

  const filteredMaterials = useMemo(() => {
    const qq = String(materialSearch || "")
      .toUpperCase()
      .trim();
    if (!qq) return materials;

    return materials.filter((m) => {
      const hay =
        `${m.Material} ${m.Descripcion} ${m.Agrupador1} ${m.Agrupador2}`.toUpperCase();
      return hay.includes(qq);
    });
  }, [materials, materialSearch]);

  const resetForm = () => {
    setSelectedPairId("");
    setMaterials([]);
    setSelectedMaterial(null);
    setMaterialSearch("");
    setQtyDraft("1");
    setUnitDraft("PZA");
    setEditingKey(null);
    setPairPickerOpen(false);
    setMaterialPickerOpen(false);
  };

  const openAddModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeAddModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const buildSelectedKey = (item) =>
    `${String(item?.Material || "").trim()}__${safeUpper(
      item?.Agrupador1,
    )}__${safeUpper(item?.Agrupador2)}`;

  const handleEditItem = (item) => {
    setEditingKey(buildSelectedKey(item));

    setSelectedPairId(
      pairId({
        Agr1: item?.Agrupador1,
        Agr2: item?.Agrupador2,
      }),
    );

    setSelectedMaterial({
      Material: String(item?.Material || "").trim(),
      Descripcion: String(item?.Descripcion || "").trim(),
      Agrupador1: safeUpper(item?.Agrupador1),
      Agrupador2: safeUpper(item?.Agrupador2),
      Unidad: safeUpper(item?.Unidad) || "PZA",
    });

    setQtyDraft(String(item?.Cantidad || "1"));
    setUnitDraft(safeUpper(item?.Unidad) || "PZA");
    setModalOpen(true);
  };

  const handleDeleteItem = (item) => {
    const key = buildSelectedKey(item);
    setSelected((prev) => prev.filter((x) => buildSelectedKey(x) !== key));
  };

  const handleSaveItem = () => {
    if (!selectedPair) return;
    if (!selectedMaterial?.Material) return;

    const qClean = String(qtyDraft || "")
      .replace(",", ".")
      .replace(/[^0-9.]/g, "")
      .trim();

    const uClean = safeUpper(unitDraft || selectedMaterial?.Unidad) || "PZA";

    const row = {
      Material: String(selectedMaterial.Material || "").trim(),
      Descripcion: String(selectedMaterial.Descripcion || "").trim(),
      Agrupador1: safeUpper(selectedMaterial.Agrupador1),
      Agrupador2: safeUpper(selectedMaterial.Agrupador2),
      Cantidad: qClean || "1",
      Unidad: uClean,
      Centro: plant || "",
      Almacen: "BSAT",
    };

    const rowKey = buildSelectedKey(row);

    setSelected((prev) => {
      const exists = prev.some((x) => buildSelectedKey(x) === rowKey);

      if (editingKey) {
        return prev.map((x) => (buildSelectedKey(x) === editingKey ? row : x));
      }

      if (exists) {
        return prev.map((x) => (buildSelectedKey(x) === rowKey ? row : x));
      }

      return [...prev, row];
    });

    closeAddModal();
  };

  return (
    <View style={[s.card, { borderColor: P.border || "#DDE6F2" }]}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: P.text || "#0B1F3B" }]}>
            Consumibles (obligatorios)
          </Text>
          <Text style={s.helperText}>Selecciónalos uno por uno.</Text>
        </View>

        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: P.brand || "#0A6ED1" }]}
          onPress={openAddModal}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Agregar</Text>
        </TouchableOpacity>
      </View>

      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Cobertura:</Text>
        <Text style={s.metaValue}>{effectiveCoverageKey || "—"}</Text>
      </View>

      {!selected.length ? (
        <View style={s.emptyBox}>
          <Ionicons name="cube-outline" size={22} color="#63718B" />
          <Text style={s.emptyText}>No has agregado consumibles todavía.</Text>
        </View>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {selected.map((item, idx) => (
            <View
              key={`${buildSelectedKey(item)}-${idx}`}
              style={s.selectedCard}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.selectedCode}>{item.Material}</Text>
                <Text style={s.selectedDesc}>
                  {item.Descripcion || "Sin descripción"}
                </Text>
                <Text style={s.selectedMeta}>
                  Categoría: {item.Agrupador1} · {item.Agrupador2}
                </Text>
                <Text style={s.selectedMeta}>
                  Cantidad: {item.Cantidad} {item.Unidad}
                </Text>
              </View>

              <View style={s.actionsCol}>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => handleEditItem(item)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="create-outline" size={18} color="#0A6ED1" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => handleDeleteItem(item)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddModal}
      >
        <Pressable style={s.modalBackdrop} onPress={closeAddModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={s.modalCenter}
          >
            <Pressable
              style={[s.modalCard, { borderColor: P.border || "#DDE6F2" }]}
              onPress={() => {}}
            >
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: P.text || "#0B1F3B" }]}>
                  {editingKey ? "Editar consumible" : "Agregar consumible"}
                </Text>

                <TouchableOpacity
                  onPress={closeAddModal}
                  style={s.modalCloseBtn}
                >
                  <Ionicons name="close" size={18} color="#0B1F3B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={s.fieldLabel}>Categoría</Text>

                <TouchableOpacity
                  style={s.selector}
                  onPress={() => setPairPickerOpen((v) => !v)}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      s.selectorText,
                      !selectedPair ? s.placeholderText : null,
                    ]}
                  >
                    {selectedPair
                      ? pairLabel(selectedPair)
                      : "Selecciona una categoría"}
                  </Text>
                  <Ionicons
                    name={
                      pairPickerOpen
                        ? "chevron-up-outline"
                        : "chevron-down-outline"
                    }
                    size={18}
                    color="#63718B"
                  />
                </TouchableOpacity>

                {pairPickerOpen ? (
                  <View style={s.dropdownBox}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                      {pairsForCoverage.map((p) => {
                        const id = pairId(p);
                        const active = id === selectedPairId;

                        return (
                          <TouchableOpacity
                            key={id}
                            style={[
                              s.dropdownItem,
                              active && s.dropdownItemActive,
                            ]}
                            onPress={() => {
                              setSelectedPairId(id);
                              setPairPickerOpen(false);
                              setSelectedMaterial(null);
                              setMaterialSearch("");
                            }}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                s.dropdownItemText,
                                active && s.dropdownItemTextActive,
                              ]}
                            >
                              {pairLabel(p)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                <Text style={[s.fieldLabel, { marginTop: 12 }]}>Material</Text>

                <TouchableOpacity
                  style={[s.selector, !selectedPair && { opacity: 0.55 }]}
                  onPress={() => {
                    if (!selectedPair) return;
                    setMaterialPickerOpen((v) => !v);
                  }}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      s.selectorText,
                      !selectedMaterial ? s.placeholderText : null,
                    ]}
                    numberOfLines={2}
                  >
                    {selectedMaterial
                      ? `${selectedMaterial.Material} · ${
                          selectedMaterial.Descripcion || "Sin descripción"
                        }`
                      : "Selecciona un material"}
                  </Text>
                  <Ionicons
                    name={
                      materialPickerOpen
                        ? "chevron-up-outline"
                        : "chevron-down-outline"
                    }
                    size={18}
                    color="#63718B"
                  />
                </TouchableOpacity>

                {!selectedPair ? (
                  <Text style={s.helperMini}>
                    Primero selecciona una categoría.
                  </Text>
                ) : null}

                {selectedPair && materialPickerOpen ? (
                  <View style={s.dropdownBox}>
                    <TextInput
                      value={materialSearch}
                      onChangeText={setMaterialSearch}
                      placeholder="Buscar material..."
                      placeholderTextColor="#63718B"
                      style={s.searchInput}
                    />

                    {loadingMaterials ? (
                      <View
                        style={{ paddingVertical: 16, alignItems: "center" }}
                      >
                        <ActivityIndicator />
                        <Text style={s.helperMini}>Cargando materiales…</Text>
                      </View>
                    ) : filteredMaterials.length === 0 ? (
                      <Text style={[s.helperMini, { padding: 12 }]}>
                        No se encontraron materiales para esta categoría.
                      </Text>
                    ) : (
                      <ScrollView
                        nestedScrollEnabled
                        style={{ maxHeight: 240 }}
                      >
                        {filteredMaterials.map((item, idx) => {
                          const active =
                            selectedMaterial?.Material === item.Material &&
                            safeUpper(selectedMaterial?.Agrupador1) ===
                              safeUpper(item.Agrupador1) &&
                            safeUpper(selectedMaterial?.Agrupador2) ===
                              safeUpper(item.Agrupador2);

                          return (
                            <TouchableOpacity
                              key={`${item.Material}-${item.Agrupador1}-${item.Agrupador2}-${idx}`}
                              style={[
                                s.dropdownItem,
                                active && s.dropdownItemActive,
                              ]}
                              onPress={() => {
                                setSelectedMaterial(item);
                                setUnitDraft(safeUpper(item?.Unidad) || "PZA");
                                setMaterialPickerOpen(false);
                              }}
                              activeOpacity={0.9}
                            >
                              <Text
                                style={[
                                  s.dropdownItemText,
                                  active && s.dropdownItemTextActive,
                                ]}
                              >
                                {item.Material}
                              </Text>
                              <Text
                                style={[
                                  s.dropdownItemSub,
                                  active && { color: "#fff" },
                                ]}
                              >
                                {item.Descripcion || "Sin descripción"}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                ) : null}

                <View style={s.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Cantidad</Text>
                    <TextInput
                      value={qtyDraft}
                      onChangeText={setQtyDraft}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor="#63718B"
                      style={s.textInput}
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Unidad</Text>
                    <View style={[s.textInput, { justifyContent: "center" }]}>
                      <Text
                        style={{
                          color: unitDraft ? "#0B1F3B" : "#63718B",
                          fontWeight: "800",
                        }}
                      >
                        {unitDraft || "Selecciona un material"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={s.modalActions}>
                  <TouchableOpacity
                    onPress={closeAddModal}
                    style={s.btnGhost}
                    activeOpacity={0.9}
                  >
                    <Text style={s.btnGhostTxt}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveItem}
                    style={[
                      s.btnPrimary,
                      (!selectedPair || !selectedMaterial) && { opacity: 0.55 },
                    ]}
                    activeOpacity={0.9}
                    disabled={!selectedPair || !selectedMaterial}
                  >
                    <Text style={s.btnPrimaryTxt}>
                      {editingKey ? "Guardar cambios" : "Agregar"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  title: {
    fontSize: 14,
    fontWeight: "900",
  },

  helperText: {
    marginTop: 4,
    color: "#63718B",
    fontSize: 12,
    fontWeight: "700",
  },

  addBtn: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  addBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },

  metaLabel: {
    color: "#63718B",
    fontWeight: "800",
    fontSize: 12,
  },

  metaValue: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 12,
  },

  emptyBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F7F9FC",
  },

  emptyText: {
    color: "#63718B",
    fontWeight: "700",
    textAlign: "center",
  },

  selectedCard: {
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderRadius: 12,
    backgroundColor: "#F7F7F7",
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  selectedCode: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 13,
  },

  selectedDesc: {
    color: "#0B1F3B",
    fontWeight: "700",
    marginTop: 2,
  },

  selectedMeta: {
    color: "#63718B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  actionsCol: {
    gap: 8,
  },

  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  modalTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    alignItems: "center",
    justifyContent: "center",
  },

  fieldLabel: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 6,
    marginTop: 4,
  },

  selector: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    backgroundColor: "#F5F7FA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  selectorText: {
    flex: 1,
    color: "#0B1F3B",
    fontWeight: "800",
    fontSize: 13,
  },

  placeholderText: {
    color: "#63718B",
  },

  dropdownBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },

  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF3FA",
  },

  dropdownItemActive: {
    backgroundColor: "#0A6ED1",
  },

  dropdownItemText: {
    color: "#0B1F3B",
    fontWeight: "800",
    fontSize: 13,
  },

  dropdownItemTextActive: {
    color: "#fff",
  },

  dropdownItemSub: {
    color: "#63718B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  searchInput: {
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0B1F3B",
    fontWeight: "700",
  },

  helperMini: {
    marginTop: 6,
    color: "#63718B",
    fontSize: 11,
    fontWeight: "700",
  },

  formRow: {
    flexDirection: "row",
    marginTop: 12,
  },

  textInput: {
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontWeight: "800",
    backgroundColor: "#fff",
    color: "#0B1F3B",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },

  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    backgroundColor: "#F5F7FA",
  },

  btnGhostTxt: {
    fontWeight: "900",
    color: "#0B1F3B",
  },

  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0A6ED1",
  },

  btnPrimaryTxt: {
    fontWeight: "900",
    color: "#fff",
  },
});
