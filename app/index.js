// app/index.js

import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "../src/context/AuthContext";
import { useOffline } from "../src/offline/OfflineProvider";
import { usePermissions } from "../src/core/permissions/usePermissions";
import { PERMISSIONS } from "../src/core/permissions/catalog";
import { bootstrapPrefetchOrdenesSupervisor } from "../src/offline/bootstrapSync";

export default function Index() {
  const { user, loading } = useAuth();
  const { dbReady, online } = useOffline();
  const { can } = usePermissions();

  const startedForUser = useRef(null);

  const canPrefetchSupervisor = can(
    PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER
  );

  const userKey = user?.id || user?.correo || null;

  useEffect(() => {
    if (!user) {
      startedForUser.current = null;
      return;
    }

    if (
      loading ||
      !dbReady ||
      !online ||
      !canPrefetchSupervisor ||
      !userKey
    ) {
      return;
    }

    if (startedForUser.current === userKey) {
      return;
    }

    startedForUser.current = userKey;

    bootstrapPrefetchOrdenesSupervisor().catch((error) => {
      if (startedForUser.current === userKey) {
        startedForUser.current = null;
      }

      console.log(
        "[BOOTSTRAP ORDENES ERROR]",
        error?.message || error
      );
    });
  }, [
    user,
    userKey,
    loading,
    dbReady,
    online,
    canPrefetchSupervisor,
  ]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#0B1F3B" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/inicio" />;
}