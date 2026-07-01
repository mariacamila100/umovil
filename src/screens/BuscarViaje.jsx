import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Keyboard, ScrollView
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, Octicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import CustomAlert from '../components/CustomAlert';

let MapView, Marker;
if (Platform.OS !== 'web') {
  const MapModules = require('react-native-maps');
  MapView = MapModules.default;
  Marker = MapModules.Marker;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'UmovilApp/1.0 (contacto: mariacduarte@uts.edu.co)';

export default function BuscarViaje({ navigation }) {
  const insets = useSafeAreaInsets();

  const [ubicacionActual, setUbicacionActual] = useState(null);
  const [errorUbicacion, setErrorUbicacion] = useState(null);

  // --- Campos de la subasta ---
  const [textoOrigen, setTextoOrigen] = useState('Real de Minas');
  const [textoDestino, setTextoDestino] = useState('');
  const [precioOfertado, setPrecioOfertado] = useState('');
  const [solicitudId, setSolicitudId] = useState(null);
  const [ofertas, setOfertas] = useState([]);

  // Estructuras de datos completas (con coordenadas) para origen y destino
  const [origen, setOrigen] = useState({ nombre: 'Real de Minas', latitude: 7.1132, longitude: -73.1294 }); // Coordenadas iniciales por defecto de Real de Minas
  const [destino, setDestino] = useState(null);

  // Control del autocompletado único
  const [sugerencias, setSugerencias] = useState([]);
  const [campoActivo, setCampoActivo] = useState(null); // 'origen' o 'destino'
  const [buscandoSugerencias, setBuscandoSugerencias] = useState(false);
  const [creandoSolicitud, setCreandoSolicitud] = useState(false);
  const debounceRef = useRef(null);

  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '', onAction: null });

  const mostrarAlerta = (tipo, titulo, mensaje, onAction = null) => {
    setAlertConfig({ visible: true, tipo, titulo, mensaje, onAction });
  };

  const cerrarAlerta = () => {
    const action = alertConfig.onAction;
    setAlertConfig({ ...alertConfig, visible: false });
    if (action) action();
  };

  useEffect(() => {
    const obtenerUbicacion = async () => {
      if (Platform.OS === 'web') return;
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorUbicacion('Permiso de ubicación denegado.');
          return;
        }
        const actual = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: actual.coords.latitude,
          longitude: actual.coords.longitude,
        };
        setUbicacionActual(coords);
        // Inicializar el origen de forma automática con la ubicación GPS del usuario
        setOrigen({ nombre: 'Ubicación Actual', ...coords });
        setTextoOrigen('Mi ubicación actual');
      } catch (error) {
        console.error('Error obteniendo ubicación:', error);
      }
    };
    obtenerUbicacion();
  }, []);

  // 🔧 CORREGIDO: antes esto usaba "viajeRef.id", que no existe en este scope y
  // rompía la app justo cuando un conductor aceptaba. Ahora usa data.viaje_id,
  // que sí viene en el propio documento de la Solicitud. Este es el único lugar
  // que dispara la confirmación (ya no se duplica con aceptarOfertaConductor).
  useEffect(() => {
    if (!solicitudId) return;

    const unsub = onSnapshot(doc(db, 'Solicitud', solicitudId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.estado === 'aceptado' && data.viaje_id) {
          mostrarAlerta('exito', '¡Viaje Confirmado!', 'Ponte en contacto con tu conductor.', () => {
            navigation.navigate('MisViajes');
          });
        }

        if (data.ofertas_conductores) {
          const listaOfertas = Object.keys(data.ofertas_conductores).map((uid) => ({
            uid,
            ...data.ofertas_conductores[uid],
          }));
          setOfertas(listaOfertas);
        }
      }
    });

    return () => unsub();
  }, [solicitudId]);

  // --- Buscador Inteligente Nominatim unificado para ambos campos ---
  const buscarDireccion = (texto, tipo) => {
    if (tipo === 'origen') {
      setTextoOrigen(texto);
      setOrigen(null);
    } else {
      setTextoDestino(texto);
      setDestino(null);
    }

    setCampoActivo(tipo);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 3) {
      setSugerencias([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setBuscandoSugerencias(true);
        const params = new URLSearchParams({
          q: texto,
          format: 'json',
          addressdetails: '1',
          limit: '5',
          countrycodes: 'co',
          'accept-language': 'es',
        });

        const resp = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
          headers: { 'User-Agent': NOMINATIM_USER_AGENT },
        });
        const data = await resp.json();
        setSugerencias(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error en autocompletado:', error);
      } finally {
        setBuscandoSugerencias(false);
      }
    }, 700);
  };

  const seleccionarSugerencia = (item) => {
    Keyboard.dismiss();
    const nombreCorto = item.display_name.split(',')[0];
    const datosUbicacion = {
      nombre: nombreCorto,
      direccion: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    };

    if (campoActivo === 'origen') {
      setTextoOrigen(nombreCorto);
      setOrigen(datosUbicacion);
    } else {
      setTextoDestino(nombreCorto);
      setDestino(datosUbicacion);
    }
    setSugerencias([]);
    setCampoActivo(null);
  };

  // Botón de "usar mi ubicación actual" en el campo Origen (icono de la tarjeta de referencia)
  const usarMiUbicacionComoOrigen = () => {
    if (!ubicacionActual) {
      mostrarAlerta('info', 'Ubicación no disponible', 'Aún estamos obteniendo tu GPS, intenta en un momento.');
      return;
    }
    setOrigen({ nombre: 'Ubicación Actual', ...ubicacionActual });
    setTextoOrigen('Mi ubicación actual');
    setSugerencias([]);
  };

  // --- Publicar la solicitud al radar (InDrive) ---
  const publicarSolicitudSubasta = async () => {
    // CORRECCIÓN DE VALIDACIÓN: Removido el .get erróneo
    if (!origen || !destino || !precioOfertado.trim()) {
      mostrarAlerta('error', 'Campos incompletos', 'Por favor define origen, destino y tu oferta económica.');
      return;
    }

    setCreandoSolicitud(true);
    try {
      const nuevaSolicitud = {
        pasajero_id: auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2',
        pasajero_nombre: auth.currentUser?.displayName || 'María C',
        origen_nombre: origen.nombre,
        origen_coords: { latitude: origen.latitude, longitude: origen.longitude },
        destino_nombre: destino.nombre,
        destino_coords: { latitude: destino.latitude, longitude: destino.longitude },
        precio_ofertado_pasajero: Number(precioOfertado),
        estado: 'buscando',
        ofertas_conductores: {},
        creado_en: serverTimestamp(),
        viaje_id: ''
      };

      const docRef = await addDoc(collection(db, 'Solicitud'), nuevaSolicitud);
      setSolicitudId(docRef.id);
    } catch (error) {
      console.error('Error al lanzar subasta:', error);
      mostrarAlerta('error', 'Error', 'No se pudo publicar tu solicitud.');
    } finally {
      setCreandoSolicitud(false);
    }
  };

  const aceptarOfertaConductor = async (ofertaConductor) => {
    try {
      const viajeRef = await addDoc(collection(db, 'Viajes'), {
        solicitud_id: solicitudId,
        conductor_id: ofertaConductor.uid,
        pasajero_id: auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2',
        vehiculo_id: ofertaConductor.vehiculo_id || '',
        origen_nombre: origen.nombre,
        destino_nombre: destino.nombre,
        precio_final: ofertaConductor.precio_contraoferta,
        estado: 'en_curso',
        fecha_hora: serverTimestamp(),
        creado_en: serverTimestamp(),
      });

      await updateDoc(doc(db, 'Solicitud', solicitudId), {
        estado: 'aceptado',
        viaje_id: viajeRef.id
      });

      // La confirmación (alerta + navegación) la dispara el listener onSnapshot de arriba
      // en cuanto detecta estado:'aceptado', así evitamos mostrarla dos veces.
    } catch (error) {
      console.error('Error al aceptar la oferta:', error);
      mostrarAlerta('error', 'Error', 'No se pudo procesar la confirmación del viaje.');
    }
  };

  // Ordenamos por precio (más barato primero) y marcamos la primera como "mejor opción"
  const ofertasOrdenadas = [...ofertas].sort(
    (a, b) => (a.precio_contraoferta || 0) - (b.precio_contraoferta || 0)
  );

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buscar un viaje</Text>
      </View>

      <ScrollView
        scrollEnabled={!solicitudId}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: solicitudId ? 0 : insets.bottom + 20 }}
      >
        <View style={styles.formWrapper}>
          {/* TARJETA DE RUTA: origen + destino en un solo bloque, estilo referencia */}
          <View style={styles.rutaCard}>
            <View style={styles.rutaRow}>
              <View style={styles.dotOrigen} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.rutaLabel}>Origen</Text>
                <TextInput
                  style={styles.rutaInput}
                  placeholder="¿Dónde te recogen?"
                  placeholderTextColor="#8FA89D"
                  value={textoOrigen}
                  onChangeText={(txt) => buscarDireccion(txt, 'origen')}
                  editable={!solicitudId}
                />
              </View>
              {!solicitudId && (
                <TouchableOpacity style={styles.rutaIconBtn} onPress={usarMiUbicacionComoOrigen}>
                  <Ionicons name="locate" size={16} color="#1db954" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.rutaDividerLine} />

            <View style={styles.rutaRow}>
              <View style={styles.dotDestino} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.rutaLabel}>Destino</Text>
                <TextInput
                  style={styles.rutaInput}
                  placeholder="¿A dónde vas?"
                  placeholderTextColor="#8FA89D"
                  value={textoDestino}
                  onChangeText={(txt) => buscarDireccion(txt, 'destino')}
                  editable={!solicitudId}
                />
              </View>
              {!solicitudId && (
                <View style={styles.rutaIconBtn}>
                  <Ionicons name="pencil" size={14} color="#556B63" />
                </View>
              )}
            </View>
          </View>

          {/* LISTA DE SUGERENCIAS DESPLEGABLES COMPARTIDA */}
          {sugerencias.length > 0 && (
            <View style={styles.sugerenciasBox}>
              {buscandoSugerencias && (
                <View style={styles.sugerenciaLoadingRow}>
                  <ActivityIndicator size="small" color="#1db954" />
                </View>
              )}
              {sugerencias.map((item) => (
                <TouchableOpacity key={`${item.osm_type}-${item.osm_id}`} style={styles.sugerenciaItem} onPress={() => seleccionarSugerencia(item)}>
                  <Ionicons name="location-outline" size={16} color="#556B63" style={{ marginRight: 8 }} />
                  <Text style={styles.sugerenciaTitulo} numberOfLines={1}>{item.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* TARJETA DE PRECIO OFERTADO */}
          {!solicitudId && (
            <View style={styles.precioCard}>
              <View style={styles.precioIconCircle}>
                <FontAwesome5 name="money-bill-wave" size={14} color="#1db954" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.rutaLabel}>¿Cuánto ofreces?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={styles.precioSimbolo}>$</Text>
                  <TextInput
                    style={styles.precioInput}
                    placeholder="5.000"
                    placeholderTextColor="#B7C4BE"
                    keyboardType="numeric"
                    value={precioOfertado}
                    onChangeText={setPrecioOfertado}
                  />
                </View>
              </View>
            </View>
          )}

          {!solicitudId && (
            <TouchableOpacity style={styles.publicarBtn} onPress={publicarSolicitudSubasta} disabled={creandoSolicitud}>
              {creandoSolicitud ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="search" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.publicarBtnText}>Buscar Conductores</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {solicitudId && (
          <View style={styles.radarCard}>
            <View style={styles.radarPulseOuter}>
              <View style={styles.radarPulseInner}>
                <ActivityIndicator size="small" color="#1db954" />
              </View>
            </View>
            <Text style={styles.radarText}>Esperando contraofertas en tiempo real...</Text>
            <Text style={styles.radarSubtext}>Te avisamos apenas un conductor responda</Text>
          </View>
        )}
      </ScrollView>

      {solicitudId && (
        <View style={styles.ofertasPanel}>
          <View style={styles.ofertasHeaderRow}>
            <Text style={styles.listHeaderText}>{ofertas.length} conductor{ofertas.length !== 1 ? 'es' : ''} disponible{ofertas.length !== 1 ? 's' : ''}</Text>
            {ofertas.length > 1 && <Text style={styles.ofertasSubHeader}>Menor precio primero</Text>}
          </View>

          <FlatList
            data={ofertasOrdenadas}
            keyExtractor={(item) => item.uid}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="radar" size={26} color="#A3A3A3" />
                <Text style={styles.emptyText}>Buscando conductores disponibles cerca de tu zona...</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const esMejorOferta = index === 0 && ofertasOrdenadas.length > 1;
              return (
                <View style={[styles.viajeCard, esMejorOferta && styles.viajeCardDestacada]}>
                  {esMejorOferta && (
                    <View style={styles.badgeMejorOpcion}>
                      <View style={styles.dotMejorOpcion} />
                      <Text style={styles.badgeMejorOpcionText}>Mejor opción para ti</Text>
                    </View>
                  )}

                  <View style={styles.viajeCardTop}>
                    <View style={styles.conductorAvatarWrapper}>
                      <View style={styles.conductorAvatarFallback}>
                        <FontAwesome5 name="user-alt" size={14} color="#556B63" />
                      </View>
                      {item.verificado && (
                        <View style={styles.verificadoDot}>
                          <Ionicons name="checkmark" size={9} color="#fff" />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.conductorNombre}>{item.conductor_nombre || 'Conductor'}</Text>
                      {!!(item.calificacion || item.num_calificaciones) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Ionicons name="star" size={11} color="#F59E0B" />
                          <Text style={styles.ratingTexto}>
                            {' '}{item.calificacion ? item.calificacion.toFixed(1) : '—'}
                            {item.num_calificaciones ? ` (${item.num_calificaciones})` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.precioTexto}>${Number(item.precio_contraoferta || 0).toLocaleString('es-CO')}</Text>
                      <Text style={styles.precioSubtexto}>por trayecto</Text>
                    </View>
                  </View>

                  <View style={styles.infoChipsRow}>
                    {!!item.tiempo_estimado && (
                      <View style={styles.infoChip}>
                        <Ionicons name="time-outline" size={12} color="#556B63" />
                        <Text style={styles.infoChipText}>{item.tiempo_estimado}</Text>
                      </View>
                    )}
                    {!!item.cupos && (
                      <View style={styles.infoChip}>
                        <Ionicons name="people-outline" size={12} color="#556B63" />
                        <Text style={styles.infoChipText}>{item.cupos} cupo{item.cupos !== 1 ? 's' : ''}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.vehiculoChip}>
                    <MaterialCommunityIcons name="car-side" size={13} color="#44544E" />
                    <Text style={styles.vehiculoChipText} numberOfLines={1}>{item.vehiculo_info || 'Vehículo registrado'}</Text>
                  </View>

                  <View style={styles.accionesRow}>
                    <TouchableOpacity style={styles.seleccionarBtn} onPress={() => aceptarOfertaConductor(item)}>
                      <Text style={styles.seleccionarBtnText}>Aceptar viaje</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => navigation.navigate('ChatList')}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#1db954" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* BARRA DE NAVEGACIÓN INFERIOR (misma línea visual del resto de la app) */}
      {!solicitudId && (
        <View style={[styles.bottomTabsContainer, { height: 58 + insets.bottom, paddingBottom: insets.bottom }]}>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('HomePasajero')}>
            <Octicons name="home" size={20} color="#556B63" style={{ marginBottom: 4 }} />
            <Text style={styles.tabText}>Inicio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('MisViajes')}>
            <Feather name="git-commit" size={22} color="#556B63" style={{ transform: [{ rotate: '90deg' }], marginBottom: 4 }} />
            <Text style={styles.tabText}>Mis viajes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('ChatList')}>
            <MaterialCommunityIcons name="message-processing-outline" size={22} color="#556B63" style={{ marginBottom: 4 }} />
            <Text style={styles.tabText}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Perfil')}>
            <Octicons name="person" size={22} color="#556B63" style={{ marginBottom: 4 }} />
            <Text style={styles.tabText}>Perfil</Text>
          </TouchableOpacity>
        </View>
      )}

      <CustomAlert visible={alertConfig.visible} tipo={alertConfig.tipo} titulo={alertConfig.titulo} mensaje={alertConfig.mensaje} onClose={cerrarAlerta} />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#FAFAFA' },

  headerContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  headerTitle: { fontSize: 21, fontWeight: 'bold', color: '#111' },

  formWrapper: { paddingHorizontal: 20, paddingTop: 16 },

  // Tarjeta unificada de Origen/Destino, estilo verde claro de la referencia
  rutaCard: { backgroundColor: '#EAF6EE', borderRadius: 22, padding: 16 },
  rutaRow: { flexDirection: 'row', alignItems: 'center' },
  dotOrigen: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1db954' },
  dotDestino: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' },
  rutaDividerLine: { height: 1, backgroundColor: 'rgba(29,185,84,0.18)', marginVertical: 12, marginLeft: 24 },
  rutaLabel: { fontSize: 11, color: '#556B63', fontWeight: '600', marginBottom: 2 },
  rutaInput: { fontSize: 15, color: '#111', fontWeight: '600', padding: 0 },
  rutaIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },

  sugerenciasBox: { backgroundColor: '#fff', borderRadius: 16, marginTop: 10, borderWidth: 1, borderColor: '#EAEAEA', overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 },
  sugerenciaLoadingRow: { paddingVertical: 10, alignItems: 'center' },
  sugerenciaItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  sugerenciaTitulo: { fontSize: 13, color: '#222', flex: 1 },

  precioCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#EFEFEF' },
  precioIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  precioSimbolo: { fontSize: 20, fontWeight: 'bold', color: '#1db954', marginRight: 2 },
  precioInput: { fontSize: 20, fontWeight: 'bold', color: '#111', padding: 0, minWidth: 80 },

  publicarBtn: { flexDirection: 'row', backgroundColor: '#1db954', height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginTop: 18, shadowColor: '#1db954', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  publicarBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  radarCard: { alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 20, marginTop: 20, borderRadius: 20, paddingVertical: 26, borderWidth: 1, borderColor: '#EFEFEF' },
  radarPulseOuter: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  radarPulseInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  radarText: { color: '#111', fontSize: 14, fontWeight: '700' },
  radarSubtext: { color: '#888', fontSize: 12, marginTop: 4 },

  ofertasPanel: { flex: 1.2, backgroundColor: '#F3F4F6', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 20 },
  ofertasHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  listHeaderText: { fontSize: 15, fontWeight: '800', color: '#111' },
  ofertasSubHeader: { fontSize: 11, color: '#7A8B85', fontWeight: '600' },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },

  viajeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#EFEFEF', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  viajeCardDestacada: { borderColor: '#1db954', borderWidth: 1.5, backgroundColor: '#FBFFFC' },

  badgeMejorOpcion: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dotMejorOpcion: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#1db954', marginRight: 6 },
  badgeMejorOpcionText: { color: '#1db954', fontSize: 12, fontWeight: '700' },

  viajeCardTop: { flexDirection: 'row', alignItems: 'center' },
  conductorAvatarWrapper: { position: 'relative' },
  conductorAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  verificadoDot: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#1db954', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  conductorNombre: { fontSize: 15, fontWeight: '700', color: '#111' },
  ratingTexto: { fontSize: 12, color: '#666', fontWeight: '600' },
  precioTexto: { fontSize: 17, fontWeight: 'bold', color: '#1db954' },
  precioSubtexto: { fontSize: 10, color: '#999' },

  infoChipsRow: { flexDirection: 'row', marginTop: 12, marginBottom: 4 },
  infoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  infoChipText: { fontSize: 11, color: '#556B63', fontWeight: '600', marginLeft: 4 },

  vehiculoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  vehiculoChipText: { fontSize: 12, color: '#44544E', fontWeight: '600', marginLeft: 6 },

  accionesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  seleccionarBtn: { flex: 1, backgroundColor: '#1db954', height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  seleccionarBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  chatBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },

  bottomTabsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EEEEEE' },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabText: { fontSize: 12, color: '#556B63', fontWeight: '500' },
});