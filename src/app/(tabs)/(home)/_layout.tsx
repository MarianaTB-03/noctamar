import { Stack } from 'expo-router';
import { COLORS } from '../../../constants/brand';

// Pantalla inicial de esta pila. Las rutas compartidas (comments, user, post, connections)
// viven en la carpeta (home,explore,activity,profile) y también aparecen aquí,
// así que se fija explícitamente cuál abre primero.
export const unstable_settings = { initialRouteName: 'index', anchor: 'index' };

// Pila propia de la pestaña Inicio
export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.black } }} />
  );
}