import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ImageBackground, ScrollView, StatusBar, ActivityIndicator, Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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


  const insets = useSafeAreaInsets();

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

    // Corregido: faltaba el "set" — esto antes intentaba llamar a "loading" como función y rompía el flujo
    setLoading(true);
    try {
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
      const cuentaActiva = datosUsuario.activo !== undefined ? datosUsuario.activo : datosUsuario.estado;

      if (cuentaActiva === false) {
        mostrarAlerta('error', 'Cuenta suspendida', 'Tu cuenta ha sido desactivada. Contacta al administrador.');
        return;
      }

      mostrarAlerta('exito', '¡Inicio de Sesión Exitoso!', 'Bienvenido de vuelta a la plataforma de Umóvil.', () => {
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
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=600' }}
          // El alto ahora suma el inset superior real: la imagen se extiende
          // de forma natural debajo del notch/isla en vez de usar un valor fijo a ciegas.
          style={[styles.headerBackground, { height: 230 + insets.top }]}
        >
          <View style={styles.overlay}>
            <View style={[styles.headerContent, { paddingTop: insets.top + 18 }]}>
              <View style={styles.brandRow}>
                <View style={styles.logoIconContainer}>
                  <Ionicons name="car-sport" size={24} color="#1db954" />
                </View>
                <Text style={styles.brandName}>Umóvil</Text>
              </View>
              <Text style={styles.heroTitle}>Muévete con tu comunidad</Text>
              <Text style={styles.heroSubtitle}>Viajes seguros entre estudiantes verificados</Text>
            </View>
          </View>
        </ImageBackground>

        <View style={[styles.formContainer, { paddingBottom: insets.bottom + 20 }]}>
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
  mainContainer: {
    flex: 1,
    backgroundColor: '#fff'
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#fff'
  },
  headerBackground: {
    // El alto base se ajusta dinámicamente arriba sumando insets.top
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 24
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center'
    // paddingTop ahora se calcula con insets.top arriba, ya no depende de
    // StatusBar.currentHeight (impreciso en notches/isla dinámica)
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  logoIconContainer: {
    width: 38,
    height: 38,
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  brandName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold'
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#E0E0E0',
    marginTop: 6
  },

  formContainer: {
    // Ya no usa flex:1: así el formulario toma solo el alto que su contenido
    // necesita y no empuja un bloque de espacio en blanco vacío al final.
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -32, // Hace el traslape limpio con la imagen curva
    paddingHorizontal: 24,
    paddingTop: 35
    // paddingBottom ahora se calcula con insets.bottom arriba (home indicator / gesto Android)
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111'
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 28
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8
  },
  inputWrapper: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    height: 52,
    marginBottom: 18
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    color: '#000',
    fontSize: 15
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 28
  },
  forgotPasswordText: {
    color: '#1db954',
    fontSize: 14,
    fontWeight: '600'
  },
  loginBtn: {
    backgroundColor: '#1db954',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    // Sutil sombra para que se vea más Premium en el dispositivo
    shadowColor: '#1db954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },

  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25
  },
  footerText: {
    color: '#666',
    fontSize: 14
  },
  registerLink: {
    color: '#1db954',
    fontWeight: 'bold',
    fontSize: 14
  }
});