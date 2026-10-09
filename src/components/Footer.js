// src/components/Footer.js
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

const FIORI = {
  barBg: '#FFFFFF',
  border: '#E6E9EF',
  ink: '#0B1F3B',     // texto/ícono principal
  accent: '#0A6ED1',  // azul SAP
  muted: '#63718B',
};

export default function Footer() {
  const router = useRouter();
  const { user } = useAuth();

  const homeRoute =
    user?.rol_id === 1 ? '/admin' : user?.rol_id === 2 ? '/supervisor' : '/tecnico';

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push(homeRoute)} style={styles.button} activeOpacity={0.8}>
        <Ionicons name="home-outline" size={22} color={FIORI.accent} />
        <Text style={[styles.label, { color: FIORI.accent, fontWeight: '600' }]}>Inicio</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/perfil')} style={styles.button} activeOpacity={0.8}>
        <Ionicons name="person-outline" size={22} color={FIORI.ink} />
        <Text style={styles.label}>Perfil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Conserva tu paddingVertical: 10, layout y spacing original
  container: {
    backgroundColor: FIORI.barBg,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: FIORI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: -2 } },
      android: { elevation: 8 },
    }),
  },
  button: {
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: FIORI.ink,
    marginTop: 3, // mismo margen para no mover nada
  },
});
