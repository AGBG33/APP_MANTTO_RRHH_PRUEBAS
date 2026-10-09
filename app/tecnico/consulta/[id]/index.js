// app/tecnico/consulta/[id]/index.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  StatusBar,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";

const COLORS = {
  bg: "#F4F5F7",
  card: "#FFFFFF",
  border: "#E2E5E9",
  borderSoft: "#EDF0F3",
  text: "#252A31",
  muted: "#6B7280",
  red: "#C51F30",
  purple: "#7C3AED",
  purpleSoft: "#F3EEFF",
  green: "#087A55",
  amber: "#A15C00",
  blue: "#245EA8",
};

function stripLeadingZeros(value) {
  const s = String(value || "").trim();
  return s.replace(/^0+/, "") || s;
}

function pick(obj, keys, fallback = "") {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function formatDate(value) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function statusColors(statusRaw) {
  const s = String(statusRaw || "").toUpperCase();

  if (s.includes("FINAL") || s === "0300") {
    return { bg: "#E8F7F0", text: COLORS.green };
  }

  if (s.includes("FIRMA") || s === "0400") {
    return { bg: "#FFF4DD", text: COLORS.amber };
  }

  if (s.includes("PROCESO") || s === "0200") {
    return { bg: "#EAF2FF", text: COLORS.blue };
  }

  if (s.includes("NO MANT") || s === "0600") {
    return { bg: "#FDECEC", text: "#B42318" };
  }

  return { bg: "#F1F3F5", text: "#4B5563" };
}

export default function ConsultaOrdenDetalleScreen() {
  const params = useLocalSearchParams();

  const orderId = String(params?.id || "").trim();
  const email = String(params?.email || "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [operations, setOperations] = useState([]);
  const [materialsByOp, setMaterialsByOp] = useState({});
  const [loadingMaterial, setLoadingMaterial] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!orderId) {
        setError("No se recibió el número de orden.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        /*
         * Son exactamente las rutas GET que ya usa el flujo normal.
         * El token Azure se agrega automáticamente desde src/services/api.js.
         */
        const [orderRes, addressRes, operationsRes] = await Promise.all([
          api.get(`/api/ordenes/sap/${encodeURIComponent(orderId)}`),
          api.get(
            `/api/ordenes/sap/${encodeURIComponent(orderId)}/addresses`,
          ),
          api.get(`/api/operaciones/sap/${encodeURIComponent(orderId)}`),
        ]);

        if (!mounted) return;

        setOrden(orderRes?.data || null);

        const addrRows = Array.isArray(addressRes?.data?.results)
          ? addressRes.data.results
          : Array.isArray(addressRes?.data?.d?.results)
          ? addressRes.data.d.results
          : [];

        setAddresses(addrRows);

        const opRows = Array.isArray(operationsRes?.data)
          ? operationsRes.data
          : Array.isArray(operationsRes?.data?.results)
          ? operationsRes.data.results
          : [];

        setOperations(opRows);
      } catch (e) {
        if (!mounted) return;

        const detail =
          e?.response?.data?.detail ||
          e?.response?.data?.error ||
          e?.message ||
          "No se pudo obtener el detalle de la orden.";

        setError(String(detail));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [orderId]);

  const status = useMemo(() => {
    return (
      orden?.estatus_label ||
      orden?.statusLabel ||
      orden?.userstatus ||
      "Sin estatus"
    );
  }, [orden]);

  const statusStyle = statusColors(status);

  const addressText = useMemo(() => {
    const a = addresses?.[0];

    if (!a) {
      return (
        orden?.partner_address ||
        orden?.PartnerAddress ||
        "Sin dirección disponible"
      );
    }

    const parts = [
      pick(a, ["Street", "Stras", "street"]),
      pick(a, ["HouseNo", "HouseNo1", "houseNo"]),
      pick(a, ["City", "Ort01", "city"]),
      pick(a, ["Region", "Regio", "region"]),
      pick(a, ["PostalCode", "Pstlz", "postalCode"]),
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    return parts.join(", ") || "Sin dirección disponible";
  }, [addresses, orden]);

  const cargarMateriales = async (op) => {
    const activity = String(
      op?.Activity || op?.activity || op?.Vornr || "",
    ).trim();

    if (!activity) {
      Alert.alert(
        "Operación",
        "No se encontró el número de actividad para consultar materiales.",
      );
      return;
    }

    if (materialsByOp[activity]) {
      setMaterialsByOp((prev) => {
        const next = { ...prev };
        delete next[activity];
        return next;
      });
      return;
    }

    setLoadingMaterial(activity);

    try {
      const res = await api.get(
        `/api/operaciones/ordenes/${encodeURIComponent(
          orderId,
        )}/operaciones/${encodeURIComponent(activity)}/componentes`,
      );

      const rows = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.results)
        ? res.data.results
        : Array.isArray(res?.data?.d?.results)
        ? res.data.d.results
        : [];

      setMaterialsByOp((prev) => ({
        ...prev,
        [activity]: rows,
      }));
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        e?.message ||
        "No se pudieron consultar los materiales.";

      Alert.alert("Materiales", String(detail));
    } finally {
      setLoadingMaterial("");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <Header title="Detalle de orden" />

        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.red} />
          <Text style={styles.loadingText}>Consultando orden...</Text>
        </View>
      </View>
    );
  }

  if (error || !orden) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <Header title="Detalle de orden" />

        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color={COLORS.red}
          />
          <Text style={styles.errorTitle}>No se pudo cargar la orden</Text>
          <Text style={styles.errorText}>{error || "Orden no encontrada"}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <Header title="Detalle de orden" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.viewerBanner}>
          <Ionicons name="eye-outline" size={21} color={COLORS.purple} />

          <View style={{ flex: 1 }}>
            <Text style={styles.viewerTitle}>Solo lectura</Text>
            <Text style={styles.viewerText}>
              Consultando información asignada a {email || "otro técnico"}.
              Esta pantalla no contiene acciones para modificar SAP.
            </Text>
          </View>
        </View>

        <View style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>ORDEN DE SERVICIO</Text>
            <Text style={styles.orderNumber}>
              {stripLeadingZeros(
                orden?.orderid || orden?.Orderid || orderId,
              )}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusStyle.bg },
            ]}
          >
            <Text
              style={[styles.statusText, { color: statusStyle.text }]}
            >
              {status}
            </Text>
          </View>
        </View>

        <Section title="Información general">
          <Info
            label="Cliente"
            value={
              orden?.nombre_cliente ||
              orden?.partner_name ||
              "Sin información"
            }
          />

          <Info
            label="Equipo"
            value={orden?.equipment || "Sin información"}
          />

          <Info
            label="Tipo de orden"
            value={
              orden?.order_type ||
              orden?.nombre_orden ||
              "Sin información"
            }
          />

          <Info
            label="Fecha inicio"
            value={formatDate(orden?.start_date || orden?.startdate)}
          />

          <Info
            label="Fecha fin"
            value={formatDate(orden?.finish_date || orden?.finishdate)}
            last
          />
        </Section>

        <Section title="Ubicación">
          <Info label="Dirección" value={addressText} last />
        </Section>

        <Section title="Cobertura">
          <Text style={styles.coverageText}>
            {orden?.ShortText ||
              orden?.shortText ||
              orden?.short_text ||
              orden?.cobertura ||
              "Sin información de cobertura"}
          </Text>
        </Section>

        <View style={styles.operationsHeader}>
          <View>
            <Text style={styles.operationsTitle}>Operaciones asignadas</Text>
            <Text style={styles.operationsSubtitle}>
              {operations.length} operación(es)
            </Text>
          </View>
        </View>

        {operations.length === 0 ? (
          <View style={styles.emptyOperations}>
            <Text style={styles.emptyOperationsText}>
              No se encontraron operaciones para esta orden.
            </Text>
          </View>
        ) : (
          operations.map((op, index) => {
            const activity = String(
              op?.Activity || op?.activity || op?.Vornr || "",
            ).trim();

            const materials = materialsByOp[activity];
            const opStatus =
              op?.estatus ||
              op?.FieldUserStatus ||
              "pendiente";

            return (
              <View
                key={`${activity || "op"}-${index}`}
                style={styles.operationCard}
              >
                <View style={styles.operationTop}>
                  <View style={styles.activityBadge}>
                    <Text style={styles.activityBadgeText}>
                      {activity || `#${index + 1}`}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationTitle}>
                      {op?.Description ||
                        op?.description ||
                        "Operación sin descripción"}
                    </Text>

                    <Text style={styles.operationStatus}>
                      Estatus: {String(opStatus)}
                    </Text>
                  </View>
                </View>

                {!!op?.StandardTextKey && (
                  <Text style={styles.operationMeta}>
                    Clave: {op.StandardTextKey}
                  </Text>
                )}

                <TouchableOpacity
                  style={styles.materialButton}
                  onPress={() => cargarMateriales(op)}
                  disabled={loadingMaterial === activity}
                  activeOpacity={0.8}
                >
                  {loadingMaterial === activity ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.purple}
                    />
                  ) : (
                    <Ionicons
                      name={
                        materials
                          ? "chevron-up-outline"
                          : "cube-outline"
                      }
                      size={17}
                      color={COLORS.purple}
                    />
                  )}

                  <Text style={styles.materialButtonText}>
                    {loadingMaterial === activity
                      ? "Consultando..."
                      : materials
                      ? "Ocultar materiales"
                      : "Ver materiales"}
                  </Text>
                </TouchableOpacity>

                {materials && (
                  <View style={styles.materialList}>
                    {materials.length === 0 ? (
                      <Text style={styles.noMaterials}>
                        Esta operación no tiene materiales disponibles.
                      </Text>
                    ) : (
                      materials.map((mat, matIndex) => (
                        <View
                          key={`${activity}-mat-${matIndex}`}
                          style={[
                            styles.materialRow,
                            matIndex === materials.length - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.materialName}>
                              {pick(
                                mat,
                                [
                                  "Description",
                                  "MaterialDescription",
                                  "Maktx",
                                  "Material",
                                ],
                                "Material",
                              )}
                            </Text>

                            <Text style={styles.materialCode}>
                              {pick(
                                mat,
                                ["Material", "Matnr", "material"],
                                "",
                              )}
                            </Text>
                          </View>

                          <Text style={styles.materialQty}>
                            {pick(
                              mat,
                              [
                                "Quantity",
                                "RequiredQuantity",
                                "Menge",
                                "Cantidad",
                              ],
                              "",
                            )}{" "}
                            {pick(
                              mat,
                              ["Unit", "Meins", "Unidad"],
                              "",
                            )}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Info({ label, value, last = false }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  content: {
    padding: 16,
    paddingBottom: 70,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  loadingText: {
    marginTop: 10,
    color: COLORS.muted,
    fontWeight: "700",
  },

  errorTitle: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  errorText: {
    marginTop: 5,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  viewerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: "#DED1FF",
    padding: 12,
    marginBottom: 12,
  },

  viewerTitle: {
    color: COLORS.purple,
    fontSize: 13,
    fontWeight: "900",
  },

  viewerText: {
    marginTop: 2,
    color: "#645A78",
    fontSize: 11,
    lineHeight: 16,
  },

  headerCard: {
    minHeight: 82,
    backgroundColor: COLORS.card,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  kicker: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  orderNumber: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  statusBadge: {
    maxWidth: "48%",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },

  section: {
    backgroundColor: COLORS.card,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 6,
    marginBottom: 12,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 7,
  },

  infoRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },

  infoLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  infoValue: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  coverageText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    paddingBottom: 9,
  },

  operationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: 4,
    marginBottom: 9,
  },

  operationsTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  operationsSubtitle: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 11,
  },

  emptyOperations: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  emptyOperationsText: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 12,
  },

  operationCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 10,
  },

  operationTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  activityBadge: {
    minWidth: 48,
    height: 32,
    borderRadius: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3E8EA",
  },

  activityBadgeText: {
    color: COLORS.red,
    fontSize: 11,
    fontWeight: "900",
  },

  operationTitle: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  operationStatus: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  operationMeta: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 11,
  },

  materialButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    minHeight: 35,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: COLORS.purpleSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  materialButtonText: {
    color: COLORS.purple,
    fontSize: 11,
    fontWeight: "900",
  },

  materialList: {
    marginTop: 10,
    backgroundColor: "#F8F9FB",
    borderRadius: 11,
    paddingHorizontal: 10,
  },

  materialRow: {
    minHeight: 54,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E9EF",
  },

  materialName: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },

  materialCode: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 10,
  },

  materialQty: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },

  noMaterials: {
    color: COLORS.muted,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 12,
  },
});