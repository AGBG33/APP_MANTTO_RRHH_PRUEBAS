import React from "react";
import { Stack } from "expo-router";

import AccessGate from "../../src/shell/permissions/AccessGate";
import { PERMISSIONS } from "../../src/core/permissions/catalog";

export default function RrhhLayout() {
  return (
    <AccessGate permission={PERMISSIONS.RRHH.ACCEDER}>
      <Stack screenOptions={{ headerShown: false }} />
    </AccessGate>
  );
}