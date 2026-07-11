import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import CustomAlert from '../components/CustomAlert';

// Colores de vehículo más comunes en Colombia, para un selector rápido en vez de texto libre
const COLORES_DISPONIBLES = [
  { nombre: 'Blanco', hex: '#FFFFFF', borde: '#E0E0E0' },
  { nombre: 'Negro', hex: '#1A1A1A', borde: '#1A1A1A' },
  { nombre: 'Gris', hex: '#9CA3AF', borde: '#9CA3AF' },
  { nombre: 'Rojo', hex: '#EF4444', borde: '#EF4444' },
  { nombre: 'Azul', hex: '#3B82F6', borde: '#3B82F6' },
  { nombre: 'Plata', hex: '#D1D5DB', borde: '#B0B0B0' },
];

const TIPOS_VEHICULO = [
  { id: 'carro', label: 'Carro', icono: 'car-side' },
  { id: 'moto', label: 'Moto', icono: 'motorbike' },
];

export default function RegistrarVehiculo({ navigation }) {
  const insets = useSafeAreaInsets();

  const [tipo, setTipo] = useState('carro');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [placa, setPlaca] = useState('');
  const [colorSeleccionado, setColorSeleccionado] = useState(COLORES_DISPONIBLES[0].nombre);
  const [capacidad, setCapacidad] = useState('4');
  const [guardando, setGuardando] = useState(false);

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '', onAction: null });
  const mostrarAlerta = (tipoAlerta, titulo, mensaje, onAction = null) => {
    setAlertConfig({ visible: true, tipo: tipoAlerta, titulo, mensaje, onAction });
  };
  const cerrarAlerta = () => {
    const action = alertConfig.onAction;
    setAlertConfig((prev) => ({ ...prev, visible: false }));
    if (action) action();
  };

  const validarPlaca = (valor) => /^[A-Za-z]{3}[- ]?\d{2,3}[A-Za-z]?$/.test(valor.trim());

  const registrarVehiculo = async () => {
    if (!marca.trim() || !modelo.trim() || !placa.trim()) {
      mostrarAlerta('error', 'Campos incompletos', 'Por favor completa marca, modelo y placa.');
      return;
    }
    if (!validarPlaca(placa)) {
      mostrarAlerta('error', 'Placa inválida', 'Revisa el formato de la placa, por ejemplo ABC123.');
      return;
    }
    const cupos = Number(capacidad);
    if (!cupos || cupos <= 0 || cupos > 6) {
      mostrarAlerta('error', 'Capacidad inválida', 'Ingresa un número de cupos entre 1 y 6.');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      mostrarAlerta('error', 'Sesión no encontrada', 'Vuelve a iniciar sesión para registrar tu vehículo.');
      return;
    }

    setGuardando(true);
    try {
      const nuevoVehiculo = {
        usuario_id: uid,
        tipo,
        marca: marca.trim(),
        modelo: modelo.trim(),
        placa: placa.trim().toUpperCase(),
        color: colorSeleccionado,
        capacidad: cupos,
        verificado: false, // Queda pendiente de revisión administrativa
        creado_en: serverTimestamp(),
      };

      const vehiculoRef = await addDoc(collection(db, 'Vehiculo'), nuevoVehiculo);

      // Enlazamos el vehículo recién creado al usuario, para que HomeConductor
      // pueda dejar de usar el ID fijo de pruebas y consultarlo dinámicamente.
      await updateDoc(doc(db, 'Usuarios', uid), {
        vehiculo_id: vehiculoRef.id,
      });

      mostrarAlerta('exito', '¡Vehículo registrado!', 'Tu vehículo quedó guardado y pendiente de verificación.', () => {
        navigation.goBack();
      });
    } catch (error) {
      console.error('Error registrando vehículo:', error);
      mostrarAlerta('error', 'Error', 'No se pudo registrar el vehículo. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registrar vehículo</Text>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#FAFAFA' }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* TIPO DE VEHÍCULO */}
        <Text style={styles.sectionLabel}>Tipo de vehículo</Text>
        <View style={styles.tipoRow}>
          {TIPOS_VEHICULO.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tipoCard, tipo === t.id && styles.tipoCardActivo]}
              onPress={() => setTipo(t.id)}
            >
              <MaterialCommunityIcons
                name={t.icono}
                size={22}
                color={tipo === t.id ? '#1db954' : '#556B63'}
              />
              <Text style={[styles.tipoCardText, tipo === t.id && styles.tipoCardTextActivo]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MARCA Y MODELO */}
        <Text style={styles.sectionLabel}>Marca y modelo</Text>
        <View style={styles.inputCard}>
          <FontAwesome5 name="car" size={14} color="#556B63" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.inputText}
            placeholder="Ej. Chevrolet"
            placeholderTextColor="#999"
            value={marca}
            onChangeText={setMarca}
          />
        </View>
        <View style={[styles.inputCard, { marginTop: 10 }]}>
          <MaterialCommunityIcons name="car-info" size={16} color="#556B63" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.inputText}
            placeholder="Ej. Spark GT"
            placeholderTextColor="#999"
            value={modelo}
            onChangeText={setModelo}
          />
        </View>

        {/* PLACA */}
        <Text style={styles.sectionLabel}>Placa</Text>
        <View style={styles.inputCard}>
          <Ionicons name="pricetag-outline" size={16} color="#556B63" style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.inputText, { textTransform: 'uppercase', letterSpacing: 1 }]}
            placeholder="ABC123"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            maxLength={7}
            value={placa}
            onChangeText={setPlaca}
          />
        </View>

        {/* COLOR */}
        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COLORES_DISPONIBLES.map((c) => (
            <TouchableOpacity
              key={c.nombre}
              onPress={() => setColorSeleccionado(c.nombre)}
              style={[
                styles.colorSwatch,
                { backgroundColor: c.hex, borderColor: c.borde },
                colorSeleccionado === c.nombre && styles.colorSwatchActivo,
              ]}
            >
              {colorSeleccionado === c.nombre && (
                <Ionicons name="checkmark" size={16} color={c.hex === '#FFFFFF' ? '#111' : '#fff'} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* CAPACIDAD */}
        <Text style={styles.sectionLabel}>Capacidad de pasajeros</Text>
        <View style={styles.capacidadRow}>
          <TouchableOpacity
            style={styles.capacidadBtn}
            onPress={() => setCapacidad(String(Math.max(1, Number(capacidad || 1) - 1)))}
          >
            <Ionicons name="remove" size={18} color="#1db954" />
          </TouchableOpacity>
          <Text style={styles.capacidadValor}>{capacidad}</Text>
          <TouchableOpacity
            style={styles.capacidadBtn}
            onPress={() => setCapacidad(String(Math.min(6, Number(capacidad || 1) + 1)))}
          >
            <Ionicons name="add" size={18} color="#1db954" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.guardarBtn} onPress={registrarVehiculo} disabled={guardando}>
          {guardando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.guardarBtnText}>Registrar vehículo</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.notaTexto}>
          Tu vehículo quedará pendiente de verificación. Podrás recibir solicitudes de viaje mientras se revisa.
        </Text>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        tipo={alertConfig.tipo}
        titulo={alertConfig.titulo}
        mensaje={alertConfig.mensaje}
        onClose={cerrarAlerta}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  headerTitle: { fontSize: 21, fontWeight: 'bold', color: '#111' },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#7A8B85', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },

  tipoRow: { flexDirection: 'row' },
  tipoCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EFEFEF', borderRadius: 16, height: 52, marginRight: 10 },
  tipoCardActivo: { borderColor: '#1db954', backgroundColor: '#EAF6EE' },
  tipoCardText: { fontSize: 14, fontWeight: '600', color: '#556B63', marginLeft: 8 },
  tipoCardTextActivo: { color: '#1db954' },

  inputCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#EFEFEF' },
  inputText: { flex: 1, fontSize: 14, color: '#111', fontWeight: '600', padding: 0 },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap' },
  colorSwatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12, marginBottom: 8 },
  colorSwatchActivo: { borderColor: '#1db954', borderWidth: 2.5 },

  capacidadRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#EFEFEF', height: 50, paddingHorizontal: 16, justifyContent: 'space-between', width: 140 },
  capacidadBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  capacidadValor: { fontSize: 16, fontWeight: '700', color: '#111' },

  guardarBtn: { flexDirection: 'row', backgroundColor: '#1db954', height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginTop: 30, shadowColor: '#1db954', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  guardarBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  notaTexto: { fontSize: 11, color: '#999', textAlign: 'center', marginTop: 14, paddingHorizontal: 10, lineHeight: 16 },
});