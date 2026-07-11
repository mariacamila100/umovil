import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, auth } from '../firebase/config';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import CustomAlert from '../components/CustomAlert';

export default function CalificarViaje({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { viajeId } = route.params;

  const [viaje, setViaje] = useState(null);
  const [conductor, setConductor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [puntuacion, setPuntuacion] = useState(5);
  const [comentario, setComentario] = useState('');

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '', onAction: null });

  const mostrarAlerta = (tipo, titulo, mensaje, onAction = null) => {
    setAlertConfig({ visible: true, tipo, titulo, mensaje, onAction });
  };

  const cerrarAlerta = () => {
    const action = alertConfig.onAction;
    setAlertConfig(prev => ({ ...prev, visible: false }));
    if (action) action();
  };

  useEffect(() => {
    const fetchViajeYConductor = async () => {
      try {
        const viajeDoc = await getDoc(doc(db, 'Viajes', viajeId));
        if (viajeDoc.exists()) {
          const vData = viajeDoc.data();
          setViaje(vData);

          // Obtener datos del conductor
          if (vData.conductor_id) {
            const condDoc = await getDoc(doc(db, 'Usuarios', vData.conductor_id));
            if (condDoc.exists()) {
              setConductor(condDoc.data());
            }
          }
        }
      } catch (error) {
        console.error("Error cargando datos de calificación:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchViajeYConductor();
  }, [viajeId]);

  const handleEnviarCalificacion = async () => {
    if (!viaje || !conductor) return;
    setSubmitting(true);

    try {
      const conductorId = viaje.conductor_id;
      const pasajeroId = auth.currentUser?.uid || viaje.pasajero_id;

      // 1. Guardar la calificación en la colección 'Calificacion'
      await addDoc(collection(db, 'Calificacion'), {
        a_usuario_id: conductorId,
        de_usuario_id: pasajeroId,
        puntuacion: puntuacion,
        comentario: comentario.trim(),
        viaje_id: viajeId,
        creado_en: serverTimestamp()
      });

      // 2. Calcular y actualizar el promedio del conductor
      const condRef = doc(db, 'Usuarios', conductorId);
      const condSnap = await getDoc(condRef);

      if (condSnap.exists()) {
        const condData = condSnap.data();
        const currentNum = condData.num_calificaciones || 0;
        const currentAvg = condData.calificacion_promedio !== undefined ? condData.calificacion_promedio : 5.0;

        const newNum = currentNum + 1;
        // Si no tenía calificaciones previas, el promedio es directamente la puntuación actual
        const newAvg = currentNum === 0 
          ? puntuacion 
          : ((currentAvg * currentNum) + puntuacion) / newNum;

        await updateDoc(condRef, {
          calificacion_promedio: newAvg,
          num_calificaciones: newNum
        });
      }

      mostrarAlerta(
        'exito', 
        '¡Calificación Enviada!', 
        'Gracias por calificar a tu conductor. Esto ayuda a mantener la seguridad en Umóvil.',
        () => {
          navigation.replace('PasajeroTabs');
        }
      );

    } catch (error) {
      console.error("Error al calificar viaje:", error);
      mostrarAlerta('error', 'Error', 'No se pudo enviar la calificación. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaltar = () => {
    navigation.replace('PasajeroTabs');
  };

  const getPuntuacionTexto = (p) => {
    switch (p) {
      case 1: return 'Muy malo 😞';
      case 2: return 'Malo 😕';
      case 3: return 'Aceptable 😐';
      case 4: return 'Muy bueno 🙂';
      case 5: return 'Excelente viaje! 🤩';
      default: return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1db954" />
        <Text style={styles.loadingText}>Preparando calificación...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Platform.OS === 'android' ? 30 : 0 }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={handleSaltar} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color="#556B63" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calificar Viaje</Text>
        <TouchableOpacity style={styles.skipButton} onPress={handleSaltar} activeOpacity={0.7}>
          <Text style={styles.skipText}>Saltar</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* DETALLES DEL CONDUCTOR */}
          <View style={styles.conductorCard}>
            <View style={styles.avatarWrapper}>
              {conductor?.foto_perfil ? (
                <Image source={{ uri: conductor.foto_perfil }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{(conductor?.nombre?.charAt(0) || '?').toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.verificadoBadge}>
                <Ionicons name="checkmark" size={11} color="#fff" />
              </View>
            </View>
            <Text style={styles.conductorName}>
              {conductor ? `${conductor.nombre} ${conductor.apellido || ''}` : 'Tu Conductor'}
            </Text>
            <Text style={styles.conductorSub}>Conductor verificado UTS</Text>
          </View>

          {/* RUTA RESUMEN (Estilo Timeline Premium) */}
          <View style={styles.rutaResumen}>
            <View style={styles.rutaCol}>
              <View style={styles.rutaPinWrapper}>
                <View style={styles.dotGreen} />
                <View style={styles.rutaDottedLine} />
                <View style={styles.dotRed} />
              </View>
              <View style={styles.rutaTextWrapper}>
                <View style={styles.rutaLoc}>
                  <Text style={styles.rutaLabelText}>Punto de origen</Text>
                  <Text style={styles.rutaText} numberOfLines={1}>{viaje?.origen_nombre || 'Origen no disponible'}</Text>
                </View>
                <View style={{ height: 16 }} />
                <View style={styles.rutaLoc}>
                  <Text style={styles.rutaLabelText}>Destino de llegada</Text>
                  <Text style={styles.rutaText} numberOfLines={1}>{viaje?.destino_nombre || 'Destino no disponible'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* SECTOR DE ESTRELLAS */}
          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>¿Cómo calificarías tu viaje?</Text>
            
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  activeOpacity={0.7}
                  onPress={() => setPuntuacion(star)}
                  style={styles.starTouch}
                >
                  <Ionicons
                    name={star <= puntuacion ? 'star' : 'star-outline'}
                    size={46}
                    color={star <= puntuacion ? '#FBBF24' : '#E5E7EB'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.ratingTextDescWrapper}>
              <Text style={styles.ratingTextDesc}>{getPuntuacionTexto(puntuacion)}</Text>
            </View>
          </View>

          {/* COMENTARIO */}
          <View style={styles.commentSection}>
            <Text style={styles.commentLabel}>Escribe una reseña (opcional)</Text>
            <TextInput
              style={styles.commentInput}
              value={comentario}
              onChangeText={setComentario}
              placeholder="¿Qué te pareció el conductor, el vehículo o el trayecto? Cuéntale a los demás..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              maxLength={250}
            />
          </View>

          {/* BOTÓN DE ENVÍO */}
          <TouchableOpacity 
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]} 
            onPress={handleEnviarCalificacion}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Enviar Calificación</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomAlert
        visible={alertConfig.visible}
        tipo={alertConfig.tipo}
        titulo={alertConfig.titulo}
        mensaje={alertConfig.mensaje}
        onClose={cerrarAlerta}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14, fontWeight: '500' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  closeButton: { padding: 4 },
  skipButton: { paddingVertical: 4, paddingHorizontal: 12 },
  skipText: { fontSize: 14, color: '#556B63', fontWeight: '600' },

  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E5E7EB' },
  avatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { fontSize: 32, fontWeight: 'bold', color: '#1db954' },
  verificadoBadge: { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#1db954', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  conductorCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    marginBottom: 16,
  },
  conductorName: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  conductorSub: { fontSize: 13, color: '#7A8B85', marginTop: 4, fontWeight: '500' },

  rutaResumen: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    marginBottom: 20,
  },
  rutaCol: { flexDirection: 'row' },
  rutaPinWrapper: { alignItems: 'center', justifyContent: 'center', width: 20, marginRight: 12 },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1db954' },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  rutaDottedLine: { width: 1.5, height: 30, backgroundColor: '#E5E7EB', marginVertical: 4 },
  rutaTextWrapper: { flex: 1, justifyContent: 'center' },
  rutaLoc: { justifyContent: 'center' },
  rutaLabelText: { fontSize: 10, color: '#7A8B85', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  rutaText: { fontSize: 14, color: '#111', fontWeight: '600' },

  ratingSection: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  ratingTitle: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 16 },
  starsContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  starTouch: { paddingHorizontal: 8 },
  ratingTextDescWrapper: { backgroundColor: '#EAF6EE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, marginTop: 16 },
  ratingTextDesc: { fontSize: 14, fontWeight: '700', color: '#1db954' },

  commentSection: {
    marginBottom: 24,
  },
  commentLabel: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 8 },
  commentInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ECECEC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 14,
    color: '#111',
    minHeight: 100,
    textAlignVertical: 'top',
  },

  submitButton: {
    backgroundColor: '#1db954',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  submitButtonDisabled: { backgroundColor: '#A5D6A7' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
