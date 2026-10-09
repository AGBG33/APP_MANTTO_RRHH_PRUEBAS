// app/tecnico/ordenes/[id]/secciones/EncabezadoDetalleOrden.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FormatosOrdenMultiSelect from "./FormatosOrdenMultiSelect";

function normalizeCode(code) {
  if (code === null || code === undefined) return "";
  const s = String(code).trim();
  if (!s) return "";
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;
  return String(n).padStart(4, "0");
}

function resolveHeaderStatusLabel(code, fallback = "") {
  const c = normalizeCode(code);
  if (!c) return "Sin empezar";
  if (c === "0100") return "PENDIENTE";
  if (c === "0200") return "EN PROCESO";
  if (c === "0300") return "FINALIZADA";
  if (c === "0400") return "PENDIENTE DE FIRMA";
  if (c === "0600") return "Carta No Mantto";
  return String(fallback || c || "—").trim();
}

function formatText(value, formatValueForRow) {
  if (typeof formatValueForRow === "function") return formatValueForRow(value);
  if (value == null || value === "") return "—";
  return String(value);
}

const MiniInfo = ({ icon, label, value, FIORI, formatValueForRow }) => (
  <View style={local.miniInfo}>
    <View style={[local.miniIcon, { backgroundColor: FIORI.brandSoft }]}>
      <Ionicons name={icon} size={15} color={FIORI.brand} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={local.miniLabel}>{label}</Text>
      <Text style={local.miniValue} numberOfLines={1}>
        {formatText(value, formatValueForRow)}
      </Text>
    </View>
  </View>
);

const Banner = ({ icon, title, text, FIORI }) => (
  <View style={local.banner}>
    <View style={[local.bannerIcon, { backgroundColor: FIORI.brandSoft }]}>
      <Ionicons name={icon} size={18} color={FIORI.brand} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={local.bannerTitle}>{title}</Text>
      <Text style={local.bannerText}>{text}</Text>
    </View>
  </View>
);

export default function EncabezadoDetalleOrden({
  orden, id, styles, FIORI, estatusColor, isNoMant, checkinDone,
  isOrderFinished, direccionValor, allMaterialsLen, fmtDMY,
  formatValueForRow, onVerMaterialesOrden, orderStartedAtMs,
  orderFinishedAtMs, orderElapsedMs, fmtDateTimeLocal, msToHMS,
  statusCode: statusCodeProp, statusLabel: statusLabelProp,
  onOpenTbmky, onOpenNoMantto,
}) {
  const statusCode = normalizeCode(
    statusCodeProp || orden?.estatus_code || orden?.userstatus || "",
  );

  const statusLabel = resolveHeaderStatusLabel(
    statusCode,
    statusLabelProp || orden?.estatus_label || orden?.estatus || orden?.status,
  );

  const isCartaNoMantto = statusCode === "0600" || !!isNoMant;
  const isPendingFirma0400 = statusCode === "0400";
  const isFinished0300 = statusCode === "0300" || !!isOrderFinished;
  const canOpenTbmky = statusCode === "0100";
  const canOpenNoMantto = statusCode === "0100";
  const showServiceActions = canOpenTbmky || canOpenNoMantto;

  const correoCliente =
    String(
      orden?.cliente_email ||
      orden?.email_cliente ||
      orden?.mail_cliente ||
      orden?.Mail1 || "",
    ).trim() || null;

  const inicioSap =
    typeof fmtDMY === "function"
      ? fmtDMY(
          orden?.start_date || orden?.StartDate || orden?.startDate ||
          orden?.BasicStartDate || orden?.BasicStart,
        )
      : "—";

  const finSap =
    typeof fmtDMY === "function"
      ? fmtDMY(
          orden?.finish_date || orden?.FinishDate || orden?.finishDate ||
          orden?.BasicFinDate || orden?.BasicFinish,
        )
      : "—";

  return (
    <>
      <View style={local.headerBox}>
        <Text style={local.titulo} numberOfLines={1}>
          #{orden?.Orderid || id || ""} · {orden?.order_type || "—"}
        </Text>
        <View style={[local.statusBadge, { backgroundColor: estatusColor }]}>
          <Text style={local.statusBadgeText}>{statusLabel}</Text>
        </View>
      </View>

      {isCartaNoMantto && (
        <Banner
          icon="document-text-outline"
          title='Orden marcada como "Carta No Mantto"'
          text="Las operaciones se muestran solo como referencia y no se pueden iniciar."
          FIORI={FIORI}
        />
      )}

      {!isCartaNoMantto && isPendingFirma0400 && (
        <Banner
          icon="create-outline"
          title="Orden pendiente de firma"
          text="Puedes continuar el proceso para capturar firma y finalizar."
          FIORI={FIORI}
        />
      )}

      {!isCartaNoMantto && statusCode === "0100" && !isFinished0300 && (
        <View style={local.nextStepPanel}>
          <View style={local.nextStepTop}>
            <View style={[local.nextStepIcon, { backgroundColor: FIORI.brandSoft }]}>
              <Ionicons name="checkmark-circle-outline" size={19} color={FIORI.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.nextStepKicker}>SIGUIENTE PASO</Text>
              <Text style={local.nextStepTitle}>Check-in completado</Text>
            </View>
          </View>

          <View style={local.nextStepActions}>
            <TouchableOpacity
              style={[local.nextStepButton, { backgroundColor: FIORI.brand }]}
              onPress={onOpenTbmky}
              activeOpacity={0.88}
            >
              <Ionicons name="shield-checkmark-outline" size={17} color="#FFF" />
              <Text style={local.nextStepPrimaryText}>Realizar TBM/KY</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[local.nextStepButton, local.nextStepSecondary]}
              onPress={onOpenNoMantto}
              activeOpacity={0.88}
            >
              <Ionicons name="document-text-outline" size={17} color="#B42318" />
              <Text style={local.nextStepSecondaryText}>Carta No Mantto</Text>
              <Ionicons name="chevron-forward" size={16} color="#B42318" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isCartaNoMantto && !statusCode && !checkinDone && !isFinished0300 && (
        <Banner
          icon="lock-closed-outline"
          title="Operaciones bloqueadas"
          text="Primero debes realizar el Check-in."
          FIORI={FIORI}
        />
      )}

      {isFinished0300 && !isCartaNoMantto && (
        <Banner
          icon="checkmark-done-outline"
          title="Orden finalizada"
          text="Las operaciones se muestran solo como referencia."
          FIORI={FIORI}
        />
      )}

      <View style={local.panel}>
        <View style={local.cleanCard}>
          <MiniInfo
            icon="business-outline"
            label="Equipo"
            value={orden?.equipment || orden?.Equipment || orden?.EQUIPMENT}
            FIORI={FIORI}
            formatValueForRow={formatValueForRow}
          />
          <View style={local.divider} />
          <MiniInfo
            icon="mail-outline"
            label="Correo cliente"
            value={correoCliente}
            FIORI={FIORI}
            formatValueForRow={formatValueForRow}
          />
          <View style={local.divider} />

          <View style={local.dateRow}>
            <View style={local.dateItem}>
              <Ionicons name="calendar-outline" size={14} color={FIORI.brand} />
              <View>
                <Text style={local.dateLabel}>Inicio</Text>
                <Text style={local.dateValue}>{inicioSap}</Text>
              </View>
            </View>
            <View style={local.dateSeparator} />
            <View style={local.dateItem}>
              <Ionicons name="calendar-clear-outline" size={14} color={FIORI.brand} />
              <View>
                <Text style={local.dateLabel}>Fin</Text>
                <Text style={local.dateValue}>{finSap}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={local.addressCard}>
          <View style={local.addressHeader}>
            <Ionicons name="location-outline" size={15} color={FIORI.brand} />
            <Text style={local.addressLabel}>Dirección</Text>
          </View>
          <Text style={local.addressText}>
            {formatText(direccionValor, formatValueForRow)}
          </Text>
        </View>

        {(Number.isFinite(orderStartedAtMs) ||
          Number.isFinite(orderFinishedAtMs) ||
          Number.isFinite(orderElapsedMs)) && (
          <View style={local.timeBox}>
            <View style={local.timeHeader}>
              <Ionicons name="time-outline" size={15} color={FIORI.brand} />
              <Text style={local.timeTitle}>Registro local</Text>
            </View>

            {Number.isFinite(orderStartedAtMs) && (
              <Text style={local.timeText}>
                Inicio: {typeof fmtDateTimeLocal === "function" ? fmtDateTimeLocal(orderStartedAtMs) : "—"}
              </Text>
            )}
            {Number.isFinite(orderFinishedAtMs) && (
              <Text style={local.timeText}>
                Fin: {typeof fmtDateTimeLocal === "function" ? fmtDateTimeLocal(orderFinishedAtMs) : "—"}
              </Text>
            )}
            {Number.isFinite(orderElapsedMs) && (
              <Text style={local.timeText}>
                Tiempo: {typeof msToHMS === "function" ? msToHMS(orderElapsedMs) : "—"}
              </Text>
            )}
          </View>
        )}

        {allMaterialsLen > 0 && (
          <TouchableOpacity
            style={[local.btnSeeMaterials, { backgroundColor: FIORI.brand }]}
            onPress={onVerMaterialesOrden}
            activeOpacity={0.9}
          >
            <Ionicons name="cube-outline" size={15} color="#fff" />
            <Text style={local.btnSeeMaterialsText}>Ver materiales asignados</Text>
          </TouchableOpacity>
        )}
      </View>

      {showServiceActions && statusCode !== "0100" && (
        <View style={local.serviceActionsPanel}>
          <View style={local.serviceActionsHeader}>
            <View style={[local.serviceActionsIcon, { backgroundColor: FIORI.brandSoft }]}>
              <Ionicons name="options-outline" size={18} color={FIORI.brand} />
            </View>
            <Text style={local.serviceActionsTitle}>Acciones de servicio</Text>
          </View>

          <View style={local.serviceActionsRow}>
            {canOpenTbmky && (
              <TouchableOpacity
                style={[local.serviceActionButton, { backgroundColor: FIORI.brand }]}
                onPress={onOpenTbmky}
                activeOpacity={0.88}
              >
                <Ionicons name="shield-checkmark-outline" size={17} color="#FFF" />
                <Text style={local.serviceActionPrimaryText}>
                  {statusCode === "0200" ? "Ver TBM/KY" : "Realizar TBM/KY"}
                </Text>
                <Ionicons name="chevron-forward" size={15} color="#FFF" />
              </TouchableOpacity>
            )}

            {canOpenNoMantto && (
              <TouchableOpacity
                style={[local.serviceActionButton, local.serviceActionSecondary]}
                onPress={onOpenNoMantto}
                activeOpacity={0.88}
              >
                <Ionicons name="document-text-outline" size={17} color="#B42318" />
                <Text style={local.serviceActionSecondaryText}>Carta No Mantto</Text>
                <Ionicons name="chevron-forward" size={15} color="#B42318" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <FormatosOrdenMultiSelect FIORI={FIORI} orderid={orden?.Orderid || id} />

      <Text style={styles?.sectionKicker || local.sectionKicker}>
        Operaciones asignadas
      </Text>
    </>
  );
}

const local = StyleSheet.create({
  headerBox: {
    backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1,
    borderColor: "#DDE6F2", paddingHorizontal: 12, paddingVertical: 11,
    marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 8,
  },
  titulo: { flex: 1, fontSize: 16, fontWeight: "900", color: "#0B1F3B" },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, marginLeft: 6 },
  statusBadgeText: { color: "#FFF", fontWeight: "900", fontSize: 10 },

  banner: {
    flexDirection: "row", alignItems: "flex-start", padding: 10,
    borderRadius: 13, borderWidth: 1, borderColor: "#E8EEF7",
    backgroundColor: "#FFF", marginBottom: 9,
  },
  bannerIcon: {
    width: 34, height: 34, borderRadius: 11, alignItems: "center",
    justifyContent: "center", marginRight: 8,
  },
  bannerTitle: { fontSize: 13, fontWeight: "900", color: "#0B1F3B", marginBottom: 2 },
  bannerText: { fontSize: 11, lineHeight: 15, fontWeight: "700", color: "#63718B" },

  panel: {
    backgroundColor: "#FFF", borderRadius: 16, borderWidth: 1,
    borderColor: "#DDE6F2", padding: 10, marginBottom: 9,
  },
  cleanCard: {
    backgroundColor: "#F7F9FC", borderRadius: 14, borderWidth: 1,
    borderColor: "#E8EEF7", padding: 9,
  },
  miniInfo: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  miniIcon: {
    width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  miniLabel: {
    fontSize: 9.5, fontWeight: "900", color: "#63718B",
    textTransform: "uppercase", letterSpacing: 0.35,
  },
  miniValue: { marginTop: 1, fontSize: 12.5, fontWeight: "900", color: "#0B1F3B" },
  divider: { height: 1, backgroundColor: "#E3EAF4", marginVertical: 6 },

  dateRow: { flexDirection: "row", alignItems: "center", paddingTop: 1 },
  dateItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  dateSeparator: { width: 1, height: 30, backgroundColor: "#DDE6F2", marginHorizontal: 8 },
  dateLabel: { fontSize: 9.5, fontWeight: "900", color: "#63718B", textTransform: "uppercase" },
  dateValue: { marginTop: 1, fontSize: 12, fontWeight: "900", color: "#0B1F3B" },

  addressCard: {
    marginTop: 7, backgroundColor: "#FFF", borderRadius: 13,
    borderWidth: 1, borderColor: "#E8EEF7", padding: 9,
  },
  addressHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  addressLabel: {
    fontSize: 10, fontWeight: "900", color: "#63718B",
    textTransform: "uppercase", letterSpacing: 0.35,
  },
  addressText: { fontSize: 12, lineHeight: 16, fontWeight: "800", color: "#0B1F3B" },

  timeBox: {
    marginTop: 7, backgroundColor: "#FFF", borderRadius: 13,
    borderWidth: 1, borderColor: "#E8EEF7", padding: 9,
  },
  timeHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  timeTitle: { fontSize: 11, fontWeight: "900", color: "#0B1F3B" },
  timeText: { fontSize: 11, fontWeight: "800", color: "#63718B", marginTop: 2 },

  btnSeeMaterials: {
    marginTop: 8, alignSelf: "flex-start", flexDirection: "row",
    alignItems: "center", gap: 5, borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  btnSeeMaterialsText: { color: "#FFF", fontWeight: "900", fontSize: 11 },

  serviceActionsPanel: {
    backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1,
    borderColor: "#DDE6F2", padding: 10, marginBottom: 9,
  },
  serviceActionsHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8,
  },
  serviceActionsIcon: {
    width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  serviceActionsTitle: { fontSize: 13, fontWeight: "900", color: "#0B1F3B" },
  serviceActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  serviceActionButton: {
    flexGrow: 1, flexBasis: 150, minHeight: 40, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row",
    justifyContent: "center", alignItems: "center", gap: 6,
  },
  serviceActionSecondary: { backgroundColor: "#FFF6F5", borderWidth: 1, borderColor: "#F3C7C2" },
  serviceActionPrimaryText: {
    flex: 1, textAlign: "center", color: "#FFF", fontWeight: "900", fontSize: 11.5,
  },
  serviceActionSecondaryText: {
    flex: 1, textAlign: "center", color: "#B42318", fontWeight: "900", fontSize: 11.5,
  },

  nextStepPanel: {
    backgroundColor: "#EEF6FF", borderRadius: 15, borderWidth: 1.5,
    borderColor: "#0A6ED1", padding: 10, marginBottom: 9,
  },
  nextStepTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  nextStepIcon: {
    width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  nextStepKicker: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, color: "#0A6ED1" },
  nextStepTitle: { marginTop: 1, fontSize: 13, fontWeight: "900", color: "#0B1F3B" },
  nextStepActions: { gap: 7 },
  nextStepButton: {
    minHeight: 42, borderRadius: 11, paddingHorizontal: 11,
    paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 7,
  },
  nextStepSecondary: { backgroundColor: "#FFF6F5", borderWidth: 1, borderColor: "#F3C7C2" },
  nextStepPrimaryText: { flex: 1, color: "#FFF", fontSize: 12, fontWeight: "900" },
  nextStepSecondaryText: { flex: 1, color: "#B42318", fontSize: 12, fontWeight: "900" },

  sectionKicker: {
    fontSize: 11, color: "#63718B", textTransform: "uppercase",
    letterSpacing: 0.6, marginTop: 4, marginBottom: 6,
    paddingHorizontal: 3, fontWeight: "900",
  },
});