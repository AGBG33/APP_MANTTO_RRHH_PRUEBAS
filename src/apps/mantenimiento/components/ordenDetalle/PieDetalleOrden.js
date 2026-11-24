// app/ordenes/[id]/secciones/PieDetalleOrden.js
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Reglas actuales de estatus:
 * - Sin código: Sin empezar
 * - 0100: PENDIENTE
 * - 0200: EN PROCESO
 * - 0300: FINALIZADA
 * - 0400: PENDIENTE DE FIRMA
 * - 0600: Carta No Mantto
 */

function normalizeCode(code) {
  if (code === null || code === undefined) return "";

  const s = String(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

export default function PieDetalleOrden({
  FIORI,

  isNoMant,
  userRolId,

  finishingOrder,
  onFinalizarOrden,

  statusCode,

  finalizeMode = false,
  onCancelarFinalizacion,

  onGuardarPendiente,
  onAgregarFirma,
  hasSelectedOps = false,

  styleOverride,
}) {
  const status = normalizeCode(statusCode);

  const isCartaNoMantto0600 = status === "0600";
  const isSinEmpezar = !status;
  const isPendiente0100 = status === "0100";
  const isEnProceso0200 = status === "0200";
  const isFinalizada0300 = status === "0300";
  const isPendienteFirma0400 = status === "0400";

  // Carta No Mantto ya solo se identifica con 0600.
  if (isCartaNoMantto0600) return null;

  // Compatibilidad temporal por si llega cache viejo marcado como NO_MANTENIMIENTO.
  // Cuando confirmes que todo viene como 0600, puedes quitar esta línea.
  if (!!isNoMant) return null;

  // Solo técnico.
  if (Number(userRolId) !== 3) return null;

  // Bloqueos:
  // - Sin empezar: no puede finalizar.
  // - Pendiente 0100: todavía no puede finalizar.
  // - Finalizada 0300: ya no puede modificar.
  if (isSinEmpezar || isPendiente0100 || isFinalizada0300) return null;

  // Seguridad extra:
  // Solo debería aparecer para 0200 o 0400.
  if (!isEnProceso0200 && !isPendienteFirma0400) return null;

  const confirmCancel = () => {
    Alert.alert(
      "Cancelar finalización",
      "Se quitarán los checks marcados. El cronómetro seguirá normal. ¿Deseas continuar?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: () => onCancelarFinalizacion?.(),
        },
      ],
    );
  };

  const disabledBySelection = !hasSelectedOps || !!finishingOrder;

  const finishLabel = finishingOrder
    ? "Preparando…"
    : isPendienteFirma0400
      ? "Pendiente de firma (continuar)"
      : "Finalizar orden";

  return (
    <View style={[local.container, styleOverride]}>
      {finalizeMode ? (
        <View style={{ gap: 10 }}>
          <ActionButton
            icon="save-outline"
            label="Guardar pendiente de firma"
            onPress={onGuardarPendiente}
            disabled={disabledBySelection}
            style={[
              { backgroundColor: FIORI?.brand || "#0A6ED1" },
              disabledBySelection && local.disabled,
            ]}
          />

          <ActionButton
            icon="create-outline"
            label="Agregar firma del cliente"
            onPress={onAgregarFirma}
            disabled={disabledBySelection}
            style={[
              { backgroundColor: "#0B8457" },
              disabledBySelection && local.disabled,
            ]}
          />

          {!isPendienteFirma0400 ? (
            <ActionButton
              icon="close-circle-outline"
              label="Cancelar finalización"
              onPress={confirmCancel}
              disabled={!!finishingOrder}
              style={[
                { backgroundColor: FIORI?.err || "#E74C3C" },
                finishingOrder && local.disabled,
              ]}
            />
          ) : null}
        </View>
      ) : (
        <ActionButton
          icon="flag-outline"
          label={finishLabel}
          onPress={onFinalizarOrden}
          disabled={!!finishingOrder}
          style={[
            { backgroundColor: "#0B8457" },
            finishingOrder && local.disabled,
          ]}
        />
      )}
    </View>
  );
}

function ActionButton({ icon, label, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={disabled ? null : onPress}
      disabled={disabled}
      style={[local.btn, style]}
    >
      <Ionicons name={icon} size={18} color="#fff" style={{ marginRight: 10 }} />
      <Text style={local.btnText} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const local = StyleSheet.create({
  container: {
    paddingTop: 8,
  },

  btn: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },

  btnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
    flexShrink: 1,
  },

  disabled: {
    opacity: 0.6,
  },
});