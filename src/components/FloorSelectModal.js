import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function FloorSelectModal({ visible, onClose, floors = 6, value = [], onChange }) {
  const arr = Array.from({ length: floors }, (_, i) => i + 1);
  const toggle = (n) => {
    const on = value.includes(n);
    const next = on ? value.filter(x => x !== n) : [...value, n].sort((a, b) => a - b);
    onChange(next);
  };

  const setAll = () => onChange(arr);
  const clearAll = () => onChange([]);
  const setEven = () => onChange(arr.filter(n => n % 2 === 0));
  const setOdd = () => onChange(arr.filter(n => n % 2 === 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.title}>Selecciona pisos</Text>
            <Text style={styles.subtitle}>
              Seleccionados: <Text style={{ fontWeight: '900' }}>{value.length}</Text> / {floors}
            </Text>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity onPress={setAll} style={styles.quickBtn}><Text style={styles.quickText}>Todos</Text></TouchableOpacity>
            <TouchableOpacity onPress={clearAll} style={styles.quickBtn}><Text style={styles.quickText}>Ninguno</Text></TouchableOpacity>
            <TouchableOpacity onPress={setEven} style={styles.quickBtn}><Text style={styles.quickText}>Pares</Text></TouchableOpacity>
            <TouchableOpacity onPress={setOdd} style={styles.quickBtn}><Text style={styles.quickText}>Non</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.wrap}>
            {arr.map(n => {
              const on = value.includes(n);
              return (
                <TouchableOpacity key={n} style={[styles.chip, on && styles.on]} onPress={() => toggle(n)}>
                  <Text style={[styles.chipText, on && styles.onText]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.ok} onPress={onClose}><Text style={styles.okText}>Listo</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontWeight: '900', fontSize: 18, color: '#111827' },
  subtitle: { color: '#6b7280', marginTop: 2 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, marginTop: 6 },
  quickBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#111827' },
  quickText: { color: '#fff', fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderWidth: 1, borderColor: '#c7cdd6', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minWidth: 48, alignItems: 'center' },
  on: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  chipText: { fontWeight: '800', color: '#111827' },
  onText: { color: '#fff' },
  ok: { marginTop: 14, backgroundColor: '#0A84FF', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '900' }
});
