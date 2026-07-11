import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Keyboard, ScrollView, Alert, Image
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
  const viajeConfirmadoRef = useRef(false);

  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    tipo: 'info', 
    titulo: '', 
    mensaje: '', 
    onAction: null,
    onConfirm: null,
    confirmText: '',
    cancelText: ''
  });
  const [tick, setTick] = useState(0);

  const mostrarAlerta = (tipo, titulo, mensaje, onAction = null) => {
    setAlertConfig({ 
      visible: true, 
      tipo, 
      titulo, 
      mensaje, 
      onAction,
      onConfirm: null,
      confirmText: '',
      cancelText: ''
    });
  };

  const cerrarAlerta = () => {
    const action = alertConfig.onAction;
    setAlertConfig((prev) => ({ 
      ...prev, 
      visible: false,
      onConfirm: null,
      confirmText: '',
      cancelText: ''
    }));
    if (action) action();
  };

  useEffect(() => {
    if (!solicitudId) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [solicitudId]);

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


  useEffect(() => {
    if (!solicitudId) return;

    const unsub = onSnapshot(doc(db, 'Solicitud', solicitudId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.estado === 'aceptado' && data.viaje_id) {
          viajeConfirmadoRef.current = true; // Evitar que la navegación de salida dispare el interceptor
          mostrarAlerta('exito', '¡Viaje Confirmado!', 'Ponte en contacto con tu conductor.', () => {
            navigation.replace('ViajeEnCurso', { viajeId: data.viaje_id });
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

  // Prevenir retorno accidental durante la búsqueda activa
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (viajeConfirmadoRef.current) {
        // Si el viaje ya fue confirmado, permitir salir libremente
        return;
      }

      if (!solicitudId) {
        // Si no hay búsqueda activa, se permite salir normalmente
        return;
      }

      // Prevenir el retroceso por defecto (Android back button, iOS swipe back, etc.)
      e.preventDefault();

      setAlertConfig({
        visible: true,
        tipo: 'info',
        titulo: '¿Cancelar búsqueda?',
        mensaje: 'Si sales de esta pantalla se cancelará tu búsqueda de viaje activa.',
        onConfirm: async () => {
          setAlertConfig((prev) => ({ ...prev, visible: false, onConfirm: null }));
          try {
            // Cancelar la solicitud en Firestore
            await updateDoc(doc(db, 'Solicitud', solicitudId), {
              estado: 'cancelado'
            });
          } catch (err) {
            console.error("Error al cancelar la solicitud al salir:", err);
          }
          // Proceder a retirar la pantalla de la navegación
          navigation.dispatch(e.data.action);
        },
        confirmText: 'Sí, salir',
        cancelText: 'Seguir esperando'
      });
    });

    return unsubscribe;
  }, [navigation, solicitudId]);

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

  // CAMBIO NECESARIO EN BuscarViaje.jsx
  // Reemplaza tu función aceptarOfertaConductor por esta versión.
  // Lo único que cambia es que ahora se guardan origen_coords y destino_coords
  // en el documento de 'Viajes', para que ViajeEnCurso.jsx pueda dibujar el mapa.

  const aceptarOfertaConductor = async (ofertaConductor) => {
    try {
      const viajeRef = await addDoc(collection(db, 'Viajes'), {
        solicitud_id: solicitudId,
        conductor_id: ofertaConductor.uid,
        pasajero_id: auth.currentUser?.uid || '8I4Pg2jiYlZ1RuRhRbHQ0xZ1Lrj2',
        vehiculo_id: ofertaConductor.vehiculo_id || '',
        origen_nombre: origen.nombre,
        origen_coords: { latitude: origen.latitude, longitude: origen.longitude }, // ⬅️ nuevo
        destino_nombre: destino.nombre,
        destino_coords: { latitude: destino.latitude, longitude: destino.longitude }, // ⬅️ nuevo
        precio_final: ofertaConductor.precio_contraoferta,
        estado: 'en_curso',
        fecha_hora: serverTimestamp(),
        creado_en: serverTimestamp(),
      });

      await updateDoc(doc(db, 'Solicitud', solicitudId), {
        estado: 'aceptado',
        viaje_id: viajeRef.id
      });
    } catch (error) {
      console.error('Error al aceptar la oferta:', error);
      mostrarAlerta('error', 'Error', 'No se pudo procesar la confirmación del viaje.');
    }
  };

  const rechazarOferta = async (ofertaConductor) => {
    if (!solicitudId) return;
    try {
      const solicitudRef = doc(db, 'Solicitud', solicitudId);
      const actualizacion = {};
      actualizacion[`ofertas_conductores.${ofertaConductor.uid}.estado_oferta`] = 'rechazada';
      actualizacion[`ofertas_conductores.${ofertaConductor.uid}.timestamp_rechazo`] = Date.now();
      await updateDoc(solicitudRef, actualizacion);
    } catch (error) {
      console.error('Error al rechazar la oferta:', error);
      mostrarAlerta('error', 'Error', 'No se pudo rechazar la oferta del conductor.');
    }
  };

  const TIEMPO_EXPIRACION_MS = 45000;
  const ofertasFiltradas = ofertas.filter((item) => {
    const tiempoPasado = Date.now() - (item.timestamp_oferta || 0);
    const esExpirada = tiempoPasado > TIEMPO_EXPIRACION_MS;
    const esRechazada = item.estado_oferta === 'rechazada';
    return !esRechazada && !esExpirada;
  });

  // Ordenamos por precio (más barato primero) y marcamos la primera como "mejor opción"
  const ofertasOrdenadas = [...ofertasFiltradas].sort(
    (a, b) => (a.precio_contraoferta || 0) - (b.precio_contraoferta || 0)
  );

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
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
          {/* Chips de filtros estilo mockup de foto */}
          <View style={styles.filterChipsRow}>
            <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} activeOpacity={0.8}>
              <Ionicons name="calendar" size={14} color="#fff" style={{ marginRight: 5 }} />
              <Text style={[styles.filterChipText, styles.filterChipTextActive]}>Ahora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterChip} activeOpacity={0.8}>
              <Ionicons name="car" size={14} color="#556B63" style={{ marginRight: 5 }} />
              <Text style={styles.filterChipText}>Carro</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterChip} activeOpacity={0.8}>
              <Ionicons name="star" size={14} color="#556B63" style={{ marginRight: 5 }} />
              <Text style={styles.filterChipText}>4.5+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterChip} activeOpacity={0.8}>
              <Ionicons name="people" size={14} color="#556B63" style={{ marginRight: 5 }} />
              <Text style={styles.filterChipText}>1 cupo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dividerLine} />

          {/* Fila del encabezado de la lista */}
          <View style={styles.ofertasHeaderRow}>
            <Text style={styles.listHeaderText}>
              {ofertasOrdenadas.length} conductor{ofertasOrdenadas.length !== 1 ? 'es' : ''} disponible{ofertasOrdenadas.length !== 1 ? 's' : ''}
            </Text>
            <TouchableOpacity style={styles.ordenarCercaniaBtn} activeOpacity={0.7}>
              <Ionicons name="location-sharp" size={13} color="#7A8B85" style={{ marginRight: 4 }} />
              <Text style={styles.ofertasSubHeader}>Ordenar por cercanía</Text>
            </TouchableOpacity>
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
              const segundosRestantes = Math.max(0, 45 - Math.floor((Date.now() - (item.timestamp_oferta || Date.now())) / 1000));

              return (
                <View style={[styles.viajeCard, esMejorOferta && styles.viajeCardDestacada]}>
                  {/* Botón de rechazar absoluto en la esquina superior derecha */}
                  <TouchableOpacity style={styles.rechazarAbsoluteBtn} onPress={() => rechazarOferta(item)} activeOpacity={0.7}>
                    <Ionicons name="close" size={16} color="#556B63" />
                  </TouchableOpacity>

                  {esMejorOferta && (
                    <View style={styles.badgeMejorOpcion}>
                      <View style={styles.dotMejorOpcion} />
                      <Text style={styles.badgeMejorOpcionText}>Mejor opción para ti</Text>
                    </View>
                  )}

                  <View style={styles.viajeCardTop}>
                    <View style={styles.conductorAvatarWrapper}>
                      {item.conductor_foto ? (
                        <Image source={{ uri: item.conductor_foto }} style={styles.conductorAvatar} />
                      ) : (
                        <View style={styles.conductorAvatarFallback}>
                          <FontAwesome5 name="user-alt" size={16} color="#556B63" />
                        </View>
                      )}
                      {item.verificado && (
                        <View style={styles.verificadoDot}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                      )}
                    </View>
                    
                    <View style={{ flex: 1, marginLeft: 12, paddingRight: 40 }}>
                      <Text style={styles.conductorNombre} numberOfLines={1}>{item.conductor_nombre || 'Conductor'}</Text>
                      <Text style={styles.conductorSub} numberOfLines={1}>UTS • Conductor verificado</Text>
                      
                      {/* Stats inline estilo de la foto */}
                      <View style={styles.statsRow}>
                        <View style={styles.statsItem}>
                          <Ionicons name="star" size={11} color="#FBBF24" style={{ marginRight: 3 }} />
                          <Text style={styles.statsText}>
                            {item.calificacion ? item.calificacion.toFixed(1) : '5.0'}
                            {item.num_calificaciones ? ` (${item.num_calificaciones})` : ' (12)'}
                          </Text>
                        </View>
                        <Text style={styles.statsDot}>•</Text>
                        <View style={styles.statsItem}>
                          <Ionicons name="time" size={11} color="#556B63" style={{ marginRight: 3 }} />
                          <Text style={styles.statsText}>{item.tiempo_estimado || '4 min'}</Text>
                        </View>
                        <Text style={styles.statsDot}>•</Text>
                        <View style={styles.statsItem}>
                          <Ionicons name="people" size={11} color="#556B63" style={{ marginRight: 3 }} />
                          <Text style={styles.statsText}>{item.cupos || 1} cupo{item.cupos !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                    </View>
                    
                    <View style={{ alignItems: 'flex-end', alignSelf: 'flex-start', marginTop: 2 }}>
                      <Text style={styles.precioTexto}>${Number(item.precio_contraoferta || 0).toLocaleString('es-CO')}</Text>
                      <Text style={styles.precioSubtexto}>por trayecto</Text>
                    </View>
                  </View>

                  <View style={styles.vehiculoRow}>
                    <View style={styles.vehiculoChip}>
                      <Ionicons name="car" size={13} color="#44544E" style={{ marginRight: 5 }} />
                      <Text style={styles.vehiculoChipText} numberOfLines={1}>{item.vehiculo_info || 'Vehículo registrado'}</Text>
                    </View>
                    
                    <View style={styles.countdownPill}>
                      <Ionicons name="hourglass-outline" size={12} color="#D97706" style={{ marginRight: 4 }} />
                      <Text style={styles.countdownPillText}>Expira en {segundosRestantes}s</Text>
                    </View>
                  </View>

                  <View style={styles.accionesRow}>
                    <TouchableOpacity style={styles.seleccionarBtn} onPress={() => aceptarOfertaConductor(item)} activeOpacity={0.8}>
                      <Text style={styles.seleccionarBtnText}>Solicitar viaje</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => navigation.navigate('ChatList')} activeOpacity={0.8}>
                      <Ionicons name="chatbubble-ellipses" size={18} color="#1db954" />
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

          <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('PerfilPasajero')}>
            <Octicons name="person" size={22} color="#556B63" style={{ marginBottom: 4 }} />
            <Text style={styles.tabText}>Perfil</Text>
          </TouchableOpacity>
        </View>
      )}

      <CustomAlert 
        visible={alertConfig.visible} 
        tipo={alertConfig.tipo} 
        titulo={alertConfig.titulo} 
        mensaje={alertConfig.mensaje} 
        onClose={cerrarAlerta} 
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
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

  ofertasPanel: { flex: 1.2, backgroundColor: '#FAFAFA', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 18 },
  ofertasHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  listHeaderText: { fontSize: 15, fontWeight: '800', color: '#111' },
  ofertasSubHeader: { fontSize: 11, color: '#7A8B85', fontWeight: '600' },

  filterChipsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECECEC', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, elevation: 1, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 3 },
  filterChipActive: { backgroundColor: '#1db954', borderColor: '#1db954' },
  filterChipText: { fontSize: 12, color: '#556B63', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  dividerLine: { height: 1, backgroundColor: '#ECECEC', marginVertical: 10 },
  ordenarCercaniaBtn: { flexDirection: 'row', alignItems: 'center' },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },

  viajeCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#ECECEC', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2, position: 'relative' },
  viajeCardDestacada: { borderColor: '#1db954', borderWidth: 1.5, backgroundColor: '#FBFFFC' },

  badgeMejorOpcion: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dotMejorOpcion: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#1db954', marginRight: 6 },
  badgeMejorOpcionText: { color: '#1db954', fontSize: 12, fontWeight: '700' },

  viajeCardTop: { flexDirection: 'row', alignItems: 'center' },
  conductorAvatarWrapper: { position: 'relative' },
  conductorAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5E7EB' },
  conductorAvatarFallback: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  verificadoDot: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#1db954', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  conductorNombre: { fontSize: 15, fontWeight: '700', color: '#111' },
  conductorSub: { fontSize: 11, color: '#7A8B85', marginTop: 1, fontWeight: '500' },
  
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  statsItem: { flexDirection: 'row', alignItems: 'center' },
  statsText: { fontSize: 11, color: '#556B63', fontWeight: '600' },
  statsDot: { fontSize: 12, color: '#A0B0A9', marginHorizontal: 6 },
  
  precioTexto: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  precioSubtexto: { fontSize: 10, color: '#999', marginTop: 1 },

  vehiculoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  vehiculoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flex: 1, marginRight: 8 },
  vehiculoChipText: { fontSize: 11, color: '#44544E', fontWeight: '600', marginLeft: 5, flex: 1 },
  
  countdownPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  countdownPillText: { fontSize: 11, color: '#D97706', fontWeight: '700' },
  
  rechazarAbsoluteBtn: { position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', zIndex: 10 },

  accionesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  seleccionarBtn: { flex: 1, backgroundColor: '#1db954', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', shadowColor: '#1db954', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  seleccionarBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  chatBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },

  bottomTabsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EEEEEE' },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabText: { fontSize: 12, color: '#556B63', fontWeight: '500' },
});