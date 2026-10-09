// app/tecnico/documentos/index.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Header from "../../../src/components/Header";

/* ====================== Paleta Fiori ====================== */
const FIORI = {
  pageBg: "#F7F7F7",
  cardBg: "#FFFFFF",
  cardSubtle: "#F5F7FA",
  border: "#DDE6F2",
  ink: "#0B1F3B",
  textMuted: "#63718B",
  accent: "#0A6ED1",
  neutralBtn: "#ECEFF5",
  danger: "#EB5757",
};

/* ======================
   ✅ Lista de documentos
   ======================

   - key: id único
   - title: nombre visible
   - desc: descripción corta (opcional)
   - icon: Ionicons name
   - route: a dónde navegará
   - disabled: si aún no lo tienes listo
*/
const DOCUMENTS = [
  {
    key: "mantto_cables",
    title: "Registro de mantenimiento de cables",
    desc: "Formulario de registro de mantenimiento de cables",
    icon: "git-branch-outline",
    route: "/tecnico/ordenes/[orderid]/mantto-cables",
  },
  {
    key: "mantto_frenoEmEhOtros",
    title: "Registro de mantenimiento de freno tipos EM, EH y otros",
    desc: "Formulario de registro de mantenimiento de freno EM, EH",
    icon: "aperture-outline",
    route: "/tecnico/ordenes/[orderid]/mantto-freno-em-eh",
  },
  {
    key: "mantto_frenoPmPmf",
    title: "Registro de mantenimiento de freno tipos PM, PMF",
    desc: "Formulario de registro de mantenimiento de freno PM, PMF",
    icon: "aperture-outline",
    route: "/tecnico/ordenes/[orderid]/mantto-freno-pm-pmf",
  },
  {
    key: "mantto_frenoPm",
    title: "Registro de mantenimiento de freno tipos PM",
    desc: "Formulario de registro de mantenimiento de freno PM",
    icon: "aperture-outline",
    route: "/tecnico/ordenes/[orderid]/mantto-freno-pm",
  },
  {
    key: "reporte",
    title: "Reporte de terminación",
    desc: "Reporte de terminación y conformidad",
    icon: "aperture-outline",
    route: "/tecnico/ordenes/[orderid]/terminacion-conformidad",
  },
  

  // Ejemplo por si quieres dejar cosas “en construcción”
  // {
  //   key: "otros",
  //   title: "Otro documento",
  //   desc: "Pendiente por definir.",
  //   icon: "construct-outline",
  //   route: "/tecnico/documentos/otro",
  //   disabled: true,
  // },
];

/* ======================
   ✅ Item tipo “card row”
   ====================== */
function DocRow({ title, desc, icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[styles.rowCard, disabled && styles.rowCardDisabled]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconWrap, disabled && { opacity: 0.55 }]}>
          <Ionicons name={icon} size={22} color={FIORI.ink} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, disabled && { color: "#7A869A" }]} numberOfLines={2}>
            {title}
          </Text>

          {!!desc && (
            <Text style={styles.rowDesc} numberOfLines={2}>
              {desc}
            </Text>
          )}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color={disabled ? "#9AA5B1" : FIORI.textMuted}
      />
    </TouchableOpacity>
  );
}

export default function TecnicoDocumentosIndex() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCUMENTS;

    return DOCUMENTS.filter((d) => {
      const haystack = `${d.title} ${d.desc || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const openDoc = (item) => {
    if (item?.disabled) return;
    if (item?.route) router.push(item.route);
  };

  return (
    <View style={styles.container}>
      <Header title="Documentos" />

      {/* Buscador */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={FIORI.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar documento…"
          placeholderTextColor={FIORI.textMuted}
          returnKeyType="search"
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery("")} style={styles.clearIconBtn}>
            <Ionicons name="close-circle" size={18} color={FIORI.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Lista */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 26 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <DocRow
            title={item.title}
            desc={item.desc}
            icon={item.icon}
            disabled={item.disabled}
            onPress={() => openDoc(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No hay documentos que coincidan con tu búsqueda.</Text>
        }
      />
    </View>
  );
}

/* ====================== Styles ====================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FIORI.pageBg,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    backgroundColor: FIORI.cardBg,
    borderWidth: 1,
    borderColor: FIORI.border,
    borderRadius: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: FIORI.ink,
  },
  clearIconBtn: {
    padding: 2,
  },

  rowCard: {
    backgroundColor: FIORI.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  rowCardDisabled: {
    opacity: 0.55,
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: FIORI.neutralBtn,
    borderWidth: 1,
    borderColor: FIORI.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: FIORI.ink,
    lineHeight: 18,
  },
  rowDesc: {
    marginTop: 4,
    fontSize: 12,
    color: FIORI.textMuted,
    lineHeight: 16,
  },

  emptyText: {
    textAlign: "center",
    marginTop: 28,
    color: FIORI.textMuted,
    paddingHorizontal: 16,
  },
});
