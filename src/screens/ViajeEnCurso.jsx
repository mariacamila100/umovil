import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Platform, Linking } from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import CustomAlert from '../components/CustomAlert';

export default function ViajeEnCurso({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { viajeId } = route.params; // Pasamos el ID del viaje al navegar
  const [viaje, setViaje] = useState(null);
  const [loading, setLoading] = useState(true);
  const [companeroData, setCompaneroData] = useState(null);
  const [vehiculoData, setVehiculoData] = useState(null);
  const [finalizando, setFinalizando] = useState(false);

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '', onAction: null });
  const mostrarAlerta = (tipo, titulo, mensaje, onAction = null) => {
    setAlertConfig({ visible: true, tipo, titulo, mensaje, onAction });
  };
  const cerrarAlerta = () => {
    const action = alertConfig.onAction;
    setAlertConfig((prev) => ({ ...prev, visible: false }));
    if (action) action();
  };

  // Forzamos un re-render cada 30s para que el "Hace X min" del header se sienta vivo
  const [, forzarActualizacion] = useState(0);
  useEffect(() => {
    const intervalo = setInterval(() => forzarActualizacion((t) => t + 1), 30000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    // Escuchar el estado del viaje en tiempo real
    const unsub = onSnapshot(doc(db, 'Viajes', viajeId), async (docSnap) => {
      if (docSnap.exists()) {
        const datosViaje = docSnap.data();
        setViaje(datosViaje);

        // Identificar el rol del usuario actual para traer los datos de la contraparte
        const uidActual = auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2';
        const esPasajero = datosViaje.pasajero_id === uidActual;
        const idCompanero = esPasajero ? datosViaje.conductor_id : datosViaje.pasajero_id;

        // Traer datos del compañero (Nombre, Foto, Teléfono, Calificación)
        // 🔧 CORREGIDO: tenías doc(doc(db, ...)) — un doc() metido dentro de otro por error,
        // eso rompía la pantalla apenas cargaba. Ahora es getDoc(doc(db, 'Usuarios', idCompanero)).
        if (!companeroData && idCompanero) {
          const userSnap = await getDoc(doc(db, 'Usuarios', idCompanero));
          if (userSnap.exists()) setCompaneroData(userSnap.data());
        }

        // Si soy pasajero, traemos los datos reales del vehículo (antes decía un texto fijo)
        if (esPasajero && datosViaje.vehiculo_id && !vehiculoData) {
          const vehSnap = await getDoc(doc(db, 'Vehiculo', datosViaje.vehiculo_id));
          if (vehSnap.exists()) setVehiculoData(vehSnap.data());
        }

        // Si el conductor finaliza el viaje, mandar al histórico
        if (datosViaje.estado === 'finalizado') {
          navigation.navigate('MisViajes');
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [viajeId]);

  const uidActual = auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2';
  const esPasajero = viaje?.pasajero_id === uidActual;

  const formatearTiempoTranscurrido = (segundosInicio) => {
    if (!segundosInicio) return '';
    const minutos = Math.max(0, Math.floor((Date.now() - segundosInicio * 1000) / 60000));
    if (minutos < 1) return 'Iniciado hace un momento';
    if (minutos < 60) return `Iniciado hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    return `Iniciado hace ${horas}h ${minutos % 60}min`;
  };

  const renderEstrellas = (promedio = 0) => (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(promedio) ? 'star' : 'star-outline'}
          size={11}
          color="#F59E0B"
          style={{ marginRight: 1 }}
        />
      ))}
    </View>
  );

  const llamarCompanero = () => {
    if (!companeroData?.telefono) {
      mostrarAlerta('info', 'Sin número', 'Este usuario no tiene un teléfono registrado.');
      return;
    }
    Linking.openURL(`tel:${companeroData.telefono}`);
  };

  const finalizarViaje = () => {
    mostrarAlerta('info', 'Finalizar viaje', '¿Confirmas que el viaje ya terminó?', async () => {
      setFinalizando(true);
      try {
        await updateDoc(doc(db, 'Viajes', viajeId), { estado: 'finalizado' });
        // La navegación a "MisViajes" la dispara el propio onSnapshot de arriba
        // en cuanto detecta estado:'finalizado', así no se duplica.
      } catch (error) {
        console.error('Error finalizando viaje:', error);
        mostrarAlerta('error', 'Error', 'No se pudo finalizar el viaje. Intenta de nuevo.');
      } finally {
        setFinalizando(false);
      }
    });
  };

  if (loading || !viaje) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Viaje en Curso</Text>
          {!!viaje.creado_en?.seconds && (
            <Text style={styles.headerSubtitle}>{formatearTiempoTranscurrido(viaje.creado_en.seconds)}</Text>
          )}
        </View>
        <View style={styles.badgeEnCurso}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>Activo</Text>
        </View>
      </View>

      {/* RUTA con los mismos puntos conectados del resto de la app */}
      <View style={styles.rutaBox}>
        <View style={styles.rutaRow}>
          <View style={styles.dotOrigen} />
          <Text style={styles.rutaTexto} numberOfLines={1}>
            <Text style={styles.rutaLabel}>Origen  </Text>
            {viaje.origen_nombre}
          </Text>
        </View>
        <View style={styles.rutaLineaConectora} />
        <View style={styles.rutaRow}>
          <View style={styles.dotDestino} />
          <Text style={styles.rutaTexto} numberOfLines={1}>
            <Text style={styles.rutaLabel}>Destino  </Text>
            {viaje.destino_nombre}
          </Text>
        </View>
      </View>

      {/* TARJETA DEL COMPAÑERO DE VIAJE */}
      <View style={styles.cardCompanero}>
        <Text style={styles.cardLabel}>{esPasajero ? 'Tu Conductor' : 'Tu Pasajero'}</Text>
        <View style={styles.rowInfo}>
          {companeroData?.foto_perfil ? (
            <Image source={{ uri: companeroData.foto_perfil }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{(companeroData?.nombre?.charAt(0) || '?').toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.nombreText}>
              {companeroData ? `${companeroData.nombre} ${companeroData.apellido || ''}` : 'Cargando usuario...'}
            </Text>
            {esPasajero ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Text style={styles.subText} numberOfLines={1}>
                  {vehiculoData ? `${vehiculoData.marca} ${vehiculoData.modelo} · ${vehiculoData.placa}` : 'Cargando vehículo...'}
                </Text>
                {vehiculoData?.verificado && (
                  <Ionicons name="checkmark-circle" size={13} color="#1db954" style={{ marginLeft: 4 }} />
                )}
              </View>
            ) : (
              <Text style={styles.subText}>Estudiante UTS</Text>
            )}
            {typeof companeroData?.calificacion_promedio === 'number' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                {renderEstrellas(companeroData.calificacion_promedio)}
                <Text style={styles.calificacionTexto}> {companeroData.calificacion_promedio.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <View style={styles.precioBox}>
            <Text style={styles.precioLabel}>Acordado</Text>
            <Text style={styles.precioValor}>${Number(viaje.precio_final || 0).toLocaleString('es-CO')}</Text>
          </View>
        </View>
      </View>

      {/* BOTONES DE ACCIÓN */}
      <View style={styles.accionesContainer}>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity
            style={styles.btnChat}
            onPress={() => navigation.navigate('ChatViaje', { viajeId: viajeId })}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.btnText}>Chat de Coordinación</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnLlamar} onPress={llamarCompanero}>
            <Ionicons name="call" size={18} color="#1db954" />
          </TouchableOpacity>
        </View>

        {/* Solo el conductor puede marcar el viaje como finalizado */}
        {!esPasajero && (
          <TouchableOpacity style={styles.btnFinalizar} onPress={finalizarViaje} disabled={finalizando}>
            {finalizando ? (
              <ActivityIndicator color="#556B63" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="flag-checkered" size={16} color="#556B63" style={{ marginRight: 8 }} />
                <Text style={styles.btnFinalizarText}>Finalizar viaje</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <CustomAlert
        visible={alertConfig.visible}
        tipo={alertConfig.tipo}
        titulo={alertConfig.titulo}
        mensaje={alertConfig.mensaje}
        onClose={cerrarAlerta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA', paddingHorizontal: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginVertical: 18 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  headerSubtitle: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  badgeEnCurso: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1db954', marginRight: 6 },
  badgeText: { color: '#1db954', fontWeight: '700', fontSize: 12 },

  rutaBox: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFEFEF', marginBottom: 16 },
  rutaRow: { flexDirection: 'row', alignItems: 'center' },
  dotOrigen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1db954' },
  dotDestino: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  rutaLineaConectora: { width: 1, height: 16, backgroundColor: '#E0E0E0', marginLeft: 4.5, marginVertical: 4 },
  rutaTexto: { fontSize: 14, color: '#333', marginLeft: 12, flex: 1 },
  rutaLabel: { fontWeight: '700', color: '#111' },

  cardCompanero: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFEFEF' },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#7A8B85', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' },
  rowInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5E7EB' },
  avatarFallback: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { fontSize: 18, fontWeight: 'bold', color: '#1db954' },
  nombreText: { fontSize: 15, fontWeight: '700', color: '#111' },
  subText: { fontSize: 12, color: '#666' },
  calificacionTexto: { fontSize: 11, color: '#666', fontWeight: '600' },
  precioBox: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  precioLabel: { fontSize: 9, color: '#999', fontWeight: '600' },
  precioValor: { fontSize: 15, fontWeight: 'bold', color: '#1db954' },

  accionesContainer: { marginTop: 22 },
  btnChat: { flex: 1, backgroundColor: '#1db954', height: 50, borderRadius: 25, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', shadowColor: '#1db954', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 2 },
  btnLlamar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  btnFinalizar: { flexDirection: 'row', height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginTop: 12, borderWidth: 1.5, borderColor: '#E0E0E0' },
  btnFinalizarText: { color: '#556B63', fontSize: 13, fontWeight: '700' },
});