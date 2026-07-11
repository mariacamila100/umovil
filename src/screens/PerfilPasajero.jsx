import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Image, TouchableOpacity,
    ScrollView, SafeAreaView, StatusBar, ActivityIndicator, TextInput, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Octicons, Feather } from '@expo/vector-icons';
import { auth, db } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

// 1. Importar el componente CustomAlert desde la ruta relativa correspondiente
import CustomAlert from '../components/CustomAlert';

export default function PerfilPasajero({ navigation }) {
    const insets = useSafeAreaInsets(); // Obtiene los espacios seguros del sistema operativo

    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [historialViajes, setHistorialViajes] = useState([]);
    const [stats, setStats] = useState({ viajes: 0, km: 0 });

    // Estados para el modo edición
    const [isEditing, setIsEditing] = useState(false);
    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [telefono, setTelefono] = useState('');

    // 2. Estados para el manejo de la Alerta Personalizada (CustomAlert)
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        tipo: 'info',
        titulo: '',
        mensaje: ''
    });

    useEffect(() => {
        const fetchPerfilData = async () => {
            try {
                if (!auth.currentUser) {
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                    return;
                }
                const uid = auth.currentUser.uid;

                const userDoc = await getDoc(doc(db, 'Usuarios', uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setUserData(data);
                    setNombre(data.nombre || '');
                    setApellido(data.apellido || '');
                    setTelefono(data.telefono || '');
                }

                const q = query(collection(db, 'Viajes'), where('pasajeroId', '==', uid));
                const querySnapshot = await getDocs(q);

                let viajesCount = 0;
                let listaViajes = [];

                querySnapshot.forEach((doc) => {
                    viajesCount++;
                    listaViajes.push({ id: doc.id, ...doc.data() });
                });

                setStats({
                    viajes: viajesCount,
                    km: viajesCount * 3.5 
                });

                if (listaViajes.length === 0) {
                    listaViajes = [
                        { id: '1', origen: 'Residencias', destino: 'Campus UTS', fecha: '28 Jun', precio: '2.500' },
                        { id: '2', origen: 'Campus UTS', destino: 'Centro Comercial', fecha: '25 Jun', precio: '3.000' }
                    ];
                }
                setHistorialViajes(listaViajes);

            } catch (error) {
                console.error("Error al cargar perfil:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPerfilData();
    }, []);

    // Función auxiliar para desplegar la alerta personalizada de forma sencilla
    const showAlert = (tipo, titulo, mensaje) => {
        setAlertConfig({
            visible: true,
            tipo,
            titulo,
            mensaje
        });
    };

    const handleCerrarSesion = async () => {
        try {
            await signOut(auth);
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    };

    const handleGuardarCambios = async () => {
        if (!nombre.trim() || !apellido.trim() || !telefono.trim()) {
            showAlert('error', 'Campos vacíos', 'Por favor completa todos los campos editables.');
            return;
        }

        setUpdating(true);
        try {
            const uid = auth.currentUser.uid;
            const userRef = doc(db, 'Usuarios', uid);

            await updateDoc(userRef, {
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                telefono: telefono.trim()
            });

            setUserData({
                ...userData,
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                telefono: telefono.trim()
            });

            setIsEditing(false);
            // 3. Mostrar CustomAlert con configuración de 'exito'
            showAlert('exito', '¡Perfil Actualizado!', 'Tus datos se guardaron correctamente en la plataforma.');
        } catch (error) {
            console.error("Error al actualizar perfil:", error);
            showAlert('error', 'Error en el Servidor', 'No se pudieron guardar los cambios. Intenta de nuevo.');
        } finally {
            setUpdating(false);
        }
    };

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
                <Text style={styles.headerTitle}>Mi Perfil</Text>
                
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
                            {updating ? (
                                <ActivityIndicator size="small" color="#1db954" />
                            ) : (
                                <Ionicons name="checkmark" size={20} color="#1db954" />
                            )}
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity style={[styles.settingsBtn, { marginRight: 8 }]} onPress={() => setIsEditing(true)}>
                            <Ionicons name="create-outline" size={22} color="#333" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.logoutBtn} onPress={handleCerrarSesion}>
                            <Ionicons name="log-out-outline" size={20} color="#D32F2F" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* TARJETA PRINCIPAL DE USUARIO */}
                <View style={styles.profileCard}>
                    <Image
                        source={{ uri: userData?.foto_perfil || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200' }}
                        style={styles.avatarMain}
                    />
                    <View style={styles.profileInfoSpace}>
                        {isEditing ? (
                            <View style={styles.editInputsContainer}>
                                <TextInput
                                    style={styles.inputEditable}
                                    value={nombre}
                                    onChangeText={setNombre}
                                    placeholder="Nombre"
                                />
                                <TextInput
                                    style={styles.inputEditable}
                                    value={apellido}
                                    onChangeText={setApellido}
                                    placeholder="Apellido"
                                />
                            </View>
                        ) : (
                            <View style={styles.nameRow}>
                                <Text style={styles.profileName}>{userData?.nombre || 'Estudiante'} {userData?.apellido || ''}</Text>
                            </View>
                        )}
                        <Text style={styles.profileUniversity}>Unidades Tecnológicas de Santander</Text>

                        <View style={styles.ratingRow}>
                            <Ionicons name="star" size={14} color="#FAFF00" style={styles.starIcon} />
                            <Text style={styles.ratingText}>
                                {userData?.calificacion_promedio !== undefined ? userData.calificacion_promedio.toFixed(2) : '5.0'}
                            </Text>
                            <Text style={styles.ratingCount}> (Estudiante)</Text>
                        </View>
                    </View>
                </View>

                {/* CAMPO DE TELÉFONO EDITABLE */}
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

                {/* CONTENEDOR DE ESTADÍSTICAS */}
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{stats.viajes}</Text>
                        <Text style={styles.statLabel}>Viajes</Text>
                    </View>
                    <View style={[styles.statBox, styles.statBorderLR]}>
                        <Text style={styles.statNumber}>-</Text>
                        <Text style={styles.statLabel}>Como cond.</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{stats.km.toFixed(1)}k</Text>
                        <Text style={styles.statLabel}>km totales</Text>
                    </View>
                </View>

                {/* CARNÉ UNIVERSITARIO VALIDADO */}
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

                {/* SECCIÓN DE INSIGNIAS */}
                <Text style={styles.sectionTitleText}>INSIGNIAS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.insigniasRow}>
                    <View style={styles.insigniaChip}>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color="#1db954" style={{ marginRight: 5 }} />
                        <Text style={styles.insigniaText}>Pasajero Top</Text>
                    </View>
                    <View style={styles.insigniaChip}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#1db954" style={{ marginRight: 5 }} />
                        <Text style={styles.insigniaText}>Siempre puntual</Text>
                    </View>
                    <View style={styles.insigniaChip}>
                        <MaterialCommunityIcons name="emoticon-happy-outline" size={16} color="#1db954" style={{ marginRight: 5 }} />
                        <Text style={styles.insigniaText}>Amigable</Text>
                    </View>
                </ScrollView>

                {/* HISTORIAL DE VIAJES */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitleText}>HISTORIAL DE VIAJES</Text>
                    <TouchableOpacity><Text style={styles.verTodosText}>Ver todos</Text></TouchableOpacity>
                </View>

                {historialViajes.map((viaje) => (
                    <View key={viaje.id} style={styles.historyItemCard}>
                        <View style={styles.historyIconBg}>
                            <Ionicons name="location-outline" size={18} color="#556B63" />
                        </View>
                        <View style={styles.historyRouteSpace}>
                            <Text style={styles.historyRouteText} numberOfLines={1}>
                                {viaje.origen} <Text style={{ color: '#1db954' }}>➔</Text> {viaje.destino}
                            </Text>
                            <Text style={styles.historyDateText}>{viaje.fecha} · Pasajero</Text>
                        </View>
                        <View style={styles.historyPriceSpace}>
                            <Text style={styles.historyPriceText}>${viaje.precio}</Text>
                            <View style={styles.miniStarsRow}>
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <Ionicons key={s} name="star" size={10} color="#000" />
                                ))}
                            </View>
                        </View>
                    </View>
                ))}

            </ScrollView>

            {/* 4. RENDERIZADO DEL COMPONENTE PERSONALIZADO */}
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
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    settingsBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
    logoutBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFEBEE' },
    actionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

    profileCard: { flexDirection: 'row', alignItems: 'center', marginVertical: 15, backgroundColor: '#fff', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#F0F0F0' },
    avatarMain: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E5E7EB' },
    profileInfoSpace: { marginLeft: 16, flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
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
    statLabel: { fontSize: 12, color: '#777', marginTop: 3 },

    badgeVerificationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 14, borderRadius: 20, marginBottom: 25 },
    badgeIconBg: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    badgeTextSpace: { flex: 1 },
    badgeCardTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E4620' },
    badgeCardSubtitle: { fontSize: 11, color: '#446A46', marginTop: 1 },

    sectionTitleText: { fontSize: 12, fontWeight: '700', color: '#7A8B85', letterSpacing: 0.5, marginBottom: 12 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 12 },
    verTodosText: { fontSize: 12, color: '#1db954', fontWeight: 'bold' },

    insigniasRow: { flexDirection: 'row', marginBottom: 25 },
    insigniaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1EFE0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
    insigniaText: { fontSize: 13, color: '#1E4620', fontWeight: '600' },

    historyItemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0' },
    historyIconBg: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F4F6F5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    historyRouteSpace: { flex: 1, paddingRight: 8 },
    historyRouteText: { fontSize: 14, fontWeight: 'bold', color: '#222' },
    historyDateText: { fontSize: 12, color: '#777', marginTop: 3 },
    historyPriceSpace: { alignItems: 'flex-end' },
    historyPriceText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    miniStarsRow: { flexDirection: 'row', marginTop: 4 },
});