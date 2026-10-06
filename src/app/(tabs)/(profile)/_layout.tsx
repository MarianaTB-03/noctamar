import { Stack } from 'expo-router';
import { COLORS } from '../../../constants/brand';

// Pantalla inicial de esta pila: "profile" (las rutas compartidas también aparecen aquí)
export const unstable_settings = { initialRouteName: 'profile', anchor: 'profile' };

// Pila propia de la pestaña Perfil: profile -> edit-profile
export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.black } }}>
      <Stack.Screen name="profile" />
      <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}