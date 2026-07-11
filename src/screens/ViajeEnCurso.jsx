import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Platform, Linking, Dimensions } from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot, getDoc, updateDoc, collection, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import CustomAlert from '../components/CustomAlert';

// react-native-maps no corre en web, igual que en BuscarViaje.jsx
let MapView, Marker, Polyline, PROVIDER_GOOGLE;
if (Platform.OS !== 'web') {
  const MapModules = require('react-native-maps');
  MapView = MapModules.default;
  Marker = MapModules.Marker;
  Polyline = MapModules.Polyline;
  PROVIDER_GOOGLE = MapModules.PROVIDER_GOOGLE;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 260;

export default function ViajeEnCurso({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { viajeId } = route.params; // Pasamos el ID del viaje al navegar
  const [viaje, setViaje] = useState(null);
  const [loading, setLoading] = useState(true);
  const [companeroData, setCompaneroData] = useState(null);
  const [vehiculoData, setVehiculoData] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [notificacionMensaje, setNotificacionMensaje] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Coordenadas de la ruta dibujada sobre el mapa
  const [rutaCoords, setRutaCoords] = useState([]);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const mapRef = useRef(null);

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
        if (!companeroData && idCompanero) {
          const userSnap = await getDoc(doc(db, 'Usuarios', idCompanero));
          if (userSnap.exists()) setCompaneroData(userSnap.data());
        }

        // Si soy pasajero, traemos los datos reales del vehículo
        if (esPasajero && datosViaje.vehiculo_id && !vehiculoData) {
          const vehSnap = await getDoc(doc(db, 'Vehiculo', datosViaje.vehiculo_id));
          if (vehSnap.exists()) setVehiculoData(vehSnap.data());
        }

        // Si el viaje se finaliza, redirigir y limpiar la pila de navegación
        if (datosViaje.estado === 'finalizado') {
          if (esPasajero) {
            navigation.replace('CalificarViaje', { viajeId: viajeId });
          } else {
            navigation.replace('HomeConductor');
          }
          return;
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [viajeId]);

  // --- Trazar la ruta real sobre el mapa (estilo InDrive) usando OSRM ---
  // Requiere que el documento del Viaje tenga origen_coords y destino_coords
  // (ver el ajuste sugerido en BuscarViaje.jsx -> aceptarOfertaConductor).
  useEffect(() => {
    const trazarRuta = async () => {
      if (Platform.OS === 'web') return;
      if (!viaje?.origen_coords || !viaje?.destino_coords) return;

      setCargandoRuta(true);
      try {
        const { latitude: oLat, longitude: oLng } = viaje.origen_coords;
        const { latitude: dLat, longitude: dLng } = viaje.destino_coords;
        const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'UmovilApp/1.0 (contacto: mariacduarte@uts.edu.co)'
          }
        });
        const data = await resp.json();

        if (data.routes && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
            latitude: lat,
            longitude: lng,
          }));
          setRutaCoords(coords);

          // Encuadrar el mapa para que se vea toda la ruta
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(coords, {
              edgePadding: { top: 60, right: 50, bottom: 60, left: 50 },
              animated: true,
            });
          }, 300);
        } else {
          // Si OSRM no responde, al menos dibujamos línea recta entre los dos puntos
          setRutaCoords([
            { latitude: oLat, longitude: oLng },
            { latitude: dLat, longitude: dLng },
          ]);
        }
      } catch (error) {
        console.error('Error trazando ruta:', error);
        // Fallback: línea recta si falla la petición de red
        setRutaCoords([
          { latitude: viaje.origen_coords.latitude, longitude: viaje.origen_coords.longitude },
          { latitude: viaje.destino_coords.latitude, longitude: viaje.destino_coords.longitude },
        ]);
      } finally {
        setCargandoRuta(false);
      }
    };

    trazarRuta();
  }, [viaje?.origen_coords, viaje?.destino_coords]);

  // --- Seguimiento GPS en tiempo real para el Conductor ---
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!viaje || viaje.estado !== 'en_curso') return;

    // Solo si el usuario logueado es el conductor, rastreamos su GPS
    const uidActual = auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2';
    const esPasajero = viaje.pasajero_id === uidActual;
    if (esPasajero) return; 

    let subscription = null;

    const iniciarSeguimiento = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Permiso de ubicación denegado para el conductor.');
          return;
        }

        // Suscribirse a cambios de posición del conductor
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 6000,   // cada 6 segundos
            distanceInterval: 10, // cada 10 metros
          },
          async (newLocation) => {
            const { latitude, longitude } = newLocation.coords;
            try {
              await updateDoc(doc(db, 'Viajes', viajeId), {
                conductor_actual_coords: { latitude, longitude }
              });
            } catch (err) {
              console.error('Error actualizando ubicación del conductor:', err);
            }
          }
        );
      } catch (error) {
        console.error('Error iniciando geolocalización de seguimiento:', error);
      }
    };

    iniciarSeguimiento();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [viajeId, viaje?.pasajero_id, viaje?.estado]);

  const uidActual = auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2';
  const esPasajero = viaje?.pasajero_id === uidActual;

  const handleBack = () => {
    if (esPasajero) {
      navigation.navigate('PasajeroTabs');
    } else {
      navigation.navigate('HomeConductor');
    }
  };

  // Interceptar el retroceso físico o gestual para redirigir a Home en vez de BuscarViaje
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Si el viaje no existe o ya no está en curso (finalizado/cancelado), permitir retroceder normalmente
      if (!viaje || viaje.estado !== 'en_curso') {
        return;
      }

      // Si la navegación es un REPLACE o RESET (como cuando el viaje finaliza), permitir
      if (e.data.action.type === 'REPLACE' || e.data.action.type === 'RESET') {
        return;
      }

      // Impedir el retroceso tradicional
      e.preventDefault();

      // Redirigir limpiamente a la pantalla de inicio correspondiente
      handleBack();
    });

    return unsubscribe;
  }, [navigation, viaje?.estado, esPasajero]);

  // --- Notificación de nuevos mensajes de chat en tiempo real ---
  useEffect(() => {
    const mensajesRef = collection(db, 'Viajes', viajeId, 'Mensajes');
    const q = query(mensajesRef, orderBy('creado_en', 'desc'), limit(1));
    
    let primeraCarga = true;
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;
      
      // Evitar notificaciones al cargar la pantalla (mensajes pasados)
      if (primeraCarga) {
        primeraCarga = false;
        return;
      }
      
      const ultimoMsg = snapshot.docs[0].data();
      const remitenteId = ultimoMsg.remitente_id;
      
      // Solo notificar si el remitente no soy yo
      if (remitenteId && remitenteId !== uidActual) {
        setNotificacionMensaje({
          texto: ultimoMsg.texto,
          remitenteNombre: companeroData?.nombre || 'Compañero'
        });
        
        // Incrementar el indicador de mensajes no leídos
        setUnreadCount((c) => c + 1);
        
        // Ocultar banner flotante tras 6 segundos
        setTimeout(() => {
          setNotificacionMensaje(null);
        }, 6000);
      }
    }, (error) => {
      console.error("Error escuchando mensajes para notificaciones:", error);
    });
    
    return () => unsubscribe();
  }, [viajeId, uidActual, companeroData]);

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

  const tieneCoords = !!(viaje.origen_coords && viaje.destino_coords);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      {/* Notificación flotante de nuevos mensajes */}
      {notificacionMensaje ? (
        <TouchableOpacity 
          style={[styles.floatingNotification, { top: insets.top + 60 }]} 
          activeOpacity={0.9}
          onPress={() => {
            setNotificacionMensaje(null);
            navigation.navigate('ChatViaje', { viajeId });
          }}
        >
          <View style={styles.notificationBubbleIcon}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
          </View>
          <View style={styles.notificationTextSpace}>
            <Text style={styles.notificationTitle}>Nuevo mensaje de {notificacionMensaje.remitenteNombre}</Text>
            <Text style={styles.notificationText} numberOfLines={1}>{notificacionMensaje.texto}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#999" />
        </TouchableOpacity>
      ) : null}

      {/* MAPA CON LA RUTA — estilo InDrive: pin verde de origen, pin rojo de destino, línea de ruta */}
      {Platform.OS !== 'web' && tieneCoords ? (
        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: viaje.origen_coords.latitude,
              longitude: viaje.origen_coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker coordinate={viaje.origen_coords} title="Origen" description={viaje.origen_nombre}>
              <View style={styles.pinOrigen}>
                <View style={styles.pinOrigenNucleo} />
              </View>
            </Marker>
            <Marker coordinate={viaje.destino_coords} title="Destino" description={viaje.destino_nombre}>
              <View style={styles.pinDestino}>
                <Ionicons name="flag" size={12} color="#fff" />
              </View>
            </Marker>
            {viaje.conductor_actual_coords && (
              <Marker 
                coordinate={viaje.conductor_actual_coords} 
                title="Conductor" 
                description="Ubicación actual del vehículo"
              >
                <View style={styles.pinConductor}>
                  <FontAwesome5 name="car" size={12} color="#fff" />
                </View>
              </Marker>
            )}
            {rutaCoords.length > 0 && (
              <Polyline coordinates={rutaCoords} strokeColor="#1db954" strokeWidth={4} />
            )}
          </MapView>

          {cargandoRuta && (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="small" color="#1db954" />
            </View>
          )}

          <TouchableOpacity style={[styles.mapBackButton, { top: insets.top + 10 }]} onPress={handleBack}>
            <Ionicons name="arrow-back" size={18} color="#111" />
          </TouchableOpacity>

          <View style={styles.badgeEnCursoFlotante}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>Activo</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: insets.top + 18, paddingHorizontal: 20 }]}>
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
      )}

      <View style={{ paddingHorizontal: 20 }}>
        {/* RUTA en texto, siempre visible como resumen debajo del mapa */}
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
          <View style={styles.accionesRowContainer}>
            <TouchableOpacity
              style={styles.btnChatCompact}
              onPress={() => {
                setUnreadCount(0); // Limpiar contador al entrar
                setNotificacionMensaje(null); // Limpiar banner
                navigation.navigate('ChatViaje', { viajeId: viajeId });
              }}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.btnTextCompact}>Chat</Text>
              {unreadCount > 0 ? (
                <View style={styles.chatBadgeCompact}>
                  <Text style={styles.chatBadgeTextCompact}>{unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnLlamarCompact} onPress={llamarCompanero}>
              <Ionicons name="call" size={16} color="#1db954" />
            </TouchableOpacity>

            {!esPasajero ? (
              <TouchableOpacity style={styles.btnFinalizarCompact} onPress={finalizarViaje} disabled={finalizando}>
                {finalizando ? (
                  <ActivityIndicator color="#EF4444" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="flag-checkered" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={styles.btnFinalizarTextCompact}>Finalizar</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
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
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  mapWrapper: { width: SCREEN_WIDTH, height: MAP_HEIGHT, backgroundColor: '#E5E7EB' },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  mapBackButton: { position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4 },
  badgeEnCursoFlotante: { position: 'absolute', right: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4 },

  pinOrigen: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 3, borderColor: '#1db954', justifyContent: 'center', alignItems: 'center' },
  pinOrigenNucleo: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1db954' },
  pinDestino: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  pinConductor: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1db954', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3.84, shadowOffset: { width: 0, height: 2 } },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  headerSubtitle: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  badgeEnCurso: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1db954', marginRight: 6 },
  badgeText: { color: '#1db954', fontWeight: '700', fontSize: 12 },

  rutaBox: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFEFEF', marginBottom: 16, marginTop: 16 },
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
  accionesRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    width: '100%',
  },
  btnChatCompact: {
    flex: 1.1,
    backgroundColor: '#1db954',
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  btnTextCompact: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  btnLlamarCompact: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EAF6EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  btnFinalizarCompact: {
    flex: 1.2,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  btnFinalizarTextCompact: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  chatBadgeCompact: {
    position: 'absolute',
    right: 12,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  chatBadgeTextCompact: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },

  floatingNotification: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 9999,
    borderWidth: 1,
    borderColor: '#E8F5E9',
    borderLeftWidth: 5,
    borderLeftColor: '#1db954',
  },
  notificationBubbleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAF6EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  notificationTextSpace: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1db954',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notificationText: {
    fontSize: 13,
    color: '#222',
    marginTop: 1,
    fontWeight: '600',
  },
});