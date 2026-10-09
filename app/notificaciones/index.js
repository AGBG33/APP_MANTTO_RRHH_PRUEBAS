import React, { useEffect } from 'react';
import { View, FlatList, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../src/components/Header';
import { useAuth } from '../../src/context/AuthContext';
import { useNotificaciones } from '../../src/context/NotificacionesContext';
import { router } from 'expo-router';

const FIORI = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  cardReadBg: '#F5F7FA',     // leídas (neutro claro)
  border: '#DDE6F2',
  borderMute: '#CFD8E3',
  ink: '#0B1F3B',
  textMuted: '#63718B',
  accent: '#0A6ED1',         // azul SAP
  accentSoft: '#E3F2FD',
};

export default function NotificacionesScreen() {
  const { user } = useAuth();
  const { notificaciones, fetchNotificaciones, loading } = useNotificaciones();

  useEffect(() => {
    if (user?.id) {
      fetchNotificaciones();
    }
  }, [user]);

  const renderItem = ({ item }) => {
    const isRead = !!item.leida;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/notificaciones/${item.NotifNo}`)}
        activeOpacity={0.7}
        style={[
          styles.card,
          isRead ? styles.cardLeida : styles.cardNoLeida,
        ]}
      >
        <View style={[styles.leftBar, { backgroundColor: isRead ? FIORI.borderMute : FIORI.accent }]} />

        <View style={[styles.iconContainer, !isRead && { backgroundColor: FIORI.accentSoft, borderColor: FIORI.accent }]}>
          <Ionicons
            name={isRead ? 'notifications-outline' : 'notifications'}
            size={22}
            color={isRead ? FIORI.textMuted : FIORI.accent}
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.notifTitle} numberOfLines={1}>
            {item.NotifNo} {item.ShortText || 'Sin título'}
          </Text>
          <Text style={styles.notifDate}>
            {item.NotifDate
              ? new Date(item.NotifDate).toLocaleDateString()
              : 'Sin fecha'}
          </Text>
        </View>

        {!isRead && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Nuevo</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Notificaciones" />
      {loading ? (
        <ActivityIndicator size="large" color={FIORI.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={notificaciones}
          keyExtractor={(item, index) =>
            item?.NotifNo ? item.NotifNo.toString() : index.toString()
          }
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
     
    </View>
  );
}

const styles = StyleSheet.create({
  // Mantengo tu layout: mismos paddings/márgenes base
  container: { flex: 1, backgroundColor: FIORI.pageBg },
  list: { padding: 12 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FIORI.cardBg,
    paddingVertical: 14,       // igual que el tuyo
    paddingHorizontal: 16,     // igual que el tuyo
    borderRadius: 14,          // igual que el tuyo
    marginBottom: 12,          // igual que el tuyo

    borderWidth: 1,
    borderColor: FIORI.border,

    // Sombra más suave y “elevación” controlada para Fiori
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },

  // Variantes visuales sin alterar paddings
  cardNoLeida: {
    backgroundColor: FIORI.cardBg,
  },
  cardLeida: {
    backgroundColor: FIORI.cardReadBg,
  },

  // Barra izquierda tipo “accent stripe” Fiori (sutil)
  leftBar: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    marginRight: 12,
  },

  iconContainer: {
    marginRight: 14,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIORI.border,
  },

  textContainer: {
    flex: 1,
  },

  notifTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FIORI.ink,
  },

  notifDate: {
    fontSize: 13,
    color: FIORI.textMuted,
    marginTop: 2,
  },

  // Badge “Nuevo” estilo pill azul (Horizon)
  badge: {
    backgroundColor: FIORI.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
