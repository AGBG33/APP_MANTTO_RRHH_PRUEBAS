// Bitácora de trabajo de mantenimiento — 100% local (sin backend)
// - Año de apertura (selector simple)
// - Equipos que cubre esta bitácora (lista dinámica)
// - Visitas de mantenimiento (fecha con DatePicker, hora entrada/salida con TimePicker)
// - Guardado/carga de borradores en AsyncStorage
// - onGuardarLocal(): imprime el JSON final (simulado)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';

// Ajusta a tu app:
import Header from '../../../../src/components/Header';

const Section = ({ children }) => <Text style={styles.section}>{children}</Text>;
const Card = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;
const Label = ({ children, style }) => <Text style={[styles.label, style]}>{children}</Text>;
const Input = (props) => <TextInput {...props} style={[styles.input, props.style]} />;

const Chips = ({ options, value, onChange }) => (
  <View style={styles.chipsWrap}>
    {options.map(opt => {
      const active = value === opt;
      return (
        <TouchableOpacity key={opt} style={[styles.chip, active && styles.chipOn]} onPress={() => onChange(opt)}>
          <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDMY = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
const fmtHM = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const newEquipo = () => ({ nombre: '' }); // Ej: "Elevador 1", "Escalera 2"
const newVisita = () => ({
  fechaISO: new Date().toISOString(),
  horaEntrada: '',
  horaSalida: '',
  equipo: '',
  observaciones: '',
  trabajos: '',
  estadoEquipo: 'Funcionando', // Funcionando | Detenido | Con condiciones
});

export default function BitacoraMantenimientoForm() {
  const { orderid } = useLocalSearchParams();
  const draftKey = useMemo(() => `bitacora_mantenimiento:${orderid ?? 'local'}`, [orderid]);

  // ===== Datos generales =====
  const [anioApertura, setAnioApertura] = useState(''); // solo año
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [mx, setMx] = useState('');
  const [cliente, setCliente] = useState('');
  const [direccion, setDireccion] = useState('');

  // ===== Equipos que cubre la bitácora =====
  const [equipos, setEquipos] = useState([newEquipo(), newEquipo(), newEquipo()]);
  const addEquipo = () => setEquipos(p => [...p, newEquipo()]);
  const removeEquipo = (idx) => setEquipos(p => p.filter((_, i) => i !== idx));
  const updateEquipo = (idx, val) => setEquipos(p => p.map((e, i) => i === idx ? { nombre: val } : e));

  // ===== Visitas (lista dinámica) =====
  const [visitas, setVisitas] = useState([newVisita()]);
  const addVisita = () => setVisitas(p => [...p, newVisita()]);
  const removeVisita = (idx) => setVisitas(p => p.filter((_, i) => i !== idx));
  const updateVisita = (idx, field, val) => setVisitas(p => p.map((v, i) => i === idx ? { ...v, [field]: val } : v));

  // Control de pickers por fila
  const [activePicker, setActivePicker] = useState({ type: null, index: null }); // {type: 'fecha'|'entrada'|'salida', index}
  const openPicker = (type, index) => setActivePicker({ type, index });
  const closePicker = () => setActivePicker({ type: null, index: null });

  // ===== Borradores =====
  const loadDraft = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(draftKey);
      if (!s) return;
      const d = JSON.parse(s);
      setAnioApertura(d.anioApertura ?? '');
      setMx(d.mx ?? '');
      setCliente(d.cliente ?? '');
      setDireccion(d.direccion ?? '');
      setEquipos(Array.isArray(d.equipos) && d.equipos.length ? d.equipos : [newEquipo()]);
      setVisitas(Array.isArray(d.visitas) && d.visitas.length ? d.visitas : [newVisita()]);
      Alert.alert('Borrador cargado', 'Se cargaron los datos guardados localmente.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar el borrador.');
    }
  }, [draftKey]);

  useEffect(() => { loadDraft(); }, [loadDraft]);

  const saveDraft = useCallback(async () => {
    const payload = { anioApertura, mx, cliente, direccion, equipos, visitas };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(payload));
      Alert.alert('Borrador guardado', 'Se guardó localmente en el dispositivo.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo guardar el borrador.');
    }
  }, [draftKey, anioApertura, mx, cliente, direccion, equipos, visitas]);

  // ===== Validación mínima =====
  const validar = () => {
    if (!anioApertura) return 'Falta el año de apertura.';
    if (!mx.trim()) return 'Falta MX.';
    if (!cliente.trim()) return 'Falta Cliente.';
    if (!direccion.trim()) return 'Falta Dirección.';
    if (!equipos.some(e => (e.nombre || '').trim())) return 'Captura al menos un equipo.';
    if (!visitas.length) return 'Agrega al menos una visita.';
    return null;
  };

  // ===== Guardar (simulado) =====
  const onGuardarLocal = () => {
    const err = validar();
    if (err) return Alert.alert('Validación', err);

    const equiposLimpios = equipos.map(e => (e?.nombre || '').trim()).filter(Boolean).map(nombre => ({ nombre }));
    const visitasLimpias = visitas.map(v => ({
      fecha: {
        iso: v.fechaISO,
        dmy: fmtDMY(new Date(v.fechaISO)),
      },
      horaEntrada: v.horaEntrada,
      horaSalida: v.horaSalida,
      equipo: v.equipo,
      observaciones: v.observaciones,
      trabajosRealizados: v.trabajos,
      estadoEquipo: v.estadoEquipo, // Funcionando | Detenido | Con condiciones
    }));

    const output = {
      encabezado: {
        anioApertura,
        mx,
        cliente,
        direccion,
      },
      equipos: equiposLimpios,
      visitas: visitasLimpias,
      // Nota: este JSON respeta el "formato de llenado" de tu documento.
    };

    console.log('BITACORA_MANTENIMIENTO_OUTPUT =>', JSON.stringify(output, null, 2));
    Alert.alert('Datos listos', 'Se generó el objeto local (revisa la consola).');
  };

  // ===== Handlers de pickers =====
  const onChangeYear = (_e, selectedDate) => {
    if (Platform.OS === 'android') setShowYearPicker(false);
    if (selectedDate) setAnioApertura(String(selectedDate.getFullYear()));
  };

  const onChangeVisitaPicker = (_e, selectedDate) => {
    const { type, index } = activePicker;
    if (Platform.OS === 'android') closePicker();
    if (!selectedDate || index == null) return;
    if (type === 'fecha') {
      updateVisita(index, 'fechaISO', selectedDate.toISOString());
    } else if (type === 'entrada') {
      updateVisita(index, 'horaEntrada', fmtHM(selectedDate));
    } else if (type === 'salida') {
      updateVisita(index, 'horaSalida', fmtHM(selectedDate));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
      <Header title="Bitácora de trabajo de mantenimiento" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
        {/* DATOS GENERALES */}
        <Section>Datos generales</Section>
        <Card>
          <Label>Año de apertura</Label>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Input value={anioApertura} onChangeText={setAnioApertura} placeholder="YYYY" keyboardType="number-pad" style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => setShowYearPicker(true)} style={styles.btnMini}>
              <Text style={styles.btnMiniText}>Seleccionar</Text>
            </TouchableOpacity>
          </View>
          {showYearPicker && (
            <DateTimePicker
              value={new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeYear}
            />
          )}

          <Label style={{ marginTop: 12 }}>MX</Label>
          <Input value={mx} onChangeText={setMx} placeholder="MX..." />

          <Label style={{ marginTop: 12 }}>Cliente</Label>
          <Input value={cliente} onChangeText={setCliente} placeholder="Razón social / Cliente" />

          <Label style={{ marginTop: 12 }}>Dirección</Label>
          <Input value={direccion} onChangeText={setDireccion} placeholder="Calle, No., Col., Ciudad..." />
        </Card>

        {/* EQUIPOS QUE CUBRE ESTA BITÁCORA */}
        <Section>Equipos que cubre esta bitácora</Section>
        <Card>
          {equipos.map((e, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>Equipo {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeEquipo(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>
              <Input
                value={e.nombre}
                onChangeText={(t) => updateEquipo(idx, t)}
                placeholder='Ej.: "Elevador 1" o "Escalera 2"'
              />
            </View>
          ))}
          <TouchableOpacity style={styles.secondary} onPress={addEquipo}>
            <Text style={styles.secondaryText}>+ Agregar equipo</Text>
          </TouchableOpacity>
        </Card>

        {/* VISITAS */}
        <Section>Visitas de mantenimiento</Section>
        <Card>
          {visitas.map((v, idx) => (
            <View key={idx} style={styles.rowCard}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>Visita {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeVisita(idx)}>
                  <Text style={styles.removeTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>

              <Label>Fecha de visita</Label>
              <TouchableOpacity onPress={() => openPicker('fecha', idx)} style={styles.pickerBox}>
                <Text style={styles.pickerText}>{fmtDMY(new Date(v.fechaISO))}</Text>
              </TouchableOpacity>

              <View style={styles.row2}>
                <View style={[styles.col, { minWidth: 160 }]}>
                  <Label style={{ marginTop: 12 }}>Hora de entrada</Label>
                  <TouchableOpacity onPress={() => openPicker('entrada', idx)} style={styles.pickerBox}>
                    <Text style={styles.pickerText}>{v.horaEntrada || 'HH:MM'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.col, { minWidth: 160 }]}>
                  <Label style={{ marginTop: 12 }}>Hora de salida</Label>
                  <TouchableOpacity onPress={() => openPicker('salida', idx)} style={styles.pickerBox}>
                    <Text style={styles.pickerText}>{v.horaSalida || 'HH:MM'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Label style={{ marginTop: 12 }}>Equipo</Label>
              <Input
                value={v.equipo}
                onChangeText={(t) => updateVisita(idx, 'equipo', t)}
                placeholder='Ej.: "Elevador 1"'
              />

              <Label style={{ marginTop: 12 }}>Observaciones</Label>
              <Input
                value={v.observaciones}
                onChangeText={(t) => updateVisita(idx, 'observaciones', t)}
                placeholder="Hallazgos, seguimiento..."
                multiline
                style={{ height: 100, textAlignVertical: 'top' }}
              />

              <Label style={{ marginTop: 12 }}>Trabajos realizados</Label>
              <Input
                value={v.trabajos}
                onChangeText={(t) => updateVisita(idx, 'trabajos', t)}
                placeholder="Actividades realizadas conforme al programa..."
                multiline
                style={{ height: 100, textAlignVertical: 'top' }}
              />

              <Label style={{ marginTop: 12 }}>Estado del equipo</Label>
              <Chips
                options={['Funcionando', 'Detenido', 'Con condiciones']}
                value={v.estadoEquipo}
                onChange={(opt) => updateVisita(idx, 'estadoEquipo', opt)}
              />
            </View>
          ))}

          {activePicker.type && (
            <DateTimePicker
              value={new Date()}
              mode={activePicker.type === 'fecha' ? 'date' : 'time'}
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeVisitaPicker}
            />
          )}

          <TouchableOpacity style={styles.secondary} onPress={addVisita}>
            <Text style={styles.secondaryText}>+ Agregar visita</Text>
          </TouchableOpacity>
        </Card>

        {/* ACCIONES */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <TouchableOpacity style={styles.secondary} onPress={saveDraft}>
            <Text style={styles.secondaryText}>Guardar borrador</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={onGuardarLocal}>
            <Text style={styles.primaryText}>Guardar (local)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, fontSize: 18, fontWeight: '800', color: '#1f2937' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1
  },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#fff', fontSize: 16, color: '#111827'
  },
  row2: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  col: { flexGrow: 1, flexBasis: 0, minWidth: 220 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderWidth: 1, borderColor: '#c7cdd6', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { color: '#111827', fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  primary: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center', flex: 1 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  secondary: { backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center', flex: 1 },
  secondaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  rowCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#fafafa' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowTitle: { fontWeight: '800', color: '#111827' },
  removeTxt: { color: '#b91c1c', fontWeight: '700' },
  pickerBox: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#fff'
  },
  pickerText: { fontSize: 16, color: '#111827' },
  btnMini: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#0ea5e9', borderRadius: 10 },
  btnMiniText: { color: '#fff', fontWeight: '800' },
});
