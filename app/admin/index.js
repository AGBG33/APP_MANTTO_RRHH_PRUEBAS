import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../src/components/Header';
import { router } from 'expo-router';

const SAP_BG = '#F4F6F9';
const TILE_BG = '#EFF4F9';
const TILE_BORDER = '#DDE6F2';
const TEXT_PRIMARY = '#0B1F3B';
const TEXT_SECONDARY = '#6A7381';

const ADMIN_TILES = [
  {
    key: 'notificaciones',
    title: 'Notificaciones',
    icon: 'notifications-outline',
    onPress: () => router.push('/notificaciones'),
    badge: 4, // si no quieres badge, bórralo
  },
  {
    key: 'ordenes',
    title: 'Órdenes de servicio',
    icon: 'document-text-outline',
    onPress: () => router.push('/admin/ordenes'),
  },
  {
    key: 'monitoreo',
    title: 'Seguimiento en tiempo real',
    icon: 'location-outline',
    onPress: () => router.push('/admin/monitoreo/monitoreo'),
  },
  {
    key: 'instalaciones',
    title: 'Instalaciones',
    icon: 'build-outline',
    onPress: () => router.push('/admin/instalaciones'),
  },
  {
    key: 'rutas',
    title: 'Planeación de rutas',
    icon: 'navigate-outline',
    onPress: () => router.push('/admin/rutas'),
  },
  {
    key: 'roles',
    title: 'Roles y permisos',
    icon: 'settings-outline',
    onPress: () => router.push('/admin/roles'),
  },
  {
    key: 'actividad',
    title: 'Registro de actividad',
    icon: 'time-outline',
    onPress: () => router.push('/admin/actividad'),
  },
];

// === Tile Fiori Admin ===
function FioriAdminTile({ title, icon, badge, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#d7e3f3' }}
      style={({ pressed }) => [
        styles.tile,
        pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
      ]}
    >
      <View style={styles.tileHeader}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={22} color={TEXT_PRIMARY} />
        </View>
        {typeof badge === 'number' && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

export default function AdminHome() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Header title="Inicio Administrador" />

      {/* Encabezado tipo Fiori */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Panel de administración</Text>
        <Text style={styles.pageSubtitle}>
          Gestiona usuarios, órdenes, monitoreo y reportes
        </Text>
      </View>

      {/* Grid de tiles */}
      <FlatList
        data={ADMIN_TILES}
        numColumns={2}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <FioriAdminTile
            title={item.title}
            icon={item.icon}
            badge={item.badge}
            onPress={item.onPress}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SAP_BG,
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  pageSubtitle: {
    fontSize: 12.5,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  grid: {
    paddingHorizontal: 14,
    paddingBottom: 80, // espacio para Footer
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    minHeight: 110,
    backgroundColor: TILE_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: 14,
    marginHorizontal: 4,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E9F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    lineHeight: 17,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EB5757',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
