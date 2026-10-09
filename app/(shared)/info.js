import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";

import Header from "../../src/components/Header";
import Colors from "../../src/constants/colors";

export default function InfoScreen() {
  const version =
    Application.nativeApplicationVersion || "N/D";

  const build =
    Application.nativeBuildVersion || "N/D";

  const packageName =
    Application.applicationId || "";

  let ambiente = "DESARROLLO";
  let ambienteColor = "#2563EB";
  let ambienteIcon = "code-slash-outline";

  if (packageName === "host.exp.exponent") {
    ambiente = "EXPO GO";
    ambienteColor = "#2563EB";
    ambienteIcon = "logo-react";
  } else if (
    packageName === "com.guadalub130.mitsu_frontend"
  ) {
    ambiente = "PRODUCCIÓN";
    ambienteColor = "#16A34A";
    ambienteIcon = "checkmark-circle";
  } else if (
    packageName === "com.melmex.qas"
  ) {
    ambiente = "CALIDAD (QAS)";
    ambienteColor = "#D97706";
    ambienteIcon = "flask";
  }

  return (
    <View style={styles.container}>
      <Header title="Información de la aplicación" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.logoCard}>
          <Ionicons
            name="phone-portrait-outline"
            size={60}
            color="#a10000"
          />

          <Text style={styles.appName}>
            Melmex App
          </Text>

          <Text style={styles.appSubtitle}>
            Aplicación de mantenimiento
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Información general
          </Text>

          <InfoRow
            icon="layers-outline"
            label="Versión"
            value={version}
          />

          <InfoRow
            icon="build-outline"
            label="Build"
            value={build}
          />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons
                name={ambienteIcon}
                size={20}
                color={ambienteColor}
              />

              <Text style={styles.label}>
                Ambiente
              </Text>
            </View>

            <Text
              style={[
                styles.value,
                { color: ambienteColor },
              ]}
            >
              {ambiente}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Soporte
          </Text>

          <InfoRow
            icon="business-outline"
            label="Empresa"
            value="Mitsubishi Electric"
          />

          <InfoRow
            icon="shield-checkmark-outline"
            label="Estado"
            value="Operativo"
          />
        </View>

        <Text style={styles.footer}>
          © Mitsubishi Electric
        </Text>

        <Text style={styles.footerVersion}>
          Melmex App v{version}
        </Text>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon}
          size={20}
          color="#666"
        />

        <Text style={styles.label}>
          {label}
        </Text>
      </View>

      <Text
        style={styles.value}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      Colors?.background || "#f7f7f7",
  },

  scroll: {
    padding: 20,
    paddingBottom: 100,
  },

  logoCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,

    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowRadius: 8,
    elevation: 2,
  },

  appName: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "700",
    color: "#a10000",
  },

  appSubtitle: {
    marginTop: 4,
    color: "#777",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,

    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowRadius: 8,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
    color: "#222",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  label: {
    marginLeft: 10,
    fontSize: 15,
    color: "#555",
  },

  value: {
    flex: 1,
    textAlign: "right",
    marginLeft: 20,
    color: "#222",
    fontWeight: "600",
    fontSize: 14,
  },

  footer: {
    marginTop: 10,
    textAlign: "center",
    color: "#777",
    fontSize: 13,
  },

  footerVersion: {
    marginTop: 5,
    textAlign: "center",
    color: "#999",
    fontSize: 12,
  },
});