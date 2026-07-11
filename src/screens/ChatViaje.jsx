import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, SafeAreaView
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, auth } from '../firebase/config';
import {
  collection, doc, addDoc, onSnapshot, getDoc, query, orderBy, serverTimestamp
} from 'firebase/firestore';

export default function ChatViaje({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { viajeId } = route.params;
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [companeroData, setCompaneroData] = useState(null);
  const [viaje, setViaje] = useState(null);
  
  const currentUserId = auth.currentUser?.uid;

  // 1. Obtener datos del viaje y del compañero de chat
  useEffect(() => {
    const fetchChatDetails = async () => {
      try {
        const viajeSnap = await getDoc(doc(db, 'Viajes', viajeId));
        if (viajeSnap.exists()) {
          const viajeData = viajeSnap.data();
          setViaje(viajeData);

          // Determinar quién es la contraparte
          const esPasajero = viajeData.pasajero_id === currentUserId;
          const idCompanero = esPasajero ? viajeData.conductor_id : viajeData.pasajero_id;

          if (idCompanero) {
            const userSnap = await getDoc(doc(db, 'Usuarios', idCompanero));
            if (userSnap.exists()) {
              setCompaneroData(userSnap.data());
            }
          }
        }
      } catch (error) {
        console.error("Error al obtener detalles del chat:", error);
      }
    };

    fetchChatDetails();
  }, [viajeId]);

  // 2. Escuchar mensajes en tiempo real
  useEffect(() => {
    const mensajesRef = collection(db, 'Viajes', viajeId, 'Mensajes');
    const q = query(mensajesRef, orderBy('creado_en', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Evitar que falle en snapshot local antes de que el servidor asigne el timestamp
          creado_en: data.creado_en ? data.creado_en.toDate() : new Date(),
        };
      });
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Error escuchando mensajes:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [viajeId]);

  // 3. Enviar mensaje
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const textoMensaje = inputText.trim();
    setInputText(''); // Limpiar input de inmediato para mejor UX

    try {
      const mensajesRef = collection(db, 'Viajes', viajeId, 'Mensajes');
      await addDoc(mensajesRef, {
        texto: textoMensaje,
        remitente_id: currentUserId,
        creado_en: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
    }
  };

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const renderMessageItem = ({ item }) => {
    const isMe = item.remitente_id === currentUserId;

    return (
      <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.otherMessageRow]}>
        {!isMe && (
          companeroData?.foto_perfil ? (
            <Image source={{ uri: companeroData.foto_perfil }} style={styles.chatAvatar} />
          ) : (
            <View style={styles.chatAvatarFallback}>
              <Text style={styles.avatarLetter}>{(companeroData?.nombre?.charAt(0) || '?').toUpperCase()}</Text>
            </View>
          )
        )}
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
            {item.texto}
          </Text>
          <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.otherMessageTime]}>
            {formatTime(item.creado_en)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  const esPasajero = viaje?.pasajero_id === currentUserId;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Platform.OS === 'android' ? 30 : 0 }]}>
      {/* HEADER DEL CHAT */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        
        {companeroData?.foto_perfil ? (
          <Image source={{ uri: companeroData.foto_perfil }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarFallback}>
            <Text style={styles.headerAvatarText}>{(companeroData?.nombre?.charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {companeroData ? `${companeroData.nombre} ${companeroData.apellido || ''}` : 'Chat de viaje'}
          </Text>
          <Text style={styles.headerStatus}>
            {esPasajero ? 'Tu Conductor' : 'Tu Pasajero'}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.callButton} 
          onPress={() => navigation.navigate('ViajeEnCurso', { viajeId })}
        >
          <Ionicons name="information-circle-outline" size={24} color="#556B63" />
        </TouchableOpacity>
      </View>

      {/* CUERPO DEL CHAT */}
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="chatbubble-ellipses-outline" size={40} color="#1db954" />
              </View>
              <Text style={styles.emptyTitle}>¡Escribe un mensaje!</Text>
              <Text style={styles.emptySubtitle}>Coordinen detalles sobre el punto de encuentro o el viaje.</Text>
            </View>
          }
        />

        {/* INPUT DE ENVÍO */}
        <View style={[styles.inputContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#999"
              multiline
              maxLength={400}
            />
            <TouchableOpacity 
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
              onPress={handleSendMessage}
              disabled={!inputText.trim()}
            >
              <Feather name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  backButton: { paddingRight: 12 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB' },
  headerAvatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { fontSize: 16, fontWeight: 'bold', color: '#1db954' },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  headerStatus: { fontSize: 12, color: '#777', marginTop: 1 },
  callButton: { padding: 4 },

  keyboardContainer: { flex: 1 },
  messagesList: { paddingHorizontal: 16, paddingVertical: 16 },
  
  messageRow: { flexDirection: 'row', marginVertical: 4, maxWidth: '80%', alignItems: 'flex-end' },
  myMessageRow: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  otherMessageRow: { alignSelf: 'flex-start' },
  
  chatAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8, backgroundColor: '#E5E7EB' },
  chatAvatarFallback: { width: 28, height: 28, borderRadius: 14, marginRight: 8, backgroundColor: '#EAF6EE', justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontSize: 12, fontWeight: 'bold', color: '#1db954' },

  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  myBubble: { backgroundColor: '#1db954', borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#ECECEC' },
  
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#fff' },
  otherMessageText: { color: '#222' },
  
  messageTime: { fontSize: 9, alignSelf: 'flex-end', marginTop: 4, fontWeight: '500' },
  myMessageTime: { color: 'rgba(255, 255, 255, 0.7)' },
  otherMessageTime: { color: '#999' },

  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#F0F0F0',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    maxHeight: 100,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 6,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1db954',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#C8E6C9',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    transform: [{ scaleY: -1 }] // Dado que la lista está invertida, invertimos este contenedor para que se muestre arriba correctamente
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EAF6EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#777',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
});
