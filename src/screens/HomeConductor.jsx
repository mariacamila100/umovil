import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, TextInput, StatusBar, Keyboard
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, Octicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs } from 'firebase/firestore';
import CustomAlert from '../components/CustomAlert';

export default function HomeConductor({ navigation }) {
  const insets = useSafeAreaInsets();
  const [userData, setUserData] = useState(null);
  const [vehiculoData, setVehiculoData] = useState(null);
  const [solicitudesActivas, setSolicitudesActivas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viajeActivoId, setViajeActivoId] = useState(null);

  // Estado para controlar las contraofertas que digita el conductor por cada tarjeta
  const [preciosContraoferta, setPreciosContraoferta] = useState({}); // { solicitudId: "3500" }
  const [cuposContraoferta, setCuposContraoferta] = useState({}); // { solicitudId: "2" }

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '' });
  const mostrarAlerta = (tipo, titulo, mensaje) => setAlertConfig({ visible: true, tipo, titulo, mensaje });

  const uidConductor = auth.currentUser?.uid;

  useEffect(() => {
    if (!auth.currentUser) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      return;
    }

    let unsubSolicitudes = () => {};
    let unsubViajeActivo = () => {};

    const inicializarConductor = async () => {
      try {
        const uid = auth.currentUser.uid;
        // 1. Cargar datos del conductor
        const userSnap = await getDoc(doc(db, 'Usuarios', uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          setUserData(uData);

          // 2. Buscar si tiene un vehículo registrado en la base de datos
          const vehQuery = query(collection(db, 'Vehiculo'), where('usuario_id', '==', uid));
          const vehSnap = await getDocs(vehQuery);
          if (!vehSnap.empty) {
            setVehiculoData({ id: vehSnap.docs[0].id, ...vehSnap.docs[0].data() });
          }

          // Escuchar si tiene un viaje activo
          const qViaje = query(
            collection(db, 'Viajes'),
            where('conductor_id', '==', uid),
            where('estado', '==', 'en_curso')
          );
          unsubViajeActivo = onSnapshot(qViaje, (snapshot) => {
            if (!snapshot.empty) {
              setViajeActivoId(snapshot.docs[0].id);
            } else {
              setViajeActivoId(null);
            }
          });
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

    return () => {
      unsubSolicitudes();
      unsubViajeActivo();
    };
  }, []);

  // Temporizador para refrescar la UI cada segundo y actualizar los conteos regresivos de ofertas
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
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
        vehiculo_id: userData?.vehiculo_id || 'bM07o5H2u9yTkfK1Pyeb',
        precio_contraoferta: Number(precioIngresado),
        tiempo_estimado: '4 min',
        estado_oferta: 'pendiente',
        timestamp_oferta: Date.now(),
        // 🔗 Datos reales que ya existen en tu BD, para que el pasajero los vea en su tarjeta:
        cupos: cuposFinal,
        calificacion: userData?.calificacion_promedio ?? null,
        num_calificaciones: userData?.num_calificaciones ?? 0,
        verificado: vehiculoData?.verificado ?? false,
        conductor_foto: userData?.foto_perfil ?? '',
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
  // o aquellas cuyas ofertas hayan expirado o hayan sido rechazadas hace más de 10 segundos.
  const TIEMPO_EXPIRACION_MS = 45000;
  const TIEMPO_GRACIA_MS = 10000;

  const solicitudesFiltradas = solicitudesActivas
    .filter((s) => s.pasajero_id !== uidConductor)
    .filter((s) => {
      const miOferta = s.ofertas_conductores?.[uidConductor];
      if (!miOferta) return true; // No has ofertado, mostrar en el radar

      const tiempoPasado = Date.now() - (miOferta.timestamp_oferta || 0);
      const esExpirada = tiempoPasado > TIEMPO_EXPIRACION_MS;
      const esRechazada = miOferta.estado_oferta === 'rechazada';

      if (esRechazada) {
        const tiempoRechazo = Date.now() - (miOferta.timestamp_rechazo || 0);
        return tiempoRechazo < TIEMPO_GRACIA_MS; // Mostrar solo durante los primeros 10s de haber sido rechazada
      }

      if (esExpirada) {
        return tiempoPasado < (TIEMPO_EXPIRACION_MS + TIEMPO_GRACIA_MS); // Mostrar solo durante los primeros 10s tras expirar (total < 55s)
      }

      return true; // Oferta activa, mostrar
    });

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* HEADER DE BIENVENIDA */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 16 }]}>
        <View style={styles.userInfoRow}>
          <Image
            source={{ uri: userData?.foto_perfil || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200' }}
            style={styles.avatar}
          />
          <View style={styles.userTextSpace}>
            <View style={styles.modeBadge}>
              <MaterialCommunityIcons name="steering" size={12} color="#1db954" style={{ marginRight: 4 }} />
              <Text style={styles.modeBadgeText}>Conductor Activo</Text>
            </View>
            <Text style={styles.userNameText}>{userData?.nombre ? `${userData.nombre} ${userData.apellido || ''}` : 'Conductor UTS'}</Text>
          </View>
        </View>
        <View style={styles.headerRightActions}>
          {vehiculoData ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="car-sport" size={14} color="#1db954" style={{ marginRight: 4 }} />
              <Text style={styles.verifiedText}>{vehiculoData.placa}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {viajeActivoId ? (
        <TouchableOpacity
          style={styles.viajeActivoBanner}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ViajeEnCurso', { viajeId: viajeActivoId })}
        >
          <MaterialCommunityIcons name="steering" size={20} color="#1db954" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.viajeActivoBannerText}>Viaje activo como conductor</Text>
            <Text style={styles.viajeActivoBannerSub}>Toca para abrir el mapa de ruta ➔</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {!vehiculoData && (
        <View style={styles.noVehiculoBanner}>
          <Ionicons name="warning-outline" size={20} color="#D97706" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noVehiculoTitle}>Falta registro de vehículo</Text>
            <Text style={styles.noVehiculoText}>Registra tu vehículo para empezar a realizar ofertas.</Text>
          </View>
          <TouchableOpacity style={styles.noVehiculoBtn} onPress={() => navigation.navigate('RegistrarVehiculo')} activeOpacity={0.8}>
            <Text style={styles.noVehiculoBtnText}>Registrar</Text>
          </TouchableOpacity>
        </View>
      )}

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
          const TIEMPO_EXPIRACION_MS = 45000;
          const tiempoPasado = miOferta ? Date.now() - (miOferta.timestamp_oferta || 0) : 0;
          const esExpirada = miOferta && (tiempoPasado > TIEMPO_EXPIRACION_MS);
          const esRechazada = miOferta && miOferta.estado_oferta === 'rechazada';
          const esActiva = miOferta && !esRechazada && !esExpirada;

          const segundosRestantes = esActiva
            ? Math.max(0, 45 - Math.floor(tiempoPasado / 1000))
            : 0;

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

              {/* Si ya ofertaste y está activa, mostramos el conteo regresivo */}
              {esActiva && (
                <View style={styles.yaOfertasteBox}>
                  <Ionicons name="time-outline" size={14} color="#1db954" style={{ marginRight: 6 }} />
                  <Text style={styles.yaOfertasteTexto}>
                    Ya ofertaste ${Number(miOferta.precio_contraoferta).toLocaleString('es-CO')} · Esperando respuesta ({segundosRestantes}s)
                  </Text>
                </View>
              )}

              {/* Si la oferta no está activa (por rechazo, expiración, o nunca se ha ofertado) */}
              {!esActiva && (
                <>
                  {esRechazada && (
                    <View style={styles.rechazadaBox}>
                      <Ionicons name="close-circle-outline" size={14} color="#EF4444" style={{ marginRight: 6 }} />
                      <Text style={styles.rechazadaTexto}>
                        Tu oferta de ${Number(miOferta.precio_contraoferta).toLocaleString('es-CO')} fue rechazada
                      </Text>
                    </View>
                  )}

                  {esExpirada && !esRechazada && (
                    <View style={styles.expiradaBox}>
                      <Ionicons name="alert-circle-outline" size={14} color="#D97706" style={{ marginRight: 6 }} />
                      <Text style={styles.expiradaTexto}>
                        Tu oferta de ${Number(miOferta.precio_contraoferta).toLocaleString('es-CO')} expiró
                      </Text>
                    </View>
                  )}

                  {/* Formulario de Contraoferta */}
                  <View style={styles.contraofertaRow}>
                    <View style={[styles.inputContainerPrecio, !vehiculoData && styles.disabledInputContainer]}>
                      <Text style={styles.signoPesos}>$</Text>
                      <TextInput
                        style={[styles.precioInput, !vehiculoData && styles.disabledInput]}
                        placeholder="Tu tarifa"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        value={preciosContraoferta[item.id] || ''}
                        onChangeText={(txt) => handlePrecioChange(item.id, txt)}
                        editable={!!vehiculoData}
                      />
                    </View>
                    <View style={[styles.inputContainerCupos, !vehiculoData && styles.disabledInputContainer]}>
                      <Ionicons name="people-outline" size={14} color="#556B63" style={{ marginRight: 4 }} />
                      <TextInput
                        style={[styles.cuposInput, !vehiculoData && styles.disabledInput]}
                        placeholder="1"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        value={cuposContraoferta[item.id] || ''}
                        onChangeText={(txt) => handleCuposChange(item.id, txt)}
                        editable={!!vehiculoData}
                      />
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={[styles.enviarOfertaBtn, !vehiculoData && styles.enviarOfertaBtnDisabled]} 
                    onPress={() => {
                      if (!vehiculoData) {
                        mostrarAlerta('warning', 'Vehículo requerido', 'Debes registrar tu vehículo antes de realizar ofertas de viaje.');
                      } else {
                        enviarContraoferta(item.id);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.enviarOfertaBtnText}>
                      {miOferta ? 'Volver a ofertar' : 'Enviar oferta'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
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

        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('MisViajes', { role: 'conductor' })}>
          <Feather name="git-commit" size={22} color="#556B63" style={{ transform: [{ rotate: '90deg' }], marginBottom: 4 }} />
          <Text style={styles.tabText}>Mis viajes</Text>
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
  headerContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingBottom: 16, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  userInfoRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E7EB', borderWidth: 2, borderColor: '#EAF6EE' },
  userTextSpace: { marginLeft: 12 },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF6EE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1db954',
    textTransform: 'uppercase',
  },
  userNameText: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  verifiedText: { fontSize: 12, color: '#1db954', fontWeight: '700' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },

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

  rechazadaBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 14 },
  rechazadaTexto: { fontSize: 12, color: '#EF4444', fontWeight: '600', marginLeft: 6, flex: 1 },
  expiradaBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 14 },
  expiradaTexto: { fontSize: 12, color: '#D97706', fontWeight: '600', marginLeft: 6, flex: 1 },

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
  activeTabText: { color: '#1db954', fontWeight: '700' },
  viajeActivoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF6EE', // verde suave premium
    borderWidth: 1.5,
    borderColor: '#D1EFE0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 5,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  viajeActivoBannerText: {
    color: '#1E4620',
    fontSize: 14,
    fontWeight: 'bold',
  },
  viajeActivoBannerSub: {
    color: '#446A46',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  noVehiculoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 5,
  },
  noVehiculoTitle: { fontSize: 13, fontWeight: '700', color: '#B45309' },
  noVehiculoText: { fontSize: 11, color: '#D97706', marginTop: 2, lineHeight: 14, pr: 8 },
  noVehiculoBtn: { backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginLeft: 8 },
  noVehiculoBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  disabledInputContainer: { backgroundColor: '#E5E7EB', opacity: 0.6 },
  disabledInput: { color: '#777' },
  enviarOfertaBtnDisabled: { backgroundColor: '#A1A1AA', shadowColor: 'transparent', elevation: 0 },
});