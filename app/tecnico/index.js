// app/tecnico/index.js

import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  BackHandler,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Header from "../../src/components/Header";

import { useOffline } from "../../src/offline/OfflineProvider";
import { bootstrapPrefetchConsumiblesCatalogo } from "../../src/offline/bootstrapConsumiblesCatalogo";

// ====== Datos del menú ======
const TILES = [
  {
    key: "ordenes",
    title: "Órdenes de servicio",
    description: "Consulta tus servicios asignados",
    icon: "clipboard-outline",
    accent: "#C51F30",
    softColor: "#FBECEF",
    onPress: () => router.push("/tecnico/ordenes"),
  },
  {
    key: "pendiente_firma",
    title: "Pendientes de firma",
    description: "Servicios pendientes de firmar por el cliente",
    icon: "create-outline",
    accent: "#355C7D",
    softColor: "#EBF1F6",
    onPress: () => router.push("/tecnico/pendiente_firma"),
  },
  {
    key: "no_mantenimiento",
    title: "No mantenimiento",
    description: "Lista de servicios que no tuvieron mantenimiento",
    icon: "close-circle-outline",
    accent: "#52796F",
    softColor: "#EDF4F1",
    onPress: () => router.push("/tecnico/no_mantenimiento"),
  },
  {
    key: "averias",
    title: "Aviso de avería",
    description: "Consulta los avisos de avería creados",
    icon: "warning-outline",
    accent: "#B06C3B",
    softColor: "#F8F0E9",
    onPress: () => router.push("/tecnico/averias"),
  },
  {
    key: "rutas",
    title: "Ruta asignada",
    description: "Visualiza tu recorrido de trabajo",
    icon: "navigate-outline",
    accent: "#655A7C",
    softColor: "#F1EEF5",
    onPress: () => router.push("/tecnico/rutas"),
  },
  {
    key: "rh",
    title: "Vistas RH",
    description: "Preubas de vistas de RH",
    icon: "people-outline",
    accent: "#727c5a",
    softColor: "#F1EEF5",
    onPress: () => router.push("/tecnico/RH"),
  },

  /*
  {
    key: "documentos",
    title: "Documentos de mantenimiento",
    description: "Consulta los archivos disponibles",
    icon: "folder-open-outline",
    accent: "#475569",
    softColor: "#EEF2F6",
    onPress: () => router.push("/tecnico/documentos"),
  },
  */
];

// ====== Tarjeta del menú ======
function MenuTile({
  title,
  description,
  icon,
  badge,
  accent,
  softColor,
  onPress,
  disabled = false,
}) {
  return (
    <Pressable
      onPress={disabled ? null : onPress}
      disabled={disabled}
      android_ripple={disabled ? null : { color: softColor }}
      style={({ pressed }) => [
        styles.tile,
        disabled && styles.tileDisabled,
        pressed && !disabled && styles.tilePressed,
      ]}
    >
      <View style={styles.tileTopRow}>
        <View style={[styles.iconBox, { backgroundColor: accent }]}>
          <Ionicons
            name={icon}
            size={27}
            color="#FFFFFF"
            style={disabled ? styles.iconDisabled : null}
          />
        </View>

        {typeof badge === "number" && badge > 0 && !disabled ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badge > 99 ? "99+" : badge}
            </Text>
          </View>
        ) : (
          <View style={styles.arrowBox}>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={disabled ? COLORS.textDisabled : accent}
            />
          </View>
        )}
      </View>

      <View style={styles.tileTextBlock}>
        <Text
          style={[styles.tileTitle, disabled && styles.tileTitleDisabled]}
          numberOfLines={2}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.tileDescription,
            disabled && styles.tileDescriptionDisabled,
          ]}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

export default function TecnicoHome() {
  const { online, dbReady } = useOffline();

  /*
    Bloquea el botón físico de regresar en Android
    solo cuando estás en el home principal del técnico.

    Esto evita que el usuario regrese al login desde /tecnico.
    Las vistas internas siguen funcionando normal.
  */
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        console.log("[NAV] Bloqueado regreso desde Inicio Técnico");
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, []),
  );

  /*
    Las órdenes ya son administradas por OrdenesTecnicoProvider.
    Aquí únicamente conservamos la precarga independiente del
    catálogo de consumibles.
  */
  useEffect(() => {
    if (!online || !dbReady) return;

    bootstrapPrefetchConsumiblesCatalogo()
      .then((r) => {
        console.log("[OFFLINE] prefetch consumibles:", r);
      })
      .catch((e) => {
        console.log(
          "[OFFLINE] prefetch consumibles error:",
          e?.message || e,
        );
      });
  }, [online, dbReady]);

  const connectionLabel = online
    ? dbReady
      ? "Datos actualizados"
      : "Preparando datos"
    : "Modo sin conexión";

  const connectionColor = online ? "#059669" : "#D97706";
  const connectionBackground = online ? "#E7F8F2" : "#FFF4DD";

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.pageBg}
      />

      <Header title="Inicio Técnico" />

      <FlatList
        data={TILES}
        numColumns={2}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={
          <View>
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeContent}>
                <Text style={styles.welcomeTitle}>¡Bienvenido!</Text>
                <Text style={styles.welcomeText}>
                  Comienza tu jornada revisando tus órdenes asignadas.
                </Text>

                <View
                  style={[
                    styles.connectionPill,
                    { backgroundColor: connectionBackground },
                  ]}
                >
                  <View
                    style={[
                      styles.connectionDot,
                      { backgroundColor: connectionColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.connectionText,
                      { color: connectionColor },
                    ]}
                  >
                    {connectionLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Accesos rápidos</Text>
                <Text style={styles.sectionSubtitle}>
                  Selecciona una opción para continuar
                </Text>
              </View>

              <View style={styles.optionsCounter}>
                <Text style={styles.optionsCounterText}>{TILES.length}</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <MenuTile
            title={item.title}
            description={item.description}
            icon={item.icon}
            badge={item.badge}
            accent={item.accent}
            softColor={item.softColor}
            onPress={item.onPress}
            disabled={item.disabled}
          />
        )}
      />
    </View>
  );
}

const COLORS = {
  pageBg: "#F4F5F7",
  cardBg: "#FFFFFF",
  border: "#E2E5E9",
  textPrimary: "#252A31",
  textSecondary: "#6B7280",
  textDisabled: "#A1A7B0",
  brand: "#C51F30",
  badgeBg: "#C51F30",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 80,
  },

  welcomeCard: {
    minHeight: 104,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.brand,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
    overflow: "hidden",

    ...Platform.select({
      ios: {
        shadowColor: "#20242A",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 3,
        },
      },
      android: {
        elevation: 1,
      },
    }),
  },

  welcomeContent: {
    width: "100%",
  },

  welcomeTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
  },

  welcomeText: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },

  connectionPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  connectionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },

  sectionSubtitle: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },

  optionsCounter: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 8,
    backgroundColor: "#F3E8EA",
    alignItems: "center",
    justifyContent: "center",
  },

  optionsCounterText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: "800",
  },

  gridRow: {
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  tile: {
    width: "48%",
    minHeight: 156,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    overflow: "hidden",

    ...Platform.select({
      ios: {
        shadowColor: "#20242A",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 4,
        },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  tilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },

  tileTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  iconDisabled: {
    opacity: 0.4,
  },

  arrowBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F3F5",
    alignItems: "center",
    justifyContent: "center",
  },

  tileTextBlock: {
    marginTop: 18,
  },

  tileTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },

  tileDescription: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },

  badge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: COLORS.badgeBg,
    alignItems: "center",
    justifyContent: "center",
  },

  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  tileDisabled: {
    opacity: 0.5,
  },

  tileTitleDisabled: {
    color: COLORS.textDisabled,
  },

  tileDescriptionDisabled: {
    color: COLORS.textDisabled,
  },
});