import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function CustomAlert({ visible, tipo, titulo, mensaje, onClose, onConfirm, confirmText, cancelText }) {
  // colores de los mensaje de alerta deUmóvil
  const config = {
    exito: { icono: 'checkmark-circle-outline', color: '#1db954', fondo: '#EAF6EE' },
    error: { icono: 'close-circle-outline', color: '#E11D48', fondo: '#FFF1F2' },
    info: { icono: 'information-circle-outline', color: '#556B63', fondo: '#F4F6F5' },
    warning: { icono: 'alert-circle-outline', color: '#D97706', fondo: '#FFFBEB' }
  }[tipo] || { icono: 'information-circle-outline', color: '#1db954', fondo: '#EAF6EE' };

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

          {/* Botones de Cierre / Acción */}
          {onConfirm ? (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: config.color }]}
                onPress={() => {
                  onConfirm();
                }}
              >
                <Text style={styles.buttonText}>{confirmText || 'Sí, salir'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>{cancelText || 'Cancelar'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: config.color }]}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>Entendido</Text>
            </TouchableOpacity>
          )}
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
    textAlign: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row-reverse',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  confirmButton: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: 'bold',
  },
});