import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '../screens/login';
import RegisterScreen from '../screens/register';
import HomePasajero from '../screens/HomePasajero';
import HomeConductor from '../screens/HomeConductor';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="HomePasajero" component={HomePasajero} />
      <Stack.Screen name="HomeConductor" component={HomeConductor} />
    </Stack.Navigator>
  );
}