import { Stack } from 'expo-router';
import { COLORS } from '../../../constants/brand';

export const unstable_settings = { initialRouteName: 'explore', anchor: 'explore' };

// Pila propia de la pestaña Explorar
export default function ExploreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.black } }} />
  );
}