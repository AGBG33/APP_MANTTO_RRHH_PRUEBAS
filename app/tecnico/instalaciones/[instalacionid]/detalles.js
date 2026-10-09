import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../../../../src/components/Header';

export default function DetallesInstalacion({ route }) {
  const { id, ubicacion, lugar, equipo, estatus, inicio, termino } = route || {
    id: '123456',
    ubicacion: 'CDMX Palacio de Gobierno',
    lugar: 'Primer piso',
    equipo: 'Elevador Mitsubishi',
    estatus: 'pendiente',
    inicio: '2025-07-22 05:42:16',
    termino: '2025-07-23 05:42:16',
  };

  return (
    <View style={styles.container}>
        <Header title="Detalles Instalación" />
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.headerInfo}>
                <Text style={styles.instalacionid}>Instalacion: {id}</Text>
                <Text style={styles.fecha}>Ubicación: {ubicacion}</Text>
                <Text style={styles.fecha}>Lugar: {lugar}</Text>
                <Text style={styles.fecha}>Equipo: {equipo}</Text>
                <Text style={styles.fecha}>Estatus: {estatus}</Text>
                <Text style={styles.fecha}>Inicio: {inicio}</Text>
                <Text style={styles.fecha}>Término: {termino}</Text>
                </View>
            </ScrollView>
       
    </View>

  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  headerInfo: {
    marginBottom: 20,
    backgroundColor: '#f9e8e8ff',
    borderRadius: 10,
    padding: 15,
  },
  instalacionid: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#b03535ff',
  },
  fecha: {
    fontSize: 14,
    color: '#334155',
    marginTop: 4,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  materialName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#b03535ff',
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  label: {
    color: '#475569',
    fontWeight: '500',
  },
  value: {
    color: '#111827',
    fontWeight: '600',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    backgroundColor: '#ba4646ff',
    marginTop: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  downloadText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 16,
    letterSpacing: 1,
  },


});
