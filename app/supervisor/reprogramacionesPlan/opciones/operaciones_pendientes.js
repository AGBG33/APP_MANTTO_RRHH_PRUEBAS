import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Platform,
  StatusBar,
  Alert,
  TextInput,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../../src/components/Header';

/* ====================== Locale ES ====================== */
LocaleConfig.locales.es = {
  monthNames: [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ],
  monthNamesShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';

/* ====================== Helpers ====================== */
const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function ymdToDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* ====================== Datos ficticios (prueba) ======================
  - Aquí cada item representa UNA OPERACIÓN pendiente, no la orden.
  - "opDate" es la fecha de operación (la que se reprograma).
*/
const FAKE_OPS = [
  {
    opId: 'OP-001',
    orderId: '40215041',
    operacion: '0010',
    descripcion: 'Inspección inicial',
    tecnico: 'tecnico2@mitsu.com',
    equipo: 'Elevador E-01',
    opDate: '2025-12-05',
    status: 'Pendiente',
  },
  {
    opId: 'OP-002',
    orderId: '40215041',
    operacion: '0020',
    descripcion: 'Ajuste de frenos',
    tecnico: 'tecnico2@mitsu.com',
    equipo: 'Elevador E-01',
    opDate: '2025-12-06',
    status: 'Pendiente',
  },
  {
    opId: 'OP-003',
    orderId: '40215045',
    operacion: '0010',
    descripcion: 'Cambio de rodillos',
    tecnico: 'tecnico4@mitsu.com',
    equipo: 'Escalera S-02',
    opDate: '2025-12-06',
    status: 'Pendiente',
  },
  {
    opId: 'OP-004',
    orderId: '40215050',
    operacion: '0030',
    descripcion: 'Pruebas de seguridad',
    tecnico: 'tecnico1@mitsu.com',
    equipo: 'Elevador E-07',
    opDate: '2025-12-10',
    status: 'Pendiente',
  },
];

export default function OperacionesPendientes() {
  const [ops, setOps] = useState(FAKE_OPS);
  const [selectedDate, setSelectedDate] = useState(null);
  const [query, setQuery] = useState('');

  // Modal editar fecha de operación
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null); // operación
  const [tempDate, setTempDate] = useState('');

  /* ===== Marcar calendario por fechas de operación ===== */
  const markedDates = useMemo(() => {
    const marks = {};

    // Marcar las fechas que tienen operaciones pendientes (punto)
    ops.forEach((o) => {
      marks[o.opDate] = {
        ...(marks[o.opDate] || {}),
        marked: true,
        dotColor: COLORS.accent,
      };
    });

    // Resaltar fecha seleccionada
    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || {}),
        selected: true,
        selectedColor: COLORS.accent,
        selectedTextColor: '#FFFFFF',
      };
    }

    return marks;
  }, [ops, selectedDate]);

  /* ===== Filtrar lista por fecha de operación y búsqueda ===== */
  const filteredOps = useMemo(() => {
    let list = ops;

    // filtro por fecha exacta de operación (aquí NO es rango)
    if (selectedDate) {
      list = list.filter((o) => o.opDate === selectedDate);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const haystack = `${o.orderId} ${o.operacion} ${o.descripcion} ${o.tecnico} ${o.equipo}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    // opcional: ordenar por fecha
    list = [...list].sort((a, b) => ymdToDate(a.opDate) - ymdToDate(b.opDate));

    return list;
  }, [ops, selectedDate, query]);

  function openEdit(op) {
    setEditing(op);
    setTempDate(op.opDate);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditing(null);
    setTempDate('');
  }

  function saveEdit() {
    if (!editing) return;
    if (!tempDate) {
      Alert.alert('Falta fecha', 'Selecciona la nueva fecha para la operación.');
      return;
    }

    setOps((prev) =>
      prev.map((o) => (o.opId === editing.opId ? { ...o, opDate: tempDate } : o))
    );

    closeEdit();
    Alert.alert('Listo', 'Fecha de operación actualizada (prueba).');
  }

  const countsByDate = useMemo(() => {
    const map = {};
    ops.forEach((o) => {
      map[o.opDate] = (map[o.opDate] || 0) + 1;
    });
    return map;
  }, [ops]);

  const subtitle = selectedDate
    ? `Operaciones del ${selectedDate} (${filteredOps.length})`
    : `Todas las operaciones pendientes (${filteredOps.length})`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Header title="Operaciones pendientes" />

      {/* ===== Calendario ===== */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="timer-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>Calendario por fecha de operación</Text>

          {!!selectedDate && (
            <Pressable onPress={() => setSelectedDate(null)} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Ver todas</Text>
            </Pressable>
          )}
        </View>

        <Calendar
          markedDates={markedDates}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: COLORS.textSub,
            dayTextColor: COLORS.textPrimary,
            monthTextColor: COLORS.textPrimary,
            arrowColor: COLORS.accent,
            todayTextColor: COLORS.accent,
          }}
        />

        <Text style={styles.hint}>
          Tip: el punto indica que hay operaciones pendientes en esa fecha.
        </Text>

        {/* mini resumen por fecha seleccionada */}
        {!!selectedDate && (
          <Text style={styles.countHint}>
            Operaciones pendientes ese día: <Text style={styles.bold}>{countsByDate[selectedDate] || 0}</Text>
          </Text>
        )}
      </View>

      {/* ===== Lista + buscador ===== */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="list-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.cardTitle}>{subtitle}</Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textSub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por orden, operación, técnico, equipo…"
            placeholderTextColor="#9AA5B1"
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.textSub} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={filteredOps}
          keyExtractor={(item) => item.opId}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay operaciones para mostrar.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titleRow}>
                  <Text style={styles.orderId}>Orden #{item.orderId}</Text>
                  <Text style={styles.dot}> • </Text>
                  <Text style={styles.opCode}>Op {item.operacion}</Text>
                </Text>

                <Text style={styles.desc}>{item.descripcion}</Text>

                <Text style={styles.meta}>
                  {item.equipo}  ·  {item.tecnico}
                </Text>

                <Text style={styles.dateLine}>
                  Fecha operación: <Text style={styles.bold}>{item.opDate}</Text>
                </Text>
              </View>

              <Pressable
                onPress={() => openEdit(item)}
                android_ripple={{ color: '#d7e3f3' }}
                style={({ pressed }) => [
                  styles.editBtn,
                  pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="calendar-outline" size={18} color="#fff" />
                <Text style={styles.editBtnText}>Cambiar</Text>
              </Pressable>
            </View>
          )}
        />
      </View>

      {/* ===== Modal editar fecha de operación ===== */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editing ? `Orden #${editing.orderId} · Op ${editing.operacion}` : 'Operación'}
                </Text>
                {!!editing && (
                  <Text style={styles.modalSub}>
                    {editing.descripcion}
                  </Text>
                )}
              </View>

              <Pressable onPress={closeEdit} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <Text style={styles.modalHint}>Selecciona la nueva fecha de operación</Text>

            <View style={styles.pillSingle}>
              <Text style={styles.pillLabel}>Nueva fecha</Text>
              <Text style={styles.pillValue}>{tempDate || '—'}</Text>
            </View>

            <Calendar
              markedDates={
                tempDate
                  ? {
                      [tempDate]: {
                        selected: true,
                        selectedColor: COLORS.accent,
                        selectedTextColor: '#fff',
                      },
                    }
                  : {}
              }
              onDayPress={(d) => setTempDate(d.dateString)}
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: COLORS.textSub,
                dayTextColor: COLORS.textPrimary,
                monthTextColor: COLORS.textPrimary,
                arrowColor: COLORS.accent,
                todayTextColor: COLORS.accent,
              }}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={saveEdit} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Guardar</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFooter}>
              *Vista de prueba. Después lo conectamos a tu API/SAP para actualizar cada operación.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ====================== Styles ====================== */
const COLORS = {
  pageBg: '#F7F7F7',
  cardBg: '#FFFFFF',
  border: '#E4E9F0',
  textPrimary: '#0B1F3B',
  textSub: '#6A7381',
  accent: '#0A6ED1',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pageBg },

  card: {
    backgroundColor: COLORS.cardBg,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 2 },
    }),
  },

  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, flex: 1 },

  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },

  hint: { marginTop: 8, fontSize: 12, color: COLORS.textSub },
  countHint: { marginTop: 6, fontSize: 12.5, color: COLORS.textSub },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textPrimary },

  sep: { height: 10 },
  empty: { paddingVertical: 14, color: COLORS.textSub, fontSize: 13 },

  row: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#fff',
  },

  titleRow: { fontSize: 13.5, color: COLORS.textPrimary, fontWeight: '900' },
  orderId: { color: COLORS.textPrimary },
  dot: { color: COLORS.textSub },
  opCode: { color: COLORS.textPrimary },

  desc: { marginTop: 2, fontSize: 12.5, color: COLORS.textSub },
  meta: { marginTop: 6, fontSize: 12.5, color: COLORS.textSub },

  dateLine: { marginTop: 6, fontSize: 12.5, color: COLORS.textSub },
  bold: { fontWeight: '900', color: COLORS.textPrimary },

  editBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  editBtnText: { color: '#fff', fontWeight: '900', fontSize: 12.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14 },

  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  modalTitle: { fontSize: 15, fontWeight: '900', color: COLORS.textPrimary },
  modalSub: { marginTop: 2, fontSize: 12.5, color: COLORS.textSub, fontWeight: '700' },
  modalHint: { marginTop: 8, fontSize: 12.5, color: COLORS.textSub },

  pillSingle: {
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  pillLabel: { fontSize: 11.5, color: COLORS.textSub, fontWeight: '700' },
  pillValue: { marginTop: 2, fontSize: 13, color: COLORS.textPrimary, fontWeight: '900' },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  primaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.accent },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: '#fff' },

  modalFooter: { marginTop: 10, fontSize: 11.5, color: COLORS.textSub },
});
