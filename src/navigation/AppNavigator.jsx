import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Octicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';

// Pantallas del Stack de Autenticación
import LoginScreen from '../screens/login';
import RegisterScreen from '../screens/register';

// Pantallas principales del Pasajero (Se moverán a las Tabs)
import HomePasajero from '../screens/HomePasajero';
import PerfilPasajero from '../screens/PerfilPasajero';
import PerfilConductor from '../screens/PerfilConductor';
import MisViajes from '../screens/MisViajes';

// Otras pantallas secundarias
import HomeConductor from '../screens/HomeConductor';
import BuscarViaje from '../screens/BuscarViaje';
import ViajeEnCurso from '../screens/ViajeEnCurso';
import RegistrarVehiculo from '../screens/RegistrarVehiculo';
import ChatViaje from '../screens/ChatViaje';
import CalificarViaje from '../screens/CalificarViaje';
import DetalleViaje from '../screens/DetalleViaje';



// Componentes vacíos temporales por si no tienes creadas aún estas vistas
const ChatListPlaceholder = () => <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Chats</Text></View>;

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 1. CREAMOS EL TAB NAVIGATOR NATIVO PARA EL PASAJERO
function PasajeroTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1db954',
        tabBarInactiveTintColor: '#556B63',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#EEEEEE',
          height: insets.bottom > 0 ? 65 + insets.bottom : 65,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        }
      }}
    >
      <Tab.Screen 
        name="HomePasajero" 
        component={HomePasajero} 
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ color }) => <Octicons name="home" size={22} color={color} />
        }}
      />
      <Tab.Screen 
        name="MisViajes" 
        component={MisViajes} 
        options={{
          tabBarLabel: 'Mis viajes',
          tabBarIcon: ({ color }) => <Feather name="git-commit" size={22} color={color} style={{ transform: [{ rotate: '90deg' }] }} />
        }}
      />

      <Tab.Screen 
        name="PerfilPasajero" 
        component={PerfilPasajero} 
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            focused ? (
              <View style={{ width: 48, height: 32, borderRadius: 16, backgroundColor: '#D1EFE0', justifyContent: 'center', alignItems: 'center', marginBottom: 2 }}>
                <Octicons name="person" size={20} color="#000" />
              </View>
            ) : (
              <Octicons name="person" size={20} color={color} />
            )
          )
        }}
      />
    </Tab.Navigator>
  );
}

// 2. NAVIGATOR PRINCIPAL (STACK GLOBAL)
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Flujo de autenticación */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      
      {/* El núcleo de la App del Pasajero ahora es el Tab Navigator */}
      <Stack.Screen name="PasajeroTabs" component={PasajeroTabs} />

      {/* Otras pantallas que no pertenecen a las pestañas directas */}
      <Stack.Screen name="HomePasajero" component={HomePasajero} />
      <Stack.Screen name="PerfilPasajero" component={PerfilPasajero} />
      <Stack.Screen name="MisViajes" component={MisViajes} />
      <Stack.Screen name="ChatList" component={ChatListPlaceholder} />
      <Stack.Screen name="HomeConductor" component={HomeConductor} />
      <Stack.Screen name="BuscarViaje" component={BuscarViaje} />
      <Stack.Screen name="ViajeEnCurso" component={ViajeEnCurso} />
      <Stack.Screen name="ChatViaje" component={ChatViaje} />
      <Stack.Screen name="CalificarViaje" component={CalificarViaje} />
      <Stack.Screen name="PerfilConductor" component={PerfilConductor} />
      <Stack.Screen name="DetalleViaje" component={DetalleViaje} />

      <Stack.Screen name="RegistrarVehiculo" component={RegistrarVehiculo} />
    </Stack.Navigator>
  );
}