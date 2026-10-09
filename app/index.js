// app/index.js
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useOffline } from "../src/offline/OfflineProvider"; // tu provider
import { bootstrapPrefetchOrdenesSupervisor } from "../src/offline/bootstrapSync";

function pickHomeByRole(rol_id) {
  if (rol_id === 1) return "/admin";
  if (rol_id === 2) return "/supervisor";
  return "/tecnico";
}

export default function Index() {
  const { user, loading } = useAuth();
  const { dbReady, online } = useOffline();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (!user) return;
    if (!dbReady) return;

    ran.current = true;

    (async () => {
      try {
        if (online) {
          const r = await bootstrapPrefetchOrdenesSupervisor();
          console.log("[BOOTSTRAP ORDENES]", r);
        } else {
          console.log("[BOOTSTRAP ORDENES] sin internet");
        }
      } catch (e) {
        console.log("[BOOTSTRAP ORDENES ERROR]", e?.message || e);
      }
    })();
  }, [user, dbReady, online]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return <Redirect href={pickHomeByRole(user.rol_id)} />;
}
