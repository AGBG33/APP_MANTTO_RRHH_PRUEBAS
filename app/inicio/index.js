// app/inicio/index.js

import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import Header from "../../src/components/Header";
import { usePermissions } from "../../src/core/permissions/usePermissions";
import { PERMISSIONS } from "../../src/core/permissions/catalog";

export default function InicioModulos() {
  const {
    loading,
    isAuthenticated,
    can,
    mantenimientoRoute,
  } = usePermissions();

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => true
      );

      return () => subscription.remove();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0B1F3B" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={styles.container}>
      <Header title="Inicio" />

      <View style={styles.content}>
        <Text style={styles.title}>Selecciona un módulo</Text>

        <Text style={styles.subtitle}>
          Elige el apartado en el que deseas trabajar.
        </Text>

        {can(PERMISSIONS.MANTENIMIENTO.ACCEDER) &&
          mantenimientoRoute && (
            <Pressable
              onPress={() => router.push(mantenimientoRoute)}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[styles.icon, styles.maintenanceIcon]}
              >
                <Ionicons
                  name="construct-outline"
                  size={28}
                  color="#0B1F3B"
                />
              </View>

              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>
                  Mantenimiento
                </Text>
                <Text style={styles.cardDescription}>
                  Órdenes de servicio, equipos y actividades.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={22}
                color="#64748B"
              />
            </Pressable>
          )}

        {can(PERMISSIONS.RRHH.ACCEDER) && (
          <Pressable
            onPress={() => router.push("/rrhh")}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.icon, styles.rhIcon]}>
              <Ionicons
                name="people-outline"
                size={28}
                color="#52796F"
              />
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>
                Recursos Humanos
              </Text>
              <Text style={styles.cardDescription}>
                Asistencia, jornada e incidencias.
              </Text>
              <Text style={styles.prototype}>
                Vistas de prueba
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#64748B"
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F5F8",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0B1F3B",
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.8,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  maintenanceIcon: {
    backgroundColor: "#EAF0F7",
  },
  rhIcon: {
    backgroundColor: "#EDF4F1",
  },
  cardContent: {
    flex: 1,
    marginHorizontal: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    marginTop: 5,
  },
  prototype: {
    fontSize: 11,
    color: "#52796F",
    fontWeight: "600",
    marginTop: 8,
  },
});