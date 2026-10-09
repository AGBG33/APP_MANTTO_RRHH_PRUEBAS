// app/tecnico/consulta/index.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Header from "../../../src/components/Header";
import api from "../../../src/services/api";

const COLORS = {
  bg: "#F4F5F7",
  card: "#FFFFFF",
  border: "#E2E5E9",
  text: "#252A31",
  muted: "#6B7280",
  red: "#C51F30",
  purple: "#7C3AED",
  purpleSoft: "#F3EEFF",
  blue: "#355C7D",
  blueSoft: "#EEF4FB",
};

function cleanEmail(value) {
  return String(value || "").trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value));
}

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidYmd(value) {
  const s = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }

  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

function stripLeadingZeros(value) {
  const s = String(value || "").trim();
  return s.replace(/^0+/, "") || s;
}

function getOrderId(item) {
  return String(
    item?.orderid ||
      item?.Orderid ||
      item?.OrderId ||
      item?.Aufnr ||
      item?.aufnr ||
      "",
  ).trim();
}

function getStatus(item) {
  return (
    item?.estatus_label ||
    item?.statusLabel ||
    item?.status_label ||
    item?.userstatus ||
    item?.Userstatus ||
    "Sin estatus"
  );
}

function getClient(item) {
  return (
    item?.nombre_cliente ||
    item?.partner_name ||
    item?.PartnerName ||
    item?.customer_name ||
    item?.CustomerName ||
    ""
  );
}

function getEquipment(item) {
  return (
    item?.equipment ||
    item?.Equipment ||
    item?.equnr ||
    item?.Equnr ||
    ""
  );
}

function getDescription(item) {
  return (
    item?.ShortText ||
    item?.shortText ||
    item?.short_text ||
    item?.cobertura ||
    item?.description ||
    item?.Description ||
    ""
  );
}

function getSearchText(item) {
  return [
    getOrderId(item),
    stripLeadingZeros(getOrderId(item)),
    getClient(item),
    getEquipment(item),
    getDescription(item),
    getStatus(item),
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
    .join(" ");
}

function statusColors(statusRaw) {
  const s = String(statusRaw || "").toUpperCase();

  if (s.includes("FINAL") || s === "0300") {
    return { bg: "#E8F7F0", text: "#087A55" };
  }

  if (s.includes("FIRMA") || s === "0400") {
    return { bg: "#FFF4DD", text: "#A15C00" };
  }

  if (s.includes("PROCESO") || s === "0200") {
    return { bg: "#EAF2FF", text: "#245EA8" };
  }

  if (s.includes("NO MANT") || s === "0600") {
    return { bg: "#FDECEC", text: "#B42318" };
  }

  return { bg: "#F1F3F5", text: "#4B5563" };
}

function getTodayRange() {
  const now = new Date();
  const today = ymdLocal(now);

  return {
    start: today,
    end: today,
  };
}

function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay();

  // Domingo = 0.
  // Queremos lunes como inicio de semana.
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + diffToMonday,
  );

  const sunday = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6,
  );

  return {
    start: ymdLocal(monday),
    end: ymdLocal(sunday),
  };
}

function getCurrentMonthRange() {
  const now = new Date();

  const firstDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  const lastDay = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  );

  return {
    start: ymdLocal(firstDay),
    end: ymdLocal(lastDay),
  };
}

export default function ConsultaOrdenesScreen() {
  const initialMonth = useMemo(
    () => getCurrentMonthRange(),
    [],
  );

  const [email, setEmail] = useState("");
  const [correoActivo, setCorreoActivo] = useState("");

  const [startDate, setStartDate] = useState(
    initialMonth.start,
  );

  const [endDate, setEndDate] = useState(
    initialMonth.end,
  );

  const [activeFilter, setActiveFilter] = useState("mes");
  const [search, setSearch] = useState("");
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ordenesFiltradas = useMemo(() => {
    const term = String(search || "").trim().toLowerCase();

    if (!term) {
      return ordenes;
    }

    return ordenes.filter((item) =>
      getSearchText(item).includes(term),
    );
  }, [ordenes, search]);

  const consultar = async ({
    start = startDate,
    end = endDate,
    emailOverride = email,
  } = {}) => {
    const correo = cleanEmail(emailOverride);
    const startClean = String(start || "").trim();
    const endClean = String(end || "").trim();

    if (!isValidEmail(correo)) {
      Alert.alert(
        "Correo inválido",
        "Ingresa un correo válido para consultar sus órdenes.",
      );
      return false;
    }

    if (
      !isValidYmd(startClean) ||
      !isValidYmd(endClean)
    ) {
      Alert.alert(
        "Fechas inválidas",
        "Las fechas deben tener el formato YYYY-MM-DD.",
      );
      return false;
    }

    if (startClean > endClean) {
      Alert.alert(
        "Rango inválido",
        "La fecha inicial no puede ser mayor que la fecha final.",
      );
      return false;
    }

    /*
     * IMPORTANTE:
     * Si las dos fechas son iguales usamos mode=eq.
     * Si son distintas usamos mode=range.
     *
     * Así la petición queda alineada con la lógica
     * que ya tiene el backend y con las pruebas en Postman.
     */
    const mode =
      startClean === endClean ? "eq" : "range";

    setLoading(true);
    setError("");
    setSearch("");

    try {
      console.log("[CONSULTA ORDENES]", {
        start: startClean,
        end: endClean,
        mode,
        user: correo,
      });

      const response = await api.get(
        "/api/ordenes/sap/list",
        {
          params: {
            start: startClean,
            end: endClean,
            mode,
            user: correo,
          },
        },
      );

      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.results)
        ? response.data.results
        : [];

      setCorreoActivo(correo);
      setOrdenes(rows);

      console.log(
        "[CONSULTA ORDENES] Total recibido:",
        rows.length,
      );

      if (rows.length === 0) {
        setError(
          `No se encontraron órdenes para ${correo} entre ${startClean} y ${endClean}.`,
        );
      }

      return true;
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        e?.message ||
        "No se pudieron consultar las órdenes.";

      setOrdenes([]);
      setCorreoActivo("");
      setError(String(detail));

      return false;
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltroRapido = async (tipo) => {
    let range;

    if (tipo === "dia") {
      range = getTodayRange();
    } else if (tipo === "semana") {
      range = getCurrentWeekRange();
    } else {
      range = getCurrentMonthRange();
    }

    setActiveFilter(tipo);
    setStartDate(range.start);
    setEndDate(range.end);

    /*
     * Si ya hay un correo válido,
     * hacemos inmediatamente la nueva consulta.
     */
    if (isValidEmail(email)) {
      await consultar({
        start: range.start,
        end: range.end,
        emailOverride: email,
      });
    }
  };

  const aplicarRangoManual = async () => {
    setActiveFilter("personalizado");

    await consultar({
      start: startDate,
      end: endDate,
      emailOverride: email,
    });
  };

  const abrirOrden = (item) => {
    const orderId = getOrderId(item);

    if (!orderId || !correoActivo) {
      return;
    }

    router.push({
      pathname: "/tecnico/consulta/[id]",
      params: {
        id: orderId,
        email: correoActivo,
      },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.bg}
      />

      <Header title="Consulta de órdenes" />

      <FlatList
        data={ordenesFiltradas}
        keyExtractor={(item, index) =>
          `${getOrderId(item) || "orden"}-${index}`
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.viewerBanner}>
              <View style={styles.viewerIcon}>
                <Ionicons
                  name="eye-outline"
                  size={22}
                  color={COLORS.purple}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.viewerTitle}>
                  Modo consulta
                </Text>

                <Text style={styles.viewerText}>
                  Consulta órdenes de otro técnico usando la
                  sesión Microsoft que ya está iniciada.
                </Text>
              </View>
            </View>

            <View style={styles.searchCard}>
              <Text style={styles.label}>
                Correo del técnico
              </Text>

              <View style={styles.inputWrap}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={COLORS.muted}
                />

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="HBalderas@melco.com.mx"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                  editable={!loading}
                />
              </View>

              <Text
                style={[
                  styles.label,
                  { marginTop: 15 },
                ]}
              >
                Periodo
              </Text>

              <View style={styles.quickFilters}>
                <QuickFilter
                  label="Día"
                  active={activeFilter === "dia"}
                  disabled={loading}
                  onPress={() =>
                    aplicarFiltroRapido("dia")
                  }
                />

                <QuickFilter
                  label="Semana"
                  active={activeFilter === "semana"}
                  disabled={loading}
                  onPress={() =>
                    aplicarFiltroRapido("semana")
                  }
                />

                <QuickFilter
                  label="Mes"
                  active={activeFilter === "mes"}
                  disabled={loading}
                  onPress={() =>
                    aplicarFiltroRapido("mes")
                  }
                />
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>
                    Desde
                  </Text>

                  <View style={styles.dateInputWrap}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={COLORS.muted}
                    />

                    <TextInput
                      value={startDate}
                      onChangeText={(value) => {
                        setStartDate(value);
                        setActiveFilter(
                          "personalizado",
                        );
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.dateInput}
                      editable={!loading}
                    />
                  </View>
                </View>

                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>
                    Hasta
                  </Text>

                  <View style={styles.dateInputWrap}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={COLORS.muted}
                    />

                    <TextInput
                      value={endDate}
                      onChangeText={(value) => {
                        setEndDate(value);
                        setActiveFilter(
                          "personalizado",
                        );
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.dateInput}
                      editable={!loading}
                    />
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.searchButton,
                  loading && {
                    opacity: 0.7,
                  },
                ]}
                onPress={aplicarRangoManual}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Ionicons
                    name="search"
                    size={20}
                    color="#FFFFFF"
                  />
                )}

                <Text style={styles.searchButtonText}>
                  {loading
                    ? "Consultando..."
                    : activeFilter ===
                      "personalizado"
                    ? "Aplicar rango"
                    : "Consultar órdenes"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.rangeHint}>
                Rango actual: {startDate} al {endDate}
              </Text>

              <Text style={styles.modeHint}>
                Modo enviado:{" "}
                {startDate === endDate
                  ? "eq"
                  : "range"}
              </Text>
            </View>

            {!!correoActivo && (
              <>
                <View style={styles.resultHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle}>
                      Órdenes encontradas
                    </Text>

                    <Text style={styles.resultEmail}>
                      {correoActivo}
                    </Text>

                    <Text style={styles.resultRange}>
                      {startDate} al {endDate}
                    </Text>
                  </View>

                  <View style={styles.counter}>
                    <Text style={styles.counterText}>
                      {ordenesFiltradas.length}
                    </Text>
                  </View>
                </View>

                <View style={styles.localSearchWrap}>
                  <Ionicons
                    name="search-outline"
                    size={19}
                    color={COLORS.muted}
                  />

                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Buscar orden, cliente, equipo o estatus..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.localSearchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {!!search && (
                    <TouchableOpacity
                      onPress={() => setSearch("")}
                      style={styles.clearButton}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color="#9CA3AF"
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {!!search && (
                  <Text style={styles.filteredText}>
                    {ordenesFiltradas.length} de{" "}
                    {ordenes.length} órdenes coinciden
                  </Text>
                )}
              </>
            )}

            {!!error && (
              <View style={styles.messageCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color="#A15C00"
                />

                <Text style={styles.messageText}>
                  {error}
                </Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => {
          const orderId = getOrderId(item);
          const status = getStatus(item);
          const statusStyle =
            statusColors(status);

          return (
            <TouchableOpacity
              style={styles.orderCard}
              onPress={() => abrirOrden(item)}
              activeOpacity={0.84}
            >
              <View style={styles.orderTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderLabel}>
                    ORDEN
                  </Text>

                  <Text style={styles.orderNumber}>
                    {stripLeadingZeros(orderId)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        statusStyle.bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          statusStyle.text,
                      },
                    ]}
                  >
                    {status}
                  </Text>
                </View>
              </View>

              <View style={styles.separator} />

              <InfoRow
                icon="business-outline"
                value={
                  getClient(item) ||
                  "Cliente sin información"
                }
              />

              <InfoRow
                icon="construct-outline"
                value={
                  getEquipment(item) ||
                  "Equipo sin información"
                }
              />

              {!!getDescription(item) && (
                <InfoRow
                  icon="document-text-outline"
                  value={getDescription(item)}
                />
              )}

              <View style={styles.openRow}>
                <Text style={styles.openText}>
                  Ver detalle
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.red}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading &&
          correoActivo &&
          search &&
          ordenesFiltradas.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="search-outline"
                size={38}
                color="#A1A7B0"
              />

              <Text style={styles.emptyTitle}>
                Sin coincidencias
              </Text>

              <Text style={styles.emptyText}>
                No hay órdenes que coincidan con "
                {search}".
              </Text>
            </View>
          ) : !loading &&
            !correoActivo &&
            !error ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="search-outline"
                size={38}
                color="#A1A7B0"
              />

              <Text style={styles.emptyTitle}>
                Ingresa el correo de un técnico
              </Text>

              <Text style={styles.emptyText}>
                Después selecciona Día, Semana, Mes
                o escribe un rango personalizado.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function QuickFilter({
  label,
  active,
  onPress,
  disabled,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.quickButton,
        active &&
          styles.quickButtonActive,
        disabled && {
          opacity: 0.6,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.quickButtonText,
          active &&
            styles.quickButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function InfoRow({ icon, value }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons
        name={icon}
        size={17}
        color={COLORS.muted}
      />

      <Text
        style={styles.infoValue}
        numberOfLines={2}
      >
        {value}
      </Text>
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
    paddingBottom: 80,
  },

  viewerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    padding: 14,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: "#DED1FF",
    marginBottom: 12,
  },

  viewerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  viewerTitle: {
    color: COLORS.purple,
    fontSize: 15,
    fontWeight: "900",
  },

  viewerText: {
    marginTop: 3,
    color: "#645A78",
    fontSize: 12,
    lineHeight: 17,
  },

  searchCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 16,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 3,
        },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },

  inputWrap: {
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D5DAE2",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  input: {
    flex: 1,
    marginLeft: 9,
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 12,
  },

  quickFilters: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  quickButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 1,
    borderColor: "#D8E4F0",
  },

  quickButtonActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },

  quickButtonText: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: "800",
  },

  quickButtonTextActive: {
    color: "#FFFFFF",
  },

  dateRow: {
    flexDirection: "row",
    gap: 10,
  },

  dateColumn: {
    flex: 1,
  },

  dateLabel: {
    marginBottom: 5,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  dateInputWrap: {
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D5DAE2",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  dateInput: {
    flex: 1,
    marginLeft: 6,
    color: COLORS.text,
    fontSize: 12,
    paddingVertical: 10,
  },

  searchButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: COLORS.red,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  rangeHint: {
    marginTop: 9,
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 10.5,
  },

  modeHint: {
    marginTop: 3,
    textAlign: "center",
    color: "#8A93A2",
    fontSize: 10,
  },

  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 2,
  },

  resultTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  resultEmail: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 12,
  },

  resultRange: {
    marginTop: 2,
    color: "#8A93A2",
    fontSize: 10,
  },

  counter: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3E8EA",
  },

  counterText: {
    color: COLORS.red,
    fontWeight: "900",
    fontSize: 12,
  },

  localSearchWrap: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  localSearchInput: {
    flex: 1,
    marginLeft: 8,
    color: COLORS.text,
    fontSize: 13,
    paddingVertical: 10,
  },

  clearButton: {
    padding: 4,
  },

  filteredText: {
    color: COLORS.muted,
    fontSize: 10,
    marginBottom: 10,
    paddingHorizontal: 3,
  },

  messageCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF7E8",
    borderWidth: 1,
    borderColor: "#F2D59A",
    borderRadius: 13,
    padding: 12,
    marginBottom: 12,
  },

  messageText: {
    flex: 1,
    color: "#8B5A0A",
    fontSize: 12,
    lineHeight: 17,
  },

  orderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 3,
        },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  orderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  orderLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  orderNumber: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
  },

  statusBadge: {
    maxWidth: "52%",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },

  separator: {
    height: 1,
    backgroundColor: "#EDF0F3",
    marginVertical: 11,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 7,
  },

  infoValue: {
    flex: 1,
    color: "#4B5563",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },

  openRow: {
    marginTop: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EDF0F3",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
  },

  openText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: "900",
  },

  emptyWrap: {
    alignItems: "center",
    paddingTop: 30,
    paddingHorizontal: 24,
  },

  emptyTitle: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 5,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});