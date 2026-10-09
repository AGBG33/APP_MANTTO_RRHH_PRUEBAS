import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../../src/components/Header';

const lugares = [
  { label: 'Guadalajara', value: '1' },
  { label: 'Quintana Roo', value: '2' },
  { label: 'Edo. Méx', value: '3' },
];

const ubicaciones = [
  { label: 'Planta baja', value: '1' },
  { label: 'Primer piso', value: '2' },
  { label: 'Segundo Piso', value: '3' },
];

const elevadores = [
  { label: 'Material A', value: '1' },
  { label: 'Material B', value: '2' },
  { label: 'Material C', value: '3' },
  { label: 'Material D', value: '4' },
];

const tecnicos = [
  { label: 'Juan Perez', value: '1' },
  { label: 'Roberto', value: '2' },
  { label: 'Luis', value: '3' },
  { label: 'Carlos', value: '4' },
];

export default function FormularioAsignacionInstalacion() {
  const [selectedLugar, setSelectedLugar] = useState(null);
  const [selectedUbicacion, setSelectedUbicacion] = useState(null);
  const [selectedEquipo, setSelectedEquipo] = useState(null);
  const [selectedTecnicos, setSelectedTecnicos] = useState(null);

  const handleSubmit = () => {
    Alert.alert(
      'Asignación guardada',
      `Lugar: ${selectedLugar}\nUbicación: ${selectedUbicacion}\nEquipo: ${selectedEquipo}\nTécnico: ${selectedTecnicos}`
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Asignar instalación" />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Object Header SAP */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="clipboard-outline" size={20} color="#0A6ED1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>Nueva asignación</Text>
            <Text style={styles.summarySub}>
              Completa los datos para asignar el equipo y técnico
            </Text>
          </View>
          {/* Badge opcional */}
          <View style={styles.badge}>
            <Ionicons name="time-outline" size={13} color="#0A6ED1" />
            <Text style={styles.badgeText}>Hoy</Text>
          </View>
        </View>

        {/* Campo: Lugar */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Lugar</Text>
          <Text style={styles.fieldHelp}>Selecciona la sede o ciudad</Text>
          <Dropdown
            style={styles.dropdown}
            containerStyle={styles.dropdownContainer}
            data={lugares}
            labelField="label"
            valueField="value"
            placeholder="Seleccionar lugar…"
            value={selectedLugar}
            onChange={(item) => setSelectedLugar(item.value)}
            renderRightIcon={() => (
              <Ionicons name="chevron-down" size={16} color="#7A8699" />
            )}
          />
        </View>

        {/* Campo: Ubicación */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Ubicación en el sitio</Text>
          <Text style={styles.fieldHelp}>Piso o zona donde estará el equipo</Text>
          <Dropdown
            style={styles.dropdown}
            containerStyle={styles.dropdownContainer}
            data={ubicaciones}
            labelField="label"
            valueField="value"
            placeholder="Seleccionar ubicación…"
            value={selectedUbicacion}
            onChange={(item) => setSelectedUbicacion(item.value)}
            renderRightIcon={() => (
              <Ionicons name="chevron-down" size={16} color="#7A8699" />
            )}
          />
        </View>

        {/* Campo: Equipo */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Equipo / elevador</Text>
          <Text style={styles.fieldHelp}>Elige el equipo que se va a instalar</Text>
          <Dropdown
            style={styles.dropdown}
            containerStyle={styles.dropdownContainer}
            data={elevadores}
            labelField="label"
            valueField="value"
            placeholder="Seleccionar equipo…"
            value={selectedEquipo}
            onChange={(item) => setSelectedEquipo(item.value)}
            renderRightIcon={() => (
              <Ionicons name="chevron-down" size={16} color="#7A8699" />
            )}
          />
        </View>

        {/* Campo: Técnico */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Asignar técnico</Text>
          <Text style={styles.fieldHelp}>Técnico responsable de la instalación</Text>
          <Dropdown
            style={styles.dropdown}
            containerStyle={styles.dropdownContainer}
            data={tecnicos}
            labelField="label"
            valueField="value"
            placeholder="Seleccionar técnico…"
            value={selectedTecnicos}
            onChange={(item) => setSelectedTecnicos(item.value)}
            renderRightIcon={() => (
              <Ionicons name="people-outline" size={16} color="#7A8699" />
            )}
          />
        </View>

        {/* Botón */}
        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
          <Ionicons name="save-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Guardar asignación</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F9',
  },
  scroll: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingBottom: 90,
  },

  // Summary / Object header
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E9F0',
    padding: 12,
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0B1F3B',
  },
  summarySub: {
    fontSize: 12,
    color: '#6A7381',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#EFF4F9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    color: '#0A6ED1',
    fontWeight: '600',
    fontSize: 11.5,
  },

  // Field card
  fieldCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E9F0',
    padding: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B1F3B',
  },
  fieldHelp: {
    fontSize: 11.5,
    color: '#7A8699',
    marginTop: 2,
    marginBottom: 8,
  },
  dropdown: {
    height: 46,
    borderColor: '#D4D9E2',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  dropdownContainer: {
    borderRadius: 10,
    borderColor: '#D4D9E2',
  },

  // Botón
  button: {
    flexDirection: 'row',
    backgroundColor: '#0A6ED1',
    paddingVertical: 13,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
