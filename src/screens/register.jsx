import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ImageBackground, ScrollView, SafeAreaView, StatusBar, ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import CustomAlert from '../components/CustomAlert'; 

const DOMINIO_INSTITUCIONAL = '@uts.edu.co';

export default function RegisterScreen({ navigation }) {
  const [isAuthVerified, setIsAuthVerified] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [celular, setCelular] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [rolSeleccionado, setRolSeleccionado] = useState('pasajero');
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

  useEffect(() => {
    let intervalo;
    if (isAuthVerified && auth.currentUser) {
      intervalo = setInterval(async () => {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          clearInterval(intervalo);
          mostrarAlerta(
            'exito',
            '¡Correo Confirmado! ✓',
            'Tu cuenta institucional ha sido verificada con éxito. Procede a completar tus datos de perfil.'
          );
        }
      }, 3000);
    }
    return () => clearInterval(intervalo);
  }, [isAuthVerified]);

  const handleVerificarCorreo = async () => {
    if (!email || !password) {
      mostrarAlerta('error', 'Campos vacíos', 'Ingresa tu correo y una contraseña.');
      return;
    }
    if (!validarCorreo(email)) {
      mostrarAlerta('error', 'Correo no institucional', `Solo puedes registrarte con un correo ${DOMINIO_INSTITUCIONAL}`);
      return;
    }
    if (password.length < 6) {
      mostrarAlerta('error', 'Contraseña débil', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const credencial = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(credencial.user);
      setIsAuthVerified(true);
      mostrarAlerta('info', 'Enlace Enviado', `Hemos enviado un correo de confirmación a ${email.trim()}. Revisa tu bandeja de entrada.`);
    } catch (error) {
      let mensaje = 'Error al crear la cuenta.';
      if (error.code === 'auth/email-already-in-use') mensaje = 'Ya existe una cuenta con este correo.';
      mostrarAlerta('error', 'Error', mensaje);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalRegister = async () => {
    if (!nombre || !apellido || !celular) {
      mostrarAlerta('error', 'Campos incompletos', 'Por favor completa todos los campos.');
      return;
    }
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
      mostrarAlerta('error', 'Verificación Pendiente', 'Aún no has confirmado tu cuenta mediante el enlace de correo.');
      return;
    }

    setLoading(true);
    try {
      const uid = auth.currentUser.uid;

      await setDoc(doc(db, 'Usuarios', uid), {
        uid,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        correo_institucional: email.trim(),
        telefono: celular.trim(),
        foto_perfil: '',
        calificacion_promedio: 0.0,
        rol: [rolSeleccionado], 
        activo: true,
        creado_en: serverTimestamp()
      });

      await setDoc(doc(db, 'auditoria', `${uid}_registro`), {
        usuario_id: uid,
        accion: 'USUARIO_REGISTRO',
        entidad: 'usuario',
        entidad_id: uid,
        datos_antes: null,
        datos_despues: { nombre, apellido, correo: email, rol: [rolSeleccionado] },
        timestamp: serverTimestamp()
      });

      mostrarAlerta('exito', '¡Registro Exitoso! ✓', 'Tu perfil de Umóvil ha sido configurado con éxito.', () => {
        if (rolSeleccionado === 'conductor') {
          navigation.replace('HomeConductor');
        } else {
          navigation.replace('HomePasajero');
        }
      });

    } catch (error) {
      mostrarAlerta('error', 'Error', 'No se pudieron almacenar los datos de tu perfil.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent={true} backgroundColor="transparent" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContainer} bounces={false}>
        
        {/* Encabezado idéntico en imagen, altura (240) y opacidad al Login */}
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=600' }}
          style={styles.headerBackground}
        >
          <View style={styles.overlay}>
            <SafeAreaView style={styles.headerContent}>
              <View style={styles.brandRow}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => isAuthVerified ? setIsAuthVerified(false) : navigation.goBack()}
                >
                  <Ionicons name="arrow-back" size={20} color="#1db954" />
                </TouchableOpacity>
                <View style={styles.logoIconContainer}>
                  <Ionicons name="car-sport" size={24} color="#1db954" />
                </View>
                <Text style={styles.brandName}>Umóvil</Text>
              </View>
              <Text style={styles.heroTitle}>Únete a la comunidad</Text>
              <Text style={styles.heroSubtitle}>Solo estudiantes universitarios verificados</Text>
            </SafeAreaView>
          </View>
        </ImageBackground>

        {/* Estructura del Formulario idéntica con estiramiento completo */}
        <View style={styles.formContainer}>
          <View style={styles.topFormBlock}>
            
            {/* Indicador de pasos estilizado e integrado */}
            <View style={styles.stepsContainer}>
              <View style={styles.stepIndicatorRow}>
                <View style={[styles.stepCircle, styles.stepActive]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
                <View style={[styles.stepLine, isAuthVerified && styles.lineActive]} />
                <View style={[styles.stepCircleNumber, isAuthVerified && styles.stepActive]}>
                  {isAuthVerified && auth.currentUser?.emailVerified ? (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : (
                    <Text style={styles.stepNumberText}>2</Text>
                  )}
                </View>
              </View>
              <Text style={styles.stepsText}>
                {isAuthVerified ? 'Paso 2 de 2 · Tu Perfil' : 'Paso 1 de 2 · Verificación'}
              </Text>
            </View>

            {!isAuthVerified ? (
              /* PASO 1 */
              <View>
                <Text style={styles.welcomeText}>Verifica tu universidad</Text>
                <Text style={styles.welcomeSubtitle}>Usa tu correo institucional {DOMINIO_INSTITUCIONAL}</Text>

                <Text style={styles.inputLabel}>Correo institucional</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="email-outline" size={18} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={`tu.nombre${DOMINIO_INSTITUCIONAL}`}
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
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor="#999"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleVerificarCorreo} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Verificar y Continuar</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              /* PASO 2 */
              <View>
                <Text style={styles.welcomeText}>Completa tu perfil</Text>
                <Text style={styles.welcomeSubtitle}>Tus compañeros de las UTS te reconocerán con estos datos.</Text>

                {!auth.currentUser?.emailVerified && (
                  <View style={styles.waitingContainer}>
                    <ActivityIndicator size="small" color="#1db954" />
                    <Text style={styles.waitingText}>
                      Esperando confirmación... Abre tu correo institucional y haz clic en el enlace.
                    </Text>
                  </View>
                )}

                <View style={styles.rowInputs}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.inputLabel}>Nombre</Text>
                    <TextInput style={styles.rowInput} placeholder="Nombre" placeholderTextColor="#999" value={nombre} onChangeText={setNombre} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Apellido</Text>
                    <TextInput style={styles.rowInput} placeholder="Apellido" placeholderTextColor="#999" value={apellido} onChangeText={setApellido} />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Número de celular</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="phone-outline" size={18} color="#666" style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="315 123 4567" placeholderTextColor="#999" keyboardType="phone-pad" value={celular} onChangeText={setCelular} />
                </View>

                <Text style={styles.inputLabel}>¿Cómo usarás la aplicación hoy?</Text>
                <View style={styles.roleSelectionRow}>
                  <TouchableOpacity
                    onPress={() => setRolSeleccionado('pasajero')}
                    style={[styles.roleCard, rolSeleccionado === 'pasajero' && styles.roleCardActive]}
                  >
                    <Ionicons
                      name={rolSeleccionado === 'pasajero' ? "walk" : "walk-outline"}
                      size={18}
                      color={rolSeleccionado === 'pasajero' ? "#1db954" : "#666"}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.roleTextBtn, rolSeleccionado === 'pasajero' && styles.roleTextActive]}>
                      Voy de Pasajero
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setRolSeleccionado('conductor')}
                    style={[styles.roleCard, rolSeleccionado === 'conductor' && styles.roleCardActive]}
                  >
                    <Ionicons
                      name={rolSeleccionado === 'conductor' ? "car-sport" : "car-sport-outline"}
                      size={18}
                      color={rolSeleccionado === 'conductor' ? "#1db954" : "#666"}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.roleTextBtn, rolSeleccionado === 'conductor' && styles.roleTextActive]}>
                      Soy Conductor
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (!auth.currentUser?.emailVerified || loading) && { backgroundColor: '#A3A3A3' }]}
                  onPress={handleFinalRegister}
                  disabled={loading || !auth.currentUser?.emailVerified}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Finalizar Registro</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* El footer se acopla abajo de forma simétrica al login */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.registerLink}>Iniciar sesión</Text>
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
  mainContainer: { flex: 1, backgroundColor: '#fff' }, 
  scrollContainer: { flexGrow: 1, backgroundColor: '#fff' }, 
  headerBackground: { height: 240 }, // Igualado al alto del Login
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 20 },
  headerContent: { flex: 1, justifyContent: 'center', marginTop: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  
  // Botón volver acoplado perfectamente al lado de la marca
  backButton: { width: 34, height: 34, backgroundColor: '#fff', borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  logoIconContainer: { width: 36, height: 36, backgroundColor: '#fff', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  brandName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  heroTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: '#E0E0E0', marginTop: 4 },
  
  // Contenedor estirado 1:1 con el del Login
  formContainer: { 
    flex: 1, 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30, 
    marginTop: -30, 
    paddingHorizontal: 20, 
    paddingTop: 24,
    paddingBottom: 30, 
    justifyContent: 'space-between' 
  },
  topFormBlock: { width: '100%' },
  stepsContainer: { marginBottom: 20, alignItems: 'center' },
  stepIndicatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  stepCircle: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#666' },
  stepCircleNumber: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E5E7EB' },
  stepActive: { backgroundColor: '#1db954' }, 
  stepLine: { width: 40, height: 2, backgroundColor: '#E5E7EB' },
  lineActive: { backgroundColor: '#1db954' },
  stepNumberText: { fontSize: 11, color: '#666', fontWeight: 'bold' },
  stepsText: { fontSize: 12, color: '#666', fontWeight: '500' },
  
  welcomeText: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  welcomeSubtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 6 },
  inputWrapper: { flexDirection: 'row', backgroundColor: '#EDF2F1', borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', height: 48, marginBottom: 16 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#000', fontSize: 14 },
  rowInputs: { flexDirection: 'row', marginBottom: 16 },
  rowInput: { flex: 1, backgroundColor: '#EDF2F1', borderRadius: 12, paddingHorizontal: 12, height: 48, color: '#000', fontSize: 14 },
  
  roleSelectionRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10, marginBottom: 22 },
  roleCard: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#EDF2F1', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent', marginRight: 4, marginLeft: 4 },
  roleCardActive: { backgroundColor: '#DCFCE7', borderColor: '#1db954' },
  roleTextBtn: { color: '#666', fontWeight: '700', fontSize: 13 },
  roleTextActive: { color: '#1db954' },
  submitBtn: { backgroundColor: '#1db954', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginTop: 10, marginBottom: 10 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  waitingContainer: { flexDirection: 'row', backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center', marginBottom: 14 },
  waitingText: { flex: 1, color: '#92400E', fontSize: 12, marginLeft: 8, fontWeight: '500' },
  
  footerContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 20, marginBottom: 10 },
  footerText: { color: '#666', fontSize: 13 },
  registerLink: { color: '#1db954', fontWeight: 'bold', fontSize: 13 }
});
