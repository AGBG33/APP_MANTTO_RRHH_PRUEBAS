// app/auth.js
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "../src/context/AuthContext";
import { API_URL } from "../src/services/api";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const { finishSSO } = useAuth();

  const ran = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        // Si Azure regresó access_denied (cancelación del usuario),
        // no se mostrará error: regresamos al login
        if (params?.error === "access_denied" && !params?.code) {
          await AsyncStorage.removeItem("sso_code_verifier");
          router.replace("/(auth)/login");
          return;
        }

        await finishSSO(params);
      } catch (e) {
        setError(e?.message ? String(e.message) : "No se pudo completar SSO");
      }
    })();
  }, [params, finishSSO]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
      {error ? (
        <>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Error de SSO</Text>
          <Text style={{ textAlign: "center", marginBottom: 12 }}>{error}</Text>

          <Text style={{ fontSize: 12, opacity: 0.7, textAlign: "center" }}>API_URL usada:</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", textAlign: "center" }}>{API_URL}</Text>
        </>
      ) : (
        <>
          <ActivityIndicator />
          <Text style={{ marginTop: 10 }}>Iniciando sesión...</Text>
        </>
      )}
    </View>
  );
}
