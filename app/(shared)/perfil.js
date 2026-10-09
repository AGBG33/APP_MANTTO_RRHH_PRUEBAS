import React from "react";
import { View, Text, StyleSheet, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../src/components/Header";
import { useAuth } from "../../src/context/AuthContext";
import Colors from "../../src/constants/colors";

export default function PerfilScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Header title="Mi perfil" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            {user?.photo ? (
              <Image
                source={{ uri: user.photo }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="person-circle-outline"
                size={96}
                color="#ff6868"
              />
            )}
          </View>

          <Text style={styles.name}>
            {user?.nombre || user?.name || "Usuario"}
          </Text>

          <Text style={styles.email}>
            {user?.correo || user?.email || user?.Email || "sin-correo@example.com"}
          </Text>

          <View style={styles.row}>
            <Text style={styles.label}>Rol:</Text>
            <Text style={styles.value}>{getNombreRol(user?.rol_id)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function getNombreRol(rolId) {
  switch (rolId) {
    case 1:
      return "Administrador";
    case 2:
      return "Supervisor";
    case 3:
      return "Técnico";
    default:
      return "Desconocido";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors?.background || "#f7f7f7",
  },
  scroll: {
    padding: 20,
    paddingBottom: 100,
    alignItems: "center",
  },
  card: {
    backgroundColor: Colors?.surface || "#fff",
    width: "100%",
    maxWidth: 600,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    marginTop: 16,
  },
  avatarWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 16,
    backgroundColor: "#F3F6FB",
    borderWidth: 1,
    borderColor: "#E6E9EF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    color: Colors?.primary || "#a10000",
    marginBottom: 6,
    textAlign: "center",
  },
  email: {
    fontSize: 15,
    color: Colors?.text || "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  row: {
    width: "100%",
    backgroundColor: Colors?.chip || "#f2f4f7",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    fontSize: 15,
    color: Colors?.textLight || "#666",
  },
  value: {
    fontSize: 15,
    color: Colors?.text || "#222",
    fontWeight: "600",
  },
});