// src/components/Header.js

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { useRouter, useNavigation, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useDrawer } from "../context/DrawerContext";

const COLORS = {
  white: "#FFFFFF",
  primary: "#0B1F3B",
  border: "#E7ECF3",
  iconBg: "#F4F6F8",
};

const ROOT_ROUTES = ["/admin", "/supervisor", "/tecnico"];

export default function Header({ title }) {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const { toggleDrawer } = useDrawer();

  const isRoot = ROOT_ROUTES.includes(pathname);

  const handleBack = () => {
    if (isRoot) return;

    if (navigation.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/");
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.container}>

        {/* IZQUIERDA */}
        <View style={styles.side}>
          {!isRoot ? (
            <TouchableOpacity
              style={styles.circleButton}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          ) : (
            <Image
              source={require("../../assets/logo_header.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          )}
        </View>

        {/* CENTRO */}
        <View style={styles.center}>
          <Text
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>
        </View>

        {/* DERECHA */}
        <View style={styles.sideRight}>
          <TouchableOpacity
            style={styles.circleButton}
            onPress={toggleDrawer}
            activeOpacity={0.7}
          >
            <Ionicons
              name="menu-outline"
              size={24}
              color={COLORS.primary}
            />
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: COLORS.white,
  },

  container: {
    height: 70,

    backgroundColor: COLORS.white,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    paddingHorizontal: 24,

    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: {
          width: 0,
          height: 3,
        },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  side: {
    width: 60,
    justifyContent: "center",
    alignItems: "flex-start",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  sideRight: {
    width: 60,
    justifyContent: "center",
    alignItems: "flex-end",
  },

  logo: {
    width: 42,
    height: 42,
  },

  title: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
    textAlign: "center",
  },

  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,

    backgroundColor: COLORS.iconBg,

    justifyContent: "center",
    alignItems: "center",
  },
});