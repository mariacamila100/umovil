import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Image, TouchableOpacity,
    ScrollView, SafeAreaView, StatusBar, ActivityIndicator, TextInput, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Octicons, Feather } from '@expo/vector-icons';
import { auth, db } from '../firebase/config';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

import CustomAlert from '../components/CustomAlert';

export default function PerfilConductor({ navigation }) {
    const insets = useSafeAreaInsets();

    const [userData, setUserData] = useState(null);
    const [vehiculoData, setVehiculoData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);

    const [historialViajes, setHistorialViajes] = useState([]);
    const [resenas, setResenas] = useState([]);
    const [stats, setStats] = useState({ viajes: 0, km: 0 });

    // Estados para el modo edición (mismo patrón que PerfilPasajero, solo datos de Usuario)
    const [isEditing, setIsEditing] = useState(false);
    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [telefono, setTelefono] = useState('');

    const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '' });
    const showAlert = (tipo, titulo, mensaje) => setAlertConfig({ visible: true, tipo, titulo, mensaje });

    useEffect(() => {
        const fetchPerfilConductor = async () => {
            try {
                if (!auth.currentUser) return;
                const uid = auth.currentUser.uid;

                // 1. Datos del usuario
                const userDoc = await getDoc(doc(db, 'Usuarios', uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setUserData(data);
                    setNombre(data.nombre || '');
                    setApellido(data.apellido || '');
                    setTelefono(data.telefono || '');
                }

                // 2. Vehículo del conductor (consulta real por usuario_id, no un ID fijo de prueba)
                const vehQuery = query(collection(db, 'Vehiculo'), where('usuario_id', '==', uid));
                const vehSnap = await getDocs(vehQuery);
                if (!vehSnap.empty) {
                    setVehiculoData(vehSnap.docs[0].data());
                }

                // 3. Viajes reales hechos como conductor
                const viajesQuery = query(collection(db, 'Viajes'), where('conductor_id', '==', uid));
                const viajesSnap = await getDocs(viajesQuery);
                const listaViajes = viajesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

                listaViajes.sort((a, b) => (b.creado_en?.seconds || 0) - (a.creado_en?.seconds || 0));
                setHistorialViajes(listaViajes.slice(0, 5));
                setStats({
                    viajes: listaViajes.length,
                    km: listaViajes.length * 3.5, // Estimado, no medido por GPS — se etiqueta como tal en la UI
                });

                // 4. Reseñas reales recibidas
                const resQuery = query(collection(db, 'Calificacion'), where('a_usuario_id', '==', uid));
                const resSnap = await getDocs(resQuery);
                const resenasCrudas = resSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

                const resenasConNombre = await Promise.all(
                    resenasCrudas.map(async (r) => {
                        let nombreAutor = 'Usuario';
                        try {
                            if (r.de_usuario_id) {
                                const autorSnap = await getDoc(doc(db, 'Usuarios', r.de_usuario_id));
                                if (autorSnap.exists()) {
                                    const a = autorSnap.data();
                                    nombreAutor = `${a.nombre || ''} ${a.apellido?.charAt(0) || ''}.`.trim();
                                }
                            }
                        } catch (e) { /* se queda "Usuario" */ }
                        return { ...r, nombreAutor };
                    })
                );
                resenasConNombre.sort((a, b) => (b.creado_en?.seconds || 0) - (a.creado_en?.seconds || 0));
                setResenas(resenasConNombre.slice(0, 3));

            } catch (error) {
                console.error("Error al cargar perfil de conductor:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPerfilConductor();
    }, []);

    const handleGuardarCambios = async () => {
        if (!nombre.trim() || !apellido.trim() || !telefono.trim()) {
            showAlert('error', 'Campos vacíos', 'Por favor completa todos los campos editables.');
            return;
        }

        setUpdating(true);
        try {
            const uid = auth.currentUser.uid;
            await updateDoc(doc(db, 'Usuarios', uid), {
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                telefono: telefono.trim()
            });

            setUserData({ ...userData, nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono.trim() });
            setIsEditing(false);
            showAlert('exito', '¡Perfil Actualizado!', 'Tus datos se guardaron correctamente en la plataforma.');
        } catch (error) {
            console.error("Error al actualizar perfil:", error);
            showAlert('error', 'Error en el Servidor', 'No se pudieron guardar los cambios. Intenta de nuevo.');
        } finally {
            setUpdating(false);
        }
    };

    // Insignias CALCULADAS a partir de datos reales — si no se cumple la condición, no aparece.
    const insignias = [
        vehiculoData?.verificado && {
            icono: 'car-check',
            texto: 'Vehículo verificado',
        },
        (userData?.calificacion_promedio ?? 0) >= 4.5 && {
            icono: 'star-circle-outline',
            texto: 'Alta calificación',
        },
        stats.viajes >= 10 && {
            icono: 'steering',
            texto: 'Conductor frecuente',
        },
    ].filter(Boolean);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1db954" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.mainContainer}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            {/* HEADER DE LA PANTALLA */}
            <View style={styles.headerBar}>
                <Text style={styles.headerTitle}>Mi Perfil de Conductor</Text>

                {isEditing ? (
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { marginRight: 10, backgroundColor: '#FFEBEE' }]}
                            onPress={() => {
                                setNombre(userData?.nombre || '');
                                setApellido(userData?.apellido || '');
                                setTelefono(userData?.telefono || '');
                                setIsEditing(false);
                            }}
                            disabled={updating}
                        >
                            <Ionicons name="close" size={20} color="#D32F2F" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#E8F5E9' }]}
                            onPress={handleGuardarCambios}
                            disabled={updating}
                        >
                            {updating ? <ActivityIndicator size="small" color="#1db954" /> : <Ionicons name="checkmark" size={20} color="#1db954" />}
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.settingsBtn} onPress={() => setIsEditing(true)}>
                        <Ionicons name="create-outline" size={22} color="#333" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* TARJETA PRINCIPAL DE USUARIO */}
                <View style={styles.profileCard}>
                    <Image
                        source={{ uri: userData?.foto_perfil || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200' }}
                        style={styles.avatarMain}
                    />
                    <View style={styles.profileInfoSpace}>
                        {isEditing ? (
                            <View style={styles.editInputsContainer}>
                                <TextInput style={styles.inputEditable} value={nombre} onChangeText={setNombre} placeholder="Nombre" />
                                <TextInput style={styles.inputEditable} value={apellido} onChangeText={setApellido} placeholder="Apellido" />
                            </View>
                        ) : (
                            <Text style={styles.profileName}>{userData?.nombre || 'Conductor'} {userData?.apellido || ''}</Text>
                        )}
                        <Text style={styles.profileUniversity}>Unidades Tecnológicas de Santander</Text>

                        <View style={styles.ratingRow}>
                            <Ionicons name="star" size={14} color="#F59E0B" style={styles.starIcon} />
                            <Text style={styles.ratingText}>
                                {userData?.calificacion_promedio !== undefined ? userData.calificacion_promedio.toFixed(2) : '—'}
                            </Text>
                            <Text style={styles.ratingCount}> (Conductor)</Text>
                        </View>
                    </View>
                </View>

                {isEditing && (
                    <View style={styles.phoneEditCard}>
                        <Ionicons name="call-outline" size={18} color="#666" style={{ marginRight: 10 }} />
                        <TextInput
                            style={[styles.inputEditable, { flex: 1, marginBottom: 0 }]}
                            value={telefono}
                            onChangeText={setTelefono}
                            placeholder="Teléfono móvil"
                            keyboardType="phone-pad"
                        />
                    </View>
                )}

                {/* ESTADÍSTICAS REALES */}
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{stats.viajes}</Text>
                        <Text style={styles.statLabel}>Viajes hechos</Text>
                    </View>
                    <View style={[styles.statBox, styles.statBorderLR]}>
                        <Text style={styles.statNumber}>{resenas.length}</Text>
                        <Text style={styles.statLabel}>Reseñas</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{stats.km.toFixed(1)}k</Text>
                        <Text style={styles.statLabel}>km estimados</Text>
                    </View>
                </View>

                {/* TARJETA DEL VEHÍCULO — lo nuevo respecto al perfil de pasajero */}
                {vehiculoData ? (
                    <View style={styles.vehiculoCard}>
                        {vehiculoData.foto_vehiculo ? (
                            <Image source={{ uri: vehiculoData.foto_vehiculo }} style={styles.vehiculoFoto} />
                        ) : (
                            <View style={styles.vehiculoFotoFallback}>
                                <MaterialCommunityIcons name={vehiculoData.tipo === 'moto' ? 'motorbike' : 'car-side'} size={26} color="#556B63" />
                            </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 14 }}>
                            <Text style={styles.vehiculoNombre}>{vehiculoData.marca} {vehiculoData.modelo}</Text>
                            <Text style={styles.vehiculoDetalle}>{vehiculoData.color} · {vehiculoData.placa}</Text>
                        </View>
                        {vehiculoData.verificado ? (
                            <View style={styles.verificadoChip}>
                                <Ionicons name="checkmark-circle" size={14} color="#1db954" />
                                <Text style={styles.verificadoChipText}>Verificado</Text>
                            </View>
                        ) : (
                            <View style={styles.pendienteChip}>
                                <Ionicons name="time-outline" size={14} color="#B45309" />
                                <Text style={styles.pendienteChipText}>Pendiente</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={styles.sinVehiculoCard}>
                        <MaterialCommunityIcons name="car-off" size={20} color="#A3A3A3" style={{ marginRight: 10 }} />
                        <Text style={styles.sinVehiculoTexto}>Aún no has registrado un vehículo.</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('RegistrarVehiculo')}>
                            <Text style={styles.sinVehiculoLink}>Agregar</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* CARNÉ UNIVERSITARIO */}
                <View style={styles.badgeVerificationCard}>
                    <View style={styles.badgeIconBg}>
                        <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#1db954" />
                    </View>
                    <View style={styles.badgeTextSpace}>
                        <Text style={styles.badgeCardTitle}>Carné universitario validado</Text>
                        <Text style={styles.badgeCardSubtitle}>Correo: {userData?.correo_institucional}</Text>
                        {!isEditing && userData?.telefono && (
                            <Text style={[styles.badgeCardSubtitle, { marginTop: 2, color: '#555' }]}>Teléfono: {userData.telefono}</Text>
                        )}
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#1db954" />
                </View>

                {/* INSIGNIAS — solo aparecen si el conductor realmente las cumple */}
                {insignias.length > 0 && (
                    <>
                        <Text style={styles.sectionTitleText}>INSIGNIAS</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.insigniasRow}>
                            {insignias.map((ins, idx) => (
                                <View key={idx} style={styles.insigniaChip}>
                                    <MaterialCommunityIcons name={ins.icono} size={16} color="#1db954" style={{ marginRight: 5 }} />
                                    <Text style={styles.insigniaText}>{ins.texto}</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </>
                )}

                {/* RESEÑAS REALES */}
                <Text style={styles.sectionTitleText}>RESEÑAS RECIENTES</Text>
                {resenas.length === 0 ? (
                    <Text style={styles.emptyText}>Aún no tienes reseñas como conductor.</Text>
                ) : (
                    resenas.map((r) => (
                        <View key={r.id} style={styles.resenaCard}>
                            <View style={styles.resenaTopRow}>
                                <Text style={styles.resenaNombre}>{r.nombreAutor}</Text>
                                <View style={{ flexDirection: 'row' }}>
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <Ionicons key={s} name={s <= (r.puntaje || 0) ? 'star' : 'star-outline'} size={12} color="#F59E0B" />
                                    ))}
                                </View>
                            </View>
                            {!!r.comentario && <Text style={styles.resenaComentario}>"{r.comentario}"</Text>}
                        </View>
                    ))
                )}

                {/* HISTORIAL DE VIAJES REAL — sin datos de ejemplo si está vacío */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitleText}>HISTORIAL DE VIAJES</Text>
                </View>

                {historialViajes.length === 0 ? (
                    <Text style={styles.emptyText}>Todavía no has completado ningún viaje como conductor.</Text>
                ) : (
                    historialViajes.map((viaje) => (
                        <View key={viaje.id} style={styles.historyItemCard}>
                            <View style={styles.historyIconBg}>
                                <Ionicons name="location-outline" size={18} color="#556B63" />
                            </View>
                            <View style={styles.historyRouteSpace}>
                                <Text style={styles.historyRouteText} numberOfLines={1}>
                                    {viaje.origen_nombre} <Text style={{ color: '#1db954' }}>➔</Text> {viaje.destino_nombre}
                                </Text>
                                <Text style={styles.historyDateText}>
                                    {viaje.fecha_hora?.seconds
                                        ? new Date(viaje.fecha_hora.seconds * 1000).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
                                        : ''} · Conductor
                                </Text>
                            </View>
                            <Text style={styles.historyPriceText}>
                                {typeof viaje.precio_final === 'number' ? `$${viaje.precio_final.toLocaleString('es-CO')}` : '—'}
                            </Text>
                        </View>
                    ))
                )}

            </ScrollView>

            {/* BARRA INFERIOR: misma del modo conductor (Radar / Modo Pasajero / Mi Perfil) */}
            <View style={[
                styles.bottomTabsContainer,
                { paddingBottom: insets.bottom > 0 ? insets.bottom : 10, height: insets.bottom > 0 ? 65 + insets.bottom : 65 }
            ]}>
                <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('HomeConductor')}>
                    <Ionicons name="radar-outline" size={22} color="#556B63" style={{ marginBottom: 4 }} />
                    <Text style={styles.tabText}>Radar</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('HomePasajero')}>
                    <MaterialCommunityIcons name="account-switch-outline" size={22} color="#556B63" style={{ marginBottom: 4 }} />
                    <Text style={styles.tabText}>Modo Pasajero</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.tabItem}>
                    <View style={styles.activeTabIconBg}>
                        <Octicons name="person" size={20} color="#000" />
                    </View>
                    <Text style={[styles.tabText, styles.activeTabText]}>Mi Perfil</Text>
                </TouchableOpacity>
            </View>

            <CustomAlert
                visible={alertConfig.visible}
                tipo={alertConfig.tipo}
                titulo={alertConfig.titulo}
                mensaje={alertConfig.mensaje}
                onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    mainContainer: { flex: 1, backgroundColor: '#FAFAFA', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10 },

    headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#F0F0F0' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 10 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    settingsBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
    actionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

    profileCard: { flexDirection: 'row', alignItems: 'center', marginVertical: 15, backgroundColor: '#fff', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#F0F0F0' },
    avatarMain: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E5E7EB' },
    profileInfoSpace: { marginLeft: 16, flex: 1 },
    profileName: { fontSize: 19, fontWeight: 'bold', color: '#111' },
    profileUniversity: { fontSize: 13, color: '#666', marginTop: 2 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    starIcon: { marginRight: 4 },
    ratingText: { fontSize: 14, fontWeight: 'bold', color: '#111' },
    ratingCount: { fontSize: 13, color: '#777' },

    editInputsContainer: { width: '100%' },
    inputEditable: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#333', backgroundColor: '#FAFAFA', marginBottom: 6 },
    phoneEditCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 15, borderColor: '#F0F0F0', marginBottom: 15, borderWidth: 1 },

    statsContainer: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 15, borderColor: '#F0F0F0', marginBottom: 20, borderWidth: 1 },
    statBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    statBorderLR: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#ECECEC' },
    statNumber: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    statLabel: { fontSize: 11, color: '#777', marginTop: 3, textAlign: 'center' },

    vehiculoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 20, borderWidth: 1, borderColor: '#F0F0F0', marginBottom: 15 },
    vehiculoFoto: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#E5E7EB' },
    vehiculoFotoFallback: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
    vehiculoNombre: { fontSize: 15, fontWeight: 'bold', color: '#111' },
    vehiculoDetalle: { fontSize: 12, color: '#666', marginTop: 2 },
    verificadoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    verificadoChipText: { color: '#1db954', fontSize: 11, fontWeight: '700', marginLeft: 4 },
    pendienteChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    pendienteChipText: { color: '#B45309', fontSize: 11, fontWeight: '700', marginLeft: 4 },

    sinVehiculoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 20, borderWidth: 1, borderColor: '#F0F0F0', marginBottom: 15 },
    sinVehiculoTexto: { flex: 1, fontSize: 13, color: '#888' },
    sinVehiculoLink: { fontSize: 13, color: '#1db954', fontWeight: 'bold' },

    badgeVerificationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 14, borderRadius: 20, marginBottom: 25 },
    badgeIconBg: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    badgeTextSpace: { flex: 1 },
    badgeCardTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E4620' },
    badgeCardSubtitle: { fontSize: 11, color: '#446A46', marginTop: 1 },

    sectionTitleText: { fontSize: 12, fontWeight: '700', color: '#7A8B85', letterSpacing: 0.5, marginBottom: 12 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 12 },
    emptyText: { fontSize: 13, color: '#999', marginBottom: 20, lineHeight: 18 },

    insigniasRow: { flexDirection: 'row', marginBottom: 25 },
    insigniaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1EFE0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
    insigniaText: { fontSize: 13, color: '#1E4620', fontWeight: '600' },

    resenaCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0' },
    resenaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resenaNombre: { fontSize: 13, fontWeight: '700', color: '#111' },
    resenaComentario: { fontSize: 13, color: '#555', marginTop: 8, fontStyle: 'italic' },

    historyItemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0' },
    historyIconBg: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F4F6F5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    historyRouteSpace: { flex: 1, paddingRight: 8 },
    historyRouteText: { fontSize: 14, fontWeight: 'bold', color: '#222' },
    historyDateText: { fontSize: 12, color: '#777', marginTop: 3 },
    historyPriceText: { fontSize: 14, fontWeight: 'bold', color: '#1db954' },

    bottomTabsContainer: { backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEEEEE' },
    tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    activeTabIconBg: { width: 48, height: 32, borderRadius: 16, backgroundColor: '#D1EFE0', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    tabText: { fontSize: 12, color: '#556B63', fontWeight: '500' },
    activeTabText: { color: '#1db954', fontWeight: '700' }
});