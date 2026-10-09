import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../../src/context/AuthContext';
import Header from '../../../src/components/Header';
import api from '../../../src/services/api';
import { router } from 'expo-router';

export default function ListaOrdenesAdmin() {
  const { token } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrdenes = async () => {
    try {
      const res = await api.get('/ordenes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrdenes(res.data);
    } catch (error) {
      console.error('Error al cargar órdenes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenes();
  }, []);

  const renderItem = ({ item }) => {
    const estatusColor =
      item.estatus === 'pendiente' ? '#d32f2f' :
      item.estatus === 'en_proceso' ? '#fbc02d' : '#388e3c';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/ordenes/${item.orderid}`)}
      >
        <View style={styles.cardContent}>
          <View style={[styles.statusDot, { backgroundColor: estatusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>#{item.orderid} - {item.nombre_orden}</Text>
            <Text style={styles.label}>Solicitante: {item.solicitante}</Text>
            <Text style={styles.label}>Clave equipo: {item.clave_equipo}</Text>
            <Text style={styles.label}>Inicio: {new Date(item.startdate).toLocaleDateString()}</Text>
            <Text style={styles.label}>Estatus: {item.estatus}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Órdenes (Administrador)" />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#a10000" />
      ) : (
        <FlatList
          data={ordenes}
          keyExtractor={(item) => item.orderid}
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
