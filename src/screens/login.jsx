import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ImageBackground, ScrollView, SafeAreaView, StatusBar, ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import CustomAlert from '../components/CustomAlert';

const DOMINIO_INSTITUCIONAL = '@uts.edu.co';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);

  // Estados para controlar el CustomAlert
  const [alertConfig, setAlertConfig] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '', onAction: null });

  const mostrarAlerta = (tipo, titulo, mensaje, onAction = null) => {
    setAlertConfig({ visible: true, tipo, titulo, mensaje, onAction });
  };

  const cerrarAlerta = () => {
    const action = alertConfig.onAction;
    setAlertConfig({ ...alertConfig, visible: false });
    if (action) action();
  };

  const validarCorreo = (correo) => correo.trim().endsWith(DOMINIO_INSTITUCIONAL);

  const handleRecuperarContrasena = async () => {
    // Si el usuario ya escribió algo en el campo de texto del correo, lo usamos directamente
    if (!email) {
      mostrarAlerta(
        'info',
        'Introduce tu correo',
        'Por favor, escribe tu correo institucional en el campo de texto de arriba para poder enviarte el enlace de recuperación.'
      );
      return;
    }

    if (!validarCorreo(email)) {
      mostrarAlerta(
        'error',
        'Correo no válido',
        `Recuerda que tu cuenta debe terminar en ${DOMINIO_INSTITUCIONAL}`
      );
      return;
    }

    setLoading(true);
    try {
      // Firebase envía el correo de recuperación en el idioma configurado en tu consola
      await sendPasswordResetEmail(auth, email.trim());

      mostrarAlerta(
        'exito',
        'Enlace Enviado ✓',
        `Hemos enviado las instrucciones de restablecimiento a ${email.trim()}. Revisa tu bandeja de entrada (o SPAM).`
      );
    } catch (error) {
      console.error(error);
      let mensaje = 'No se pudo enviar el correo de recuperación.';
      if (error.code === 'auth/user-not-found') {
        mensaje = 'No existe ningún usuario registrado con este correo.';
      }
      mostrarAlerta('error', 'Error', mensaje);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      mostrarAlerta('error', 'Campos vacíos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }
    if (!validarCorreo(email)) {
      mostrarAlerta('error', 'Correo no válido', `Solo se permite el acceso con correos institucionales ${DOMINIO_INSTITUCIONAL}`);
      return;
    }

    setLoading(true);
    try {
      const credencial = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = credencial.user.uid;

      const usuarioRef = doc(db, 'Usuarios', uid);
      const usuarioSnap = await getDoc(usuarioRef);

      if (!usuarioSnap.exists()) {
        mostrarAlerta('error', 'Error de Base de Datos', 'Usuario no encontrado en el sistema.');
        return;
      }

      const datosUsuario = usuarioSnap.data();

      // Validación adaptativa por si acaso el campo está como "activo" o "estado"
      const cuentaActiva = datosUsuario.activo !== undefined ? datosUsuario.activo : datosUsuario.estado;

      if (cuentaActiva === false) {
        mostrarAlerta('error', 'Cuenta suspendida', 'Tu cuenta ha sido desactivada. Contacta al administrador.');
        return;
      }

      // LOGIN EXITOSO
      mostrarAlerta('exito', '¡Inicio de Sesión Exitoso! ✓', 'Bienvenido de vuelta a la plataforma de Umóvil.', () => {
        if (datosUsuario.rol && datosUsuario.rol.includes('conductor')) {
          navigation.replace('HomeConductor');
        } else {
          navigation.replace('HomePasajero');
        }
      });

    } catch (error) {
      console.error(error);
      let mensaje = 'Ocurrió un error al iniciar sesión.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        mensaje = 'Correo o contraseña incorrectos.';
      } else if (error.code === 'auth/invalid-email') {
        mensaje = 'El formato del correo no es válido.';
      } else if (error.code === 'auth/too-many-requests') {
        mensaje = 'Demasiados intentos. Intenta más tarde.';
      }
      mostrarAlerta('error', 'No se pudo iniciar sesión', mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent={true} backgroundColor="transparent" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContainer}
        bounces={false}
      >
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=600' }}
          style={styles.headerBackground}
        >
          <View style={styles.overlay}>
            <SafeAreaView style={styles.headerContent}>
              <View style={styles.brandRow}>
                <View style={styles.logoIconContainer}>
                  <Ionicons name="car-sport" size={24} color="#1db954" />
                </View>
                <Text style={styles.brandName}>Umóvil</Text>
              </View>
              <Text style={styles.heroTitle}>Muévete con tu comunidad</Text>
              <Text style={styles.heroSubtitle}>Viajes seguros entre estudiantes verificados</Text>
            </SafeAreaView>
          </View>
        </ImageBackground>

        {/* El contenedor blanco ahora se funde al 100% hasta abajo */}
        <View style={styles.formContainer}>
          <View style={styles.topFormBlock}>
            <Text style={styles.welcomeText}>Bienvenido de nuevo</Text>
            <Text style={styles.welcomeSubtitle}>Inicia sesión con tu cuenta universitaria</Text>

            <Text style={styles.inputLabel}>Correo institucional</Text>
            <View style={styles.inputWrapper}>
              <MaterialCommunityIcons name="email-outline" size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={`estudiante${DOMINIO_INSTITUCIONAL}`}
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.inputLabel}>Contraseña</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={secureText}
              />
              <TouchableOpacity onPress={() => setSecureText(!secureText)}>
                <Ionicons name={secureText ? "eye-off-outline" : "eye-outline"} size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.forgotPasswordContainer}
              onPress={handleRecuperarContrasena}
              disabled={loading}
            >
              <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Iniciar sesión</Text>}
            </TouchableOpacity>
          </View>

          {/* El footer se acopla abajo de manera perfecta y balanceada */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>¿Eres nuevo en Umóvil? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Regístrate</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

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
  mainContainer: { flex: 1, backgroundColor: '#fff' }, // Cambiado a blanco uniforme de fondo base
  scrollContainer: { flexGrow: 1, backgroundColor: '#fff' },
  headerBackground: { height: 240 },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 20 },
  headerContent: { flex: 1, justifyContent: 'center', marginTop: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  logoIconContainer: { width: 36, height: 36, backgroundColor: '#fff', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  brandName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  heroTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: '#E0E0E0', marginTop: 4 },

  formContainer: {
    flex: 1,
    backgroundColor: '#fff', // Fondo completamente limpio
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    marginTop: -30,
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 60, // Espacio prudente para la barra de navegación del cel
    justifyContent: 'space-between'
  },
  topFormBlock: { width: '100%' },
  welcomeText: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  welcomeSubtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 6 },
  inputWrapper: { flexDirection: 'row', backgroundColor: '#EDF2F1', borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', height: 48, marginBottom: 16 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#000', fontSize: 14 },
  forgotPasswordContainer: { alignItems: 'flex-end', marginBottom: 24 },
  forgotPasswordText: { color: '#1db954', fontSize: 13, fontWeight: '600' },
  loginBtn: { backgroundColor: '#1db954', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  footerContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 30, marginBottom: 40 },
  footerText: { color: '#666', fontSize: 13 },
  registerLink: { color: '#1db954', fontWeight: 'bold', fontSize: 13 }
});