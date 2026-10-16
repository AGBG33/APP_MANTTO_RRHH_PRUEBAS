// src/core/permissions/AccessGate.js

import React from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Redirect, router } from "expo-router";

import { usePermissions } from "./usePermissions";

export default function AccessGate({ permission, children }) {
  const { loading, isAuthenticated, can } = usePermissions();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0B1F3B" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!can(permission)) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Sin acceso</Text>

        <Text style={styles.description}>
          Tu cuenta no tiene permiso para acceder a este apartado.
        </Text>

        <Pressable
          onPress={() => router.replace("/inicio")}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F8",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0B1F3B",
  },
  description: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    color: "#64748B",
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#0B1F3B",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});