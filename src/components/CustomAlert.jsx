import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function CustomAlert({ visible, tipo, titulo, mensaje, onClose }) {
  // Configuración de íconos y colores según el tipo de alerta
  const config = {
    exito: { icono: 'checkmark-circle', color: '#16A34A', fondo: '#DCFCE7' },
    error: { icono: 'close-circle', color: '#DC2626', fondo: '#FEE2E2' },
    info: { icono: 'information-circle', color: '#2563EB', fondo: '#DBEAFE' }
  }[tipo] || { icono: 'information-circle', color: '#16A34A', fondo: '#DCFCE7' };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backDrop}>
        <View style={styles.alertContainer}>
          {/* Círculo del Ícono */}
          <View style={[styles.iconCircle, { backgroundColor: config.fondo }]}>
            <Ionicons name={config.icono} size={40} color={config.color} />
          </View>
          
          {/* Textos */}
          <Text style={styles.title}>{titulo}</Text>
          <Text style={styles.message}>{mensaje}</Text>
          
          {/* Botón de Cierre */}
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: config.color }]} 
            onPress={onClose}
          >
            <Text style={styles.buttonText}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backDrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  alertContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  button: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});