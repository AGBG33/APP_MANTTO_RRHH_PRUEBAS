// app/notificaciones/[id].js
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import Header from '../../src/components/Header';
import { useNotificaciones } from '../../src/context/NotificacionesContext';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api'; // 👈 asumo que ya lo usas en tu app

const FIORI = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  cardSubtle: '#F5F7FA',
  border: '#DDE6F2',
  ink: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',
  accentSoft: '#E3F2FD',
  danger: '#EB5757',
};

// 👉 Fetch “online” del detalle (cámbialo a tu endpoint real si difiere)
async function fetchNotificationDetail(token, id) {
  if (!id) return null;

  // Si tu api.js ya inyecta token, puedes quitar headers.
  // Ajusta la ruta según tu backend:
  // Ejemplos comunes:
  //   /api/notificaciones/:id
  //   /api/avisos/:id
  //   /api/notificaciones/detalle/:id
  const { data } = await api.get(`/api/notificaciones/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  // Acepta varias formas de respuesta
  return data?.data ?? data?.result ?? data ?? null;
}

export default function NotificacionDetalle() {
  const { id } = useLocalSearchParams();
  const { notificaciones, marcarComoLeida } = useNotificaciones();
  const { token } = useAuth();

  const [notificacion, setNotificacion] = useState(null);
  const [loading, setLoading] = useState(true);

  const notifId = useMemo(() => (id ? id.toString() : ''), [id]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // 1) intenta desde el contexto (lista ya cargada)
        let encontrada =
          notificaciones?.find((n) => n?.NotifNo?.toString() === notifId) ?? null;

        // 2) si no está, pide al backend (online)
        if (!encontrada) {
          encontrada = await fetchNotificationDetail(token, notifId);
        }

        if (!mounted) return;

        setNotificacion(encontrada);

        // 3) marcar como leída (si aplica)
        if (encontrada?.NotifNo && !encontrada?.leida) {
          await marcarComoLeida(encontrada.NotifNo);
        }
      } catch (e) {
        console.log('Error detalle notificación:', e?.message || e);
        Alert.alert('Error', 'No se pudo cargar el detalle de la notificación.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [notifId, notificaciones, token]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={FIORI.accent} />
        <Text style={styles.text}>Cargando notificación...</Text>
      </View>
    );
  }

  if (!notificacion) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={26} color={FIORI.textMuted} />
        <Text style={[styles.text, { marginTop: 10 }]}>
          No se encontró la notificación.
        </Text>
        <TouchableOpacity
          style={[styles.botonOrden, { marginTop: 16 }]}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back-outline" size={20} color="#fff" />
          <Text style={styles.botonTexto}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Detalle de notificación" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Título */}
        <Text style={styles.title}>
          <Ionicons name="document-text-outline" size={20} color={FIORI.accent} />{' '}
          <Text style={styles.titleText}>
            {notificacion.ShortText || 'Sin título'}
          </Text>
        </Text>

        {/* Datos principales */}
        <View style={styles.sectionBox}>
          <View style={styles.leftStripe} />
          <View style={{ flex: 1 }}>
            <LabelValue label="Tipo" value={notificacion.NotifType} />
            <LabelValue label="Planta" value={notificacion.Planplant} />
            <LabelValue label="Equipo" value={notificacion.Equipment} />
            <LabelValue
              label="Fecha"
              value={
                notificacion.NotifDate
                  ? new Date(notificacion.NotifDate).toLocaleString()
                  : 'No disponible'
              }
            />
          </View>
        </View>

        {/* Items */}
        {Array.isArray(notificacion.items) && notificacion.items.length > 0 && (
          <View style={styles.sectionBox}>
            <View style={styles.leftStripeSoft} />
            <Text style={styles.sectionTitle}>
              <Ionicons name="list-outline" size={18} color={FIORI.ink} /> Items
            </Text>
            {notificacion.items.map((item, idx) => (
              <Text key={idx} style={styles.value}>
                • {item?.Descript || item?.descript || '—'}
              </Text>
            ))}
          </View>
        )}

        {/* Actividades */}
        {Array.isArray(notificacion.activities) && notificacion.activities.length > 0 && (
          <View style={styles.sectionBox}>
            <View style={styles.leftStripeSoft} />
            <Text style={styles.sectionTitle}>
              <Ionicons name="time-outline" size={18} color={FIORI.ink} /> Actividades
            </Text>
            {notificacion.activities.map((act, idx) => (
              <Text key={idx} style={styles.value}>
                • {act?.Acttext || act?.acttext || '—'}{' '}
                {act?.StartDate || act?.EndDate ? `(${act?.StartDate || '—'} a ${act?.EndDate || '—'})` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Partners */}
        {Array.isArray(notificacion.partners) && notificacion.partners.length > 0 && (
          <View style={styles.sectionBox}>
            <View style={styles.leftStripeSoft} />
            <Text style={styles.sectionTitle}>
              <Ionicons name="people-outline" size={18} color={FIORI.ink} /> Partners
            </Text>
            {notificacion.partners.map((p, idx) => (
              <Text key={idx} style={styles.value}>
                • {(p?.PartnRole || p?.role || 'Rol')}:{' '}
                {(p?.Partner || p?.partner || '—')}
              </Text>
            ))}
          </View>
        )}

        {/* CTA Orden */}
        {notificacion.Orderid && (
          <TouchableOpacity
            style={styles.botonOrden}
            onPress={() => router.push(`/ordenes/${notificacion.Orderid}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="eye-outline" size={20} color="#fff" />
            <Text style={styles.botonTexto}>Ver Detalles de la Orden</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function LabelValue({ label, value }) {
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { marginTop: 10, color: FIORI.textMuted, textAlign: 'center' },
  content: { padding: 20 },

  title: { marginBottom: 12 },
  titleText: { fontSize: 18, fontWeight: '700', color: FIORI.ink },

  sectionBox: {
    backgroundColor: FIORI.cardBg,
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: FIORI.border,
    flexDirection: 'row',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },

  leftStripe: {
    width: 4,
    backgroundColor: FIORI.accent,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    marginRight: 12,
  },
  leftStripeSoft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: FIORI.border,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },

  label: { fontSize: 13, fontWeight: '600', color: FIORI.textMuted },
  value: { fontSize: 14, color: FIORI.ink, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: FIORI.ink, marginBottom: 6, paddingLeft: 8 },

  botonOrden: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIORI.accent,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  botonTexto: { color: '#fff', fontWeight: '700', marginLeft: 8, fontSize: 16 },
});
