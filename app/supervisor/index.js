// app/supervisor/index.js

import React, { useCallback } from "react";
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

// ====== Datos del menú ======
const TILES = [
  {
    key: "ordenes",
    title: "Órdenes de servicio",
    description: "Consulta y supervisa los servicios",
    icon: "clipboard-outline",
    accent: "#355C7D",
    softColor: "#EAF1F6",
    onPress: () => router.push("/supervisor/ordenes"),
  },
  {
    key: "reprogramaciones",
    title: "Reprogramación",
    description: "Organiza nuevas fechas de atención",
    icon: "calendar-outline",
    accent: "#756278",
    softColor: "#F1EDF2",
    onPress: () => router.push("/supervisor/reprogramacionesPlan"),
  },
  {
    key: "averia",
    title: "Avisos de avería",
    description: "Consulta y gestiona incidencias",
    icon: "warning-outline",
    accent: "#B23A48",
    softColor: "#F8ECEE",
    onPress: () => router.push("/supervisor/averia"),
  },
  {
    key: "no_mantenimiento",
    title: "No mantenimiento",
    description: "Consulta las cartas registradas",
    icon: "close-circle-outline",
    accent: "#53736A",
    softColor: "#EAF2EF",
    onPress: () => router.push("/supervisor/no_mantenimiento"),
  },
  {
    key: "monitoreo",
    title: "Seguimiento en tiempo real",
    description: "Visualiza la ubicación del personal",
    icon: "location-outline",
    accent: "#A2643E",
    softColor: "#F6EEE9",
    onPress: () => router.push("/supervisor/monitoreo/monitoreo"),
  },
  {
    key: "equipos",
    title: "Equipos a cargo",
    description: "Revisa los equipos supervisados",
    icon: "construct-outline",
    accent: "#5D6F8A",
    softColor: "#EDF0F5",
    onPress: () => router.push("/supervisor/equipos"),
  },
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
          style={[
            styles.tileTitle,
            disabled && styles.tileTitleDisabled,
          ]}
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

export default function SupervisorHome() {
  /*
    Bloquea el botón físico de regresar en Android
    solo cuando estás en el home principal del supervisor.

    Esto evita que el usuario regrese al login desde /supervisor.
    Las vistas internas siguen funcionando normal.
  */
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        console.log(
          "[NAV] Bloqueado regreso desde Inicio Supervisor",
        );
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, []),
  );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.pageBg}
      />

      <Header title="Inicio Supervisor" />

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
                  Supervisa las actividades y servicios de tu equipo.
                </Text>

                <View style={styles.rolePill}>
                  <Ionicons
                    name="people-outline"
                    size={14}
                    color={COLORS.role}
                  />
                  <Text style={styles.roleText}>
                    Panel de supervisión
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
                <Text style={styles.optionsCounterText}>
                  {TILES.length}
                </Text>
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
  pageBg: "#F4F6F8",
  cardBg: "#FFFFFF",
  border: "#E1E6EB",
  textPrimary: "#25313D",
  textSecondary: "#6E7883",
  textDisabled: "#A6AFB8",
  brand: "#B23A48",
  badgeBg: "#B23A48",
  role: "#355C7D",
  roleBg: "#EAF1F6",
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
        shadowColor: "#243442",
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

  rolePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.roleBg,
  },

  roleText: {
    color: COLORS.role,
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
    backgroundColor: "#E9EDF1",
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
        shadowColor: "#243442",
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
    backgroundColor: "#EEF1F4",
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