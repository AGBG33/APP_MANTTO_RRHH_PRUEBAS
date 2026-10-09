// src/components/SideDrawer.js
import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Platform,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useDrawer } from "../context/DrawerContext";

const FIORI = {
  overlay: "rgba(0,0,0,0.35)",
  panelBg: "#FFFFFF",
  border: "#E6E9EF",
  ink: "#0B1F3B",
  muted: "#63718B",
  accent: "#0A6ED1",
  danger: "#EB5757",
  //viewer: "#7C3AED",
};

export default function SideDrawer() {
  const router = useRouter();
  const { open, closeDrawer } = useDrawer();
  const { user, logout } = useAuth();

  const homeRoute =
    user?.rol_id === 1
      ? "/admin"
      : user?.rol_id === 2
      ? "/supervisor"
      : "/tecnico";

  const slideX = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: open ? 0 : 320,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, slideX]);

  const handleGo = async (fn) => {
    closeDrawer();
    setTimeout(() => fn?.(), 120);
  };

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Deseas cerrar sesión?", [
      {
        text: "Cancelar",
        style: "cancel",
      },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: () =>
          handleGo(() => {
            logout?.();
          }),
      },
    ]);
  };

  const items = useMemo(
    () => [
      {
        key: "home",
        label: "Inicio",
        icon: "home-outline",
        onPress: () => router.push(homeRoute),
      },
      /*
      {
        key: "consulta",
        label: "Consultar órdenes",
        icon: "search-outline",
        viewer: true,
        onPress: () => router.push("/tecnico/consulta"),
      },
      */
      {
        key: "perfil",
        label: "Perfil",
        icon: "person-outline",
        onPress: () => router.push("/perfil"),
      },
      {
        key: "info",
        label: "Info",
        icon: "information-circle-outline",
        onPress: () => router.push("/info"),
      },
      {
        key: "diagnostico",
        label: "Diagnóstico",
        icon: "phone-portrait-outline",
        onPress: () => router.push("/diagnostico"),
      },
      {
        key: "logout",
        label: "Cerrar sesión",
        icon: "log-out-outline",
        danger: true,
        onPress: handleLogout,
      },
    ],
    [homeRoute, router]
  );

  const avatarSource = user?.photo ? { uri: user.photo } : null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={closeDrawer}
    >
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={closeDrawer} />

        <Animated.View
          style={[
            styles.panel,
            {
              transform: [
                {
                  translateX: slideX,
                },
              ],
            },
          ]}
        >
          <View style={styles.profile}>
            <View style={styles.avatarWrap}>
              {avatarSource ? (
                <Image
                  source={avatarSource}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons
                  name="person-circle-outline"
                  size={46}
                  color={FIORI.accent}
                />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.nombre || user?.name || "Usuario"}
              </Text>

              <Text style={styles.role} numberOfLines={1}>
                {user?.rol_id === 1
                  ? "Administrador"
                  : user?.rol_id === 2
                  ? "Supervisor"
                  : "Técnico"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {items.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={[
                styles.item,
                it.viewer && styles.itemViewer,
                it.danger && styles.itemDanger,
              ]}
              activeOpacity={0.75}
              onPress={() => handleGo(it.onPress)}
            >
              <Ionicons
                name={it.icon}
                size={22}
                color={
                  it.danger
                    ? FIORI.danger
                    : it.viewer
                    ? FIORI.viewer
                    : FIORI.ink
                }
                style={{ width: 28 }}
              />

              <Text
                style={[
                  styles.itemText,
                  it.viewer && styles.itemTextViewer,
                  it.danger && styles.itemTextDanger,
                ]}
              >
                {it.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: FIORI.overlay,
  },

  panel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: FIORI.panelBg,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    paddingTop: Platform.select({
      ios: 54,
      android: 40,
    }),
    paddingHorizontal: 16,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: {
          width: -4,
          height: 0,
        },
      },
      android: {
        elevation: 10,
      },
    }),
  },

  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
  },

  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F6FB",
    borderWidth: 1,
    borderColor: FIORI.border,
    overflow: "hidden",
  },

  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 18,
  },

  name: {
    fontSize: 16,
    fontWeight: "700",
    color: FIORI.ink,
  },

  role: {
    marginTop: 2,
    fontSize: 13,
    color: FIORI.muted,
  },

  divider: {
    height: 1,
    backgroundColor: FIORI.border,
    marginVertical: 10,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    paddingHorizontal: 10,
    marginBottom: 2,
  },

  /*itemViewer: {
    backgroundColor: "#F3EEFF",
  },*/

  itemText: {
    fontSize: 15,
    color: FIORI.ink,
    fontWeight: "600",
  },

  /*itemTextViewer: {
    color: FIORI.viewer,
    fontWeight: "800",
  },*/

  itemDanger: {
    backgroundColor: "rgba(235,87,87,0.08)",
  },

  itemTextDanger: {
    color: FIORI.danger,
    fontWeight: "800",
  },
});