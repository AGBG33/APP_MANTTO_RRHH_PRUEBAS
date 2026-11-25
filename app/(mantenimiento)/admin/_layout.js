import React from "react";
import { Stack } from "expo-router";
import AccessGate from "../../../src/shell/permissions/AccessGate";
import { PERMISSIONS } from "../../../src/core/permissions/catalog";

export default function AdminModuloLayout() {
  // Se protege el modulo; el rol administrador requiere una regla adicional de SAP.
  return <AccessGate permission={PERMISSIONS.MANTENIMIENTO.SUPERVISOR_ACCEDER}>
    <Stack screenOptions={{ headerShown: false }} />
  </AccessGate>;
}
