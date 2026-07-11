import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, StatusBar, Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Octicons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

export default function MisViajes({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const initialRole = route.params?.role || 'pasajero'; // 'pasajero' o 'conductor'
  const [roleActive, setRoleActive] = useState(initialRole);
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!auth.currentUser) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      return;
    }

    setLoading(true);
    let unsub = () => {};

    try {
      const currentUid = auth.currentUser.uid;
      const fieldToQuery = roleActive === 'pasajero' ? 'pasajero_id' : 'conductor_id';
      const q = query(
        collection(db, 'Viajes'),
        where(fieldToQuery, '==', currentUid)
      );

      unsub = onSnapshot(q, (snapshot) => {
        const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Ordenar localmente por creado_en (descendente) para evitar requerir un índice compuesto
        lista.sort((a, b) => {
          const aTime = a.creado_en?.seconds || 0;
          const bTime = b.creado_en?.seconds || 0;
          return bTime - aTime;
        });
        setViajes(lista);
        setLoading(false);
      }, (error) => {
        console.error("Error cargando historial de viajes:", error);
        // Si hay error de índice o de Firebase, mostramos la lista vacía para cargar mocks
        setViajes([]);
        setLoading(false);
      });
    } catch (error) {
      console.error("Error en useEffect de MisViajes:", error);
      setLoading(false);
    }

    return () => unsub();
  }, [roleActive, currentUid]);

  // Si no hay viajes reales en Firebase para este usuario de pruebas, cargamos datos simulados premium
  const getViajesData = () => {
    if (viajes.length > 0) return viajes;

    if (roleActive === 'pasajero') {
      return [
        {
          id: 'mock-p1',
          origen_nombre: 'Real de Minas',
          destino_nombre: 'Campus UTS',
          precio_final: 3500,
          estado: 'finalizado',
          fecha_hora: { toDate: () => new Date('2026-06-30T08:30:00') },
          conductor_nombre: 'Marlon A.'
        },
        {
          id: 'mock-p2',
          origen_nombre: 'Campus UTS',
          destino_nombre: 'Biblioteca Centro',
          precio_final: 4000,
          estado: 'finalizado',
          fecha_hora: { toDate: () => new Date('2026-06-28T14:15:00') },
          conductor_nombre: 'Laura M.'
        }
      ];
    } else {
      return [
        {
          id: 'mock-c1',
          origen_nombre: 'Piedecuesta',
          destino_nombre: 'Campus UTS',
          precio_final: 8000,
          estado: 'finalizado',
          fecha_hora: { toDate: () => new Date('2026-06-29T07:10:00') },
          pasajero_nombre: 'Camilo R.'
        },
        {
          id: 'mock-c2',
          origen_nombre: 'Campus UTS',
          destino_nombre: 'Giron',
          precio_final: 7500,
          estado: 'finalizado',
          fecha_hora: { toDate: () => new Date('2026-06-27T18:45:00') },
          pasajero_nombre: 'Sofía G.'
        }
      ];
    }
  };

  const formatFecha = (fechaObj) => {
    if (!fechaObj) return '';
    const date = fechaObj.toDate ? fechaObj.toDate() : new Date(fechaObj);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (estado) => {
    switch (estado) {
      case 'en_curso':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeEnCurso]}>
            <Text style={[styles.statusText, styles.statusTextEnCurso]}>En curso</Text>
          </View>
        );
      case 'finalizado':
      case 'completado':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeCompletado]}>
            <Text style={[styles.statusText, styles.statusTextCompletado]}>Completado</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.statusBadge, styles.statusBadgeGenerico]}>
            <Text style={[styles.statusText, styles.statusTextGenerico]}>{estado || 'Completado'}</Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* HEADER DE LA PANTALLA */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        {navigation.canGoBack() && (
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Mis viajes</Text>
      </View>

      {/* LISTA DE VIAJES */}
      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#1db954" />
          <Text style={styles.loadingText}>Cargando tu historial...</Text>
        </View>
      ) : (
        <FlatList
          data={getViajesData()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <MaterialCommunityIcons name="history" size={32} color="#1db954" />
              </View>
              <Text style={styles.emptyTitle}>Sin viajes registrados</Text>
              <Text style={styles.emptySubtitle}>
                Aún no tienes viajes registrados como {roleActive === 'pasajero' ? 'pasajero' : 'conductor'} en la plataforma.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.viajeCard}
              activeOpacity={0.7}
              onPress={() => {
                if (item.estado === 'en_curso') {
                  navigation.navigate('ViajeEnCurso', { viajeId: item.id });
                } else {
                  navigation.navigate('DetalleViaje', { viajeId: item.id, role: roleActive });
                }
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.fechaText}>{formatFecha(item.fecha_hora)}</Text>
                <View style={styles.priceContainer}>
                  <Text style={styles.priceText}>
                    ${Number(item.precio_final || item.precio || 0).toLocaleString('es-CO')}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* RUTA */}
              <View style={styles.rutaBlock}>
                <View style={styles.rutaRow}>
                  <View style={styles.dotOrigen} />
                  <Text style={styles.rutaText} numberOfLines={1}>{item.origen_nombre || item.origen}</Text>
                </View>
                <View style={styles.rutaLineaConectora} />
                <View style={styles.rutaRow}>
                  <View style={styles.dotDestino} />
                  <Text style={styles.rutaText} numberOfLines={1}>{item.destino_nombre || item.destino}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#FAFAFA' },
  headerContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  headerTitle: { fontSize: 21, fontWeight: 'bold', color: '#111' },

  segmentedControlContainer: { flexDirection: 'row', backgroundColor: '#F3F4F6', marginHorizontal: 20, marginVertical: 14, borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', py: 8, height: 38, borderRadius: 10 },
  segmentBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  segmentText: { fontSize: 13, color: '#556B63', fontWeight: '600' },
  segmentTextActive: { color: '#1db954', fontWeight: '700' },

  loadingWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666', fontSize: 13 },

  listContent: { paddingHorizontal: 20, paddingTop: 6 },
  viajeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#EFEFEF', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fechaText: { fontSize: 12, color: '#666', fontWeight: '600' },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeEnCurso: { backgroundColor: '#DBEAFE' },
  statusBadgeCompletado: { backgroundColor: '#D1EFE0' },
  statusBadgeGenerico: { backgroundColor: '#EAF6EE' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextEnCurso: { color: '#1D4ED8' },
  statusTextCompletado: { color: '#1db954' },
  statusTextGenerico: { color: '#556B63' },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },

  rutaBlock: { marginVertical: 2 },
  rutaRow: { flexDirection: 'row', alignItems: 'center' },
  dotOrigen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1db954' },
  dotDestino: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  rutaLineaConectora: { width: 1, height: 12, backgroundColor: '#E0E0E0', marginLeft: 4.5, marginVertical: 2 },
  rutaText: { fontSize: 13, color: '#333', marginLeft: 10, flex: 1, fontWeight: '500' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  companionInfo: { flexDirection: 'row', alignItems: 'center' },
  companionAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  companionLabel: { fontSize: 10, color: '#999', fontWeight: '600' },
  companionName: { fontSize: 13, color: '#111', fontWeight: '700' },

  priceContainer: { backgroundColor: '#EAF6EE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  priceText: { fontSize: 14, fontWeight: '800', color: '#1db954' },

  viajeCardExpanded: { borderColor: '#1db954', borderWidth: 1.2 },
  expandedContent: { marginTop: 4 },
  expandedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 6 },
  detailLabel: { fontSize: 12, color: '#777', fontWeight: '600' },
  detailValueText: { fontSize: 13, color: '#111', fontWeight: '700' },
  starsRow: { flexDirection: 'row', alignItems: 'center' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  emptySubtitle: { fontSize: 13, color: '#666', textAlign: 'center', paddingHorizontal: 30, marginTop: 6, lineHeight: 18 }
});
