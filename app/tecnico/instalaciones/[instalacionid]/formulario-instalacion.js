import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import Header from '../../../../src/components/Header';
import * as ImagePicker from 'expo-image-picker';

export default function FormularioInstalacion() {
  const [detalleTrabajo, setDetalleTrabajo] = useState('');
  const [imagenes, setImagenes] = useState([]);

  const seleccionarImagen = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true
    });

    if (!result.canceled) {
      setImagenes([...imagenes, ...result.assets]);
    }
  };

  const tomarFoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setImagenes([...imagenes, ...result.assets]);
    }
  };

  const handleGuardar = () => {
    Alert.alert(
      'Formulario Guardado',
      `Detalle: ${detalleTrabajo}\nFotos seleccionadas: ${imagenes.length}`
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Instalación de Elevador" />
      <ScrollView contentContainerStyle={styles.container}>
        
        <Text style={styles.label}>Detalle del Trabajo</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          multiline
          value={detalleTrabajo}
          onChangeText={setDetalleTrabajo}
          placeholder="Describe el trabajo realizado..."
        />
        
        <Text style={styles.label}>Fotos</Text>
        <View style={styles.imagesContainer}>
          {imagenes.map((img, index) => (
            <Image key={index} source={{ uri: img.uri }} style={styles.imagePreview} />
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={seleccionarImagen}>
            <Text style={styles.buttonText}>Galería</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={tomarFoto}>
            <Text style={styles.buttonText}>Cámara</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.buttonSave} onPress={handleGuardar}>
          <Text style={styles.buttonText}>Guardar</Text>
        </TouchableOpacity>
      </ScrollView>
     
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontWeight: 'bold', marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 5,
    padding: 8, backgroundColor: '#fff', marginBottom: 10
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  button: { backgroundColor: '#1976d2', padding: 12, borderRadius: 5, marginTop: 10, flex: 0.48 },
  buttonSave: { backgroundColor: '#a10000', padding: 12, borderRadius: 5, marginTop: 20 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  imagesContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  imagePreview: { width: 60, height: 60, marginRight: 8, marginBottom: 8, borderRadius: 5 }
});
