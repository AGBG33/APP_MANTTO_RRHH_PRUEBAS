import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import Header from '../../../src/components/Header';
import { router } from 'expo-router';

export default function InstalacionesTecnico() {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Datos de prueba
  const mockOrdenes = [
    {
      id: '101',
      ubicacion: 'CDMX Palacio de Gobierno',
      lugar: 'Primer piso',
      equipo: 'Elevador Mitsubishi',
      estatus: 'pendiente',
    },
    {
      id: '102',
      ubicacion: 'Xcaret',
      lugar: 'Zona X',
      equipo: 'Elevador Mitsubishi',
      estatus: 'en_proceso',
    },
    {
      id: '103',
      ubicacion: 'Atizapán Liverpool',
      lugar: 'Planta baja',
      equipo: 'Elevador de Carga',
      estatus: 'finalizada',
    },
  ];

  useEffect(() => {
    setTimeout(() => {
      setOrdenes(mockOrdenes);
      setLoading(false);
    }, 1000);
  }, []);


  const renderItem = ({ item }) => {
    const estatusColor =
      item.estatus === 'pendiente' ? '#d32f2f' :
      item.estatus === 'en_proceso' ? '#fbc02d' : '#388e3c';

    const handlePress = () => {
      if (item.estatus === 'pendiente') {
        router.push(`/tecnico/instalaciones/${item.instalacionid}/formulario-instalacion`);
      } else if (item.estatus === 'en_proceso') {
        router.push(`/tecnico/instalaciones/${item.instalacionid}/formulario-instalacion`);
      } else {
        router.push(`/tecnico/instalaciones/${item.instalacionid}/detalles`);
      }
    };

    return (
      <TouchableOpacity style={styles.card} onPress={handlePress}>
        <View style={styles.cardContent}>
          <View style={[styles.statusDot, { backgroundColor: estatusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Instalacion #{item.id}</Text>
            <Text style={styles.label}>Ubicación: {item.ubicacion}</Text>
            <Text style={styles.label}>Lugar: {item.lugar}</Text>
            <Text style={styles.label}>Equipo: {item.equipo}</Text>
            <Text style={styles.label}>Estatus: {item.estatus}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Instalaciones asignadas" />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#a10000" />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20 }}
        />
      )}
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f7' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ccc',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  title: { fontWeight: 'bold', fontSize: 16, color: '#a10000' },
  label: { fontSize: 14, color: '#444' },
});
