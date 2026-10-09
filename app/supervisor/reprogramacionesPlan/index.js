import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../src/components/Header';

// ====== Datos del menú (tiles) PARA SUPERVISOR ======
const TILES = [
  /*{
    key: 'no_mantenimiento',
    title: 'No mantenimiento',
    subtitle: 'Reprogramar órdenes con no mantenimiento',
    icon: 'calendar-outline',
    onPress: () => router.push('/supervisor/reprogramacionesPlan/opciones/no_mantenimiento'),
  },
  {
    key: 'operaciones_pendientes',
    title: 'Operaciones pendientes',
    subtitle: 'Reprogramar operaciones pendientes',
    icon: 'timer-outline',
    onPress: () => router.push('/supervisor/reprogramacionesPlan/opciones/operaciones_pendientes'),
  },*/
  {
    key: 'reprogramacion_orden',
    title: 'Reprogramar orden',
    subtitle: 'Cambiar fecha de una orden',
    icon: 'today-outline',
    onPress: () => router.push('/supervisor/reprogramacionesPlan/opciones/reprogramar_orden'),
  },
];

// ====== Layout del grid (gutter consistente) ======
const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PADDING = 16;
const GUTTER = 12;
const NUM_COLS = 2;
const TILE_W =
  (SCREEN_W - GRID_PADDING * 2 - GUTTER * (NUM_COLS - 1)) / NUM_COLS;

// ====== Colores inspirados en SAP Fiori (Horizon) ======
const COLORS = {
  pageBg: '#F7F7F7',
  tileBg: '#FFFFFF',
  tileBorder: '#E4E9F0',
  textPrimary: '#0B1F3B',
  textSub: '#6A7381',
  iconBg: '#EFF4F9',
  badgeBg: '#EB5757',
  ripple: '#D7E3F3',
};

function FioriTile({ title, subtitle, icon, badge, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: COLORS.ripple }}
      style={({ pressed }) => [
        styles.tile,
        pressed && Platform.OS === 'ios' ? styles.pressed : null,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={COLORS.textPrimary} />
        </View>

        {typeof badge === 'number' && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <View style={styles.textBlock}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.tileSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.actionText}>Abrir</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textSub} />
      </View>
    </Pressable>
  );
}

export default function IndexReprogramaciones() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Header title="Reprogramaciones" />

      <FlatList
        data={TILES}
        numColumns={NUM_COLS}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <FioriTile
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            badge={item.badge}
            onPress={item.onPress}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },

  grid: {
    padding: GRID_PADDING,
    paddingBottom: 90,
  },

  // ✅ en vez de space-between + márgenes raros, usamos gutter real
  row: {
    gap: GUTTER, // RN 0.71+; si tu RN no soporta gap, te doy alternativa
    marginBottom: GUTTER,
  },

  tile: {
    width: TILE_W,
    minHeight: 132,
    backgroundColor: COLORS.tileBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.tileBorder,
    padding: 14,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },

  pressed: { opacity: 0.92 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBlock: { marginTop: 10 },

  tileTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  tileSubtitle: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 16,
    color: COLORS.textSub,
  },

  bottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  actionText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.textSub,
  },

  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: COLORS.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
});
