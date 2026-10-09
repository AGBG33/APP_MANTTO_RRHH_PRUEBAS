// app/tecnico/ordenes/[orderid]/carta-no-mantenimiento.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import Header from "../../../src/components/Header";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../../../src/context/AuthContext";

import {
  fetchDatosNoMantenimiento,
  guardarCartaNoMantenimiento,
} from "../../../src/services/noMantenimiento";

import {
  setLocalStatusPatch,
  patchCacheOrdenesTecnicoList,
  patchCacheOrdenTecnicoDetail,
} from "../../../src/offline/ordenesTecnicoLocalPatch";

function Row({ label, value }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.readonlyText}>{String(value ?? "—")}</Text>
      </View>
    </View>
  );
}

const STATUS_CARTA_NO_MANTTO = "0600";

export default function CartaNoMantenimientoForm() {
  const { orderid } = useLocalSearchParams();
  const { user, ensureValidToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState(null);

  const [mesAfecto, setMesAfecto] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [saving, setSaving] = useState(false);

  const userEmail = String(
    user?.correo ||
      user?.email ||
      user?.username ||
      user?.preferred_username ||
      "unknown",
  ).trim();

  const fechaProgramadaDDMMYYYY = useMemo(() => {
    if (!datos?.StartDate) return "";

    const d = new Date(datos.StartDate);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();

    return `${dd}/${mm}/${yyyy}`;
  }, [datos]);

  const tecnicoAsignado = useMemo(() => {
    const nomina = user?.nomina || datos?.nomina || "";

    const nombre =
      user?.nombre || user?.name || datos?.nombre || datos?.Nombre || "";

    const full = `${nomina ? nomina + " - " : ""}${nombre}`.trim();

    return full || "—";
  }, [user, datos]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const d = await fetchDatosNoMantenimiento(String(orderid));

        if (!alive) return;

        setDatos(d);

        if (d?.StartDate) {
          const dt = new Date(d.StartDate);

          const meses = [
            "ENERO",
            "FEBRERO",
            "MARZO",
            "ABRIL",
            "MAYO",
            "JUNIO",
            "JULIO",
            "AGOSTO",
            "SEPTIEMBRE",
            "OCTUBRE",
            "NOVIEMBRE",
            "DICIEMBRE",
          ];

          setMesAfecto(`${meses[dt.getMonth()]} ${dt.getFullYear()}`);
        }
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "No se pudieron cargar los datos.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderid]);

  const patchLocalStatus0600 = async (orderId) => {
    try {
      await setLocalStatusPatch(userEmail, orderId, STATUS_CARTA_NO_MANTTO);
      await patchCacheOrdenesTecnicoList(
        userEmail,
        orderId,
        STATUS_CARTA_NO_MANTTO,
      );
      await patchCacheOrdenTecnicoDetail(orderId, STATUS_CARTA_NO_MANTTO);
    } catch (e) {
      console.log(
        "[CARTA NO MANTTO] Error actualizando cache local:",
        e?.message || e,
      );
    }
  };

  const onGuardar = async () => {
    if (saving) return;
    if (!datos) return;

    const descripcionTrim = descripcion.trim();

    if (!descripcionTrim) {
      return Alert.alert(
        "Falta información",
        "Captura la causa / descripción concreta.",
      );
    }

    const orderId = String(datos.Orderid || orderid || "").trim();

    if (!orderId) {
      return Alert.alert("Error", "No se pudo determinar el número de orden.");
    }

    const payload = {
      orderid: orderId,
      Orderid: orderId,

      equipment: datos.Equipment,
      fecha_programada: datos.StartDate,
      razon_social: datos.razon_social,
      direccion: datos.direccion,

      mecanico: {
        nomina: user?.nomina ?? datos.nomina,
        nombre: user?.nombre ?? user?.name ?? datos.nombre,
      },

      mes_afecto: mesAfecto,
      descripcion_concreta: descripcionTrim,

      // Nueva regla:
      // Carta No Mantto únicamente se identifica con 0600.
      estatus_code: STATUS_CARTA_NO_MANTTO,
      userstatus: STATUS_CARTA_NO_MANTTO,
      causa_code: STATUS_CARTA_NO_MANTTO,
      motivo_no_mantenimiento: descripcionTrim,
    };

    try {
      setSaving(true);

      const okToken = await ensureValidToken?.();

      if (okToken === false) {
        throw new Error("Token inválido");
      }

      /**
       * IMPORTANTE:
       * Ya NO hacemos POST directo a /api/odata desde aquí.
       * El backend /api/carta-no-mantenimiento debe ser quien mande el 0600 a SAP.
       */
      const result = await guardarCartaNoMantenimiento(payload);

      const sapOk = result?.sap?.ok !== false;

      if (sapOk) {
        await patchLocalStatus0600(orderId);

        Alert.alert(
          "Listo",
          `La orden #${orderId} fue marcada como NO MANTENIMIENTO`,
          [
            {
              text: "OK",
              onPress: () => router.replace("/tecnico/ordenes"),
            },
          ],
        );
      } else {
        console.log("[CARTA NO MANTTO] SAP respondió error:", result?.sap);

        Alert.alert(
          "Guardado con observación",
          `La carta se guardó, pero SAP no confirmó el cambio a 0600 para la orden #${orderId}. Revisa logs o intenta más tarde.`,
          [
            {
              text: "OK",
              onPress: () => router.replace("/tecnico/ordenes"),
            },
          ],
        );
      }
    } catch (e) {
      console.error(
        "[CARTA NO MANTTO] Error guardar:",
        e?.response?.data || e?.message || e,
      );

      Alert.alert("Error", "No se pudo guardar la carta de no mantenimiento.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!datos) {
    return (
      <View style={styles.center}>
        <Text>No hay datos para la orden.</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Header title="Carta No Mantto" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Datos de la orden</Text>

        <View style={styles.cardCompact}>
          <Row label="No. de orden" value={datos.Orderid} />
          <Row label="Equipo No" value={datos.Equipment} />
          <Row label="Fecha programada" value={fechaProgramadaDDMMYYYY} />
          <Row label="Razón social" value={datos.razon_social} />
          <Row label="Dirección" value={datos.direccion} />
          <Row label="Técnico asignado" value={tecnicoAsignado} />

          <Row label="Estatus que se enviará" value="Carta No Mantto" />
        </View>

        <Text style={styles.section}>Mes afectado</Text>

        <View style={styles.card}>
          <Text style={styles.label}>
            Afectó al mantenimiento correspondiente al mes de:
          </Text>

          <TextInput
            style={[styles.input, styles.inputReadonly]}
            value={mesAfecto}
            editable={false}
          />
        </View>

        <Text style={styles.section}>Causa / descripción concreta</Text>

        <View style={styles.card}>
          <Text style={styles.label}>
            Describe la causa por la cual no se realizó el mantenimiento:
          </Text>

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Escribe aquí la causa / descripción concreta..."
            placeholderTextColor="#9CA3AF"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.primary, saving && styles.primaryDisabled]}
          onPress={onGuardar}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>ENVIAR</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  scroll: {
    padding: 16,
    paddingBottom: 120,
  },

  section: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "800",
    color: "#1f2937",
  },

  cardCompact: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },

  label: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 4,
  },

  readonly: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
  },

  readonlyText: {
    fontSize: 13,
    color: "#111827",
  },

  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    fontSize: 14,
    color: "#111827",
  },

  inputReadonly: {
    backgroundColor: "#f3f4f6",
    color: "#4b5563",
  },

  textArea: {
    height: 160,
    textAlignVertical: "top",
  },

  primary: {
    marginTop: 20,
    backgroundColor: "#16a34a",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },

  primaryDisabled: {
    opacity: 0.6,
  },

  primaryText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
});
