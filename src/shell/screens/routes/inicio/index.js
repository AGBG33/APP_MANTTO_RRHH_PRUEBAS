// app/inicio/index.js

import React, { useCallback } from "react";
import {
  View,
  Alert,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import Header from "../../../../components/Header";
import { usePermissions } from "../../../permissions/usePermissions";
import { PERMISSIONS } from "../../../../core/permissions/catalog";

export default function InicioModulos() {
  const {
    loading,
    isAuthenticated,
    can,
    mantenimientoRoute,
    moduleError,
    refreshModules,
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

        {can(PERMISSIONS.MANTENIMIENTO.ACCEDER) && (
            <Pressable
              onPress={() => mantenimientoRoute
                ? router.push(mantenimientoRoute)
                : Alert.alert("Mantenimiento", "SAP autorizo este modulo, pero tu puesto aun no tiene una pantalla de Mantenimiento configurada.")}
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
                  Órdenes de servicio
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
                Registro y consulta de asistencias
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#64748B"
            />
          </Pressable>
        )}

        {!can(PERMISSIONS.MANTENIMIENTO.ACCEDER) && !can(PERMISSIONS.RRHH.ACCEDER) && (
          <View style={{ padding: 18, backgroundColor: "#FFFFFF", borderRadius: 12 }}>
            <Text style={{ color: "#0B1F3B", lineHeight: 21 }}>
              {moduleError || "Tu area y puesto no tienen modulos asignados."}
            </Text>
            <Pressable onPress={refreshModules} style={{ marginTop: 14 }}>
              <Text style={{ color: "#0B1F3B", fontWeight: "700" }}>Reintentar consulta</Text>
            </Pressable>
          </View>
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
  
});