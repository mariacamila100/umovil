import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather, Octicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';

// Importación condicional robusta para evitar errores de compilación en el Navegador Web
let MapView, Marker;
if (Platform.OS !== 'web') {
  const MapModules = require('react-native-maps');
  MapView = MapModules.default;
  Marker = MapModules.Marker;
}

export default function HomePasajero({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viajeActivoId, setViajeActivoId] = useState(null);

  // Estados para la ubicación (En Web se mantendrá en null/simulado, en móvil capturará GPS)
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Insets reales del dispositivo (notch, isla dinámica, barra de gestos / home indicator)
  // IMPORTANTE: requiere que tu App.js esté envuelto en <SafeAreaProvider> de
  // 'react-native-safe-area-context' (si ya usas SafeAreaView de RN, solo cambia el import).
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let unsubViajes = () => {};

    const initializeHome = async () => {
      try {
        if (!auth.currentUser) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }
        const uid = auth.currentUser.uid;

        // 1. Cargar datos del estudiante desde Firestore
        const userDoc = await getDoc(doc(db, 'Usuarios', uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }

        // Escuchar viajes activos
        const qViaje = query(
          collection(db, 'Viajes'),
          where('pasajero_id', '==', uid),
          where('estado', '==', 'en_curso')
        );
        unsubViajes = onSnapshot(qViaje, (snapshot) => {
          if (!snapshot.empty) {
            setViajeActivoId(snapshot.docs[0].id);
          } else {
            setViajeActivoId(null);
          }
        });

        // 2. Controlar ubicación según la plataforma
        if (Platform.OS !== 'web') {
          const Location = require('expo-location');
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            setErrorMsg('Permiso de ubicación denegado.');
            setLoading(false);
            return;
          }

          let currentLocation = await Location.getCurrentPositionAsync({});
          setLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.00922,
            longitudeDelta: 0.00421,
          });
        }

      } catch (error) {
        console.error("Error al inicializar el Home del Pasajero:", error);
      } finally {
        setLoading(false);
      }
    };

    initializeHome();

    return () => {
      unsubViajes();
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  // Alturas dinámicas calculadas a partir de los insets reales del dispositivo
  const BOTTOM_TABS_HEIGHT = 58 + insets.bottom; // alto base + espacio seguro inferior (home indicator)

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* 1. HEADER DE BIENVENIDA (pegado al notch/isla, con su propio padding seguro) */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.userInfoRow}>
          <Image
            source={{ uri: userData?.foto_perfil || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200' }}
            style={styles.avatar}
          />
          <View style={styles.userTextSpace}>
            <Text style={styles.welcomeSubtitle}>Hola, bienvenida</Text>
            <Text style={styles.userNameText}>{userData?.nombre || 'Estudiante'} {userData?.apellido?.charAt(0) || ''}.</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.notificationBtn}>
            <Ionicons name="notifications-outline" size={22} color="#000" />
          </TouchableOpacity>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#1db954" />
            <Text style={styles.verifiedText}>Verificada</Text>
          </View>
        </View>
      </View>

      {viajeActivoId ? (
        <TouchableOpacity
          style={styles.viajeActivoBanner}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ViajeEnCurso', { viajeId: viajeActivoId })}
        >
          <Ionicons name="car-sport" size={20} color="#1db954" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.viajeActivoBannerText}>Viaje activo en curso</Text>
            <Text style={styles.viajeActivoBannerSub}>Toca para ver la ruta y el chat ➔</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          // El padding inferior se ajusta exactamente al alto real del tab bar,
          // así no queda espacio en blanco de más ni el contenido se esconde detrás.
          { paddingBottom: BOTTOM_TABS_HEIGHT + 20 }
        ]}
      >

        {/* 2. CONTENEDOR DEL MAPA AUTOMÁTICO (REAL EN CELULAR / MOCK EN WEB) */}
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            /* INTERFAZ MOCK PARA EL NAVEGADOR WEB */
            <View style={styles.mapWebMock}>
              <View style={styles.mockStreetVertical} />
              <View style={styles.mockStreetHorizontal} />

              <View style={styles.centerPinMock}>
                <View style={styles.outerPulseMock} />
                <View style={styles.innerDotMock} />
              </View>

              <View style={styles.webMapBadge}>
                <MaterialCommunityIcons name="laptop" size={14} color="#556B63" style={{ marginRight: 5 }} />
                <Text style={styles.webMapBadgeText}>Vista Web Activa · Mapa de pruebas</Text>
              </View>

              <TouchableOpacity style={styles.myLocationBtnMock}>
                <MaterialCommunityIcons name="target" size={20} color="#000" />
              </TouchableOpacity>
            </View>
          ) : (
            /* MAPA REAL NATIVO GOOGLE MAPS / APPLE MAPS */
            location ? (
              <MapView
                style={styles.map}
                initialRegion={location}
                showsUserLocation={true}
                showsMyLocationButton={false}
              >
                <Marker
                  coordinate={{
                    latitude: location.latitude + 0.0015,
                    longitude: location.longitude + 0.0015,
                  }}
                  title="Conductor Disponible"
                  description="Marlon está a 4 min de tu posición"
                >
                  <View style={styles.driverMarkerCustom}>
                    <Ionicons name="car" size={16} color="#fff" />
                  </View>
                </Marker>
              </MapView>
            ) : (
              <View style={styles.mapErrorSpace}>
                <ActivityIndicator size="small" color="#1db954" />
                <Text style={{ marginTop: 8, color: '#666', fontSize: 13 }}>{errorMsg || "Sincronizando coordenadas GPS..."}</Text>
              </View>
            )
          )}

          {/* Badge de conductores en tiempo real */}
          <View style={styles.indicatorDriversBadge}>
            <View style={styles.greenDotSignal} />
            <Text style={styles.driversBadgeText}>3 conductores cerca</Text>
          </View>
        </View>

        {/* 3. BARRA DE BÚSQUEDA MINIMALISTA */}
        <TouchableOpacity
          style={styles.searchBarContainer}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('BuscarViaje')} // Cambia a la pantalla o modal de búsqueda
        >
          <Ionicons name="search" size={20} color="#000" style={{ marginLeft: 16 }} />
          <View style={styles.searchPlaceholderSpace}>
            <Text style={styles.searchPlaceholderText}>¿A dónde vas hoy?</Text>
          </View>
          <View style={styles.filterBtn}>
            <MaterialCommunityIcons name="tune" size={18} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* 4. DESTINOS FRECUENTES */}
        <Text style={styles.sectionTitle}>DESTINOS FRECUENTES</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity style={styles.chip} activeOpacity={0.7}>
            <Ionicons name="school-outline" size={14} color="#333" style={{ marginRight: 5 }} />
            <Text style={styles.chipText}>Campus UTS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} activeOpacity={0.7}>
            <Ionicons name="book-outline" size={14} color="#333" style={{ marginRight: 5 }} />
            <Text style={styles.chipText}>Biblioteca Centro</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  scrollContent: { paddingHorizontal: 20 },

  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10, backgroundColor: '#fff' },
  userInfoRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E7EB' },
  userTextSpace: { marginLeft: 10 },
  welcomeSubtitle: { fontSize: 13, color: '#888' },
  userNameText: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  headerActions: { alignItems: 'flex-end' },
  notificationBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  verifiedText: { fontSize: 10, color: '#1db954', fontWeight: 'bold', marginLeft: 3 },

  // Estilos del Mapa y Mocks Web
  mapContainer: { height: 260, borderRadius: 24, overflow: 'hidden', marginVertical: 15, backgroundColor: '#EAF6EE', position: 'relative' },
  map: { width: '100%', height: '100%' },
  mapErrorSpace: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  driverMarkerCustom: { backgroundColor: '#1db954', padding: 5, borderRadius: 15, borderWidth: 2, borderColor: '#fff', elevation: 4 },

  mapWebMock: { flex: 1, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },
  mockStreetVertical: { position: 'absolute', width: 40, height: '100%', backgroundColor: '#F0F9F4', left: '45%' },
  mockStreetHorizontal: { position: 'absolute', width: '100%', height: 40, backgroundColor: '#F0F9F4', top: '48%' },
  webMapBadge: { position: 'absolute', bottom: 14, left: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#D1EFE0' },
  webMapBadgeText: { fontSize: 11, color: '#44544E', fontWeight: '600' },

  indicatorDriversBadge: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, elevation: 4 },
  greenDotSignal: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1db954', marginRight: 6 },
  driversBadgeText: { fontSize: 12, fontWeight: '700', color: '#222' },
  centerPinMock: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  innerDotMock: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1db954' },
  outerPulseMock: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: '#1db954', opacity: 0.25 },
  myLocationBtnMock: { position: 'absolute', bottom: 14, right: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 2 },

  // Barra de Búsqueda de Viajes
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#EAEAEA', marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  searchPlaceholderSpace: { flex: 1, paddingLeft: 10, justifyContent: 'center' },
  searchPlaceholderText: { color: '#777', fontSize: 15, fontWeight: '400' },
  filterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1db954', justifyContent: 'center', alignItems: 'center', marginRight: 8 },

  // Secciones inferiores
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#7A8B85', letterSpacing: 0.5, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EAEAEA' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500' },

  // Bottom Tabs Estilo Minimalista Exacto (alto y paddingBottom ahora se calculan dinámicamente arriba)
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
  }
});