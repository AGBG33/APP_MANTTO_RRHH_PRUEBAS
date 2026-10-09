// app/tecnico/ordenes/[orderid]/aviso-averia.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

// ✅ En tu SDK, los métodos legacy se deben importar del legacy:
import * as LegacyFS from "expo-file-system/legacy";

import Header from "../../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../../../../src/context/AuthContext";
import NetInfo from "@react-native-community/netinfo";

import {
  fetchMetaAviso,
  fetchCatalogoCircunstancia,
  crearAvisoAveriaSap,
} from "../../../../src/services/avisoAveriaSap";

import { enqueueCrearAvisoAveria } from "../../../../src/offline/avisoAveriaOutbox";

const FIORI = {
  bg: "#F5F7FB",
  card: "#FFFFFF",
  border: "#D1D5DB",
  text: "#111827",
  textMuted: "#6B7280",
  primary: "#0A6ED1",
  danger: "#A10000",
};

async function isOnlineNow() {
  const st = await NetInfo.fetch();
  return !!st?.isConnected && st?.isInternetReachable !== false;
}

const Chip = ({ active, label, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
  </TouchableOpacity>
);

/**
 * ✅ Convierte un file:// a base64 usando la API legacy
 * - En tu Expo, readAsStringAsync desde "expo-file-system" ya no se permite.
 * - Usamos encoding: "base64" (string).
 */
async function uriToBase64(uri) {
  if (!uri) return null;

  const b64 = await LegacyFS.readAsStringAsync(uri, {
    encoding: "base64",
  });

  return b64 || null;
}

/**
 * ✅ Asegura file:// cuando el uri venga content:// (Android)
 */
async function ensureFileUri(uri, ext = "jpg") {
  if (!uri) return null;
  if (!uri.startsWith("content://")) return uri;

  const dest = `${LegacyFS.cacheDirectory}aviso_${Date.now()}.${ext}`;
  await LegacyFS.copyAsync({ from: uri, to: dest });
  return dest;
}

export default function AvisoAveriaSapScreen() {
  const params = useLocalSearchParams();

  const rawId =
    params.orderid ||
    params.id ||
    params.Orderid ||
    params.ordenId ||
    params.orderId ||
    null;

  const orderid = rawId ? String(rawId).trim() : null;

  const { token, user } = useAuth();
  const emailUsuario =
    String(user?.email || user?.correo || user?.preferred_username || "").trim() || null;

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  const [catR, setCatR] = useState([]);
  const [catS, setCatS] = useState([]);
  const [catT, setCatT] = useState([]);

  const [selR, setSelR] = useState([]);
  const [selS, setSelS] = useState(null);
  const [selT, setSelT] = useState([]);

  const [shortText, setShortText] = useState("");
  const [itemDescript, setItemDescript] = useState("");
  const [causaText, setCausaText] = useState("");
  const [piezaDescripcion, setPiezaDescripcion] = useState("");

  const [saving, setSaving] = useState(false);

  const [evidenceUri, setEvidenceUri] = useState(null);
  const [evidenceMeta, setEvidenceMeta] = useState(null);

  const [online, setOnline] = useState(true);
  const [catalogosDesdeCache, setCatalogosDesdeCache] = useState(false);

  useEffect(() => {
    let alive = true;

    const checkNetwork = async () => {
      const currentOnline = await isOnlineNow();
      if (alive) setOnline(currentOnline);
    };

    checkNetwork();

    const unsub = NetInfo.addEventListener((state) => {
      const currentOnline = !!(
        state?.isConnected && state?.isInternetReachable !== false
      );

      if (alive) setOnline(currentOnline);
    });

    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        console.log("[AVISO-AVERIA] params recibidos =", params);
        console.log("[AVISO-AVERIA] orderid resuelto =", orderid);

        if (!orderid || orderid === "undefined" || orderid === "null") {
          Alert.alert("Error", "No se recibió el identificador de la orden para crear el aviso.");
          if (alive) setLoading(false);
          return;
        }

        const currentlyOnline = await isOnlineNow();
        if (alive) {
          setOnline(currentlyOnline);
          setCatalogosDesdeCache(!currentlyOnline);
        }

        const [metaRes, r, s, t] = await Promise.all([
          fetchMetaAviso(orderid, token),
          fetchCatalogoCircunstancia("R", token),
          fetchCatalogoCircunstancia("S", token),
          fetchCatalogoCircunstancia("T", token),
        ]);

        if (!alive) return;

        setMeta(metaRes);
        setCatR(Array.isArray(r) ? r : []);
        setCatS(Array.isArray(s) ? s : []);
        setCatT(Array.isArray(t) ? t : []);
        setShortText("");
      } catch (e) {
        console.error("Error cargando aviso de avería:", e?.response?.data || e);
        Alert.alert("Error", e?.message || "No se pudo cargar la información del aviso.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderid, token]);

  const toggleMultiWithLimit = (prev, item, max = 2) => {
    const exists = prev.some((sel) => sel.Codigo === item.Codigo);
    if (exists) return prev.filter((sel) => sel.Codigo !== item.Codigo);
    if (prev.length >= max) {
      Alert.alert("Límite alcanzado", `Sólo puedes seleccionar hasta ${max} opciones en este grupo.`);
      return prev;
    }
    return [...prev, item];
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido", "Necesitas otorgar permiso de cámara para tomar una foto.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
        base64: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      let uri = asset?.uri;

      if (!uri) {
        Alert.alert("Error", "No se recibió la imagen de la cámara.");
        return;
      }

      // ✅ content:// -> file://
      uri = await ensureFileUri(uri, "jpg");

      // ✅ manipulación (sale como file://)
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );

      const finalUri = manipulated?.uri || uri;

      // ✅ Base64 por legacy (ya NO truena)
      const base64 = await uriToBase64(finalUri);
      if (!base64) {
        Alert.alert("Error", "No se pudo convertir la imagen a Base64.");
        return;
      }

      setEvidenceUri(finalUri);

      const fileName = `aviso_${String(orderid || "orden")}_${Date.now()}.jpg`;

      let sizeBytes = null;
      try {
        const info = await LegacyFS.getInfoAsync(finalUri);
        sizeBytes = info?.size ?? null;
      } catch {}

      setEvidenceMeta({
        fileName,
        mimeType: "image/jpeg",
        base64,
        sizeBytes,
      });

      console.log("[AVISO-AVERIA] evidenceUri =", finalUri);
      console.log("[AVISO-AVERIA] base64 length =", base64?.length);
      console.log("[AVISO-AVERIA] mimeType =", "image/jpeg");
      console.log("[AVISO-AVERIA] platform =", Platform.OS);
    } catch (e) {
      console.error("Error al tomar foto:", e);
      Alert.alert("Error", e?.message || "No se pudo abrir la cámara o convertir la imagen.");
    }
  };

  const onGuardar = async () => {
    if (saving) return;
    if (!meta) return;

    if (!shortText.trim())
      return Alert.alert("Falta información", "Captura la descripción breve (ShortText).");

    if (!piezaDescripcion.trim())
      return Alert.alert("Falta información", "Captura la descripción de la pieza.");

    if (!itemDescript.trim())
      return Alert.alert("Falta información", "Captura la descripción de la falla (Descript).");

    if (!causaText.trim())
      return Alert.alert("Falta información", "Captura el texto de causa.");

    if (!selR.length || !selS || !selT.length) {
      return Alert.alert(
        "Falta información",
        "Selecciona al menos un código de daño (R), una localización (S) y al menos una causa (T)."
      );
    }

    if (!emailUsuario) {
      return Alert.alert("Falta usuario", "No se encontró el email del usuario loggeado.");
    }

    if (!evidenceMeta?.base64) {
      return Alert.alert("Falta evidencia", "Toma una foto de evidencia para adjuntarla al aviso.");
    }

    const payload = {
      equipment: meta.Equipment,
      docNumber: meta.DocNumber,
      itmNumber: meta.ItmNumber,
      shortText: String(shortText || "").trim().slice(0, 40),
      itemDescript,
      piezaDescripcion,
      causaText,
      email: emailUsuario,
      piezaCircList: selR,
      lugarCirc: selS,
      causasCirc: selT,

      // ✅ Según tu JSON: DocId vacío
      Attachments: [
        {
          DocId: " ",
          FileName: evidenceMeta.fileName,
          MimeType: evidenceMeta.mimeType, // "image/jpeg"
          Base64: evidenceMeta.base64,
        },
      ],
    };

    try {
      setSaving(true);

      const online = await isOnlineNow();
      if (!online) {
        const r = await enqueueCrearAvisoAveria({ payload });
        if (r?.ok) {
          Alert.alert(
            "Guardado offline",
            "No hay conexión. El aviso quedó guardado en cola y se enviará automáticamente cuando regrese la red.",
            [{ text: "OK", onPress: () => router.back() }]
          );
        } else {
          Alert.alert("Error", "No se pudo guardar el aviso en la cola offline.");
        }
        return;
      }

      const res = await crearAvisoAveriaSap(payload, token);

      if (res?.ok) {
        const notifNo =
          res?.notifNo ||
          res?.raw?.NotifNo ||
          res?.raw?.NotificationNo ||
          (Array.isArray(res?.raw?.Return?.results)
            ? (() => {
                const msgs = res.raw.Return.results.map((x) => String(x?.Message || "")).join(" | ");
                const nums = msgs.match(/\d{6,}/g);
                return nums?.sort((a, b) => b.length - a.length)[0] || null;
              })()
            : null);

        const backendMsg = res?.sapMessage;
        const message =
          backendMsg && notifNo
            ? `${backendMsg}\nNo. de aviso: ${notifNo}`
            : backendMsg
            ? backendMsg
            : notifNo
            ? `Se creó el aviso en SAP.\nNo. de aviso: ${notifNo}`
            : "Se creó el aviso en SAP (no se recibió número de aviso).";

        Alert.alert("Aviso creado", message, [{ text: "OK", onPress: () => router.back() }]);
      } else {
        Alert.alert("Aviso no creado", res?.error || "Hubo un problema al crear el aviso en SAP.");
      }
    } catch (e) {
      console.error("Error al crear aviso de avería:", e?.response?.data || e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.sapMessage ||
        e?.message ||
        "No se pudo crear el aviso en SAP.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
        <Header title="Aviso de avería" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={FIORI.primary} />
          <Text style={{ marginTop: 10, color: FIORI.textMuted, fontWeight: "700" }}>
            Cargando información…
          </Text>
        </View>
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
        <Header title="Aviso de avería" />
        <View style={styles.center}>
          <Text style={{ color: FIORI.text }}>No se pudo obtener la información de la orden.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: FIORI.bg }}>
      <Header title="Aviso de avería" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <View style={styles.heroCard}>
          <View style={styles.heroInfoGrid}>
            <View style={styles.heroInfoBox}>
              <Text style={styles.heroInfoLabel}>Orden</Text>
              <Text style={styles.heroInfoValue}>#{meta.Orderid || orderid}</Text>
            </View>

            <View style={styles.heroInfoBox}>
              <Text style={styles.heroInfoLabel}>Equipo</Text>
              <Text style={styles.heroInfoValue}>{meta.Equipment || "—"}</Text>
            </View>
          </View>
        </View>

        {!online ? (
          <View style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeTitle}>Modo offline activo</Text>
            <Text style={styles.offlineNoticeText}>
              Puedes llenar el aviso. Si lo envías sin conexión, quedará guardado de forma local y se enviará cuando haya internet.
            </Text>
          </View>
        ) : catalogosDesdeCache ? (
          <View style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeTitle}>Catálogos desde caché</Text>
            <Text style={styles.offlineNoticeText}>
              Se están usando datos guardados previamente en el dispositivo.
            </Text>
          </View>
        ) : null}

        <Text style={styles.section}>Información general</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción breve</Text>

          <TextInput
            style={styles.input}
            value={shortText}
            onChangeText={(text) => setShortText(text.slice(0, 40))}
            maxLength={40}
            placeholder="Escribe una descripción breve"
            placeholderTextColor={FIORI.textMuted}
          />

          <Text style={styles.characterCounter}>
            {shortText.length}/40 caracteres
          </Text>

          <Text style={styles.label}>Descripción de la pieza</Text>
          <TextInput
            style={styles.input}
            value={piezaDescripcion}
            onChangeText={setPiezaDescripcion}
            placeholder="Describe la pieza afectada"
            placeholderTextColor={FIORI.textMuted}
          />
        </View>

        <Text style={styles.section}>Daño detectado</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Descripción de la falla</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            multiline
            value={itemDescript}
            onChangeText={setItemDescript}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>Código de daño (Catálogo = R) – máx 2</Text>

          <View style={styles.chipsWrap}>
            {catR.length === 0 ? (
              <Text style={styles.emptyCatalogText}>
                No hay códigos de daño disponibles. Abre la lista de órdenes una vez con internet para guardar el catálogo offline.
              </Text>
            ) : null}

            {catR.map((c) => {
              const isActive = selR.some((sel) => sel.Codigo === c.Codigo);
              return (
                <Chip
                  key={c.Codigo}
                  label={`${c.Codigo} - ${c.Descripcion}`}
                  active={isActive}
                  onPress={() => setSelR((prev) => toggleMultiWithLimit(prev, c, 2))}
                />
              );
            })}
          </View>
        </View>

        <Text style={styles.section}>Localización de la falla</Text>
        <View style={styles.card}>
          <View style={styles.chipsWrap}>
            {catS.length === 0 ? (
              <Text style={styles.emptyCatalogText}>
                No hay códigos de localización disponibles. Abre la lista de órdenes una vez con internet para guardar el catálogo offline.
              </Text>
            ) : null}

            {catS.map((c) => (
              <Chip
                key={c.Codigo}
                label={`${c.Codigo} - ${c.Descripcion}`}
                active={selS?.Codigo === c.Codigo}
                onPress={() => setSelS(c)}
              />
            ))}
          </View>
        </View>

        <Text style={styles.section}>Causa probable</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Texto de causa</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            multiline
            value={causaText}
            onChangeText={setCausaText}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>Código de causa (Catálogo = T) – máx 2</Text>

          <View style={styles.chipsWrap}>
            {catT.length === 0 ? (
              <Text style={styles.emptyCatalogText}>
                No hay causas disponibles. Abre la lista de órdenes una vez con internet para guardar el catálogo offline.
              </Text>
            ) : null}

            {catT.map((c) => {
              const isActive = selT.some((sel) => sel.Codigo === c.Codigo);
              return (
                <Chip
                  key={c.Codigo}
                  label={`${c.Codigo} - ${c.Descripcion}`}
                  active={isActive}
                  onPress={() => setSelT((prev) => toggleMultiWithLimit(prev, c, 2))}
                />
              );
            })}
          </View>
        </View>

        <Text style={styles.section}>Evidencia fotográfica</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleTakePhoto}>
            <Text style={styles.btnSecondaryText}>Tomar foto de evidencia</Text>
          </TouchableOpacity>

          {evidenceUri ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Foto capturada:</Text>
              <Image
                source={{ uri: evidenceUri }}
                style={{ width: "100%", height: 200, borderRadius: 12, marginTop: 6 }}
                resizeMode="cover"
              />
              <Text style={[styles.label, { marginTop: 8 }]}>
                {evidenceMeta?.sizeBytes != null
                  ? `Tamaño: ${Math.round(evidenceMeta.sizeBytes / 1024)} KB`
                  : ""}
              </Text>
            </View>
          ) : (
            <Text style={[styles.label, { marginTop: 8 }]}>Aún no se ha tomado ninguna foto.</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, saving && styles.btnPrimaryDisabled]}
          onPress={onGuardar}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {online ? "Crear aviso en SAP" : "Guardar aviso offline"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  section: {
    marginTop: 18,
    marginBottom: 2,
    fontSize: 15,
    fontWeight: "900",
    color: FIORI.text,
  },

  heroCard: {
    backgroundColor: FIORI.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },

  heroIconText: {
    color: FIORI.danger,
    fontSize: 24,
    fontWeight: "900",
  },

  heroTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: FIORI.text,
  },

  heroSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: FIORI.textMuted,
  },

  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },

  statusPillOnline: {
    backgroundColor: "#ECFDF3",
    borderColor: "#BBF7D0",
  },

  statusPillOffline: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },

  statusPillText: {
    fontSize: 11,
    fontWeight: "900",
  },

  statusPillTextOnline: {
    color: "#15803D",
  },

  statusPillTextOffline: {
    color: "#C2410C",
  },

  heroInfoGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  heroInfoBox: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  heroInfoLabel: {
    fontSize: 11,
    color: FIORI.textMuted,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  heroInfoValue: {
    marginTop: 4,
    fontSize: 14,
    color: FIORI.text,
    fontWeight: "900",
  },

  offlineNotice: {
    marginTop: 14,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 14,
    padding: 12,
  },

  offlineNoticeTitle: {
    color: "#9A3412",
    fontWeight: "900",
    fontSize: 13,
  },

  offlineNoticeText: {
    color: "#9A3412",
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },

  card: {
    backgroundColor: FIORI.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },

  label: { fontSize: 12, color: FIORI.textMuted, marginTop: 6 },
  value: { fontSize: 15, color: FIORI.text, fontWeight: "600" },

  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 15,
    color: FIORI.text,
    backgroundColor: "#F9FAFB",
    marginTop: 6,
    fontWeight: "600",
  },

  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },

  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },

  chipOn: {
    backgroundColor: FIORI.primary,
    borderColor: FIORI.primary,
  },

  chipText: { fontSize: 11, color: FIORI.text, fontWeight: "700" },
  chipTextOn: { color: "#FFFFFF" },

  emptyCatalogText: {
    width: "100%",
    color: FIORI.textMuted,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    fontWeight: "700",
  },

  btnPrimary: {
    marginTop: 22,
    backgroundColor: FIORI.danger,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: FIORI.danger,
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  btnPrimaryDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },

  btnSecondary: {
    backgroundColor: "#111827",
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: "center",
  },

  btnSecondaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  characterCounter: {
  marginTop: 5,
  fontSize: 11,
  fontWeight: "700",
  color: FIORI.textMuted,
  textAlign: "right",
},
});