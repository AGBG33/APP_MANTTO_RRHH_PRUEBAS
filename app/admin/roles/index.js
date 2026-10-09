// app/admin/roles/index.js
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../src/components/Header';
import { useAuth } from '../../../src/context/AuthContext';
import api from '../../../src/services/api';

const BG = '#F4F6F9';
const SAP_BLUE = '#0A6ED1';
const SAP_BORDER = '#E4E9F0';
const SAP_TEXT = '#0B1F3B';
const SAP_SUB = '#6A7381';

export default function RolesAdminScreen() {
  const { token, user, hasPermission } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [rolSel, setRolSel] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [r1, r2] = await Promise.all([
          api.get('/roles', { headers: { Authorization: `Bearer ${token}` } }),
          api.get('/roles/permisos', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setRoles(r1.data || []);
        setPermisos(r2.data || []);
        if (r1.data?.length) setRolSel(r1.data[0].id);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'No se pudo cargar roles/permisos');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [token]);

  useEffect(() => {
    const fetchRolePerms = async () => {
      if (!rolSel) return;
      try {
        const res = await api.get(`/roles/${rolSel}/permisos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ids = new Set((res.data || []).map((p) => p.id));
        setChecked(ids);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'No se pudieron cargar los permisos del rol');
      }
    };
    fetchRolePerms();
  }, [rolSel, token]);

  const toggle = (pid) => {
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(pid) ? n.delete(pid) : n.add(pid);
      return n;
    });
  };

  const guardar = async () => {
    try {
      setSaving(true);
      await api.put(
        `/roles/${rolSel}/permisos`,
        { permisos: Array.from(checked) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('Listo', 'Permisos actualizados');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  };

  const puedeVer = user?.rol_id === 1 || hasPermission('gestionar_roles');

  const rolActual = useMemo(
    () => roles.find((r) => r.id === rolSel),
    [roles, rolSel]
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Header title="Roles y permisos" />

      {!puedeVer ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={32} color={SAP_SUB} />
          <Text style={{ color: SAP_SUB, marginTop: 8 }}>No autorizado</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={SAP_BLUE} />
          <Text style={{ marginTop: 8, color: SAP_SUB }}>Cargando roles y permisos…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
          {/* Object header */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="shield-checkmark-outline" size={22} color={SAP_BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>
                {rolActual ? rolActual.nombre : 'Selecciona un rol'}
              </Text>
              <Text style={styles.summarySub}>
                {permisos.length} permisos disponibles
              </Text>
            </View>
            {/* opcional: estatus */}
            <View style={styles.summaryBadge}>
              <Ionicons name="people-outline" size={14} color={SAP_BLUE} />
              <Text style={styles.summaryBadgeText}>Roles: {roles.length}</Text>
            </View>
          </View>

          {/* Chips de roles */}
          <Text style={styles.sectionTitle}>Roles</Text>
          <View style={styles.rolesRow}>
            {roles.map((r) => {
              const active = rolSel === r.id;
              return (
                <TouchableOpacity
                    key={r.id}
                    style={[styles.roleChip, active && styles.roleChipActive]}
                    onPress={() => setRolSel(r.id)}
                  >
                    <Ionicons
                      name="person-circle-outline"
                      size={15}
                      color={active ? '#fff' : SAP_SUB}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[styles.roleChipText, active && styles.roleChipTextActive]}
                      numberOfLines={1}
                    >
                      {r.nombre}
                    </Text>
                  </TouchableOpacity>
              );
            })}
          </View>

          {/* Permisos */}
          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Permisos</Text>

          <View style={styles.permsCard}>
            {permisos.map((p, idx) => {
              const on = checked.has(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.permRow,
                    idx !== permisos.length - 1 && styles.permDivider,
                  ]}
                  onPress={() => toggle(p.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkBox, on && styles.checkBoxOn]}>
                    {on && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permText}>{p.nombre}</Text>
                    {!!p.descripcion && (
                      <Text style={styles.permSub} numberOfLines={1}>
                        {p.descripcion}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Botón guardar */}
          <TouchableOpacity
            disabled={saving}
            onPress={guardar}
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          >
            <Ionicons name="save-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

   
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E6F1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: SAP_TEXT,
  },
  summarySub: {
    fontSize: 12,
    color: SAP_SUB,
    marginTop: 2,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF3FB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  summaryBadgeText: {
    color: SAP_BLUE,
    fontSize: 11.5,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: SAP_TEXT,
    marginBottom: 6,
  },

  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SAP_BORDER,
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  roleChipActive: {
    backgroundColor: SAP_BLUE,
    borderColor: SAP_BLUE,
  },
  roleChipText: {
    color: SAP_TEXT,
    fontSize: 12.5,
  },
  roleChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  permsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SAP_BORDER,
    overflow: 'hidden',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  permDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.4,
    borderColor: SAP_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkBoxOn: {
    backgroundColor: SAP_BLUE,
  },
  permText: {
    color: SAP_TEXT,
    fontWeight: '600',
    fontSize: 13,
  },
  permSub: {
    color: SAP_SUB,
    fontSize: 11.5,
  },
  saveBtn: {
    marginTop: 14,
    backgroundColor: SAP_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 999,
  },
});
