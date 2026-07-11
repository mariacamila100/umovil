import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Platform, ScrollView, SafeAreaView, Dimensions
} from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import CustomAlert from '../components/CustomAlert';

let MapView, Marker, Polyline, PROVIDER_GOOGLE;
if (Platform.OS !== 'web') {
  const MapModules = require('react-native-maps');
  MapView = MapModules.default;
  Marker = MapModules.Marker;
  Polyline = MapModules.Polyline;
  PROVIDER_GOOGLE = MapModules.PROVIDER_GOOGLE;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 220;

export default function DetalleViaje({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { viajeId, role } = route.params;

  const [viaje, setViaje] = useState(null);
  const [loading, setLoading] = useState(true);
  const [companeroData, setCompaneroData] = useState(null);
  const [vehiculoData, setVehiculoData] = useState(null);
  const [calificacionData, setCalificacionData] = useState(null);
  
  const [rutaCoords, setRutaCoords] = useState([]);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const mapRef = useRef(null);

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '' });
  const mostrarAlerta = (tipo, titulo, mensaje) => setAlertConfig({ visible: true, tipo, titulo, mensaje });

  useEffect(() => {
    const fetchViajeDetalles = async () => {
      try {
        const viajeDoc = await getDoc(doc(db, 'Viajes', viajeId));
        if (viajeDoc.exists()) {
          const vData = viajeDoc.data();
          setViaje(vData);

          // Obtener datos del compañero
          const uidActual = auth.currentUser?.uid || 'f';
          const esPasajero = vData.pasajero_id === uidActual;
          const idCompanero = esPasajero ? vData.conductor_id : vData.pasajero_id;

          if (idCompanero) {
            const userSnap = await getDoc(doc(db, 'Usuarios', idCompanero));
            if (userSnap.exists()) {
              setCompaneroData(userSnap.data());
            }
          }

          // Obtener datos del vehículo
          if (esPasajero && vData.vehiculo_id) {
            const vehSnap = await getDoc(doc(db, 'Vehiculo', vData.vehiculo_id));
            if (vehSnap.exists()) {
              setVehiculoData(vehSnap.data());
            }
          }

          // Obtener la calificación de este viaje específico
          const califQuery = query(
            collection(db, 'Calificacion'),
            where('viaje_id', '==', viajeId)
          );
          const califSnap = await getDocs(califQuery);
          if (!califSnap.empty) {
            setCalificacionData(califSnap.docs[0].data());
          }
        }
      } catch (error) {
        console.error("Error al cargar detalles de viaje:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchViajeDetalles();
  }, [viajeId]);

  // Trazar la ruta en el mapa
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

          setTimeout(() => {
            mapRef.current?.fitToCoordinates(coords, {
              edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
              animated: true,
            });
          }, 300);
        } else {
          setRutaCoords([
            { latitude: oLat, longitude: oLng },
            { latitude: dLat, longitude: dLng }
          ]);
        }
      } catch (error) {
        console.error('Error trazando ruta en detalle:', error);
        setRutaCoords([
          { latitude: viaje.origen_coords.latitude, longitude: viaje.origen_coords.longitude },
          { latitude: viaje.destino_coords.latitude, longitude: viaje.destino_coords.longitude }
        ]);
      } finally {
        setCargandoRuta(false);
      }
    };

    trazarRuta();
  }, [viaje]);

  const formatFechaTitle = (fechaObj) => {
    if (!fechaObj) return '';
    const date = fechaObj.toDate ? fechaObj.toDate() : new Date(fechaObj);
    return date.toLocaleDateString('es-CO', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatHoraText = (fechaObj) => {
    if (!fechaObj) return '';
    const date = fechaObj.toDate ? fechaObj.toDate() : new Date(fechaObj);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1db954" />
        <Text style={styles.loadingText}>Cargando detalles de tu viaje...</Text>
      </View>
    );
  }

  const esPasajero = role === 'pasajero';
  const scoreCalificacion = calificacionData?.puntuacion || 5;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Platform.OS === 'android' ? 30 : 0 }]}>
      {/* HEADER BAR */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{formatFechaTitle(viaje?.fecha_hora)}</Text>
          <Text style={styles.headerSubtitle}>{formatHoraText(viaje?.fecha_hora)}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
        {/* MAP VIEW */}
        <View style={styles.mapWrapper}>
          {Platform.OS === 'web' ? (
            <View style={styles.mapWebMock}>
              <View style={styles.mockStreetVertical} />
              <View style={styles.mockStreetHorizontal} />
              <View style={styles.webMapBadge}>
                <Ionicons name="map-outline" size={14} color="#556B63" style={{ marginRight: 5 }} />
                <Text style={styles.webMapBadgeText}>Mapa de viaje estático (Mock Web)</Text>
              </View>
            </View>
          ) : (
            viaje?.origen_coords && (
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: viaje.origen_coords.latitude,
                  longitude: viaje.origen_coords.longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
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
                {rutaCoords.length > 0 && (
                  <Polyline coordinates={rutaCoords} strokeColor="#1db954" strokeWidth={4} />
                )}
              </MapView>
            )
          )}
          {cargandoRuta && (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="small" color="#1db954" />
            </View>
          )}
        </View>

        {/* DETALLES RESUMIDOS DEL VIAJE */}
        <View style={styles.sectionCard}>
          <View style={styles.summaryTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Viaje en la ciudad</Text>
              <Text style={styles.summaryStatusText}>Viaje • Completado</Text>
            </View>
            <View style={styles.carIconCircle}>
              <MaterialCommunityIcons name={esPasajero ? "car-sport" : "steering"} size={22} color="#1db954" />
            </View>
          </View>

          {/* RUTA TIMELINE */}
          <View style={styles.rutaTimeline}>
            <View style={styles.rutaCol}>
              <View style={styles.rutaPinWrapper}>
                <View style={styles.dotGreen} />
                <View style={styles.rutaDottedLine} />
                <View style={styles.dotRed} />
              </View>
              <View style={styles.rutaTextWrapper}>
                <View style={styles.rutaLocRow}>
                  <Text style={styles.rutaLocText} numberOfLines={1}>{viaje?.origen_nombre}</Text>
                  <Text style={styles.rutaTimeText}>{formatHoraText(viaje?.fecha_hora)}</Text>
                </View>
                <View style={{ height: 26 }} />
                <View style={styles.rutaLocRow}>
                  <Text style={styles.rutaLocText} numberOfLines={1}>{viaje?.destino_nombre}</Text>
                  <Text style={styles.rutaTimeText}>
                    {viaje?.fecha_hora ? formatHoraText(new Date((viaje.fecha_hora.seconds || Date.now() / 1000) * 1000 + 1200 * 1000)) : ''}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ESTADÍSTICAS DEL VIAJE */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Ionicons name="time-outline" size={16} color="#7A8B85" style={{ marginRight: 6 }} />
              <Text style={styles.statLabel}>Duración</Text>
              <Text style={styles.statValue}>20 min.</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Ionicons name="git-commit" size={16} color="#7A8B85" style={{ marginRight: 6 }} />
              <Text style={styles.statLabel}>Distancia</Text>
              <Text style={styles.statValue}>3.5 km</Text>
            </View>
          </View>
        </View>

        {/* DETALLES DE LA CONTRAPARTE */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardLabel}>{esPasajero ? 'Tu Conductor' : 'Tu Pasajero'}</Text>
          
          <View style={styles.companeroRow}>
            {companeroData?.foto_perfil ? (
              <Image source={{ uri: companeroData.foto_perfil }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{(companeroData?.nombre?.charAt(0) || '?').toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.nombreText}>
                {companeroData ? `${companeroData.nombre} ${companeroData.apellido || ''}` : 'Estudiante UTS'}
              </Text>
              <Text style={styles.subtext}>
                {esPasajero 
                  ? (vehiculoData ? `${vehiculoData.color} ${vehiculoData.marca} ${vehiculoData.modelo}, ${vehiculoData.placa}` : 'Vehículo registrado UTS')
                  : 'Estudiante verificado UTS'
                }
              </Text>
            </View>
          </View>

          {/* CALIFICACIÓN DE VIAJE */}
          <View style={styles.calificacionSection}>
            <Text style={styles.calificacionLabel}>
              {calificacionData ? 'Tu calificación para el viaje' : 'Calificación del viaje'}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= scoreCalificacion ? 'star' : 'star-outline'}
                  size={26}
                  color={star <= scoreCalificacion ? '#FBBF24' : '#E5E7EB'}
                  style={{ marginHorizontal: 4 }}
                />
              ))}
            </View>
            {calificacionData?.comentario ? (
              <Text style={styles.calificacionComentario}>"{calificacionData.comentario}"</Text>
            ) : null}
          </View>
        </View>



      </ScrollView>

      <CustomAlert visible={alertConfig.visible} tipo={alertConfig.tipo} titulo={alertConfig.titulo} mensaje={alertConfig.mensaje} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
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
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  headerSubtitle: { fontSize: 11, color: '#777', marginTop: 1 },

  mapWrapper: { width: SCREEN_WIDTH, height: MAP_HEIGHT, backgroundColor: '#E5E7EB', position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  mapWebMock: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  mockStreetVertical: { position: 'absolute', width: 40, height: '100%', backgroundColor: '#fff' },
  mockStreetHorizontal: { position: 'absolute', width: '100%', height: 40, backgroundColor: '#fff' },
  webMapBadge: { position: 'absolute', bottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, elevation: 1 },
  webMapBadgeText: { fontSize: 11, color: '#556B63', fontWeight: '600' },

  pinOrigen: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 3, borderColor: '#1db954', justifyContent: 'center', alignItems: 'center' },
  pinOrigenNucleo: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1db954' },
  pinDestino: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  summaryTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  summaryTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  summaryStatusText: { fontSize: 13, color: '#1db954', fontWeight: '700', marginTop: 2 },
  carIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },

  rutaTimeline: { marginBottom: 18 },
  rutaCol: { flexDirection: 'row' },
  rutaPinWrapper: { alignItems: 'center', justifyContent: 'center', width: 20, marginRight: 12 },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1db954' },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  rutaDottedLine: { width: 1.5, height: 26, backgroundColor: '#E5E7EB', marginVertical: 4 },
  rutaTextWrapper: { flex: 1, justifyContent: 'center' },
  rutaLocRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rutaLocText: { fontSize: 13, color: '#111', fontWeight: '700', flex: 1, marginRight: 10 },
  rutaTimeText: { fontSize: 12, color: '#777', fontWeight: '500' },

  statsRow: { flexDirection: 'row', backgroundColor: '#FAFAFA', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#F0F0F0', alignItems: 'center' },
  statBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 12, color: '#7A8B85', fontWeight: '600', marginRight: 4 },
  statValue: { fontSize: 12, color: '#111', fontWeight: '700' },
  statDivider: { width: 1, height: 20, backgroundColor: '#ECECEC' },

  cardLabel: { fontSize: 10, fontWeight: '700', color: '#7A8B85', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' },
  companeroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB' },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { fontSize: 18, fontWeight: 'bold', color: '#1db954' },
  nombreText: { fontSize: 15, fontWeight: '700', color: '#111' },
  subtext: { fontSize: 12, color: '#666', marginTop: 3 },

  calificacionSection: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 16, alignItems: 'center' },
  calificacionLabel: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 10 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  calificacionComentario: { fontSize: 13, color: '#556B63', marginTop: 10, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 10 },

  actionsPanel: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginTop: 24, marginBottom: 10 },
  actionBtn: { alignItems: 'center', width: 74 },
  actionIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  actionText: { fontSize: 11, color: '#556B63', fontWeight: '600' }
});
