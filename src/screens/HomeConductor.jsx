import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, TextInput, StatusBar, Keyboard
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, Octicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import CustomAlert from '../components/CustomAlert';

export default function HomeConductor({ navigation }) {
  const insets = useSafeAreaInsets();
  const [userData, setUserData] = useState(null);
  const [vehiculoData, setVehiculoData] = useState(null);
  const [solicitudesActivas, setSolicitudesActivas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estado para controlar las contraofertas que digita el conductor por cada tarjeta
  const [preciosContraoferta, setPreciosContraoferta] = useState({}); // { solicitudId: "3500" }
  const [cuposContraoferta, setCuposContraoferta] = useState({}); // { solicitudId: "2" }

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '' });
  const mostrarAlerta = (tipo, titulo, mensaje) => setAlertConfig({ visible: true, tipo, titulo, mensaje });

  // ⚠️ Nota: 'f' es el UID de prueba que ya tenías. Lo dejo tal cual para no romper
  // tus pruebas, pero recuerda quitar ese fallback antes de producción real.
  const uidConductor = auth.currentUser?.uid || 'f';

  useEffect(() => {
    let unsubSolicitudes = () => {};

    const inicializarConductor = async () => {
      try {
        // 1. Cargar datos del conductor
        const userSnap = await getDoc(doc(db, 'Usuarios', uidConductor));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          setUserData(uData);

          // 2. Buscar si tiene un vehículo registrado
          // En producción idealmente harías un query en la colección 'Vehiculo' por usuario_id
          // Para esta simulación rápida tomamos el ID si existe o buscamos el primer match
          const vehiculoSnap = await getDoc(doc(db, 'Vehiculo', 'bM07o5H2u9yTkfK1Pyeb'));
          if (vehiculoSnap.exists()) setVehiculoData(vehiculoSnap.data());
        }

        // 3. RADAR EN TIEMPO REAL: Escuchar solicitudes de pasajeros en estado "buscando"
        const q = query(collection(db, 'Solicitud'), where('estado', '==', 'buscando'));
        unsubSolicitudes = onSnapshot(q, (snapshot) => {
          const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setSolicitudesActivas(lista);
          setLoading(false);
        }, (error) => {
          console.error("Error en el radar de solicitudes:", error);
          setLoading(false);
        });

      } catch (error) {
        console.error("Error inicializando HomeConductor:", error);
        setLoading(false);
      }
    };

    inicializarConductor();
    return () => unsubSolicitudes();
  }, []);

  // --- Enviar (o actualizar) una contraoferta a la solicitud del estudiante ---
  const enviarContraoferta = async (solicitudId) => {
    Keyboard.dismiss();
    const precioIngresado = preciosContraoferta[solicitudId];

    if (!precioIngresado || isNaN(precioIngresado) || Number(precioIngresado) <= 0) {
      mostrarAlerta('error', 'Valor inválido', 'Por favor ingresa una tarifa válida para la contraoferta.');
      return;
    }

    const cuposIngresados = cuposContraoferta[solicitudId];
    const cuposFinal = cuposIngresados && !isNaN(cuposIngresados) && Number(cuposIngresados) > 0
      ? Number(cuposIngresados)
      : 1; // Si no especifica, asumimos 1 cupo por defecto

    try {
      const nombreConductor = userData ? `${userData.nombre} ${userData.apellido?.charAt(0)}.` : 'Conductor UTS';
      const vehiculoInfo = vehiculoData ? `${vehiculoData.marca} ${vehiculoData.modelo} (${vehiculoData.placa})` : 'Vehículo UTS';

      // Ruta dinámica para actualizar el Map interno 'ofertas_conductores' usando la notación de punto de Firebase
      const solicitudRef = doc(db, 'Solicitud', solicitudId);

      const actualizacion = {};
      actualizacion[`ofertas_conductores.${uidConductor}`] = {
        conductor_nombre: nombreConductor,
        vehiculo_info: vehiculoInfo,
        vehiculo_id: 'bM07o5H2u9yTkfK1Pyeb',
        precio_contraoferta: Number(precioIngresado),
        tiempo_estimado: '4 min',
        estado_oferta: 'pendiente',
        // 🔗 Datos reales que ya existen en tu BD, para que el pasajero los vea en su tarjeta:
        cupos: cuposFinal,
        calificacion: userData?.calificacion_promedio ?? null,
        verificado: vehiculoData?.verificado ?? false,
      };

      await updateDoc(solicitudRef, actualizacion);
      mostrarAlerta('exito', '¡Oferta Enviada! ✓', 'Esperando que el estudiante acepte tu propuesta.');

    } catch (error) {
      console.error("Error enviando contraoferta:", error);
      mostrarAlerta('error', 'Error', 'No se pudo registrar tu oferta en el sistema.');
    }
  };

  const handlePrecioChange = (id, texto) => {
    setPreciosContraoferta(prev => ({ ...prev, [id]: texto }));
  };
  const handleCuposChange = (id, texto) => {
    setCuposContraoferta(prev => ({ ...prev, [id]: texto }));
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  const BOTTOM_TABS_HEIGHT = 58 + insets.bottom;

  // No mostrar en el radar las solicitudes hechas por el propio conductor
  // (puede pasar si el mismo usuario de prueba también tiene una Solicitud activa como pasajero)
  const solicitudesFiltradas = solicitudesActivas.filter((s) => s.pasajero_id !== uidConductor);

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* HEADER DE BIENVENIDA */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.userInfoRow}>
          <Image
            source={{ uri: userData?.foto_perfil || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200' }}
            style={styles.avatar}
          />
          <View style={styles.userTextSpace}>
            <Text style={styles.welcomeSubtitle}>MODO CONDUCTOR ACTIVO</Text>
            <Text style={styles.userNameText}>{userData?.nombre || 'Docente/Estudiante'}</Text>
          </View>
        </View>

        <View style={styles.verifiedBadge}>
          <Ionicons name="car-sport" size={14} color="#1db954" style={{ marginRight: 4 }} />
          <Text style={styles.verifiedText}>{vehiculoData?.placa || 'Sin Placa'}</Text>
        </View>
      </View>

      {/* RADAR / LISTADO DE PASAJEROS SOLICITANDO VIAJE */}
      <View style={styles.radarHeaderRow}>
        <View style={styles.radarPulseDot}>
          <View style={styles.greenDotSignal} />
        </View>
        <Text style={styles.radarTitleText}>RADAR DE VIAJES ACTIVOS ({solicitudesFiltradas.length})</Text>
      </View>

      <FlatList
        data={solicitudesFiltradas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: BOTTOM_TABS_HEIGHT + 20 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centeredBox}>
            <View style={styles.radarEmptyIconCircle}>
              <MaterialCommunityIcons name="radar" size={30} color="#1db954" />
            </View>
            <Text style={styles.emptyText}>Buscando solicitudes de estudiantes en los campus...</Text>
          </View>
        }
        renderItem={({ item }) => {
          const miOferta = item.ofertas_conductores?.[uidConductor];

          return (
            <View style={styles.solicitudCard}>
              {/* Cabecera de la Solicitud */}
              <View style={styles.cardHeader}>
                <View style={styles.pasajeroInfo}>
                  <View style={styles.pasajeroAvatarFallback}>
                    <FontAwesome5 name="user-graduate" size={13} color="#556B63" />
                  </View>
                  <Text style={styles.pasajeroNombre}>{item.pasajero_nombre || 'Estudiante UTS'}</Text>
                </View>
                <View style={styles.proponeBox}>
                  <Text style={styles.proponeLabel}>Propone</Text>
                  <Text style={styles.precioPasajeroText}>${Number(item.precio_ofertado_pasajero || 0).toLocaleString('es-CO')}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Detalles de Ruta con los mismos puntos de color del resto de la app */}
              <View style={styles.rutaBlock}>
                <View style={styles.rutaRow}>
                  <View style={styles.dotOrigen} />
                  <Text style={styles.rutaText} numberOfLines={1}>{item.origen_nombre}</Text>
                </View>
                <View style={styles.rutaLineaConectora} />
                <View style={styles.rutaRow}>
                  <View style={styles.dotDestino} />
                  <Text style={styles.rutaText} numberOfLines={1}>{item.destino_nombre}</Text>
                </View>
              </View>

              {/* Si ya ofertaste en esta solicitud, se lo mostramos en vez de dejarte "a ciegas" */}
              {miOferta && (
                <View style={styles.yaOfertasteBox}>
                  <Ionicons name="checkmark-circle" size={14} color="#1db954" />
                  <Text style={styles.yaOfertasteTexto}>
                    Ya ofertaste ${Number(miOferta.precio_contraoferta).toLocaleString('es-CO')} · Esperando respuesta
                  </Text>
                </View>
              )}

              {/* Formulario de Contraoferta */}
              <View style={styles.contraofertaRow}>
                <View style={styles.inputContainerPrecio}>
                  <Text style={styles.signoPesos}>$</Text>
                  <TextInput
                    style={styles.precioInput}
                    placeholder="Tu tarifa"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    value={preciosContraoferta[item.id] || ''}
                    onChangeText={(txt) => handlePrecioChange(item.id, txt)}
                  />
                </View>
                <View style={styles.inputContainerCupos}>
                  <Ionicons name="people-outline" size={14} color="#556B63" style={{ marginRight: 4 }} />
                  <TextInput
                    style={styles.cuposInput}
                    placeholder="1"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    value={cuposContraoferta[item.id] || ''}
                    onChangeText={(txt) => handleCuposChange(item.id, txt)}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.enviarOfertaBtn} onPress={() => enviarContraoferta(item.id)}>
                <Text style={styles.enviarOfertaBtnText}>{miOferta ? 'Actualizar oferta' : 'Enviar oferta'}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {/* BARRA DE NAVEGACIÓN INFERIOR (CONVERSORA AL MODO PASAJERO SI SE DESEA) */}
      <View style={[styles.bottomTabsContainer, { height: BOTTOM_TABS_HEIGHT, paddingBottom: insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem}>
          <View style={styles.activeTabIconBg}>
            <Ionicons name="car-sport-outline" size={20} color="#000" />
          </View>
          <Text style={[styles.tabText, styles.activeTabText]}>Radar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('HomePasajero')}>
          <MaterialCommunityIcons name="account-switch-outline" size={22} color="#556B63" style={{ marginBottom: 4 }} />
          <Text style={styles.tabText}>Modo Pasajero</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('PerfilConductor')}>
          <Octicons name="person" size={22} color="#556B63" style={{ marginBottom: 4 }} />
          <Text style={styles.tabText}>Mi Perfil</Text>
        </TouchableOpacity>
      </View>

      <CustomAlert visible={alertConfig.visible} tipo={alertConfig.tipo} titulo={alertConfig.titulo} mensaje={alertConfig.mensaje} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff' },
  userInfoRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E7EB' },
  userTextSpace: { marginLeft: 10 },
  welcomeSubtitle: { fontSize: 10, color: '#1db954', fontWeight: '800', letterSpacing: 0.5 },
  userNameText: { fontSize: 17, fontWeight: 'bold', color: '#111', marginTop: 2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  verifiedText: { fontSize: 12, color: '#1db954', fontWeight: '700' },

  radarHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 18, marginBottom: 14 },
  radarPulseDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  greenDotSignal: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1db954' },
  radarTitleText: { fontSize: 13, fontWeight: '800', color: '#111', letterSpacing: 0.3 },

  listContent: { paddingHorizontal: 20 },
  centeredBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  radarEmptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', paddingHorizontal: 40, lineHeight: 19 },

  solicitudCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#EFEFEF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pasajeroInfo: { flexDirection: 'row', alignItems: 'center' },
  pasajeroAvatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  pasajeroNombre: { fontSize: 14, fontWeight: '700', color: '#111', marginLeft: 8 },
  proponeBox: { alignItems: 'flex-end' },
  proponeLabel: { fontSize: 10, color: '#999', fontWeight: '600' },
  precioPasajeroText: { fontSize: 15, fontWeight: '800', color: '#111' },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 14 },

  rutaBlock: { marginBottom: 4 },
  rutaRow: { flexDirection: 'row', alignItems: 'center' },
  dotOrigen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1db954' },
  dotDestino: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  rutaLineaConectora: { width: 1, height: 14, backgroundColor: '#E0E0E0', marginLeft: 4.5, marginVertical: 2 },
  rutaText: { fontSize: 13, color: '#333', marginLeft: 10, flex: 1, fontWeight: '500' },

  yaOfertasteBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF6EE', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 14 },
  yaOfertasteTexto: { fontSize: 12, color: '#1db954', fontWeight: '600', marginLeft: 6, flex: 1 },

  contraofertaRow: { flexDirection: 'row', marginTop: 14 },
  inputContainerPrecio: { flex: 1.4, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', height: 44, borderRadius: 12, paddingHorizontal: 12, marginRight: 8 },
  inputContainerCupos: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', height: 44, borderRadius: 12, paddingHorizontal: 12 },
  signoPesos: { fontSize: 14, fontWeight: '700', color: '#556B63', marginRight: 4 },
  precioInput: { flex: 1, fontSize: 14, color: '#000', padding: 0, fontWeight: '600' },
  cuposInput: { flex: 1, fontSize: 14, color: '#000', padding: 0, fontWeight: '600' },

  enviarOfertaBtn: { backgroundColor: '#1db954', height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#1db954', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 2 },
  enviarOfertaBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  bottomTabsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEEEEE' },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  activeTabIconBg: { width: 48, height: 32, borderRadius: 16, backgroundColor: '#D1EFE0', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  tabText: { fontSize: 11, color: '#556B63', fontWeight: '500' },
  activeTabText: { color: '#1db954', fontWeight: '700' }
});