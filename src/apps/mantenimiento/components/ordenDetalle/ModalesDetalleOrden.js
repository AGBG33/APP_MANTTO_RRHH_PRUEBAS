// app/ordenes/[id]/secciones/ModalesDetalleOrden.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  useWindowDimensions,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Signature from "react-native-signature-canvas";

export default function ModalesDetalleOrden({
  styles,
  FIORI,

  orden,
  allMaterials,

  showAllMaterialsModal,
  setShowAllMaterialsModal,

  showCompModal,
  closeComponentsModal,
  selectedOp,
  loadingComponents,
  compList,

  showSignModal,
  setShowSignModal,
  signatureRef,
  signatureData,
  setSignatureData,
  savingSignature,
  confirmarFinalizarConFirma,

  clienteEmail,
  setClienteEmail,
  isValidEmail,

  clienteNombre,
  setClienteNombre,
  clienteCargo,
  setClienteCargo,
  avisoCliente,
  setAvisoCliente,

  onPreviewPdfAntesFirma,
}) {
  const safeStr = (v) => String(v ?? "").trim();
  const { height: screenHeight } = useWindowDimensions();

  const isSmallDevice = screenHeight < 750;
  const modalCardHeight = isSmallDevice ? "95%" : "92%";
  const signatureHeight = isSmallDevice ? 260 : 320;

  const [showSignaturePadModal, setShowSignaturePadModal] = useState(false);

  useEffect(() => {
    if (!showSignModal) {
      setShowSignaturePadModal(false);
    }
  }, [showSignModal]);

  const titleOp = selectedOp
    ? safeStr(selectedOp.activity || selectedOp.Activity)
    : "";

  const closeSign = () => {
    if (savingSignature) return;
    setShowSignaturePadModal(false);
    setShowSignModal?.(false);
  };

  const closeSignaturePad = () => {
    if (savingSignature) return;
    setShowSignaturePadModal(false);
  };

  const emailInvalid =
    !!clienteEmail &&
    typeof isValidEmail === "function" &&
    !isValidEmail(clienteEmail);

  return (
    <>
      {/* ===== Modal TODOS materiales ===== */}
      <Modal
        visible={!!showAllMaterialsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAllMaterialsModal?.(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Materiales asignados a la orden
              </Text>
              <TouchableOpacity
                onPress={() => setShowAllMaterialsModal?.(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{
                maxHeight: 420,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              {!Array.isArray(allMaterials) || allMaterials.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 8 }}>
                  Esta orden no tiene materiales asignados desde SAP.
                </Text>
              ) : (
                allMaterials.map((m, idx) => {
                  const desc =
                    m.MatlDesc ||
                    m.ShortText ||
                    m.Material ||
                    "Sin descripción";
                  const qty = m.RequirementQuantity ?? m.Quantity ?? "—";
                  const unit =
                    m.RequirementQuantityUnitIso ||
                    m.RequirementQuantityUnit ||
                    m.Unit ||
                    "";

                  const key =
                    m.id ||
                    `${m.Orderid || orden?.Orderid || ""}-${
                      m.activity || m.Activity || ""
                    }-${m.Item || m.ResItem || idx}`;

                  return (
                    <View key={key} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc}</Text>
                        <Text style={styles.compSub}>
                          Cantidad: {qty} {unit}
                        </Text>

                        <Text style={styles.compMeta}>
                          Operación: {m.activity || m.Activity || "—"} · Item:{" "}
                          {m.Item || m.ResItem || "—"}
                        </Text>

                        <Text style={styles.compMeta}>
                          Centro: {m.Plant || "—"} · Almacén:{" "}
                          {m.StorageLocation || "—"}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={() => setShowAllMaterialsModal?.(false)}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal materiales por operación ===== */}
      <Modal
        visible={!!showCompModal}
        animationType="slide"
        transparent
        onRequestClose={closeComponentsModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Materiales · {titleOp}</Text>
              <TouchableOpacity
                onPress={closeComponentsModal}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{
                maxHeight: 420,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              {loadingComponents ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>
                  Cargando materiales…
                </Text>
              ) : !Array.isArray(compList) || compList.length === 0 ? (
                <Text style={{ color: FIORI.textMuted, marginTop: 12 }}>
                  No hay materiales asignados a esta operación.
                </Text>
              ) : (
                compList.map((c, idx) => {
                  const desc =
                    c.MatlDesc ||
                    c.ShortText ||
                    c.Material ||
                    "Sin descripción";
                  const qtyAsignada =
                    c.RequirementQuantity ?? c.Quantity ?? "—";
                  const unit =
                    c.RequirementQuantityUnitIso ||
                    c.RequirementQuantityUnit ||
                    c.Unit ||
                    "";

                  const key = `${c.Orderid || orden?.Orderid || ""}-${
                    c.Activity || c.activity || ""
                  }-${c.ResItem || c.Item || idx}`;

                  return (
                    <View key={key} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.compTitle}>{desc}</Text>
                        <Text style={styles.compSub}>
                          Cantidad asignada: {qtyAsignada} {unit}
                        </Text>

                        {!!(c.Plant || c.StorageLocation) && (
                          <Text style={styles.compMeta}>
                            Centro: {c.Plant || "—"} · Almacén:{" "}
                            {c.StorageLocation || "—"}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: FIORI.surfaceAlt }]}
                onPress={closeComponentsModal}
              >
                <Text style={styles.smallBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal principal: datos + estado firma ===== */}
      <Modal
        visible={!!showSignModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeSign}
      >
        <View style={signStyles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={signStyles.keyboardWrap}
          >
            <View style={[signStyles.card, { maxHeight: modalCardHeight }]}>
              <View style={signStyles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={signStyles.title}>Firma del cliente</Text>
                  <Text style={signStyles.subtitle}>
                    Completa los datos y abre la firma en la parte de abajo.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={closeSign}
                  style={[
                    signStyles.closeBtn,
                    savingSignature && { opacity: 0.7 },
                  ]}
                  disabled={!!savingSignature}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={18} color="#0B1F3B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={signStyles.content}
              >
                <View style={signStyles.infoBanner}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color="#0A6ED1"
                  />
                  <Text style={signStyles.infoBannerText}>
                    La firma se captura al tocar el botón{" "}
                    <Text style={{ fontWeight: "900" }}>
                      “Abrir recuadro de firma”
                    </Text>
                    .
                  </Text>
                </View>

                <Text style={signStyles.label}>
                  Correo del cliente (opcional)
                </Text>
                <TextInput
                  value={String(clienteEmail || "")}
                  onChangeText={setClienteEmail}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor="#63718B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={signStyles.input}
                />
                {emailInvalid ? (
                  <Text style={signStyles.emailError}>
                    Escribe un correo válido.
                  </Text>
                ) : null}

                <Text style={[signStyles.label, { marginTop: 12 }]}>
                  Nombre del cliente (obligatorio)
                </Text>
                <TextInput
                  value={String(clienteNombre || "")}
                  onChangeText={setClienteNombre}
                  placeholder="Nombre y apellidos"
                  placeholderTextColor="#63718B"
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={signStyles.input}
                />

                <Text style={[signStyles.label, { marginTop: 12 }]}>
                  Cargo (obligatorio)
                </Text>
                <TextInput
                  value={String(clienteCargo || "")}
                  onChangeText={setClienteCargo}
                  placeholder="Ej: Administrador, Seguridad, Mantenimiento..."
                  placeholderTextColor="#63718B"
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={signStyles.input}
                />

                <Text style={[signStyles.label, { marginTop: 12 }]}>
                  Aviso al cliente (opcional)
                </Text>
                <TextInput
                  value={String(avisoCliente || "")}
                  onChangeText={setAvisoCliente}
                  placeholder="Mensaje opcional que se insertará en el PDF"
                  placeholderTextColor="#63718B"
                  multiline
                  style={[signStyles.input, signStyles.textArea]}
                />

                <View style={signStyles.signatureSummaryCard}>
                  <View style={signStyles.signatureSummaryTop}>
                    <View>
                      <Text style={signStyles.signatureTitle}>
                        Firma del cliente
                      </Text>
                    </View>

                    <View
                      style={[
                        signStyles.statusPill,
                        signatureData
                          ? signStyles.statusPillOk
                          : signStyles.statusPillPending,
                      ]}
                    >
                      <Ionicons
                        name={
                          signatureData
                            ? "checkmark-circle"
                            : "alert-circle-outline"
                        }
                        size={14}
                        color={signatureData ? "#0B8457" : "#63718B"}
                      />
                      <Text
                        style={[
                          signStyles.statusPillText,
                          { color: signatureData ? "#0B8457" : "#63718B" },
                        ]}
                      >
                        {signatureData ? "Firma capturada" : "Pendiente"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={signStyles.previewPdfBtn}
                    activeOpacity={0.9}
                    onPress={onPreviewPdfAntesFirma}
                    disabled={!!savingSignature}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color="#0A6ED1"
                    />
                    <Text style={signStyles.previewPdfBtnText}>
                      Visualizar datos antes de firmar
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={signStyles.openSignatureBtn}
                    activeOpacity={0.9}
                    onPress={() => setShowSignaturePadModal(true)}
                    disabled={!!savingSignature}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={signStyles.openSignatureBtnText}>
                      {signatureData
                        ? "Volver a firmar"
                        : "Abrir recuadro de firma"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={signStyles.footer}>
                <TouchableOpacity
                  style={[
                    signStyles.secondaryBtn,
                    savingSignature && { opacity: 0.7 },
                  ]}
                  onPress={closeSign}
                  disabled={!!savingSignature}
                  activeOpacity={0.9}
                >
                  <Text style={signStyles.secondaryText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    signStyles.primaryBtn,
                    savingSignature && { opacity: 0.7 },
                  ]}
                  activeOpacity={0.9}
                  onPress={confirmarFinalizarConFirma}
                  disabled={!!savingSignature}
                >
                  <Ionicons name="flag-outline" size={18} color="#fff" />
                  <Text style={signStyles.primaryText}>
                    {savingSignature ? "Guardando…" : "Finalizar orden"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ===== Modal secundario: solo firma ===== */}
      <Modal
        visible={showSignaturePadModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeSignaturePad}
      >
        <View style={signPadStyles.backdrop}>
          <View style={signPadStyles.card}>
            <View style={signPadStyles.header}>
              <View style={{ flex: 1 }}>
                <Text style={signPadStyles.title}>Capturar firma</Text>
                <Text style={signPadStyles.subtitle}>
                  El cliente debe firmar dentro del recuadro.
                </Text>
              </View>

              <TouchableOpacity
                onPress={closeSignaturePad}
                style={signPadStyles.closeBtn}
                disabled={!!savingSignature}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color="#0B1F3B" />
              </TouchableOpacity>
            </View>

            <View
              style={[signPadStyles.signatureBox, { height: signatureHeight }]}
            >
              <Signature
                ref={signatureRef}
                onOK={(sig) => {
                  setSignatureData?.(sig);
                  setShowSignaturePadModal(false);
                }}
                onClear={() => setSignatureData?.(null)}
                onEmpty={() => setSignatureData?.(null)}
                autoClear={false}
                descriptionText="Firme aquí"
                clearText="Limpiar"
                confirmText="Listo"
                webStyle={`
                  html, body {
                    height: 100%;
                    width: 100%;
                    margin: 0;
                    padding: 0;
                    background: #fff;
                    overflow: hidden;
                  }
                  .m-signature-pad {
                    box-shadow: none;
                    border: none;
                    height: 100% !important;
                    width: 100% !important;
                    display: flex;
                    flex-direction: column;
                    background: #fff;
                  }
                  .m-signature-pad--body {
                    flex: 1;
                    border: 0;
                    height: auto !important;
                    min-height: 0 !important;
                    background: #fff;
                  }
                  .m-signature-pad--footer {
                    height: 58px !important;
                    display: flex !important;
                    flex-direction: row !important;
                    justify-content: center !important;
                    align-items: center !important;
                    gap: 12px !important;
                    padding: 8px 10px !important;
                    border-top: 1px solid #E8EEF7;
                    box-sizing: border-box;
                    background: #FAFBFD;
                  }
                  .m-signature-pad--footer .description {
                    display: none !important;
                  }
                  .m-signature-pad--footer .button {
                    min-width: 92px !important;
                    height: 38px !important;
                    line-height: 38px !important;
                    padding: 0 14px !important;
                    border-radius: 10px !important;
                    border: 0 !important;
                    box-shadow: none !important;
                    float: none !important;
                    position: static !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    margin: 0 !important;
                  }
                  .m-signature-pad--footer .button.clear {
                    background: #EEF2F7 !important;
                    color: #24364B !important;
                  }
                  .m-signature-pad--footer .button.save {
                    background: #0A6ED1 !important;
                    color: #fff !important;
                  }
                  canvas {
                    width: 100% !important;
                    height: 100% !important;
                    touch-action: none !important;
                    background: #fff !important;
                  }
                `}
              />
            </View>

            <View style={signPadStyles.bottomInfo}>
              <Ionicons
                name={signatureData ? "checkmark-circle" : "create-outline"}
                size={14}
                color={signatureData ? "#0B8457" : "#63718B"}
              />
              <Text style={signPadStyles.bottomInfoText}>
                {signatureData
                  ? "Ya hay una firma capturada. Puedes reemplazarla si vuelves a firmar."
                  : "Presiona “Listo” dentro del recuadro cuando el cliente termine."}
              </Text>
            </View>

            <View style={signPadStyles.footer}>
              <TouchableOpacity
                style={signPadStyles.secondaryBtn}
                onPress={closeSignaturePad}
                disabled={!!savingSignature}
                activeOpacity={0.9}
              >
                <Text style={signPadStyles.secondaryText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const signStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },

  keyboardWrap: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },

  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },

  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#FFFFFF",
  },

  title: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#63718B",
    fontWeight: "700",
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },

  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F3F8FF",
    borderWidth: 1,
    borderColor: "#D8E9FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },

  infoBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#32506B",
    fontWeight: "700",
  },

  label: {
    color: "#0B1F3B",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#F7F9FC",
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 9,
    fontSize: 14,
    color: "#0B1F3B",
  },

  textArea: {
    minHeight: 66,
    maxHeight: 90,
    textAlignVertical: "top",
  },

  emailError: {
    color: "#E74C3C",
    fontWeight: "900",
    fontSize: 12,
    marginTop: 4,
  },

  signatureSummaryCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 14,
    backgroundColor: "#FBFCFE",
    padding: 12,
  },

  signatureSummaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  signatureTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  signatureHint: {
    marginTop: 2,
    fontSize: 11,
    color: "#63718B",
    fontWeight: "700",
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },

  statusPillOk: {
    backgroundColor: "#ECF9F2",
    borderColor: "#BEE7D1",
  },

  statusPillPending: {
    backgroundColor: "#F6F8FB",
    borderColor: "#DDE6F2",
  },

  statusPillText: {
    fontSize: 11,
    fontWeight: "900",
  },

  openSignatureBtn: {
    marginTop: 12,
    backgroundColor: "#0A6ED1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  openSignatureBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  previewPdfBtn: {
    marginTop: 10,
    backgroundColor: "#EAF4FF",
    borderWidth: 1,
    borderColor: "#0A6ED1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  previewPdfBtnText: {
    color: "#0A6ED1",
    fontWeight: "900",
    fontSize: 14,
  },

  signatureHelpText: {
    marginTop: 8,
    fontSize: 11,
    color: "#63718B",
    fontWeight: "700",
  },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
  },

  secondaryBtn: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryText: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 14,
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: "#0B8457",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  primaryText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
});

const signPadStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  card: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 7 },
      default: {},
    }),
  },

  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF7",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#FFFFFF",
  },

  title: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B1F3B",
  },

  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#63718B",
    fontWeight: "700",
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    alignItems: "center",
    justifyContent: "center",
  },

  signatureBox: {
    margin: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  bottomInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },

  bottomInfoText: {
    flex: 1,
    fontSize: 11,
    color: "#63718B",
    fontWeight: "700",
    lineHeight: 16,
  },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    backgroundColor: "#FFFFFF",
  },

  secondaryBtn: {
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryText: {
    color: "#0B1F3B",
    fontWeight: "900",
    fontSize: 14,
  },
});
