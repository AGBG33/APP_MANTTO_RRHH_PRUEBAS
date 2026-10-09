// app/login/index.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { router } from "expo-router";

const COLORS = {
  bg: "#F3F4F6",
  white: "#FFFFFF",
  text: "#1B1F3B",
  muted: "#7B8494",
  softMuted: "#A0A7B4",
  border: "#D8DEE8",
  red: "#E60012",
  danger: "#D92D20",
  shadow: "#000000",
};

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

const BRAND = {
  customer: "Mitsubishi Electric de México",
};

export default function LoginScreen() {
  const { user, loginSSO, loading } = useAuth();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user) router.replace(pickHomeByRole(user.rol_id));
  }, [user]);

  const handleLoginSSO = async () => {
    setError("");
    setSending(true);

    try {
      const result = await loginSSO();

      if (result?.ok === false && result?.cancelled) {
        setError("");
        return;
      }
    } catch (e) {
      console.log("SSO error:", e?.message || e);
      setError(
        e?.message
          ? String(e.message)
          : "No se pudo iniciar sesión con Microsoft"
      );
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || loading;
  const year = new Date().getFullYear();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* fondo decorativo */}
      <View style={styles.bgTopShape} />
      <View style={styles.bgBottomCircle} />

      <View style={styles.content}>
        <View style={styles.brandWrap}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Iniciar sesión</Text>
          <View style={styles.titleAccent} />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text style={styles.helper}>
              Inicia sesión con tu correo corporativo
            </Text>
          )}

          <TouchableOpacity
            onPress={handleLoginSSO}
            style={[styles.msButton, disabled && styles.disabledButton]}
            disabled={disabled}
            activeOpacity={0.86}
          >
            {sending ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <MicrosoftIcon />
            )}

            <Text style={styles.msButtonText}>
              {sending ? "Abriendo Microsoft..." : "Continuar con Microsoft"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerDivider} />

        <View style={styles.developerRow}>
          <Text style={styles.footerLine1}>Desarrollado por</Text>
          <Image
            source={require("../../assets/tellus_logo.png")}
            style={styles.footerLogo}
          />
        </View>

        <Text style={styles.footerLine2}>
          © {year} {BRAND.customer}. Todos los derechos reservados.
        </Text>
      </View>
    </View>
  );
}

function MicrosoftIcon() {
  return (
    <View style={styles.msIcon}>
      <View style={[styles.msSquare, { backgroundColor: "#F25022" }]} />
      <View style={[styles.msSquare, { backgroundColor: "#7FBA00" }]} />
      <View style={[styles.msSquare, { backgroundColor: "#00A4EF" }]} />
      <View style={[styles.msSquare, { backgroundColor: "#FFB900" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 16 : 10,
    paddingBottom: 16,
    overflow: "hidden",
  },

  bgTopShape: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 420,
    height: 320,
    borderBottomRightRadius: 220,
    borderBottomLeftRadius: 120,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    backgroundColor: "#FFFFFF",
    opacity: 0.35,
  },

  bgBottomCircle: {
    position: "absolute",
    right: -180,
    bottom: 140,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "#FFFFFF",
    opacity: 0.3,
    borderWidth: 1,
    borderColor: "#E9EDF2",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 36,
  },

  brandWrap: {
    alignItems: "center",
    marginBottom: 34,
  },

  logo: {
    width: 230,
    height: 120,
    resizeMode: "contain",
  },

  card: {
    width: "100%",
    maxWidth: 390,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 6,
      },
    }),
  },

  title: {
    fontSize: 25,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },

  titleAccent: {
    width: 48,
    height: 4,
    borderRadius: 99,
    backgroundColor: COLORS.red,
    marginTop: 12,
    marginBottom: 24,
  },

  helper: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: 24,
  },

  error: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.danger,
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 20,
  },

  msButton: {
    width: "100%",
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  disabledButton: {
    opacity: 0.72,
  },

  msIcon: {
    width: 24,
    height: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    marginRight: 12,
  },

  msSquare: {
    width: 10,
    height: 10,
    margin: 1,
  },

  msButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },

  footer: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: Platform.OS === "ios" ? 8 : 2,
  },

  footerDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#D9DEE7",
    marginBottom: 18,
  },

  developerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  footerLine1: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "600",
    marginRight: 8,
  },

  footerLogo: {
    width: 34,
    height: 18,
    resizeMode: "contain",
  },

  footerLine2: {
    fontSize: 10.5,
    color: COLORS.softMuted,
    textAlign: "center",
    lineHeight: 15,
  },
});