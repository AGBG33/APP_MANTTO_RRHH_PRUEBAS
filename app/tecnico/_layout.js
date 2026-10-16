import React from "react";
import { Stack } from "expo-router";

import AccessGate from "../../src/core/permissions/AccessGate";
import { PERMISSIONS } from "../../src/core/permissions/catalog";

export default function TecnicoLayout() {
  return (
    <AccessGate
      permission={PERMISSIONS.MANTENIMIENTO.TECNICO_ACCEDER}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </AccessGate>
  );
}