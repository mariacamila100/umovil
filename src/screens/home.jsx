import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';

export default function HomeScreen({ navigation, route }) {
  const [rol, setRol] = useState('');
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    // Si pasas el rol desde el login lo capturamos, si no, asumimos pasajero por defecto
    if (route.params?.rol) {
      setRol(route.params.rol);
    } else {
      // Simulación o lectura rápida de perfil
      setRol('pasajero'); 
    }
    setLoading(false);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      console.error("Error al cerrar sesión: ", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header Principal */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, Estudiante</Text>
          <Text style={styles.emailText}>{user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#ff3b30" />
        </TouchableOpacity>
      </View>

      {/* Contenido Dinámico según el Rol */}
      <View style={styles.content}>
        <View style={styles.brandContainer}>
          <Text style={styles.brandText}>Umóvil</Text>
          <Text style={styles.tagline}>Panel de Control ({rol === 'conductor' ? 'Conductor' : 'Pasajero'})</Text>
        </View>

        {rol === 'conductor' ? (
          /* VISTA DEL CONDUCTOR */
          <View style={styles.roleCard}>
            <MaterialCommunityIcons name="steering" size={50} color="#1db954" />
            <Text style={styles.cardTitle}>¿A dónde manejas hoy?</Text>
            <Text style={styles.cardDescription}>Publica tu ruta para que tus compañeros de las UTS puedan unirse a tu viaje.</Text>
            <TouchableOpacity style={styles.primaryBtn}>
              <Text style={styles.btnText}>Crear Nueva Ruta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* VISTA DEL PASAJERO */
          <View style={styles.roleCard}>
            <Ionicons name="car-sport" size={50} color="#1db954" />
            <Text style={styles.cardTitle}>Encuentra un viaje seguro</Text>
            <Text style={styles.cardDescription}>Busca conductores verificados que vayan hacia las UTS o salgan de la sede.</Text>
            <TouchableOpacity style={styles.primaryBtn}>
              <Text style={styles.btnText}>Buscar Rutas Disponibles</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  greeting: { fontSize: 20, fontWeight: 'bold', color: '#333', fontFamily: 'DM Sans' },
  emailText: { fontSize: 13, color: '#666', marginTop: 2 },
  logoutBtn: { padding: 8 },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  brandContainer: { alignItems: 'center', marginBottom: 40 },
  brandText: { fontSize: 32, fontWeight: 'bold', color: '#1db954', letterSpacing: 1 },
  tagline: { fontSize: 14, color: '#666', marginTop: 5 },
  roleCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 8 },
  cardDescription: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  primaryBtn: {
    backgroundColor: '#1db954',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});